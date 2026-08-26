import type {
  SourceFingerprintManifest,
  ValidationReadinessReport,
  ValidationSummary
} from "@descuff/validator";

export const driftBaselineSchemaVersion = "0.1.0";
export const driftResultSchemaVersion = "0.1.0";

export type DriftImpactKind =
  | "none"
  | "metadata"
  | "route"
  | "api"
  | "server-action"
  | "auth-boundary"
  | "model"
  | "runtime"
  | "unknown";

export type DriftStatus = "pass" | "needs-validation" | "fail";
export type DriftValidationDepth = "none" | "targeted-static" | "targeted-runtime" | "full";
export type DriftValidationSuite =
  | "none"
  | "static-generated-changes"
  | "static-standards"
  | "source-fingerprints"
  | "runtime-observations"
  | "webmcp-behavior"
  | "security-model"
  | "capability-confidence"
  | "full-validation";

export interface DriftBaseline {
  schemaVersion: string;
  producerVersion: string;
  recordedAt: string;
  project: {
    rootDir: string;
    framework: string;
  };
  sourceFingerprints: SourceFingerprintManifest;
  readiness: ValidationReadinessReport["readiness"];
  validation: ValidationReadinessReport["validation"];
  routes: DriftRouteIndexEntry[];
  apis: DriftApiIndexEntry[];
  capabilities: DriftCapabilityIndexEntry[];
  authBoundaries: DriftAuthBoundaryIndexEntry[];
  standards: DriftStandardIndexEntry[];
  contractFingerprints: DriftContractFingerprintEntry[];
  recommendedStandards: string[];
}

export interface DriftRouteIndexEntry {
  id: string;
  path: string;
  sourceFile: string;
  visibility: string;
  evidenceIds: string[];
}

export interface DriftApiIndexEntry {
  id: string;
  method: string;
  path: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface DriftCapabilityIndexEntry {
  id: string;
  name: string;
  operationType: string;
  risk: string;
  visibility: string;
  linkedRoutes: string[];
  linkedApis: string[];
  evidenceIds: string[];
  evidenceLocations: string[];
}

export interface DriftAuthBoundaryIndexEntry {
  id: string;
  kind: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface DriftStandardIndexEntry {
  id: string;
  kind: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface DriftContractFingerprintEntry {
  id: string;
  kind: string;
  sourceFile: string;
  sha256: string | null;
  missing: boolean;
  evidenceIds: string[];
}

export interface DriftDiffResult {
  schemaVersion: string;
  status: DriftStatus;
  changedFiles: string[];
  impacts: DriftImpact[];
  affectedCapabilities: DriftCapabilityIndexEntry[];
  affectedStandards: string[];
  validationDepth: DriftValidationDepth;
  failures: DriftFailure[];
  summary: string;
}

export interface DriftImpact {
  file: string;
  kind: DriftImpactKind;
  reason: string;
  evidenceIds: string[];
  affectedCapabilityIds: string[];
  affectedStandards: string[];
}

export interface DriftFailure {
  code: DriftFailureCode | string;
  message: string;
  file?: string;
  capabilityId?: string;
  affectedStandards: string[];
  suggestedAction: string;
}

export type DriftFailureCode =
  | "DRIFT_BASELINE_MISSING"
  | "DRIFT_BASELINE_MALFORMED"
  | "DRIFT_BASELINE_UNSUPPORTED"
  | "DRIFT_BASELINE_PROJECT_MISMATCH"
  | "DRIFT_BASELINE_STALE"
  | "DRIFT_IMPACT_UNKNOWN"
  | "AGENT_INTERFACE_DRIFT"
  | "CAPABILITY_REMOVED"
  | "CAPABILITY_SECURITY_BOUNDARY_CHANGED"
  | "MACHINE_CONTRACT_STALE"
  | "WEBMCP_TOOL_DISCONNECTED"
  | "OPENAPI_BEHAVIOR_MISMATCH"
  | "STRUCTURED_METADATA_STALE";

export interface DriftCheckResult {
  schemaVersion: string;
  status: DriftStatus;
  validationDepth: DriftValidationDepth;
  validationPlan?: DriftValidationPlan;
  diff: DriftDiffResult;
  validation?: ValidationSummary;
  failures: DriftFailure[];
  summary: string;
}

export interface DriftValidationPlan {
  schemaVersion: string;
  validationDepth: DriftValidationDepth;
  suites: DriftValidationSuite[];
  fullValidationFallback: boolean;
  reasons: string[];
}
