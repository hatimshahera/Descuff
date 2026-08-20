import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  applicationModelSchemaVersion,
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import { OpenApiAdapter, openApiAdapterId } from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:api-search",
  kind: "source",
  location: "app/api/search/route.ts",
  confidence: "high",
  summary: "Search API"
};

describe("@descuff/standard-openapi", () => {
  it("exports the adapter id", () => {
    expect(openApiAdapterId).toBe("openapi");
  });

  it("assesses an existing OpenAPI document with evidence", async () => {
    const assessment = await new OpenApiAdapter().assess(model({ includeExistingStandard: true }));

    expect(assessment).toMatchObject({
      standardId: "openapi",
      applicability: "implemented",
      generatedChangeEligibility: "automatic"
    });
    expect(assessment.evidence.map((ref) => ref.id)).toContain("source:openapi");
  });

  it("generates a deterministic OpenAPI document for known API operations", async () => {
    const changes = await new OpenApiAdapter().generate(model());

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      standardId: "openapi",
      id: "openapi:document",
      kind: "create-file",
      path: "openapi.json",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required"
    });
    expect(JSON.parse(changes[0]?.content ?? "")).toEqual({
      openapi: "3.1.0",
      info: {
        title: "Ecommerce",
        version: "0.0.0"
      },
      paths: {
        "/api/search": {
          get: {
            operationId: "get_api_search",
            summary: "GET /api/search",
            responses: {
              "200": {
                description: "Successful response"
              }
            }
          },
          post: {
            operationId: "post_api_search",
            summary: "POST /api/search",
            responses: {
              "200": {
                description: "Successful response"
              }
            }
          }
        }
      }
    });
  });

  it("validates generated OpenAPI operations against the semantic model", async () => {
    const adapter = new OpenApiAdapter();
    const appModel = model();
    const generatedChanges = await adapter.generate(appModel);

    await expect(adapter.validate({ model: appModel, generatedChanges })).resolves.toEqual({
      standardId: "openapi",
      valid: true,
      issues: []
    });
  });

  it("reports missing operations", async () => {
    const result = await new OpenApiAdapter().validate({
      model: model(),
      generatedChanges: [
        {
          standardId: "openapi",
          id: "bad",
          kind: "create-file",
          path: "openapi.json",
          content: JSON.stringify({
            openapi: "3.1.0",
            info: { title: "Ecommerce", version: "0.0.0" },
            paths: {}
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
          code: "OPENAPI_OPERATION_MISSING",
          message: "OpenAPI document does not include GET /api/search."
        },
        {
          code: "OPENAPI_OPERATION_MISSING",
          message: "OpenAPI document does not include POST /api/search."
        }
      ]
    });
  });

  it("proves scan to semantic model to generated validation on the ecommerce fixture", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const appModel = structuralAnalysisToApplicationModel(analysis);
    const adapter = new OpenApiAdapter();
    const assessment = await adapter.assess(appModel);
    const generatedChanges = await adapter.generate(appModel);
    const validation = await adapter.validate({ model: appModel, generatedChanges });

    expect(assessment.applicability).toBe("implemented");
    expect(generatedChanges).toHaveLength(1);
    expect(validation).toEqual({
      standardId: "openapi",
      valid: true,
      issues: []
    });
  });
});

function model(options: { includeExistingStandard?: boolean } = {}): ApplicationModel {
  const openApiEvidence: EvidenceRef = {
    id: "source:openapi",
    kind: "source",
    location: "openapi.json",
    confidence: "high",
    summary: "Existing OpenAPI document"
  };
  const evidenceItems = options.includeExistingStandard ? [evidence, openApiEvidence] : [evidence];

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
      },
      {
        id: "api:legacy:unknown",
        path: "/api/legacy",
        method: "UNKNOWN",
        sourceFile: "pages/api/legacy.ts",
        runtimeObserved: false,
        sideEffect: "unknown",
        evidence: [evidence]
      }
    ],
    authentication: {
      boundaries: [],
      evidence: []
    },
    integrations: [],
    standards: options.includeExistingStandard
      ? [
          {
            id: "standard:openapi",
            kind: "openapi",
            sourceFile: "openapi.json",
            evidence: [openApiEvidence]
          }
        ]
      : [],
    evidence: {
      items: evidenceItems,
      byId: Object.fromEntries(evidenceItems.map((ref) => [ref.id, ref]))
    }
  };
}
