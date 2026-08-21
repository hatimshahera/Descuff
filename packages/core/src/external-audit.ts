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

export const phase10CompletedExternalAuditResults: ExternalRepoAuditResult[] = [
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("tailnext"),
      commitSha: "cd8304fc50c0626d2e607fd74e93451a10382bd8"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [],
    detectedCapabilities: [],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "bad-plan",
        severity: "major",
        summary:
          "Generated standards included OpenAPI, API Catalog, and WebMCP despite no APIs or capabilities.",
        evidence: [".descuff/generated-changes.json", ".descuff/plan.md"],
        followUp: "Fixed by filtering generation and validation to applicable standard assessments."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("netlify-nextjs-blog-theme"),
      commitSha: "939134917f33813c970972abb0f3a1ec9bf35d03"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [],
    detectedCapabilities: [],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "wrong-classification",
        severity: "minor",
        summary: "Pages Router posts route was classified as unknown instead of content.",
        evidence: ["pages/posts/[slug].js", ".descuff/model.json"],
        followUp:
          "Fixed by including route source files in classification vocabulary and matching plural posts."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("nextjs-commerce-app-router"),
      commitSha: "5da4bbb6db48c0c7fc38bb060948947b661a98e7"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [
      "post /api/sepet",
      "basketInformationFnc",
      "getExistData",
      "submitShipping"
    ],
    detectedCapabilities: [
      "post /api/sepet",
      "basketInformationFnc",
      "getExistData",
      "submitShipping"
    ],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "missed-capability",
        severity: "major",
        summary: "File-level Server Actions were extracted as plain symbols, not capabilities.",
        evidence: ["app/lib/actions.ts", ".descuff/model.json"],
        followUp:
          "Fixed by detecting file-level use server exports and modelling conservative Server Action capabilities."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("nextjs-saas-starter"),
      commitSha: "6e33e58b1e553a41fe22e6b941a7229a002de361"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [
      "get /api/team",
      "get /api/user",
      "get /api/stripe/checkout",
      "post /api/stripe/webhook"
    ],
    detectedCapabilities: [
      "get /api/team",
      "get /api/user",
      "get /api/stripe/checkout",
      "post /api/stripe/webhook"
    ],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "wrong-classification",
        severity: "major",
        summary: "Checkout evidence caused a SaaS app to be classified as ecommerce.",
        evidence: [".descuff/model.json"],
        followUp: "Fixed by weighting application-type signals instead of using first match."
      },
      {
        kind: "bad-plan",
        severity: "major",
        summary: "Team and user reads were treated as public reads and made WebMCP-eligible.",
        evidence: ["app/api/team/route.ts", "app/api/user/route.ts"],
        followUp: "Fixed by classifying team, user, and session paths as authenticated reads."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("calcom-developer-starter-kit"),
      commitSha: "5095882439600a0ce4e17955fac1c39f07764d0c"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [
      "fetchSlotsAction",
      "createBookingAction",
      "rescheduleBookingAction",
      "cancelBookingAction"
    ],
    detectedCapabilities: [
      "fetchSlotsAction",
      "createBookingAction",
      "rescheduleBookingAction",
      "cancelBookingAction"
    ],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "missed-capability",
        severity: "major",
        summary: "The src/app route root and file-level Server Actions were initially missed.",
        evidence: ["src/app", "src/features/booker/actions.ts", "src/features/booking/actions.ts"],
        followUp:
          "Fixed by supporting src route roots and modelling file-level Server Actions as capabilities."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("clerk-nextjs-pages-quickstart"),
      commitSha: "74d18db94837a559e0da06f062a46d63b6fd3a9e"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "descuff validate", "pnpm run ci"],
    expectedCapabilities: [],
    detectedCapabilities: [],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "unsupported-pattern",
        severity: "major",
        summary:
          "Next.js proxy.ts auth boundaries and protected route visibility were not modelled.",
        evidence: ["proxy.ts", "pages/protected.tsx"],
        followUp:
          "Fixed by modelling proxy auth boundaries and filtering authenticated routes from public metadata."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("umami"),
      commitSha: "ca661c7057984aa98ed4f7083d84dae2f65bfcb0"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "pnpm run ci"],
    expectedCapabilities: [
      "post /api/send",
      "post /api/record",
      "post /api/2fa/verify",
      "post /api/admin/users/{userId}/2fa",
      "post /api/teams/{teamId}",
      "delete /api/teams/{teamId}"
    ],
    detectedCapabilities: [
      "post /api/send",
      "post /api/record",
      "post /api/2fa/verify",
      "post /api/admin/users/{userId}/2fa",
      "post /api/teams/{teamId}",
      "delete /api/teams/{teamId}"
    ],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "validation-false-positive",
        severity: "major",
        summary:
          "Permission-checked route handlers were initially treated as public sensitive writes.",
        evidence: [
          "src/app/api/admin/users/[userId]/2fa/route.ts",
          "src/app/api/teams/[teamId]/route.ts",
          ".descuff/baseline.json"
        ],
        followUp:
          "Fixed by detecting route-handler auth evidence and applying same-file authenticated/admin capability visibility."
      },
      {
        kind: "validation-false-positive",
        severity: "minor",
        summary:
          "Generated llms.txt route validation still rejects intercepted/parallel App Router route syntax.",
        evidence: [
          "src/app/(main)/websites/[websiteId]/@modal/(.)sessions/[sessionId]/page.tsx",
          ".descuff/validation-repair.md"
        ],
        followUp:
          "Pending: normalize or omit intercepted and parallel route markers in public llms.txt route references."
      }
    ]
  }),
  createExternalRepoAuditResult({
    auditedAt: "2026-08-21T00:00:00.000Z",
    target: {
      ...auditTargetFromCandidate("formbricks"),
      commitSha: "ab8fc21ff9be51cee9cf2e02d77cd7f79c553e24"
    },
    descuffVersion: "0.0.2",
    commandsRun: ["descuff start", "pnpm run ci"],
    expectedCapabilities: [
      "post /api/v1/client/{workspaceId}/responses",
      "post /api/v1/webhooks",
      "delete /api/v1/webhooks/{webhookId}",
      "post /api/v3/surveys",
      "patch /api/v3/surveys/{surveyId}",
      "post /api/v3/workflows"
    ],
    detectedCapabilities: [
      "post /api/v1/client/{workspaceId}/responses",
      "post /api/v1/webhooks",
      "delete /api/v1/webhooks/{webhookId}",
      "post /api/v3/surveys",
      "patch /api/v3/surveys/{surveyId}",
      "post /api/v3/workflows"
    ],
    missedCapabilities: [],
    inventedCapabilities: [],
    findings: [
      {
        kind: "missed-capability",
        severity: "major",
        summary: "Nested apps/web Next.js routes and APIs were missed from the monorepo root.",
        evidence: ["apps/web/app", "apps/web/package.json", ".descuff/model.json"],
        followUp:
          "Fixed by detecting nested Next package manifests and route roots under monorepo app folders."
      },
      {
        kind: "validation-false-positive",
        severity: "major",
        summary: "Wrapper-authenticated webhook mutations were initially treated as public.",
        evidence: [
          "apps/web/app/api/v1/webhooks/route.ts",
          "apps/web/app/api/v1/webhooks/[webhookId]/route.ts",
          ".descuff/validation-repair.md"
        ],
        followUp:
          "Fixed by recognizing wrapper-based route-handler auth evidence such as withV1ApiWrapper, authenticatedApiClient, authentication, and hasPermission."
      }
    ]
  })
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

function auditTargetFromCandidate(id: string): Omit<ExternalRepoAuditTarget, "commitSha"> {
  const candidate = phase10ExternalAuditCandidates.find((item) => item.id === id);
  if (candidate === undefined) {
    throw new Error(`Unknown external audit candidate: ${id}`);
  }

  return {
    id: candidate.id,
    name: candidate.name,
    repositoryUrl: candidate.repositoryUrl,
    framework: candidate.framework,
    routerKinds: candidate.routerKinds,
    coverageTags: candidate.coverageTags,
    selectionRationale: candidate.selectionRationale
  };
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
