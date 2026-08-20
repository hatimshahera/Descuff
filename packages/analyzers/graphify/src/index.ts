import { createEmptyStructuralAnalysis, type StructuralAnalysis } from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";

export class GraphifyAnalyzer implements StructuralAnalyzer {
  readonly id = "graphify";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    return createEmptyStructuralAnalysis(project.rootDir);
  }
}
