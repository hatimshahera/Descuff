import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/index.js";

describe("@descuff/config", () => {
  it("creates a zero-config runtime configuration shell", () => {
    expect(createDefaultConfig()).toEqual({
      runtime: {
        environmentVariableNames: [],
        allowedRoutes: []
      }
    });
  });
});
