import type { ApplicationTypeAssessment } from "./semantic-model.js";
import type { StructuralAnalysis } from "./structural-analysis.js";

export function assessApplicationType(analysis: StructuralAnalysis): ApplicationTypeAssessment {
  const evidence = [...analysis.routes, ...analysis.apiOperations, ...analysis.symbols].flatMap(
    (item) => item.evidence
  );
  const vocabulary = [
    ...analysis.routes.map((route) => route.path),
    ...analysis.apiOperations.map((operation) => operation.path),
    ...analysis.symbols.map((symbol) => symbol.name)
  ]
    .join(" ")
    .toLowerCase();

  if (/product|cart|inventory|checkout/.test(vocabulary)) {
    return { type: "ecommerce", confidence: "high", evidence };
  }

  if (/booking|reservation|appointment/.test(vocabulary)) {
    return { type: "booking", confidence: "medium", evidence };
  }

  if (/article|blog|content|newsletter/.test(vocabulary)) {
    return { type: "content", confidence: "medium", evidence };
  }

  if (/subscription|workspace|team|invoice/.test(vocabulary)) {
    return { type: "saas", confidence: "medium", evidence };
  }

  return { type: "unknown", confidence: "low", evidence: [] };
}
