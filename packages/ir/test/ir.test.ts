import { describe, expect, it } from "vitest";
import { createEmptyStructuralAnalysis, createEvidenceIndex } from "../src/index.js";

describe("@descuff/ir", () => {
  it("creates versioned evidence and structural analysis shells", () => {
    const evidence = createEvidenceIndex();
    const analysis = createEmptyStructuralAnalysis("/repo");

    expect(evidence.schemaVersion).toBe("0.1.0");
    expect(analysis.schemaVersion).toBe("0.1.0");
    expect(analysis.projectRoot).toBe("/repo");
  });
});
