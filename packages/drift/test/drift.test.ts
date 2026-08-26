import { describe, expect, it } from "vitest";
import type { ApplicationModel, EvidenceRef } from "@descuff/ir";
import type { StandardAssessment } from "@descuff/standard-core";
import type { SourceFingerprintManifest, ValidationReadinessReport } from "@descuff/validator";
import {
  analyzeDrift,
  changedFilesFromFingerprints,
  createDriftBaseline,
  createDriftCheckResult,
  createDriftValidationPlan,
  renderDriftReport
} from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:search",
  kind: "source",
  location: "app/api/search/route.ts",
  confidence: "high",
  summary: "Search API route"
};

describe("@descuff/drift", () => {
  it("creates a versioned drift baseline from a known-good model", () => {
    const baseline = createDriftBaseline({
      model: fixtureModel(),
      assessments: fixtureAssessments(),
      sourceFingerprints: fixtureFingerprints(),
      validationReport: fixtureValidationReport()
    });

    expect(baseline.schemaVersion).toBe("0.1.0");
    expect(baseline.apis.map((api) => `${api.method} ${api.path}`)).toEqual(["GET /api/search"]);
    expect(baseline.capabilities[0]?.evidenceLocations).toEqual(["app/api/search/route.ts"]);
    expect(baseline.contractFingerprints).toEqual([
      {
        id: "contract:openapi:openapi.json",
        kind: "openapi",
        sourceFile: "openapi.json",
        sha256: "openapi",
        missing: false,
        evidenceIds: []
      }
    ]);
    expect(baseline.recommendedStandards).toEqual(["api-catalog", "openapi", "webmcp"]);
  });

  it("fast-passes irrelevant CSS changes without deeper validation", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/globals.css"]
    });
    const check = createDriftCheckResult(diff);

    expect(diff.status).toBe("pass");
    expect(diff.validationDepth).toBe("none");
    expect(check.status).toBe("pass");
    expect(check.summary).toBe("No agent-facing capability changes detected.");
  });

  it("maps API route changes to affected capabilities and standards", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/api/search/route.ts"]
    });

    expect(diff.status).toBe("needs-validation");
    expect(diff.validationDepth).toBe("targeted-runtime");
    expect(diff.affectedCapabilities.map((capability) => capability.name)).toEqual([
      "search_products"
    ]);
    expect(diff.affectedStandards).toEqual(["api-catalog", "openapi", "webmcp"]);
    expect(diff.failures[0]).toMatchObject({
      code: "AGENT_INTERFACE_DRIFT",
      file: "app/api/search/route.ts"
    });
  });

  it("maps auth boundary changes to security drift", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["middleware.ts"]
    });

    expect(diff.status).toBe("needs-validation");
    expect(diff.validationDepth).toBe("full");
    expect(diff.failures[0]?.code).toBe("CAPABILITY_SECURITY_BOUNDARY_CHANGED");
  });

  it("maps Server Action changes to WebMCP-sensitive drift", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/actions.ts"]
    });

    expect(diff.status).toBe("needs-validation");
    expect(diff.validationDepth).toBe("targeted-runtime");
    expect(diff.impacts[0]).toMatchObject({
      kind: "server-action",
      affectedStandards: ["webmcp"]
    });
  });

  it("plans static validation for machine-facing metadata drift", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["openapi.json"]
    });
    const plan = createDriftValidationPlan(diff);

    expect(diff.validationDepth).toBe("targeted-static");
    expect(plan.suites).toEqual(["source-fingerprints", "static-standards"]);
    expect(plan.fullValidationFallback).toBe(false);
  });

  it("plans runtime and WebMCP validation for API drift", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/api/search/route.ts"]
    });
    const plan = createDriftValidationPlan(diff);

    expect(plan.validationDepth).toBe("targeted-runtime");
    expect(plan.suites).toEqual([
      "runtime-observations",
      "security-model",
      "source-fingerprints",
      "static-generated-changes",
      "static-standards",
      "webmcp-behavior"
    ]);
    expect(plan.reasons).toContain("API or runtime-observed behavior changed.");
    expect(plan.fullValidationFallback).toBe(false);
  });

  it("plans full validation for unknown drift", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["lib/new-thing.ts"]
    });
    const plan = createDriftValidationPlan(diff);

    expect(diff.validationDepth).toBe("full");
    expect(plan.suites).toEqual(["full-validation"]);
    expect(plan.reasons).toContain("Targeted validation cannot prove safety for this change set.");
  });

  it("maps WebMCP metadata changes directly to the WebMCP standard", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: [".descuff/webmcp-implementation-plan.md"]
    });

    expect(diff.status).toBe("needs-validation");
    expect(diff.validationDepth).toBe("targeted-static");
    expect(diff.affectedStandards).toEqual(["webmcp"]);
  });

  it("fails unsupported drift baselines instead of passing silently", () => {
    const baseline = { ...fixtureBaseline(), schemaVersion: "99.0.0" };
    const diff = analyzeDrift({
      baseline,
      changedFiles: ["app/globals.css"]
    });

    expect(diff.status).toBe("fail");
    expect(diff.failures[0]?.code).toBe("DRIFT_BASELINE_UNSUPPORTED");
  });

  it("fails malformed drift baselines instead of dereferencing missing fields", () => {
    const diff = analyzeDrift({
      baseline: { schemaVersion: "0.1.0" },
      changedFiles: ["app/globals.css"]
    });

    expect(diff.status).toBe("fail");
    expect(diff.failures[0]?.code).toBe("DRIFT_BASELINE_MALFORMED");
  });

  it("fails project-mismatched drift baselines", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/globals.css"],
      projectRoot: "another/project"
    });

    expect(diff.status).toBe("fail");
    expect(diff.failures[0]?.code).toBe("DRIFT_BASELINE_PROJECT_MISMATCH");
  });

  it("detects changed files from source fingerprints", () => {
    const changed = changedFilesFromFingerprints(fixtureBaseline(), {
      ...fixtureFingerprints(),
      files: [
        {
          path: "app/api/search/route.ts",
          sha256: "changed",
          missing: false,
          evidence: [evidence]
        },
        {
          path: "middleware.ts",
          sha256: "def",
          missing: false,
          evidence: []
        },
        {
          path: "openapi.json",
          sha256: "openapi",
          missing: false,
          evidence: []
        }
      ]
    });

    expect(changed).toEqual(["app/api/search/route.ts"]);
  });

  it("renders a concise drift report", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/api/search/route.ts"]
    });

    expect(renderDriftReport(diff)).toContain("AGENT_INTERFACE_DRIFT");
    expect(renderDriftReport(diff)).toContain("search_products");
  });

  it("renders the validation plan in check reports", () => {
    const diff = analyzeDrift({
      baseline: fixtureBaseline(),
      changedFiles: ["app/api/search/route.ts"]
    });
    const check = createDriftCheckResult(diff, undefined, createDriftValidationPlan(diff));
    const report = renderDriftReport(check);

    expect(report).toContain("## Validation Plan");
    expect(report).toContain("webmcp-behavior");
    expect(report).toContain("full validation fallback: no");
  });
});

function fixtureBaseline() {
  return createDriftBaseline({
    model: fixtureModel(),
    assessments: fixtureAssessments(),
    sourceFingerprints: fixtureFingerprints(),
    validationReport: fixtureValidationReport()
  });
}

function fixtureModel(): ApplicationModel {
  return {
    schemaVersion: "0.1.0",
    project: {
      rootDir: "fixtures/ecommerce",
      framework: "nextjs",
      evidence: [evidence]
    },
    applicationType: {
      type: "ecommerce",
      confidence: "high",
      evidence: [evidence]
    },
    domainProfile: {
      summary: "Ecommerce app.",
      primaryDomain: "ecommerce",
      domains: ["ecommerce"],
      confidence: "high",
      evidence: [evidence],
      migrationSource: "applicationType"
    },
    entities: [],
    capabilities: [
      {
        id: "capability:search",
        name: "search_products",
        operationType: "read",
        risk: "PUBLIC_READ",
        visibility: "public",
        inputs: [],
        outputs: [],
        linkedRoutes: [],
        linkedApis: ["GET /api/search"],
        evidence: [evidence],
        confidence: "high"
      }
    ],
    routes: [
      {
        id: "route:/",
        path: "/",
        routerKind: "app",
        sourceFile: "app/page.tsx",
        visibility: "public",
        runtimeObserved: true,
        evidence: [
          {
            ...evidence,
            id: "source:home",
            location: "app/page.tsx",
            summary: "Home route"
          }
        ]
      }
    ],
    apis: [
      {
        id: "api:get:search",
        method: "GET",
        path: "/api/search",
        sourceFile: "app/api/search/route.ts",
        runtimeObserved: true,
        sideEffect: "read",
        evidence: [evidence]
      }
    ],
    authentication: {
      boundaries: [
        {
          id: "auth:middleware",
          kind: "middleware",
          sourceFile: "middleware.ts",
          evidence: [
            {
              ...evidence,
              id: "source:middleware",
              location: "middleware.ts",
              summary: "Middleware auth"
            }
          ]
        }
      ],
      evidence: []
    },
    integrations: [],
    standards: [
      {
        id: "standard:openapi",
        kind: "openapi",
        sourceFile: "openapi.json",
        evidence: []
      }
    ],
    evidence: {
      schemaVersion: "0.1.0",
      items: [evidence]
    }
  };
}

function fixtureAssessments(): StandardAssessment[] {
  return [
    {
      standardId: "openapi",
      applicability: "recommended",
      evidence: [evidence],
      rationale: [],
      riskNotes: [],
      generatedChangeEligibility: "automatic",
      validationRequirements: []
    },
    {
      standardId: "api-catalog",
      applicability: "recommended",
      evidence: [evidence],
      rationale: [],
      riskNotes: [],
      generatedChangeEligibility: "automatic",
      validationRequirements: []
    },
    {
      standardId: "webmcp",
      applicability: "recommended",
      evidence: [evidence],
      rationale: [],
      riskNotes: [],
      generatedChangeEligibility: "automatic",
      validationRequirements: []
    }
  ];
}

function fixtureFingerprints(): SourceFingerprintManifest {
  return {
    schemaVersion: "0.1.0",
    generatedAt: new Date(0).toISOString(),
    files: [
      {
        path: "app/api/search/route.ts",
        sha256: "abc",
        missing: false,
        evidence: [evidence]
      },
      {
        path: "middleware.ts",
        sha256: "def",
        missing: false,
        evidence: []
      },
      {
        path: "openapi.json",
        sha256: "openapi",
        missing: false,
        evidence: []
      }
    ]
  };
}

function fixtureValidationReport(): ValidationReadinessReport {
  return {
    schemaVersion: "0.1.0",
    readiness: {
      schemaVersion: "0.1.0",
      score: 100,
      maxScore: 100,
      categoryScores: {
        discoverability: 15,
        "structured-content": 15,
        "agent-actions": 20,
        "api-quality": 15,
        "semantic-metadata": 10,
        security: 10,
        "runtime-correctness": 15
      },
      lostPoints: []
    },
    validation: {
      passed: true,
      failures: [],
      warnings: []
    },
    ready: true,
    blockers: []
  };
}
