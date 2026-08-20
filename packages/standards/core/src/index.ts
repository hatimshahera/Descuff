import type { ApplicationModel, Capability, CapabilityRisk, EvidenceRef } from "@descuff/ir";

export type StandardApplicability =
  "implemented" | "required" | "recommended" | "not-applicable" | "blocked";

export type GeneratedChangeKind = "create-file" | "replace-file" | "merge-file" | "companion-file";

export type GeneratedChangeSafety = "automatic" | "approval-required" | "blocked";

export type ExistingFileConflictPolicy = "skip" | "merge" | "companion-file" | "approval-required";

export type ValidationSeverity = "error" | "warning";

export type StandardLifecyclePhase =
  "assess" | "generate" | "plan" | "apply-safe" | "coding-agent" | "validate";

export const standardAdapterLifecycle: StandardLifecyclePhase[] = [
  "assess",
  "generate",
  "plan",
  "apply-safe",
  "coding-agent",
  "validate"
];

export interface StandardRiskNote {
  risk: CapabilityRisk;
  capabilityId: string;
  message: string;
  evidence: EvidenceRef[];
}

export type ApprovalGateKind = "sensitive-capability" | "high-consequence-capability";

export interface ApprovalGate {
  id: string;
  kind: ApprovalGateKind;
  capabilityId: string;
  risk: "SENSITIVE_WRITE" | "HIGH_CONSEQUENCE";
  message: string;
  evidence: EvidenceRef[];
}

export interface StandardValidationRequirement {
  id: string;
  description: string;
  evidence: EvidenceRef[];
}

export interface StandardAssessment {
  standardId: string;
  applicability: StandardApplicability;
  evidence: EvidenceRef[];
  rationale: string[];
  riskNotes: StandardRiskNote[];
  generatedChangeEligibility: GeneratedChangeSafety;
  validationRequirements: StandardValidationRequirement[];
}

export interface GeneratedChange {
  standardId: string;
  id: string;
  kind: GeneratedChangeKind;
  path: string;
  content: string;
  deterministic: boolean;
  safety: GeneratedChangeSafety;
  conflictPolicy: ExistingFileConflictPolicy;
  evidence: EvidenceRef[];
}

export interface DryRunDiff {
  changeId: string;
  path: string;
  before: string | null;
  after: string;
  conflictPolicy: ExistingFileConflictPolicy;
}

export type GeneratedChangeApplicationStatus =
  | "write"
  | "already-applied"
  | "skipped-existing-file"
  | "requires-merge"
  | "write-companion-file"
  | "requires-approval";

export interface GeneratedChangeApplication {
  change: GeneratedChange;
  status: GeneratedChangeApplicationStatus;
  existingContent: string | null;
  reason: string;
}

export interface GeneratedChangeIdempotencyIssue {
  changeId: string;
  path: string;
  message: string;
}

export interface GeneratedChangeIdempotencyResult {
  idempotent: boolean;
  issues: GeneratedChangeIdempotencyIssue[];
}

export interface ApplySafeWrite {
  change: GeneratedChange;
  path: string;
  content: string;
  alreadyApplied: boolean;
}

export interface ApplySafeBlockedChange {
  change: GeneratedChange;
  status: GeneratedChangeApplicationStatus | "not-deterministic" | "not-automatic";
  reason: string;
}

export interface ApplySafePlan {
  writes: ApplySafeWrite[];
  blocked: ApplySafeBlockedChange[];
  recoveryReport: string;
}

export interface StandardValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  path?: string;
  evidence: EvidenceRef[];
}

export interface StandardValidationResult {
  standardId: string;
  valid: boolean;
  issues: StandardValidationIssue[];
}

export interface StandardValidationContext {
  model: ApplicationModel;
  generatedChanges: GeneratedChange[];
  existingFiles?: ReadonlyMap<string, string>;
}

export interface StandardAdapter {
  id: string;
  assess(model: ApplicationModel): Promise<StandardAssessment>;
  generate(model: ApplicationModel): Promise<GeneratedChange[]>;
  validate(context: StandardValidationContext): Promise<StandardValidationResult>;
}

export function createDryRunDiffs(
  changes: GeneratedChange[],
  existingFiles: ReadonlyMap<string, string> = new Map()
): DryRunDiff[] {
  return changes.map((change) => ({
    changeId: change.id,
    path: change.path,
    before: existingFiles.get(change.path) ?? null,
    after: change.content,
    conflictPolicy: change.conflictPolicy
  }));
}

export function planGeneratedChangeApplications(
  changes: GeneratedChange[],
  existingFiles: ReadonlyMap<string, string> = new Map()
): GeneratedChangeApplication[] {
  return changes.map((change) => {
    const existingContent = existingFiles.get(change.path) ?? null;

    if (existingContent === null) {
      return {
        change,
        status: "write",
        existingContent,
        reason: "No existing file conflicts with the generated change."
      };
    }

    if (existingContent === change.content) {
      return {
        change,
        status: "already-applied",
        existingContent,
        reason: "Existing file already matches the generated change."
      };
    }

    switch (change.conflictPolicy) {
      case "skip":
        return {
          change,
          status: "skipped-existing-file",
          existingContent,
          reason: "Existing file is preserved because the change policy is skip."
        };
      case "merge":
        return {
          change,
          status: "requires-merge",
          existingContent,
          reason: "Existing file requires an adapter-specific merge before writing."
        };
      case "companion-file":
        return {
          change,
          status: "write-companion-file",
          existingContent,
          reason: "Existing file is preserved and the change must be written to a companion file."
        };
      case "approval-required":
        return {
          change,
          status: "requires-approval",
          existingContent,
          reason: "Existing file differs and requires explicit approval before replacement."
        };
    }
  });
}

export function checkGeneratedChangeIdempotency(
  first: GeneratedChange[],
  second: GeneratedChange[]
): GeneratedChangeIdempotencyResult {
  const issues: GeneratedChangeIdempotencyIssue[] = [];
  const firstById = new Map(first.map((change) => [change.id, change]));
  const secondById = new Map(second.map((change) => [change.id, change]));

  for (const change of first) {
    const next = secondById.get(change.id);
    if (next === undefined) {
      issues.push({
        changeId: change.id,
        path: change.path,
        message: "Generated change was missing from the second generation pass."
      });
      continue;
    }

    if (
      JSON.stringify(stableGeneratedChange(change)) !== JSON.stringify(stableGeneratedChange(next))
    ) {
      issues.push({
        changeId: change.id,
        path: change.path,
        message: "Generated change differed between generation passes."
      });
    }
  }

  for (const change of second) {
    if (!firstById.has(change.id)) {
      issues.push({
        changeId: change.id,
        path: change.path,
        message: "Generated change was added in the second generation pass."
      });
    }
  }

  return {
    idempotent: issues.length === 0,
    issues
  };
}

export function planApplySafeGeneratedChanges(
  changes: GeneratedChange[],
  existingFiles: ReadonlyMap<string, string> = new Map()
): ApplySafePlan {
  const writes: ApplySafeWrite[] = [];
  const blocked: ApplySafeBlockedChange[] = [];
  const applications = planGeneratedChangeApplications(changes, existingFiles);

  for (const application of applications) {
    if (!application.change.deterministic) {
      blocked.push({
        change: application.change,
        status: "not-deterministic",
        reason: "apply-safe only applies deterministic generated changes."
      });
      continue;
    }

    if (application.change.safety !== "automatic") {
      blocked.push({
        change: application.change,
        status: "not-automatic",
        reason: "apply-safe only applies changes classified as automatic."
      });
      continue;
    }

    if (application.status === "write" || application.status === "already-applied") {
      writes.push({
        change: application.change,
        path: application.change.path,
        content: application.change.content,
        alreadyApplied: application.status === "already-applied"
      });
      continue;
    }

    blocked.push({
      change: application.change,
      status: application.status,
      reason: application.reason
    });
  }

  return {
    writes,
    blocked,
    recoveryReport: renderApplySafeRecoveryReport(writes, blocked)
  };
}

function renderApplySafeRecoveryReport(
  writes: ApplySafeWrite[],
  blocked: ApplySafeBlockedChange[]
): string {
  const lines = ["# apply-safe recovery report", ""];

  if (writes.length > 0) {
    lines.push("## Writes", "");
    for (const write of writes) {
      lines.push(`- ${write.path}: ${write.alreadyApplied ? "already applied" : "ready to write"}`);
    }
    lines.push("");
  }

  if (blocked.length > 0) {
    lines.push("## Blocked", "");
    for (const item of blocked) {
      lines.push(`- ${item.change.path}: ${item.status} - ${item.reason}`);
    }
    lines.push("");
  }

  if (writes.length === 0 && blocked.length === 0) {
    lines.push("No generated changes were provided.", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function createSensitiveCapabilityApprovalGates(capabilities: Capability[]): ApprovalGate[] {
  return capabilities
    .filter(
      (capability): capability is Capability & { risk: "SENSITIVE_WRITE" | "HIGH_CONSEQUENCE" } =>
        capability.risk === "SENSITIVE_WRITE" || capability.risk === "HIGH_CONSEQUENCE"
    )
    .map((capability) => ({
      id: `approval:${capability.id}`,
      kind:
        capability.risk === "HIGH_CONSEQUENCE"
          ? "high-consequence-capability"
          : "sensitive-capability",
      capabilityId: capability.id,
      risk: capability.risk,
      message: `${capability.risk} capability requires explicit developer approval before exposure.`,
      evidence: capability.evidence
    }));
}

export function generatedChangeSafetyForApprovalGates(
  gates: ApprovalGate[]
): GeneratedChangeSafety {
  return gates.length > 0 ? "approval-required" : "automatic";
}

function stableGeneratedChange(change: GeneratedChange): Omit<GeneratedChange, "evidence"> & {
  evidenceIds: string[];
} {
  return {
    standardId: change.standardId,
    id: change.id,
    kind: change.kind,
    path: change.path,
    content: change.content,
    deterministic: change.deterministic,
    safety: change.safety,
    conflictPolicy: change.conflictPolicy,
    evidenceIds: change.evidence.map((ref) => ref.id).sort()
  };
}
