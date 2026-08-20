import { describe, expect, it } from "vitest";
import { webMcpAdapterId } from "../src/index.js";

describe("@descuff/standard-webmcp", () => {
  it("exports the adapter id", () => {
    expect(webMcpAdapterId).toBe("webmcp");
  });
});
