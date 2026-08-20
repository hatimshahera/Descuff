import type { StructuralAnalysis } from "@descuff/ir";

export function renderStructuralSummary(analysis: StructuralAnalysis): string {
  return [
    "Descuff",
    "",
    `Routes: ${analysis.routes.length}`,
    `API operations: ${analysis.apiOperations.length}`,
    `Warnings: ${analysis.warnings.length}`
  ].join("\n");
}
