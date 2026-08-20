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
}

export interface RuntimeApiTarget {
  path: string;
  method: string;
}

export function createProjectContext(rootDir: string, cwd = rootDir): ProjectContext {
  return {
    rootDir,
    cwd
  };
}
