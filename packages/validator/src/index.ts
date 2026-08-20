import {
  classifyCapabilityRisk,
  type ApplicationModel,
  type EvidenceRef,
  type HttpMethod,
  type ReadinessScore,
  type StructuralAnalysis,
  scoreReadiness
} from "@descuff/ir";
import type {
  GeneratedChange,
  StandardAdapter,
  StandardValidationContext,
  StandardValidationResult
} from "@descuff/standard-core";

export type ValidationLevel =
  "static" | "build" | "existing-tests" | "runtime" | "security" | "regression";
export type ValidationSeverity = "error" | "warning";

export interface ValidationFailure {
  code: string;
  level: ValidationLevel;
  severity: ValidationSeverity;
  message: string;
  source: string;
  path?: string;
  evidence: EvidenceRef[];
  suggestedAction: string;
}

export interface ValidationSummary {
  passed: boolean;
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
}

export interface ValidationCommand {
  id: string;
  level: "build" | "existing-tests";
  command: string;
  args: string[];
  cwd: string;
  evidence: EvidenceRef[];
}

export interface ValidationCommandResult {
  commandId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  failingIdentifiers?: string[];
}

export type ValidationCommandRunner = (
  command: ValidationCommand
) => Promise<ValidationCommandResult>;

export interface ExistingTestBaselineEntry {
  commandId: string;
  command: string;
  args: string[];
  exitCode: number;
  failingIdentifiers: string[];
  evidence: EvidenceRef[];
}

export interface ExistingTestBaseline {
  schemaVersion: string;
  recordedAt: string;
  entries: ExistingTestBaselineEntry[];
}

export interface RuntimeValidationScenario {
  id: string;
  method: HttpMethod;
  path: string;
  setup: string;
  expectedSideEffects: string[];
  verification: string;
  cleanup: string;
  safeTestEnvironment?: boolean;
  evidence: EvidenceRef[];
}

export interface RuntimeValidationConfig {
  baseUrl: string;
  readinessUrl?: string;
  startCommand?: string;
  routes: string[];
  apiOperations: Array<{
    method: HttpMethod;
    path: string;
  }>;
  envVarNames: string[];
  scenarios: RuntimeValidationScenario[];
}

export interface UiRouteInvariant {
  route: string;
  title?: string;
  headings: string[];
  landmarkCount?: number;
  evidence: EvidenceRef[];
}

export interface UiRegressionBaseline {
  schemaVersion: string;
  recordedAt: string;
  routes: UiRouteInvariant[];
}

export interface ValidationReadinessReport {
  schemaVersion: string;
  readiness: ReadinessScore;
  validation: ValidationSummary;
  ready: boolean;
  blockers: ValidationFailure[];
}

export function createEmptyValidationSummary(): ValidationSummary {
  return {
    passed: true,
    failures: [],
    warnings: []
  };
}

export function recordExistingTestBaseline(
  recordedAt: string,
  commands: ValidationCommand[],
  results: ValidationCommandResult[]
): ExistingTestBaseline {
  const commandsById = new Map(commands.map((command) => [command.id, command]));

  return {
    schemaVersion: "0.1.0",
    recordedAt,
    entries: results
      .filter((result) => {
        const command = commandsById.get(result.commandId);
        return command?.level === "existing-tests";
      })
      .map((result) => {
        const command = commandsById.get(result.commandId);
        if (command === undefined) {
          throw new Error(`Cannot record baseline for unknown command: ${result.commandId}`);
        }

        return {
          commandId: result.commandId,
          command: command.command,
          args: [...command.args],
          exitCode: result.exitCode,
          failingIdentifiers: [...(result.failingIdentifiers ?? [])].sort(),
          evidence: command.evidence
        };
      })
  };
}

export function createValidationSummary(issues: ValidationFailure[]): ValidationSummary {
  const failures = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    passed: failures.length === 0,
    failures,
    warnings
  };
}

export function createValidationReadinessReport(
  model: ApplicationModel,
  summaries: ValidationSummary[]
): ValidationReadinessReport {
  const validation = mergeValidationSummaries(summaries);
  const readiness = scoreReadiness(model);

  return {
    schemaVersion: "0.1.0",
    readiness,
    validation,
    ready: readiness.score === readiness.maxScore && validation.passed,
    blockers: validation.failures
  };
}

export function mergeValidationSummaries(summaries: ValidationSummary[]): ValidationSummary {
  return createValidationSummary(
    summaries.flatMap((summary) => [...summary.failures, ...summary.warnings])
  );
}

export function validateStaticStandardResults(
  results: StandardValidationResult[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const result of results) {
    for (const issue of result.issues) {
      issues.push({
        code: issue.code,
        level: "static",
        severity: issue.severity,
        message: issue.message,
        source: result.standardId,
        ...(issue.path === undefined ? {} : { path: issue.path }),
        evidence: issue.evidence,
        suggestedAction: `Repair ${result.standardId} output and rerun descuff validate.`
      });

      if (issue.code.length === 0 || issue.message.length === 0) {
        issues.push({
          code: "VALIDATION_FAILURE_UNTYPED",
          level: "static",
          severity: "error",
          message: "Validation failures must include a typed code and actionable message.",
          source: result.standardId,
          ...(issue.path === undefined ? {} : { path: issue.path }),
          evidence: issue.evidence,
          suggestedAction: "Return typed validation failures from the standard adapter."
        });
      }
    }
  }

  return createValidationSummary(issues);
}

export async function runStandardValidation(
  adapters: StandardAdapter[],
  context: StandardValidationContext
): Promise<ValidationSummary> {
  const results: StandardValidationResult[] = [];
  const issues: ValidationFailure[] = [];

  for (const adapter of adapters) {
    try {
      results.push(await adapter.validate(context));
    } catch (error) {
      issues.push({
        code: "STANDARD_VALIDATION_RUNNER_FAILED",
        level: "static",
        severity: "error",
        message: `${adapter.id} validation runner failed: ${errorMessage(error)}`,
        source: adapter.id,
        evidence: [],
        suggestedAction: "Fix the standard validation runner before trusting validation output."
      });
    }
  }

  const standardSummary = validateStaticStandardResults(results);
  return createValidationSummary([
    ...standardSummary.failures,
    ...standardSummary.warnings,
    ...issues
  ]);
}

export function createRepositoryValidationCommands(
  projectRoot: string,
  packageJson: { scripts?: Record<string, string> },
  evidence: EvidenceRef[] = []
): ValidationCommand[] {
  const scripts = packageJson.scripts ?? {};
  const commands: ValidationCommand[] = [];

  for (const scriptName of ["typecheck", "lint", "build"]) {
    if (scripts[scriptName] !== undefined) {
      commands.push({
        id: `script:${scriptName}`,
        level: "build",
        command: "pnpm",
        args: ["run", scriptName],
        cwd: projectRoot,
        evidence
      });
    }
  }

  if (scripts.test !== undefined) {
    commands.push({
      id: "script:test",
      level: "existing-tests",
      command: "pnpm",
      args: ["run", "test"],
      cwd: projectRoot,
      evidence
    });
  }

  return commands;
}

export async function runValidationCommands(
  commands: ValidationCommand[],
  runner: ValidationCommandRunner
): Promise<ValidationCommandResult[]> {
  const results: ValidationCommandResult[] = [];

  for (const command of commands) {
    const result = await runner(command);
    results.push(result);
  }

  return results;
}

export function validateCommandResults(
  commands: ValidationCommand[],
  results: ValidationCommandResult[],
  baseline?: ExistingTestBaseline
): ValidationSummary {
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const baselineById = new Map(
    baseline?.entries.map((entry) => [entry.commandId, entry] as const) ?? []
  );
  const issues: ValidationFailure[] = [];

  for (const result of results) {
    const command = commandsById.get(result.commandId);

    if (command === undefined) {
      issues.push({
        code: "VALIDATION_COMMAND_RESULT_UNKNOWN",
        level: "build",
        severity: "error",
        message: `Validation command result ${result.commandId} did not match a configured command.`,
        source: result.commandId,
        evidence: [],
        suggestedAction: "Ensure validation command results are keyed by configured command id."
      });
      continue;
    }

    if (command.level === "existing-tests") {
      const baselineEntry = baselineById.get(command.id);
      issues.push(...compareExistingTestResultToBaseline(command, result, baselineEntry));
      continue;
    }

    if (result.exitCode !== 0) {
      issues.push({
        code: "BUILD_VALIDATION_COMMAND_FAILED",
        level: command.level,
        severity: "error",
        message: `${command.command} ${command.args.join(" ")} exited with ${result.exitCode}.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction:
          "Fix the failing build validation command before marking validation successful."
      });
    }
  }

  for (const command of commands) {
    if (!results.some((result) => result.commandId === command.id)) {
      issues.push({
        code: "VALIDATION_COMMAND_RESULT_MISSING",
        level: command.level,
        severity: "error",
        message: `Validation command ${command.id} did not produce a result.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction: "Run every configured validation command and collect its result."
      });
    }
  }

  return createValidationSummary(issues);
}

function compareExistingTestResultToBaseline(
  command: ValidationCommand,
  result: ValidationCommandResult,
  baselineEntry: ExistingTestBaselineEntry | undefined
): ValidationFailure[] {
  const issues: ValidationFailure[] = [];
  const currentFailures = new Set(result.failingIdentifiers ?? []);
  const baselineFailures = new Set(baselineEntry?.failingIdentifiers ?? []);

  if (result.exitCode === 0) {
    return issues;
  }

  if (baselineEntry === undefined) {
    issues.push({
      code: "EXISTING_TEST_COMMAND_FAILED",
      level: "existing-tests",
      severity: "error",
      message: `${command.command} ${command.args.join(" ")} exited with ${result.exitCode}.`,
      source: command.id,
      evidence: command.evidence,
      suggestedAction: "Fix the failing test or record an explicit scan baseline with evidence."
    });
    return issues;
  }

  if (baselineEntry.evidence.length === 0) {
    issues.push({
      code: "EXISTING_TEST_BASELINE_EVIDENCE_MISSING",
      level: "existing-tests",
      severity: "error",
      message: `Baseline exception for ${command.id} must include evidence.`,
      source: command.id,
      evidence: [],
      suggestedAction:
        "Record baseline evidence during scan before accepting pre-existing failures."
    });
  }

  for (const failure of currentFailures) {
    if (!baselineFailures.has(failure)) {
      issues.push({
        code: "EXISTING_TEST_NEW_FAILURE",
        level: "existing-tests",
        severity: "error",
        message: `Existing test command produced new failure ${failure}.`,
        source: command.id,
        evidence: command.evidence,
        suggestedAction: "Fix the new failing test before marking validation successful."
      });
    }
  }

  if (currentFailures.size === 0) {
    issues.push({
      code: "EXISTING_TEST_FAILURE_IDENTIFIERS_MISSING",
      level: "existing-tests",
      severity: "error",
      message:
        "Failing existing test command must report failing identifiers for baseline comparison.",
      source: command.id,
      evidence: command.evidence,
      suggestedAction: "Capture failing test identifiers from the configured test runner."
    });
  }

  return issues;
}

export function validateStaticGeneratedChanges(changes: GeneratedChange[]): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const change of changes) {
    if (change.path.trim().length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_PATH_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include a target path.",
        source: change.standardId,
        evidence: change.evidence,
        suggestedAction: "Regenerate the standard change with a deterministic target path."
      });
    }

    if (change.evidence.length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_EVIDENCE_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include evidence before it can be validated.",
        source: change.standardId,
        path: change.path,
        evidence: [],
        suggestedAction: "Attach source or runtime evidence to the generated change."
      });
    }

    if (change.safety === "automatic" && !change.deterministic) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_UNSAFE_AUTOMATIC",
        level: "static",
        severity: "error",
        message: "Automatic generated changes must be deterministic.",
        source: change.standardId,
        path: change.path,
        evidence: change.evidence,
        suggestedAction: "Mark the change approval-required or make generation deterministic."
      });
    }
  }

  return createValidationSummary(issues);
}

export function validateRuntimeConfig(config: RuntimeValidationConfig): ValidationSummary {
  const issues: ValidationFailure[] = [];

  if (!/^https?:\/\//.test(config.baseUrl)) {
    issues.push({
      code: "RUNTIME_CONFIG_BASE_URL_INVALID",
      level: "runtime",
      severity: "error",
      message: "Runtime validation baseUrl must be an HTTP or HTTPS URL.",
      source: "runtime-config",
      evidence: [],
      suggestedAction: "Configure a reachable HTTP(S) base URL for runtime validation."
    });
  }

  for (const envVarName of config.envVarNames) {
    if (envVarName.includes("=")) {
      issues.push({
        code: "RUNTIME_CONFIG_SECRET_VALUE_EMBEDDED",
        level: "runtime",
        severity: "error",
        message: "Runtime config must reference environment variable names, not secret values.",
        source: "runtime-config",
        evidence: [],
        suggestedAction: "Store only the environment variable name in runtime validation config."
      });
    }
  }

  for (const operation of config.apiOperations) {
    issues.push(...validateRuntimeOperationAuthorization(operation, config.scenarios));
  }

  return createValidationSummary(issues);
}

export function validateRuntimeObservations(
  model: ApplicationModel,
  analysis: StructuralAnalysis
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const runtimeRoutesByPath = new Map(analysis.runtimeRoutes.map((route) => [route.path, route]));
  const runtimeApisByOperation = new Map(
    analysis.runtimeApiOperations.map((operation) => [
      `${operation.method}:${operation.path}`,
      operation
    ])
  );

  for (const route of model.routes) {
    const observed = runtimeRoutesByPath.get(route.path);

    if (observed === undefined) {
      issues.push({
        code: "RUNTIME_ROUTE_NOT_OBSERVED",
        level: "runtime",
        severity: "error",
        message: `Route ${route.path} was not observed during runtime validation.`,
        source: route.id,
        evidence: route.evidence,
        suggestedAction:
          "Start the application and validate the route against the configured base URL."
      });
      continue;
    }

    if (!isSuccessfulRuntimeStatus(observed.status)) {
      issues.push({
        code: "RUNTIME_ROUTE_STATUS_FAILED",
        level: "runtime",
        severity: "error",
        message: `Route ${route.path} returned HTTP ${observed.status}.`,
        source: route.id,
        evidence: [...route.evidence, ...observed.evidence],
        suggestedAction:
          "Fix the route or generated references before marking runtime validation successful."
      });
    }
  }

  for (const api of model.apis.filter((operation) => isReadOnlyMethod(operation.method))) {
    const observed = runtimeApisByOperation.get(`${api.method}:${api.path}`);

    if (observed === undefined) {
      issues.push({
        code: "RUNTIME_API_NOT_OBSERVED",
        level: "runtime",
        severity: "error",
        message: `${api.method} ${api.path} was not observed during runtime validation.`,
        source: api.id,
        evidence: api.evidence,
        suggestedAction:
          "Start the application and validate the API operation against the configured base URL."
      });
      continue;
    }

    if (!isSuccessfulRuntimeStatus(observed.status)) {
      issues.push({
        code: "RUNTIME_API_STATUS_FAILED",
        level: "runtime",
        severity: "error",
        message: `${api.method} ${api.path} returned HTTP ${observed.status}.`,
        source: api.id,
        evidence: [...api.evidence, ...observed.evidence],
        suggestedAction:
          "Fix the API handler or generated references before marking runtime validation successful."
      });
    }
  }

  return createValidationSummary(issues);
}

export function validateSecurityModel(model: ApplicationModel): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const capability of model.capabilities) {
    if (
      (capability.visibility === "authenticated" || capability.visibility === "admin") &&
      model.authentication.boundaries.length === 0
    ) {
      issues.push({
        code: "SECURITY_AUTH_BOUNDARY_MISSING",
        level: "security",
        severity: "error",
        message: `${capability.name} is ${capability.visibility} but no authentication boundary was detected.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction:
          "Verify middleware or route-level auth evidence before exposing this capability."
      });
    }

    if (capability.visibility === "public" && capability.risk === "AUTHENTICATED_READ") {
      issues.push({
        code: "SECURITY_AUTHENTICATED_READ_EXPOSED_PUBLICLY",
        level: "security",
        severity: "error",
        message: `${capability.name} is classified as authenticated read but marked public.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction:
          "Mark the capability authenticated or remove it from public generated output."
      });
    }

    if (
      (capability.risk === "SENSITIVE_WRITE" || capability.risk === "HIGH_CONSEQUENCE") &&
      capability.visibility === "public"
    ) {
      issues.push({
        code: "SECURITY_SENSITIVE_CAPABILITY_PUBLIC",
        level: "security",
        severity: "error",
        message: `${capability.name} is ${capability.risk} and must not be silently exposed publicly.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction: "Require explicit approval and authenticated or mocked validation."
      });
    }
  }

  return createValidationSummary(issues);
}

export function validateUiRegression(
  baseline: UiRegressionBaseline,
  current: UiRouteInvariant[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const currentByRoute = new Map(current.map((route) => [route.route, route]));

  for (const expected of baseline.routes) {
    const observed = currentByRoute.get(expected.route);

    if (observed === undefined) {
      issues.push({
        code: "UI_REGRESSION_ROUTE_MISSING",
        level: "regression",
        severity: "error",
        message: `Expected route ${expected.route} was not observed during regression validation.`,
        source: expected.route,
        evidence: expected.evidence,
        suggestedAction: "Restore the route or approve the route removal explicitly."
      });
      continue;
    }

    if (expected.title !== undefined && observed.title !== expected.title) {
      issues.push({
        code: "UI_REGRESSION_TITLE_CHANGED",
        level: "regression",
        severity: "error",
        message: `Route ${expected.route} title changed from ${expected.title} to ${observed.title ?? "<missing>"}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Restore the title or record explicit approval for the UI copy change."
      });
    }

    const missingHeadings = expected.headings.filter(
      (heading) => !observed.headings.includes(heading)
    );
    for (const heading of missingHeadings) {
      issues.push({
        code: "UI_REGRESSION_HEADING_MISSING",
        level: "regression",
        severity: "error",
        message: `Route ${expected.route} is missing expected heading ${heading}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Restore the heading or record explicit approval for the UI copy change."
      });
    }

    if (expected.landmarkCount !== undefined && observed.landmarkCount !== expected.landmarkCount) {
      issues.push({
        code: "UI_REGRESSION_LANDMARK_COUNT_CHANGED",
        level: "regression",
        severity: "warning",
        message: `Route ${expected.route} landmark count changed from ${expected.landmarkCount} to ${observed.landmarkCount ?? 0}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Review the accessibility landmark change before approving validation."
      });
    }
  }

  return createValidationSummary(issues);
}

function validateRuntimeOperationAuthorization(
  operation: { method: HttpMethod; path: string },
  scenarios: RuntimeValidationScenario[]
): ValidationFailure[] {
  const risk = classifyCapabilityRisk(operation.method, operation.path);

  if (isReadOnlyMethod(operation.method)) {
    return [];
  }

  const scenario = scenarios.find(
    (candidate) => candidate.method === operation.method && candidate.path === operation.path
  );

  if (scenario === undefined) {
    return [
      {
        code: "RUNTIME_MUTATION_SCENARIO_MISSING",
        level: "runtime",
        severity: "error",
        message: `${operation.method} ${operation.path} requires an explicit validation scenario before invocation.`,
        source: "runtime-config",
        evidence: [],
        suggestedAction:
          "Define setup, expected side effects, verification, and cleanup before validating this mutating operation."
      }
    ];
  }

  const missingFields = [
    scenario.setup,
    scenario.verification,
    scenario.cleanup,
    ...scenario.expectedSideEffects
  ].some((value) => value.trim().length === 0);

  if (missingFields || scenario.expectedSideEffects.length === 0) {
    return [
      {
        code: "RUNTIME_MUTATION_SCENARIO_INCOMPLETE",
        level: "runtime",
        severity: "error",
        message: `Validation scenario ${scenario.id} must define setup, expected side effects, verification, and cleanup.`,
        source: scenario.id,
        evidence: scenario.evidence,
        suggestedAction: "Complete the mutating validation scenario before runtime invocation."
      }
    ];
  }

  if (risk === "HIGH_CONSEQUENCE" && scenario.safeTestEnvironment !== true) {
    return [
      {
        code: "RUNTIME_HIGH_CONSEQUENCE_ENVIRONMENT_MISSING",
        level: "runtime",
        severity: "error",
        message: `${operation.method} ${operation.path} is high consequence and requires a safe test environment or mock.`,
        source: scenario.id,
        evidence: scenario.evidence,
        suggestedAction:
          "Provide a user-supplied safe test environment or mock before validating this operation."
      }
    ];
  }

  return [];
}

function isReadOnlyMethod(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isSuccessfulRuntimeStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
