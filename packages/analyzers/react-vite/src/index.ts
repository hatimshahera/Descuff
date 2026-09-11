import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import {
  createEmptyStructuralAnalysis,
  type ExistingStandard,
  type EvidenceRef,
  type HttpMethod,
  type StructuralAnalysis,
  type StructuralForm,
  type StructuralSymbol
} from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";

const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const ignoredDirectories = new Set([".git", ".descuff", "dist", "node_modules", "coverage"]);
const viteConfigFiles = new Set([
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs"
]);
const reactEntryFiles = new Set(["src/main.tsx", "src/main.jsx", "src/App.tsx", "src/App.jsx"]);
const mutatingMethods: HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

export class ReactViteAnalyzer implements StructuralAnalyzer {
  readonly id = "react-vite";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    const analysis = createEmptyStructuralAnalysis(project.rootDir);
    const files = await findProjectFiles(project.rootDir);
    const relativeFiles = new Set(files.map((filePath) => relative(project.rootDir, filePath)));

    analysis.framework = await detectReactViteFramework(project.rootDir, files, relativeFiles);
    analysis.existingStandards = detectExistingStandards(project.rootDir, files);

    for (const filePath of files.filter(isSourceFile)) {
      const source = await readFile(filePath, "utf8");
      const sourceFile = relative(project.rootDir, filePath);

      const routeEvidence = sourceEvidence(project.rootDir, filePath, "React/Vite route evidence");
      for (const routePath of extractRoutePaths(source)) {
        analysis.routes.push({
          id: `route:react-router:${routePath}`,
          path: routePath,
          routerKind: "react-router",
          sourceFile,
          visibility: "public",
          evidence: [routeEvidence]
        });
      }

      const linkEvidence = sourceEvidence(
        project.rootDir,
        filePath,
        "React/Vite navigation evidence"
      );
      for (const routePath of extractNavigationPaths(source)) {
        analysis.routes.push({
          id: `route:react-link:${routePath}`,
          path: routePath,
          routerKind: "react-router",
          sourceFile,
          visibility: "public",
          evidence: [linkEvidence]
        });
      }

      const symbols = extractSymbols(project.rootDir, filePath, source);
      analysis.symbols.push(...symbols);
      analysis.evidence.items.push(...symbols.flatMap((symbol) => symbol.evidence));

      const sourceStandards = detectSourceStandards(project.rootDir, filePath, source);
      analysis.existingStandards.push(...sourceStandards);
      analysis.evidence.items.push(...sourceStandards.flatMap((standard) => standard.evidence));

      const forms = extractForms(project.rootDir, filePath, source);
      analysis.forms.push(...forms);
      analysis.evidence.items.push(...forms.flatMap((form) => form.evidence));

      const apiReferences = extractFetchReferences(project.rootDir, filePath, source);
      analysis.apiOperations.push(...apiReferences);
      analysis.evidence.items.push(...apiReferences.flatMap((operation) => operation.evidence));
    }

    if (!analysis.framework.detected && hasReactButNoRunnableVite(files, relativeFiles)) {
      analysis.warnings.push({
        code: "REACT_VITE_RUNNABLE_APP_NOT_PROVEN",
        message:
          "React and Vite signals were found, but Descuff could not prove this root is a runnable React/Vite app.",
        evidence: []
      });
    }

    analysis.evidence.items.push(...analysis.framework.evidence);
    analysis.evidence.items.push(
      ...analysis.existingStandards.flatMap((standard) => standard.evidence)
    );
    if (analysis.framework.detected && !analysis.routes.some((route) => route.path === "/")) {
      const rootEvidence = firstFrameworkEvidence(analysis);
      analysis.routes.push({
        id: "route:react-vite:/",
        path: "/",
        routerKind: "unknown",
        sourceFile: rootEvidence.location,
        visibility: "public",
        evidence: [rootEvidence]
      });
    }
    analysis.routes = dedupeBy(analysis.routes, (route) => route.path);
    analysis.apiOperations = dedupeBy(
      analysis.apiOperations,
      (operation) => `${operation.method}:${operation.path}`
    );
    analysis.evidence.items = dedupeEvidence(analysis.evidence.items);

    return analysis;
  }
}

async function detectReactViteFramework(
  rootDir: string,
  files: string[],
  relativeFiles: Set<string>
): Promise<StructuralAnalysis["framework"]> {
  const packageJsonPath = files.find((filePath) => basename(filePath) === "package.json");
  if (packageJsonPath === undefined) {
    return { kind: "unknown", detected: false, evidence: [] };
  }

  const packageJson = await readPackageJson(packageJsonPath);
  if (!hasReactViteDependencies(packageJson) || !hasRunnableReactViteFiles(relativeFiles)) {
    return { kind: "unknown", detected: false, evidence: [] };
  }

  const evidence = [
    sourceEvidence(rootDir, packageJsonPath, "React/Vite dependencies detected in package.json")
  ];

  for (const filePath of files) {
    const location = relative(rootDir, filePath);
    if (
      viteConfigFiles.has(location) ||
      location === "index.html" ||
      reactEntryFiles.has(location)
    ) {
      evidence.push(sourceEvidence(rootDir, filePath, "React/Vite app structure detected"));
    }
  }

  return {
    kind: "react-vite",
    detected: true,
    evidence
  };
}

function hasReactButNoRunnableVite(files: string[], relativeFiles: Set<string>): boolean {
  const packageJsonPath = files.find((filePath) => basename(filePath) === "package.json");
  if (packageJsonPath === undefined) {
    return false;
  }
  return !hasRunnableReactViteFiles(relativeFiles);
}

function hasRunnableReactViteFiles(relativeFiles: Set<string>): boolean {
  return (
    (hasAny(relativeFiles, viteConfigFiles) || relativeFiles.has("index.html")) &&
    hasAny(relativeFiles, reactEntryFiles)
  );
}

function hasAny(values: Set<string>, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (values.has(candidate)) {
      return true;
    }
  }
  return false;
}

function hasReactViteDependencies(packageJson: unknown): boolean {
  return (
    hasDependency(packageJson, "vite") &&
    (hasDependency(packageJson, "react") ||
      hasDependency(packageJson, "react-dom") ||
      hasDependency(packageJson, "@vitejs/plugin-react") ||
      hasDependency(packageJson, "@vitejs/plugin-react-swc"))
  );
}

function hasDependency(packageJson: unknown, dependencyName: string): boolean {
  if (!isRecord(packageJson)) {
    return false;
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies"
  ]) {
    const dependencies = packageJson[field];
    if (isRecord(dependencies) && typeof dependencies[dependencyName] === "string") {
      return true;
    }
  }
  return false;
}

async function readPackageJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

function extractRoutePaths(source: string): string[] {
  return unique([
    ...matches(source, /<Route\b[^>]*\bpath=["']([^"']+)["']/g),
    ...matches(source, /\bpath\s*:\s*["']([^"']+)["']/g),
    ...matches(source, /\bcreateBrowserRouter\s*\(\s*\[[\s\S]*?\bpath\s*:\s*["']([^"']+)["']/g)
  ]).filter(isPublicRoutePath);
}

function extractNavigationPaths(source: string): string[] {
  return unique([
    ...matches(source, /<(?:Link|NavLink)\b[^>]*\bto=["']([^"']+)["']/g),
    ...matches(source, /\bhref=["']([^"']+)["']/g)
  ]).filter(isPublicRoutePath);
}

function extractFetchReferences(
  rootDir: string,
  filePath: string,
  source: string
): StructuralAnalysis["apiOperations"] {
  const operations: StructuralAnalysis["apiOperations"] = [];
  const evidence = sourceEvidence(rootDir, filePath, "React/Vite fetch API reference detected");
  let index = 0;

  for (const match of source.matchAll(/\bfetch\s*\(\s*["']([^"']+)["']([\s\S]*?)\)/g)) {
    const path = match[1];
    if (path === undefined || !isSameOriginApiPath(path)) {
      continue;
    }

    const options = match[2] ?? "";
    const method = inferFetchMethod(options);
    operations.push({
      id: `api:${method}:${path}:${index}`,
      path,
      method,
      sourceFile: evidence.location,
      evidence: [evidence]
    });
    index += 1;
  }

  return operations;
}

function inferFetchMethod(options: string): HttpMethod {
  const match = options.match(/\bmethod\s*:\s*["']([A-Za-z]+)["']/);
  const method = match?.[1]?.toUpperCase();
  if (method === undefined) {
    return "GET";
  }
  if (["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method)) {
    return method as HttpMethod;
  }
  return "UNKNOWN";
}

function isSameOriginApiPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

function isPublicRoutePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

function matches(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].map((match) => match[1] ?? "");
}

function detectExistingStandards(rootDir: string, files: string[]): ExistingStandard[] {
  return files.flatMap((filePath) => {
    const location = relative(rootDir, filePath);
    const standard = standardKindForPath(location);
    if (standard === undefined) {
      return [];
    }

    const evidence = sourceEvidence(rootDir, filePath, `${standard} artifact detected`);
    return [
      {
        id: `standard:${standard}:${location}`,
        kind: standard,
        sourceFile: location,
        evidence: [evidence]
      }
    ];
  });
}

function standardKindForPath(path: string): ExistingStandard["kind"] | undefined {
  if (path === "public/llms.txt" || path === "llms.txt") {
    return "llms-txt";
  }

  if (
    path.endsWith("openapi.json") ||
    path.endsWith("openapi.yaml") ||
    path.endsWith("openapi.yml")
  ) {
    return "openapi";
  }

  if (path.endsWith(".well-known/api-catalog")) {
    return "api-catalog";
  }

  if (path.includes("webmcp")) {
    return "webmcp";
  }

  return undefined;
}

function detectSourceStandards(
  rootDir: string,
  filePath: string,
  source: string
): ExistingStandard[] {
  if (!source.includes("application/ld+json")) {
    return [];
  }

  const location = relative(rootDir, filePath);
  const evidence = sourceEvidence(rootDir, filePath, "schema-org JSON-LD usage detected");
  return [
    {
      id: `standard:schema-org:${location}`,
      kind: "schema-org",
      sourceFile: location,
      evidence: [evidence]
    }
  ];
}

function extractSymbols(rootDir: string, filePath: string, source: string): StructuralSymbol[] {
  const symbols: StructuralSymbol[] = [];
  const evidence = sourceEvidence(rootDir, filePath, "React/Vite source symbol detected");

  for (const match of source.matchAll(/import\s+[^;]+?\s+from\s+["'][^"']+["']/g)) {
    symbols.push({
      id: `symbol:${evidence.location}:import:${symbols.length}`,
      name: match[0],
      kind: "import",
      sourceFile: evidence.location,
      evidence: [evidence]
    });
  }

  for (const match of source.matchAll(
    /(?:export\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)/g
  )) {
    symbols.push(symbol(evidence.location, match[1] ?? "Anonymous", "react-component", evidence));
  }

  for (const match of source.matchAll(/class\s+([A-Za-z0-9_]+)/g)) {
    symbols.push(symbol(evidence.location, match[1] ?? "AnonymousClass", "class", evidence));
  }

  return symbols;
}

function extractForms(rootDir: string, filePath: string, source: string): StructuralForm[] {
  const forms: StructuralForm[] = [];

  for (const match of source.matchAll(/<form\b([^>]*)>/g)) {
    const attributes = match[1] ?? "";
    const evidence = sourceEvidence(rootDir, filePath, "React/Vite form element detected");
    const action = getAttributeValue(attributes, "action");
    const method = getAttributeValue(attributes, "method");
    const form: StructuralForm = {
      id: `form:${evidence.location}:${forms.length}`,
      sourceFile: evidence.location,
      evidence: [evidence]
    };

    if (action !== undefined) {
      form.action = action;
    }
    if (method !== undefined) {
      form.method = method;
      if (mutatingMethods.includes(method.toUpperCase() as HttpMethod)) {
        forms.push(form);
        continue;
      }
    }
    forms.push(form);
  }

  return forms;
}

function getAttributeValue(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`${name}=["']([^"']+)["']`));
  return match?.[1];
}

function symbol(
  sourceFile: string,
  name: string,
  kind: StructuralSymbol["kind"],
  evidence: EvidenceRef
): StructuralSymbol {
  return {
    id: `symbol:${sourceFile}:${kind}:${name}`,
    name,
    kind,
    sourceFile,
    evidence: [evidence]
  };
}

function firstFrameworkEvidence(analysis: StructuralAnalysis): EvidenceRef {
  return (
    analysis.framework.evidence[0] ?? {
      id: "source:package.json",
      kind: "source",
      location: "package.json",
      confidence: "medium",
      summary: "React/Vite app root inferred"
    }
  );
}

function sourceEvidence(rootDir: string, filePath: string, summary: string): EvidenceRef {
  const location = relative(rootDir, filePath);

  return {
    id: `source:${location}`,
    kind: "source",
    location,
    confidence: "high",
    summary
  };
}

async function findProjectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await visit(entryPath);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  try {
    await visit(rootDir);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return files.sort();
}

function isSourceFile(path: string): boolean {
  return sourceExtensions.has(extname(path));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function dedupeEvidence(items: StructuralAnalysis["evidence"]["items"]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}:${item.summary}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
