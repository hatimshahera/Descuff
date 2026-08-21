import type { EvidenceIndex, EvidenceRef } from "./evidence.js";

export const structuralAnalysisSchemaVersion = "0.1.0";

export type RouterKind = "next-app" | "next-pages" | "unknown";

export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | "UNKNOWN";

export type FrameworkKind = "nextjs" | "unknown";

export type StandardKind = "llms-txt" | "webmcp" | "schema-org" | "openapi" | "api-catalog";

export type RouteVisibility = "public" | "authenticated" | "unknown";

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
  visibility?: RouteVisibility;
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
  kind: "middleware" | "proxy";
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface ExistingStandard {
  id: string;
  kind: StandardKind;
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface RuntimeRouteObservation {
  id: string;
  path: string;
  status: number;
  contentType?: string;
  evidence: EvidenceRef[];
}

export interface RuntimeApiObservation {
  id: string;
  path: string;
  method: HttpMethod;
  status: number;
  contentType?: string;
  responseShape?: string;
  responseSummary?: string;
  evidence: EvidenceRef[];
}

export interface RuntimePageObservation {
  id: string;
  path: string;
  url: string;
  status: number;
  title?: string;
  headings: string[];
  formCount: number;
  jsonLdCount: number;
  networkRequestCount: number;
  truncatedNetworkRequestCount: number;
  origin: string;
  evidence: EvidenceRef[];
}

export interface RuntimeWebMcpToolObservation {
  id: string;
  name: string;
  description: string;
  inputSchema: unknown;
  annotations?: Record<string, unknown>;
  origin: string;
  frameUrl: string;
  evidence: EvidenceRef[];
}

export interface RuntimeWebMcpToolExecutionObservation {
  id: string;
  toolName: string;
  status: "executed" | "skipped" | "failed";
  origin: string;
  frameUrl: string;
  resultShape?: string;
  resultSummary?: string;
  error?: string;
  evidence: EvidenceRef[];
}

export interface EvidenceCorrelation {
  id: string;
  staticEvidence: EvidenceRef[];
  runtimeEvidence: EvidenceRef[];
  subject: string;
  confidence: "high" | "medium" | "low";
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
  runtimeRoutes: RuntimeRouteObservation[];
  runtimeApiOperations: RuntimeApiObservation[];
  runtimePages: RuntimePageObservation[];
  runtimeWebMcpTools: RuntimeWebMcpToolObservation[];
  runtimeWebMcpToolExecutions: RuntimeWebMcpToolExecutionObservation[];
  correlations: EvidenceCorrelation[];
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
    runtimeRoutes: [],
    runtimeApiOperations: [],
    runtimePages: [],
    runtimeWebMcpTools: [],
    runtimeWebMcpToolExecutions: [],
    correlations: [],
    evidence: {
      schemaVersion: "0.1.0",
      items: []
    },
    warnings: []
  };
}
