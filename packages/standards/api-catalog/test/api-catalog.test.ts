import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  applicationModelSchemaVersion,
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import { ApiCatalogAdapter, apiCatalogAdapterId } from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:api-search",
  kind: "source",
  location: "app/api/search/route.ts",
  confidence: "high",
  summary: "Search API"
};

describe("@descuff/standard-api-catalog", () => {
  it("exports the adapter id", () => {
    expect(apiCatalogAdapterId).toBe("api-catalog");
  });

  it("assesses an existing API Catalog with evidence", async () => {
    const assessment = await new ApiCatalogAdapter().assess(
      model({ includeExistingStandard: true })
    );

    expect(assessment).toMatchObject({
      standardId: "api-catalog",
      applicability: "implemented",
      generatedChangeEligibility: "automatic"
    });
    expect(assessment.evidence.map((ref) => ref.id)).toContain("source:api-catalog");
  });

  it("generates deterministic Linkset JSON", async () => {
    const changes = await new ApiCatalogAdapter().generate(model());

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      standardId: "api-catalog",
      id: "api-catalog:linkset",
      kind: "create-file",
      path: "public/.well-known/api-catalog",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required"
    });
    expect(JSON.parse(changes[0]?.content ?? "")).toEqual({
      linkset: [
        {
          anchor: "/",
          "service-desc": [
            {
              href: "/openapi.json",
              type: "application/openapi+json",
              title: "OpenAPI description"
            }
          ]
        }
      ]
    });
  });

  it("validates generated API Catalog content", async () => {
    const adapter = new ApiCatalogAdapter();
    const appModel = model();
    const generatedChanges = await adapter.generate(appModel);

    await expect(adapter.validate({ model: appModel, generatedChanges })).resolves.toEqual({
      standardId: "api-catalog",
      valid: true,
      issues: []
    });
  });

  it("reports a missing OpenAPI service description link", async () => {
    const result = await new ApiCatalogAdapter().validate({
      model: model(),
      generatedChanges: [
        {
          standardId: "api-catalog",
          id: "bad",
          kind: "create-file",
          path: "public/.well-known/api-catalog",
          content: JSON.stringify({
            linkset: [
              {
                anchor: "/",
                "service-desc": []
              }
            ]
          }),
          deterministic: true,
          safety: "automatic",
          conflictPolicy: "approval-required",
          evidence: [evidence]
        }
      ]
    });

    expect(result).toMatchObject({
      valid: false,
      issues: [
        {
          code: "API_CATALOG_SERVICE_DESCRIPTION_MISSING"
        },
        {
          code: "API_CATALOG_OPENAPI_LINK_MISSING",
          message: "API Catalog must link to /openapi.json."
        }
      ]
    });
  });

  it("proves scan to semantic model to generated validation on the ecommerce fixture", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const appModel = structuralAnalysisToApplicationModel(analysis);
    const adapter = new ApiCatalogAdapter();
    const assessment = await adapter.assess(appModel);
    const generatedChanges = await adapter.generate(appModel);
    const validation = await adapter.validate({ model: appModel, generatedChanges });

    expect(assessment.applicability).toBe("recommended");
    expect(generatedChanges).toHaveLength(1);
    expect(validation).toEqual({
      standardId: "api-catalog",
      valid: true,
      issues: []
    });
  });
});

function model(options: { includeExistingStandard?: boolean } = {}): ApplicationModel {
  const apiCatalogEvidence: EvidenceRef = {
    id: "source:api-catalog",
    kind: "source",
    location: "public/.well-known/api-catalog",
    confidence: "high",
    summary: "Existing API Catalog"
  };
  const openApiEvidence: EvidenceRef = {
    id: "source:openapi",
    kind: "source",
    location: "openapi.json",
    confidence: "high",
    summary: "Existing OpenAPI document"
  };
  const evidenceItems = options.includeExistingStandard
    ? [evidence, apiCatalogEvidence, openApiEvidence]
    : [evidence, openApiEvidence];

  return {
    schemaVersion: applicationModelSchemaVersion,
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
    entities: [],
    capabilities: [],
    routes: [],
    apis: [
      {
        id: "api:search:get",
        path: "/api/search",
        method: "GET",
        sourceFile: "app/api/search/route.ts",
        runtimeObserved: false,
        sideEffect: "read",
        evidence: [evidence]
      },
      {
        id: "api:search:post",
        path: "/api/search",
        method: "POST",
        sourceFile: "app/api/search/route.ts",
        runtimeObserved: false,
        sideEffect: "write",
        evidence: [evidence]
      }
    ],
    authentication: {
      boundaries: [],
      evidence: []
    },
    integrations: [],
    standards: [
      {
        id: "standard:openapi",
        kind: "openapi",
        sourceFile: "openapi.json",
        evidence: [openApiEvidence]
      },
      ...(options.includeExistingStandard
        ? [
            {
              id: "standard:api-catalog",
              kind: "api-catalog" as const,
              sourceFile: "public/.well-known/api-catalog",
              evidence: [apiCatalogEvidence]
            }
          ]
        : [])
    ],
    evidence: {
      items: evidenceItems,
      byId: Object.fromEntries(evidenceItems.map((ref) => [ref.id, ref]))
    }
  };
}
