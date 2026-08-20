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
