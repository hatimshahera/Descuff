import { constants } from "node:fs";
import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const doctorSchemaVersion = "0.1.0";

export type DiagnosticSeverity = "ok" | "info" | "warning" | "error" | "unsupported";

export interface DiagnosticIssue {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  evidence?: string[];
  nextSteps: string[];
}

export interface DoctorResult {
  schemaVersion: typeof doctorSchemaVersion;
  checkedAt: string;
  projectRoot: string;
  supported: boolean;
  summary: string;
  detected: {
    packageJson: boolean;
    framework: "nextjs" | "unknown";
    packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
    nextIndicators: string[];
    candidateAppRoots: string[];
    descuffArtifacts: "absent" | "present" | "malformed";
    graphify: "absent" | "present" | "invalid";
    git: "available" | "unavailable";
    writableArtifacts: boolean;
    nodeVersion: string;
  };
  issues: DiagnosticIssue[];
}

interface DoctorOptions {
  now?: Date;
  nodeVersion?: string;
}

export async function runDoctor(
  projectRoot: string,
  options: DoctorOptions = {}
): Promise<DoctorResult> {
  const issues: DiagnosticIssue[] = [];
  const nextIndicators = await detectNextIndicators(projectRoot);
  const packageJson = await readPackageJson(projectRoot);
  const packageManager = await detectPackageManager(projectRoot);
  const candidateAppRoots = await detectCandidateAppRoots(projectRoot);
  const writableArtifacts = await canWriteArtifactDirectory(projectRoot);
  const descuffArtifacts = await detectDescuffArtifacts(projectRoot);
  const graphify = await detectGraphifyState(projectRoot);
  const git = (await pathExists(join(projectRoot, ".git"))) ? "available" : "unavailable";
  const hasNextDependency = hasDependency(packageJson.value, "next");
  const framework = hasNextDependency || nextIndicators.length > 0 ? "nextjs" : "unknown";
  const supported = packageJson.exists && framework === "nextjs";

  if (!packageJson.exists) {
    issues.push({
      code: "PACKAGE_JSON_MISSING",
      severity: "unsupported",
      message: "No package.json was found at the project root.",
      nextSteps:
        candidateAppRoots.length > 0
          ? candidateAppRoots.map((root) => `Run Descuff from ${root}.`)
          : ["Run Descuff from the root of a local Next.js app."]
    });
  } else if (!hasNextDependency && nextIndicators.length === 0) {
    issues.push({
      code: "SUPPORTED_PROJECT_NOT_FOUND",
      severity: "unsupported",
      message: "package.json exists, but no Next.js dependency or Next.js app structure was found.",
      evidence: ["package.json"],
      nextSteps:
        candidateAppRoots.length > 0
          ? candidateAppRoots.map((root) => `Run Descuff from ${root}.`)
          : ["Descuff currently supports local Next.js apps. Run it from a supported app root."]
    });
  }

  if (candidateAppRoots.length > 0 && !supported) {
    issues.push({
      code: "CANDIDATE_APP_ROOTS_FOUND",
      severity: "info",
      message: "Possible nested Next.js app roots were found.",
      evidence: candidateAppRoots,
      nextSteps: candidateAppRoots.map((root) => `Try: npx descuff doctor ${root}`)
    });
  }

  if (!writableArtifacts) {
    issues.push({
      code: "DESCUFF_ARTIFACTS_NOT_WRITABLE",
      severity: "error",
      message: ".descuff artifacts cannot be written in this project root.",
      nextSteps: ["Check directory permissions before running descuff start."]
    });
  }

  if (descuffArtifacts === "malformed") {
    issues.push({
      code: "DESCUFF_ARTIFACTS_MALFORMED",
      severity: "warning",
      message:
        "Existing .descuff artifacts are present but one or more known JSON artifacts is malformed.",
      evidence: [".descuff"],
      nextSteps: ["Run npx descuff start . to refresh local artifacts."]
    });
  }

  if (graphify === "invalid") {
    issues.push({
      code: "GRAPHIFY_OUTPUT_INVALID",
      severity: "warning",
      message: "graphify-out/graph.json exists but is not valid JSON.",
      evidence: ["graphify-out/graph.json"],
      nextSteps: ["Refresh Graphify output or continue with native Descuff analysis."]
    });
  } else if (graphify === "absent") {
    issues.push({
      code: "GRAPHIFY_OUTPUT_ABSENT",
      severity: "info",
      message: "Optional Graphify output was not found.",
      nextSteps: ["No action is required. Native Descuff analysis still works."]
    });
  }

  if (git === "unavailable") {
    issues.push({
      code: "GIT_METADATA_UNAVAILABLE",
      severity: "info",
      message: "No .git directory was found at the project root.",
      nextSteps: ["descuff start still works. descuff check may fall back to source fingerprints."]
    });
  }

  if (supported) {
    issues.unshift({
      code: "NEXTJS_PROJECT_SUPPORTED",
      severity: "ok",
      message: "A local Next.js project was detected.",
      evidence: nextIndicators.length > 0 ? nextIndicators : ["package.json"],
      nextSteps: ["Run npx descuff start . to create a baseline and implementation plan."]
    });
  }

  return {
    schemaVersion: doctorSchemaVersion,
    checkedAt: (options.now ?? new Date(0)).toISOString(),
    projectRoot,
    supported,
    summary: supported
      ? "Descuff can analyze this local Next.js project."
      : "Descuff cannot confidently analyze this project from the current root.",
    detected: {
      packageJson: packageJson.exists,
      framework,
      packageManager,
      nextIndicators,
      candidateAppRoots,
      descuffArtifacts,
      graphify,
      git,
      writableArtifacts,
      nodeVersion: options.nodeVersion ?? process.version
    },
    issues
  };
}

export function renderDoctorMarkdown(result: DoctorResult): string {
  return [
    "# Descuff Doctor",
    "",
    `Status: ${result.supported ? "supported" : "unsupported"}`,
    `Project root: ${result.projectRoot}`,
    `Summary: ${result.summary}`,
    "",
    "## Detected",
    "",
    `- Framework: ${result.detected.framework}`,
    `- Package manager: ${result.detected.packageManager}`,
    `- package.json: ${result.detected.packageJson ? "present" : "missing"}`,
    `- .descuff writable: ${result.detected.writableArtifacts ? "yes" : "no"}`,
    `- Existing .descuff artifacts: ${result.detected.descuffArtifacts}`,
    `- Graphify: ${result.detected.graphify}`,
    `- Git: ${result.detected.git}`,
    `- Node: ${result.detected.nodeVersion}`,
    "",
    "## Issues",
    "",
    ...result.issues.flatMap((issue) => [
      `### ${issue.code}`,
      "",
      `Severity: ${issue.severity}`,
      "",
      issue.message,
      "",
      ...(issue.evidence === undefined || issue.evidence.length === 0
        ? []
        : ["Evidence:", "", ...issue.evidence.map((item) => `- ${item}`), ""]),
      "Next steps:",
      "",
      ...issue.nextSteps.map((step) => `- ${step}`),
      ""
    ])
  ].join("\n");
}

export function renderDoctorSummary(result: DoctorResult, artifactDir: string): string {
  const blockers = result.issues.filter((issue) =>
    ["error", "unsupported"].includes(issue.severity)
  );

  return [
    `descuff doctor ${result.supported ? "supported" : "unsupported"}`,
    result.summary,
    "",
    "Detected:",
    `  Framework: ${result.detected.framework}`,
    `  Package manager: ${result.detected.packageManager}`,
    `  Candidate app roots: ${result.detected.candidateAppRoots.join(", ") || "none"}`,
    `  Graphify: ${result.detected.graphify}`,
    `  Existing .descuff artifacts: ${result.detected.descuffArtifacts}`,
    "",
    `Issues: ${result.issues.length}`,
    `Blockers: ${blockers.length}`,
    "",
    "Artifacts:",
    `  ${join(artifactDir, "doctor.json")}`,
    `  ${join(artifactDir, "doctor.md")}`,
    "",
    "Next:",
    ...nextStepsForSummary(result).map((step) => `  ${step}`),
    ""
  ].join("\n");
}

function nextStepsForSummary(result: DoctorResult): string[] {
  if (result.supported) {
    return ["Run: npx descuff start ."];
  }

  const candidate = result.detected.candidateAppRoots[0];
  if (candidate !== undefined) {
    return [`Try: npx descuff doctor ${candidate}`];
  }

  return ["Run Descuff from the root of a local Next.js app."];
}

async function detectNextIndicators(projectRoot: string): Promise<string[]> {
  const candidates = [
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "app",
    "pages",
    "src/app",
    "src/pages"
  ];
  const found: string[] = [];

  for (const candidate of candidates) {
    if (await pathExists(join(projectRoot, candidate))) {
      found.push(candidate);
    }
  }

  return found;
}

async function detectPackageManager(
  projectRoot: string
): Promise<DoctorResult["detected"]["packageManager"]> {
  if (await pathExists(join(projectRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (await pathExists(join(projectRoot, "package-lock.json"))) return "npm";
  if (await pathExists(join(projectRoot, "yarn.lock"))) return "yarn";
  if (
    (await pathExists(join(projectRoot, "bun.lockb"))) ||
    (await pathExists(join(projectRoot, "bun.lock")))
  ) {
    return "bun";
  }
  return "unknown";
}

async function detectCandidateAppRoots(projectRoot: string): Promise<string[]> {
  const results: string[] = [];
  await walk(projectRoot, projectRoot, results, 0);
  return results.sort();
}

async function walk(
  root: string,
  current: string,
  results: string[],
  depth: number
): Promise<void> {
  if (depth > 3) return;
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  const packageJsonPath = join(current, "package.json");
  if (current !== root && (await pathExists(packageJsonPath))) {
    const packageJson = await readPackageJson(current);
    const indicators = await detectNextIndicators(current);
    if (hasDependency(packageJson.value, "next") || indicators.length > 0) {
      results.push(relative(root, current) || ".");
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || shouldSkipDirectory(entry.name)) continue;
    await walk(root, join(current, entry.name), results, depth + 1);
  }
}

function shouldSkipDirectory(name: string): boolean {
  return [".git", ".descuff", "node_modules", "dist", ".next", "coverage"].includes(name);
}

async function canWriteArtifactDirectory(projectRoot: string): Promise<boolean> {
  try {
    const dir = join(projectRoot, ".descuff");
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectDescuffArtifacts(
  projectRoot: string
): Promise<DoctorResult["detected"]["descuffArtifacts"]> {
  const dir = join(projectRoot, ".descuff");
  if (!(await pathExists(dir))) return "absent";

  const knownJson = ["baseline.json", "model.json", "validation.json", "drift-baseline.json"];
  for (const name of knownJson) {
    const path = join(dir, name);
    if (!(await pathExists(path))) continue;
    try {
      JSON.parse(await readFile(path, "utf8"));
    } catch {
      return "malformed";
    }
  }

  return "present";
}

async function detectGraphifyState(
  projectRoot: string
): Promise<DoctorResult["detected"]["graphify"]> {
  const graphPath = join(projectRoot, "graphify-out", "graph.json");
  if (!(await pathExists(graphPath))) return "absent";
  try {
    JSON.parse(await readFile(graphPath, "utf8"));
    return "present";
  } catch {
    return "invalid";
  }
}

async function readPackageJson(projectRoot: string): Promise<{ exists: boolean; value?: unknown }> {
  try {
    const path = join(projectRoot, "package.json");
    await stat(path);
    return { exists: true, value: JSON.parse(await readFile(path, "utf8")) };
  } catch {
    return { exists: false };
  }
}

function hasDependency(packageJson: unknown, dependencyName: string): boolean {
  if (!isRecord(packageJson)) return false;
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
