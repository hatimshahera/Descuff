import { request } from "@playwright/test";
import {
  createEmptyStructuralAnalysis,
  type HttpMethod,
  type RuntimePageObservation,
  type RuntimeWebMcpToolObservation,
  type StructuralAnalysis
} from "@descuff/ir";
import type { ProjectContext, StructuralAnalyzer } from "@descuff/core";
import { correlateRuntimeEvidence } from "./correlation.js";
import { runtimeEvidence } from "./runtime-evidence.js";
import type { DiscoveredWebMcpTool } from "./webmcp-runtime.js";

export interface RuntimeHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
}

export interface RuntimeHttpClient {
  get(path: string): Promise<RuntimeHttpResponse>;
  fetch(path: string, options: { method: HttpMethod }): Promise<RuntimeHttpResponse>;
  dispose(): Promise<void>;
}

export interface RuntimeNetworkObservation {
  url: string;
  method: string;
  status?: number;
  requestHeaders?: Record<string, string | undefined>;
  responseHeaders?: Record<string, string | undefined>;
  responseBody?: string;
}

export interface RuntimeBrowserPageResult {
  url: string;
  status: number;
  title?: string;
  headings: string[];
  formCount: number;
  jsonLdCount: number;
  origin: string;
  network: RuntimeNetworkObservation[];
  webMcpSupported: boolean;
  webMcpTools: DiscoveredWebMcpTool[];
}

export interface RuntimeBrowserClient {
  visit(path: string, limits: Required<RuntimeResourceLimits>): Promise<RuntimeBrowserPageResult>;
  dispose(): Promise<void>;
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

export const defaultRuntimeResourceLimits: Required<RuntimeResourceLimits> = {
  maxRoutes: 25,
  maxPageLoadMs: 10_000,
  maxNetworkRequests: 100,
  maxResponseBodyBytes: 8_192,
  maxRedirects: 5,
  allowedOrigins: [],
  blockedOrigins: []
};

export class RuntimeAnalyzer implements StructuralAnalyzer {
  readonly id = "runtime";

  constructor(
    private readonly createClient: (
      baseUrl: string
    ) => Promise<RuntimeHttpClient> = createPlaywrightClient,
    private readonly createBrowserClient?: (
      baseUrl: string,
      limits: Required<RuntimeResourceLimits>
    ) => Promise<RuntimeBrowserClient>
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
    const limits = normalizeRuntimeLimits(project.runtime.limits);

    try {
      for (const route of project.runtime.routes.slice(0, limits.maxRoutes)) {
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

      if (project.runtime.routes.length > limits.maxRoutes) {
        analysis.warnings.push({
          code: "RUNTIME_ROUTE_LIMIT_REACHED",
          message: `Runtime analysis visited ${limits.maxRoutes} route(s) and skipped ${project.runtime.routes.length - limits.maxRoutes}.`,
          evidence: []
        });
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

      if (this.createBrowserClient !== undefined) {
        const browser = await this.createBrowserClient(project.runtime.baseUrl, limits);
        try {
          for (const route of project.runtime.routes.slice(0, limits.maxRoutes)) {
            const page = await browser.visit(route, limits);
            const sanitizedNetwork = page.network
              .slice(0, limits.maxNetworkRequests)
              .map((observation) => sanitizeNetworkObservation(observation, limits));
            const pageEvidence = runtimeEvidence(
              `browser:${route}`,
              `Browser loaded ${page.url} with ${page.headings.length} heading(s), ${page.formCount} form(s), and ${page.jsonLdCount} JSON-LD block(s).`
            );

            if (!isOriginAllowed(page.origin, limits)) {
              analysis.warnings.push({
                code: "RUNTIME_ORIGIN_BLOCKED",
                message: `Runtime browser analysis skipped ${page.url} because origin ${page.origin} is not allowed.`,
                evidence: [pageEvidence]
              });
              analysis.evidence.items.push(pageEvidence);
              continue;
            }

            analysis.runtimePages.push(
              renderRuntimePageObservation(route, page, sanitizedNetwork, [pageEvidence])
            );
            analysis.evidence.items.push(pageEvidence);

            if (page.network.length > limits.maxNetworkRequests) {
              analysis.warnings.push({
                code: "RUNTIME_NETWORK_LIMIT_REACHED",
                message: `Runtime browser analysis captured ${limits.maxNetworkRequests} network request(s) for ${route} and truncated the rest.`,
                evidence: [pageEvidence]
              });
            }

            if (!page.webMcpSupported) {
              analysis.warnings.push({
                code: "WEBMCP_BROWSER_API_UNAVAILABLE",
                message: `Browser page ${route} does not expose document.modelContext.`,
                evidence: [pageEvidence]
              });
              continue;
            }

            for (const tool of page.webMcpTools) {
              const toolEvidence = runtimeEvidence(
                `webmcp:${tool.origin}:${tool.name}`,
                `Browser discovered WebMCP tool ${tool.name} on ${tool.origin}.`
              );
              analysis.runtimeWebMcpTools.push(
                renderRuntimeWebMcpToolObservation(tool, [toolEvidence])
              );
              analysis.evidence.items.push(toolEvidence);
            }
          }
        } finally {
          await browser.dispose();
        }
      }
    } finally {
      await context.dispose();
    }

    analysis.correlations = correlateRuntimeEvidence(analysis);
    return analysis;
  }
}

export { correlateRuntimeEvidence } from "./correlation.js";
export {
  createDocumentModelContextRuntime,
  type DiscoveredWebMcpTool,
  type WebMcpRuntime,
  type WebMcpToolResult
} from "./webmcp-runtime.js";

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

function normalizeRuntimeLimits(
  limits: RuntimeResourceLimits | undefined
): Required<RuntimeResourceLimits> {
  return {
    ...defaultRuntimeResourceLimits,
    ...limits,
    allowedOrigins: limits?.allowedOrigins ?? defaultRuntimeResourceLimits.allowedOrigins,
    blockedOrigins: limits?.blockedOrigins ?? defaultRuntimeResourceLimits.blockedOrigins
  };
}

function renderRuntimePageObservation(
  path: string,
  page: RuntimeBrowserPageResult,
  network: RuntimeNetworkObservation[],
  evidence: RuntimePageObservation["evidence"]
): RuntimePageObservation {
  return {
    id: `runtime-page:${path}`,
    path,
    url: page.url,
    status: page.status,
    ...(page.title === undefined ? {} : { title: page.title }),
    headings: page.headings,
    formCount: page.formCount,
    jsonLdCount: page.jsonLdCount,
    networkRequestCount: network.length,
    truncatedNetworkRequestCount: Math.max(0, page.network.length - network.length),
    origin: page.origin,
    evidence
  };
}

function renderRuntimeWebMcpToolObservation(
  tool: DiscoveredWebMcpTool,
  evidence: RuntimeWebMcpToolObservation["evidence"]
): RuntimeWebMcpToolObservation {
  return {
    id: `runtime-webmcp:${tool.origin}:${tool.name}`,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.annotations === undefined ? {} : { annotations: tool.annotations }),
    origin: tool.origin,
    frameUrl: tool.frameUrl,
    evidence
  };
}

export function sanitizeNetworkObservation(
  observation: RuntimeNetworkObservation,
  limits: Required<Pick<RuntimeResourceLimits, "maxResponseBodyBytes">>
): RuntimeNetworkObservation {
  return {
    url: redactSensitiveUrl(observation.url),
    method: observation.method,
    ...(observation.status === undefined ? {} : { status: observation.status }),
    ...(observation.requestHeaders === undefined
      ? {}
      : { requestHeaders: redactHeaders(observation.requestHeaders) }),
    ...(observation.responseHeaders === undefined
      ? {}
      : { responseHeaders: redactHeaders(observation.responseHeaders) }),
    ...(observation.responseBody === undefined
      ? {}
      : {
          responseBody: redactSensitiveBody(
            observation.responseBody.slice(0, limits.maxResponseBodyBytes)
          )
        })
  };
}

function redactHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    redacted[key] = isSensitiveHeader(key) ? "[REDACTED]" : value;
  }

  return redacted;
}

function isSensitiveHeader(header: string): boolean {
  return ["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"].includes(
    header.toLowerCase()
  );
}

function redactSensitiveUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (isSensitiveField(key)) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function redactSensitiveBody(body: string): string {
  return body.replace(
    /("(?:password|token|secret|apiKey|api_key|authorization|cookie)"\s*:\s*)"[^"]*"/gi,
    '$1"[REDACTED]"'
  );
}

function isSensitiveField(field: string): boolean {
  return /password|token|secret|api[-_]?key|authorization|cookie/i.test(field);
}

function isOriginAllowed(
  origin: string,
  limits: Required<Pick<RuntimeResourceLimits, "allowedOrigins" | "blockedOrigins">>
): boolean {
  if (limits.blockedOrigins.includes(origin)) {
    return false;
  }

  return limits.allowedOrigins.length === 0 || limits.allowedOrigins.includes(origin);
}
