import type {
  StandardAdapter,
  StandardValidationContext,
  StandardValidationResult
} from "@descuff/standard-core";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateStaticStandardResults(
  results: StandardValidationResult[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const result of results) {
    for (const issue of result.issues) {
      issues.push({
        code: issue.code,
        level: "static",
        severity: issue.severity,
        message: issue.message,
        source: result.standardId,
        ...(issue.path === undefined ? {} : { path: issue.path }),
        evidence: issue.evidence,
        suggestedAction: `Repair ${result.standardId} output and rerun descuff validate.`
      });

      if (issue.code.length === 0 || issue.message.length === 0) {
        issues.push({
          code: "VALIDATION_FAILURE_UNTYPED",
          level: "static",
          severity: "error",
          message: "Validation failures must include a typed code and actionable message.",
          source: result.standardId,
          ...(issue.path === undefined ? {} : { path: issue.path }),
          evidence: issue.evidence,
          suggestedAction: "Return typed validation failures from the standard adapter."
        });
      }
    }
  }

  return createValidationSummary(issues);
}

export async function runStandardValidation(
  adapters: StandardAdapter[],
  context: StandardValidationContext
): Promise<ValidationSummary> {
  const results: StandardValidationResult[] = [];
  const issues: ValidationFailure[] = [];

  for (const adapter of adapters) {
    try {
      results.push(await adapter.validate(context));
    } catch (error) {
      issues.push({
        code: "STANDARD_VALIDATION_RUNNER_FAILED",
        level: "static",
        severity: "error",
        message: `${adapter.id} validation runner failed: ${errorMessage(error)}`,
        source: adapter.id,
        evidence: [],
        suggestedAction: "Fix the standard validation runner before trusting validation output."
      });
    }
  }

  const standardSummary = validateStaticStandardResults(results);
  return createValidationSummary([
    ...standardSummary.failures,
    ...standardSummary.warnings,
    ...issues
  ]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
