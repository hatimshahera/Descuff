import type { DriftCheckResult, DriftDiffResult } from "./types.js";

export function renderDriftReport(result: DriftDiffResult | DriftCheckResult): string {
  const diff = "diff" in result ? result.diff : result;
  const failures = result.failures;

  const lines = [
    "# Descuff Drift Report",
    "",
    `Status: ${result.status}`,
    `Summary: ${result.summary}`,
    `Validation depth: ${result.validationDepth}`,
    "",
    "## Changed Files",
    ""
  ];

  if (diff.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...diff.changedFiles.map((file) => `- ${file}`));
  }

  lines.push("", "## Impacts", "");
  if (diff.impacts.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...diff.impacts.map(
        (impact) =>
          `- ${impact.kind}: ${impact.file} (${impact.reason}; standards: ${impact.affectedStandards.join(", ") || "none"})`
      )
    );
  }

  lines.push("", "## Affected Capabilities", "");
  if (diff.affectedCapabilities.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...diff.affectedCapabilities.map(
        (capability) => `- ${capability.name}: ${capability.risk} (${capability.visibility})`
      )
    );
  }

  const plan = "validationPlan" in result ? result.validationPlan : undefined;
  lines.push("", "## Validation Plan", "");
  if (plan === undefined) {
    lines.push("- none recorded");
  } else {
    lines.push(`- suites: ${plan.suites.join(", ") || "none"}`);
    lines.push(`- full validation fallback: ${plan.fullValidationFallback ? "yes" : "no"}`);
    lines.push(...plan.reasons.map((reason) => `- reason: ${reason}`));
  }

  lines.push("", "## Failures", "");
  if (failures.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...failures.map((failure) => `- ${failure.code}: ${failure.message}`));
  }

  lines.push("");
  return lines.join("\n");
}
