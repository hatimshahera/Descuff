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
  limits?: RuntimeResourceLimits;
}

export interface RuntimeApiTarget {
  path: string;
  method: string;
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
