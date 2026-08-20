import { describe, expect, it } from "vitest";
import { createProjectContext } from "@descuff/core";
import { GraphifyAnalyzer } from "../src/index.js";

describe("@descuff/analyzer-graphify", () => {
  it("implements the structural analyzer contract without leaking Graphify formats", async () => {
    const analysis = await new GraphifyAnalyzer().analyze(createProjectContext("/repo"));

    expect(analysis.schemaVersion).toBe("0.1.0");
  });
});
