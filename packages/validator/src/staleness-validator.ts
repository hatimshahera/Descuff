import { createValidationSummary } from "./summary.js";
import type {
  SourceFileFingerprint,
  SourceFingerprintManifest,
  ValidationFailure,
  ValidationSummary
} from "./types.js";

export function validateSourceFingerprints(
  recorded: SourceFingerprintManifest,
  current: SourceFingerprintManifest
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const currentByPath = new Map(current.files.map((file) => [file.path, file]));

  for (const recordedFile of recorded.files) {
    const currentFile = currentByPath.get(recordedFile.path);

    if (currentFile === undefined || currentFile.missing) {
      issues.push(sourceChangedFailure("EVIDENCE_SOURCE_MISSING", recordedFile));
      continue;
    }

    if (recordedFile.missing || recordedFile.sha256 !== currentFile.sha256) {
      issues.push(sourceChangedFailure("EVIDENCE_STALE", recordedFile));
    }
  }

  return createValidationSummary(issues);
}

function sourceChangedFailure(
  code: "EVIDENCE_SOURCE_MISSING" | "EVIDENCE_STALE",
  file: SourceFileFingerprint
): ValidationFailure {
  return {
    code,
    level: "static",
    severity: "error",
    message:
      code === "EVIDENCE_SOURCE_MISSING"
        ? `Source evidence file ${file.path} is missing after artifacts were generated.`
        : `Source evidence file ${file.path} changed after artifacts were generated.`,
    source: file.path,
    path: file.path,
    evidence: file.evidence,
    suggestedAction: "Rerun descuff scan or descuff validate to refresh generated artifacts."
  };
}
