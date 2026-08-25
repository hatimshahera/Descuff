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
    const packet = JSON.parse(
      await readFile(join(fixtureRoot, ".descuff", "skill-evidence-packet.json"), "utf8")
    ) as { deterministicSummary: { applicationType: string } };
    const packetMarkdown = await readFile(
      join(fixtureRoot, ".descuff", "skill-evidence-packet.md"),
      "utf8"
    );
    const enrichmentTemplate = JSON.parse(
      await readFile(join(fixtureRoot, ".descuff", "semantic-enrichment-template.json"), "utf8")
    ) as { schemaVersion: string };
    const enrichmentPrompt = await readFile(
      join(fixtureRoot, ".descuff", "semantic-enrichment-prompt.md"),
      "utf8"
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff scan completed");
    expect(result.stdout).toContain("Routes:");
    expect(result.stdout).toContain("Generated changes:");
    expect(packet.deterministicSummary.applicationType).toBe("ecommerce");
    expect(packetMarkdown).toContain("Descuff Skill Evidence Packet");
    expect(enrichmentTemplate.schemaVersion).toBe("0.1.0");
    expect(enrichmentPrompt).toContain("Descuff Semantic Enrichment Request");
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

  it("generates local skill instruction artifacts for Codex, Claude Code, and Cursor", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-install-"));

    try {
      const result = await runCli(["node", "descuff", "install", "all", tempRoot]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff install completed");
      expect(result.stdout).toContain("skills/codex/SKILL.md");
      expect(result.stdout).toContain("skills/claude-code/.claude/commands/descuff.md");
      expect(result.stdout).toContain("skills/cursor/.cursor/rules/descuff.mdc");

      const codexInstructions = await readFile(
        join(tempRoot, ".descuff", "skills", "codex", "SKILL.md"),
        "utf8"
      );
      expect(codexInstructions).toContain("Use the compact evidence packet as the primary context");
      expect(codexInstructions).toContain("npx descuff start .");
      expect(codexInstructions).toContain("npx descuff finish .");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reviews host-agent semantic enrichment and writes a diff", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-enrich-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "scan", projectRoot]);
      const template = await readFile(
        join(projectRoot, ".descuff", "semantic-enrichment-template.json"),
        "utf8"
      );
      await writeFile(join(projectRoot, ".descuff", "semantic-enrichment.json"), template);

      const result = await runCli(["node", "descuff", "enrich", projectRoot]);
      const diff = await readFile(
        join(projectRoot, ".descuff", "semantic-enrichment-diff.md"),
        "utf8"
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff enrich passed");
      expect(result.stdout).toContain("Diff:");
      expect(diff).toContain("Semantic Enrichment");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects semantic enrichment with unknown evidence IDs", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-enrich-bad-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "scan", projectRoot]);
      const badEnrichment = {
        schemaVersion: "0.1.0",
        domainProfile: {
          summary: "Bad enrichment.",
          primaryDomain: "",
          domains: ["unknown"],
          confidence: "high",
          evidenceIds: ["missing:evidence"]
        },
        entityMeanings: [],
        capabilityMeanings: [],
        candidateConcepts: [],
        standardSuitability: [],
        uncertaintyNotes: []
      };
      await writeFile(
        join(projectRoot, ".descuff", "semantic-enrichment.json"),
        `${JSON.stringify(badEnrichment, null, 2)}\n`
      );

      const result = await runCli(["node", "descuff", "enrich", projectRoot]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff enrich failed");
      expect(result.stderr).toContain("SEMANTIC_DOMAIN_PROFILE_EVIDENCE_UNKNOWN");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps every command represented in tests", () => {
    expect(descuffCommands).toEqual([
      "scan",
      "report",
      "plan",
      "start",
      "finish",
      "fix",
      "install",
      "enrich",
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
