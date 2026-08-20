import type { ApplicationModel, CapabilityRisk, EvidenceRef } from "@descuff/ir";

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
