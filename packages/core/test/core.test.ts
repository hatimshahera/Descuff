import { describe, expect, it } from "vitest";
import {
  createExternalRepoAuditResult,
  createProjectContext,
  descuffCommands,
  externalRepoAuditSchemaVersion,
  isDescuffCommand,
  phase10CompletedExternalAuditResults,
  phase10ExternalAuditCandidates,
  renderExternalRepoAuditMarkdown,
  renderExternalRepoCoverageMatrix
} from "../src/index.js";

describe("@descuff/core", () => {
  it("defines the Phase 1 CLI command set", () => {
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
    expect(isDescuffCommand("scan")).toBe(true);
    expect(isDescuffCommand("unknown")).toBe(false);
  });

  it("creates explicit project contexts", () => {
    expect(createProjectContext("/repo")).toEqual({ rootDir: "/repo", cwd: "/repo" });
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
