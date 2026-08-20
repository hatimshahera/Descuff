import { describe, expect, it } from "vitest";
import { createProjectContext, descuffCommands, isDescuffCommand } from "../src/index.js";

describe("@descuff/core", () => {
  it("defines the Phase 1 CLI command set", () => {
    expect(descuffCommands).toEqual(["scan", "report", "plan", "fix", "apply-safe", "validate"]);
    expect(isDescuffCommand("scan")).toBe(true);
    expect(isDescuffCommand("unknown")).toBe(false);
  });

  it("creates explicit project contexts", () => {
    expect(createProjectContext("/repo")).toEqual({ rootDir: "/repo", cwd: "/repo" });
  });
});
