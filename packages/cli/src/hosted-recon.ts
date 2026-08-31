import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  createPlaywrightBrowserClient,
  defaultRuntimeResourceLimits,
  type RuntimeBrowserClient,
  type RuntimeResourceLimits
} from "@descuff/analyzer-runtime";

export type HostedReconConfidence = "observed" | "inferred" | "unknown" | "blocked";
export type HostedReconBlockerCode =
  | "HOSTED_FETCH_FAILED"
  | "HOSTED_ROBOTS_BLOCKED"
  | "HOSTED_CRAWL_BUDGET_EXCEEDED"
  | "HOSTED_ORIGIN_BLOCKED"
  | "HOSTED_SCENARIO_MALFORMED"
  | "HOSTED_SCENARIO_NOT_FOUND"
  | "HOSTED_SCENARIO_UNSAFE"
  | "HOSTED_DESTINATION_NOT_REACHED"
  | "HOSTED_BASELINE_COMPARE_FAILED"
  | "HOSTED_RECON_INCONCLUSIVE"
  | "HOSTED_EVIDENCE_REDACTED"
  | "HOSTED_BROWSER_RENDER_FAILED";

export interface HostedReconArgs {
  targetUrl: string;
  projectRoot: string;
  maxPages: number;
  browserRendering: boolean;
  scenarioId?: string;
  comparePath?: string;
  browserRenderer?: HostedReconBrowserRenderer;
}

export interface HostedReconEvidence {
  id: string;
  confidence: HostedReconConfidence;
  summary: string;
  url?: string;
}

export interface HostedReconStandardObservation {
  kind: "llms-txt" | "schema-org" | "openapi" | "api-catalog" | "webmcp";
  status: HostedReconConfidence;
  url?: string;
  detail: string;
  evidenceIds: string[];
}

export interface HostedReconPageObservation {
  url: string;
  status: number;
  title?: string;
  headings: string[];
  links: string[];
  forms: HostedReconFormObservation[];
  jsonLdCount: number;
  browser?: HostedReconBrowserObservation;
  confidence: HostedReconConfidence;
  evidenceIds: string[];
}

export interface HostedReconBrowserObservation {
  url: string;
  status: number;
  title?: string;
  headings: string[];
  formCount: number;
  jsonLdCount: number;
  networkRequests: number;
  webMcpSupported: boolean;
  webMcpTools: string[];
  confidence: HostedReconConfidence;
  evidenceIds: string[];
}

export interface HostedReconFormObservation {
  method: string;
  action?: string;
  fields: string[];
  confidence: HostedReconConfidence;
}

export interface HostedReconScenarioResult {
  id: string;
  title: string;
  intent: string;
  destinationReached: boolean;
  confidence: HostedReconConfidence;
  evidenceSurfaces: string[];
  blockers: HostedReconBlocker[];
  effort: {
    pagesVisited: number;
    browserActions: number;
    screenshots: number;
    domQueries: number;
    accessibilityQueries: number;
    networkObservations: number;
    standardsLookups: number;
    webMcpToolDiscoveryCalls: number;
    webMcpToolExecutions: number;
  };
  evidenceIds: string[];
}

export interface HostedReconResult {
  schemaVersion: "0.1.0";
  targetUrl: string;
  recordedAt: string;
  toolVersion: string;
  command: string;
  budgets: {
    maxPages: number;
    browserRendering: boolean;
  };
  standards: HostedReconStandardObservation[];
  pages: HostedReconPageObservation[];
  scenarioDefinitions: NormalizedHostedScenario[];
  scenarios: HostedReconScenarioResult[];
  confidenceSummary: Record<HostedReconConfidence, number>;
  blockers: HostedReconBlocker[];
  redaction: {
    queryParametersRedacted: number;
    responseBodiesStored: 0;
    credentialsStored: false;
  };
  comparison?: HostedReconComparison;
  evidence: HostedReconEvidence[];
}

export interface HostedReconComparison {
  comparedTo: string;
  pagesVisited: string;
  standardsVisible: string;
  destinationsReached: string;
  blockers: string;
}

export interface HostedReconBlocker {
  code: HostedReconBlockerCode;
  message: string;
  confidence: "blocked";
  url?: string;
}

interface HostedReconRuntimeConfig {
  hostedBrowserAgentScenarios?: unknown;
  browserAgentScenarios?: unknown;
}

export interface NormalizedHostedScenario {
  id: string;
  title: string;
  intent: string;
  destinationCriteria: string[];
  expectedEvidenceSurfaces: string[];
  risk: string;
}

interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

interface HostedRobotsRules {
  url: string;
  disallow: string[];
  evidenceIds: string[];
}

interface ExtractedLinks {
  sameOrigin: URL[];
  blockedOrigins: URL[];
}

export interface HostedReconBrowserRenderer {
  render(url: URL): Promise<HostedReconBrowserRenderResult>;
  dispose(): Promise<void>;
}

export interface HostedReconBrowserRenderResult {
  url: string;
  status: number;
  title?: string;
  headings: string[];
  formCount: number;
  jsonLdCount: number;
  networkRequests: number;
  webMcpSupported: boolean;
  webMcpTools: string[];
}

export function parseHostedReconArgs(args: string[], cwd: string): HostedReconArgs {
  const targetUrl = parsePositionals(args)[0];
  if (targetUrl === undefined) {
    throw new Error("descuff recon requires an absolute http:// or https:// URL.");
  }

  const maxPages = parsePositiveIntegerFlag(args, "--max-pages", 5);
  const browserRendering = args.includes("--browser");
  const scenarioId = parseStringFlag(args, "--scenario");
  const comparePath = parseStringFlag(args, "--compare");

  validateHostedUrl(targetUrl);

  return {
    targetUrl,
    projectRoot: cwd,
    maxPages,
    browserRendering,
    ...(scenarioId === undefined ? {} : { scenarioId }),
    ...(comparePath === undefined ? {} : { comparePath: resolve(cwd, comparePath) })
  };
}

export async function runHostedReconCommand(args: HostedReconArgs): Promise<string> {
  const recon = await runHostedRecon(args);
  const artifactRoot = join(args.projectRoot, ".descuff");

  await writeJson(join(artifactRoot, "hosted-recon.json"), recon);
  await writeMarkdown(join(artifactRoot, "hosted-recon.md"), renderHostedReconMarkdown(recon));
  await writeJson(join(artifactRoot, "hosted-baseline.json"), withoutComparison(recon));

  if (recon.scenarios.length > 0) {
    await writeJson(
      join(artifactRoot, "hosted-browser-agent-scenarios.json"),
      recon.scenarioDefinitions
    );
    await writeJson(join(artifactRoot, "hosted-browser-agent-results.json"), recon.scenarios);
    await writeMarkdown(
      join(artifactRoot, "hosted-browser-agent-results.md"),
      renderHostedBrowserAgentResultsMarkdown(recon)
    );
  }

  if (recon.comparison !== undefined) {
    await writeMarkdown(
      join(artifactRoot, "hosted-before-after.md"),
      renderHostedComparison(recon)
    );
  }

  return renderHostedReconSummary(recon, artifactRoot);
}

async function runHostedRecon(args: HostedReconArgs): Promise<HostedReconResult> {
  const target = new URL(args.targetUrl);
  const evidence: HostedReconEvidence[] = [];
  const blockers: HostedReconBlocker[] = [];
  const redaction = {
    queryParametersRedacted: countSensitiveQueryParams(target),
    responseBodiesStored: 0 as const,
    credentialsStored: false as const
  };
  if (redaction.queryParametersRedacted > 0) {
    pushBlocker(
      blockers,
      "HOSTED_EVIDENCE_REDACTED",
      `Redacted ${redaction.queryParametersRedacted} sensitive query parameter(s) from hosted recon artifacts.`,
      target.href
    );
  }

  const robots = await inspectRobots(target, evidence);
  const pages = await inspectPages(target, args.maxPages, robots, evidence, blockers);
  await inspectBrowserRenderedPages(target, pages, args, evidence, blockers);
  const standards = await inspectStandards(target, pages, robots, evidence, blockers);
  const scenarioDefinitions = await selectHostedScenarios(args, blockers);
  const scenarios = scenarioDefinitions.map((scenario) =>
    evaluateHostedScenario(scenario, pages, standards, evidence)
  );
  addInconclusiveBlockerIfNeeded(pages, standards, blockers);
  const comparison = await compareHostedBaseline(args, pages, standards, scenarios, blockers);
  const result: HostedReconResult = {
    schemaVersion: "0.1.0",
    targetUrl: sanitizeUrl(target.href),
    recordedAt: new Date(0).toISOString(),
    toolVersion: "0.16.1",
    command: `descuff recon ${sanitizeUrl(target.href)}${args.browserRendering ? " --browser" : ""}`,
    budgets: {
      maxPages: args.maxPages,
      browserRendering: args.browserRendering
    },
    standards,
    pages,
    scenarioDefinitions,
    scenarios,
    confidenceSummary: summarizeConfidence([
      ...standards.map((standard) => standard.status),
      ...pages.map((page) => page.confidence),
      ...blockers.map((blocker) => blocker.confidence),
      ...evidence.map((item) => item.confidence)
    ]),
    blockers,
    redaction,
    ...(comparison === undefined ? {} : { comparison }),
    evidence
  };

  return result;
}

async function inspectPages(
  target: URL,
  maxPages: number,
  robots: HostedRobotsRules | undefined,
  evidence: HostedReconEvidence[],
  blockers: HostedReconBlocker[]
): Promise<HostedReconPageObservation[]> {
  const pending = [target];
  const visited = new Set<string>();
  const pages: HostedReconPageObservation[] = [];

  while (pending.length > 0 && pages.length < maxPages) {
    const current = pending.shift();
    if (current === undefined) {
      break;
    }
    const normalized = stripHash(current);
    if (visited.has(normalized.href)) {
      continue;
    }
    if (isRobotsBlocked(normalized, robots)) {
      pushBlocker(
        blockers,
        "HOSTED_ROBOTS_BLOCKED",
        `Robots rules blocked hosted recon for ${sanitizeUrl(normalized.href)}.`,
        normalized.href
      );
      continue;
    }
    visited.add(normalized.href);

    let fetched: FetchResult;
    try {
      fetched = await fetchText(normalized);
    } catch (error) {
      pushBlocker(
        blockers,
        "HOSTED_FETCH_FAILED",
        `Fetch failed for ${sanitizeUrl(normalized.href)}: ${errorMessage(error)}`,
        normalized.href
      );
      continue;
    }

    if (!fetched.contentType.includes("text/html")) {
      continue;
    }

    const pageEvidence = pushEvidence(
      evidence,
      "observed",
      `Fetched public HTML page ${sanitizeUrl(fetched.url)} with status ${fetched.status}.`,
      fetched.url
    );
    const html = fetched.body;
    const links = extractLinks(html, normalized);
    for (const blockedUrl of links.blockedOrigins) {
      pushBlocker(
        blockers,
        "HOSTED_ORIGIN_BLOCKED",
        `Skipped cross-origin URL ${sanitizeUrl(blockedUrl.href)} from ${sanitizeUrl(normalized.href)}.`,
        blockedUrl.href
      );
    }

    const page = {
      url: sanitizeUrl(fetched.url),
      status: fetched.status,
      ...optionalText("title", extractTitle(html)),
      headings: extractHeadings(html),
      links: links.sameOrigin.map((url) => sanitizeUrl(url.href)),
      forms: extractForms(html, normalized),
      jsonLdCount: countJsonLd(html),
      confidence: "observed" as const,
      evidenceIds: [pageEvidence.id]
    };

    pages.push(page);

    for (const link of links.sameOrigin) {
      if (pages.length + pending.length >= maxPages) {
        continue;
      }
      if (!visited.has(stripHash(link).href)) {
        pending.push(link);
      }
    }
  }

  if (pending.length > 0) {
    pushBlocker(
      blockers,
      "HOSTED_CRAWL_BUDGET_EXCEEDED",
      `Crawl budget reached after ${maxPages} page(s).`
    );
  }

  return pages;
}

async function inspectRobots(
  target: URL,
  evidence: HostedReconEvidence[]
): Promise<HostedRobotsRules | undefined> {
  const robotsUrl = new URL("/robots.txt", target.origin);
  try {
    const response = await fetchText(robotsUrl);
    if (response.status < 200 || response.status >= 400) {
      return undefined;
    }
    const disallow = parseRobotsDisallow(response.body);
    const ref = pushEvidence(
      evidence,
      "observed",
      `Fetched robots.txt with ${disallow.length} disallow rule(s).`,
      response.url
    );
    return {
      url: sanitizeUrl(response.url),
      disallow,
      evidenceIds: [ref.id]
    };
  } catch {
    return undefined;
  }
}

async function inspectBrowserRenderedPages(
  target: URL,
  pages: HostedReconPageObservation[],
  args: HostedReconArgs,
  evidence: HostedReconEvidence[],
  blockers: HostedReconBlocker[]
): Promise<void> {
  if (!args.browserRendering && args.browserRenderer === undefined) {
    return;
  }

  let renderer: HostedReconBrowserRenderer;
  try {
    renderer =
      args.browserRenderer ?? (await createPlaywrightHostedBrowserRenderer(target, args.maxPages));
  } catch (error) {
    pushBlocker(
      blockers,
      "HOSTED_BROWSER_RENDER_FAILED",
      `Hosted browser rendering could not start: ${errorMessage(error)}.`
    );
    return;
  }

  try {
    for (const page of pages) {
      const pageUrl = new URL(page.url);
      if (pageUrl.origin !== target.origin) {
        pushBlocker(
          blockers,
          "HOSTED_ORIGIN_BLOCKED",
          `Skipped browser rendering for cross-origin URL ${sanitizeUrl(pageUrl.href)}.`,
          pageUrl.href
        );
        continue;
      }

      try {
        const rendered = await renderer.render(pageUrl);
        const renderEvidence = pushEvidence(
          evidence,
          "observed",
          `Browser rendered ${sanitizeUrl(rendered.url)} with ${rendered.headings.length} heading(s), ${rendered.formCount} form(s), ${rendered.jsonLdCount} JSON-LD block(s), and ${rendered.networkRequests} network request(s).`,
          rendered.url
        );
        page.browser = {
          ...rendered,
          url: sanitizeUrl(rendered.url),
          confidence: "observed",
          evidenceIds: [renderEvidence.id]
        };
        page.jsonLdCount = Math.max(page.jsonLdCount, rendered.jsonLdCount);
        page.headings = uniqueSorted([...page.headings, ...rendered.headings]);
        if (page.title === undefined && rendered.title !== undefined) {
          page.title = rendered.title;
        }
      } catch (error) {
        pushBlocker(
          blockers,
          "HOSTED_BROWSER_RENDER_FAILED",
          `Hosted browser rendering failed for ${sanitizeUrl(pageUrl.href)}: ${errorMessage(error)}.`,
          pageUrl.href
        );
      }
    }
  } finally {
    await renderer.dispose();
  }
}

async function inspectStandards(
  target: URL,
  pages: HostedReconPageObservation[],
  robots: HostedRobotsRules | undefined,
  evidence: HostedReconEvidence[],
  blockers: HostedReconBlocker[]
): Promise<HostedReconStandardObservation[]> {
  const observations: HostedReconStandardObservation[] = [];

  observations.push(
    await probeStandard(
      target,
      "/llms.txt",
      "llms-txt",
      "Public llms.txt was reachable.",
      evidence,
      robots,
      blockers
    )
  );
  observations.push(createSchemaOrgObservation(pages, evidence));
  observations.push(
    await probeFirstStandard(
      target,
      ["/openapi.json", "/swagger.json", "/api/openapi.json"],
      "openapi",
      "Public OpenAPI document was reachable.",
      robots,
      evidence,
      blockers
    )
  );
  observations.push(
    await probeStandard(
      target,
      "/.well-known/api-catalog",
      "api-catalog",
      "Public API Catalog metadata was reachable.",
      evidence,
      robots,
      blockers
    )
  );
  observations.push(
    createBrowserWebMcpObservation(pages, evidence) ??
      (await probeStandard(
        target,
        "/webmcp.json",
        "webmcp",
        "Public WebMCP metadata was reachable. Browser runtime tool registration still requires scenario-gated validation.",
        evidence,
        robots,
        blockers
      ))
  );

  return observations;
}

async function createPlaywrightHostedBrowserRenderer(
  target: URL,
  maxPages: number
): Promise<HostedReconBrowserRenderer> {
  const limits = {
    ...defaultRuntimeResourceLimits,
    maxRoutes: maxPages,
    allowedOrigins: [target.origin],
    blockedOrigins: []
  };
  const browser = await createPlaywrightBrowserClient(target.origin, limits);
  return new PlaywrightHostedBrowserRenderer(browser, limits);
}

class PlaywrightHostedBrowserRenderer implements HostedReconBrowserRenderer {
  constructor(
    private readonly browser: RuntimeBrowserClient,
    private readonly limits: Required<RuntimeResourceLimits>
  ) {}

  async render(url: URL): Promise<HostedReconBrowserRenderResult> {
    const rendered = await this.browser.visit(`${url.pathname}${url.search}`, this.limits, []);
    return {
      url: rendered.url,
      status: rendered.status,
      ...(rendered.title === undefined ? {} : { title: rendered.title }),
      headings: rendered.headings,
      formCount: rendered.formCount,
      jsonLdCount: rendered.jsonLdCount,
      networkRequests: rendered.network.length,
      webMcpSupported: rendered.webMcpSupported,
      webMcpTools: rendered.webMcpTools.map((tool) => tool.name)
    };
  }

  async dispose(): Promise<void> {
    await this.browser.dispose();
  }
}

function createBrowserWebMcpObservation(
  pages: HostedReconPageObservation[],
  evidence: HostedReconEvidence[]
): HostedReconStandardObservation | undefined {
  const pagesWithTools = pages.filter((page) => (page.browser?.webMcpTools.length ?? 0) > 0);
  if (pagesWithTools.length === 0) {
    return undefined;
  }

  const toolCount = pagesWithTools.reduce(
    (total, page) => total + (page.browser?.webMcpTools.length ?? 0),
    0
  );
  const ref = pushEvidence(
    evidence,
    "observed",
    `Browser discovered ${toolCount} WebMCP tool(s) across ${pagesWithTools.length} rendered page(s).`
  );

  return {
    kind: "webmcp",
    status: "observed",
    detail: "Browser runtime WebMCP tool registration was observed.",
    evidenceIds: [ref.id]
  };
}

async function selectHostedScenarios(
  args: HostedReconArgs,
  blockers: HostedReconBlocker[]
): Promise<NormalizedHostedScenario[]> {
  const scenarios = await readHostedScenarios(args.projectRoot, blockers);
  const selected =
    args.scenarioId === undefined
      ? scenarios
      : scenarios.filter((scenario) => scenario.id === args.scenarioId);

  if (args.scenarioId !== undefined && selected.length === 0) {
    pushBlocker(
      blockers,
      "HOSTED_SCENARIO_NOT_FOUND",
      `Hosted scenario not found: ${args.scenarioId}.`
    );
  }

  return selected;
}

function evaluateHostedScenario(
  scenario: NormalizedHostedScenario,
  pages: HostedReconPageObservation[],
  standards: HostedReconStandardObservation[],
  evidence: HostedReconEvidence[]
): HostedReconScenarioResult {
  if (scenario.risk !== "read-only") {
    return {
      id: scenario.id,
      title: scenario.title,
      intent: scenario.intent,
      destinationReached: false,
      confidence: "blocked",
      evidenceSurfaces: [],
      blockers: [
        createBlocker(
          "HOSTED_SCENARIO_UNSAFE",
          `Scenario risk is ${scenario.risk}; hosted recon is read-only by default.`
        )
      ],
      effort: emptyEffort(pages.length),
      evidenceIds: []
    };
  }

  const haystack = [
    ...pages.flatMap((page) => [page.url, page.title ?? "", ...page.headings, ...page.links]),
    ...standards.map((standard) => `${standard.kind} ${standard.status} ${standard.url ?? ""}`)
  ]
    .join("\n")
    .toLowerCase();
  const destinationReached = scenario.destinationCriteria.some((criterion) =>
    haystack.includes(criterion.toLowerCase())
  );
  const evidenceSurfaces = scenario.expectedEvidenceSurfaces.filter((surface) =>
    isEvidenceSurfaceObserved(surface, pages, standards)
  );
  const scenarioEvidence = pushEvidence(
    evidence,
    destinationReached ? "observed" : "inferred",
    destinationReached
      ? `Hosted scenario ${scenario.id} reached its destination criteria.`
      : `Hosted scenario ${scenario.id} did not reach its destination criteria from public evidence.`
  );

  return {
    id: scenario.id,
    title: scenario.title,
    intent: scenario.intent,
    destinationReached,
    confidence: destinationReached ? "observed" : "inferred",
    evidenceSurfaces,
    blockers: destinationReached
      ? []
      : [
          createBlocker("HOSTED_DESTINATION_NOT_REACHED", "Destination criteria were not observed.")
        ],
    effort: {
      pagesVisited: pages.length,
      browserActions: Math.max(0, pages.length - 1),
      screenshots: pages.length,
      domQueries: pages.reduce(
        (total, page) => total + page.headings.length + page.forms.length,
        0
      ),
      accessibilityQueries: pages.reduce((total, page) => total + page.forms.length, 0),
      networkObservations: pages.length,
      standardsLookups: standards.length,
      webMcpToolDiscoveryCalls: standards.some(
        (standard) => standard.kind === "webmcp" && standard.status === "observed"
      )
        ? 1
        : 0,
      webMcpToolExecutions: 0
    },
    evidenceIds: [scenarioEvidence.id]
  };
}

async function probeFirstStandard(
  target: URL,
  paths: string[],
  kind: HostedReconStandardObservation["kind"],
  foundDetail: string,
  robots: HostedRobotsRules | undefined,
  evidence: HostedReconEvidence[],
  blockers: HostedReconBlocker[]
): Promise<HostedReconStandardObservation> {
  for (const path of paths) {
    const observation = await probeStandard(
      target,
      path,
      kind,
      foundDetail,
      evidence,
      robots,
      blockers
    );
    if (observation.status === "observed") {
      return observation;
    }
  }

  return {
    kind,
    status: "unknown",
    detail: `${kind} was not observed at common public locations.`,
    evidenceIds: []
  };
}

async function probeStandard(
  target: URL,
  path: string,
  kind: HostedReconStandardObservation["kind"],
  foundDetail: string,
  evidence: HostedReconEvidence[],
  robots?: HostedRobotsRules,
  blockers?: HostedReconBlocker[]
): Promise<HostedReconStandardObservation> {
  const url = new URL(path, target.origin);
  if (isRobotsBlocked(url, robots)) {
    if (blockers !== undefined) {
      pushBlocker(
        blockers,
        "HOSTED_ROBOTS_BLOCKED",
        `Robots rules blocked hosted recon for ${sanitizeUrl(url.href)}.`,
        url.href
      );
    }
    return {
      kind,
      status: "blocked",
      detail: `${kind} was blocked by robots rules at ${path}.`,
      evidenceIds: robots?.evidenceIds ?? []
    };
  }
  try {
    const response = await fetchText(url);
    if (response.status >= 200 && response.status < 400) {
      const ref = pushEvidence(evidence, "observed", foundDetail, response.url);
      return {
        kind,
        status: "observed",
        url: sanitizeUrl(response.url),
        detail: foundDetail,
        evidenceIds: [ref.id]
      };
    }
  } catch {
    return {
      kind,
      status: "unknown",
      detail: `${kind} could not be fetched from ${path}.`,
      evidenceIds: []
    };
  }

  return {
    kind,
    status: "unknown",
    detail: `${kind} was not observed at ${path}.`,
    evidenceIds: []
  };
}

function createSchemaOrgObservation(
  pages: HostedReconPageObservation[],
  evidence: HostedReconEvidence[]
): HostedReconStandardObservation {
  const jsonLdPages = pages.filter((page) => page.jsonLdCount > 0);
  if (jsonLdPages.length === 0) {
    return {
      kind: "schema-org",
      status: "unknown",
      detail: "Schema.org JSON-LD was not observed in inspected public pages.",
      evidenceIds: []
    };
  }

  const ref = pushEvidence(
    evidence,
    "observed",
    `Observed ${jsonLdPages.reduce((total, page) => total + page.jsonLdCount, 0)} JSON-LD block(s) across ${jsonLdPages.length} page(s).`
  );
  return {
    kind: "schema-org",
    status: "observed",
    detail: "Schema.org JSON-LD was observed in rendered HTML.",
    evidenceIds: [ref.id]
  };
}

async function compareHostedBaseline(
  args: HostedReconArgs,
  pages: HostedReconPageObservation[],
  standards: HostedReconStandardObservation[],
  scenarios: HostedReconScenarioResult[],
  blockers: HostedReconBlocker[]
): Promise<HostedReconComparison | undefined> {
  if (args.comparePath === undefined) {
    return undefined;
  }

  try {
    const baseline = JSON.parse(await readFile(args.comparePath, "utf8")) as HostedReconResult;
    const baselinePages = Array.isArray(baseline.pages) ? baseline.pages : [];
    const baselineStandards = Array.isArray(baseline.standards) ? baseline.standards : [];
    const baselineScenarios = Array.isArray(baseline.scenarios) ? baseline.scenarios : [];
    const baselineBlockers = Array.isArray(baseline.blockers) ? baseline.blockers : [];
    return {
      comparedTo: args.comparePath,
      pagesVisited: `${baselinePages.length} -> ${pages.length}`,
      standardsVisible: `${countObservedStandards(baselineStandards)} -> ${countObservedStandards(standards)}`,
      destinationsReached: `${countReachedScenarios(baselineScenarios)} -> ${countReachedScenarios(scenarios)}`,
      blockers: `${baselineBlockers.length} -> ${blockers.length}`
    };
  } catch (error) {
    pushBlocker(
      blockers,
      "HOSTED_BASELINE_COMPARE_FAILED",
      `Hosted baseline comparison failed: ${errorMessage(error)}.`
    );
    return undefined;
  }
}

function renderHostedReconSummary(recon: HostedReconResult, artifactRoot: string): string {
  const observedStandards = recon.standards
    .filter((standard) => standard.status === "observed")
    .map((standard) => standard.kind);
  const reached = countReachedScenarios(recon.scenarios);

  return [
    `descuff recon completed`,
    `Target: ${recon.targetUrl}`,
    `Pages inspected: ${recon.pages.length}`,
    `Standards visible: ${observedStandards.join(", ") || "none"}`,
    `Browser-agent scenarios: ${recon.scenarios.length}`,
    `Destinations reached: ${recon.scenarios.length === 0 ? "0/0" : `${reached}/${recon.scenarios.length}`}`,
    `Confidence: ${recon.confidenceSummary.observed} observed, ${recon.confidenceSummary.inferred} inferred, ${recon.confidenceSummary.unknown} unknown, ${recon.confidenceSummary.blocked} blocked`,
    `Blockers: ${recon.blockers.length}`,
    "",
    "Reports:",
    `  ${join(artifactRoot, "hosted-recon.md")}`,
    ...(recon.scenarios.length === 0
      ? []
      : [`  ${join(artifactRoot, "hosted-browser-agent-results.md")}`]),
    ...(recon.comparison === undefined
      ? []
      : [`  ${join(artifactRoot, "hosted-before-after.md")}`]),
    ""
  ].join("\n");
}

function renderHostedReconMarkdown(recon: HostedReconResult): string {
  return [
    "# Hosted Recon",
    "",
    `Target: ${recon.targetUrl}`,
    `Pages inspected: ${recon.pages.length}`,
    `Confidence: ${recon.confidenceSummary.observed} observed, ${recon.confidenceSummary.inferred} inferred, ${recon.confidenceSummary.unknown} unknown, ${recon.confidenceSummary.blocked} blocked`,
    "",
    "Hosted recon uses public read-only evidence. It is not source-backed local validation.",
    "",
    "## Standards",
    "",
    ...recon.standards.map(
      (standard) =>
        `- ${standard.kind}: ${standard.status}${standard.url === undefined ? "" : ` (${standard.url})`} - ${standard.detail}`
    ),
    "",
    "## Pages",
    "",
    ...recon.pages.flatMap((page) => [
      `### ${page.url}`,
      "",
      `- Status: ${page.status}`,
      `- Title: ${page.title ?? "unknown"}`,
      `- Headings: ${page.headings.join(", ") || "none"}`,
      `- Links: ${page.links.length}`,
      `- Forms: ${page.forms.length}`,
      `- JSON-LD blocks: ${page.jsonLdCount}`,
      ...renderHostedBrowserObservation(page),
      ""
    ]),
    "## Blockers And Limits",
    "",
    ...(recon.blockers.length === 0
      ? ["- none"]
      : recon.blockers.map((blocker) => `- ${blocker.code}: ${blocker.message}`)),
    "",
    "## Redaction",
    "",
    `- Query parameters redacted: ${recon.redaction.queryParametersRedacted}`,
    `- Response bodies stored: ${recon.redaction.responseBodiesStored}`,
    `- Credentials stored: ${String(recon.redaction.credentialsStored)}`,
    ""
  ].join("\n");
}

function renderHostedBrowserObservation(page: HostedReconPageObservation): string[] {
  if (page.browser === undefined) {
    return ["- Browser rendering: disabled"];
  }

  return [
    "- Browser rendering: observed",
    `- Browser-rendered status: ${page.browser.status}`,
    `- Browser-rendered forms: ${page.browser.formCount}`,
    `- Browser network requests: ${page.browser.networkRequests}`,
    `- Browser WebMCP tools: ${page.browser.webMcpTools.join(", ") || "none"}`
  ];
}

function renderHostedBrowserAgentResultsMarkdown(recon: HostedReconResult): string {
  return [
    "# Hosted Browser-Agent Results",
    "",
    "These results measure browser-agent reachability and usefulness from public hosted evidence. They are not full workflow automation.",
    "",
    ...recon.scenarios.flatMap((scenario) => [
      `## ${scenario.title}`,
      "",
      `- ID: ${scenario.id}`,
      `- Intent: ${scenario.intent}`,
      `- Destination reached: ${String(scenario.destinationReached)}`,
      `- Confidence: ${scenario.confidence}`,
      `- Evidence surfaces: ${scenario.evidenceSurfaces.join(", ") || "none"}`,
      `- Pages visited: ${scenario.effort.pagesVisited}`,
      `- Browser actions: ${scenario.effort.browserActions}`,
      `- Screenshots: ${scenario.effort.screenshots}`,
      `- DOM queries: ${scenario.effort.domQueries}`,
      `- Standards lookups: ${scenario.effort.standardsLookups}`,
      `- WebMCP tool executions: ${scenario.effort.webMcpToolExecutions}`,
      `- Blockers: ${formatBlockers(scenario.blockers)}`,
      ""
    ])
  ].join("\n");
}

function renderHostedComparison(recon: HostedReconResult): string {
  if (recon.comparison === undefined) {
    return "# Hosted Before/After\n\nNo hosted baseline comparison was requested.\n";
  }

  return [
    "# Hosted Before/After",
    "",
    `Compared to: ${recon.comparison.comparedTo}`,
    `Pages visited: ${recon.comparison.pagesVisited}`,
    `Standards visible: ${recon.comparison.standardsVisible}`,
    `Destinations reached: ${recon.comparison.destinationsReached}`,
    `Blockers: ${recon.comparison.blockers}`,
    ""
  ].join("\n");
}

async function readHostedScenarios(
  projectRoot: string,
  blockers: HostedReconBlocker[]
): Promise<NormalizedHostedScenario[]> {
  let raw: HostedReconRuntimeConfig;
  try {
    raw = JSON.parse(
      await readFile(join(projectRoot, ".descuff", "runtime.json"), "utf8")
    ) as HostedReconRuntimeConfig;
  } catch {
    return [];
  }

  const candidates = Array.isArray(raw.hostedBrowserAgentScenarios)
    ? raw.hostedBrowserAgentScenarios
    : raw.browserAgentScenarios;
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.flatMap((candidate, index) =>
    normalizeHostedScenario(candidate, `scenario[${index}]`, blockers)
  );
}

function normalizeHostedScenario(
  candidate: unknown,
  label: string,
  blockers: HostedReconBlocker[]
): NormalizedHostedScenario[] {
  if (!isRecord(candidate)) {
    pushBlocker(blockers, "HOSTED_SCENARIO_MALFORMED", `${label} must be an object.`);
    return [];
  }
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.intent !== "string"
  ) {
    pushBlocker(
      blockers,
      "HOSTED_SCENARIO_MALFORMED",
      `${label} must include string id, title, and intent fields.`
    );
    return [];
  }

  const destinationCriteria = parseStringArray(candidate.destinationCriteria);
  const successCriteria = parseStringArray(candidate.successCriteria);
  const expectedEvidenceSurfaces = parseStringArray(candidate.expectedEvidenceSurfaces);
  const criteria = destinationCriteria.length > 0 ? destinationCriteria : successCriteria;
  if (criteria.length === 0) {
    pushBlocker(
      blockers,
      "HOSTED_SCENARIO_MALFORMED",
      `Hosted scenario ${candidate.id} must include destinationCriteria or successCriteria.`
    );
    return [];
  }

  return [
    {
      id: candidate.id,
      title: candidate.title,
      intent: candidate.intent,
      destinationCriteria: criteria,
      expectedEvidenceSurfaces,
      risk: typeof candidate.risk === "string" ? candidate.risk : "read-only"
    }
  ];
}

function isEvidenceSurfaceObserved(
  surface: string,
  pages: HostedReconPageObservation[],
  standards: HostedReconStandardObservation[]
): boolean {
  if (surface === "dom" || surface === "accessibility") {
    return pages.length > 0;
  }
  if (surface === "json-ld") {
    return pages.some((page) => page.jsonLdCount > 0);
  }
  return standards.some((standard) => standard.kind === surface && standard.status === "observed");
}

function addInconclusiveBlockerIfNeeded(
  pages: HostedReconPageObservation[],
  standards: HostedReconStandardObservation[],
  blockers: HostedReconBlocker[]
): void {
  if (pages.length > 0 || standards.some((standard) => standard.status === "observed")) {
    return;
  }
  pushBlocker(
    blockers,
    "HOSTED_RECON_INCONCLUSIVE",
    "Hosted recon did not observe any public pages or standards for this target."
  );
}

async function fetchText(url: URL): Promise<FetchResult> {
  const response = await globalThis.fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "descuff-hosted-recon/0.1"
    }
  });
  const contentType = response.headers.get("content-type") ?? "";
  const responseUrl = response.url.length === 0 ? url.href : response.url;
  return {
    url: sanitizeUrl(responseUrl),
    status: response.status,
    contentType,
    body: await response.text()
  };
}

function validateHostedUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("descuff recon requires an absolute http:// or https:// URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("descuff recon only supports http:// and https:// URLs.");
  }
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanText(match?.[1]);
}

function extractHeadings(html: string): string[] {
  return [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) => cleanText(match[1]))
    .filter((value): value is string => value !== undefined)
    .slice(0, 20);
}

function extractLinks(html: string, base: URL): ExtractedLinks {
  const sameOrigin: URL[] = [];
  const blockedOrigins: URL[] = [];
  for (const match of html.matchAll(/<a\b[^>]*\shref=["']([^"']+)["'][^>]*>/gi)) {
    const href = match[1];
    if (
      href === undefined ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }
    try {
      const url = new URL(href, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }
      if (url.origin === base.origin) {
        sameOrigin.push(stripHash(url));
      } else {
        blockedOrigins.push(stripHash(url));
      }
    } catch {
      continue;
    }
  }
  return {
    sameOrigin: uniqueUrls(sameOrigin),
    blockedOrigins: uniqueUrls(blockedOrigins)
  };
}

function extractForms(html: string, base: URL): HostedReconFormObservation[] {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const action = extractAttribute(attrs, "action");
    const method = extractAttribute(attrs, "method")?.toUpperCase() ?? "GET";
    return {
      method,
      ...(action === undefined ? {} : { action: sanitizeUrl(new URL(action, base).href) }),
      fields: extractFormFields(body),
      confidence: method === "GET" ? "observed" : "blocked"
    };
  });
}

function extractFormFields(html: string): string[] {
  const fields = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].flatMap((match) => {
    const attrs = match[2] ?? "";
    return extractAttribute(attrs, "aria-label") ?? extractAttribute(attrs, "name") ?? [];
  });
  return uniqueSorted(fields.filter((field): field is string => typeof field === "string"));
}

function extractAttribute(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}=["']([^"']+)["']`, "i");
  return cleanText(attrs.match(pattern)?.[1]);
}

function countJsonLd(html: string): number {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/gi)].length;
}

function cleanText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length === 0 ? undefined : decodeHtmlEntities(cleaned);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function sanitizeUrl(value: string): string {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (isSensitiveQueryKey(key)) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  url.hash = "";
  return url.href;
}

function countSensitiveQueryParams(url: URL): number {
  return [...url.searchParams.keys()].filter((key) => isSensitiveQueryKey(key)).length;
}

function isSensitiveQueryKey(key: string): boolean {
  return /(token|key|secret|password|passwd|auth|session|cookie|credential)/i.test(key);
}

function stripHash(url: URL): URL {
  const clone = new URL(url.href);
  clone.hash = "";
  return clone;
}

const hostedReconFlagsWithValues = new Set(["--max-pages", "--scenario", "--compare", "--config"]);

function parsePositiveIntegerFlag(args: string[], name: string, fallback: number): number {
  const raw = parseStringFlag(args, name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function parsePositionals(args: string[]): string[] {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith("--")) {
      if (
        !arg.includes("=") &&
        hostedReconFlagsWithValues.has(arg) &&
        args[index + 1] !== undefined &&
        !args[index + 1]?.startsWith("--")
      ) {
        index += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

function parseStringFlag(args: string[], name: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const value = args[index + 1];
      return value === undefined || value.startsWith("--") ? undefined : value;
    }
    if (arg?.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function summarizeConfidence(
  values: HostedReconConfidence[]
): Record<HostedReconConfidence, number> {
  const summary = { observed: 0, inferred: 0, unknown: 0, blocked: 0 };
  for (const confidence of values) {
    summary[confidence] += 1;
  }
  return summary;
}

function countObservedStandards(standards: HostedReconStandardObservation[]): number {
  return standards.filter((standard) => standard.status === "observed").length;
}

function countReachedScenarios(scenarios: HostedReconScenarioResult[]): number {
  return scenarios.filter((scenario) => scenario.destinationReached).length;
}

function emptyEffort(pagesVisited: number): HostedReconScenarioResult["effort"] {
  return {
    pagesVisited,
    browserActions: 0,
    screenshots: 0,
    domQueries: 0,
    accessibilityQueries: 0,
    networkObservations: 0,
    standardsLookups: 0,
    webMcpToolDiscoveryCalls: 0,
    webMcpToolExecutions: 0
  };
}

function createBlocker(
  code: HostedReconBlockerCode,
  message: string,
  url?: string
): HostedReconBlocker {
  return {
    code,
    message,
    confidence: "blocked",
    ...(url === undefined ? {} : { url: sanitizeUrl(url) })
  };
}

function pushBlocker(
  blockers: HostedReconBlocker[],
  code: HostedReconBlockerCode,
  message: string,
  url?: string
): HostedReconBlocker {
  const blocker = createBlocker(code, message, url);
  blockers.push(blocker);
  return blocker;
}

function formatBlockers(blockers: HostedReconBlocker[]): string {
  return blockers.length === 0
    ? "none"
    : blockers.map((blocker) => `${blocker.code}: ${blocker.message}`).join("; ");
}

function pushEvidence(
  evidence: HostedReconEvidence[],
  confidence: HostedReconConfidence,
  summary: string,
  url?: string
): HostedReconEvidence {
  const ref = {
    id: `hosted-evidence:${evidence.length + 1}`,
    confidence,
    summary,
    ...(url === undefined ? {} : { url: sanitizeUrl(url) })
  };
  evidence.push(ref);
  return ref;
}

function withoutComparison(recon: HostedReconResult): HostedReconResult {
  const clone = { ...recon };
  delete clone.comparison;
  return clone;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeMarkdown(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeMarkdown(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function uniqueUrls(urls: URL[]): URL[] {
  const byUrl = new Map<string, URL>();
  for (const url of urls) {
    byUrl.set(url.href, url);
  }
  return [...byUrl.values()];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function parseRobotsDisallow(body: string): string[] {
  const disallow: string[] = [];
  let appliesToDescuff = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim();
    if (line === undefined || line.length === 0) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      const agent = value.toLowerCase();
      appliesToDescuff = agent === "*" || agent.includes("descuff");
      continue;
    }
    if (key === "disallow" && appliesToDescuff && value.length > 0) {
      disallow.push(value);
    }
  }
  return uniqueSorted(disallow);
}

function isRobotsBlocked(url: URL, robots: HostedRobotsRules | undefined): boolean {
  if (robots === undefined) {
    return false;
  }
  return robots.disallow.some((rule) => robotsRuleMatches(url.pathname, rule));
}

function robotsRuleMatches(pathname: string, rule: string): boolean {
  if (rule.length === 0) {
    return false;
  }
  if (rule === "/") {
    return true;
  }
  return pathname.startsWith(rule);
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function optionalText<Key extends string>(
  key: Key,
  value: string | undefined
): Record<Key, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, string>);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
