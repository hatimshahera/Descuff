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
    expect(result.stdout).toContain("descuff install --platform [codex|claude-code|cursor]");
  });

  it("runs scan on a Next.js fixture and writes artifacts", async () => {
    const result = await runCli(["node", "descuff", "scan", fixtureRoot]);
    const packet = JSON.parse(
      await readFile(join(fixtureRoot, ".descuff", "skill-evidence-packet.json"), "utf8")
    ) as {
      deterministicSummary: { applicationType: string; domainProfile: { primaryDomain: string } };
      graphify: { status: string };
    };
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
    const graphifyEnrichment = JSON.parse(
      await readFile(join(fixtureRoot, ".descuff", "graphify-enrichment.json"), "utf8")
    ) as { status: string };
    const graphifyEnrichmentMarkdown = await readFile(
      join(fixtureRoot, ".descuff", "graphify-enrichment.md"),
      "utf8"
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff scan completed");
    expect(result.stdout).toContain("Routes:");
    expect(result.stdout).toContain("Generated changes:");
    expect(packet.deterministicSummary.applicationType).toBe("ecommerce");
    expect(packet.deterministicSummary.domainProfile.primaryDomain).toBe("ecommerce");
    expect(packet.graphify.status).toBe("unavailable");
    expect(packetMarkdown).toContain("Descuff Skill Evidence Packet");
    expect(packetMarkdown).toContain("## Graphify");
    expect(graphifyEnrichment.status).toBe("unavailable");
    expect(graphifyEnrichmentMarkdown).toContain("Graphify Enrichment");
    expect(enrichmentTemplate.schemaVersion).toBe("0.1.0");
    expect(enrichmentPrompt).toContain("Descuff Semantic Enrichment Request");
  });

  it("renders a report from a Next.js fixture", async () => {
    const result = await runCli(["node", "descuff", "report", fixtureRoot]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Descuff Report");
    expect(result.stdout).toContain("Domain profile: ecommerce");
    expect(result.stdout).toContain("Compatibility application type: ecommerce");
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
    const driftBaseline = await readFile(
      join(fixtureRoot, ".descuff", "drift-baseline.json"),
      "utf8"
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff start completed");
    expect(result.stdout).toContain("Baseline readiness: 100/100");
    expect(result.stdout).toContain("codex-prompt.md");
    expect(driftBaseline).toContain('"schemaVersion": "0.1.0"');
  });

  it("diffs changed files against the drift baseline", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-diff-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      process.env.DESCUFF_CHANGED_FILES = "README.md";

      const result = await runCli(["node", "descuff", "diff", projectRoot]);
      const report = await readFile(join(projectRoot, ".descuff", "drift-report.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff diff pass");
      expect(result.stdout).toContain("Validation depth: none");
      expect(report).toContain("Descuff Drift Report");
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("checks impacted changes with validation", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      process.env.DESCUFF_CHANGED_FILES = "app/api/search/route.ts";

      const result = await runCli(["node", "descuff", "check", projectRoot]);
      const check = await readFile(join(projectRoot, ".descuff", "drift-check.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff check pass");
      expect(result.stdout).toContain("Validation depth: targeted-runtime");
      expect(check).toContain('"status": "pass"');
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
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

  it("installs the Codex skill into CODEX_HOME when requested globally", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-codex-home-"));
    const previousCodexHome = process.env.CODEX_HOME;

    try {
      process.env.CODEX_HOME = tempRoot;
      const result = await runCli(["node", "descuff", "install", "codex", "--global"]);
      const skill = await readFile(join(tempRoot, "skills", "descuff", "SKILL.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Mode: global");
      expect(result.stdout).toContain("skills/descuff/SKILL.md");
      expect(skill).toContain("name: descuff");
      expect(skill).toContain("npx descuff enrich .");
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("installs the Codex skill with platform syntax", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-codex-platform-"));
    const previousCodexHome = process.env.CODEX_HOME;

    try {
      process.env.CODEX_HOME = tempRoot;
      const result = await runCli(["node", "descuff", "install", "--platform", "codex"]);
      const skill = await readFile(join(tempRoot, "skills", "descuff", "SKILL.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Mode: global");
      expect(result.stdout).toContain("Invoke it in Codex with: $descuff .");
      expect(skill).toContain("name: descuff");
      expect(skill).toContain("npx descuff enrich .");
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("installs a Claude Code project slash command with platform syntax", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-claude-platform-"));

    try {
      const result = await runCli([
        "node",
        "descuff",
        "install",
        "--platform",
        "claude-code",
        tempRoot
      ]);
      const command = await readFile(join(tempRoot, ".claude", "commands", "descuff.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Mode: project");
      expect(result.stdout).toContain("Invoke it in Claude Code with: /descuff .");
      expect(command).toContain("# Descuff Skill For Claude Code");
      expect(command).toContain("npx descuff start .");
      expect(command).toContain("npx descuff enrich .");
      expect(command).toContain("npx descuff finish .");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("installs a Cursor project rule with platform syntax", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cursor-platform-"));

    try {
      const result = await runCli(["node", "descuff", "install", "--platform", "cursor", tempRoot]);
      const rule = await readFile(join(tempRoot, ".cursor", "rules", "descuff.mdc"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Mode: project");
      expect(result.stdout).toContain("Invoke it in Cursor Agent");
      expect(rule).toContain("# Descuff Skill For Cursor");
      expect(rule).toContain("npx descuff start .");
      expect(rule).toContain("npx descuff enrich .");
      expect(rule).toContain("npx descuff finish .");
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

  it("runs the skill-style semantic enrichment dry run through finish", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-skill-dry-run-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });

      const start = await runCli(["node", "descuff", "start", projectRoot]);
      const template = await readFile(
        join(projectRoot, ".descuff", "semantic-enrichment-template.json"),
        "utf8"
      );
      await writeFile(join(projectRoot, ".descuff", "semantic-enrichment.json"), template);
      const enrich = await runCli(["node", "descuff", "enrich", projectRoot]);
      const finish = await runCli(["node", "descuff", "finish", projectRoot]);
      const accepted = await readFile(
        join(projectRoot, ".descuff", "semantic-enrichment-accepted.json"),
        "utf8"
      );
      const beforeAfter = await readFile(join(projectRoot, ".descuff", "before-after.md"), "utf8");

      expect(start.exitCode).toBe(0);
      expect(enrich.exitCode).toBe(0);
      expect(finish.exitCode).toBe(0);
      expect(accepted).toContain('"schemaVersion": "0.1.0"');
      expect(beforeAfter).toContain("Descuff Before/After Report");
      expect(finish.stdout).toContain("descuff finish passed");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs the installed Codex skill contract against a fixture", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-codex-skill-"));
    const codexHome = join(tempRoot, "codex-home");
    const projectRoot = join(tempRoot, "ecommerce");
    const previousCodexHome = process.env.CODEX_HOME;

    try {
      process.env.CODEX_HOME = codexHome;
      await cp(fixtureRoot, projectRoot, { recursive: true });

      const install = await runCli(["node", "descuff", "install", "codex", "--global"]);
      const skill = await readFile(join(codexHome, "skills", "descuff", "SKILL.md"), "utf8");
      const start = await runCli(["node", "descuff", "start", projectRoot]);
      const template = await readFile(
        join(projectRoot, ".descuff", "semantic-enrichment-template.json"),
        "utf8"
      );
      await writeFile(join(projectRoot, ".descuff", "semantic-enrichment.json"), template);
      const enrich = await runCli(["node", "descuff", "enrich", projectRoot]);
      const finish = await runCli(["node", "descuff", "finish", projectRoot]);

      expect(install.exitCode).toBe(0);
      expect(skill).toContain("name: descuff");
      expect(skill).toContain("npx descuff start .");
      expect(skill).toContain("npx descuff enrich .");
      expect(skill).toContain("npx descuff finish .");
      expect(start.exitCode).toBe(0);
      expect(enrich.exitCode).toBe(0);
      expect(finish.exitCode).toBe(0);
      expect(finish.stdout).toContain("descuff finish passed");
    } finally {
      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME;
      } else {
        process.env.CODEX_HOME = previousCodexHome;
      }
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
      "diff",
      "check",
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
