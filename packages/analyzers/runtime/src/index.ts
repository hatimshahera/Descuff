import { request } from "@playwright/test";
import {
  createEmptyStructuralAnalysis,
  type HttpMethod,
  type StructuralAnalysis
} from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";
import { correlateRuntimeEvidence } from "./correlation.js";
import { runtimeEvidence } from "./runtime-evidence.js";

export interface RuntimeHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
}

export interface RuntimeHttpClient {
  get(path: string): Promise<RuntimeHttpResponse>;
  fetch(path: string, options: { method: HttpMethod }): Promise<RuntimeHttpResponse>;
  dispose(): Promise<void>;
}

export class RuntimeAnalyzer implements StructuralAnalyzer {
  readonly id = "runtime";

  constructor(
    private readonly createClient: (
      baseUrl: string
    ) => Promise<RuntimeHttpClient> = createPlaywrightClient
  ) {}

  async analyze(project: ProjectContext): Promise<StructuralAnalysis> {
    const analysis = createEmptyStructuralAnalysis(project.rootDir);

    if (project.runtime === undefined) {
      analysis.warnings.push({
        code: "RUNTIME_CONFIG_MISSING",
        message: "Runtime analysis requires ProjectContext.runtime.",
        evidence: []
      });
      return analysis;
    }

    const context = await this.createClient(project.runtime.baseUrl);

    try {
      for (const route of project.runtime.routes) {
        const response = await context.get(route);
        const evidence = runtimeEvidence(route, `GET ${route} returned ${response.status}`);
        const observation = {
          id: `runtime-route:${route}`,
          path: route,
          status: response.status,
          evidence: [evidence]
        };
        const contentType = response.headers["content-type"];
        analysis.runtimeRoutes.push(
          contentType === undefined ? observation : { ...observation, contentType }
        );
        analysis.evidence.items.push(evidence);
      }

      for (const operation of project.runtime.apiOperations) {
        const method = normalizeMethod(operation.method);
        if (!isReadOnlyMethod(method)) {
          analysis.warnings.push({
            code: "RUNTIME_MUTATION_SKIPPED",
            message: `${method} ${operation.path} was skipped because runtime analysis is read-only by default.`,
            evidence: []
          });
          continue;
        }

        const response = await context.fetch(operation.path, { method });
        const evidence = runtimeEvidence(
          `${method}:${operation.path}`,
          `${method} ${operation.path} returned ${response.status}`
        );
        const observation = {
          id: `runtime-api:${method}:${operation.path}`,
          path: operation.path,
          method,
          status: response.status,
          evidence: [evidence]
        };
        const contentType = response.headers["content-type"];
        analysis.runtimeApiOperations.push(
          contentType === undefined ? observation : { ...observation, contentType }
        );
        analysis.evidence.items.push(evidence);
      }
    } finally {
      await context.dispose();
    }

    analysis.correlations = correlateRuntimeEvidence(analysis);
    return analysis;
  }
}

export { correlateRuntimeEvidence } from "./correlation.js";

function normalizeMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (isHttpMethod(upper)) {
    return upper;
  }
  return "UNKNOWN";
}

function isHttpMethod(value: string): value is HttpMethod {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "UNKNOWN"].includes(value);
}

function isReadOnlyMethod(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

async function createPlaywrightClient(baseUrl: string): Promise<RuntimeHttpClient> {
  const context = await request.newContext({ baseURL: baseUrl });

  return {
    async get(path) {
      const response = await context.get(path);
      return { status: response.status(), headers: response.headers() };
    },
    async fetch(path, options) {
      const response = await context.fetch(path, options);
      return { status: response.status(), headers: response.headers() };
    },
    async dispose() {
      await context.dispose();
    }
  };
}
