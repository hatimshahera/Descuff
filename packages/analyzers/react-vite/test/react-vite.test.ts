import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { structuralAnalysisToApplicationModel, validateStructuralAnalysis } from "@descuff/ir";
import { ReactViteAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-react-vite", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new ReactViteAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.framework).toMatchObject({ kind: "unknown", detected: false });
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });

  it("detects a runnable React/Vite app and extracts routes, forms, fetch references, and standards", async () => {
    const analysis = await new ReactViteAnalyzer().analyze(
      createProjectContext("fixtures/react-vite")
    );

    expect(analysis.framework).toMatchObject({ kind: "react-vite", detected: true });
    expect(analysis.routes.map((route) => `${route.routerKind} ${route.path}`).sort()).toEqual([
      "react-router /",
      "react-router /about",
      "react-router /products",
      "react-router /search"
    ]);
    expect(
      analysis.apiOperations.map((operation) => `${operation.method} ${operation.path}`).sort()
    ).toEqual(["GET /api/products", "POST /api/waitlist"]);
    expect(analysis.forms).toContainEqual(
      expect.objectContaining({
        action: "/api/waitlist",
        method: "post",
        sourceFile: "src/WaitlistForm.tsx"
      })
    );
    expect(analysis.existingStandards.map((standard) => standard.kind).sort()).toEqual([
      "llms-txt",
      "openapi",
      "schema-org"
    ]);
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);

    const model = structuralAnalysisToApplicationModel(analysis);
    expect(model.project.framework).toBe("react-vite");
    expect(model.apis.map((api) => `${api.method} ${api.path}:${api.sideEffect}`).sort()).toEqual([
      "GET /api/products:read",
      "POST /api/waitlist:write"
    ]);
  });

  it("does not pretend a React component library is a runnable React/Vite app", async () => {
    const analysis = await new ReactViteAnalyzer().analyze(
      createProjectContext("fixtures/react-library")
    );

    expect(analysis.framework).toMatchObject({ kind: "unknown", detected: false });
    expect(analysis.routes).toEqual([]);
    expect(validateStructuralAnalysis(analysis).valid).toBe(true);
  });
});
