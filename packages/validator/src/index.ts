import type { EvidenceRef } from "@descuff/ir";
import type { GeneratedChange, StandardValidationResult } from "@descuff/standard-core";

export type ValidationLevel =
  "static" | "build" | "existing-tests" | "runtime" | "security" | "regression";
export type ValidationSeverity = "error" | "warning";

export interface ValidationFailure {
  code: string;
  level: ValidationLevel;
  severity: ValidationSeverity;
  message: string;
  source: string;
  path?: string;
  evidence: EvidenceRef[];
  suggestedAction: string;
}

export interface ValidationSummary {
  passed: boolean;
  failures: ValidationFailure[];
  warnings: ValidationFailure[];
}

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

export function validateStaticGeneratedChanges(changes: GeneratedChange[]): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const change of changes) {
    if (change.path.trim().length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_PATH_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include a target path.",
        source: change.standardId,
        evidence: change.evidence,
        suggestedAction: "Regenerate the standard change with a deterministic target path."
      });
    }

    if (change.evidence.length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_EVIDENCE_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include evidence before it can be validated.",
        source: change.standardId,
        path: change.path,
        evidence: [],
        suggestedAction: "Attach source or runtime evidence to the generated change."
      });
    }

    if (change.safety === "automatic" && !change.deterministic) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_UNSAFE_AUTOMATIC",
        level: "static",
        severity: "error",
        message: "Automatic generated changes must be deterministic.",
        source: change.standardId,
        path: change.path,
        evidence: change.evidence,
        suggestedAction: "Mark the change approval-required or make generation deterministic."
      });
    }
  }

  return createValidationSummary(issues);
}
