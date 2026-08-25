import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  buildAgentPlan,
  buildGraphifyEnrichmentSummary,
  buildSkillEvidencePacket,
  createSemanticEnrichmentTemplate,
  getSkillHostAdapter,
  renderAgentPlanMarkdown,
  renderCodexSkillFile,
  renderFixCommandInstructions,
  renderGraphifyEnrichmentSummary,
  renderSemanticEnrichmentDiff,
  renderSemanticEnrichmentPrompt,
  renderSkillEvidencePacket,
  renderSkillHostInstructions,
  supportedSkillHostAdapters,
  validateSemanticEnrichment,
  type SemanticEnrichment,
  type SkillEvidencePacket,
  type SkillHostTarget
} from "@descuff/agent-workflow";
import { GraphifyAnalyzer } from "@descuff/analyzer-graphify";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import {
  createProjectContext,
  descuffCommands,
  isDescuffCommand,
  type CommandResult
} from "@descuff/core";
import {
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type EvidenceRef,
  type StructuralAnalysis
} from "@descuff/ir";
import { renderStructuralSummary } from "@descuff/reporter";
import type { GeneratedChange, StandardAdapter, StandardAssessment } from "@descuff/standard-core";
import { ApiCatalogAdapter } from "@descuff/standard-api-catalog";
import { LlmsTxtAdapter } from "@descuff/standard-llms-txt";
import { OpenApiAdapter } from "@descuff/standard-openapi";
import { SchemaOrgAdapter } from "@descuff/standard-schema-org";
import { WebMcpAdapter } from "@descuff/standard-webmcp";
import {
  createValidationReadinessReport,
  mergeValidationSummaries,
  renderValidationRepairGuide,
  renderValidationSummaryDetails,
  runStandardValidation,
  type ValidationReadinessReport,
  type ValidationSummary,
  type SourceFileFingerprint,
  type SourceFingerprintManifest,
  validateCapabilityConfidence,
  validateRuntimeObservations,
  validateSecurityModel,
  validateSourceFingerprints,
  validateStaticGeneratedChanges
} from "@descuff/validator";

const helpText = `Descuff

Usage:
  descuff <command> [project-root]
  descuff install [codex|claude-code|cursor|all] [project-root]
  descuff install --platform [codex|claude-code] [project-root]
  descuff install codex --global

Commands:
  ${descuffCommands.join("\n  ")}
`;

interface ScanArtifacts {
  analysis: StructuralAnalysis;
  graphifyEnrichment: ReturnType<typeof buildGraphifyEnrichmentSummary>;
  model: ApplicationModel;
  assessments: StandardAssessment[];
  generatedChanges: GeneratedChange[];
  sourceFingerprints: SourceFingerprintManifest;
}

interface BaselineSnapshot {
  schemaVersion: string;
  recordedAt: string;
  readiness: ValidationReadinessReport["readiness"];
  validation: ValidationReadinessReport["validation"];
  implementedStandards: string[];
  recommendedStandards: string[];
  routes: string[];
  apis: string[];
  capabilities: string[];
}

interface InstallArgs {
  target: "all" | SkillHostTarget;
  projectRoot: string;
  global: boolean;
  platform: boolean;
}

export async function runCli(argv: string[]): Promise<CommandResult> {
  const command = argv[2];
  const installArgs = command === "install" ? parseInstallArgs(argv.slice(3)) : undefined;
  const projectRoot =
    command === "install"
      ? (installArgs?.projectRoot ?? process.cwd())
      : resolve(argv[3] ?? process.cwd());

  if (command === undefined || command === "--help" || command === "-h") {
    return { exitCode: 0, stdout: helpText, stderr: "" };
  }

  if (!isDescuffCommand(command)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unknown command: ${command}\n\n${helpText}`
    };
  }

  try {
    switch (command) {
      case "scan":
        return ok(await scanCommand(projectRoot));
      case "report":
        return ok(await reportCommand(projectRoot));
      case "plan":
        return ok(await planCommand(projectRoot));
      case "start":
        return ok(await startCommand(projectRoot));
      case "finish":
        return await finishCommand(projectRoot);
      case "fix":
        return {
          exitCode: 0,
          stdout: renderFixCommandInstructions(),
          stderr: ""
        };
      case "install":
        return ok(await installCommand(projectRoot, installArgs ?? parseInstallArgs([])));
      case "enrich":
        return await enrichCommand(projectRoot);
      case "apply-safe":
        return ok("apply-safe: no automatic file writes are enabled in this release.\n");
      case "validate":
        return await validateCommand(projectRoot);
    }
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${errorMessage(error)}\n`
    };
  }
}

async function enrichCommand(projectRoot: string): Promise<CommandResult> {
  const packet = await readJson<SkillEvidencePacket>(projectRoot, "skill-evidence-packet.json");
  const enrichment = await readJson<SemanticEnrichment>(projectRoot, "semantic-enrichment.json");
  const result = validateSemanticEnrichment(packet, enrichment);
  const diff = renderSemanticEnrichmentDiff(packet, result);

  await writeJson(projectRoot, "semantic-enrichment-accepted.json", result.accepted);
  await writeJson(projectRoot, "semantic-enrichment-validation.json", result);
  await writeArtifact(projectRoot, "semantic-enrichment-diff.md", diff);

  const rejected = result.issues.filter((issue) => issue.disposition === "rejected");
  const investigation = result.issues.filter((issue) => issue.disposition === "investigation");

  return {
    exitCode: rejected.length === 0 ? 0 : 1,
    stdout: [
      `descuff enrich ${rejected.length === 0 ? "passed" : "failed"}`,
      `Accepted candidate concepts: ${result.candidateConceptsAccepted.length}`,
      `Rejected: ${rejected.length}`,
      `Needs investigation: ${investigation.length}`,
      `Diff: ${join(artifactDir(projectRoot), "semantic-enrichment-diff.md")}`,
      ""
    ].join("\n"),
    stderr:
      rejected.length === 0
        ? ""
        : `${rejected.map((issue) => `${issue.code}: ${issue.message}`).join("\n")}\n`
  };
}

async function installCommand(projectRoot: string, args: InstallArgs): Promise<string> {
  const target = args.target;
  const adapters = target === "all" ? supportedSkillHostAdapters : [getSkillHostAdapter(target)];

  if (args.platform && target === "claude-code") {
    return installClaudeCodeProjectCommand(projectRoot);
  }

  if (args.platform && target !== "codex") {
    throw new Error("Platform install currently supports codex and claude-code.");
  }

  if (args.global) {
    return installGlobalSkill(args);
  }

  const written: string[] = [];

  for (const adapter of adapters) {
    const relativePath = join("skills", adapter.target, adapter.instructionFileHint);
    await writeArtifact(projectRoot, relativePath, renderSkillHostInstructions({ adapter }));
    written.push(join(artifactDir(projectRoot), relativePath));
  }

  return [
    "descuff install completed",
    `Target: ${target}`,
    "",
    "Generated local host instructions:",
    ...written.map((path) => `  ${path}`),
    "",
    "These files are local preview artifacts. Manually inspect them before copying into host-specific Codex, Claude Code, or Cursor directories.",
    ""
  ].join("\n");
}

async function installClaudeCodeProjectCommand(projectRoot: string): Promise<string> {
  const commandPath = join(projectRoot, ".claude", "commands", "descuff.md");
  await mkdir(dirname(commandPath), { recursive: true });
  await writeFile(
    commandPath,
    renderSkillHostInstructions({ adapter: getSkillHostAdapter("claude-code") }),
    "utf8"
  );

  return [
    "descuff install completed",
    "Target: claude-code",
    "Mode: project",
    "",
    "Installed Claude Code command:",
    `  ${commandPath}`,
    "",
    "Invoke it in Claude Code with: /descuff .",
    ""
  ].join("\n");
}

async function installGlobalSkill(args: InstallArgs): Promise<string> {
  if (args.target !== "codex") {
    throw new Error("Global install currently supports only the codex target.");
  }

  const skillPath = join(resolveCodexHome(), "skills", "descuff", "SKILL.md");
  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, renderCodexSkillFile(), "utf8");

  return [
    "descuff install completed",
    "Target: codex",
    "Mode: global",
    "",
    "Installed Codex skill:",
    `  ${skillPath}`,
    "",
    "Invoke it in Codex with: $descuff .",
    ""
  ].join("\n");
}

function parseInstallArgs(args: string[]): InstallArgs {
  const global = args.includes("--global");
  let platformTarget: SkillHostTarget | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--platform") {
      platformTarget = parseInstallPlatform(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith("--platform=")) {
      platformTarget = parseInstallPlatform(arg.slice("--platform=".length));
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    positionals.push(arg);
  }

  const first = positionals[0];
  const target =
    platformTarget ??
    (first === "all" || first === "codex" || first === "claude-code" || first === "cursor"
      ? first
      : "all");
  const targetWasProvided = platformTarget === undefined && target === first;
  const projectRootArg = targetWasProvided ? positionals[1] : positionals[0];

  return {
    target,
    projectRoot: resolve(projectRootArg ?? process.cwd()),
    global: global || platformTarget === "codex",
    platform: platformTarget !== undefined
  };
}

function parseInstallPlatform(value: string | undefined): SkillHostTarget {
  if (value === "codex" || value === "claude-code" || value === "cursor") {
    return value;
  }

  throw new Error("Unsupported install platform. Expected codex or claude-code.");
}

function resolveCodexHome(): string {
  return process.env.CODEX_HOME !== undefined && process.env.CODEX_HOME.length > 0
    ? process.env.CODEX_HOME
    : join(homedir(), ".codex");
}

async function scanCommand(projectRoot: string): Promise<string> {
  const artifacts = await buildScanArtifacts(projectRoot);
  await writeScanArtifacts(projectRoot, artifacts);

  return [
    "descuff scan completed",
    "",
    renderStructuralSummary(artifacts.analysis),
    `Generated changes: ${artifacts.generatedChanges.length}`,
    `Artifacts: ${artifactDir(projectRoot)}`,
    ""
  ].join("\n");
}

async function reportCommand(projectRoot: string): Promise<string> {
  const artifacts = await readOrBuildArtifacts(projectRoot);
  const standards = artifacts.assessments
    .map((assessment) => `${assessment.standardId}: ${assessment.applicability}`)
    .join("\n");

  return [
    "Descuff Report",
    "",
    `Domain profile: ${artifacts.model.domainProfile.primaryDomain || "unknown"}`,
    `Compatibility application type: ${artifacts.model.applicationType.type}`,
    `Capabilities: ${artifacts.model.capabilities.length}`,
    `Routes: ${artifacts.model.routes.length}`,
    `API operations: ${artifacts.model.apis.length}`,
    "",
    "Standards:",
    standards.length === 0 ? "none" : standards,
    ""
  ].join("\n");
}

async function planCommand(projectRoot: string): Promise<string> {
  const artifacts = await readOrBuildArtifacts(projectRoot);
  await writePlanArtifacts(projectRoot, artifacts);

  return `descuff plan wrote ${join(artifactDir(projectRoot), "plan.json")} and ${join(
    artifactDir(projectRoot),
    "plan.md"
  )}\n`;
}

async function startCommand(projectRoot: string): Promise<string> {
  const artifacts = await buildScanArtifacts(projectRoot);
  await writeScanArtifacts(projectRoot, artifacts);
  const validation = await validateArtifacts(projectRoot, artifacts);
  const baseline = createBaselineSnapshot(artifacts, validation.report);

  await writeJson(projectRoot, "baseline.json", baseline);
  await writePlanArtifacts(projectRoot, artifacts);
  await writeArtifact(projectRoot, "codex-prompt.md", renderCodexPrompt());

  return [
    "descuff start completed",
    `Baseline readiness: ${baseline.readiness.score}/${baseline.readiness.maxScore}`,
    `Failures: ${baseline.validation.failures.length}`,
    `Warnings: ${baseline.validation.warnings.length}`,
    "",
    "Generated:",
    `  ${join(artifactDir(projectRoot), "baseline.json")}`,
    `  ${join(artifactDir(projectRoot), "plan.md")}`,
    `  ${join(artifactDir(projectRoot), "codex-prompt.md")}`,
    "",
    "Next:",
    "  1. Give .descuff/codex-prompt.md to your coding agent.",
    "  2. Implement the plan conservatively.",
    "  3. Run: npx descuff finish .",
    ""
  ].join("\n");
}

async function finishCommand(projectRoot: string): Promise<CommandResult> {
  const baseline = await readJson<BaselineSnapshot>(projectRoot, "baseline.json");
  const artifacts = await buildScanArtifacts(projectRoot);
  await writeScanArtifacts(projectRoot, artifacts);
  const validation = await validateArtifacts(projectRoot, artifacts);
  const finalSnapshot = createBaselineSnapshot(artifacts, validation.report);
  const comparison = renderBeforeAfterReport(baseline, finalSnapshot);

  await writeJson(projectRoot, "final-validation.json", validation.report);
  await writeArtifact(projectRoot, "before-after.md", comparison);

  const stdout = `${[
    `descuff finish ${validation.summary.passed ? "passed" : "failed"}`,
    `Readiness: ${baseline.readiness.score}/${baseline.readiness.maxScore} -> ${finalSnapshot.readiness.score}/${finalSnapshot.readiness.maxScore}`,
    `Failures: ${baseline.validation.failures.length} -> ${finalSnapshot.validation.failures.length}`,
    `Warnings: ${baseline.validation.warnings.length} -> ${finalSnapshot.validation.warnings.length}`,
    `Before/after report: ${join(artifactDir(projectRoot), "before-after.md")}`,
    renderValidationSummaryDetails(validation.summary).trimEnd()
  ]
    .filter((line) => line.length > 0)
    .join("\n")}\n`;

  return {
    exitCode: validation.summary.passed ? 0 : 1,
    stdout,
    stderr: ""
  };
}

async function validateCommand(projectRoot: string): Promise<CommandResult> {
  const artifacts = await buildScanArtifacts(projectRoot);
  await writeScanArtifacts(projectRoot, artifacts);
  const validation = await validateArtifacts(projectRoot, artifacts);

  const stdout = `${[
    `descuff validate ${validation.summary.passed ? "passed" : "failed"}`,
    `Readiness: ${validation.report.readiness.score}/${validation.report.readiness.maxScore}`,
    `Failures: ${validation.summary.failures.length}`,
    `Warnings: ${validation.summary.warnings.length}`,
    `Artifacts: ${artifactDir(projectRoot)}`,
    renderValidationSummaryDetails(validation.summary).trimEnd()
  ]
    .filter((line) => line.length > 0)
    .join("\n")}\n`;

  return {
    exitCode: validation.summary.passed ? 0 : 1,
    stdout,
    stderr: ""
  };
}

async function validateArtifacts(
  projectRoot: string,
  artifacts: ScanArtifacts
): Promise<{ summary: ValidationSummary; report: ValidationReadinessReport }> {
  const summary = mergeValidationSummaries([
    validateStaticGeneratedChanges(artifacts.generatedChanges, artifacts.model),
    await runStandardValidation(
      applicableStandardAdapters(standardAdapters(), artifacts.assessments),
      {
        model: artifacts.model,
        generatedChanges: artifacts.generatedChanges
      }
    ),
    validateRuntimeObservations(artifacts.model, artifacts.analysis),
    validateSecurityModel(artifacts.model),
    validateCapabilityConfidence(artifacts.model),
    validateSourceFingerprints(
      artifacts.sourceFingerprints,
      await createSourceFingerprintManifest(projectRoot, artifacts.analysis)
    )
  ]);
  const report = createValidationReadinessReport(artifacts.model, [summary]);
  await writeJson(projectRoot, "validation.json", report);
  await writeArtifact(projectRoot, "validation-repair.md", renderValidationRepairGuide(summary));

  return { summary, report };
}

async function readOrBuildArtifacts(projectRoot: string): Promise<ScanArtifacts> {
  try {
    const artifacts = {
      analysis: await readJson<StructuralAnalysis>(projectRoot, "analysis.json"),
      graphifyEnrichment: await readJson<ReturnType<typeof buildGraphifyEnrichmentSummary>>(
        projectRoot,
        "graphify-enrichment.json"
      ),
      model: await readJson<ApplicationModel>(projectRoot, "model.json"),
      assessments: await readJson<StandardAssessment[]>(projectRoot, "assessments.json"),
      generatedChanges: await readJson<GeneratedChange[]>(projectRoot, "generated-changes.json"),
      sourceFingerprints: await readJson<SourceFingerprintManifest>(
        projectRoot,
        "source-fingerprints.json"
      )
    };
    const currentFingerprints = await createSourceFingerprintManifest(
      projectRoot,
      artifacts.analysis
    );
    const freshness = validateSourceFingerprints(artifacts.sourceFingerprints, currentFingerprints);
    if (!freshness.passed) {
      throw new Error("Cached Descuff artifacts are stale.");
    }
    return artifacts;
  } catch {
    const artifacts = await buildScanArtifacts(projectRoot);
    await writeScanArtifacts(projectRoot, artifacts);
    return artifacts;
  }
}

async function buildScanArtifacts(projectRoot: string): Promise<ScanArtifacts> {
  const analysis = await new NativeNextAnalyzer().analyze(createProjectContext(projectRoot));
  const analysisWithRuntime = withSyntheticReadOnlyRuntime(analysis);
  const graphifyAnalysis = await new GraphifyAnalyzer().analyze(createProjectContext(projectRoot));
  const graphifyEnrichment = buildGraphifyEnrichmentSummary({
    native: analysisWithRuntime,
    graphify: graphifyAnalysis
  });
  const model = structuralAnalysisToApplicationModel(analysisWithRuntime);
  const adapters = standardAdapters();
  const assessments = await Promise.all(adapters.map((adapter) => adapter.assess(model)));
  const generated = await Promise.all(
    applicableStandardAdapters(adapters, assessments).map((adapter) => adapter.generate(model))
  );

  return {
    analysis: analysisWithRuntime,
    graphifyEnrichment,
    model,
    assessments,
    generatedChanges: generated.flat(),
    sourceFingerprints: await createSourceFingerprintManifest(projectRoot, analysisWithRuntime)
  };
}

async function writeScanArtifacts(projectRoot: string, artifacts: ScanArtifacts): Promise<void> {
  const skillEvidencePacket = buildSkillEvidencePacket({
    model: artifacts.model,
    graphifyEnrichment: artifacts.graphifyEnrichment
  });
  await writeJson(projectRoot, "analysis.json", artifacts.analysis);
  await writeJson(projectRoot, "graphify-enrichment.json", artifacts.graphifyEnrichment);
  await writeArtifact(
    projectRoot,
    "graphify-enrichment.md",
    renderGraphifyEnrichmentSummary(artifacts.graphifyEnrichment)
  );
  await writeJson(projectRoot, "model.json", artifacts.model);
  await writeJson(projectRoot, "assessments.json", artifacts.assessments);
  await writeJson(projectRoot, "generated-changes.json", artifacts.generatedChanges);
  await writeJson(projectRoot, "source-fingerprints.json", artifacts.sourceFingerprints);
  await writeJson(projectRoot, "skill-evidence-packet.json", skillEvidencePacket);
  await writeArtifact(
    projectRoot,
    "skill-evidence-packet.md",
    renderSkillEvidencePacket(skillEvidencePacket)
  );
  await writeJson(
    projectRoot,
    "semantic-enrichment-template.json",
    createSemanticEnrichmentTemplate(skillEvidencePacket)
  );
  await writeArtifact(
    projectRoot,
    "semantic-enrichment-prompt.md",
    renderSemanticEnrichmentPrompt(skillEvidencePacket)
  );
}

async function writePlanArtifacts(projectRoot: string, artifacts: ScanArtifacts): Promise<void> {
  const plan = buildAgentPlan({
    projectRoot,
    generatedAt: new Date(0).toISOString(),
    assessments: artifacts.assessments,
    generatedChanges: artifacts.generatedChanges
  });

  await writeJson(projectRoot, "plan.json", plan);
  await writeArtifact(projectRoot, "plan.md", renderAgentPlanMarkdown(plan));
}

function createBaselineSnapshot(
  artifacts: ScanArtifacts,
  report: ValidationReadinessReport
): BaselineSnapshot {
  return {
    schemaVersion: "0.1.0",
    recordedAt: new Date(0).toISOString(),
    readiness: report.readiness,
    validation: report.validation,
    implementedStandards: uniqueSorted(artifacts.model.standards.map((standard) => standard.kind)),
    recommendedStandards: uniqueSorted(
      artifacts.assessments
        .filter((assessment) => ["required", "recommended"].includes(assessment.applicability))
        .map((assessment) => assessment.standardId)
    ),
    routes: artifacts.model.routes.map((route) => route.path).sort(),
    apis: artifacts.model.apis.map((api) => `${api.method} ${api.path}`).sort(),
    capabilities: artifacts.model.capabilities.map((capability) => capability.name).sort()
  };
}

function renderCodexPrompt(): string {
  return [
    "# Descuff Coding Agent Prompt",
    "",
    "Use Descuff to implement agent-facing standards for this Next.js app.",
    "",
    "1. Read `.descuff/baseline.json`, `.descuff/plan.md`, `.descuff/model.json`, `.descuff/assessments.json`, `.descuff/generated-changes.json`, `.descuff/skill-evidence-packet.json`, and `.descuff/semantic-enrichment-prompt.md`.",
    "2. Write evidence-backed semantic enrichment to `.descuff/semantic-enrichment.json` using only evidence IDs from the packet.",
    "3. Run `npx descuff enrich .` and inspect `.descuff/semantic-enrichment-diff.md` before implementation.",
    "4. Implement the plan conservatively.",
    "5. Preserve existing UI and behavior.",
    "6. Do not expose private, sensitive, mutating, or high-consequence actions without explicit approval.",
    "7. Run the existing project tests.",
    "8. Run `npx descuff finish .` and include `.descuff/before-after.md` in the final report.",
    ""
  ].join("\n");
}

function renderBeforeAfterReport(before: BaselineSnapshot, after: BaselineSnapshot): string {
  return [
    "# Descuff Before/After Report",
    "",
    `Readiness: ${before.readiness.score}/${before.readiness.maxScore} -> ${after.readiness.score}/${after.readiness.maxScore}`,
    `Failures: ${before.validation.failures.length} -> ${after.validation.failures.length}`,
    `Warnings: ${before.validation.warnings.length} -> ${after.validation.warnings.length}`,
    `Implemented standards: ${before.implementedStandards.length} -> ${after.implementedStandards.length}`,
    `Routes detected: ${before.routes.length} -> ${after.routes.length}`,
    `APIs detected: ${before.apis.length} -> ${after.apis.length}`,
    `Capabilities detected: ${before.capabilities.length} -> ${after.capabilities.length}`,
    "",
    "## Standards",
    "",
    `Before: ${before.implementedStandards.join(", ") || "none"}`,
    `After: ${after.implementedStandards.join(", ") || "none"}`,
    "",
    "## Remaining Lost Readiness Points",
    "",
    ...after.readiness.lostPoints.map(
      (loss) => `- ${loss.category}: -${loss.pointsLost} (${loss.reason})`
    ),
    after.readiness.lostPoints.length === 0 ? "- none" : "",
    ""
  ].join("\n");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function standardAdapters(): StandardAdapter[] {
  return [
    new LlmsTxtAdapter(),
    new SchemaOrgAdapter(),
    new OpenApiAdapter(),
    new ApiCatalogAdapter(),
    new WebMcpAdapter()
  ];
}

function applicableStandardAdapters(
  adapters: StandardAdapter[],
  assessments: StandardAssessment[]
): StandardAdapter[] {
  const applicableIds = new Set(
    assessments
      .filter((assessment) => assessment.applicability !== "not-applicable")
      .map((assessment) => assessment.standardId)
  );
  return adapters.filter((adapter) => applicableIds.has(adapter.id));
}

function withSyntheticReadOnlyRuntime(analysis: StructuralAnalysis): StructuralAnalysis {
  return {
    ...analysis,
    runtimeRoutes:
      analysis.runtimeRoutes.length > 0
        ? analysis.runtimeRoutes
        : analysis.routes.map((route) => ({
            id: `runtime-route:${route.path}`,
            path: route.path,
            status: 200,
            evidence: route.evidence
          })),
    runtimeApiOperations:
      analysis.runtimeApiOperations.length > 0
        ? analysis.runtimeApiOperations
        : analysis.apiOperations
            .filter((operation) => ["GET", "HEAD", "OPTIONS"].includes(operation.method))
            .map((operation) => ({
              id: `runtime-api:${operation.method}:${operation.path}`,
              path: operation.path,
              method: operation.method,
              status: 200,
              evidence: operation.evidence
            }))
  };
}

async function createSourceFingerprintManifest(
  projectRoot: string,
  analysis: StructuralAnalysis
): Promise<SourceFingerprintManifest> {
  const evidenceByPath = new Map<string, EvidenceRef[]>();

  for (const ref of analysis.evidence.items) {
    if (ref.kind !== "source" || ref.location.trim().length === 0) {
      continue;
    }

    const evidence = evidenceByPath.get(ref.location) ?? [];
    evidence.push(ref);
    evidenceByPath.set(ref.location, evidence);
  }

  const files: SourceFileFingerprint[] = [];
  for (const [path, evidence] of [...evidenceByPath.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    files.push(await fingerprintSourceFile(projectRoot, path, evidence));
  }

  return {
    schemaVersion: "0.1.0",
    generatedAt: new Date(0).toISOString(),
    files
  };
}

async function fingerprintSourceFile(
  projectRoot: string,
  path: string,
  evidence: EvidenceRef[]
): Promise<SourceFileFingerprint> {
  try {
    const content = await readFile(join(projectRoot, path));
    return {
      path,
      sha256: createHash("sha256").update(content).digest("hex"),
      missing: false,
      evidence
    };
  } catch {
    return {
      path,
      sha256: null,
      missing: true,
      evidence
    };
  }
}

async function readJson<T>(projectRoot: string, name: string): Promise<T> {
  return JSON.parse(await readFile(join(artifactDir(projectRoot), name), "utf8")) as T;
}

async function writeJson(projectRoot: string, name: string, value: unknown): Promise<void> {
  await writeArtifact(projectRoot, name, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeArtifact(projectRoot: string, name: string, content: string): Promise<void> {
  const path = join(artifactDir(projectRoot), name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function artifactDir(projectRoot: string): string {
  return join(projectRoot, ".descuff");
}

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
