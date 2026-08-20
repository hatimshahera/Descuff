import { assessApplicationType } from "./application-classification.js";
import { classifyCapabilityRisk } from "./capability-risk.js";
import { createEvidenceIndex } from "./evidence.js";
import {
  applicationModelSchemaVersion,
  type ApiOperation,
  type ApplicationModel,
  type Capability,
  type Entity
} from "./semantic-model.js";
import type { StructuralAnalysis } from "./structural-analysis.js";

export function structuralAnalysisToApplicationModel(
  analysis: StructuralAnalysis
): ApplicationModel {
  const entities = inferEntities(analysis);
  const apis = analysis.apiOperations.map((operation): ApiOperation => ({
    id: operation.id,
    path: operation.path,
    method: operation.method,
    sourceFile: operation.sourceFile,
    runtimeObserved: analysis.runtimeApiOperations.some(
      (runtime) => runtime.path === operation.path && runtime.method === operation.method
    ),
    sideEffect:
      operation.method === "GET" ? "read" : operation.method === "UNKNOWN" ? "unknown" : "write",
    evidence: operation.evidence
  }));

  return {
    schemaVersion: applicationModelSchemaVersion,
    project: {
      rootDir: analysis.projectRoot,
      framework: analysis.framework.kind,
      evidence: analysis.framework.evidence
    },
    applicationType: assessApplicationType(analysis),
    entities,
    capabilities: inferCapabilities(analysis),
    routes: analysis.routes.map((route) => ({
      id: route.id,
      path: route.path,
      routerKind: route.routerKind,
      sourceFile: route.sourceFile,
      runtimeObserved: analysis.runtimeRoutes.some((runtime) => runtime.path === route.path),
      evidence: route.evidence
    })),
    apis,
    authentication: {
      boundaries: analysis.authenticationBoundaries.map((boundary) => ({ ...boundary })),
      evidence: analysis.authenticationBoundaries.flatMap((boundary) => boundary.evidence)
    },
    integrations: [],
    standards: analysis.existingStandards.map((standard) => ({ ...standard })),
    evidence: createEvidenceIndex(analysis.evidence.items)
  };
}

function inferCapabilities(analysis: StructuralAnalysis): Capability[] {
  return analysis.apiOperations.map((operation) => {
    const operationType = operation.method === "GET" ? "read" : "write";
    const risk = classifyCapabilityRisk(operation.method, operation.path);
    return {
      id: capabilityId(operation.method, operation.path),
      name: capabilityName(operation.method, operation.path),
      operationType,
      risk,
      visibility: risk === "AUTHENTICATED_READ" ? "authenticated" : "public",
      inputs: [],
      outputs: [],
      linkedRoutes: [],
      linkedApis: [operation.id],
      evidence: operation.evidence,
      confidence: operation.method === "UNKNOWN" ? "low" : "high"
    };
  });
}

function inferEntities(analysis: StructuralAnalysis): Entity[] {
  const productEvidence = [...analysis.routes, ...analysis.apiOperations, ...analysis.symbols]
    .filter((item) => /product/i.test("path" in item ? item.path : item.name))
    .flatMap((item) => item.evidence);

  if (productEvidence.length === 0) {
    return [];
  }

  return [
    {
      id: "entity:product",
      name: "Product",
      kind: "product",
      properties: [],
      relationships: [],
      evidence: productEvidence
    }
  ];
}

function capabilityId(method: string, path: string): string {
  return `capability:${method.toLowerCase()}:${path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function capabilityName(method: string, path: string): string {
  return `${method.toLowerCase()} ${path}`;
}
