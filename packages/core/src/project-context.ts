export interface ProjectContext {
  rootDir: string;
  cwd: string;
  configPath?: string;
  runtime?: RuntimeProjectContext;
}

export interface RuntimeProjectContext {
  baseUrl: string;
  routes: string[];
  apiOperations: RuntimeApiTarget[];
  webMcpToolScenarios?: RuntimeWebMcpToolScenario[];
  browserAgentScenarios?: RuntimeBrowserAgentScenario[];
  implementedStandards?: RuntimeBrowserAgentEvidenceSurface[];
  limits?: RuntimeResourceLimits;
}

export interface RuntimeApiTarget {
  path: string;
  method: string;
}

export interface RuntimeWebMcpToolScenario {
  toolName: string;
  input: unknown;
  expectedApi?: RuntimeApiTarget;
  description?: string;
}

export type RuntimeBrowserAgentEvidenceSurface =
  | "dom"
  | "accessibility"
  | "json-ld"
  | "llms-txt"
  | "openapi"
  | "api-catalog"
  | "network"
  | "webmcp";

export type RuntimeBrowserAgentTaskRisk = "read-only" | "mutating" | "high-consequence" | "unknown";

export interface RuntimeBrowserAgentScenario {
  id: string;
  title: string;
  intent: string;
  startRoute: string;
  allowedRoutes?: string[];
  allowedOrigins?: string[];
  blockedOrigins?: string[];
  inputs?: Record<string, unknown>;
  successCriteria: string[];
  expectedEvidenceSurfaces: RuntimeBrowserAgentEvidenceSurface[];
  budgets?: {
    maxActions?: number;
    maxScreenshots?: number;
    maxDomQueries?: number;
    maxNetworkObservations?: number;
    maxToolCalls?: number;
  };
  risk?: RuntimeBrowserAgentTaskRisk;
}

export interface RuntimeResourceLimits {
  maxRoutes?: number;
  maxPageLoadMs?: number;
  maxNetworkRequests?: number;
  maxResponseBodyBytes?: number;
  maxRedirects?: number;
  allowedOrigins?: string[];
  blockedOrigins?: string[];
}

export function createProjectContext(rootDir: string, cwd = rootDir): ProjectContext {
  return {
    rootDir,
    cwd
  };
}
