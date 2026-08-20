import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import {
  createEmptyStructuralAnalysis,
  type RuntimeApiObservation,
  type RuntimeRouteObservation,
  type StructuralApiOperation,
  type StructuralRoute,
  validateStructuralAnalysis
} from "@descuff/ir";
import { correlateRuntimeEvidence, RuntimeAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-runtime", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new RuntimeAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_CONFIG_MISSING" })
    );
  });

  it("observes configured runtime routes and read-only API operations", async () => {
    const analysis = await new RuntimeAnalyzer(async () => ({
      async get() {
        return { status: 200, headers: { "content-type": "text/html" } };
      },
      async fetch() {
        return { status: 200, headers: { "content-type": "application/json" } };
      },
      async dispose() {
        return undefined;
      }
    })).analyze({
      rootDir: "/repo",
      cwd: "/repo",
      runtime: {
        baseUrl: "http://example.test",
        routes: ["/"],
        apiOperations: [
          { method: "GET", path: "/api/products" },
          { method: "POST", path: "/api/products" }
        ]
      }
    });

    expect(analysis.runtimeRoutes).toContainEqual(
      expect.objectContaining({ path: "/", status: 200 })
    );
    expect(analysis.runtimeApiOperations).toContainEqual(
      expect.objectContaining({ path: "/api/products", method: "GET", status: 200 })
    );
    expect(analysis.warnings).toContainEqual(
      expect.objectContaining({ code: "RUNTIME_MUTATION_SKIPPED" })
    );
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("correlates static and runtime evidence by route and API operation", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    const routeEvidence = {
      id: "source:app/page.tsx",
      kind: "source" as const,
      location: "app/page.tsx",
      confidence: "high" as const,
      summary: "route"
    };
    const runtimeRouteEvidence = {
      id: "runtime:/",
      kind: "runtime" as const,
      location: "/",
      confidence: "high" as const,
      summary: "runtime route"
    };
    const apiEvidence = {
      id: "source:app/api/products/route.ts",
      kind: "source" as const,
      location: "app/api/products/route.ts",
      confidence: "high" as const,
      summary: "api"
    };
    const runtimeApiEvidence = {
      id: "runtime:GET:/api/products",
      kind: "runtime" as const,
      location: "GET:/api/products",
      confidence: "high" as const,
      summary: "runtime api"
    };

    analysis.routes.push({
      id: "route:next-app:/",
      path: "/",
      routerKind: "next-app",
      sourceFile: "app/page.tsx",
      evidence: [routeEvidence]
    } satisfies StructuralRoute);
    analysis.runtimeRoutes.push({
      id: "runtime-route:/",
      path: "/",
      status: 200,
      evidence: [runtimeRouteEvidence]
    } satisfies RuntimeRouteObservation);
    analysis.apiOperations.push({
      id: "api:GET:/api/products",
      path: "/api/products",
      method: "GET",
      sourceFile: "app/api/products/route.ts",
      evidence: [apiEvidence]
    } satisfies StructuralApiOperation);
    analysis.runtimeApiOperations.push({
      id: "runtime-api:GET:/api/products",
      path: "/api/products",
      method: "GET",
      status: 200,
      evidence: [runtimeApiEvidence]
    } satisfies RuntimeApiObservation);

    expect(correlateRuntimeEvidence(analysis).map((correlation) => correlation.subject)).toEqual([
      "route:/",
      "api:GET:/api/products"
    ]);
  });
});
