import type { EvidenceRef } from "@descuff/ir";
import type {
  GeneratedChange,
  GeneratedChangeSafety,
  StandardAssessment,
  StandardValidationRequirement
} from "@descuff/standard-core";

export const agentWorkflowPackageName = "@descuff/agent-workflow";
export const agentPlanSchemaVersion = "0.1.0";

export type PlanItemKind = "generated-change" | "manual-work";
export type PlanItemStatus = "pending" | "blocked" | "completed";
export type PlanSafety = GeneratedChangeSafety;

export interface AgentPlan {
  schemaVersion: string;
  projectRoot: string;
  generatedAt: string;
  summary: string;
  items: AgentPlanItem[];
  workflowInstructions: string[];
}

export interface AgentPlanItem {
  id: string;
  title: string;
  kind: PlanItemKind;
  status: PlanItemStatus;
  safety: PlanSafety;
  standardId?: string;
  targetPath?: string;
  description: string;
  acceptanceCriteria: string[];
  evidence: EvidenceRef[];
  validationRequirements: StandardValidationRequirement[];
}

export interface AgentPlanInput {
  projectRoot: string;
  generatedAt?: string;
  assessments: StandardAssessment[];
  generatedChanges: GeneratedChange[];
}

export interface AgentPlanValidationIssue {
  code: string;
  message: string;
  itemId?: string;
}

export interface AgentPlanValidationResult {
  valid: boolean;
  issues: AgentPlanValidationIssue[];
}

export function getFixCommandSummary(): string {
  return "descuff fix refreshes plans and agent workflow instructions; it does not edit source directly.";
}

export function buildAgentPlan(input: AgentPlanInput): AgentPlan {
  const assessmentsByStandard = new Map(
    input.assessments.map((assessment) => [assessment.standardId, assessment])
  );
  const items = input.generatedChanges.map((change): AgentPlanItem => {
    const assessment = assessmentsByStandard.get(change.standardId);
    return {
      id: `plan:${change.id}`,
      title: `${change.standardId}: ${change.path}`,
      kind: "generated-change",
      status: change.safety === "blocked" ? "blocked" : "pending",
      safety: change.safety,
      standardId: change.standardId,
      targetPath: change.path,
      description: `${change.kind} generated for ${change.path}.`,
      acceptanceCriteria: [
        "Generated change is reviewed against linked evidence.",
        "Existing user files are preserved according to conflict policy.",
        "Relevant validation requirements pass after implementation."
      ],
      evidence: uniqueEvidence([...(assessment?.evidence ?? []), ...change.evidence]),
      validationRequirements: assessment?.validationRequirements ?? []
    };
  });

  return {
    schemaVersion: agentPlanSchemaVersion,
    projectRoot: input.projectRoot,
    generatedAt: input.generatedAt ?? "1970-01-01T00:00:00.000Z",
    summary: `Plan contains ${items.length} item${items.length === 1 ? "" : "s"}.`,
    items,
    workflowInstructions: defaultWorkflowInstructions()
  };
}

export function validateAgentPlan(plan: AgentPlan): AgentPlanValidationResult {
  const issues: AgentPlanValidationIssue[] = [];

  if (plan.schemaVersion !== agentPlanSchemaVersion) {
    issues.push({
      code: "AGENT_PLAN_SCHEMA_VERSION_UNSUPPORTED",
      message: `Unsupported agent plan schema version: ${plan.schemaVersion}`
    });
  }

  if (plan.projectRoot.length === 0) {
    issues.push({
      code: "AGENT_PLAN_PROJECT_ROOT_MISSING",
      message: "Agent plan must include projectRoot."
    });
  }

  for (const item of plan.items) {
    if (item.acceptanceCriteria.length === 0) {
      issues.push({
        code: "AGENT_PLAN_ACCEPTANCE_CRITERIA_MISSING",
        message: "Plan item must include acceptance criteria.",
        itemId: item.id
      });
    }
    if (item.evidence.length === 0) {
      issues.push({
        code: "AGENT_PLAN_EVIDENCE_MISSING",
        message: "Plan item must include evidence.",
        itemId: item.id
      });
    }
    if (item.validationRequirements.length === 0) {
      issues.push({
        code: "AGENT_PLAN_VALIDATION_REQUIREMENTS_MISSING",
        message: "Plan item must include validation requirements.",
        itemId: item.id
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

export function renderAgentPlanMarkdown(plan: AgentPlan): string {
  const lines = [
    "# Descuff Implementation Plan",
    "",
    `Schema version: ${plan.schemaVersion}`,
    `Project root: ${plan.projectRoot}`,
    `Generated at: ${plan.generatedAt}`,
    "",
    plan.summary,
    "",
    "## Workflow",
    ""
  ];

  for (const instruction of plan.workflowInstructions) {
    lines.push(`- ${instruction}`);
  }

  lines.push("", "## Items", "");

  for (const item of plan.items) {
    lines.push(`### ${item.title}`, "");
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Safety: ${item.safety}`);
    if (item.targetPath !== undefined) {
      lines.push(`- Target: ${item.targetPath}`);
    }
    lines.push(`- Description: ${item.description}`, "");
    lines.push("Acceptance criteria:");
    for (const criterion of item.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
    lines.push("", "Evidence:");
    for (const evidence of item.evidence) {
      lines.push(`- ${evidence.id}: ${evidence.summary} (${evidence.location})`);
    }
    lines.push("", "Validation requirements:");
    for (const requirement of item.validationRequirements) {
      lines.push(`- ${requirement.id}: ${requirement.description}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function defaultWorkflowInstructions(): string[] {
  return [
    "Run descuff scan or use the latest scan artifacts before implementation.",
    "Read only the focused source files linked by evidence before editing.",
    "Implement pending items without changing human-facing UI unless explicitly approved.",
    "Run existing tests and descuff validate after implementation.",
    "Repair failures and repeat validation until the plan acceptance criteria pass."
  ];
}

function uniqueEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence.filter((ref) => {
    if (seen.has(ref.id)) {
      return false;
    }
    seen.add(ref.id);
    return true;
  });
}
