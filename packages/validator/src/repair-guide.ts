import type { ValidationFailure, ValidationSummary } from "./types.js";

export function renderValidationRepairGuide(summary: ValidationSummary): string {
  const lines = ["# Descuff Validation Repair Guide", ""];

  if (summary.failures.length === 0 && summary.warnings.length === 0) {
    lines.push("No validation repairs are required.", "");
    return lines.join("\n");
  }

  if (summary.failures.length > 0) {
    lines.push("## Blocking Failures", "");
    for (const failure of summary.failures) {
      lines.push(...renderRepairItem(failure), "");
    }
  }

  if (summary.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of summary.warnings) {
      lines.push(...renderRepairItem(warning), "");
    }
  }

  return lines.join("\n");
}

function renderRepairItem(failure: ValidationFailure): string[] {
  return [
    `### ${failure.code}`,
    "",
    `- Level: ${failure.level}`,
    `- Severity: ${failure.severity}`,
    `- Source: ${failure.source}`,
    `- Message: ${failure.message}`,
    `- Suggested action: ${failure.suggestedAction}`,
    `- Evidence: ${failure.evidence.map((ref) => ref.id).join(", ") || "none"}`
  ];
}
