export const externalRepoAuditSchemaVersion = "0.1.0";

export type ExternalRepoAuditFindingKind =
  | "wrong-classification"
  | "missed-capability"
  | "invented-capability"
  | "bad-plan"
  | "validation-false-positive"
  | "validation-false-negative"
  | "crash"
  | "unsupported-pattern";

export interface ExternalRepoAuditTarget {
  id: string;
  name: string;
  repositoryUrl: string;
  commitSha: string;
  framework: "nextjs";
  routerKinds: Array<"app-router" | "pages-router">;
  coverageTags: string[];
  selectionRationale: string;
}

export interface ExternalRepoAuditCandidate {
  id: string;
  name: string;
  repositoryUrl: string;
  framework: "nextjs";
  routerKinds: Array<"app-router" | "pages-router">;
  coverageTags: string[];
  selectionRationale: string;
  auditOrder: number;
  requiredForRelease: boolean;
}

export interface ExternalRepoAuditFinding {
  kind: ExternalRepoAuditFindingKind;
  severity: "blocker" | "major" | "minor";
  summary: string;
  evidence: string[];
  followUp: string;
}

export interface ExternalRepoAuditResult {
  schemaVersion: typeof externalRepoAuditSchemaVersion;
  auditedAt: string;
  target: ExternalRepoAuditTarget;
  descuffVersion: string;
  commandsRun: string[];
  expectedCapabilities: string[];
  detectedCapabilities: string[];
  missedCapabilities: string[];
  inventedCapabilities: string[];
  findings: ExternalRepoAuditFinding[];
}

export function createExternalRepoAuditResult(
  input: Omit<ExternalRepoAuditResult, "schemaVersion">
): ExternalRepoAuditResult {
  return {
    schemaVersion: externalRepoAuditSchemaVersion,
    ...input
  };
}

export const phase10ExternalAuditCandidates: ExternalRepoAuditCandidate[] = [
  {
    id: "tailnext",
    name: "Tailnext",
    repositoryUrl: "https://github.com/arthelokyo/tailnext",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["app-router", "javascript", "static-content", "marketing-site"],
    selectionRationale:
      "Mostly static App Router JavaScript site; should not cause Descuff to invent capabilities.",
    auditOrder: 1,
    requiredForRelease: true
  },
  {
    id: "netlify-nextjs-blog-theme",
    name: "Netlify Next.js Blog Theme",
    repositoryUrl: "https://github.com/netlify-templates/nextjs-blog-theme",
    framework: "nextjs",
    routerKinds: ["pages-router"],
    coverageTags: ["pages-router", "javascript", "mdx-content", "content-site"],
    selectionRationale:
      "Pages Router JavaScript content site; covers a shape not represented by the main ecommerce fixture.",
    auditOrder: 2,
    requiredForRelease: true
  },
  {
    id: "nextjs-commerce-app-router",
    name: "Next.js Commerce App Router",
    repositoryUrl: "https://github.com/enesergun/nextjs-commerce-app-router",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["app-router", "typescript", "commerce", "server-actions"],
    selectionRationale:
      "Commerce App Router TypeScript app with Server Actions; exercises product and cart-style capability discovery.",
    auditOrder: 3,
    requiredForRelease: true
  },
  {
    id: "nextjs-saas-starter",
    name: "Next.js SaaS Starter",
    repositoryUrl: "https://github.com/nextjs/saas-starter",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["app-router", "typescript", "saas", "auth", "rbac", "dashboard", "stripe"],
    selectionRationale:
      "SaaS app with authentication, dashboard flows, payments, database-backed state, and safety-sensitive capabilities.",
    auditOrder: 4,
    requiredForRelease: true
  },
  {
    id: "calcom-developer-starter-kit",
    name: "Cal.com Developer Starter Kit",
    repositoryUrl: "https://github.com/calcom/developer-starter-kit",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["app-router", "booking", "forms", "workflows", "external-api"],
    selectionRationale:
      "Booking workflow app with forms, scheduling actions, dynamic routes, and external API boundaries.",
    auditOrder: 5,
    requiredForRelease: true
  },
  {
    id: "clerk-nextjs-pages-quickstart",
    name: "Clerk Next.js Pages Quickstart",
    repositoryUrl: "https://github.com/clerk/clerk-nextjs-pages-quickstart",
    framework: "nextjs",
    routerKinds: ["pages-router"],
    coverageTags: ["pages-router", "typescript", "auth", "protected-routes"],
    selectionRationale:
      "Pages Router authentication boundary; verifies Descuff does not treat protected functionality as public callable behavior.",
    auditOrder: 6,
    requiredForRelease: true
  },
  {
    id: "umami",
    name: "Umami",
    repositoryUrl: "https://github.com/umami-software/umami",
    framework: "nextjs",
    routerKinds: ["app-router", "pages-router"],
    coverageTags: ["production-app", "api-heavy", "analytics", "auth", "database"],
    selectionRationale:
      "Production analytics app; stresses API discovery, dashboards, authentication, and permission-sensitive behavior.",
    auditOrder: 7,
    requiredForRelease: true
  },
  {
    id: "formbricks",
    name: "Formbricks",
    repositoryUrl: "https://github.com/formbricks/formbricks",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["monorepo", "forms-heavy", "surveys", "api-heavy", "existing-openapi"],
    selectionRationale:
      "Large forms and survey monorepo with existing API documentation; stresses unsupported patterns and scale assumptions.",
    auditOrder: 8,
    requiredForRelease: true
  },
  {
    id: "dub",
    name: "Dub",
    repositoryUrl: "https://github.com/dubinc/dub",
    framework: "nextjs",
    routerKinds: ["app-router"],
    coverageTags: ["optional", "large-monorepo", "analytics", "auth", "stripe", "sso"],
    selectionRationale:
      "Optional large production benchmark. Useful as a stress test but not required to block 0.1.0.",
    auditOrder: 9,
    requiredForRelease: false
  }
];

export function renderExternalRepoCoverageMatrix(
  candidates: ExternalRepoAuditCandidate[] = phase10ExternalAuditCandidates
): string {
  const lines = ["# Descuff Phase 10 External Repository Matrix", ""];

  lines.push("| Order | Repository | Required | Coverage | Rationale |");
  lines.push("| ---: | --- | --- | --- | --- |");
  for (const candidate of [...candidates].sort((a, b) => a.auditOrder - b.auditOrder)) {
    lines.push(
      `| ${candidate.auditOrder} | ${candidate.name} | ${candidate.requiredForRelease ? "yes" : "optional"} | ${candidate.coverageTags.join(", ")} | ${candidate.selectionRationale} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

export function renderExternalRepoAuditMarkdown(audits: ExternalRepoAuditResult[]): string {
  const lines = ["# Descuff External Repository Audit", ""];

  if (audits.length === 0) {
    lines.push("No external repository audits recorded.", "");
    return lines.join("\n");
  }

  lines.push("| Repository | Commit | Findings | Missed | Invented |");
  lines.push("| --- | --- | ---: | ---: | ---: |");
  for (const audit of audits) {
    lines.push(
      `| ${audit.target.name} | ${audit.target.commitSha} | ${audit.findings.length} | ${audit.missedCapabilities.length} | ${audit.inventedCapabilities.length} |`
    );
  }
  lines.push("");

  for (const audit of audits) {
    lines.push(`## ${audit.target.name}`, "");
    lines.push(`- Repository: ${audit.target.repositoryUrl}`);
    lines.push(`- Commit: ${audit.target.commitSha}`);
    lines.push(`- Coverage: ${audit.target.coverageTags.join(", ") || "none"}`);
    lines.push(`- Rationale: ${audit.target.selectionRationale}`);
    lines.push(`- Commands: ${audit.commandsRun.join("; ") || "none"}`);
    lines.push(`- Expected capabilities: ${audit.expectedCapabilities.join(", ") || "none"}`);
    lines.push(`- Detected capabilities: ${audit.detectedCapabilities.join(", ") || "none"}`);
    lines.push(`- Missed capabilities: ${audit.missedCapabilities.join(", ") || "none"}`);
    lines.push(`- Invented capabilities: ${audit.inventedCapabilities.join(", ") || "none"}`);
    lines.push("");

    if (audit.findings.length === 0) {
      lines.push("No findings recorded.", "");
      continue;
    }

    lines.push("### Findings", "");
    for (const finding of audit.findings) {
      lines.push(`- ${finding.kind} (${finding.severity}): ${finding.summary}`);
      lines.push(`  Evidence: ${finding.evidence.join(", ") || "none"}`);
      lines.push(`  Follow-up: ${finding.followUp}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
