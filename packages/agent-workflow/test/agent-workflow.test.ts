import { describe, expect, it } from "vitest";
import type { ApplicationModel, EvidenceRef } from "@descuff/ir";
import {
  agentPlanSchemaVersion,
  buildAgentPlan,
  buildSkillEvidencePacket,
  codexSkillAdapter,
  correlateNativeAndGraphifyEvidence,
  createSemanticEnrichmentTemplate,
  evaluateAgentWorkflowDryRun,
  getFixCommandSummary,
  renderSemanticEnrichmentDiff,
  renderSemanticEnrichmentPrompt,
  renderSharedSkillCoreInstructions,
  renderSkillEvidencePacket,
  renderSkillHostInstructions,
  renderFixCommandInstructions,
  renderAgentPlanMarkdown,
  semanticEnrichmentSchemaVersion,
  supportedSkillHostAdapters,
  validateSemanticEnrichment,
  validateAgentPlan
} from "../src/index.js";

const evidence: EvidenceRef = {
  id: "source:llms",
  kind: "source",
  location: "app/page.tsx",
  confidence: "high",
  summary: "Public route evidence"
};

describe("@descuff/agent-workflow", () => {
  it("documents non-LLM fix command semantics", () => {
    expect(getFixCommandSummary()).toContain("does not invoke an LLM");
    expect(getFixCommandSummary()).toContain("does not edit source directly");
  });

  it("renders coding-agent fix instructions with validation and UI guardrails", () => {
    const instructions = renderFixCommandInstructions();

    expect(instructions).toContain("developer-owned coding agent");
    expect(instructions).toContain("Run descuff scan or use the latest scan artifacts");
    expect(instructions).toContain("Read only the focused source files linked by evidence");
    expect(instructions).toContain("Run existing tests and descuff validate after implementation");
    expect(instructions).toContain("Repair failures and repeat validation");
    expect(instructions).toContain(
      "Do not change human-facing UI or behavior unless explicitly approved"
    );
    expect(instructions).toContain(
      "Do not require a Descuff-owned OpenAI, Anthropic, or other LLM API key"
    );
  });

  it("builds a valid machine-readable plan from assessments and generated changes", () => {
    const plan = buildAgentPlan({
      projectRoot: "fixtures/ecommerce",
      generatedAt: "2026-08-20T00:00:00.000Z",
      assessments: [
        {
          standardId: "llms-txt",
          applicability: "recommended",
          evidence: [evidence],
          rationale: ["A deterministic llms.txt can summarize public routes."],
          riskNotes: [],
          generatedChangeEligibility: "automatic",
          validationRequirements: [
            {
              id: "llms-txt-structure",
              description: "Validate llms.txt structure.",
              evidence: [evidence]
            }
          ]
        }
      ],
      generatedChanges: [
        {
          standardId: "llms-txt",
          id: "llms-txt:public-summary",
          kind: "create-file",
          path: "public/llms.txt",
          content: "# Ecommerce\n",
          deterministic: true,
          safety: "automatic",
          conflictPolicy: "approval-required",
          evidence: [evidence]
        },
        {
          standardId: "webmcp",
          id: "webmcp:manifest",
          kind: "create-file",
          path: "public/webmcp.json",
          content: "{}\n",
          deterministic: true,
          safety: "blocked",
          conflictPolicy: "approval-required",
          evidence: [evidence]
        }
      ]
    });

    expect(plan.schemaVersion).toBe(agentPlanSchemaVersion);
    expect(plan.items.map((item) => [item.safety, item.status])).toEqual([
      ["automatic", "pending"],
      ["blocked", "blocked"]
    ]);
    expect(validateAgentPlan(plan)).toEqual({
      valid: false,
      issues: [
        {
          code: "AGENT_PLAN_VALIDATION_REQUIREMENTS_MISSING",
          message: "Plan item must include validation requirements.",
          itemId: "plan:webmcp:manifest"
        }
      ]
    });
  });

  it("validates required plan evidence, acceptance criteria, and validation requirements", () => {
    const plan = buildAgentPlan({
      projectRoot: "fixtures/ecommerce",
      generatedAt: "2026-08-20T00:00:00.000Z",
      assessments: [
        {
          standardId: "llms-txt",
          applicability: "recommended",
          evidence: [evidence],
          rationale: [],
          riskNotes: [],
          generatedChangeEligibility: "automatic",
          validationRequirements: [
            {
              id: "llms-txt-structure",
              description: "Validate llms.txt structure.",
              evidence: [evidence]
            }
          ]
        }
      ],
      generatedChanges: [
        {
          standardId: "llms-txt",
          id: "llms-txt:public-summary",
          kind: "create-file",
          path: "public/llms.txt",
          content: "# Ecommerce\n",
          deterministic: true,
          safety: "automatic",
          conflictPolicy: "approval-required",
          evidence: [evidence]
        }
      ]
    });

    expect(validateAgentPlan(plan)).toEqual({
      valid: true,
      issues: []
    });
  });

  it("renders a human-readable plan with workflow guardrails", () => {
    const plan = createFixtureAgentPlan();

    expect(renderAgentPlanMarkdown(plan)).toContain("Safety: approval-required");
    expect(renderAgentPlanMarkdown(plan)).toContain(
      "Run existing tests and descuff validate after implementation."
    );
    expect(renderAgentPlanMarkdown(plan)).toContain(
      "without changing human-facing UI unless explicitly approved"
    );
  });

  it("matches the fixture plan Markdown snapshot", () => {
    expect(renderAgentPlanMarkdown(createFixtureAgentPlan())).toMatchInlineSnapshot(`
      "# Descuff Implementation Plan

      Schema version: 0.1.0
      Project root: fixtures/ecommerce
      Generated at: 2026-08-20T00:00:00.000Z

      Plan contains 1 item.

      ## Workflow

      - Run descuff scan or use the latest scan artifacts before implementation.
      - Read only the focused source files linked by evidence before editing.
      - Implement pending items without changing human-facing UI unless explicitly approved.
      - Run existing tests and descuff validate after implementation.
      - Repair failures and repeat validation until the plan acceptance criteria pass.

      ## Items

      ### llms-txt: public/llms.txt

      - Status: pending
      - Safety: approval-required
      - Target: public/llms.txt
      - Description: create-file generated for public/llms.txt.

      Acceptance criteria:
      - Generated change is reviewed against linked evidence.
      - Existing user files are preserved according to conflict policy.
      - Relevant validation requirements pass after implementation.

      Evidence:
      - source:llms: Public route evidence (app/page.tsx)

      Validation requirements:
      - llms-txt-structure: Validate llms.txt structure.
      "
    `);
  });

  it("accepts a fixture agent dry run only after execution and validation pass", () => {
    const plan = createFixtureAgentPlan();

    expect(
      evaluateAgentWorkflowDryRun({
        plan,
        completedItemIds: ["plan:llms-txt:public-summary"],
        validation: {
          passed: true,
          failures: []
        }
      })
    ).toEqual({
      complete: true,
      issues: []
    });
  });

  it("keeps an intentionally broken fixture implementation incomplete", () => {
    const plan = createFixtureAgentPlan();

    expect(
      evaluateAgentWorkflowDryRun({
        plan,
        completedItemIds: ["plan:llms-txt:public-summary"],
        validation: {
          passed: false,
          failures: [
            {
              code: "LLMS_TXT_ROUTE_MISSING",
              message: "Referenced route /products was not reachable.",
              itemId: "plan:llms-txt:public-summary"
            }
          ]
        }
      })
    ).toEqual({
      complete: false,
      issues: [
        {
          code: "AGENT_WORKFLOW_VALIDATION_FAILED",
          message: "LLMS_TXT_ROUTE_MISSING: Referenced route /products was not reachable.",
          itemId: "plan:llms-txt:public-summary"
        }
      ]
    });
  });

  it("builds a compact evidence packet from the deterministic application model", () => {
    const packet = buildSkillEvidencePacket({
      model: createFixtureApplicationModel(),
      generatedAt: "2026-08-25T00:00:00.000Z"
    });

    expect(packet.deterministicSummary).toMatchObject({
      applicationType: "saas",
      routeCount: 1,
      apiCount: 1,
      capabilityCount: 1
    });
    expect(packet.capabilities[0]).toMatchObject({
      id: "cap:team",
      name: "get_team",
      risk: "AUTHENTICATED_READ",
      visibility: "authenticated",
      evidenceIds: ["source:llms"]
    });
    expect(renderSkillEvidencePacket(packet)).toContain("Application type: saas (medium)");
    expect(renderSkillEvidencePacket(packet)).toContain("cap:team: get_team");
  });

  it("validates semantic enrichment and rejects evidence-free candidate concepts", () => {
    const packet = buildSkillEvidencePacket({ model: createFixtureApplicationModel() });
    const result = validateSemanticEnrichment(packet, {
      schemaVersion: semanticEnrichmentSchemaVersion,
      domainProfile: {
        summary: "Team workspace application.",
        primaryDomain: "team-management",
        domains: ["team-management", "saas"],
        confidence: "high",
        evidenceIds: ["source:llms"]
      },
      entityMeanings: [],
      capabilityMeanings: [
        {
          targetId: "cap:team",
          meaning: "read_team_profile",
          confidence: "high",
          evidenceIds: ["source:llms"]
        }
      ],
      candidateConcepts: [
        {
          id: "candidate:dashboard",
          kind: "capability",
          name: "create_dashboard",
          description: "May represent dashboard creation.",
          confidence: "medium",
          evidenceIds: ["missing:evidence"]
        }
      ],
      standardSuitability: [],
      uncertaintyNotes: []
    });

    expect(result.valid).toBe(false);
    expect(result.candidateConceptsAccepted).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "SEMANTIC_CANDIDATE_CONCEPT_EVIDENCE_UNKNOWN",
      "SEMANTIC_DOMAIN_LABEL_DESCRIPTIVE_ONLY"
    ]);
    expect(renderSemanticEnrichmentDiff(packet, result)).toContain("Rejected: 1");
    expect(renderSemanticEnrichmentDiff(packet, result)).toContain("Needs investigation: 1");
  });

  it("renders a semantic enrichment prompt and template for host agents", () => {
    const packet = buildSkillEvidencePacket({ model: createFixtureApplicationModel() });
    const template = createSemanticEnrichmentTemplate(packet);
    const prompt = renderSemanticEnrichmentPrompt(packet);

    expect(template.schemaVersion).toBe(semanticEnrichmentSchemaVersion);
    expect(template.capabilityMeanings).toEqual([
      {
        targetId: "cap:team",
        meaning: "",
        confidence: "low",
        evidenceIds: ["source:llms"]
      }
    ]);
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("Use only evidence IDs");
    expect(prompt).toContain("Application type: saas (medium)");
    expect(prompt).toContain('"schemaVersion": "0.1.0"');
  });

  it("renders a reviewable semantic enrichment diff for accepted capability meanings", () => {
    const packet = buildSkillEvidencePacket({ model: createFixtureApplicationModel() });
    const result = validateSemanticEnrichment(packet, {
      schemaVersion: semanticEnrichmentSchemaVersion,
      domainProfile: {
        summary: "Team workspace application.",
        primaryDomain: "",
        domains: ["team-management", "saas"],
        confidence: "high",
        evidenceIds: ["source:llms"]
      },
      entityMeanings: [],
      capabilityMeanings: [
        {
          targetId: "cap:team",
          meaning: "read_team_profile",
          confidence: "high",
          evidenceIds: ["source:llms"]
        }
      ],
      candidateConcepts: [
        {
          id: "candidate:team-settings",
          kind: "capability",
          name: "manage_team_settings",
          description: "Team settings management candidate.",
          confidence: "medium",
          evidenceIds: ["source:llms"]
        }
      ],
      standardSuitability: [],
      uncertaintyNotes: []
    });

    expect(result.valid).toBe(true);
    expect(renderSemanticEnrichmentDiff(packet, result)).toMatchInlineSnapshot(`
      "# Semantic Enrichment

      Current:
        Application type: saas

      Proposed:
        Summary: Team workspace application.
        Domains:
          team-management
          saas

      New capability meanings:
        cap:team -> read_team_profile

      Candidates:
        candidate:team-settings: manage_team_settings (capability, medium)

      Evidence-backed: 2
      Rejected: 0
      Needs investigation: 0
      "
    `);
  });

  it("correlates native and Graphify evidence without silently merging conflicts", () => {
    const nativeEvidence = { ...evidence, id: "source:native" };
    const graphifyEvidence = { ...evidence, id: "source:graphify" };

    const correlations = correlateNativeAndGraphifyEvidence({
      native: [
        {
          id: "native:team",
          kind: "relationship",
          subject: "Team",
          predicate: "owns",
          object: "Workspace",
          evidence: [nativeEvidence]
        }
      ],
      graphify: [
        {
          id: "graphify:team",
          kind: "relationship",
          subject: "Team",
          predicate: "owns",
          object: "BillingAccount",
          evidence: [graphifyEvidence]
        },
        {
          id: "graphify:user",
          kind: "relationship",
          subject: "User",
          predicate: "belongsTo",
          object: "Team",
          evidence: [graphifyEvidence]
        }
      ]
    });

    expect(correlations.map((item) => [item.key, item.status])).toEqual([
      ["Team:owns", "conflict"],
      ["User:belongsTo", "graphify-only"]
    ]);
    expect(correlations[0]?.investigationNote).toContain("differently");
  });

  it("renders shared skill instructions for Codex, Claude Code, and Cursor adapters", () => {
    expect(supportedSkillHostAdapters.map((adapter) => adapter.target)).toEqual([
      "codex",
      "claude-code",
      "cursor"
    ]);

    for (const adapter of supportedSkillHostAdapters) {
      const instructions = renderSkillHostInstructions({ adapter });
      expect(instructions).toContain("Use the compact evidence packet as the primary context");
      expect(instructions).toContain(".descuff/semantic-enrichment-prompt.md");
      expect(instructions).toContain(".descuff/semantic-enrichment-template.json");
      expect(instructions).toContain("semantic-enrichment diff");
      expect(instructions).toContain("npx descuff start .");
      expect(instructions).toContain("npx descuff finish .");
    }

    expect(renderSkillHostInstructions({ adapter: codexSkillAdapter })).toContain(
      "# Descuff Skill For Codex"
    );
    expect(renderSharedSkillCoreInstructions()).toContain("Domain labels are descriptive");
  });
});

function createFixtureAgentPlan() {
  return buildAgentPlan({
    projectRoot: "fixtures/ecommerce",
    generatedAt: "2026-08-20T00:00:00.000Z",
    assessments: [
      {
        standardId: "llms-txt",
        applicability: "recommended",
        evidence: [evidence],
        rationale: [],
        riskNotes: [],
        generatedChangeEligibility: "approval-required",
        validationRequirements: [
          {
            id: "llms-txt-structure",
            description: "Validate llms.txt structure.",
            evidence: [evidence]
          }
        ]
      }
    ],
    generatedChanges: [
      {
        standardId: "llms-txt",
        id: "llms-txt:public-summary",
        kind: "create-file",
        path: "public/llms.txt",
        content: "# Ecommerce\n",
        deterministic: true,
        safety: "approval-required",
        conflictPolicy: "approval-required",
        evidence: [evidence]
      }
    ]
  });
}

function createFixtureApplicationModel(): ApplicationModel {
  return {
    schemaVersion: "0.1.0",
    project: {
      rootDir: "fixtures/saas",
      framework: "nextjs",
      evidence: [evidence]
    },
    applicationType: {
      type: "saas",
      confidence: "medium",
      evidence: [evidence]
    },
    entities: [],
    capabilities: [
      {
        id: "cap:team",
        name: "get_team",
        operationType: "read",
        risk: "AUTHENTICATED_READ",
        visibility: "authenticated",
        inputs: [],
        outputs: [],
        linkedRoutes: ["/settings"],
        linkedApis: ["api:team"],
        evidence: [evidence],
        confidence: "medium"
      }
    ],
    routes: [
      {
        id: "route:settings",
        path: "/settings",
        routerKind: "app",
        sourceFile: "app/settings/page.tsx",
        visibility: "authenticated",
        runtimeObserved: false,
        evidence: [evidence]
      }
    ],
    apis: [
      {
        id: "api:team",
        path: "/api/team",
        method: "GET",
        sourceFile: "app/api/team/route.ts",
        runtimeObserved: false,
        sideEffect: "read",
        evidence: [evidence]
      }
    ],
    authentication: {
      boundaries: [
        {
          id: "auth:middleware",
          kind: "middleware",
          sourceFile: "middleware.ts",
          evidence: [evidence]
        }
      ],
      evidence: [evidence]
    },
    integrations: [],
    standards: [],
    evidence: {
      schemaVersion: "0.1.0",
      items: [evidence]
    }
  };
}
