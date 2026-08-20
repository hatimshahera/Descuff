import { describe, expect, it } from "vitest";
import { apiCatalogAdapterId } from "../src/index.js";

describe("@descuff/standard-api-catalog", () => {
  it("exports the adapter id", () => {
    expect(apiCatalogAdapterId).toBe("api-catalog");
  });
});
