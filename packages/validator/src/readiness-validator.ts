import {
  scoreReadiness,
  type ApplicationModel,
  type ReadinessCategory,
  type ReadinessLossReason
} from "@descuff/ir";
import { createValidationSummary, mergeValidationSummaries } from "./summary.js";
import type {
  ReadinessExplanation,
  ReadinessExplanationStatus,
  ValidationFailure,
  ValidationReadinessContext,
  ValidationReadinessReport,
  ValidationSummary
} from "./types.js";

export function createValidationReadinessReport(
  model: ApplicationModel,
  summaries: ValidationSummary[],
  context: ValidationReadinessContext = {}
): ValidationReadinessReport {
  const readiness = scoreReadiness(model);
  const readinessExplanations = explainReadiness(readiness, model, context);
  const validation = mergeValidationSummaries([
    ...summaries,
    validateReadinessExplanations(readinessExplanations)
  ]);

  return {
    schemaVersion: "0.1.0",
    readiness,
    readinessExplanations,
    validation,
    ready: readiness.score === readiness.maxScore && validation.passed,
    blockers: validation.failures
  };
}

export function validateReadinessExplanations(
  explanations: ReadinessExplanation[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const explanation of explanations) {
    if (readinessExplanationHasContext(explanation)) {
      continue;
    }

    issues.push({
      code: "READINESS_EXPLANATION_MISSING_EVIDENCE",
      level: "static",
      severity: "error",
      message: `Readiness explanation ${explanation.category} has no evidence, affected surface, or scenario context.`,
      source: explanation.category,
      evidence: [],
      suggestedAction:
        "Attach source evidence, affected routes/APIs/capabilities/standards, or related browser-agent scenarios before publishing the readiness explanation."
    });
  }

  return createValidationSummary(issues);
}

function explainReadiness(
  readiness: ReturnType<typeof scoreReadiness>,
  model: ApplicationModel,
  validationContext: ValidationReadinessContext
): ReadinessExplanation[] {
  const lossesByCategory = new Map(
    readiness.lostPoints.map((loss) => [loss.category, loss] as const)
  );

  return (Object.keys(readiness.categoryScores) as ReadinessCategory[]).map((category) => {
    const loss = lossesByCategory.get(category);
    const context = readinessContextForCategory(category, model);
    const scenarioIds = readinessScenarioIdsForCategory(category, validationContext);
    if (loss === undefined) {
      return {
        category,
        status: "complete",
        pointsLost: 0,
        scoreImpact: 0,
        confidence: context.confidence,
        message: "This readiness category has the available evidence Descuff expects.",
        action: "No action required.",
        expectedImpact: "No readiness points are currently lost for this category.",
        scenarioImpact: readinessScenarioImpact(category, scenarioIds),
        evidenceIds: context.evidenceIds,
        affectedRoutes: context.affectedRoutes,
        affectedApis: context.affectedApis,
        affectedCapabilities: context.affectedCapabilities,
        affectedStandards: context.affectedStandards,
        scenarioIds
      };
    }

    return {
      category,
      status: readinessStatusForLoss(loss),
      pointsLost: loss.pointsLost,
      scoreImpact: -loss.pointsLost,
      confidence: context.confidence,
      message: readinessMessageForLoss(loss),
      action: readinessActionForLoss(loss),
      expectedImpact: readinessExpectedImpactForLoss(loss),
      scenarioImpact: readinessScenarioImpact(category, scenarioIds),
      evidenceIds: loss.evidenceIds.length > 0 ? loss.evidenceIds : context.evidenceIds,
      affectedRoutes: context.affectedRoutes,
      affectedApis: context.affectedApis,
      affectedCapabilities: context.affectedCapabilities,
      affectedStandards: context.affectedStandards,
      scenarioIds
    };
  });
}

function readinessContextForCategory(
  category: ReadinessCategory,
  model: ApplicationModel
): {
  confidence: "high" | "medium" | "low";
  evidenceIds: string[];
  affectedRoutes: string[];
  affectedApis: string[];
  affectedCapabilities: string[];
  affectedStandards: string[];
} {
  switch (category) {
    case "discoverability":
      return {
        confidence: model.standards.length > 0 ? "high" : "medium",
        evidenceIds: evidenceIds(model.standards.flatMap((standard) => standard.evidence)),
        affectedRoutes: model.routes.map((route) => route.path),
        affectedApis: model.apis.map((api) => `${api.method} ${api.path}`),
        affectedCapabilities: model.capabilities.map((capability) => capability.id),
        affectedStandards: model.standards.map((standard) => standard.kind)
      };
    case "structured-content":
      return {
        confidence: model.entities.length > 0 ? "high" : "medium",
        evidenceIds: evidenceIds(model.entities.flatMap((entity) => entity.evidence)),
        affectedRoutes: model.routes.map((route) => route.path),
        affectedApis: [],
        affectedCapabilities: [],
        affectedStandards: standardsOfKind(model, ["schema-org"])
      };
    case "agent-actions":
      return {
        confidence: model.capabilities.length > 0 ? "high" : "medium",
        evidenceIds: evidenceIds(model.capabilities.flatMap((capability) => capability.evidence)),
        affectedRoutes: unique(model.capabilities.flatMap((capability) => capability.linkedRoutes)),
        affectedApis: unique(model.capabilities.flatMap((capability) => capability.linkedApis)),
        affectedCapabilities: model.capabilities.map((capability) => capability.id),
        affectedStandards: standardsOfKind(model, ["webmcp", "openapi", "api-catalog"])
      };
    case "api-quality":
      return {
        confidence: model.apis.length > 0 ? "high" : "medium",
        evidenceIds: evidenceIds(model.apis.flatMap((api) => api.evidence)),
        affectedRoutes: [],
        affectedApis: model.apis.map((api) => `${api.method} ${api.path}`),
        affectedCapabilities: model.capabilities
          .filter((capability) => capability.linkedApis.length > 0)
          .map((capability) => capability.id),
        affectedStandards: standardsOfKind(model, ["openapi", "api-catalog"])
      };
    case "semantic-metadata":
      return {
        confidence: model.standards.some((standard) => standard.kind === "schema-org")
          ? "high"
          : "medium",
        evidenceIds: evidenceIds(
          model.standards
            .filter((standard) => standard.kind === "schema-org")
            .flatMap((standard) => standard.evidence)
        ),
        affectedRoutes: model.routes.map((route) => route.path),
        affectedApis: [],
        affectedCapabilities: [],
        affectedStandards: standardsOfKind(model, ["schema-org"])
      };
    case "security":
      return {
        confidence: model.capabilities.length > 0 ? "high" : "medium",
        evidenceIds: evidenceIds(
          model.capabilities
            .filter((capability) => capability.risk === "HIGH_CONSEQUENCE")
            .flatMap((capability) => capability.evidence)
        ),
        affectedRoutes: unique(
          model.capabilities
            .filter((capability) => capability.risk === "HIGH_CONSEQUENCE")
            .flatMap((capability) => capability.linkedRoutes)
        ),
        affectedApis: unique(
          model.capabilities
            .filter((capability) => capability.risk === "HIGH_CONSEQUENCE")
            .flatMap((capability) => capability.linkedApis)
        ),
        affectedCapabilities: model.capabilities
          .filter((capability) => capability.risk === "HIGH_CONSEQUENCE")
          .map((capability) => capability.id),
        affectedStandards: standardsOfKind(model, ["webmcp", "openapi", "api-catalog"])
      };
    case "runtime-correctness":
      return {
        confidence:
          model.routes.some((route) => route.runtimeObserved) ||
          model.apis.some((api) => api.runtimeObserved)
            ? "high"
            : "low",
        evidenceIds: evidenceIds([
          ...model.routes
            .filter((route) => route.runtimeObserved)
            .flatMap((route) => route.evidence),
          ...model.apis.filter((api) => api.runtimeObserved).flatMap((api) => api.evidence)
        ]),
        affectedRoutes: model.routes.map((route) => route.path),
        affectedApis: model.apis.map((api) => `${api.method} ${api.path}`),
        affectedCapabilities: model.capabilities.map((capability) => capability.id),
        affectedStandards: model.standards.map((standard) => standard.kind)
      };
  }
}

function readinessStatusForLoss(loss: ReadinessLossReason): ReadinessExplanationStatus {
  if (loss.reason === "High-consequence capability requires explicit safety handling.") {
    return "blocker";
  }

  if (
    loss.reason === "No API operations identified." ||
    loss.reason === "No capabilities identified." ||
    loss.reason === "No entities identified."
  ) {
    return "acceptable-gap";
  }

  return "recommendation";
}

function readinessMessageForLoss(loss: ReadinessLossReason): string {
  if (loss.reason === "No API operations identified.") {
    return "No API operations were identified. This can be acceptable for intentionally static sites.";
  }

  if (loss.reason === "No capabilities identified.") {
    return "No agent-usable capabilities were identified. This can be acceptable when the site is purely informational.";
  }

  if (loss.reason === "No entities identified.") {
    return "No structured domain entities were identified. Add structured content only when the app has real products, articles, places, events, workspaces, bookings, or similar entities.";
  }

  if (loss.reason === "No existing standards detected.") {
    return "No existing agent-facing standards were detected.";
  }

  if (loss.reason === "No Schema.org JSON-LD detected.") {
    return "No Schema.org JSON-LD was detected for public structured content.";
  }

  if (loss.reason === "No runtime evidence correlated with semantic model.") {
    return "No runtime evidence was correlated with the semantic model. Runtime proof improves confidence but does not mean source analysis failed.";
  }

  return loss.reason;
}

function readinessActionForLoss(loss: ReadinessLossReason): string {
  if (loss.reason === "No API operations identified.") {
    return "No action is required when the site intentionally has no public API.";
  }

  if (loss.reason === "No capabilities identified.") {
    return "No action is required when the site intentionally has no public agent-usable actions.";
  }

  if (loss.reason === "No entities identified.") {
    return "Add evidence-backed structured content only if the app has real public entities to describe.";
  }

  if (loss.reason === "No existing standards detected.") {
    return "Run descuff start and implement the applicable generated standards plan.";
  }

  if (loss.reason === "No Schema.org JSON-LD detected.") {
    return "Add Schema.org JSON-LD only where public structured entities exist.";
  }

  if (loss.reason === "No runtime evidence correlated with semantic model.") {
    return "Configure read-only runtime validation when browser/API proof is required.";
  }

  if (loss.reason === "High-consequence capability requires explicit safety handling.") {
    return "Add an explicit safe validation scenario or keep the capability out of public agent-facing standards.";
  }

  return "Inspect the evidence and update the generated plan conservatively.";
}

function readinessExpectedImpactForLoss(loss: ReadinessLossReason): string {
  if (
    loss.reason === "No API operations identified." ||
    loss.reason === "No capabilities identified." ||
    loss.reason === "No entities identified."
  ) {
    return `Could recover up to ${loss.pointsLost} readiness points if the app actually has evidence-backed public surface area for this category. No change is required for intentionally simple sites.`;
  }

  if (loss.reason === "High-consequence capability requires explicit safety handling.") {
    return `Could recover ${loss.pointsLost} readiness points only after explicit safety handling proves the capability should be represented to agents.`;
  }

  return `Could recover ${loss.pointsLost} readiness points after the recommended evidence-backed repair is implemented and validated.`;
}

function readinessScenarioIdsForCategory(
  category: ReadinessCategory,
  context: ValidationReadinessContext
): string[] {
  const benchmarks = context.browserAgentBenchmarks ?? [];
  const scenarios = context.browserAgentScenarios ?? [];
  const scenarioIds = new Set<string>();
  const relevantSurfaces = evidenceSurfacesForReadinessCategory(category);

  for (const benchmark of benchmarks) {
    if (category === "runtime-correctness") {
      scenarioIds.add(scenarioIdForBenchmark(benchmark.id));
      continue;
    }

    if (benchmark.after.evidenceSurfaces.some((surface) => relevantSurfaces.has(surface))) {
      scenarioIds.add(scenarioIdForBenchmark(benchmark.id));
    }
  }

  for (const scenario of scenarios) {
    if (category === "runtime-correctness") {
      scenarioIds.add(scenario.id);
      continue;
    }

    if (scenario.expectedEvidenceSurfaces.some((surface) => relevantSurfaces.has(surface))) {
      scenarioIds.add(scenario.id);
    }
  }

  return [...scenarioIds].sort();
}

function evidenceSurfacesForReadinessCategory(category: ReadinessCategory): Set<string> {
  switch (category) {
    case "discoverability":
      return new Set(["llms-txt", "json-ld", "openapi", "api-catalog", "webmcp"]);
    case "structured-content":
    case "semantic-metadata":
      return new Set(["json-ld"]);
    case "agent-actions":
      return new Set(["openapi", "api-catalog", "webmcp"]);
    case "api-quality":
      return new Set(["openapi", "api-catalog", "network"]);
    case "security":
      return new Set(["webmcp", "openapi", "api-catalog"]);
    case "runtime-correctness":
      return new Set(["dom", "accessibility", "json-ld", "network", "webmcp"]);
  }
}

function scenarioIdForBenchmark(benchmarkId: string): string {
  return benchmarkId.split(":").at(-1) ?? benchmarkId;
}

function readinessScenarioImpact(category: ReadinessCategory, scenarioIds: string[]): string {
  if (scenarioIds.length === 0) {
    return "No browser-agent scenarios are currently linked to this readiness category.";
  }

  if (category === "runtime-correctness") {
    return `${scenarioIds.length} browser-agent scenario(s) depend on runtime evidence for this category.`;
  }

  return `${scenarioIds.length} browser-agent scenario(s) use evidence related to this category.`;
}

function readinessExplanationHasContext(explanation: ReadinessExplanation): boolean {
  if (explanation.status === "complete") {
    return true;
  }

  return (
    explanation.evidenceIds.length > 0 ||
    explanation.affectedRoutes.length > 0 ||
    explanation.affectedApis.length > 0 ||
    explanation.affectedCapabilities.length > 0 ||
    explanation.affectedStandards.length > 0 ||
    explanation.scenarioIds.length > 0
  );
}

function evidenceIds(evidence: Array<{ id: string }>): string[] {
  return unique(evidence.map((item) => item.id));
}

function standardsOfKind(model: ApplicationModel, kinds: string[]): string[] {
  const allowed = new Set(kinds);
  return unique(
    model.standards
      .filter((standard) => allowed.has(standard.kind))
      .map((standard) => standard.kind)
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
