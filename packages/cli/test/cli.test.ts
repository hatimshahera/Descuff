import { describe, expect, it } from "vitest";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("refreshes stale cached artifacts before rendering a report", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });

      await runCli(["node", "descuff", "scan", projectRoot]);
      const before = await sourceHash(projectRoot, "app/page.tsx");

      await appendFile(join(projectRoot, "app/page.tsx"), "\n// Descuff stale artifact test\n");
      const result = await runCli(["node", "descuff", "report", projectRoot]);
      const after = await sourceHash(projectRoot, "app/page.tsx");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Descuff Report");
      expect(after).not.toBe(before);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
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

  it("does not generate API or WebMCP plans for static sites without APIs", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-static-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await writeFile(
        join(tempRoot, "package.json"),
        JSON.stringify({
          name: "static-site",
          private: true,
          dependencies: {
            next: "14.2.6"
          }
        })
      );
      await writeFile(
        join(tempRoot, "app", "page.tsx"),
        "export default function Page() { return <main><h1>Static Site</h1></main>; }\n"
      );

      const result = await runCli(["node", "descuff", "start", tempRoot]);
      const generatedChanges = JSON.parse(
        await readFile(join(tempRoot, ".descuff", "generated-changes.json"), "utf8")
      ) as Array<{ standardId: string }>;

      expect(result.exitCode).toBe(0);
      expect(generatedChanges.map((change) => change.standardId).sort()).toEqual([
        "llms-txt",
        "schema-org"
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
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

async function sourceHash(projectRoot: string, path: string): Promise<string | null> {
  const manifest = JSON.parse(
    await readFile(join(projectRoot, ".descuff", "source-fingerprints.json"), "utf8")
  ) as { files: Array<{ path: string; sha256: string | null }> };
  return manifest.files.find((file) => file.path === path)?.sha256 ?? null;
}
