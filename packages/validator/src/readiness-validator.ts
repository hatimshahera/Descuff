import { scoreReadiness, type ApplicationModel } from "@descuff/ir";
import { mergeValidationSummaries } from "./summary.js";
import type { ValidationReadinessReport, ValidationSummary } from "./types.js";

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
