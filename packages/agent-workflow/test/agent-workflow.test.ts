import { describe, expect, it } from "vitest";
import { getFixCommandSummary } from "../src/index.js";

describe("@descuff/agent-workflow", () => {
  it("documents non-LLM fix command semantics", () => {
    expect(getFixCommandSummary()).toContain("does not edit source directly");
  });
});
