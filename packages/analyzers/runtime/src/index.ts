import {
  chromium,
  request,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Response
} from "@playwright/test";
import {
  createEmptyStructuralAnalysis,
  type HttpMethod,
  type RuntimePageObservation,
  type RuntimeWebMcpToolExecutionObservation,
  type RuntimeWebMcpToolObservation,
  type StructuralAnalysis
} from "@descuff/ir";
import type { ProjectContext, RuntimeWebMcpToolScenario, StructuralAnalyzer } from "@descuff/core";
import { correlateRuntimeEvidence } from "./correlation.js";
import { runtimeEvidence } from "./runtime-evidence.js";
import { createDocumentModelContextRuntime } from "./webmcp-runtime.js";
import type { DiscoveredWebMcpTool, WebMcpRuntime } from "./webmcp-runtime.js";

export * from "./browser-agent-benchmark.js";

export interface RuntimeHttpResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body?: string;
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
  webMcpToolExecutions: RuntimeWebMcpToolExecutionResult[];
}

export interface RuntimeWebMcpToolExecutionResult {
  toolName: string;
  status: "executed" | "skipped" | "failed";
  origin: string;
  frameUrl: string;
  result?: unknown;
  error?: string;
}

export interface RuntimeBrowserClient {
  visit(
    path: string,
    limits: Required<RuntimeResourceLimits>,
    webMcpToolScenarios?: RuntimeWebMcpToolScenario[]
  ): Promise<RuntimeBrowserPageResult>;
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
    private readonly createBrowserClient:
      | ((
          baseUrl: string,
          limits: Required<RuntimeResourceLimits>
        ) => Promise<RuntimeBrowserClient>)
      | null = createPlaywrightBrowserClient
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
        const responseSummary =
          response.body === undefined ? undefined : summarizeRuntimeValue(response.body);
        analysis.runtimeApiOperations.push({
          ...observation,
          ...(contentType === undefined ? {} : { contentType }),
          ...(responseSummary === undefined ? {} : responseSummary)
        });
        analysis.evidence.items.push(evidence);
      }

      if (this.createBrowserClient !== null) {
        const browser = await this.createBrowserClient(project.runtime.baseUrl, limits);
        try {
          for (const route of project.runtime.routes.slice(0, limits.maxRoutes)) {
            let page: RuntimeBrowserPageResult;
            try {
              page = await browser.visit(route, limits, project.runtime.webMcpToolScenarios ?? []);
            } catch (error) {
              analysis.warnings.push({
                code: "RUNTIME_BROWSER_VISIT_FAILED",
                message: `Runtime browser analysis failed for ${route}: ${errorMessage(error)}.`,
                evidence: []
              });
              continue;
            }

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

            for (const execution of page.webMcpToolExecutions) {
              const executionEvidence = runtimeEvidence(
                `webmcp-execution:${execution.origin}:${execution.toolName}`,
                `Browser ${execution.status} WebMCP tool ${execution.toolName} on ${execution.origin}.`
              );
              analysis.runtimeWebMcpToolExecutions.push(
                renderRuntimeWebMcpToolExecutionObservation(execution, [executionEvidence])
              );
              analysis.evidence.items.push(executionEvidence);
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
      const headers = response.headers();
      const contentType = headers["content-type"] ?? "";
      const body = isTextualContentType(contentType)
        ? await response.text().catch(() => "")
        : undefined;
      return { status: response.status(), headers, ...(body === undefined ? {} : { body }) };
    },
    async dispose() {
      await context.dispose();
    }
  };
}

export async function createPlaywrightBrowserClient(
  baseUrl: string,
  limits: Required<RuntimeResourceLimits>
): Promise<RuntimeBrowserClient> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: baseUrl,
    ignoreHTTPSErrors: true
  });

  return new PlaywrightBrowserRuntimeClient(browser, context, baseUrl, limits);
}

class PlaywrightBrowserRuntimeClient implements RuntimeBrowserClient {
  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly baseUrl: string,
    private readonly defaultLimits: Required<RuntimeResourceLimits>
  ) {}

  async visit(
    path: string,
    limits: Required<RuntimeResourceLimits> = this.defaultLimits,
    webMcpToolScenarios: RuntimeWebMcpToolScenario[] = []
  ): Promise<RuntimeBrowserPageResult> {
    const page = await this.context.newPage();
    const network: RuntimeNetworkObservation[] = [];
    const networkTasks: Array<Promise<void>> = [];

    page.on("response", (response) => {
      if (network.length + networkTasks.length >= limits.maxNetworkRequests) {
        return;
      }
      networkTasks.push(captureNetworkObservation(response, network, limits));
    });

    try {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: limits.maxPageLoadMs
      });
      const redirectCount = countRedirects(response?.request() ?? null);
      if (redirectCount > limits.maxRedirects) {
        throw new Error(`Redirect count ${redirectCount} exceeded limit ${limits.maxRedirects}`);
      }

      await page
        .waitForLoadState("networkidle", { timeout: Math.min(2_000, limits.maxPageLoadMs) })
        .catch(() => undefined);
      await Promise.allSettled(networkTasks);

      const runtime = createDocumentModelContextRuntime(page);
      const webMcpSupported = await runtime.isSupported();
      const webMcpTools = webMcpSupported ? await runtime.listTools() : [];
      const webMcpToolExecutions = webMcpSupported
        ? await collectWebMcpToolExecutions(runtime, webMcpTools, webMcpToolScenarios)
        : [];
      const rendered = await readRenderedPageEvidence(page);
      const currentUrl = page.url();

      return {
        url: currentUrl,
        status: response?.status() ?? 0,
        ...rendered,
        origin: originFor(currentUrl, this.baseUrl),
        network,
        webMcpSupported,
        webMcpTools,
        webMcpToolExecutions
      };
    } finally {
      await page.close();
    }
  }

  async dispose(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

async function captureNetworkObservation(
  response: Response,
  network: RuntimeNetworkObservation[],
  limits: Required<RuntimeResourceLimits>
): Promise<void> {
  const request = response.request();
  const observation: RuntimeNetworkObservation = {
    url: response.url(),
    method: request.method(),
    status: response.status(),
    requestHeaders: request.headers(),
    responseHeaders: response.headers()
  };

  const contentType = response.headers()["content-type"] ?? "";
  if (isTextualContentType(contentType)) {
    try {
      observation.responseBody = (await response.text()).slice(0, limits.maxResponseBodyBytes);
    } catch {
      // Some Playwright responses cannot expose a body after redirects or failed requests.
    }
  }

  network.push(observation);
}

async function readRenderedPageEvidence(
  page: Page
): Promise<Pick<RuntimeBrowserPageResult, "title" | "headings" | "formCount" | "jsonLdCount">> {
  return page.evaluate(() => {
    interface ElementLike {
      textContent: string | null;
    }

    interface DocumentLike {
      title: string;
      querySelectorAll(selector: string): ElementLike[];
    }

    const doc = (globalThis as unknown as { document: DocumentLike }).document;
    const headings = Array.from(doc.querySelectorAll("h1,h2,h3"))
      .map((element) => element.textContent?.trim() ?? "")
      .filter((text) => text.length > 0)
      .slice(0, 25);

    return {
      ...(doc.title.length === 0 ? {} : { title: doc.title }),
      headings,
      formCount: doc.querySelectorAll("form").length,
      jsonLdCount: doc.querySelectorAll('script[type="application/ld+json"]').length
    };
  });
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

function renderRuntimeWebMcpToolExecutionObservation(
  execution: RuntimeWebMcpToolExecutionResult,
  evidence: RuntimeWebMcpToolExecutionObservation["evidence"]
): RuntimeWebMcpToolExecutionObservation {
  const summary =
    execution.result === undefined ? undefined : summarizeWebMcpExecutionResult(execution.result);

  return {
    id: `runtime-webmcp-execution:${execution.origin}:${execution.toolName}`,
    toolName: execution.toolName,
    status: execution.status,
    origin: execution.origin,
    frameUrl: execution.frameUrl,
    ...(summary === undefined ? {} : summary),
    ...(execution.error === undefined ? {} : { error: execution.error }),
    evidence
  };
}

export async function collectWebMcpToolExecutions(
  runtime: WebMcpRuntime,
  tools: DiscoveredWebMcpTool[],
  scenarios: RuntimeWebMcpToolScenario[]
): Promise<RuntimeWebMcpToolExecutionResult[]> {
  const executions: RuntimeWebMcpToolExecutionResult[] = [];
  const scenariosByTool = new Map(scenarios.map((scenario) => [scenario.toolName, scenario]));

  for (const tool of tools) {
    if (tool.annotations?.readOnlyHint !== true) {
      executions.push({
        toolName: tool.name,
        status: "skipped",
        origin: tool.origin,
        frameUrl: tool.frameUrl,
        error: "Tool is not explicitly annotated read-only."
      });
      continue;
    }

    const scenario = scenariosByTool.get(tool.name);
    if (scenario === undefined) {
      executions.push({
        toolName: tool.name,
        status: "skipped",
        origin: tool.origin,
        frameUrl: tool.frameUrl,
        error: "No explicit safe validation scenario approved this tool execution."
      });
      continue;
    }

    try {
      const result = await runtime.executeSafeTool(tool.name, scenario.input);
      executions.push({
        toolName: tool.name,
        status: "executed",
        origin: tool.origin,
        frameUrl: tool.frameUrl,
        result: result.result
      });
    } catch (error) {
      executions.push({
        toolName: tool.name,
        status: "failed",
        origin: tool.origin,
        frameUrl: tool.frameUrl,
        error: errorMessage(error)
      });
    }
  }

  return executions;
}

function summarizeWebMcpExecutionResult(
  result: unknown
): Pick<RuntimeWebMcpToolExecutionObservation, "resultShape" | "resultSummary"> {
  const summary = summarizeRuntimeValue(result);

  return {
    resultShape: summary.responseShape,
    ...(summary.responseSummary === undefined ? {} : { resultSummary: summary.responseSummary })
  };
}

function summarizeRuntimeValue(value: unknown): {
  responseShape: string;
  responseSummary?: string;
} {
  const normalized = typeof value === "string" ? parseJsonLikeString(value) : value;
  const responseShape = Array.isArray(normalized)
    ? "array"
    : normalized === null
      ? "null"
      : typeof normalized;
  const serialized = JSON.stringify(normalized);
  const responseSummary =
    serialized === undefined ? undefined : redactSensitiveBody(serialized.slice(0, 512));

  return {
    responseShape,
    ...(responseSummary === undefined || responseSummary.length === 0 ? {} : { responseSummary })
  };
}

function parseJsonLikeString(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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

function isTextualContentType(contentType: string): boolean {
  return /json|text|xml|javascript|x-www-form-urlencoded/i.test(contentType);
}

function countRedirects(request: Request | null): number {
  let count = 0;
  let current = request?.redirectedFrom() ?? null;
  while (current !== null) {
    count += 1;
    current = current.redirectedFrom();
  }
  return count;
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

function originFor(url: string, baseUrl: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return new URL(baseUrl).origin;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
