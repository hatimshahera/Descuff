import { describe, expect, it } from "vitest";
import {
  createEmptyStructuralAnalysis,
  createEvidenceIndex,
  validateStructuralAnalysis
} from "../src/index.js";

describe("@descuff/ir", () => {
  it("creates versioned evidence and structural analysis shells", () => {
    const evidence = createEvidenceIndex();
    const analysis = createEmptyStructuralAnalysis("/repo");

    expect(evidence.schemaVersion).toBe("0.1.0");
    expect(analysis.schemaVersion).toBe("0.1.0");
    expect(analysis.projectRoot).toBe("/repo");
  });

  it("validates structural analysis evidence requirements", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    analysis.routes.push({
      id: "route:next-app:/",
      path: "/",
      routerKind: "next-app",
      sourceFile: "app/page.tsx",
      evidence: []
    });

    expect(validateStructuralAnalysis(analysis)).toEqual({
      valid: false,
      issues: [
        {
          code: "STRUCTURAL_ROUTE_EVIDENCE_MISSING",
          message: "Route / has no evidence."
        }
      ]
    });
  });

  it("requires evidence on browser-agent benchmark records", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    analysis.browserAgentBenchmarks.push({
      id: "browser-agent-benchmark:search",
      taskName: "Search products",
      startingUrl: "https://example.test/",
      before: {
        id: "browser-agent-path:before:search",
        kind: "baseline-ui-dom",
        browserActions: 8,
        navigations: 1,
        screenshots: 2,
        domQueries: 5,
        networkObservations: 1,
        webMcpToolCalls: 0,
        result: "succeeded",
        confidence: "medium",
        evidence: []
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
        evidence: []
      },
      improvement: {
        browserActionReductionPercent: 63,
        screenshotReductionPercent: 100,
        domQueryReductionPercent: 80
      },
      status: "improved",
      evidence: []
    });

    expect(validateStructuralAnalysis(analysis)).toEqual({
      valid: false,
      issues: [
        {
          code: "BROWSER_AGENT_BENCHMARK_EVIDENCE_MISSING",
          message:
            "Browser-agent benchmark browser-agent-benchmark:search must include benchmark, before-path, and after-path evidence."
        }
      ]
    });
  });
});
