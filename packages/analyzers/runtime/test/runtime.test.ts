import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { RuntimeAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-runtime", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new RuntimeAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.apiOperations).toEqual([]);
  });
});
