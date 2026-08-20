export interface RuntimeConfig {
  installCommand?: string;
  buildCommand?: string;
  testCommand?: string;
  devCommand?: string;
  baseUrl?: string;
  readinessUrl?: string;
  environmentVariableNames: string[];
  allowedRoutes: string[];
}

export interface DescuffConfig {
  runtime: RuntimeConfig;
}

export function createDefaultConfig(): DescuffConfig {
  return {
    runtime: {
      environmentVariableNames: [],
      allowedRoutes: []
    }
  };
}
