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
  type BrowserAgentTaskPathObservation,
  type BrowserAgentTaskScenario,
  createEmptyStructuralAnalysis,
  type HttpMethod,
  type RuntimePageObservation,
  type RuntimeWebMcpToolExecutionObservation,
  type RuntimeWebMcpToolObservation,
  type StructuralAnalysis
} from "@descuff/ir";
import type { ProjectContext, RuntimeWebMcpToolScenario, StructuralAnalyzer } from "@descuff/core";
import { createBrowserAgentTaskBenchmark } from "./browser-agent-benchmark.js";
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
    const browserAgentScenarios = normalizeBrowserAgentScenarios(
      project.runtime.browserAgentScenarios ?? [],
      limits,
      analysis
    );
    analysis.browserAgentScenarios.push(...browserAgentScenarios);
    const implementedStandards = new Set(project.runtime.implementedStandards ?? []);

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

            for (const scenario of browserAgentScenarios.filter(
              (candidate) => candidate.startRoute === route
            )) {
              const benchmarkEvidence = runtimeEvidence(
                `browser-agent-scenario:${route}:${scenario.id}`,
                `Compared browser-agent UI/DOM effort with Descuff standards evidence for ${scenario.title}.`
              );
              analysis.browserAgentBenchmarks.push(
                createBrowserAgentTaskBenchmark({
                  id: `browser-agent-benchmark:${route}:${scenario.id}`,
                  taskName: scenario.title,
                  startingUrl: page.url,
                  before: createBaselineBrowserAgentPath(route, page, [
                    pageEvidence,
                    benchmarkEvidence
                  ]),
                  after: createStandardsBrowserAgentPath(scenario, page, implementedStandards, [
                    pageEvidence,
                    benchmarkEvidence
                  ]),
                  evidence: [benchmarkEvidence]
                })
              );
              analysis.evidence.items.push(benchmarkEvidence);
            }

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

              const scenario = project.runtime.webMcpToolScenarios?.find(
                (candidate) => candidate.toolName === execution.toolName
              );
              if (scenario !== undefined) {
                const benchmarkEvidence = runtimeEvidence(
                  `browser-agent-benchmark:${route}:${execution.toolName}`,
                  `Compared browser-agent UI/DOM effort with WebMCP tool ${execution.toolName} for ${route}.`
                );
                analysis.browserAgentBenchmarks.push(
                  createBrowserAgentTaskBenchmark({
                    id: `browser-agent-benchmark:${route}:${execution.toolName}`,
                    taskName: scenario.description ?? `Use ${execution.toolName}`,
                    startingUrl: page.url,
                    before: createBaselineBrowserAgentPath(route, page, [
                      pageEvidence,
                      benchmarkEvidence
                    ]),
                    after: createWebMcpBrowserAgentPath(execution, [
                      executionEvidence,
                      benchmarkEvidence
                    ]),
                    evidence: [benchmarkEvidence]
                  })
                );
                analysis.evidence.items.push(benchmarkEvidence);
              }
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

function createBaselineBrowserAgentPath(
  route: string,
  page: RuntimeBrowserPageResult,
  evidence: BrowserAgentTaskPathObservation["evidence"]
): BrowserAgentTaskPathObservation {
  const screenshots = page.webMcpSupported ? 1 : 2;
  const domQueries = Math.max(1, page.headings.length + page.formCount + page.jsonLdCount);
  const navigations = 1;
  const networkObservations = page.network.length;

  return {
    id: `browser-agent-path:before:${route}`,
    kind: "baseline-ui-dom",
    evidenceSurfaces: [
      "dom",
      "accessibility",
      ...(page.network.length > 0 ? ["network" as const] : [])
    ],
    browserActions: navigations + screenshots + domQueries + networkObservations,
    navigations,
    screenshots,
    domQueries,
    networkObservations,
    webMcpToolCalls: 0,
    result: page.status >= 200 && page.status < 400 ? "succeeded" : "failed",
    confidence: page.headings.length > 0 || page.formCount > 0 ? "medium" : "low",
    evidence
  };
}

function createStandardsBrowserAgentPath(
  scenario: BrowserAgentTaskScenario,
  page: RuntimeBrowserPageResult,
  implementedStandards: Set<BrowserAgentTaskScenario["expectedEvidenceSurfaces"][number]>,
  evidence: BrowserAgentTaskPathObservation["evidence"]
): BrowserAgentTaskPathObservation {
  const availableSurfaces = scenario.expectedEvidenceSurfaces.filter((surface) =>
    isEvidenceSurfaceAvailable(surface, page, implementedStandards)
  );
  const navigations = 1;
  const screenshots = 0;
  const domQueries =
    availableSurfaces.includes("dom") || availableSurfaces.includes("accessibility") ? 1 : 0;
  const networkObservations = availableSurfaces.includes("network") ? 1 : 0;
  const webMcpToolCalls = 0;
  const browserActions = navigations + screenshots + domQueries + networkObservations;
  const succeeded =
    availableSurfaces.length > 0 &&
    browserActions <= scenario.budgets.maxActions &&
    screenshots <= scenario.budgets.maxScreenshots &&
    domQueries <= scenario.budgets.maxDomQueries &&
    networkObservations <= scenario.budgets.maxNetworkObservations &&
    webMcpToolCalls <= scenario.budgets.maxToolCalls;

  return {
    id: `browser-agent-path:after:${scenario.id}`,
    kind: "descuff-standards",
    evidenceSurfaces: availableSurfaces,
    browserActions,
    navigations,
    screenshots,
    domQueries,
    networkObservations,
    webMcpToolCalls,
    result: succeeded ? "succeeded" : "inconclusive",
    confidence: succeeded && availableSurfaces.length > 1 ? "high" : succeeded ? "medium" : "low",
    evidence
  };
}

function createWebMcpBrowserAgentPath(
  execution: RuntimeWebMcpToolExecutionResult,
  evidence: BrowserAgentTaskPathObservation["evidence"]
): BrowserAgentTaskPathObservation {
  const navigations = 1;
  const domQueries = 1;
  const webMcpToolCalls = 1;

  return {
    id: `browser-agent-path:after:${execution.toolName}`,
    kind: "descuff-webmcp",
    evidenceSurfaces: ["webmcp"],
    browserActions: navigations + domQueries + webMcpToolCalls,
    navigations,
    screenshots: 0,
    domQueries,
    networkObservations: 0,
    webMcpToolCalls,
    result: execution.status === "executed" ? "succeeded" : "inconclusive",
    confidence: execution.status === "executed" ? "high" : "low",
    evidence
  };
}

function normalizeBrowserAgentScenarios(
  scenarios: unknown[],
  limits: Required<RuntimeResourceLimits>,
  analysis: StructuralAnalysis
): BrowserAgentTaskScenario[] {
  const normalized: BrowserAgentTaskScenario[] = [];

  for (const [index, rawScenario] of scenarios.entries()) {
    const malformedEvidence = runtimeEvidence(
      `browser-agent-scenario:${index}`,
      `Configured browser-agent scenario at index ${index}.`
    );
    const scenario = parseBrowserAgentScenario(rawScenario);
    if (scenario === undefined) {
      analysis.warnings.push({
        code: "BROWSER_AGENT_SCENARIO_MALFORMED",
        message: `Browser-agent scenario at index ${index} was skipped because it is malformed.`,
        evidence: [malformedEvidence]
      });
      analysis.evidence.items.push(malformedEvidence);
      continue;
    }

    const evidence = runtimeEvidence(
      `browser-agent-scenario:${scenario.id}`,
      `Configured browser-agent scenario ${scenario.title}.`
    );

    if (!isSafeBrowserAgentScenario(scenario)) {
      analysis.warnings.push({
        code: "BROWSER_AGENT_SCENARIO_UNSAFE",
        message: `Browser-agent scenario ${scenario.id} was skipped because it is not explicitly read-only.`,
        evidence: [evidence]
      });
      analysis.evidence.items.push(evidence);
      continue;
    }

    const unsupportedSurfaces = scenario.expectedEvidenceSurfaces.filter(
      (surface) => !isSupportedBrowserAgentEvidenceSurface(surface)
    );
    if (unsupportedSurfaces.length > 0) {
      analysis.warnings.push({
        code: "BROWSER_AGENT_SCENARIO_UNSUPPORTED_EVIDENCE",
        message: `Browser-agent scenario ${scenario.id} uses unsupported evidence surface(s): ${unsupportedSurfaces.join(", ")}.`,
        evidence: [evidence]
      });
      analysis.evidence.items.push(evidence);
      continue;
    }
    const expectedEvidenceSurfaces = scenario.expectedEvidenceSurfaces.filter(
      isSupportedBrowserAgentEvidenceSurface
    );

    normalized.push({
      id: scenario.id,
      title: scenario.title,
      intent: scenario.intent,
      startRoute: scenario.startRoute,
      allowedRoutes: scenario.allowedRoutes ?? [scenario.startRoute],
      allowedOrigins: scenario.allowedOrigins ?? limits.allowedOrigins,
      blockedOrigins: scenario.blockedOrigins ?? limits.blockedOrigins,
      inputs: scenario.inputs ?? {},
      successCriteria: scenario.successCriteria,
      expectedEvidenceSurfaces,
      budgets: {
        maxActions: scenario.budgets?.maxActions ?? 10,
        maxScreenshots: scenario.budgets?.maxScreenshots ?? 1,
        maxDomQueries: scenario.budgets?.maxDomQueries ?? 5,
        maxNetworkObservations: scenario.budgets?.maxNetworkObservations ?? 5,
        maxToolCalls: scenario.budgets?.maxToolCalls ?? 0
      },
      risk: scenario.risk ?? "read-only",
      evidence: [evidence]
    });
    analysis.evidence.items.push(evidence);
  }

  return normalized;
}

interface ParsedBrowserAgentScenario {
  id: string;
  title: string;
  intent: string;
  startRoute: string;
  allowedRoutes?: string[];
  allowedOrigins?: string[];
  blockedOrigins?: string[];
  inputs?: Record<string, unknown>;
  successCriteria: string[];
  expectedEvidenceSurfaces: string[];
  budgets?: {
    maxActions?: number;
    maxScreenshots?: number;
    maxDomQueries?: number;
    maxNetworkObservations?: number;
    maxToolCalls?: number;
  };
  risk?: BrowserAgentTaskScenario["risk"];
}

function parseBrowserAgentScenario(value: unknown): ParsedBrowserAgentScenario | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.intent) ||
    !isNonEmptyString(value.startRoute) ||
    !isNonEmptyStringArray(value.successCriteria) ||
    !isNonEmptyStringArray(value.expectedEvidenceSurfaces)
  ) {
    return undefined;
  }

  if (
    (value.allowedRoutes !== undefined && !isStringArray(value.allowedRoutes)) ||
    (value.allowedOrigins !== undefined && !isStringArray(value.allowedOrigins)) ||
    (value.blockedOrigins !== undefined && !isStringArray(value.blockedOrigins)) ||
    (value.inputs !== undefined && !isRecord(value.inputs)) ||
    (value.risk !== undefined && !isSupportedBrowserAgentRisk(value.risk)) ||
    (value.budgets !== undefined && !isValidBrowserAgentBudgets(value.budgets))
  ) {
    return undefined;
  }

  const parsed: ParsedBrowserAgentScenario = {
    id: value.id,
    title: value.title,
    intent: value.intent,
    startRoute: value.startRoute,
    successCriteria: value.successCriteria,
    expectedEvidenceSurfaces: value.expectedEvidenceSurfaces
  };
  if (value.allowedRoutes !== undefined) {
    parsed.allowedRoutes = value.allowedRoutes;
  }
  if (value.allowedOrigins !== undefined) {
    parsed.allowedOrigins = value.allowedOrigins;
  }
  if (value.blockedOrigins !== undefined) {
    parsed.blockedOrigins = value.blockedOrigins;
  }
  if (value.inputs !== undefined) {
    parsed.inputs = value.inputs;
  }
  if (value.budgets !== undefined) {
    parsed.budgets = value.budgets;
  }
  if (value.risk !== undefined) {
    parsed.risk = value.risk;
  }

  return parsed;
}

function isSafeBrowserAgentScenario(scenario: ParsedBrowserAgentScenario): boolean {
  return scenario.risk === undefined || scenario.risk === "read-only";
}

function isSupportedBrowserAgentRisk(value: unknown): value is BrowserAgentTaskScenario["risk"] {
  return (
    value === "read-only" ||
    value === "mutating" ||
    value === "high-consequence" ||
    value === "unknown"
  );
}

function isValidBrowserAgentBudgets(
  value: unknown
): value is ParsedBrowserAgentScenario["budgets"] {
  if (!isRecord(value)) {
    return false;
  }

  return [
    value.maxActions,
    value.maxScreenshots,
    value.maxDomQueries,
    value.maxNetworkObservations,
    value.maxToolCalls
  ].every((entry) => entry === undefined || isNonNegativeInteger(entry));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    isStringArray(value) && value.length > 0 && value.every((entry) => entry.trim().length > 0)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSupportedBrowserAgentEvidenceSurface(
  surface: string
): surface is BrowserAgentTaskScenario["expectedEvidenceSurfaces"][number] {
  return [
    "dom",
    "accessibility",
    "json-ld",
    "llms-txt",
    "openapi",
    "api-catalog",
    "network",
    "webmcp"
  ].includes(surface);
}

function isEvidenceSurfaceAvailable(
  surface: BrowserAgentTaskScenario["expectedEvidenceSurfaces"][number],
  page: RuntimeBrowserPageResult,
  implementedStandards: Set<BrowserAgentTaskScenario["expectedEvidenceSurfaces"][number]>
): boolean {
  switch (surface) {
    case "dom":
    case "accessibility":
      return page.headings.length > 0 || page.formCount > 0;
    case "json-ld":
      return page.jsonLdCount > 0;
    case "network":
      return page.network.length > 0;
    case "webmcp":
      return page.webMcpTools.length > 0;
    case "llms-txt":
    case "openapi":
    case "api-catalog":
      return implementedStandards.has(surface);
  }
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
