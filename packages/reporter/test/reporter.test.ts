import { describe, expect, it } from "vitest";
import { createEmptyStructuralAnalysis } from "@descuff/ir";
import { renderBrowserAgentBenchmarkReport, renderStructuralSummary } from "../src/index.js";

describe("@descuff/reporter", () => {
  it("renders a structural summary", () => {
    expect(renderStructuralSummary(createEmptyStructuralAnalysis("/repo"))).toContain("Routes: 0");
  });

  it("renders browser-agent benchmark effort comparisons", () => {
    const evidence = {
      id: "runtime:benchmark:search",
      kind: "runtime" as const,
      location: "/",
      confidence: "high" as const,
      summary: "benchmark"
    };

    expect(
      renderBrowserAgentBenchmarkReport([
        {
          id: "browser-agent-benchmark:search",
          taskName: "Search products",
          startingUrl: "https://example.test/",
          before: {
            id: "browser-agent-path:before:search",
            kind: "baseline-ui-dom",
            browserActions: 10,
            navigations: 1,
            screenshots: 2,
            domQueries: 5,
            networkObservations: 1,
            webMcpToolCalls: 0,
            result: "succeeded",
            confidence: "medium",
            evidence: [evidence]
          },
          after: {
            id: "browser-agent-path:after:search",
            kind: "descuff-webmcp",
            browserActions: 3,
            navigations: 1,
            screenshots: 0,
            domQueries: 1,
            networkObservations: 1,
            webMcpToolCalls: 1,
            result: "succeeded",
            confidence: "high",
            evidence: [evidence]
          },
          improvement: {
            browserActionReductionPercent: 70,
            screenshotReductionPercent: 100,
            domQueryReductionPercent: 80
          },
          status: "improved",
          evidence: [evidence]
        }
      ])
    ).toContain("Browser actions: 10 -> 3 (70% reduction)");
  });
});
