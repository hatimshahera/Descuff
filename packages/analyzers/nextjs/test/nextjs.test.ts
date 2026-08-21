import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { structuralAnalysisToApplicationModel, validateStructuralAnalysis } from "@descuff/ir";
import { NativeNextAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-nextjs", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.routes).toEqual([]);
  });

  it("discovers Next.js framework, app routes, pages routes, and API operations", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );

    expect(analysis.framework).toMatchObject({ kind: "nextjs", detected: true });
    expect(analysis.routes.map((route) => route.path).sort()).toEqual([
      "/",
      "/about",
      "/products/{id}"
    ]);
    expect(
      analysis.apiOperations.map((operation) => `${operation.method} ${operation.path}`).sort()
    ).toEqual(["GET /api/search", "POST /api/search", "UNKNOWN /api/legacy"]);
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("discovers app and pages routes under src", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/src-app")
    );

    expect(analysis.framework).toMatchObject({ kind: "nextjs", detected: true });
    expect(analysis.routes.map((route) => `${route.routerKind} ${route.path}`).sort()).toEqual([
      "next-app /",
      "next-app /book/{username}/{eventSlug}",
      "next-pages /about"
    ]);
    expect(
      analysis.apiOperations.map((operation) => `${operation.method} ${operation.path}`).sort()
    ).toEqual(["GET /api/availability", "UNKNOWN /api/legacy"]);
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "server-action",
        name: "fetchSlotsAction",
        sourceFile: "src/app/actions.ts"
      })
    );
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "server-action",
        name: "createBookingAction",
        sourceFile: "src/app/actions.ts"
      })
    );
    expect(analysis.authenticationBoundaries).toContainEqual(
      expect.objectContaining({
        kind: "proxy",
        sourceFile: "proxy.ts"
      })
    );
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("extracts symbols, server actions, forms, auth boundaries, and standards with evidence", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(
      createProjectContext("fixtures/ecommerce")
    );

    expect(analysis.forms).toContainEqual(
      expect.objectContaining({
        action: "/api/search",
        method: "get",
        sourceFile: "app/page.tsx"
      })
    );
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "server-action",
        name: "addToCart",
        sourceFile: "app/actions.ts"
      })
    );
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "import",
        sourceFile: "app/page.tsx"
      })
    );
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "class",
        name: "ProductRepository",
        sourceFile: "app/product-repository.ts"
      })
    );
    expect(analysis.symbols).toContainEqual(
      expect.objectContaining({
        kind: "react-component",
        name: "HomePage",
        sourceFile: "app/page.tsx"
      })
    );
    expect(analysis.authenticationBoundaries).toContainEqual(
      expect.objectContaining({
        kind: "middleware",
        sourceFile: "middleware.ts"
      })
    );
    expect(analysis.existingStandards.map((standard) => standard.kind).sort()).toEqual([
      "llms-txt",
      "openapi",
      "schema-org"
    ]);
    expect(analysis.routes.every((route) => route.evidence.length > 0)).toBe(true);
    expect(analysis.apiOperations.every((operation) => operation.evidence.length > 0)).toBe(true);
  });

  it.each([
    {
      fixture: "fixtures/booking",
      applicationType: "booking",
      routes: ["/", "/confirmation"],
      apiOperations: ["GET /api/availability", "POST /api/availability"],
      standards: []
    },
    {
      fixture: "fixtures/content",
      applicationType: "content",
      routes: ["/", "/archive", "/articles/{slug}"],
      apiOperations: ["GET /api/search"],
      standards: ["llms-txt", "schema-org"]
    },
    {
      fixture: "fixtures/saas",
      applicationType: "saas",
      routes: ["/", "/billing", "/settings"],
      apiOperations: ["GET /api/workspace", "POST /api/team/invitations"],
      standards: []
    },
    {
      fixture: "fixtures/broken-site",
      applicationType: "unknown",
      routes: ["/"],
      apiOperations: ["POST /api/orders"],
      standards: ["llms-txt"]
    }
  ])(
    "discovers realistic source patterns in $fixture",
    async ({ fixture, applicationType, routes, apiOperations, standards }) => {
      const analysis = await new NativeNextAnalyzer().analyze(createProjectContext(fixture));
      const model = structuralAnalysisToApplicationModel(analysis);

      expect(analysis.framework).toMatchObject({ kind: "nextjs", detected: true });
      expect(analysis.routes.map((route) => route.path).sort()).toEqual(routes);
      expect(
        analysis.apiOperations.map((operation) => `${operation.method} ${operation.path}`).sort()
      ).toEqual(apiOperations);
      expect(analysis.existingStandards.map((standard) => standard.kind).sort()).toEqual(standards);
      expect(model.applicationType.type).toBe(applicationType);
      expect(validateStructuralAnalysis(analysis).valid).toBe(true);
    }
  );
});
