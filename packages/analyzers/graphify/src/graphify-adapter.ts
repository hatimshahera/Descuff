import { createEmptyStructuralAnalysis, type StructuralAnalysis } from "@descuff/ir";
import type { GraphifyGraph, GraphifyNode } from "./graphify-types.js";

export function adaptGraphifyGraph(projectRoot: string, graph: GraphifyGraph): StructuralAnalysis {
  const analysis = createEmptyStructuralAnalysis(projectRoot);

  for (const node of graph.nodes ?? []) {
    const sourceFile = getSourceFile(node);
    const evidence = {
      id: `source:${sourceFile}:graphify:${node.id}`,
      kind: "source" as const,
      location: sourceFile,
      confidence: "medium" as const,
      summary: `Graphify node ${node.id} adapted into Descuff structural analysis`
    };

    analysis.symbols.push({
      id: `graphify-symbol:${node.id}`,
      name: node.label ?? node.id,
      kind: graphifyTypeToSymbolKind(node.type),
      sourceFile,
      evidence: [evidence]
    });
    analysis.evidence.items.push(evidence);
  }

  if ((graph.edges ?? []).length > 0) {
    analysis.warnings.push({
      code: "GRAPHIFY_EDGES_NOT_SEMANTIC_IR",
      message:
        "Graphify edges were intentionally not copied directly; future adapter work must map them to Descuff-owned relationships.",
      evidence: []
    });
  }

  return analysis;
}

function getSourceFile(node: GraphifyNode): string {
  return node.source_file ?? node.source_location ?? "graphify-out/graph.json";
}

function graphifyTypeToSymbolKind(type: string | undefined): "function" | "class" | "import" {
  if (type === "class") {
    return "class";
  }

  if (type === "import") {
    return "import";
  }

  return "function";
}
