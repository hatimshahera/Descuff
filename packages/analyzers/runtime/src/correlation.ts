import type { EvidenceCorrelation, StructuralAnalysis } from "@descuff/ir";

export function correlateRuntimeEvidence(analysis: StructuralAnalysis): EvidenceCorrelation[] {
  const routeCorrelations = analysis.routes.flatMap((route) => {
    const runtime = analysis.runtimeRoutes.find((observation) => observation.path === route.path);
    if (runtime === undefined) {
      return [];
    }

    return [
      {
        id: `correlation:route:${route.path}`,
        staticEvidence: route.evidence,
        runtimeEvidence: runtime.evidence,
        subject: `route:${route.path}`,
        confidence: runtime.status < 500 ? "high" : "medium"
      } satisfies EvidenceCorrelation
    ];
  });

  const apiCorrelations = analysis.apiOperations.flatMap((operation) => {
    const runtime = analysis.runtimeApiOperations.find(
      (observation) =>
        observation.path === operation.path && observation.method === operation.method
    );
    if (runtime === undefined) {
      return [];
    }

    return [
      {
        id: `correlation:api:${operation.method}:${operation.path}`,
        staticEvidence: operation.evidence,
        runtimeEvidence: runtime.evidence,
        subject: `api:${operation.method}:${operation.path}`,
        confidence: runtime.status < 500 ? "high" : "medium"
      } satisfies EvidenceCorrelation
    ];
  });

  return [...routeCorrelations, ...apiCorrelations];
}
