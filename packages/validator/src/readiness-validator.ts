import {
  scoreReadiness,
  type ApplicationModel,
  type ReadinessCategory,
  type ReadinessLossReason
} from "@descuff/ir";
import { mergeValidationSummaries } from "./summary.js";
import type {
  ReadinessExplanation,
  ReadinessExplanationStatus,
  ValidationReadinessReport,
  ValidationSummary
} from "./types.js";

export function createValidationReadinessReport(
  model: ApplicationModel,
  summaries: ValidationSummary[]
): ValidationReadinessReport {
  const validation = mergeValidationSummaries(summaries);
  const readiness = scoreReadiness(model);

  return {
    schemaVersion: "0.1.0",
    readiness,
    readinessExplanations: explainReadiness(readiness, model),
    validation,
    ready: readiness.score === readiness.maxScore && validation.passed,
    blockers: validation.failures
  };
}

function explainReadiness(
  readiness: ReturnType<typeof scoreReadiness>,
  model: ApplicationModel
): ReadinessExplanation[] {
  const lossesByCategory = new Map(
    readiness.lostPoints.map((loss) => [loss.category, loss] as const)
  );

  return (Object.keys(readiness.categoryScores) as ReadinessCategory[]).map((category) => {
    const loss = lossesByCategory.get(category);
    const context = readinessContextForCategory(category, model);
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
        evidenceIds: context.evidenceIds,
        affectedRoutes: context.affectedRoutes,
        affectedApis: context.affectedApis,
        affectedCapabilities: context.affectedCapabilities,
        affectedStandards: context.affectedStandards,
        scenarioIds: []
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
      evidenceIds: loss.evidenceIds.length > 0 ? loss.evidenceIds : context.evidenceIds,
      affectedRoutes: context.affectedRoutes,
      affectedApis: context.affectedApis,
      affectedCapabilities: context.affectedCapabilities,
      affectedStandards: context.affectedStandards,
      scenarioIds: []
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
