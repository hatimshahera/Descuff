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
  code: string;
  message: string;
  file?: string;
  capabilityId?: string;
  affectedStandards: string[];
  suggestedAction: string;
}

export interface DriftCheckResult {
  schemaVersion: string;
  status: DriftStatus;
  validationDepth: DriftValidationDepth;
  diff: DriftDiffResult;
  validation?: ValidationSummary;
  failures: DriftFailure[];
  summary: string;
}
