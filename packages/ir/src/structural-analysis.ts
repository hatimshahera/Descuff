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
  kind: "middleware" | "proxy" | "route-handler";
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

export type BrowserAgentEvidenceSurface =
  | "dom"
  | "accessibility"
  | "json-ld"
  | "llms-txt"
  | "openapi"
  | "api-catalog"
  | "network"
  | "webmcp";

export type BrowserAgentTaskRisk = "read-only" | "mutating" | "high-consequence" | "unknown";

export interface BrowserAgentTaskScenario {
  id: string;
  title: string;
  intent: string;
  startRoute: string;
  allowedRoutes: string[];
  allowedOrigins: string[];
  blockedOrigins: string[];
  inputs: Record<string, unknown>;
  successCriteria: string[];
  expectedEvidenceSurfaces: BrowserAgentEvidenceSurface[];
  budgets: {
    maxActions: number;
    maxScreenshots: number;
    maxDomQueries: number;
    maxNetworkObservations: number;
    maxToolCalls: number;
  };
  risk: BrowserAgentTaskRisk;
  evidence: EvidenceRef[];
}

export type BrowserAgentTaskPathKind = "baseline-ui-dom" | "descuff-standards" | "descuff-webmcp";

export interface BrowserAgentTaskPathObservation {
  id: string;
  kind: BrowserAgentTaskPathKind;
  evidenceSurfaces: BrowserAgentEvidenceSurface[];
  browserActions: number;
  navigations: number;
  screenshots: number;
  domQueries: number;
  networkObservations: number;
  webMcpToolCalls: number;
  result: "succeeded" | "failed" | "inconclusive";
  confidence: "high" | "medium" | "low";
  limitExceeded?: string[];
  evidence: EvidenceRef[];
}

export interface BrowserAgentTaskBenchmarkImprovement {
  browserActionReductionPercent: number;
  screenshotReductionPercent: number;
  domQueryReductionPercent: number;
}

export interface BrowserAgentTaskBenchmark {
  id: string;
  taskName: string;
  startingUrl: string;
  before: BrowserAgentTaskPathObservation;
  after: BrowserAgentTaskPathObservation;
  improvement: BrowserAgentTaskBenchmarkImprovement;
  status: "improved" | "unchanged" | "regressed" | "inconclusive";
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
  browserAgentScenarios: BrowserAgentTaskScenario[];
  browserAgentBenchmarks: BrowserAgentTaskBenchmark[];
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
    browserAgentScenarios: [],
    browserAgentBenchmarks: [],
    correlations: [],
    evidence: {
      schemaVersion: "0.1.0",
      items: []
    },
    warnings: []
  };
}
