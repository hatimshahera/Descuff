import type {
  SourceFingerprintManifest,
  ValidationFailure,
  ValidationSummary
} from "@descuff/validator";
import {
  driftBaselineSchemaVersion,
  driftResultSchemaVersion,
  type DriftApiIndexEntry,
  type DriftBaseline,
  type DriftCapabilityIndexEntry,
  type DriftCheckResult,
  type DriftDiffResult,
  type DriftFailure,
  type DriftImpact,
  type DriftImpactKind,
  type DriftValidationDepth,
  type DriftValidationPlan
} from "./types.js";
import { normalizePath, uniqueSorted } from "./shared.js";

export interface DriftDiffInput {
  baseline: unknown;
  changedFiles: string[];
  projectRoot?: string;
}

export function analyzeDrift(input: DriftDiffInput): DriftDiffResult {
  const baselineResult = validateDriftBaseline(input.baseline, input.projectRoot);
  if (!baselineResult.valid) {
    return createDriftFailureResult(input.changedFiles, baselineResult.failures);
  }

  const baseline = baselineResult.baseline;
  const impacts = input.changedFiles
    .map((file) => classifyChangedFile(baseline, normalizePath(file)))
    .sort((a, b) => a.file.localeCompare(b.file));
  const relevantImpacts = impacts.filter((impact) => impact.kind !== "none");
  const affectedCapabilityIds = new Set(
    relevantImpacts.flatMap((impact) => impact.affectedCapabilityIds)
  );
  const affectedCapabilities = baseline.capabilities.filter((capability) =>
    affectedCapabilityIds.has(capability.id)
  );
  const affectedStandards = uniqueSorted(
    relevantImpacts.flatMap((impact) => impact.affectedStandards)
  );
  const failures = relevantImpacts.flatMap((impact) => driftFailuresForImpact(impact));
  const validationDepth = chooseValidationDepth(relevantImpacts);

  return {
    schemaVersion: driftResultSchemaVersion,
    status: relevantImpacts.length === 0 ? "pass" : "needs-validation",
    changedFiles: input.changedFiles.map(normalizePath).sort(),
    impacts,
    affectedCapabilities,
    affectedStandards,
    validationDepth,
    failures,
    summary:
      relevantImpacts.length === 0
        ? "No agent-facing capability changes detected."
        : `${relevantImpacts.length} agent-facing change impact(s) require validation.`
  };
}

export function createDriftCheckResult(
  diff: DriftDiffResult,
  validation?: ValidationSummary,
  validationPlan?: DriftValidationPlan
): DriftCheckResult {
  const planProperties = validationPlan === undefined ? {} : { validationPlan };

  if (diff.status === "fail") {
    return {
      schemaVersion: driftResultSchemaVersion,
      status: "fail",
      validationDepth: diff.validationDepth,
      ...planProperties,
      diff,
      failures: diff.failures,
      summary: diff.summary
    };
  }

  if (diff.status === "pass") {
    return {
      schemaVersion: driftResultSchemaVersion,
      status: "pass",
      validationDepth: "none",
      ...planProperties,
      diff,
      failures: [],
      summary: "No agent-facing capability changes detected."
    };
  }

  if (validation === undefined) {
    return {
      schemaVersion: driftResultSchemaVersion,
      status: "needs-validation",
      validationDepth: diff.validationDepth,
      ...planProperties,
      diff,
      failures: diff.failures,
      summary: diff.summary
    };
  }

  const validationFailures = validation.failures.map(validationFailureToDriftFailure);
  return {
    schemaVersion: driftResultSchemaVersion,
    status: validation.passed ? "pass" : "fail",
    validationDepth: diff.validationDepth,
    ...planProperties,
    diff,
    validation,
    failures: validation.passed ? [] : validationFailures,
    summary: validation.passed
      ? "Agent-facing changes were validated successfully."
      : "Agent-facing drift detected during validation."
  };
}

export function changedFilesFromFingerprints(
  baseline: DriftBaseline,
  current: SourceFingerprintManifest
): string[] {
  const recordedByPath = new Map(
    baseline.sourceFingerprints.files.map((file) => [file.path, file])
  );
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));
  const paths = new Set([...recordedByPath.keys(), ...currentByPath.keys()]);
  const changed: string[] = [];

  for (const path of paths) {
    const recorded = recordedByPath.get(path);
    const currentFile = currentByPath.get(path);
    if (
      recorded === undefined ||
      currentFile === undefined ||
      recorded.missing !== currentFile.missing ||
      recorded.sha256 !== currentFile.sha256
    ) {
      changed.push(path);
    }
  }

  return changed.sort();
}

export function createMissingDriftBaselineResult(changedFiles: string[] = []): DriftDiffResult {
  return createDriftFailureResult(changedFiles, [
    {
      code: "DRIFT_BASELINE_MISSING",
      message: "No drift baseline exists for this project.",
      affectedStandards: [],
      suggestedAction:
        "Run `npx descuff start .` or `npx descuff finish .` after validation passes."
    }
  ]);
}

export function validateDriftBaseline(
  baseline: unknown,
  projectRoot?: string
): { valid: true; baseline: DriftBaseline } | { valid: false; failures: DriftFailure[] } {
  if (!isRecord(baseline)) {
    return {
      valid: false,
      failures: [
        {
          code: "DRIFT_BASELINE_MALFORMED",
          message: "Drift baseline must be a JSON object.",
          affectedStandards: [],
          suggestedAction: "Regenerate the drift baseline with the current Descuff version."
        }
      ]
    };
  }

  if (baseline.schemaVersion !== driftBaselineSchemaVersion) {
    return {
      valid: false,
      failures: [
        {
          code: "DRIFT_BASELINE_UNSUPPORTED",
          message: `Unsupported drift baseline schema version: ${String(baseline.schemaVersion)}`,
          affectedStandards: [],
          suggestedAction: "Regenerate the drift baseline with the current Descuff version."
        }
      ]
    };
  }

  const requiredArrayFields = [
    "routes",
    "apis",
    "capabilities",
    "authBoundaries",
    "standards",
    "contractFingerprints",
    "recommendedStandards"
  ];
  const malformedField = requiredArrayFields.find((field) => !Array.isArray(baseline[field]));
  const project = baseline.project;
  const sourceFingerprints = baseline.sourceFingerprints;
  if (
    malformedField !== undefined ||
    !isRecord(project) ||
    typeof project.rootDir !== "string" ||
    typeof project.framework !== "string" ||
    !isRecord(sourceFingerprints) ||
    !Array.isArray(sourceFingerprints.files)
  ) {
    return {
      valid: false,
      failures: [
        {
          code: "DRIFT_BASELINE_MALFORMED",
          message: "Drift baseline is missing required project, fingerprint, or index fields.",
          affectedStandards: [],
          suggestedAction: "Regenerate the drift baseline with the current Descuff version."
        }
      ]
    };
  }

  if (projectRoot !== undefined && normalizePath(project.rootDir) !== normalizePath(projectRoot)) {
    return {
      valid: false,
      failures: [
        {
          code: "DRIFT_BASELINE_PROJECT_MISMATCH",
          message: `Drift baseline was recorded for ${project.rootDir}, not ${projectRoot}.`,
          affectedStandards: [],
          suggestedAction: "Regenerate the drift baseline from the current project root."
        }
      ]
    };
  }

  return { valid: true, baseline: baseline as unknown as DriftBaseline };
}

function createDriftFailureResult(
  changedFiles: string[],
  failures: DriftFailure[]
): DriftDiffResult {
  return {
    schemaVersion: driftResultSchemaVersion,
    status: "fail",
    changedFiles: changedFiles.map(normalizePath).sort(),
    impacts: [],
    affectedCapabilities: [],
    affectedStandards: [],
    validationDepth: "none",
    failures,
    summary: "Drift baseline is not usable."
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyChangedFile(baseline: DriftBaseline, file: string): DriftImpact {
  const directStandard = standardFromMetadataPath(file);
  if (directStandard !== undefined) {
    return impact(
      file,
      "metadata",
      `Machine-facing ${directStandard} metadata changed.`,
      [],
      [],
      [directStandard]
    );
  }

  const authBoundary = baseline.authBoundaries.find((entry) => entry.sourceFile === file);
  if (authBoundary !== undefined || isAuthBoundaryPath(file)) {
    return impact(
      file,
      "auth-boundary",
      "Authentication or authorization boundary changed.",
      authBoundary?.evidenceIds ?? [],
      capabilitiesForEvidenceLocation(baseline, file).map((capability) => capability.id),
      standardsForImpact("auth-boundary")
    );
  }

  const api = baseline.apis.find((entry) => entry.sourceFile === file);
  if (api !== undefined || isLikelyApiPath(file)) {
    const capabilities = capabilitiesForApiOrFile(baseline, api, file);
    return impact(
      file,
      "api",
      api === undefined ? "API route source changed." : `${api.method} ${api.path} changed.`,
      api?.evidenceIds ?? [],
      capabilities.map((capability) => capability.id),
      standardsForImpact("api", capabilities)
    );
  }

  const serverActionCapabilities = capabilitiesForEvidenceLocation(baseline, file).filter(
    (capability) =>
      capability.operationType === "write" ||
      capability.id.includes("action") ||
      capability.name.toLowerCase().includes("action")
  );
  if (serverActionCapabilities.length > 0 || isLikelyServerActionPath(file)) {
    return impact(
      file,
      "server-action",
      "Server Action source changed.",
      [],
      serverActionCapabilities.map((capability) => capability.id),
      standardsForImpact("server-action", serverActionCapabilities)
    );
  }

  const route = baseline.routes.find((entry) => entry.sourceFile === file);
  if (route !== undefined || isLikelyRoutePath(file)) {
    return impact(
      file,
      "route",
      route === undefined ? "Route source changed." : `Route ${route.path} changed.`,
      route?.evidenceIds ?? [],
      capabilitiesForEvidenceLocation(baseline, file).map((capability) => capability.id),
      standardsForImpact("route")
    );
  }

  if (isLikelyModelPath(file)) {
    const capabilities = capabilitiesForEvidenceLocation(baseline, file);
    return impact(
      file,
      "model",
      "Model, repository, schema, or response-shape source changed.",
      [],
      capabilities.map((capability) => capability.id),
      standardsForImpact("model", capabilities)
    );
  }

  if (isClearlyIrrelevantPath(file)) {
    return impact(
      file,
      "none",
      "Changed file is not part of known agent-facing evidence.",
      [],
      [],
      []
    );
  }

  return impact(
    file,
    "unknown",
    "Changed file could not be classified safely.",
    [],
    [],
    ["llms-txt", "schema-org", "openapi", "api-catalog", "webmcp"]
  );
}

function impact(
  file: string,
  kind: DriftImpactKind,
  reason: string,
  evidenceIds: string[],
  affectedCapabilityIds: string[],
  affectedStandards: string[]
): DriftImpact {
  return {
    file,
    kind,
    reason,
    evidenceIds: uniqueSorted(evidenceIds),
    affectedCapabilityIds: uniqueSorted(affectedCapabilityIds),
    affectedStandards: uniqueSorted(affectedStandards)
  };
}

function driftFailuresForImpact(impactItem: DriftImpact): DriftFailure[] {
  if (impactItem.kind === "none") {
    return [];
  }

  const code =
    impactItem.kind === "auth-boundary"
      ? "CAPABILITY_SECURITY_BOUNDARY_CHANGED"
      : impactItem.kind === "unknown"
        ? "DRIFT_IMPACT_UNKNOWN"
        : "AGENT_INTERFACE_DRIFT";

  return [
    {
      code,
      message: `${impactItem.reason} Affected standards: ${impactItem.affectedStandards.join(", ") || "unknown"}.`,
      file: impactItem.file,
      affectedStandards: impactItem.affectedStandards,
      suggestedAction:
        impactItem.kind === "unknown"
          ? "Run full Descuff validation or classify this file in the drift subsystem."
          : "Run targeted Descuff validation and update affected machine-facing interfaces if stale."
    }
  ];
}

function validationFailureToDriftFailure(failure: ValidationFailure): DriftFailure {
  return {
    code: failure.code,
    message: failure.message,
    file: failure.path ?? failure.source,
    affectedStandards: [],
    suggestedAction: failure.suggestedAction
  };
}

function chooseValidationDepth(impacts: DriftImpact[]): DriftValidationDepth {
  if (impacts.length === 0) {
    return "none";
  }

  if (impacts.some((item) => item.kind === "unknown" || item.kind === "auth-boundary")) {
    return "full";
  }

  if (impacts.some((item) => ["api", "runtime", "route", "server-action"].includes(item.kind))) {
    return "targeted-runtime";
  }

  return "targeted-static";
}

function capabilitiesForApiOrFile(
  baseline: DriftBaseline,
  api: DriftApiIndexEntry | undefined,
  file: string
): DriftCapabilityIndexEntry[] {
  const apiKey = api === undefined ? undefined : `${api.method} ${api.path}`;
  return baseline.capabilities.filter(
    (capability) =>
      capability.evidenceLocations.includes(file) ||
      (apiKey !== undefined && capability.linkedApis.includes(apiKey))
  );
}

function capabilitiesForEvidenceLocation(
  baseline: DriftBaseline,
  file: string
): DriftCapabilityIndexEntry[] {
  return baseline.capabilities.filter((capability) => capability.evidenceLocations.includes(file));
}

function standardsForImpact(
  kind: DriftImpactKind,
  capabilities: DriftCapabilityIndexEntry[] = []
): string[] {
  if (kind === "metadata") {
    return [];
  }

  const standards = new Set<string>();
  if (kind === "route" || kind === "auth-boundary" || kind === "model" || kind === "unknown") {
    standards.add("llms-txt");
    standards.add("schema-org");
  }
  if (kind === "api" || kind === "auth-boundary" || kind === "model" || kind === "unknown") {
    standards.add("openapi");
    standards.add("api-catalog");
  }
  if (
    kind === "api" ||
    kind === "server-action" ||
    kind === "runtime" ||
    kind === "auth-boundary" ||
    kind === "unknown" ||
    capabilities.some(
      (capability) => capability.operationType === "read" && capability.visibility === "public"
    )
  ) {
    standards.add("webmcp");
  }
  return [...standards].sort();
}

function standardFromMetadataPath(file: string): string | undefined {
  if (file === "public/llms.txt" || file === "llms.txt") return "llms-txt";
  if (file.endsWith("openapi.json") || file.endsWith("openapi.yaml")) return "openapi";
  if (file.endsWith(".well-known/api-catalog")) return "api-catalog";
  if (file.endsWith("schema-org.jsonld")) return "schema-org";
  if (file.endsWith("webmcp.json") || file.endsWith("webmcp-implementation-plan.md")) {
    return "webmcp";
  }
  return undefined;
}

function isAuthBoundaryPath(file: string): boolean {
  return /(^|\/)(middleware|proxy)\.(ts|tsx|js|jsx)$/.test(file) || file.includes("auth");
}

function isLikelyApiPath(file: string): boolean {
  return /(^|\/)api\/.*\/route\.(ts|js)$/.test(file) || /(^|\/)pages\/api\//.test(file);
}

function isLikelyServerActionPath(file: string): boolean {
  return file.endsWith("actions.ts") || file.endsWith("actions.js") || file.includes("/actions/");
}

function isLikelyRoutePath(file: string): boolean {
  return (
    /(^|\/)(page|layout)\.(tsx|jsx|ts|js)$/.test(file) ||
    /(^|\/)pages\/.+\.(tsx|jsx|ts|js)$/.test(file)
  );
}

function isLikelyModelPath(file: string): boolean {
  return /(schema|model|repository|serializer|validator|prisma|drizzle|database|db)/i.test(file);
}

function isClearlyIrrelevantPath(file: string): boolean {
  return (
    /\.(css|scss|sass|less|md|mdx|png|jpg|jpeg|gif|svg|webp|ico)$/.test(file) ||
    file.startsWith(".descuff/") ||
    file.startsWith(".github/") ||
    file.startsWith("test/") ||
    file.startsWith("tests/") ||
    file.includes("/test/") ||
    file.includes("/tests/")
  );
}
