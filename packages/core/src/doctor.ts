import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
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
    packageJson: "present" | "missing" | "malformed";
    framework: "nextjs" | "unknown";
    packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
    nextIndicators: string[];
    candidateAppRoots: string[];
    descuffArtifacts: "absent" | "present" | "malformed" | "stale";
    graphify: "absent" | "present" | "invalid";
    git: "available" | "unavailable";
    writableArtifacts: boolean;
    nodeVersion: string;
    runtimePrerequisites: {
      nodeSupported: boolean;
      browserRuntime: "playwright-present" | "playwright-missing";
      browserLaunchChecked: false;
    };
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
  const descuffArtifacts = await detectDescuffArtifacts(projectRoot);
  const writableArtifacts = await canWriteArtifactDirectory(projectRoot);
  const graphify = await detectGraphifyState(projectRoot);
  const git = (await pathExists(join(projectRoot, ".git"))) ? "available" : "unavailable";
  const hasNextDependency = hasDependency(packageJson.value, "next");
  const nodeVersion = options.nodeVersion ?? process.version;
  const runtimePrerequisites = {
    nodeSupported: isSupportedNodeVersion(nodeVersion),
    browserRuntime:
      hasDependency(packageJson.value, "@playwright/test") ||
      hasDependency(packageJson.value, "playwright")
        ? ("playwright-present" as const)
        : ("playwright-missing" as const),
    browserLaunchChecked: false as const
  };
  const framework = hasNextDependency || nextIndicators.length > 0 ? "nextjs" : "unknown";
  const supported = packageJson.status === "present" && framework === "nextjs";

  if (!runtimePrerequisites.nodeSupported) {
    issues.push({
      code: "NODE_VERSION_UNSUPPORTED",
      severity: "error",
      message: "The current Node.js version is below Descuff's supported runtime.",
      evidence: [nodeVersion],
      nextSteps: ["Use Node.js 20.11.0 or newer before running Descuff."]
    });
  }

  if (packageJson.status === "missing") {
    issues.push({
      code: "PACKAGE_JSON_MISSING",
      severity: "unsupported",
      message: "No package.json was found at the project root.",
      nextSteps:
        candidateAppRoots.length > 0
          ? candidateAppRoots.map((root) => `Run Descuff from ${root}.`)
          : ["Run Descuff from the root of a local Next.js app."]
    });
  } else if (packageJson.status === "malformed") {
    issues.push({
      code: "PACKAGE_JSON_MALFORMED",
      severity: "unsupported",
      message: "package.json exists, but it is not valid JSON.",
      evidence: ["package.json"],
      nextSteps: ["Fix package.json syntax before running Descuff."]
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
  } else if (descuffArtifacts === "stale") {
    issues.push({
      code: "DESCUFF_ARTIFACTS_STALE",
      severity: "warning",
      message: "Existing .descuff source fingerprints no longer match the current source files.",
      evidence: [".descuff/source-fingerprints.json"],
      nextSteps: ["Run npx descuff start . to refresh the baseline before implementing a plan."]
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

  if (runtimePrerequisites.browserRuntime === "playwright-missing") {
    issues.push({
      code: "BROWSER_RUNTIME_NOT_CONFIGURED",
      severity: "info",
      message: "Project-level Playwright dependencies were not detected.",
      nextSteps: [
        "No action is required for static Descuff analysis.",
        "Browser runtime and WebMCP execution validation require Playwright-backed runtime configuration."
      ]
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
    checkedAt: (options.now ?? new Date()).toISOString(),
    projectRoot,
    supported,
    summary: supported
      ? "Descuff can analyze this local Next.js project."
      : "Descuff cannot confidently analyze this project from the current root.",
    detected: {
      packageJson: packageJson.status,
      framework,
      packageManager,
      nextIndicators,
      candidateAppRoots,
      descuffArtifacts,
      graphify,
      git,
      writableArtifacts,
      nodeVersion,
      runtimePrerequisites
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
    `- package.json: ${result.detected.packageJson}`,
    `- .descuff writable: ${result.detected.writableArtifacts ? "yes" : "no"}`,
    `- Existing .descuff artifacts: ${result.detected.descuffArtifacts}`,
    `- Graphify: ${result.detected.graphify}`,
    `- Git: ${result.detected.git}`,
    `- Node: ${result.detected.nodeVersion}`,
    `- Node supported: ${result.detected.runtimePrerequisites.nodeSupported ? "yes" : "no"}`,
    `- Browser runtime: ${result.detected.runtimePrerequisites.browserRuntime}`,
    `- Browser launch checked: ${result.detected.runtimePrerequisites.browserLaunchChecked ? "yes" : "no"}`,
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
    `  Browser runtime: ${result.detected.runtimePrerequisites.browserRuntime}`,
    `  Browser launch checked: ${result.detected.runtimePrerequisites.browserLaunchChecked ? "yes" : "no"}`,
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
    if (await pathExists(dir)) {
      await access(dir, constants.W_OK);
      return true;
    }

    await access(projectRoot, constants.W_OK);
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

  if (await hasStaleSourceFingerprints(projectRoot)) {
    return "stale";
  }

  return "present";
}

async function hasStaleSourceFingerprints(projectRoot: string): Promise<boolean> {
  const path = join(projectRoot, ".descuff", "source-fingerprints.json");
  if (!(await pathExists(path))) {
    return false;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return true;
  }
  if (!isRecord(manifest) || !Array.isArray(manifest.files)) {
    return true;
  }

  for (const file of manifest.files) {
    if (!isRecord(file) || typeof file.path !== "string") {
      return true;
    }

    const previousHash = typeof file.sha256 === "string" ? file.sha256 : null;
    const currentHash = await sha256File(join(projectRoot, file.path));
    if (currentHash !== previousHash) {
      return true;
    }
  }

  return false;
}

async function sha256File(path: string): Promise<string | null> {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  } catch {
    return null;
  }
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

async function readPackageJson(
  projectRoot: string
): Promise<{ status: "present" | "missing" | "malformed"; value?: unknown }> {
  const path = join(projectRoot, "package.json");
  try {
    await stat(path);
  } catch {
    return { status: "missing" };
  }

  try {
    return { status: "present", value: JSON.parse(await readFile(path, "utf8")) };
  } catch {
    return { status: "malformed" };
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

function isSupportedNodeVersion(version: string): boolean {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (match === null) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  return major > 20 || (major === 20 && minor >= 11);
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
