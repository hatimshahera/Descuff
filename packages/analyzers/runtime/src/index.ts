import { createEmptyStructuralAnalysis, type StructuralAnalysis } from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";

export class RuntimeAnalyzer implements StructuralAnalyzer {
  readonly id = "runtime";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    return createEmptyStructuralAnalysis(project.rootDir);
  }
}
