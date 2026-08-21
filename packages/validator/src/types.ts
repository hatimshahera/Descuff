import type { EvidenceRef, HttpMethod, ReadinessScore } from "@descuff/ir";

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
