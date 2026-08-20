import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { validateStructuralAnalysis } from "@descuff/ir";
import { adaptGraphifyGraph, GraphifyAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-graphify", () => {
  it("implements the structural analyzer contract without leaking Graphify formats", async () => {
    const analysis = await new GraphifyAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.schemaVersion).toBe("0.1.0");
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "GRAPHIFY_GRAPH_MISSING" })
    );
  });

  it("adapts Graphify graph data into Descuff structural analysis", () => {
    const analysis = adaptGraphifyGraph("/repo", {
      nodes: [
        {
          id: "function:searchProducts",
          label: "searchProducts",
          type: "function",
          source_file: "app/api/search/route.ts"
        }
      ],
      edges: [{ source: "function:searchProducts", target: "route:/api/search", type: "CALLS" }]
    });

    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        name: "searchProducts",
        kind: "function",
        sourceFile: "app/api/search/route.ts"
      })
    );
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "GRAPHIFY_EDGES_NOT_SEMANTIC_IR" })
    );
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });
});
