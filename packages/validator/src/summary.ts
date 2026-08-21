import type { ValidationFailure, ValidationSummary } from "./types.js";

export function createEmptyValidationSummary(): ValidationSummary {
  return {
    passed: true,
    failures: [],
    warnings: []
  };
}

export function createValidationSummary(issues: ValidationFailure[]): ValidationSummary {
  const failures = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    passed: failures.length === 0,
    failures,
    warnings
  };
}

export function mergeValidationSummaries(summaries: ValidationSummary[]): ValidationSummary {
  return createValidationSummary(
    summaries.flatMap((summary) => [...summary.failures, ...summary.warnings])
  );
}
