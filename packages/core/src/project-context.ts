export interface ProjectContext {
  rootDir: string;
  cwd: string;
  configPath?: string;
}

export function createProjectContext(rootDir: string, cwd = rootDir): ProjectContext {
  return {
    rootDir,
    cwd
  };
}
