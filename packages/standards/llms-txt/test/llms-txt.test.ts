import { describe, expect, it } from "vitest";
import {
  applicationModelSchemaVersion,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import { LlmsTxtAdapter, llmsTxtAdapterId } from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:app-page",
  kind: "source",
  location: "app/page.tsx",
  confidence: "high",
  summary: "Home route"
};

describe("@descuff/standard-llms-txt", () => {
  it("exports the adapter id", () => {
    expect(llmsTxtAdapterId).toBe("llms-txt");
  });

  it("assesses an existing llms.txt implementation with evidence", async () => {
    const assessment = await new LlmsTxtAdapter().assess(model({ includeExistingStandard: true }));

    expect(assessment).toMatchObject({
      standardId: "llms-txt",
      applicability: "implemented",
      generatedChangeEligibility: "automatic"
    });
    expect(assessment.evidence.map((ref) => ref.id)).toContain("source:llms");
  });

  it("generates deterministic in-memory content for public routes and safe capabilities", async () => {
    const changes = await new LlmsTxtAdapter().generate(model());

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      standardId: "llms-txt",
      id: "llms-txt:public-summary",
      kind: "create-file",
      path: "public/llms.txt",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required"
    });
    expect(changes[0]?.content).toBe(
      [
        "# Ecommerce",
        "",
        "> Agent-readable summary generated from Descuff evidence.",
        "",
        "## Routes",
        "",
        "- [/](/): app/page.tsx",
        "- [/products/[id]](/products/[id]): app/products/[id]/page.tsx",
        "",
        "## Capabilities",
        "",
        "- get /api/search: PUBLIC_READ",
        ""
      ].join("\n")
    );
  });

  it("requires approval when sensitive or high-consequence capabilities exist", async () => {
    const generated = await new LlmsTxtAdapter().generate(
      model({ extraCapabilityRisk: "HIGH_CONSEQUENCE" })
    );

    expect(generated[0]?.safety).toBe("approval-required");
  });

  it("validates generated content against public routes", async () => {
    const adapter = new LlmsTxtAdapter();
    const appModel = model();
    const generatedChanges = await adapter.generate(appModel);

    await expect(adapter.validate({ model: appModel, generatedChanges })).resolves.toEqual({
      standardId: "llms-txt",
      valid: true,
      issues: []
    });
  });

  it("reports missing route references", async () => {
    const appModel = model();
    const result = await new LlmsTxtAdapter().validate({
      model: appModel,
      generatedChanges: [
        {
          standardId: "llms-txt",
          id: "bad",
          kind: "create-file",
          path: "public/llms.txt",
          content: "# Ecommerce\n\n- [/](/)\n",
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
          code: "LLMS_TXT_ROUTE_MISSING",
          path: "public/llms.txt"
        }
      ]
    });
  });
});

function model(
  options: { includeExistingStandard?: boolean; extraCapabilityRisk?: "HIGH_CONSEQUENCE" } = {}
): ApplicationModel {
  const llmsEvidence: EvidenceRef = {
    id: "source:llms",
    kind: "source",
    location: "public/llms.txt",
    confidence: "high",
    summary: "Existing llms.txt"
  };
  const evidenceItems = options.includeExistingStandard ? [evidence, llmsEvidence] : [evidence];

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
      ...(options.extraCapabilityRisk === "HIGH_CONSEQUENCE"
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
    routes: [
      {
        id: "route:home",
        path: "/",
        routerKind: "app",
        sourceFile: "app/page.tsx",
        runtimeObserved: false,
        evidence: [evidence]
      },
      {
        id: "route:product",
        path: "/products/[id]",
        routerKind: "app",
        sourceFile: "app/products/[id]/page.tsx",
        runtimeObserved: false,
        evidence: [evidence]
      }
    ],
    apis: [],
    authentication: {
      boundaries: [],
      evidence: []
    },
    integrations: [],
    standards: options.includeExistingStandard
      ? [
          {
            id: "standard:llms",
            kind: "llms-txt",
            sourceFile: "public/llms.txt",
            evidence: [llmsEvidence]
          }
        ]
      : [],
    evidence: {
      items: evidenceItems,
      byId: Object.fromEntries(evidenceItems.map((ref) => [ref.id, ref]))
    }
  };
}
