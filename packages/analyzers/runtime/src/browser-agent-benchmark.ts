import type {
  BrowserAgentTaskBenchmark,
  BrowserAgentTaskPathObservation,
  EvidenceRef
} from "@descuff/ir";

export interface BrowserAgentTaskBenchmarkInput {
  id: string;
  taskName: string;
  startingUrl: string;
  before: BrowserAgentTaskPathObservation;
  after: BrowserAgentTaskPathObservation;
  evidence: EvidenceRef[];
}

export function createBrowserAgentTaskBenchmark(
  input: BrowserAgentTaskBenchmarkInput
): BrowserAgentTaskBenchmark {
  const improvement = {
    browserActionReductionPercent: reductionPercent(
      input.before.browserActions,
      input.after.browserActions
    ),
    screenshotReductionPercent: reductionPercent(input.before.screenshots, input.after.screenshots),
    domQueryReductionPercent: reductionPercent(input.before.domQueries, input.after.domQueries)
  };

  return {
    ...input,
    improvement,
    status: benchmarkStatus(input.before, input.after, improvement.browserActionReductionPercent)
  };
}

function benchmarkStatus(
  before: BrowserAgentTaskPathObservation,
  after: BrowserAgentTaskPathObservation,
  actionReductionPercent: number
): BrowserAgentTaskBenchmark["status"] {
  if (before.result !== "succeeded" || after.result !== "succeeded") {
    return "inconclusive";
  }

  if (actionReductionPercent > 0) {
    return "improved";
  }

  if (actionReductionPercent < 0) {
    return "regressed";
  }

  return "unchanged";
}

function reductionPercent(before: number, after: number): number {
  if (before <= 0) {
    return after <= 0 ? 0 : -100;
  }

  return Math.round(((before - after) / before) * 100);
}
