import type { BrowserAgentTaskBenchmark, StructuralAnalysis } from "@descuff/ir";

export function renderStructuralSummary(analysis: StructuralAnalysis): string {
  return [
    "Descuff",
    "",
    `Routes: ${analysis.routes.length}`,
    `API operations: ${analysis.apiOperations.length}`,
    `Warnings: ${analysis.warnings.length}`
  ].join("\n");
}

export function renderBrowserAgentBenchmarkReport(benchmarks: BrowserAgentTaskBenchmark[]): string {
  if (benchmarks.length === 0) {
    return [
      "# Browser-Agent Benchmark",
      "",
      "No browser-agent benchmark records were produced."
    ].join("\n");
  }

  return [
    "# Browser-Agent Benchmark",
    "",
    "These numbers compare browser-agent task effort from recorded local evidence. They are explanatory measurements, not readiness scores.",
    "",
    ...benchmarks.flatMap((benchmark) => [
      `## ${benchmark.taskName}`,
      "",
      `- Status: ${benchmark.status}`,
      `- Starting URL: ${benchmark.startingUrl}`,
      `- Browser actions: ${benchmark.before.browserActions} -> ${benchmark.after.browserActions} (${formatReduction(benchmark.improvement.browserActionReductionPercent)})`,
      `- Screenshots: ${benchmark.before.screenshots} -> ${benchmark.after.screenshots} (${formatReduction(benchmark.improvement.screenshotReductionPercent)})`,
      `- DOM queries: ${benchmark.before.domQueries} -> ${benchmark.after.domQueries} (${formatReduction(benchmark.improvement.domQueryReductionPercent)})`,
      `- WebMCP tool calls: ${benchmark.before.webMcpToolCalls} -> ${benchmark.after.webMcpToolCalls}`,
      `- Evidence surfaces: ${formatEvidenceSurfaces(benchmark.before.evidenceSurfaces)} -> ${formatEvidenceSurfaces(benchmark.after.evidenceSurfaces)}`,
      `- Confidence: ${benchmark.before.confidence} -> ${benchmark.after.confidence}`,
      `- Result: ${benchmark.before.result} -> ${benchmark.after.result}`,
      ""
    ])
  ].join("\n");
}

function formatEvidenceSurfaces(surfaces: string[] | undefined): string {
  return surfaces === undefined || surfaces.length === 0 ? "none" : surfaces.join(", ");
}

function formatReduction(percent: number): string {
  if (percent > 0) {
    return `${percent}% reduction`;
  }

  if (percent < 0) {
    return `${Math.abs(percent)}% increase`;
  }

  return "no change";
}
