import { describe, expect, it } from "vitest";
import { createEmptyStructuralAnalysis } from "@descuff/ir";
import { renderStructuralSummary } from "../src/index.js";

describe("@descuff/reporter", () => {
  it("renders a structural summary", () => {
    expect(renderStructuralSummary(createEmptyStructuralAnalysis("/repo"))).toContain("Routes: 0");
  });
});
