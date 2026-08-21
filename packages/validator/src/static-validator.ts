import type { ApplicationModel } from "@descuff/ir";
import type { GeneratedChange } from "@descuff/standard-core";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateStaticGeneratedChanges(
  changes: GeneratedChange[],
  model?: ApplicationModel
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const evidenceIds = new Set(model?.evidence.items.map((item) => item.id) ?? []);

  for (const change of changes) {
    if (change.path.trim().length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_PATH_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include a target path.",
        source: change.standardId,
        evidence: change.evidence,
        suggestedAction: "Regenerate the standard change with a deterministic target path."
      });
    }

    if (change.evidence.length === 0) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_EVIDENCE_MISSING",
        level: "static",
        severity: "error",
        message: "Generated change must include evidence before it can be validated.",
        source: change.standardId,
        path: change.path,
        evidence: [],
        suggestedAction: "Attach source or runtime evidence to the generated change."
      });
    }

    if (model !== undefined) {
      for (const ref of change.evidence) {
        if (!evidenceIds.has(ref.id)) {
          issues.push({
            code: "STATIC_GENERATED_CHANGE_EVIDENCE_UNKNOWN",
            level: "static",
            severity: "error",
            message: `Generated change ${change.id} references evidence ${ref.id} that is not present in the semantic evidence index.`,
            source: change.standardId,
            path: change.path,
            evidence: [ref],
            suggestedAction:
              "Regenerate the plan from the current model so generated changes cite known evidence."
          });
        }
      }
    }

    if (change.safety === "automatic" && !change.deterministic) {
      issues.push({
        code: "STATIC_GENERATED_CHANGE_UNSAFE_AUTOMATIC",
        level: "static",
        severity: "error",
        message: "Automatic generated changes must be deterministic.",
        source: change.standardId,
        path: change.path,
        evidence: change.evidence,
        suggestedAction: "Mark the change approval-required or make generation deterministic."
      });
    }
  }

  return createValidationSummary(issues);
}
