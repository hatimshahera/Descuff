import type { ApplicationTypeAssessment } from "./semantic-model.js";
import type { StructuralAnalysis } from "./structural-analysis.js";

export function assessApplicationType(analysis: StructuralAnalysis): ApplicationTypeAssessment {
  const evidence = [...analysis.routes, ...analysis.apiOperations, ...analysis.symbols].flatMap(
    (item) => item.evidence
  );
  const vocabulary = [
    ...analysis.routes.map((route) => route.path),
    ...analysis.routes.map((route) => route.sourceFile),
    ...analysis.apiOperations.map((operation) => operation.path),
    ...analysis.apiOperations.map((operation) => operation.sourceFile),
    ...analysis.symbols.map((symbol) => symbol.name)
  ]
    .join(" ")
    .toLowerCase();

  const scores = {
    ecommerce: signalScore(vocabulary, ["product", "cart", "inventory", "checkout"]),
    booking: signalScore(vocabulary, ["booking", "reservation", "appointment"]),
    content: signalScore(vocabulary, ["\\bposts\\b", "article", "blog", "content", "newsletter"]),
    saas: signalScore(vocabulary, [
      "subscription",
      "workspace",
      "team",
      "invoice",
      "dashboard",
      "billing",
      "stripe"
    ])
  };

  if (scores.ecommerce >= 2 && scores.ecommerce > scores.saas) {
    return { type: "ecommerce", confidence: "high", evidence };
  }

  if (scores.booking > 0) {
    return { type: "booking", confidence: "medium", evidence };
  }

  if (scores.content > 0 && scores.content >= scores.saas) {
    return { type: "content", confidence: "medium", evidence };
  }

  if (scores.saas > 0) {
    return { type: "saas", confidence: "medium", evidence };
  }

  return { type: "unknown", confidence: "low", evidence: [] };
}

function signalScore(vocabulary: string, signals: string[]): number {
  return signals.filter((signal) => new RegExp(signal).test(vocabulary)).length;
}
