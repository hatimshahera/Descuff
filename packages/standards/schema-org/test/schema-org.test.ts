import { describe, expect, it } from "vitest";
import { schemaOrgAdapterId } from "../src/index.js";

describe("@descuff/standard-schema-org", () => {
  it("exports the adapter id", () => {
    expect(schemaOrgAdapterId).toBe("schema-org");
  });
});
