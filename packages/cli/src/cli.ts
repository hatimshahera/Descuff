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
  runStandardValidation,
  validateRuntimeObservations,
  validateSecurityModel,
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
  await writeJson(projectRoot, "analysis.json", artifacts.analysis);
  await writeJson(projectRoot, "model.json", artifacts.model);
  await writeJson(projectRoot, "assessments.json", artifacts.assessments);
  await writeJson(projectRoot, "generated-changes.json", artifacts.generatedChanges);

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
  const plan = buildAgentPlan({
    projectRoot,
    generatedAt: new Date(0).toISOString(),
    assessments: artifacts.assessments,
    generatedChanges: artifacts.generatedChanges
  });

  await writeJson(projectRoot, "plan.json", plan);
  await writeArtifact(projectRoot, "plan.md", renderAgentPlanMarkdown(plan));

  return `descuff plan wrote ${join(artifactDir(projectRoot), "plan.json")} and ${join(
    artifactDir(projectRoot),
    "plan.md"
  )}\n`;
}

async function validateCommand(projectRoot: string): Promise<CommandResult> {
  const artifacts = await readOrBuildArtifacts(projectRoot);
  const summary = mergeValidationSummaries([
    validateStaticGeneratedChanges(artifacts.generatedChanges),
    await runStandardValidation(standardAdapters(), {
      model: artifacts.model,
      generatedChanges: artifacts.generatedChanges
    }),
    validateRuntimeObservations(artifacts.model, artifacts.analysis),
    validateSecurityModel(artifacts.model)
  ]);
  const report = createValidationReadinessReport(artifacts.model, [summary]);
  await writeJson(projectRoot, "validation.json", report);
  await writeArtifact(projectRoot, "validation-repair.md", renderValidationRepairGuide(summary));

  const stdout = [
    `descuff validate ${summary.passed ? "passed" : "failed"}`,
    `Readiness: ${report.readiness.score}/${report.readiness.maxScore}`,
    `Failures: ${summary.failures.length}`,
    `Warnings: ${summary.warnings.length}`,
    `Artifacts: ${artifactDir(projectRoot)}`,
    ""
  ].join("\n");

  return {
    exitCode: summary.passed ? 0 : 1,
    stdout,
    stderr: ""
  };
}

async function readOrBuildArtifacts(projectRoot: string): Promise<ScanArtifacts> {
  try {
    return {
      analysis: await readJson<StructuralAnalysis>(projectRoot, "analysis.json"),
      model: await readJson<ApplicationModel>(projectRoot, "model.json"),
      assessments: await readJson<StandardAssessment[]>(projectRoot, "assessments.json"),
      generatedChanges: await readJson<GeneratedChange[]>(projectRoot, "generated-changes.json")
    };
  } catch {
    return buildScanArtifacts(projectRoot);
  }
}

async function buildScanArtifacts(projectRoot: string): Promise<ScanArtifacts> {
  const analysis = await new NativeNextAnalyzer().analyze(createProjectContext(projectRoot));
  const analysisWithRuntime = withSyntheticReadOnlyRuntime(analysis);
  const model = structuralAnalysisToApplicationModel(analysisWithRuntime);
  const adapters = standardAdapters();
  const assessments = await Promise.all(adapters.map((adapter) => adapter.assess(model)));
  const generated = await Promise.all(adapters.map((adapter) => adapter.generate(model)));

  return {
    analysis: analysisWithRuntime,
    model,
    assessments,
    generatedChanges: generated.flat()
  };
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
