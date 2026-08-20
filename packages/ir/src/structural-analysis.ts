import type { EvidenceIndex, EvidenceRef } from "./evidence.js";

export const structuralAnalysisSchemaVersion = "0.1.0";

export type RouterKind = "next-app" | "next-pages" | "unknown";

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "UNKNOWN";

export type FrameworkKind = "nextjs" | "unknown";

export type StandardKind = "llms-txt" | "webmcp" | "schema-org" | "openapi" | "api-catalog";

export interface FrameworkDetection {
  kind: FrameworkKind;
  detected: boolean;
  evidence: EvidenceRef[];
}

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

export interface StructuralSymbol {
  id: string;
  name: string;
  kind: "import" | "export" | "function" | "class" | "react-component" | "server-action";
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface StructuralForm {
  id: string;
  sourceFile: string;
  action?: string;
  method?: string;
  evidence: EvidenceRef[];
}

export interface AuthenticationBoundary {
  id: string;
  kind: "middleware";
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface ExistingStandard {
  id: string;
  kind: StandardKind;
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
  framework: FrameworkDetection;
  routes: StructuralRoute[];
  apiOperations: StructuralApiOperation[];
  symbols: StructuralSymbol[];
  forms: StructuralForm[];
  authenticationBoundaries: AuthenticationBoundary[];
  existingStandards: ExistingStandard[];
  evidence: EvidenceIndex;
  warnings: StructuralWarning[];
}

export function createEmptyStructuralAnalysis(projectRoot: string): StructuralAnalysis {
  return {
    schemaVersion: structuralAnalysisSchemaVersion,
    projectRoot,
    framework: {
      kind: "unknown",
      detected: false,
      evidence: []
    },
    routes: [],
    apiOperations: [],
    symbols: [],
    forms: [],
    authenticationBoundaries: [],
    existingStandards: [],
    evidence: {
      schemaVersion: "0.1.0",
      items: []
    },
    warnings: []
  };
}
