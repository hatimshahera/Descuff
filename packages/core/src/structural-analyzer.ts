import type { StructuralAnalysis } from "@descuff/ir";
import type { ProjectContext } from "./project-context.js";

export interface StructuralAnalyzer {
  readonly id: string;
  analyze(project: ProjectContext): Promise<StructuralAnalysis>;
}
