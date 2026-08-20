import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  applicationModelSchemaVersion,
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type EvidenceRef
} from "@descuff/ir";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import { SchemaOrgAdapter, schemaOrgAdapterId } from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:app-page",
  kind: "source",
  location: "app/page.tsx",
  confidence: "high",
  summary: "Home route"
};

describe("@descuff/standard-schema-org", () => {
  it("exports the adapter id", () => {
    expect(schemaOrgAdapterId).toBe("schema-org");
  });

  it("assesses existing Schema.org JSON-LD with evidence", async () => {
    const assessment = await new SchemaOrgAdapter().assess(
      model({ includeExistingStandard: true })
    );

    expect(assessment).toMatchObject({
      standardId: "schema-org",
      applicability: "implemented",
      generatedChangeEligibility: "automatic"
    });
    expect(assessment.evidence.map((ref) => ref.id)).toContain("source:schema-org");
  });

  it("generates deterministic JSON-LD for application, routes, and entities", async () => {
    const changes = await new SchemaOrgAdapter().generate(model());

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      standardId: "schema-org",
      id: "schema-org:jsonld",
      kind: "create-file",
      path: "schema-org.jsonld",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required"
    });
    expect(JSON.parse(changes[0]?.content ?? "")).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@id": "#application",
          "@type": "Store",
          name: "Ecommerce"
        },
        {
          "@id": "#route:/",
          "@type": "WebPage",
          name: "/",
          url: "/"
        },
        {
          "@id": "#route:/products/{id}",
          "@type": "WebPage",
          name: "/products/{id}",
          url: "/products/{id}"
        },
        {
          "@id": "#entity:entity:product",
          "@type": "Product",
          name: "Product"
        }
      ]
    });
  });

  it("validates generated JSON-LD against semantic routes and entities", async () => {
    const adapter = new SchemaOrgAdapter();
    const appModel = model();
    const generatedChanges = await adapter.generate(appModel);

    await expect(adapter.validate({ model: appModel, generatedChanges })).resolves.toEqual({
      standardId: "schema-org",
      valid: true,
      issues: []
    });
  });

  it("reports missing route and entity correlation", async () => {
    const result = await new SchemaOrgAdapter().validate({
      model: model(),
      generatedChanges: [
        {
          standardId: "schema-org",
          id: "bad",
          kind: "create-file",
          path: "schema-org.jsonld",
          content: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@id": "#application",
                "@type": "Store",
                name: "Ecommerce"
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
          code: "SCHEMA_ORG_ROUTE_MISSING",
          message: "Schema.org JSON-LD does not include route /."
        },
        {
          code: "SCHEMA_ORG_ROUTE_MISSING",
          message: "Schema.org JSON-LD does not include route /products/{id}."
        },
        {
          code: "SCHEMA_ORG_ENTITY_MISSING",
          message: "Schema.org JSON-LD does not include entity Product."
        }
      ]
    });
  });

  it("proves scan to semantic model to generated validation on the ecommerce fixture", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );
    const appModel = structuralAnalysisToApplicationModel(analysis);
    const adapter = new SchemaOrgAdapter();
    const assessment = await adapter.assess(appModel);
    const generatedChanges = await adapter.generate(appModel);
    const validation = await adapter.validate({ model: appModel, generatedChanges });

    expect(assessment.applicability).toBe("implemented");
    expect(generatedChanges).toHaveLength(1);
    expect(validation).toEqual({
      standardId: "schema-org",
      valid: true,
      issues: []
    });
  });
});

function model(options: { includeExistingStandard?: boolean } = {}): ApplicationModel {
  const schemaOrgEvidence: EvidenceRef = {
    id: "source:schema-org",
    kind: "source",
    location: "app/page.tsx",
    confidence: "high",
    summary: "Existing Schema.org JSON-LD"
  };
  const evidenceItems = options.includeExistingStandard
    ? [evidence, schemaOrgEvidence]
    : [evidence];

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
    entities: [
      {
        id: "entity:product",
        name: "Product",
        kind: "product",
        properties: [],
        relationships: [],
        evidence: [evidence]
      }
    ],
    capabilities: [],
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
        path: "/products/{id}",
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
            id: "standard:schema-org",
            kind: "schema-org",
            sourceFile: "app/page.tsx",
            evidence: [schemaOrgEvidence]
          }
        ]
      : [],
    evidence: {
      items: evidenceItems,
      byId: Object.fromEntries(evidenceItems.map((ref) => [ref.id, ref]))
    }
  };
}
