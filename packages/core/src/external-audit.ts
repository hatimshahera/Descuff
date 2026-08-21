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
