import { describe, expect, it } from "vitest";
import { createEmptyValidationSummary } from "../src/index.js";

describe("@descuff/validator", () => {
  it("creates an empty passing validation summary", () => {
    expect(createEmptyValidationSummary()).toEqual({ passed: true, failures: [] });
  });
});
