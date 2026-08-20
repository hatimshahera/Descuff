import { describe, expect, it } from "vitest";
import {
  createEmptyStructuralAnalysis,
  createEvidenceIndex,
  validateStructuralAnalysis
} from "../src/index.js";

describe("@descuff/ir", () => {
  it("creates versioned evidence and structural analysis shells", () => {
    const evidence = createEvidenceIndex();
    const analysis = createEmptyStructuralAnalysis("/repo");

    expect(evidence.schemaVersion).toBe("0.1.0");
    expect(analysis.schemaVersion).toBe("0.1.0");
    expect(analysis.projectRoot).toBe("/repo");
  });

  it("validates structural analysis evidence requirements", () => {
    const analysis = createEmptyStructuralAnalysis("/repo");
    analysis.routes.push({
      id: "route:next-app:/",
      path: "/",
      routerKind: "next-app",
      sourceFile: "app/page.tsx",
      evidence: []
    });

    expect(validateStructuralAnalysis(analysis)).toEqual({
      valid: false,
      issues: [
        {
          code: "STRUCTURAL_ROUTE_EVIDENCE_MISSING",
          message: "Route / has no evidence."
        }
      ]
    });
  });
});
