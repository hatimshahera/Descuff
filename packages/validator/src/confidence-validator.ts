import type { ApplicationModel } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateCapabilityConfidence(model: ApplicationModel): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const capability of model.capabilities) {
    if (
      capability.confidence !== "low" ||
      capability.operationType !== "read" ||
      capability.risk !== "PUBLIC_READ" ||
      capability.visibility !== "public"
    ) {
      continue;
    }

    issues.push({
      code: "CAPABILITY_CONFIDENCE_TOO_LOW",
      level: "static",
      severity: "error",
      message: `${capability.name} has low-confidence evidence and cannot be promoted into implementation recommendations.`,
      source: capability.id,
      evidence: capability.evidence,
      suggestedAction:
        "Confirm the capability with stronger source or runtime evidence before generating agent-facing standards from it."
    });
  }

  return createValidationSummary(issues);
}
