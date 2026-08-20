import { describe, expect, it } from "vitest";
import type { EvidenceRef } from "@descuff/ir";
import {
  agentPlanSchemaVersion,
  buildAgentPlan,
  evaluateAgentWorkflowDryRun,
  getFixCommandSummary,
  renderFixCommandInstructions,
  renderAgentPlanMarkdown,
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
