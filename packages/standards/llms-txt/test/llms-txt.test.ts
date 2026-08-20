import { describe, expect, it } from "vitest";
import { llmsTxtAdapterId } from "../src/index.js";

describe("@descuff/standard-llms-txt", () => {
  it("exports the adapter id", () => {
    expect(llmsTxtAdapterId).toBe("llms-txt");
  });
});
