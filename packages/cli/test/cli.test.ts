import { describe, expect, it } from "vitest";
import { descuffCommands } from "@descuff/core";
import { runCli } from "../src/cli.js";

const fixtureRoot = "fixtures/ecommerce";

describe("descuff CLI", () => {
  it("prints help", async () => {
    const result = await runCli(["node", "descuff", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it("runs scan on a Next.js fixture and writes artifacts", async () => {
    const result = await runCli(["node", "descuff", "scan", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff scan completed");
    expect(result.stdout).toContain("Routes:");
    expect(result.stdout).toContain("Generated changes:");
  });

  it("renders a report from a Next.js fixture", async () => {
    const result = await runCli(["node", "descuff", "report", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Descuff Report");
    expect(result.stdout).toContain("Application type: ecommerce");
    expect(result.stdout).toContain("llms-txt:");
  });

  it("writes an agent plan for a Next.js fixture", async () => {
    const result = await runCli(["node", "descuff", "plan", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff plan wrote");
    expect(result.stdout).toContain("plan.json");
  });

  it("validates a Next.js fixture", async () => {
    const result = await runCli(["node", "descuff", "validate", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff validate passed");
    expect(result.stdout).toContain("Readiness: 100/100");
  });

  it("starts a baseline-to-agent workflow for a Next.js fixture", async () => {
    const result = await runCli(["node", "descuff", "start", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff start completed");
    expect(result.stdout).toContain("Baseline readiness: 100/100");
    expect(result.stdout).toContain("codex-prompt.md");
  });

  it("finishes a baseline-to-agent workflow with a before/after report", async () => {
    await runCli(["node", "descuff", "start", fixtureRoot]);
    const result = await runCli(["node", "descuff", "finish", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff finish passed");
    expect(result.stdout).toContain("Readiness: 100/100 -> 100/100");
    expect(result.stdout).toContain("before-after.md");
  });

  it("runs fix as a non-LLM workflow refresh command", async () => {
    const result = await runCli(["node", "descuff", "fix"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("does not invoke an LLM");
    expect(result.stdout).toContain("does not edit source directly");
    expect(result.stdout).toContain("Run existing tests and descuff validate");
  });

  it("keeps every command represented in tests", () => {
    expect(descuffCommands).toEqual([
      "scan",
      "report",
      "plan",
      "start",
      "finish",
      "fix",
      "apply-safe",
      "validate"
    ]);
  });

  it("keeps apply-safe conservative in this release", async () => {
    const result = await runCli(["node", "descuff", "apply-safe", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("no automatic file writes are enabled");
  });

  it("rejects unknown commands", async () => {
    const result = await runCli(["node", "descuff", "unknown"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command: unknown");
  });
});
