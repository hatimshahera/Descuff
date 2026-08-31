import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExternalRepoAuditResult,
  createProjectContext,
  descuffCommands,
  externalRepoAuditSchemaVersion,
  isDescuffCommand,
  phase10CompletedExternalAuditResults,
  phase10ExternalAuditCandidates,
  renderDoctorMarkdown,
  renderDoctorSummary,
  renderExternalRepoAuditMarkdown,
  renderExternalRepoCoverageMatrix,
  runDoctor
} from "../src/index.js";

describe("@descuff/core", () => {
  it("defines the CLI command set", () => {
    expect(descuffCommands).toEqual([
      "scan",
      "report",
      "plan",
      "start",
      "finish",
      "diff",
      "check",
      "recon",
      "doctor",
      "fix",
      "install",
      "enrich",
      "apply-safe",
      "validate"
    ]);
    expect(isDescuffCommand("scan")).toBe(true);
    expect(isDescuffCommand("unknown")).toBe(false);
  });

  it("creates explicit project contexts", () => {
    expect(createProjectContext("/repo")).toEqual({ rootDir: "/repo", cwd: "/repo" });
  });

  it("diagnoses a supported Next.js project root", async () => {
    const result = await runDoctor("fixtures/ecommerce", {
      now: new Date("2026-08-30T00:00:00.000Z"),
      nodeVersion: "v22.0.0"
    });

    expect(result.supported).toBe(true);
    expect(result.checkedAt).toBe("2026-08-30T00:00:00.000Z");
    expect(result.detected.framework).toBe("nextjs");
    expect(result.detected.packageJson).toBe("present");
    expect(result.detected.runtimePrerequisites.nodeSupported).toBe(true);
    expect(result.detected.runtimePrerequisites.browserRuntime).toBe("playwright-missing");
    expect(result.detected.runtimePrerequisites.browserLaunchChecked).toBe(false);
    expect(result.detected.nextIndicators).toContain("app");
    expect(result.issues[0]?.code).toBe("NEXTJS_PROJECT_SUPPORTED");
    expect(renderDoctorSummary(result, "fixtures/ecommerce/.descuff")).toContain(
      "descuff doctor supported"
    );
    expect(renderDoctorMarkdown(result)).toContain("## Detected");
  });

  it("uses the current time for doctor checks when no test clock is provided", async () => {
    const result = await runDoctor("fixtures/ecommerce", {
      nodeVersion: "v22.0.0"
    });

    expect(result.checkedAt).not.toBe("1970-01-01T00:00:00.000Z");
    expect(Date.parse(result.checkedAt)).not.toBeNaN();
  });

  it("reports malformed package.json separately from missing package.json", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "descuff-core-doctor-package-json-"));

    try {
      await mkdir(join(tempRoot, "app"), { recursive: true });
      await writeFile(join(tempRoot, "package.json"), "{bad json");

      const result = await runDoctor(tempRoot, {
        now: new Date("2026-08-30T00:00:00.000Z"),
        nodeVersion: "v22.0.0"
      });

      expect(result.supported).toBe(false);
      expect(result.detected.packageJson).toBe("malformed");
      expect(result.issues.map((issue) => issue.code)).toContain("PACKAGE_JSON_MALFORMED");
      expect(result.issues.map((issue) => issue.code)).not.toContain("PACKAGE_JSON_MISSING");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports unsupported Node.js versions as diagnostic errors", async () => {
    const result = await runDoctor("fixtures/ecommerce", {
      now: new Date("2026-08-30T00:00:00.000Z"),
      nodeVersion: "v20.10.0"
    });

    expect(result.supported).toBe(true);
    expect(result.detected.runtimePrerequisites.nodeSupported).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("NODE_VERSION_UNSUPPORTED");
    expect(renderDoctorSummary(result, "fixtures/ecommerce/.descuff")).toContain("Blockers: 1");
  });

  it("reports unsupported roots with nested Next.js candidates", async () => {
    const result = await runDoctor("fixtures/monorepo-next", {
      now: new Date("2026-08-30T00:00:00.000Z"),
      nodeVersion: "v22.0.0"
    });

    expect(result.supported).toBe(false);
    expect(result.detected.candidateAppRoots).toEqual(["apps/web"]);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["SUPPORTED_PROJECT_NOT_FOUND", "CANDIDATE_APP_ROOTS_FOUND"])
    );
    expect(renderDoctorSummary(result, "fixtures/monorepo-next/.descuff")).toContain(
      "Try: npx descuff doctor apps/web"
    );
  });

  it("records external repository audit results with stable benchmark fields", () => {
    const audit = createExternalRepoAuditResult({
      auditedAt: "2026-08-21T00:00:00.000Z",
      target: {
        id: "catalog-app",
        name: "Catalog App",
        repositoryUrl: "https://github.com/example/catalog-app",
        commitSha: "abc123",
        framework: "nextjs",
        routerKinds: ["app-router"],
        coverageTags: ["public-read-api", "dynamic-routes"],
        selectionRationale: "Exercises public product APIs and App Router dynamic pages."
      },
      descuffVersion: "0.0.2",
      commandsRun: ["npx descuff start .", "npx descuff finish ."],
      expectedCapabilities: ["search catalog", "view product"],
      detectedCapabilities: ["view product"],
      missedCapabilities: ["search catalog"],
      inventedCapabilities: ["delete product"],
      findings: [
        {
          kind: "bad-plan",
          severity: "major",
          summary: "Plan proposed an OpenAPI operation for an endpoint not present in source.",
          evidence: [".descuff/generated-changes.json"],
          followUp: "Add a fixture for invented OpenAPI operations."
        }
      ]
    });

    expect(audit.schemaVersion).toBe(externalRepoAuditSchemaVersion);
    expect(renderExternalRepoAuditMarkdown([audit])).toContain(
      "| Catalog App | abc123 | 1 | 1 | 1 |"
    );
    expect(renderExternalRepoAuditMarkdown([audit])).toContain(
      "- bad-plan (major): Plan proposed an OpenAPI operation for an endpoint not present in source."
    );
  });

  it("defines the Phase 10 external repository coverage matrix", () => {
    expect(phase10ExternalAuditCandidates).toHaveLength(9);
    expect(
      phase10ExternalAuditCandidates.filter((candidate) => candidate.requiredForRelease)
    ).toHaveLength(8);
    expect(phase10ExternalAuditCandidates.map((candidate) => candidate.id)).toEqual([
      "tailnext",
      "netlify-nextjs-blog-theme",
      "nextjs-commerce-app-router",
      "nextjs-saas-starter",
      "calcom-developer-starter-kit",
      "clerk-nextjs-pages-quickstart",
      "umami",
      "formbricks",
      "dub"
    ]);
    const coverageTags = phase10ExternalAuditCandidates.flatMap(
      (candidate) => candidate.coverageTags
    );
    expect(coverageTags).toEqual(
      expect.arrayContaining([
        "app-router",
        "pages-router",
        "javascript",
        "typescript",
        "commerce",
        "forms-heavy",
        "auth",
        "api-heavy",
        "monorepo"
      ])
    );
  });

  it("renders the Phase 10 external repository coverage matrix", () => {
    expect(renderExternalRepoCoverageMatrix()).toContain(
      "| 1 | Tailnext | yes | app-router, javascript, static-content, marketing-site |"
    );
    expect(renderExternalRepoCoverageMatrix()).toContain("| 9 | Dub | optional |");
  });

  it("records completed Phase 10 external audit benchmarks", () => {
    expect(phase10CompletedExternalAuditResults.map((audit) => audit.target.id)).toEqual([
      "tailnext",
      "netlify-nextjs-blog-theme",
      "nextjs-commerce-app-router",
      "nextjs-saas-starter",
      "calcom-developer-starter-kit",
      "clerk-nextjs-pages-quickstart",
      "umami",
      "formbricks"
    ]);
    expect(
      phase10CompletedExternalAuditResults.every(
        (audit) =>
          audit.schemaVersion === externalRepoAuditSchemaVersion &&
          audit.missedCapabilities.length === 0 &&
          audit.inventedCapabilities.length === 0
      )
    ).toBe(true);
    expect(renderExternalRepoAuditMarkdown(phase10CompletedExternalAuditResults)).toContain(
      "| Cal.com Developer Starter Kit | 5095882439600a0ce4e17955fac1c39f07764d0c | 1 | 0 | 0 |"
    );
    expect(renderExternalRepoAuditMarkdown(phase10CompletedExternalAuditResults)).toContain(
      "Fixed by modelling proxy auth boundaries and filtering authenticated routes from public metadata."
    );
    expect(renderExternalRepoAuditMarkdown(phase10CompletedExternalAuditResults)).toContain(
      "Fixed by detecting route-handler auth evidence and applying same-file authenticated/admin capability visibility."
    );
    expect(renderExternalRepoAuditMarkdown(phase10CompletedExternalAuditResults)).toContain(
      "Fixed by detecting nested Next package manifests and route roots under monorepo app folders."
    );
  });
});
