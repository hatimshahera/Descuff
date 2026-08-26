import type {
  ApiOperation,
  ApplicationModel,
  AuthenticationBoundaryModel,
  Capability,
  EvidenceRef,
  ExistingStandardModel,
  Route
} from "@descuff/ir";
import type { StandardAssessment } from "@descuff/standard-core";
import type { SourceFingerprintManifest, ValidationReadinessReport } from "@descuff/validator";
import {
  driftBaselineSchemaVersion,
  type DriftApiIndexEntry,
  type DriftAuthBoundaryIndexEntry,
  type DriftBaseline,
  type DriftCapabilityIndexEntry,
  type DriftRouteIndexEntry,
  type DriftStandardIndexEntry
} from "./types.js";
import { normalizePath, uniqueSorted } from "./shared.js";

export interface DriftBaselineInput {
  model: ApplicationModel;
  assessments: StandardAssessment[];
  sourceFingerprints: SourceFingerprintManifest;
  validationReport: ValidationReadinessReport;
  producerVersion?: string;
}

export function createDriftBaseline(input: DriftBaselineInput): DriftBaseline {
  return {
    schemaVersion: driftBaselineSchemaVersion,
    producerVersion: input.producerVersion ?? "unknown",
    recordedAt: new Date(0).toISOString(),
    project: {
      rootDir: input.model.project.rootDir,
      framework: input.model.project.framework
    },
    sourceFingerprints: input.sourceFingerprints,
    readiness: input.validationReport.readiness,
    validation: input.validationReport.validation,
    routes: input.model.routes.map(indexRoute).sort(byId),
    apis: input.model.apis.map(indexApi).sort(byId),
    capabilities: input.model.capabilities.map(indexCapability).sort(byId),
    authBoundaries: input.model.authentication.boundaries.map(indexAuthBoundary).sort(byId),
    standards: input.model.standards.map(indexStandard).sort(byId),
    recommendedStandards: input.assessments
      .filter((assessment) => ["required", "recommended"].includes(assessment.applicability))
      .map((assessment) => assessment.standardId)
      .sort()
  };
}

function indexRoute(route: Route): DriftRouteIndexEntry {
  return {
    id: route.id,
    path: route.path,
    sourceFile: route.sourceFile,
    visibility: route.visibility ?? "unknown",
    evidenceIds: evidenceIds(route.evidence)
  };
}

function indexApi(api: ApiOperation): DriftApiIndexEntry {
  return {
    id: api.id,
    method: api.method,
    path: api.path,
    sourceFile: api.sourceFile,
    evidenceIds: evidenceIds(api.evidence)
  };
}

function indexCapability(capability: Capability): DriftCapabilityIndexEntry {
  return {
    id: capability.id,
    name: capability.name,
    operationType: capability.operationType,
    risk: capability.risk,
    visibility: capability.visibility,
    linkedRoutes: capability.linkedRoutes.slice().sort(),
    linkedApis: capability.linkedApis.slice().sort(),
    evidenceIds: evidenceIds(capability.evidence),
    evidenceLocations: evidenceLocations(capability.evidence)
  };
}

function indexAuthBoundary(boundary: AuthenticationBoundaryModel): DriftAuthBoundaryIndexEntry {
  return {
    id: boundary.id,
    kind: boundary.kind,
    sourceFile: boundary.sourceFile,
    evidenceIds: evidenceIds(boundary.evidence)
  };
}

function indexStandard(standard: ExistingStandardModel): DriftStandardIndexEntry {
  return {
    id: standard.id,
    kind: standard.kind,
    sourceFile: standard.sourceFile,
    evidenceIds: evidenceIds(standard.evidence)
  };
}

function evidenceIds(evidence: EvidenceRef[]): string[] {
  return uniqueSorted(evidence.map((ref) => ref.id));
}

function evidenceLocations(evidence: EvidenceRef[]): string[] {
  return uniqueSorted(
    evidence.filter((ref) => ref.kind === "source").map((ref) => normalizePath(ref.location))
  );
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}
