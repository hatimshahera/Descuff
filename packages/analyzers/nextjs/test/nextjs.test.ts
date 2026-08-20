import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { NativeNextAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-nextjs", () => {
  it("implements the structural analyzer contract", async () => {
    const analysis = await new NativeNextAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.projectRoot).toBe("/repo");
    expect(analysis.routes).toEqual([]);
  });
});
