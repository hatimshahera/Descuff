import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildAgentPlan,
  renderAgentPlanMarkdown,
  renderFixCommandInstructions
} from "@descuff/agent-workflow";
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

Commands:
  ${descuffCommands.join("\n  ")}
`;

interface ScanArtifacts {
  analysis: StructuralAnalysis;
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

export async function runCli(argv: string[]): Promise<CommandResult> {
  const command = argv[2];
  const projectRoot = resolve(argv[3] ?? process.cwd());

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
    `Application type: ${artifacts.model.applicationType.type}`,
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
  const model = structuralAnalysisToApplicationModel(analysisWithRuntime);
  const adapters = standardAdapters();
  const assessments = await Promise.all(adapters.map((adapter) => adapter.assess(model)));
  const generated = await Promise.all(
    applicableStandardAdapters(adapters, assessments).map((adapter) => adapter.generate(model))
  );

  return {
    analysis: analysisWithRuntime,
    model,
    assessments,
    generatedChanges: generated.flat(),
    sourceFingerprints: await createSourceFingerprintManifest(projectRoot, analysisWithRuntime)
  };
}

async function writeScanArtifacts(projectRoot: string, artifacts: ScanArtifacts): Promise<void> {
  await writeJson(projectRoot, "analysis.json", artifacts.analysis);
  await writeJson(projectRoot, "model.json", artifacts.model);
  await writeJson(projectRoot, "assessments.json", artifacts.assessments);
  await writeJson(projectRoot, "generated-changes.json", artifacts.generatedChanges);
  await writeJson(projectRoot, "source-fingerprints.json", artifacts.sourceFingerprints);
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
    "1. Read `.descuff/baseline.json`, `.descuff/plan.md`, `.descuff/model.json`, `.descuff/assessments.json`, and `.descuff/generated-changes.json`.",
    "2. Implement the plan conservatively.",
    "3. Preserve existing UI and behavior.",
    "4. Do not expose private, sensitive, mutating, or high-consequence actions without explicit approval.",
    "5. Run the existing project tests.",
    "6. Run `npx descuff finish .` and include `.descuff/before-after.md` in the final report.",
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
  await mkdir(artifactDir(projectRoot), { recursive: true });
  await writeFile(join(artifactDir(projectRoot), name), content, "utf8");
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
