import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import {
  createEmptyStructuralAnalysis,
  type ExistingStandard,
  type HttpMethod,
  type RouteVisibility,
  type StructuralAnalysis
} from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";
import { sourceEvidence } from "./evidence.js";
import { findProjectFiles } from "./file-walk.js";
import {
  appApiPath,
  appPagePath,
  getRouteKind,
  isSourceFile,
  pagesApiPath,
  pagesRoutePath
} from "./next-route-paths.js";
import { extractForms, extractHttpMethods, extractSymbols } from "./source-extraction.js";

export class NativeNextAnalyzer implements StructuralAnalyzer {
  readonly id = "native-next";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    const analysis = createEmptyStructuralAnalysis(project.rootDir);
    const files = await findProjectFiles(project.rootDir);

    analysis.framework = await detectNextFramework(project.rootDir, files);
    analysis.existingStandards = detectExistingStandards(project.rootDir, files);

    for (const filePath of files.filter(isSourceFile)) {
      const source = await readFile(filePath, "utf8");
      const routeKind = getRouteKind(project.rootDir, filePath);
      const sourceFile = relative(project.rootDir, filePath);

      const pagePath =
        appPagePath(project.rootDir, filePath) ?? pagesRoutePath(project.rootDir, filePath);
      if (pagePath !== undefined) {
        const evidence = sourceEvidence(project.rootDir, filePath, "Next.js page route discovered");
        analysis.routes.push({
          id: `route:${routeKind}:${pagePath}`,
          path: pagePath,
          routerKind: routeKind,
          sourceFile,
          visibility: inferRouteVisibility(source),
          evidence: [evidence]
        });
        analysis.evidence.items.push(evidence);
      }

      const apiPath =
        appApiPath(project.rootDir, filePath) ?? pagesApiPath(project.rootDir, filePath);
      if (apiPath !== undefined) {
        const methods = getApiMethods(filePath, source);
        for (const method of methods) {
          const evidence = sourceEvidence(
            project.rootDir,
            filePath,
            `${method} API operation discovered`
          );
          analysis.apiOperations.push({
            id: `api:${method}:${apiPath}`,
            path: apiPath,
            method,
            sourceFile,
            evidence: [evidence]
          });
          analysis.evidence.items.push(evidence);
        }
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

      const authBoundaryKind = getAuthenticationBoundaryKind(filePath);
      if (authBoundaryKind !== undefined) {
        const evidence = sourceEvidence(
          project.rootDir,
          filePath,
          authBoundaryKind === "proxy" ? "Next.js proxy detected" : "Next.js middleware detected"
        );
        analysis.authenticationBoundaries.push({
          id: `auth:${sourceFile}`,
          kind: authBoundaryKind,
          sourceFile,
          evidence: [evidence]
        });
        analysis.evidence.items.push(evidence);
      }
    }

    analysis.evidence.items.push(...analysis.framework.evidence);
    analysis.evidence.items.push(
      ...analysis.existingStandards.flatMap((standard) => standard.evidence)
    );
    analysis.evidence.items = dedupeEvidence(analysis.evidence.items);

    return analysis;
  }
}

async function detectNextFramework(
  rootDir: string,
  files: string[]
): Promise<StructuralAnalysis["framework"]> {
  const packageJson = files.find((filePath) => relative(rootDir, filePath) === "package.json");
  if (packageJson === undefined) {
    return { kind: "unknown", detected: false, evidence: [] };
  }

  const source = await readFile(packageJson, "utf8");
  const detected = /"next"\s*:/.test(source);
  const evidence = detected
    ? [sourceEvidence(rootDir, packageJson, "Next.js dependency detected in package.json")]
    : [];

  return {
    kind: detected ? "nextjs" : "unknown",
    detected,
    evidence
  };
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

function getApiMethods(filePath: string, source: string): HttpMethod[] {
  const methods = extractHttpMethods(source);
  if (methods.length > 0) {
    return methods;
  }

  return basename(filePath).startsWith("route.") ? [] : ["UNKNOWN"];
}

function getAuthenticationBoundaryKind(
  filePath: string
): StructuralAnalysis["authenticationBoundaries"][number]["kind"] | undefined {
  const fileName = basename(filePath);
  if (fileName.startsWith("middleware.")) {
    return "middleware";
  }
  if (fileName.startsWith("proxy.")) {
    return "proxy";
  }
  return undefined;
}

function inferRouteVisibility(source: string): RouteVisibility {
  if (
    /from\s+["']@clerk\/nextjs\/server["']/.test(source) &&
    /\b(getAuth|auth|currentUser)\s*\(/.test(source)
  ) {
    return "authenticated";
  }

  if (/\b(getServerSession|getToken|withPageAuthRequired)\s*\(/.test(source)) {
    return "authenticated";
  }

  return "public";
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
