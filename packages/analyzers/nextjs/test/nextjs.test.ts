import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { validateStructuralAnalysis } from "@descuff/ir";
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
});
