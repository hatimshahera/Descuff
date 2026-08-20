import { describe, expect, it } from "vitest";
import { descuffCommands } from "@descuff/core";
import { runCli } from "../src/cli.js";

describe("@descuff/cli", () => {
  it("prints help", async () => {
    const result = await runCli(["node", "descuff", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it.each(descuffCommands.filter((command) => command !== "fix"))(
    "runs placeholder command %s",
    async (command) => {
      const result = await runCli(["node", "descuff", command]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`${command}: placeholder command shell`);
    }
  );

  it("runs fix as a non-LLM workflow refresh command", async () => {
    const result = await runCli(["node", "descuff", "fix"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("does not invoke an LLM");
    expect(result.stdout).toContain("does not edit source directly");
    expect(result.stdout).toContain("Run existing tests and descuff validate");
  });

  it("keeps every command represented in tests", () => {
    expect(descuffCommands).toContain("fix");
  });

  it("rejects unknown commands", async () => {
    const result = await runCli(["node", "descuff", "unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: unknown");
  });
});
