import type { ValidationFailure, ValidationSummary } from "./types.js";

export function renderValidationSummaryDetails(summary: ValidationSummary): string {
  const lines: string[] = [];

  if (summary.failures.length === 0 && summary.warnings.length === 0) {
    return "";
  }

  if (summary.failures.length > 0) {
    lines.push("Failure details:");
    for (const failure of summary.failures) {
      lines.push(...renderIssueLines(failure));
    }
  }

  if (summary.warnings.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("Warning details:");
    for (const warning of summary.warnings) {
      lines.push(...renderIssueLines(warning));
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderIssueLines(issue: ValidationFailure): string[] {
  const location = issue.path === undefined ? issue.source : `${issue.source} ${issue.path}`;
  const evidenceIds = issue.evidence.map((ref) => ref.id).join(", ") || "none";

  return [
    `  - [${issue.code}] ${issue.level}/${issue.severity} ${location}`,
    `    ${issue.message}`,
    `    Action: ${issue.suggestedAction}`,
    `    Evidence: ${evidenceIds}`
  ];
}
