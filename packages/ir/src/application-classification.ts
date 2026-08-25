import type { ApplicationTypeAssessment, DomainProfile } from "./semantic-model.js";
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

export function createDomainProfileFromApplicationType(
  assessment: ApplicationTypeAssessment
): DomainProfile {
  if (assessment.type === "unknown") {
    return {
      summary: "Application domain could not be determined from deterministic evidence.",
      primaryDomain: "",
      domains: [],
      confidence: assessment.confidence,
      evidence: assessment.evidence,
      migrationSource: "applicationType"
    };
  }

  return {
    summary: domainSummary(assessment.type),
    primaryDomain: assessment.type,
    domains: [assessment.type],
    confidence: assessment.confidence,
    evidence: assessment.evidence,
    migrationSource: "applicationType"
  };
}

function signalScore(vocabulary: string, signals: string[]): number {
  return signals.filter((signal) => new RegExp(signal).test(vocabulary)).length;
}

function domainSummary(type: ApplicationTypeAssessment["type"]): string {
  switch (type) {
    case "ecommerce":
      return "Commerce application with product, catalog, cart, checkout, or inventory evidence.";
    case "booking":
      return "Booking or scheduling application with reservation or appointment evidence.";
    case "content":
      return "Content application with posts, articles, blog, newsletter, or publishing evidence.";
    case "saas":
      return "SaaS application with dashboard, billing, workspace, team, or subscription evidence.";
    case "unknown":
      return "Application domain could not be determined from deterministic evidence.";
  }
}
