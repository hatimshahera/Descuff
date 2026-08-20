import { describe, expect, it } from "vitest";
import { descuffCommands } from "@descuff/core";
import { runCli } from "../src/cli.js";

describe("@descuff/cli", () => {
  it("prints help", async () => {
    const result = await runCli(["node", "descuff", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it.each(descuffCommands)("runs placeholder command %s", async (command) => {
    const result = await runCli(["node", "descuff", command]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`${command}: placeholder command shell`);
  });

  it("rejects unknown commands", async () => {
    const result = await runCli(["node", "descuff", "unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: unknown");
  });
});
