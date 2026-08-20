import type { EvidenceIndex, EvidenceRef } from "./evidence.js";

export const structuralAnalysisSchemaVersion = "0.1.0";

export type RouterKind = "next-app" | "next-pages" | "unknown";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface StructuralRoute {
  id: string;
  path: string;
  routerKind: RouterKind;
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface StructuralApiOperation {
  id: string;
  path: string;
  method: HttpMethod;
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface StructuralWarning {
  code: string;
  message: string;
  evidence: EvidenceRef[];
}

export interface StructuralAnalysis {
  schemaVersion: string;
  projectRoot: string;
  routes: StructuralRoute[];
  apiOperations: StructuralApiOperation[];
  evidence: EvidenceIndex;
  warnings: StructuralWarning[];
}

export function createEmptyStructuralAnalysis(projectRoot: string): StructuralAnalysis {
  return {
    schemaVersion: structuralAnalysisSchemaVersion,
    projectRoot,
    routes: [],
    apiOperations: [],
    evidence: {
      schemaVersion: "0.1.0",
      items: []
    },
    warnings: []
  };
}
