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
            evidenceSurfaces: ["dom", "accessibility"],
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
            kind: "descuff-standards",
            evidenceSurfaces: ["json-ld", "openapi"],
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
    ).toBe(
      [
        "# Browser-Agent Benchmark",
        "",
        "These numbers compare browser-agent task effort from recorded local evidence. They are explanatory measurements, not readiness scores.",
        "",
        "## Search products",
        "",
        "- Status: improved",
        "- Starting URL: https://example.test/",
        "- Browser actions: 10 -> 3 (70% reduction)",
        "- Screenshots: 2 -> 0 (100% reduction)",
        "- DOM queries: 5 -> 1 (80% reduction)",
        "- WebMCP tool calls: 0 -> 1",
        "- Evidence surfaces: dom, accessibility -> json-ld, openapi",
        "- Confidence: medium -> high",
        "- Result: succeeded -> succeeded",
        ""
      ].join("\n")
    );
  });
});
