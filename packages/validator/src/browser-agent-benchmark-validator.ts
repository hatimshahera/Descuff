import type { StructuralAnalysis } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateBrowserAgentBenchmarks(analysis: StructuralAnalysis): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const benchmark of analysis.browserAgentBenchmarks) {
    if (
      benchmark.status === "inconclusive" ||
      benchmark.before.result !== "succeeded" ||
      benchmark.after.result !== "succeeded"
    ) {
      issues.push({
        code: "BROWSER_AGENT_BENCHMARK_INCONCLUSIVE",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} could not prove a successful before/after comparison.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Record successful evidence for both the baseline UI/DOM path and the Descuff WebMCP path before reporting benchmark improvement."
      });
      continue;
    }

    if (benchmark.status === "regressed") {
      issues.push({
        code: "BROWSER_AGENT_BENCHMARK_REGRESSED",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} required more browser-agent effort after Descuff.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Review the WebMCP tool, metadata, and task scenario before reporting browser-agent effort improvement."
      });
    }
  }

  return createValidationSummary(issues);
}
