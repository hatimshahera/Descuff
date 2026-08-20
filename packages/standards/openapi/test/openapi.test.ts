import { describe, expect, it } from "vitest";
import { openApiAdapterId } from "../src/index.js";

describe("@descuff/standard-openapi", () => {
  it("exports the adapter id", () => {
    expect(openApiAdapterId).toBe("openapi");
  });
});
