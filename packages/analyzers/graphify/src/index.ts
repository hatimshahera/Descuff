import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createEmptyStructuralAnalysis, type StructuralAnalysis } from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";
import { adaptGraphifyGraph } from "./graphify-adapter.js";
import type { GraphifyGraph } from "./graphify-types.js";

export class GraphifyAnalyzer implements StructuralAnalyzer {
  readonly id = "graphify";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    try {
      const graphJson = await readFile(join(project.rootDir, "graphify-out", "graph.json"), "utf8");
      return adaptGraphifyGraph(project.rootDir, JSON.parse(graphJson) as GraphifyGraph);
    } catch (error) {
      const analysis = createEmptyStructuralAnalysis(project.rootDir);
      analysis.warnings.push({
        code: "GRAPHIFY_GRAPH_MISSING",
        message: graphifyReadErrorMessage(error),
        evidence: []
      });
      return analysis;
    }
  }
}

export { adaptGraphifyGraph } from "./graphify-adapter.js";

function graphifyReadErrorMessage(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "Graphify graph.json could not be parsed.";
  }

  return "Graphify graph.json was not found; run graphify before enabling GraphifyAnalyzer.";
}
