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
    readinessExplanations: explainReadiness(readiness),
    validation,
    ready: readiness.score === readiness.maxScore && validation.passed,
    blockers: validation.failures
  };
}

function explainReadiness(readiness: ReturnType<typeof scoreReadiness>): ReadinessExplanation[] {
  const lossesByCategory = new Map(
    readiness.lostPoints.map((loss) => [loss.category, loss] as const)
  );

  return (Object.keys(readiness.categoryScores) as ReadinessCategory[]).map((category) => {
    const loss = lossesByCategory.get(category);
    if (loss === undefined) {
      return {
        category,
        status: "complete",
        pointsLost: 0,
        message: "This readiness category has the available evidence Descuff expects.",
        action: "No action required.",
        evidenceIds: []
      };
    }

    return {
      category,
      status: readinessStatusForLoss(loss),
      pointsLost: loss.pointsLost,
      message: readinessMessageForLoss(loss),
      action: readinessActionForLoss(loss),
      evidenceIds: loss.evidenceIds
    };
  });
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
