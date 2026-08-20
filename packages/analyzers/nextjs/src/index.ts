import { createEmptyStructuralAnalysis, type StructuralAnalysis } from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";

export class NativeNextAnalyzer implements StructuralAnalyzer {
  readonly id = "native-next";

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    return createEmptyStructuralAnalysis(project.rootDir);
  }
}
