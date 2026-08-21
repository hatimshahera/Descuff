import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { NativeNextAnalyzer } from "@descuff/analyzer-nextjs";
import {
  structuralAnalysisToApplicationModel,
  type ApplicationModel,
  type StructuralAnalysis
} from "@descuff/ir";
import type { GeneratedChange, StandardAdapter } from "@descuff/standard-core";
import { LlmsTxtAdapter } from "@descuff/standard-llms-txt";
import { OpenApiAdapter } from "@descuff/standard-openapi";
import { SchemaOrgAdapter } from "@descuff/standard-schema-org";
import { WebMcpAdapter } from "@descuff/standard-webmcp";
import {
  createValidationReadinessReport,
  mergeValidationSummaries,
  renderValidationRepairGuide,
  runStandardValidation,
  validateRuntimeObservations,
  validateSecurityModel,
  validateStaticGeneratedChanges
} from "../src/index.js";

describe("@descuff/validator ecommerce website fixture E2E", () => {
  it("passes a correct generated standards validation flow on the ecommerce website fixture", async () => {
    const analysis = withSuccessfulRuntimeObservations(await scanEcommerceFixture());
    const model = structuralAnalysisToApplicationModel(analysis);
    const adapters = standardAdapters();
    const generatedChanges = await generateAll(adapters, model);

    const summary = mergeValidationSummaries([
      validateStaticGeneratedChanges(generatedChanges),
      await runStandardValidation(adapters, { model, generatedChanges }),
      validateRuntimeObservations(model, analysis),
      validateSecurityModel(model)
    ]);
    const report = createValidationReadinessReport(model, [summary]);

    expect([...new Set(generatedChanges.map((change) => change.standardId))].sort()).toEqual([
      "llms-txt",
      "openapi",
      "schema-org",
      "webmcp"
    ]);
    expect(summary).toMatchObject({
      passed: true,
      failures: [],
      warnings: [
        {
          code: "WEBMCP_METADATA_ONLY",
          level: "static",
          severity: "warning",
          source: "webmcp",
          path: "public/webmcp.json"
        }
      ]
    });
    expect(report).toMatchObject({
      ready: true,
      readiness: {
        score: 100,
        maxScore: 100
      },
      validation: {
        passed: true,
        failures: []
      }
    });
  });

  it("fails with typed actionable errors for a broken generated standard", async () => {
    const analysis = withSuccessfulRuntimeObservations(await scanEcommerceFixture());
    const model = structuralAnalysisToApplicationModel(analysis);
    const brokenLlmsTxt: GeneratedChange = {
      standardId: "llms-txt",
      id: "broken:llms-txt",
      kind: "create-file",
      path: "public/llms.txt",
      content: "# Ecommerce\n\n- [/](/)\n",
      deterministic: true,
      safety: "automatic",
      conflictPolicy: "approval-required",
      evidence: model.routes.flatMap((route) => route.evidence)
    };

    const summary = await runStandardValidation([new LlmsTxtAdapter()], {
      model,
      generatedChanges: [brokenLlmsTxt]
    });

    expect(summary).toMatchObject({
      passed: false,
      warnings: []
    });
    expect(summary.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "LLMS_TXT_ROUTE_MISSING",
          level: "static",
          severity: "error",
          source: "llms-txt",
          path: "public/llms.txt",
          message: "llms.txt does not reference route /products/{id}.",
          suggestedAction: "Repair llms-txt output and rerun descuff validate."
        })
      ])
    );
    expect(renderValidationRepairGuide(summary)).toContain("LLMS_TXT_ROUTE_MISSING");
    expect(renderValidationRepairGuide(summary)).toContain(
      "Suggested action: Repair llms-txt output and rerun descuff validate."
    );
  });

  it("fails runtime validation when the website fixture runtime observation is broken", async () => {
    const analysis = withSuccessfulRuntimeObservations(await scanEcommerceFixture());
    const model = structuralAnalysisToApplicationModel(analysis);
    const brokenAnalysis = {
      ...analysis,
      runtimeRoutes: analysis.runtimeRoutes.map((route) =>
        route.path === "/" ? { ...route, status: 500 } : route
      )
    } satisfies StructuralAnalysis;

    expect(validateRuntimeObservations(model, brokenAnalysis)).toMatchObject({
      passed: false,
      failures: [
        {
          code: "RUNTIME_ROUTE_STATUS_FAILED",
          level: "runtime",
          severity: "error",
          source: "route:next-app:/"
        }
      ],
      warnings: []
    });
  });
});

async function scanEcommerceFixture(): Promise<StructuralAnalysis> {
  return new NativeNextAnalyzer().analyze(createProjectContext("fixtures/ecommerce"));
}

function standardAdapters(): StandardAdapter[] {
  return [new LlmsTxtAdapter(), new OpenApiAdapter(), new SchemaOrgAdapter(), new WebMcpAdapter()];
}

async function generateAll(
  adapters: StandardAdapter[],
  model: ApplicationModel
): Promise<GeneratedChange[]> {
  const generated = await Promise.all(adapters.map((adapter) => adapter.generate(model)));
  return generated.flat();
}

function withSuccessfulRuntimeObservations(analysis: StructuralAnalysis): StructuralAnalysis {
  return {
    ...analysis,
    runtimeRoutes: analysis.routes.map((route) => ({
      id: `runtime-route:${route.path}`,
      path: route.path,
      status: 200,
      evidence: route.evidence
    })),
    runtimeApiOperations: analysis.apiOperations
      .filter((operation) => ["GET", "HEAD", "OPTIONS"].includes(operation.method))
      .map((operation) => ({
        id: `runtime-api:${operation.method}:${operation.path}`,
        path: operation.path,
        method: operation.method,
        status: 200,
        evidence: operation.evidence
      }))
  };
}
