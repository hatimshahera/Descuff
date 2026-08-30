import type { StructuralAnalysis } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateBrowserAgentBenchmarks(analysis: StructuralAnalysis): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const benchmark of analysis.browserAgentBenchmarks) {
    if (benchmark.before.result !== "succeeded") {
      issues.push({
        code: "BROWSER_AGENT_TASK_BASELINE_FAILED",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} could not prove the baseline browser path.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Record successful baseline UI/DOM evidence before reporting before/after browser-agent effort."
      });
      continue;
    }

    if (benchmark.after.limitExceeded !== undefined && benchmark.after.limitExceeded.length > 0) {
      issues.push({
        code: "BROWSER_AGENT_SCENARIO_BUDGET_EXCEEDED",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} exceeded scenario budget(s): ${benchmark.after.limitExceeded.join(", ")}.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Increase the scenario budget only if the higher effort is acceptable, or improve the agent-facing evidence so the task needs fewer browser-agent steps."
      });
      continue;
    }

    if (benchmark.after.result !== "succeeded") {
      issues.push({
        code: "BROWSER_AGENT_TASK_AFTER_FAILED",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} could not prove the post-Descuff browser path.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Repair the standards-assisted evidence or optional WebMCP scenario before reporting browser-agent improvement."
      });
      continue;
    }

    if (benchmark.status === "inconclusive") {
      issues.push({
        code: "BROWSER_AGENT_BENCHMARK_INCONCLUSIVE",
        level: "runtime",
        severity: "error",
        message: `Browser-agent benchmark ${benchmark.taskName} could not prove a successful before/after comparison.`,
        source: benchmark.id,
        evidence: benchmark.evidence,
        suggestedAction:
          "Record successful evidence for both the baseline UI/DOM path and the Descuff standards-assisted path before reporting benchmark improvement."
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
          "Review the standards evidence, optional WebMCP tool, and task scenario before reporting browser-agent effort improvement."
      });
    }
  }

  return createValidationSummary(issues);
}
