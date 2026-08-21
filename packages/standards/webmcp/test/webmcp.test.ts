import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  applicationModelSchemaVersion,
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import { supportedWebMcpDraft, WebMcpAdapter, webMcpAdapterId } from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:api-search",
  kind: "source",
  location: "app/api/search/route.ts",
  confidence: "high",
  summary: "Search API"
};

describe("@descuff/standard-webmcp", () => {
  it("exports the adapter id", () => {
    expect(webMcpAdapterId).toBe("webmcp");
  });

  it("treats existing WebMCP metadata as planning evidence, not implementation proof", async () => {
    const assessment = await new WebMcpAdapter().assess(model({ includeExistingStandard: true }));

    expect(assessment).toMatchObject({
      standardId: "webmcp",
      applicability: "recommended",
      generatedChangeEligibility: "automatic"
    });
    expect(assessment.evidence.map((ref) => ref.id)).toContain("source:webmcp");
    expect(assessment.rationale.join("\n")).toContain("metadata-only files do not prove");
  });

  it("generates metadata and an implementation plan for public read GET tools only", async () => {
    const changes = await new WebMcpAdapter().generate(model());

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({
      standardId: "webmcp",
      id: "webmcp:manifest",
      kind: "create-file",
      path: "public/webmcp.json",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required"
    });
    expect(JSON.parse(changes[0]?.content ?? "")).toEqual({
      draft: supportedWebMcpDraft,
      tools: [
        {
          name: "get_api_search",
          description: "get /api/search",
          method: "GET",
          path: "/api/search",
          risk: "PUBLIC_READ"
        }
      ]
    });
    expect(changes[1]).toMatchObject({
      standardId: "webmcp",
      id: "webmcp:implementation-plan",
      kind: "companion-file",
      path: ".descuff/webmcp-implementation-plan.md",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "companion-file"
    });
    expect(changes[1]?.content).toContain("document.modelContext.registerTool");
    expect(changes[1]?.content).toContain("get_api_search");
  });

  it("requires approval for sensitive or high-consequence capabilities without exposing them", async () => {
    const generated = await new WebMcpAdapter().generate(
      model({ includeHighConsequenceCapability: true })
    );

    expect(generated[0]?.safety).toBe("approval-required");
    expect(JSON.parse(generated[0]?.content ?? "")).toMatchObject({
      tools: [
        {
          name: "get_api_search"
        }
      ]
    });
  });

  it("warns that generated WebMCP manifests are metadata-only", async () => {
    const adapter = new WebMcpAdapter();
    const appModel = model();
    const generatedChanges = await adapter.generate(appModel);

    await expect(adapter.validate({ model: appModel, generatedChanges })).resolves.toEqual({
      standardId: "webmcp",
      valid: true,
      issues: [
        {
          code: "WEBMCP_METADATA_ONLY",
          severity: "warning",
          message:
            "WebMCP metadata is planning evidence only; browser registration must be validated with runtime WebMCP discovery.",
          path: "public/webmcp.json",
          evidence: []
        }
      ]
    });
  });

  it("rejects unsupported drafts and non-public-read tools", async () => {
    const result = await new WebMcpAdapter().validate({
      model: model(),
      generatedChanges: [
        {
          standardId: "webmcp",
          id: "bad",
          kind: "create-file",
          path: "public/webmcp.json",
          content: JSON.stringify({
            draft: "webmcp-draft-unknown",
            tools: [
              {
                name: "private_orders",
                description: "private orders",
                method: "GET",
                path: "/api/orders",
                risk: "PUBLIC_READ"
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
          code: "WEBMCP_METADATA_ONLY",
          message:
            "WebMCP metadata is planning evidence only; browser registration must be validated with runtime WebMCP discovery."
        },
        {
          code: "WEBMCP_DRAFT_UNSUPPORTED",
          message: `WebMCP manifest must use supported draft ${supportedWebMcpDraft}.`
        },
        {
          code: "WEBMCP_TOOL_NOT_PUBLIC_READ",
          message: "WebMCP tool private_orders does not map to an eligible public read API."
        }
      ]
    });
  });

  it("proves scan to semantic model to generated validation on the ecommerce fixture", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const appModel = structuralAnalysisToApplicationModel(analysis);
    const adapter = new WebMcpAdapter();
    const assessment = await adapter.assess(appModel);
    const generatedChanges = await adapter.generate(appModel);
    const validation = await adapter.validate({ model: appModel, generatedChanges });

    expect(assessment.applicability).toBe("recommended");
    expect(generatedChanges).toHaveLength(2);
    expect(validation).toEqual({
      standardId: "webmcp",
      valid: true,
      issues: [
        {
          code: "WEBMCP_METADATA_ONLY",
          severity: "warning",
          message:
            "WebMCP metadata is planning evidence only; browser registration must be validated with runtime WebMCP discovery.",
          path: "public/webmcp.json",
          evidence: []
        }
      ]
    });
  });
});

function model(
  options: { includeExistingStandard?: boolean; includeHighConsequenceCapability?: boolean } = {}
): ApplicationModel {
  const webMcpEvidence: EvidenceRef = {
    id: "source:webmcp",
    kind: "source",
    location: "public/webmcp.json",
    confidence: "high",
    summary: "Existing WebMCP manifest"
  };
  const evidenceItems = options.includeExistingStandard ? [evidence, webMcpEvidence] : [evidence];

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
    capabilities: [
      {
        id: "capability:get:api_search",
        name: "get /api/search",
        operationType: "read",
        risk: "PUBLIC_READ",
        visibility: "public",
        inputs: [],
        outputs: [],
        linkedRoutes: [],
        linkedApis: ["api:search:get"],
        evidence: [evidence],
        confidence: "high"
      },
      {
        id: "capability:post:api_search",
        name: "post /api/search",
        operationType: "write",
        risk: "LOW_RISK_WRITE",
        visibility: "public",
        inputs: [],
        outputs: [],
        linkedRoutes: [],
        linkedApis: ["api:search:post"],
        evidence: [evidence],
        confidence: "high"
      },
      ...(options.includeHighConsequenceCapability
        ? [
            {
              id: "capability:post:api_checkout",
              name: "post /api/checkout",
              operationType: "write" as const,
              risk: "HIGH_CONSEQUENCE" as const,
              visibility: "authenticated" as const,
              inputs: [],
              outputs: [],
              linkedRoutes: [],
              linkedApis: ["api:checkout:post"],
              evidence: [evidence],
              confidence: "high" as const
            }
          ]
        : [])
    ],
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
    standards: options.includeExistingStandard
      ? [
          {
            id: "standard:webmcp",
            kind: "webmcp",
            sourceFile: "public/webmcp.json",
            evidence: [webMcpEvidence]
          }
        ]
      : [],
    evidence: {
      items: evidenceItems,
      byId: Object.fromEntries(evidenceItems.map((ref) => [ref.id, ref]))
    }
  };
}
