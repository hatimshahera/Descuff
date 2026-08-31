import { describe, expect, it } from "vitest";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { descuffCommands } from "@descuff/core";
import { runCli } from "../src/cli.js";
import {
  parseHostedReconArgs,
  runHostedReconCommand,
  type HostedReconBrowserRenderer
} from "../src/hosted-recon.js";

const fixtureRoot = "fixtures/ecommerce";

describe("descuff CLI", () => {
  it("prints help", async () => {
    const result = await runCli(["node", "descuff", "--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("descuff install --platform [codex|claude-code|cursor]");
    expect(result.stdout).toContain("descuff doctor [project-root]");
  });

  it("runs doctor on a supported Next.js fixture", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-supported-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });

      const result = await runCli(["node", "descuff", "doctor", projectRoot]);
      const doctorJson = await readFile(join(projectRoot, ".descuff", "doctor.json"), "utf8");
      const doctorMarkdown = await readFile(join(projectRoot, ".descuff", "doctor.md"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff doctor supported");
      expect(result.stdout).toContain("Browser runtime: playwright-missing");
      expect(result.stdout).toContain("Browser launch checked: no");
      expect(result.stdout).toContain("Run: npx descuff start .");
      expect(doctorJson).toContain('"supported": true');
      expect(doctorJson).toContain('"packageJson": "present"');
      expect(doctorJson).toContain('"browserLaunchChecked": false');
      expect(doctorMarkdown).toContain("# Descuff Doctor");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor on an unsupported root and preserves typed blockers", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-unsupported-"));

    try {
      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff doctor unsupported");
      expect(result.stderr).toContain("PACKAGE_JSON_MISSING");
      expect(doctorJson).toContain('"packageJson": "missing"');
      expect(doctorJson).toContain('"code": "PACKAGE_JSON_MISSING"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor on malformed package.json and reports a syntax blocker", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-malformed-package-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await writeFile(join(tempRoot, "package.json"), "{bad json");

      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff doctor unsupported");
      expect(result.stderr).toContain("PACKAGE_JSON_MALFORMED");
      expect(result.stderr).not.toContain("PACKAGE_JSON_MISSING");
      expect(doctorJson).toContain('"packageJson": "malformed"');
      expect(doctorJson).toContain('"code": "PACKAGE_JSON_MALFORMED"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor on an unsupported React app without pretending it is Next.js", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-react-"));

    try {
      await writeFile(
        join(tempRoot, "package.json"),
        JSON.stringify({
          name: "react-app",
          dependencies: {
            "@vitejs/plugin-react": "latest",
            vite: "latest",
            react: "latest"
          }
        })
      );

      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Framework: unknown");
      expect(result.stderr).toContain("SUPPORTED_PROJECT_NOT_FOUND");
      expect(doctorJson).toContain('"framework": "unknown"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports absent Descuff artifacts before writing doctor artifacts", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-fresh-artifacts-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await writeFile(
        join(tempRoot, "package.json"),
        JSON.stringify({ name: "doctor-site", dependencies: { next: "15.0.0" } })
      );
      await writeFile(join(tempRoot, "app", "page.tsx"), "export default function Page() {}\n");

      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Existing .descuff artifacts: absent");
      expect(doctorJson).toContain('"descuffArtifacts": "absent"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor on a monorepo root and suggests the nested app root", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-monorepo-"));
    const projectRoot = join(tempRoot, "monorepo-next");

    try {
      await cp("fixtures/monorepo-next", projectRoot, { recursive: true });

      const result = await runCli(["node", "descuff", "doctor", projectRoot]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Candidate app roots: apps/web");
      expect(result.stdout).toContain("Try: npx descuff doctor apps/web");
      expect(result.stderr).toContain("SUPPORTED_PROJECT_NOT_FOUND");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor with valid Graphify output present", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-graphify-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await mkdir(join(tempRoot, "graphify-out"), { recursive: true });
      await writeFile(
        join(tempRoot, "package.json"),
        JSON.stringify({ name: "doctor-site", dependencies: { next: "15.0.0" } })
      );
      await writeFile(join(tempRoot, "app", "page.tsx"), "export default function Page() {}\n");
      await writeFile(join(tempRoot, "graphify-out", "graph.json"), "{}\n");

      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Graphify: present");
      expect(doctorJson).toContain('"graphify": "present"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor with stale Descuff artifact diagnostics", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-stale-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      await appendFile(join(projectRoot, "app", "page.tsx"), "\n// stale doctor artifact test\n");

      const result = await runCli(["node", "descuff", "doctor", projectRoot]);
      const doctorJson = await readFile(join(projectRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Existing .descuff artifacts: stale");
      expect(doctorJson).toContain('"code": "DESCUFF_ARTIFACTS_STALE"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs doctor with stale artifact and Graphify diagnostics", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-doctor-artifacts-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await mkdir(join(tempRoot, "graphify-out"), { recursive: true });
      await writeFile(
        join(tempRoot, "package.json"),
        JSON.stringify({ name: "doctor-site", dependencies: { next: "15.0.0" } })
      );
      await writeFile(join(tempRoot, "app", "page.tsx"), "export default function Page() {}\n");
      await writeFile(join(tempRoot, ".descuff", "baseline.json"), "{bad json");
      await writeFile(join(tempRoot, "graphify-out", "graph.json"), "{bad json");

      const result = await runCli(["node", "descuff", "doctor", tempRoot]);
      const doctorJson = await readFile(join(tempRoot, ".descuff", "doctor.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Existing .descuff artifacts: malformed");
      expect(result.stdout).toContain("Graphify: invalid");
      expect(doctorJson).toContain('"code": "DESCUFF_ARTIFACTS_MALFORMED"');
      expect(doctorJson).toContain('"code": "GRAPHIFY_OUTPUT_INVALID"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
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
    expect(result.stdout).toContain("Runtime proof:");
    expect(result.stdout).toContain("Browser-agent scenarios:");
    expect(result.stdout).toContain("WebMCP tools:");
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

  it("falls back to synthetic runtime evidence when runtime config is malformed", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-runtime-malformed-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await mkdir(join(projectRoot, ".descuff"), { recursive: true });
      await writeFile(join(projectRoot, ".descuff", "runtime.json"), "{bad json");

      const result = await runCli(["node", "descuff", "scan", projectRoot]);
      const analysis = await readFile(join(projectRoot, ".descuff", "analysis.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(analysis).toContain('"code": "RUNTIME_CONFIG_MALFORMED"');
      expect(analysis).toContain('"id": "runtime-route:/"');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
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
    const validation = await readFile(join(fixtureRoot, ".descuff", "validation.json"), "utf8");
    const readinessExplanations = await readFile(
      join(fixtureRoot, ".descuff", "readiness-explanations.json"),
      "utf8"
    );
    const readinessExplanationsMarkdown = await readFile(
      join(fixtureRoot, ".descuff", "readiness-explanations.md"),
      "utf8"
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("descuff validate passed");
    expect(result.stdout).toContain("Readiness: 100/100");
    expect(result.stdout).toContain("Runtime proof:");
    expect(result.stdout).toContain("Browser-agent scenarios:");
    expect(validation).toContain('"readinessExplanations"');
    expect(readinessExplanations).toContain('"category"');
    expect(readinessExplanationsMarkdown).toContain("# Readiness Explanations");
    expect(readinessExplanationsMarkdown).toContain("## discoverability");
    expect(readinessExplanationsMarkdown).toContain("- Status: complete");
    expect(readinessExplanationsMarkdown).toContain("- Scenario impact:");
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
    expect(result.stdout).toContain("Domain profile: ecommerce");
    expect(result.stdout).toContain("App type: ecommerce");
    expect(result.stdout).toContain("Routes: 3");
    expect(result.stdout).toContain("APIs: 3");
    expect(result.stdout).toContain("Capabilities: 4");
    expect(result.stdout).toContain("Forms:");
    expect(result.stdout).toContain("Implemented:");
    expect(result.stdout).toContain("Recommended:");
    expect(result.stdout).toContain("Readiness notes:");
    expect(result.stdout).toContain("Runtime proof:");
    expect(result.stdout).toContain("Browser-agent scenarios:");
    expect(result.stdout).toContain("none");
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

  it("fails diff with a typed error when the drift baseline is missing", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-diff-missing-"));

    try {
      const result = await runCli(["node", "descuff", "diff", tempRoot]);
      const report = await readFile(join(tempRoot, ".descuff", "drift-report.md"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff diff fail");
      expect(result.stderr).toContain("DRIFT_BASELINE_MISSING");
      expect(report).toContain("DRIFT_BASELINE_MISSING");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails check with a typed error when the drift baseline is malformed", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-malformed-"));
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await writeFile(
        join(tempRoot, ".descuff", "drift-baseline.json"),
        '{ "schemaVersion": "0.1.0" }\n'
      );
      process.env.DESCUFF_CHANGED_FILES = "README.md";

      const result = await runCli(["node", "descuff", "check", tempRoot]);
      const check = await readFile(join(tempRoot, ".descuff", "drift-check.json"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff check fail");
      expect(result.stderr).toContain("DRIFT_BASELINE_MALFORMED");
      expect(check).toContain('"code": "DRIFT_BASELINE_MALFORMED"');
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails check when the drift baseline belongs to a different project root", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-mismatch-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      const baselinePath = join(projectRoot, ".descuff", "drift-baseline.json");
      const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
        project: { rootDir: string };
      };
      baseline.project.rootDir = join(tempRoot, "other");
      await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
      process.env.DESCUFF_CHANGED_FILES = "README.md";

      const result = await runCli(["node", "descuff", "check", projectRoot]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff check fail");
      expect(result.stderr).toContain("DRIFT_BASELINE_PROJECT_MISMATCH");
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
      expect(check).toContain('"validationPlan"');
      expect(check).toContain('"webmcp-behavior"');
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("checks metadata-only drift with targeted static validation", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-metadata-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      process.env.DESCUFF_CHANGED_FILES = "openapi.json";

      const result = await runCli(["node", "descuff", "check", projectRoot]);
      const check = await readFile(join(projectRoot, ".descuff", "drift-check.json"), "utf8");

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Validation depth: targeted-static");
      expect(check).toContain('"static-standards"');
      expect(check).toContain('"source-fingerprints"');
      expect(check).toContain('"fullValidationFallback": false');
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails check when an API capability is removed but OpenAPI still advertises it", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-capability-removed-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      await writeFile(
        join(projectRoot, "app", "api", "search", "route.ts"),
        "export const dynamic = 'force-static';\n"
      );
      process.env.DESCUFF_CHANGED_FILES = "app/api/search/route.ts";

      const result = await runCli(["node", "descuff", "check", projectRoot]);
      const check = await readFile(join(projectRoot, ".descuff", "drift-check.json"), "utf8");
      const report = await readFile(join(projectRoot, ".descuff", "drift-report.md"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff check fail");
      expect(check).toContain('"code": "CAPABILITY_REMOVED"');
      expect(report).toContain("## Suggested Repairs");
    } finally {
      if (previousChangedFiles === undefined) {
        delete process.env.DESCUFF_CHANGED_FILES;
      } else {
        process.env.DESCUFF_CHANGED_FILES = previousChangedFiles;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails check when a public route change makes Schema.org metadata stale", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-check-schema-stale-"));
    const projectRoot = join(tempRoot, "ecommerce");
    const previousChangedFiles = process.env.DESCUFF_CHANGED_FILES;

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });
      await runCli(["node", "descuff", "start", projectRoot]);
      await mkdir(join(projectRoot, "app", "sale"), { recursive: true });
      await writeFile(
        join(projectRoot, "app", "sale", "page.tsx"),
        "export default function SalePage() { return <main><h1>Sale</h1></main>; }\n"
      );
      process.env.DESCUFF_CHANGED_FILES = "app/sale/page.tsx";

      const result = await runCli(["node", "descuff", "check", projectRoot]);
      const check = await readFile(join(projectRoot, ".descuff", "drift-check.json"), "utf8");

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("descuff check fail");
      expect(result.stdout).toContain("Validation depth: targeted-runtime");
      expect(check).toContain('"code": "STRUCTURED_METADATA_STALE"');
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
      expect(result.stdout).toContain("APIs: 0");
      expect(result.stdout).toContain(
        "No API operations identified. This can be acceptable for intentionally static sites."
      );
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
    expect(result.stdout).toContain("Runtime proof:");
    expect(result.stdout).toContain("Browser-agent scenarios:");
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
      expect(result.stdout).toContain("For ordinary later edits, run: npx descuff check .");

      const codexInstructions = await readFile(
        join(tempRoot, ".descuff", "skills", "codex", "SKILL.md"),
        "utf8"
      );
      expect(codexInstructions).toContain("Use the compact evidence packet as the primary context");
      expect(codexInstructions).toContain("## Intake");
      expect(codexInstructions).toContain("Before running any Descuff command");
      expect(codexInstructions).toContain("Do not run `start`, `scan`, `plan`, `enrich`");
      expect(codexInstructions).toContain(
        "current public preview supports local Next.js codebases"
      );
      expect(codexInstructions).toContain("npx descuff start .");
      expect(codexInstructions).toContain("npx descuff scenarios .");
      expect(codexInstructions).toContain("npx descuff recon <hosted-url> --browser");
      expect(codexInstructions).toContain("npx descuff finish .");
      expect(codexInstructions).toContain("npx descuff check .");
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
      expect(result.stdout).toContain("After explicit Descuff plan implementation");
      expect(skill).toContain("name: descuff");
      expect(skill).toContain("short explanation and confirmation intake");
      expect(skill).toContain("confirmation intake before running any Descuff command");
      expect(skill).toContain("current public preview supports local Next.js codebases");
      expect(skill).toContain("npx descuff enrich .");
      expect(skill).toContain("npx descuff scenarios .");
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
      expect(skill).toContain("## Intake");
      expect(skill).toContain("Before running any Descuff command");
      expect(skill).toContain("npx descuff enrich .");
      expect(skill).toContain("npx descuff recon <hosted-url> --browser");
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
      expect(result.stdout).toContain("For ordinary later edits, run: npx descuff check .");
      expect(command).toContain("# Descuff Skill For Claude Code");
      expect(command).toContain("## Intake");
      expect(command).toContain("Before running any Descuff command");
      expect(command).toContain("current public preview supports local Next.js codebases");
      expect(command).toContain("npx descuff start .");
      expect(command).toContain("npx descuff enrich .");
      expect(command).toContain("npx descuff scenarios .");
      expect(command).toContain("npx descuff recon <hosted-url> --browser");
      expect(command).toContain("npx descuff finish .");
      expect(command).toContain("npx descuff check .");
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
      expect(result.stdout).toContain("For ordinary later edits, run: npx descuff check .");
      expect(rule).toContain("# Descuff Skill For Cursor");
      expect(rule).toContain("## Intake");
      expect(rule).toContain("Before running any Descuff command");
      expect(rule).toContain("current public preview supports local Next.js codebases");
      expect(rule).toContain("npx descuff start .");
      expect(rule).toContain("npx descuff enrich .");
      expect(rule).toContain("npx descuff scenarios .");
      expect(rule).toContain("npx descuff recon <hosted-url> --browser");
      expect(rule).toContain("npx descuff finish .");
      expect(rule).toContain("npx descuff check .");
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
      expect(skill).toContain("npx descuff scenarios .");
      expect(skill).toContain("npx descuff finish .");
      expect(skill).toContain("npx descuff check .");
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
      "scenarios",
      "recon",
      "doctor",
      "fix",
      "install",
      "enrich",
      "apply-safe",
      "validate"
    ]);
  });

  it("generates evidence-backed browser-agent scenario suggestions", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-scenarios-"));
    const projectRoot = join(tempRoot, "ecommerce");

    try {
      await cp(fixtureRoot, projectRoot, { recursive: true });

      const result = await runCli(["node", "descuff", "scenarios", projectRoot]);
      const suggestionsJson = await readFile(
        join(projectRoot, ".descuff", "scenario-suggestions.json"),
        "utf8"
      );
      const suggestionsMarkdown = await readFile(
        join(projectRoot, ".descuff", "scenario-suggestions.md"),
        "utf8"
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("descuff scenarios completed");
      expect(result.stdout).toContain("Generated scenarios:");
      expect(suggestionsJson).toContain('"source": "descuff-scenarios"');
      expect(suggestionsJson).toContain('"risk": "read-only"');
      expect(suggestionsJson).toContain('"source": "descuff-deterministic"');
      expect(suggestionsMarkdown).toContain("Review generated scenarios before using them");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs hosted recon against a public local fixture URL", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-recon-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli([
          "node",
          "descuff",
          "recon",
          "https://example.test/?token=secret",
          "--max-pages",
          "3"
        ]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");
        const reconMarkdown = await readFile(join(tempRoot, ".descuff", "hosted-recon.md"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("descuff recon completed");
        expect(result.stdout).toContain(
          "Standards visible: llms-txt, schema-org, openapi, api-catalog"
        );
        expect(result.stdout).toContain("Pages inspected: 2");
        expect(reconJson).toContain('"targetUrl": "');
        expect(reconJson).toContain("token=%5BREDACTED%5D");
        expect(reconJson).toContain('"queryParametersRedacted": 1');
        expect(reconJson).toContain('"code": "HOSTED_EVIDENCE_REDACTED"');
        expect(reconJson).toContain('"kind": "llms-txt"');
        expect(reconJson).toContain('"kind": "schema-org"');
        expect(reconMarkdown).toContain("Hosted recon uses public read-only evidence");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("parses hosted recon target after flag values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-recon-flags-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli([
          "node",
          "descuff",
          "recon",
          "--max-pages",
          "3",
          "https://example.test/"
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("descuff recon completed");
        expect(result.stdout).toContain("Pages inspected: 2");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("parses hosted recon target after boolean browser flag", () => {
    const args = parseHostedReconArgs(["--browser", "https://example.test/"], "/repo");

    expect(args.targetUrl).toBe("https://example.test/");
    expect(args.browserRendering).toBe(true);
  });

  it("reports robots-blocked hosted recon with typed blockers", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-robots-"));
    const restoreFetch = mockHostedReconFetch({ robots: "User-agent: *\nDisallow: /\n" });

    try {
      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", "https://example.test/"]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");
        const reconMarkdown = await readFile(join(tempRoot, ".descuff", "hosted-recon.md"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Pages inspected: 0");
        expect(result.stdout).toContain("blocked");
        expect(reconJson).toContain('"code": "HOSTED_ROBOTS_BLOCKED"');
        expect(reconJson).toContain('"code": "HOSTED_RECON_INCONCLUSIVE"');
        expect(reconJson).toContain('"status": "blocked"');
        expect(reconMarkdown).toContain("HOSTED_ROBOTS_BLOCKED");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports cross-origin links as typed hosted blockers", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-origin-"));
    const restoreFetch = mockHostedReconFetch({ crossOriginLink: true });

    try {
      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", "https://example.test/"]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(reconJson).toContain('"code": "HOSTED_ORIGIN_BLOCKED"');
        expect(reconJson).toContain("https://external.test/path?token=%5BREDACTED%5D");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports inconclusive hosted recon when no public evidence is visible", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-inconclusive-"));
    const restoreFetch = mockHostedReconFetch({ noHtml: true, standards: false });

    try {
      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", "https://example.test/"]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");
        const reconMarkdown = await readFile(join(tempRoot, ".descuff", "hosted-recon.md"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Pages inspected: 0");
        expect(reconJson).toContain('"code": "HOSTED_RECON_INCONCLUSIVE"');
        expect(reconMarkdown).toContain("HOSTED_RECON_INCONCLUSIVE");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports malformed hosted browser-agent scenarios", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-scenario-malformed-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await writeFile(
        join(tempRoot, ".descuff", "runtime.json"),
        JSON.stringify({
          hostedBrowserAgentScenarios: [
            "not-an-object",
            {
              id: "missing-criteria",
              title: "Missing criteria",
              intent: "This scenario cannot be evaluated safely."
            }
          ]
        })
      );

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", "https://example.test/"]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Browser-agent scenarios: 0");
        expect(reconJson).toContain('"code": "HOSTED_SCENARIO_MALFORMED"');
        expect(reconJson).toContain("scenario[0] must be an object");
        expect(reconJson).toContain("missing-criteria");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("blocks unsafe hosted browser-agent scenarios", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-scenario-unsafe-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await writeFile(
        join(tempRoot, ".descuff", "runtime.json"),
        JSON.stringify({
          hostedBrowserAgentScenarios: [
            {
              id: "checkout",
              title: "Checkout",
              intent: "Submit checkout.",
              destinationCriteria: ["checkout"],
              expectedEvidenceSurfaces: ["dom"],
              risk: "mutating"
            }
          ]
        })
      );

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", "https://example.test/"]);
        const results = await readFile(
          join(tempRoot, ".descuff", "hosted-browser-agent-results.json"),
          "utf8"
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Destinations reached: 0/1");
        expect(results).toContain('"code": "HOSTED_SCENARIO_UNSAFE"');
        expect(results).toContain('"confidence": "blocked"');
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs hosted recon browser-agent reachability scenarios", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-scenario-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await writeFile(
        join(tempRoot, ".descuff", "runtime.json"),
        JSON.stringify({
          hostedBrowserAgentScenarios: [
            {
              id: "find-black-shirt",
              title: "Find black shirt",
              intent: "Find the black shirt product page without checkout.",
              destinationCriteria: ["Black Shirt", "/products/black-shirt"],
              expectedEvidenceSurfaces: ["dom", "json-ld", "llms-txt", "openapi"],
              risk: "read-only"
            }
          ]
        })
      );

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli([
          "node",
          "descuff",
          "recon",
          "https://example.test/",
          "--max-pages",
          "3"
        ]);
        const scenarios = await readFile(
          join(tempRoot, ".descuff", "hosted-browser-agent-scenarios.json"),
          "utf8"
        );
        const results = await readFile(
          join(tempRoot, ".descuff", "hosted-browser-agent-results.json"),
          "utf8"
        );
        const scenarioMarkdown = await readFile(
          join(tempRoot, ".descuff", "hosted-browser-agent-results.md"),
          "utf8"
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Browser-agent scenarios: 1");
        expect(result.stdout).toContain("Destinations reached: 1/1");
        expect(scenarios).toContain('"destinationCriteria"');
        expect(results).toContain('"destinationReached": true');
        expect(scenarioMarkdown).toContain("These results measure browser-agent reachability");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs hosted recon from generated scenario suggestions", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-suggestions-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      await mkdir(join(tempRoot, ".descuff"), { recursive: true });
      await writeFile(
        join(tempRoot, ".descuff", "scenario-suggestions.json"),
        JSON.stringify({
          schemaVersion: "0.1.0",
          source: "descuff-scenarios",
          suggestions: [
            {
              id: "find-black-shirt",
              title: "Find black shirt",
              intent: "Find the black shirt product page without checkout.",
              startRoute: "/",
              allowedRoutes: ["/", "/products/black-shirt"],
              allowedOrigins: [],
              blockedOrigins: [],
              inputs: {},
              successCriteria: ["Black Shirt", "/products/black-shirt"],
              expectedEvidenceSurfaces: ["dom", "json-ld", "llms-txt"],
              budgets: {
                maxActions: 6,
                maxScreenshots: 2,
                maxDomQueries: 10,
                maxNetworkObservations: 4,
                maxToolCalls: 0
              },
              risk: "read-only",
              evidence: [],
              source: "descuff-deterministic",
              confidence: "medium",
              rationale: "Generated from route evidence."
            }
          ]
        })
      );

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli([
          "node",
          "descuff",
          "recon",
          "https://example.test/",
          "--max-pages",
          "3"
        ]);
        const scenarios = await readFile(
          join(tempRoot, ".descuff", "hosted-browser-agent-scenarios.json"),
          "utf8"
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Browser-agent scenarios: 1");
        expect(result.stdout).toContain("Destinations reached: 1/1");
        expect(scenarios).toContain('"id": "find-black-shirt"');
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("runs hosted recon against a real local HTTP fixture when sockets are available", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-http-"));
    const fixtureServer = await startHostedFixtureServer();

    try {
      if (fixtureServer === null) {
        return;
      }

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli(["node", "descuff", "recon", fixtureServer.url]);
        const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Pages inspected: 2");
        expect(result.stdout).toContain(
          "Standards visible: llms-txt, schema-org, openapi, api-catalog, webmcp"
        );
        expect(reconJson).toContain('"kind": "webmcp"');
        expect(reconJson).toContain('"url": "');
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      await fixtureServer?.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("records rendered browser evidence through an injected hosted renderer", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-browser-"));
    const restoreFetch = mockHostedReconFetch({ standards: false });
    let disposed = false;
    const renderer: HostedReconBrowserRenderer = {
      async render(url) {
        return {
          url: url.href,
          status: 200,
          title: "Rendered Products",
          headings: ["Rendered Products", "Black Shirt"],
          formCount: 1,
          jsonLdCount: 1,
          networkRequests: 3,
          webMcpSupported: true,
          webMcpTools: ["search_products"]
        };
      },
      async dispose() {
        disposed = true;
      }
    };

    try {
      const result = await runHostedReconCommand({
        targetUrl: "https://example.test/",
        projectRoot: tempRoot,
        maxPages: 2,
        browserRendering: true,
        browserRenderer: renderer
      });
      const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");
      const reconMarkdown = await readFile(join(tempRoot, ".descuff", "hosted-recon.md"), "utf8");

      expect(result).toContain("Standards visible: schema-org, webmcp");
      expect(disposed).toBe(true);
      expect(reconJson).toContain('"browserRendering": true');
      expect(reconJson).toContain('"networkRequests": 3');
      expect(reconJson).toContain('"webMcpTools": [');
      expect(reconJson).toContain('"search_products"');
      expect(reconMarkdown).toContain("Browser rendering: observed");
      expect(reconMarkdown).toContain("Browser WebMCP tools: search_products");
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats the first redirected hosted origin as canonical for recon", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-canonical-origin-"));
    const restoreFetch = mockHostedReconFetch({ canonicalOrigin: "https://canonical.test" });
    const renderer: HostedReconBrowserRenderer = {
      async render(url) {
        return {
          url: url.href,
          status: 200,
          headings: ["Canonical Render"],
          formCount: 0,
          jsonLdCount: 1,
          networkRequests: 1,
          webMcpSupported: false,
          webMcpTools: []
        };
      },
      async dispose() {}
    };

    try {
      await runHostedReconCommand({
        targetUrl: "https://example.test/",
        projectRoot: tempRoot,
        maxPages: 2,
        browserRendering: true,
        browserRenderer: renderer
      });
      const reconJson = await readFile(join(tempRoot, ".descuff", "hosted-recon.json"), "utf8");

      expect(reconJson).toContain("Accepted canonical hosted origin https://canonical.test");
      expect(reconJson).toContain('"url": "https://canonical.test/"');
      expect(reconJson).toContain('"url": "https://canonical.test/products/black-shirt"');
      expect(reconJson).toContain('"browserRendering": true');
      expect(reconJson).not.toContain(
        "Skipped browser rendering for cross-origin URL https://canonical.test"
      );
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-HTTP hosted recon targets", async () => {
    const result = await runCli(["node", "descuff", "recon", "file:///tmp/site"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("only supports http:// and https:// URLs");
  });

  it("compares hosted recon against a previous hosted baseline", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-cli-hosted-compare-"));
    const restoreFetch = mockHostedReconFetch();

    try {
      const baselinePath = join(tempRoot, "baseline.json");
      await writeFile(
        baselinePath,
        JSON.stringify({
          schemaVersion: "0.1.0",
          pages: [],
          standards: [],
          scenarios: [],
          blockers: ["previous blocker"]
        })
      );

      const currentCwd = process.cwd();
      process.chdir(tempRoot);
      try {
        const result = await runCli([
          "node",
          "descuff",
          "recon",
          "https://example.test/",
          "--compare",
          baselinePath
        ]);
        const comparison = await readFile(
          join(tempRoot, ".descuff", "hosted-before-after.md"),
          "utf8"
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("hosted-before-after.md");
        expect(comparison).toContain("Pages visited: 0 -> 2");
        expect(comparison).toContain("Standards visible: 0 -> 4");
        expect(comparison).toContain("Blockers: 1 -> 0");
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      restoreFetch();
      await rm(tempRoot, { recursive: true, force: true });
    }
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

function mockHostedReconFetch(
  options: {
    robots?: string;
    crossOriginLink?: boolean;
    noHtml?: boolean;
    standards?: boolean;
    canonicalOrigin?: string;
  } = {}
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = new URL(String(typeof input === "object" && "url" in input ? input.url : input));
    if (url.pathname === "/robots.txt" && options.robots !== undefined) {
      return textResponse(responseUrl(url, options), options.robots, "text/plain");
    }
    if (options.standards !== false && url.pathname === "/llms.txt") {
      return textResponse(
        responseUrl(url, options),
        "Descuff fixture. Products live at /products/black-shirt.\n",
        "text/plain"
      );
    }
    if (options.standards !== false && url.pathname === "/openapi.json") {
      return textResponse(
        responseUrl(url, options),
        JSON.stringify({ openapi: "3.1.0", paths: { "/api/products": { get: {} } } }),
        "application/json"
      );
    }
    if (options.standards !== false && url.pathname === "/.well-known/api-catalog") {
      return textResponse(
        responseUrl(url, options),
        JSON.stringify({ linkset: [{ anchor: "/openapi.json" }] }),
        "application/linkset+json"
      );
    }
    if (url.pathname === "/products/black-shirt") {
      return textResponse(
        responseUrl(url, options),
        `<!doctype html>
        <html>
          <head>
            <title>Black Shirt</title>
            <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Black Shirt"}</script>
          </head>
          <body>
            <h1>Black Shirt</h1>
            <form method="get" action="/search"><input name="q" aria-label="Search products" /></form>
          </body>
        </html>`,
        "text/html"
      );
    }
    if (url.pathname === "/" || url.pathname === "") {
      if (options.noHtml === true) {
        return textResponse(responseUrl(url, options), "not html", "text/plain");
      }
      return textResponse(
        responseUrl(url, options),
        `<!doctype html>
      <html>
        <head><title>Hosted Fixture</title></head>
        <body>
          <h1>Products</h1>
          <a href="/products/black-shirt">Black Shirt under 15 pounds</a>
          ${options.crossOriginLink === true ? '<a href="https://external.test/path?token=secret">External path</a>' : ""}
        </body>
      </html>`,
        "text/html"
      );
    }

    return new Response("not found", {
      status: 404,
      headers: { "content-type": "text/plain" }
    });
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function textResponse(url: string, body: string, contentType: string): Response {
  const response = new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType
    }
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function responseUrl(
  url: URL,
  options: {
    canonicalOrigin?: string;
  }
): string {
  if (options.canonicalOrigin === undefined) {
    return url.href;
  }
  const redirected = new URL(url.href);
  const canonical = new URL(options.canonicalOrigin);
  redirected.protocol = canonical.protocol;
  redirected.host = canonical.host;
  return redirected.href;
}

async function startHostedFixtureServer(): Promise<{
  url: string;
  close: () => Promise<void>;
} | null> {
  const server = createServer((request, response) => {
    const pathname = request.url?.split("?")[0] ?? "/";
    if (pathname === "/robots.txt") {
      sendFixtureResponse(response, 404, "text/plain", "not found");
      return;
    }
    if (pathname === "/llms.txt") {
      sendFixtureResponse(response, 200, "text/plain", "Descuff local HTTP fixture.\n");
      return;
    }
    if (pathname === "/openapi.json") {
      sendFixtureResponse(
        response,
        200,
        "application/json",
        JSON.stringify({ openapi: "3.1.0", paths: { "/api/products": { get: {} } } })
      );
      return;
    }
    if (pathname === "/.well-known/api-catalog") {
      sendFixtureResponse(
        response,
        200,
        "application/linkset+json",
        JSON.stringify({ linkset: [{ anchor: "/openapi.json" }] })
      );
      return;
    }
    if (pathname === "/webmcp.json") {
      sendFixtureResponse(
        response,
        200,
        "application/json",
        JSON.stringify({ tools: [{ name: "search_products", readOnly: true }] })
      );
      return;
    }
    if (pathname === "/products/black-shirt") {
      sendFixtureResponse(
        response,
        200,
        "text/html",
        `<!doctype html>
        <html>
          <head>
            <title>Black Shirt</title>
            <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Black Shirt"}</script>
          </head>
          <body><h1>Black Shirt</h1></body>
        </html>`
      );
      return;
    }
    sendFixtureResponse(
      response,
      200,
      "text/html",
      `<!doctype html>
      <html>
        <head><title>Hosted HTTP Fixture</title></head>
        <body>
          <h1>Products</h1>
          <a href="/products/black-shirt">Black Shirt under 15 pounds</a>
        </body>
      </html>`
    );
  });

  const listenResult = await new Promise<"listening" | "blocked">((resolveListen, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPERM") {
        resolveListen("blocked");
        return;
      }
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => resolveListen("listening"));
  });

  if (listenResult === "blocked") {
    return null;
  }

  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    });
    throw new Error("Hosted fixture server did not expose a TCP address.");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error === undefined ? resolveClose() : reject(error)));
      })
  };
}

function sendFixtureResponse(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string
): void {
  response.writeHead(status, { "content-type": contentType });
  response.end(body);
}

async function sourceHash(projectRoot: string, path: string): Promise<string | null> {
  const manifest = JSON.parse(
    await readFile(join(projectRoot, ".descuff", "source-fingerprints.json"), "utf8")
  ) as { files: Array<{ path: string; sha256: string | null }> };
  return manifest.files.find((file) => file.path === path)?.sha256 ?? null;
}
