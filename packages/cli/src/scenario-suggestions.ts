import type {
  ApplicationModel,
  BrowserAgentEvidenceSurface,
  BrowserAgentTaskScenario,
  EvidenceRef,
  StructuralAnalysis
} from "@descuff/ir";

export interface ScenarioSuggestion extends BrowserAgentTaskScenario {
  source: "descuff-deterministic";
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface ScenarioSuggestionArtifact {
  schemaVersion: "0.1.0";
  generatedAt: string;
  source: "descuff-scenarios";
  suggestions: ScenarioSuggestion[];
  notes: string[];
}

export function createScenarioSuggestions(input: {
  model: ApplicationModel;
  analysis: StructuralAnalysis;
  generatedAt?: string;
}): ScenarioSuggestionArtifact {
  const suggestions: ScenarioSuggestion[] = [];
  const notes = [
    "Scenario suggestions are generated from Descuff evidence and are read-only by default.",
    "Review generated scenarios before using them for public before/after claims.",
    "Mutating and high-consequence flows require explicit safe validation scenarios before execution."
  ];

  addRouteSuggestions(suggestions, input.model);
  addEntitySuggestions(suggestions, input.model);
  addReadCapabilitySuggestions(suggestions, input.model);
  addReadApiSuggestions(suggestions, input.model);
  addFormDiscoverySuggestions(suggestions, input.analysis, input.model);

  return {
    schemaVersion: "0.1.0",
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    source: "descuff-scenarios",
    suggestions: uniqueSuggestions(suggestions).slice(0, 8),
    notes
  };
}

export function renderScenarioSuggestionsMarkdown(artifact: ScenarioSuggestionArtifact): string {
  return [
    "# Descuff Scenario Suggestions",
    "",
    "These are evidence-backed, read-only browser-agent scenarios. They are suggestions, not claims.",
    "",
    `Generated scenarios: ${artifact.suggestions.length}`,
    "",
    "## Review Rules",
    "",
    ...artifact.notes.map((note) => `- ${note}`),
    "",
    "## Scenarios",
    "",
    ...(artifact.suggestions.length === 0
      ? ["No safe read-only scenario suggestions were generated from the current evidence.", ""]
      : artifact.suggestions.flatMap((scenario) => [
          `### ${scenario.title}`,
          "",
          `- ID: ${scenario.id}`,
          `- Intent: ${scenario.intent}`,
          `- Start route: ${scenario.startRoute}`,
          `- Allowed routes: ${formatList(scenario.allowedRoutes)}`,
          `- Success criteria: ${formatList(scenario.successCriteria)}`,
          `- Expected evidence: ${formatList(scenario.expectedEvidenceSurfaces)}`,
          `- Risk: ${scenario.risk}`,
          `- Confidence: ${scenario.confidence}`,
          `- Rationale: ${scenario.rationale}`,
          ""
        ])),
    "## How To Use",
    "",
    "Run hosted recon with the generated suggestions:",
    "",
    "```bash",
    "npx descuff recon https://example.com --browser",
    "```",
    "",
    "Run one scenario by ID:",
    "",
    "```bash",
    "npx descuff recon https://example.com --scenario <scenario-id> --browser",
    "```",
    ""
  ].join("\n");
}

function addRouteSuggestions(suggestions: ScenarioSuggestion[], model: ApplicationModel): void {
  const publicRoutes = model.routes
    .filter((route) => route.visibility !== "authenticated")
    .sort((left, right) => routePriority(left.path) - routePriority(right.path))
    .slice(0, 4);

  for (const route of publicRoutes) {
    suggestions.push(
      createSuggestion({
        id: route.path === "/" ? "reach-homepage" : `reach-${slugForRoute(route.path)}`,
        title: route.path === "/" ? "Reach the homepage" : `Reach ${route.path}`,
        intent:
          route.path === "/"
            ? "Reach the public homepage and identify the main public surface."
            : `Reach the public ${route.path} page from hosted browser evidence.`,
        startRoute: "/",
        allowedRoutes: unique(["/", route.path]),
        successCriteria: successCriteriaForRoute(route.path, model),
        expectedEvidenceSurfaces: expectedRouteSurfaces(model),
        evidence: route.evidence,
        confidence: route.evidence.length > 0 ? "high" : "medium",
        rationale: `Route ${route.path} was discovered from ${route.sourceFile}.`
      })
    );
  }
}

function addEntitySuggestions(suggestions: ScenarioSuggestion[], model: ApplicationModel): void {
  for (const entity of model.entities.slice(0, 3)) {
    suggestions.push(
      createSuggestion({
        id: `find-${slug(entity.name)}`,
        title: `Find ${entity.name}`,
        intent: `Find public ${entity.name} information using browser-visible evidence.`,
        startRoute: startRoute(model),
        allowedRoutes: publicRoutePaths(model),
        successCriteria: unique([entity.name, entity.kind]),
        expectedEvidenceSurfaces: uniqueSurfaces(["dom", "json-ld", ...standardSurfaces(model)]),
        evidence: entity.evidence,
        confidence: entity.evidence.length > 0 ? "high" : "medium",
        rationale: `Entity ${entity.name} was identified from source evidence.`
      })
    );
  }
}

function addReadCapabilitySuggestions(
  suggestions: ScenarioSuggestion[],
  model: ApplicationModel
): void {
  const readableCapabilities = model.capabilities
    .filter(
      (capability) =>
        capability.operationType === "read" &&
        capability.risk === "PUBLIC_READ" &&
        capability.visibility === "public"
    )
    .slice(0, 4);

  for (const capability of readableCapabilities) {
    suggestions.push(
      createSuggestion({
        id: `use-${slug(capability.name)}`,
        title: capability.name,
        intent: `Find and use the public read-only ${capability.name} capability.`,
        startRoute: capability.linkedRoutes[0] ?? startRoute(model),
        allowedRoutes: unique([
          ...(capability.linkedRoutes.length > 0
            ? capability.linkedRoutes
            : publicRoutePaths(model))
        ]),
        successCriteria: unique([
          capability.name,
          ...capability.linkedRoutes,
          ...capability.linkedApis
        ]),
        expectedEvidenceSurfaces: uniqueSurfaces([
          "dom",
          "accessibility",
          ...standardSurfaces(model),
          ...(capability.linkedApis.length > 0 ? (["openapi", "api-catalog"] as const) : [])
        ]),
        evidence: capability.evidence,
        confidence: capability.confidence,
        rationale: `Capability ${capability.name} is public read-only and has linked evidence.`
      })
    );
  }
}

function addReadApiSuggestions(suggestions: ScenarioSuggestion[], model: ApplicationModel): void {
  const readApis = model.apis
    .filter((api) => api.sideEffect === "read" || api.method === "GET" || api.method === "HEAD")
    .slice(0, 4);

  for (const api of readApis) {
    suggestions.push(
      createSuggestion({
        id: `find-api-${slug(`${api.method}-${api.path}`)}`,
        title: `Find ${api.method} ${api.path}`,
        intent: `Find the public read API operation ${api.method} ${api.path}.`,
        startRoute: startRoute(model),
        allowedRoutes: publicRoutePaths(model),
        successCriteria: unique([`${api.method} ${api.path}`, api.path]),
        expectedEvidenceSurfaces: uniqueSurfaces(["openapi", "api-catalog", "network"]),
        evidence: api.evidence,
        confidence: api.evidence.length > 0 ? "high" : "medium",
        rationale: `Read API operation ${api.method} ${api.path} was discovered from source evidence.`
      })
    );
  }
}

function addFormDiscoverySuggestions(
  suggestions: ScenarioSuggestion[],
  analysis: StructuralAnalysis,
  model: ApplicationModel
): void {
  for (const form of analysis.forms.slice(0, 4)) {
    const action = form.action ?? form.sourceFile;
    suggestions.push(
      createSuggestion({
        id: `find-form-${slug(action)}`,
        title: `Find form ${action}`,
        intent: "Find a public form and identify its fields without submitting it.",
        startRoute: startRoute(model),
        allowedRoutes: publicRoutePaths(model),
        successCriteria: unique(["form", action, form.method ?? ""]),
        expectedEvidenceSurfaces: uniqueSurfaces(["dom", "accessibility"]),
        evidence: form.evidence,
        confidence: form.evidence.length > 0 ? "high" : "medium",
        rationale: `Form evidence was discovered in ${form.sourceFile}; the scenario only finds the form and does not submit it.`
      })
    );
  }
}

function createSuggestion(input: {
  id: string;
  title: string;
  intent: string;
  startRoute: string;
  allowedRoutes: string[];
  successCriteria: string[];
  expectedEvidenceSurfaces: BrowserAgentEvidenceSurface[];
  evidence: EvidenceRef[];
  confidence: "high" | "medium" | "low";
  rationale: string;
}): ScenarioSuggestion {
  return {
    id: input.id,
    title: input.title,
    intent: input.intent,
    startRoute: input.startRoute,
    allowedRoutes: input.allowedRoutes.length > 0 ? input.allowedRoutes : [input.startRoute],
    allowedOrigins: [],
    blockedOrigins: [],
    inputs: {},
    successCriteria: input.successCriteria.filter((criterion) => criterion.trim().length > 0),
    expectedEvidenceSurfaces: input.expectedEvidenceSurfaces,
    budgets: {
      maxActions: 6,
      maxScreenshots: 2,
      maxDomQueries: 10,
      maxNetworkObservations: 4,
      maxToolCalls: 0
    },
    risk: "read-only",
    evidence: input.evidence,
    source: "descuff-deterministic",
    confidence: input.confidence,
    rationale: input.rationale
  };
}

function expectedRouteSurfaces(model: ApplicationModel): BrowserAgentEvidenceSurface[] {
  return uniqueSurfaces(["dom", "accessibility", ...standardSurfaces(model)]);
}

function standardSurfaces(model: ApplicationModel): BrowserAgentEvidenceSurface[] {
  return model.standards.flatMap((standard) => {
    if (standard.kind === "schema-org") {
      return ["json-ld" as const];
    }
    return [standard.kind];
  });
}

function successCriteriaForRoute(path: string, model: ApplicationModel): string[] {
  if (path !== "/") {
    return [path];
  }
  return unique([
    "/",
    model.domainProfile.primaryDomain === "unknown" ? "" : model.domainProfile.primaryDomain,
    model.applicationType.type === "unknown" ? "" : model.applicationType.type
  ]);
}

function publicRoutePaths(model: ApplicationModel): string[] {
  return model.routes
    .filter((route) => route.visibility !== "authenticated")
    .map((route) => route.path);
}

function startRoute(model: ApplicationModel): string {
  return publicRoutePaths(model).find((path) => path === "/") ?? publicRoutePaths(model)[0] ?? "/";
}

function routePriority(path: string): number {
  if (path === "/") {
    return 0;
  }
  if (path.includes("{")) {
    return 2;
  }
  return 1;
}

function uniqueSuggestions(suggestions: ScenarioSuggestion[]): ScenarioSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    if (seen.has(suggestion.id)) {
      return false;
    }
    seen.add(suggestion.id);
    return true;
  });
}

function uniqueSurfaces(values: BrowserAgentEvidenceSurface[]): BrowserAgentEvidenceSurface[] {
  return unique(values) as BrowserAgentEvidenceSurface[];
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function slugForRoute(path: string): string {
  return slug(path.replace(/[{}]/g, ""));
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "scenario";
}

function formatList(values: unknown[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
