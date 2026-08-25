import type { Confidence } from "@descuff/ir";
import { evidenceIdSet, type SkillEvidencePacket } from "./evidence-packet.js";

export const semanticEnrichmentSchemaVersion = "0.1.0";

export type SemanticConceptKind = "entity" | "capability";
export type SemanticEnrichmentIssueDisposition = "rejected" | "investigation";

export interface SemanticEnrichment {
  schemaVersion: string;
  domainProfile: DomainProfile;
  entityMeanings: SemanticMeaning[];
  capabilityMeanings: SemanticMeaning[];
  candidateConcepts: CandidateSemanticConcept[];
  standardSuitability: StandardSuitabilityRationale[];
  uncertaintyNotes: SemanticUncertaintyNote[];
}

export interface DomainProfile {
  summary: string;
  primaryDomain: string;
  domains: string[];
  confidence: Confidence;
  evidenceIds: string[];
}

export interface SemanticMeaning {
  targetId: string;
  meaning: string;
  confidence: Confidence;
  evidenceIds: string[];
}

export interface CandidateSemanticConcept {
  id: string;
  kind: SemanticConceptKind;
  name: string;
  description: string;
  confidence: Confidence;
  evidenceIds: string[];
}

export interface StandardSuitabilityRationale {
  standardId: string;
  rationale: string;
  evidenceIds: string[];
}

export interface SemanticUncertaintyNote {
  message: string;
  evidenceIds: string[];
}

export interface SemanticEnrichmentIssue {
  code: string;
  message: string;
  path: string;
  disposition: SemanticEnrichmentIssueDisposition;
  evidenceIds: string[];
}

export interface SemanticEnrichmentValidationResult {
  accepted: SemanticEnrichment;
  candidateConceptsAccepted: CandidateSemanticConcept[];
  issues: SemanticEnrichmentIssue[];
  valid: boolean;
}

export function createSemanticEnrichmentTemplate(packet: SkillEvidencePacket): SemanticEnrichment {
  const firstEvidenceId = packet.evidence[0]?.id;

  return {
    schemaVersion: semanticEnrichmentSchemaVersion,
    domainProfile: {
      summary: "",
      primaryDomain: "",
      domains: [],
      confidence: "low",
      evidenceIds: firstEvidenceId === undefined ? [] : [firstEvidenceId]
    },
    entityMeanings: [],
    capabilityMeanings: packet.capabilities.map((capability) => ({
      targetId: capability.id,
      meaning: "",
      confidence: "low",
      evidenceIds: capability.evidenceIds.slice(0, 3)
    })),
    candidateConcepts: [],
    standardSuitability: [],
    uncertaintyNotes: []
  };
}

export function createEmptySemanticEnrichment(): SemanticEnrichment {
  return {
    schemaVersion: semanticEnrichmentSchemaVersion,
    domainProfile: {
      summary: "",
      primaryDomain: "",
      domains: [],
      confidence: "low",
      evidenceIds: []
    },
    entityMeanings: [],
    capabilityMeanings: [],
    candidateConcepts: [],
    standardSuitability: [],
    uncertaintyNotes: []
  };
}

export function renderSemanticEnrichmentPrompt(packet: SkillEvidencePacket): string {
  const template = createSemanticEnrichmentTemplate(packet);
  const lines = [
    "# Descuff Semantic Enrichment Request",
    "",
    "Use the Descuff skill evidence packet to propose evidence-backed semantic enrichment.",
    "",
    "Rules:",
    "",
    "- Return JSON only. Do not include Markdown around the response.",
    "- Use only evidence IDs that exist in `.descuff/skill-evidence-packet.json`.",
    "- Keep domain labels descriptive. Do not use them to approve standards or safety behavior.",
    "- Keep new entities or capabilities as `candidateConcepts` unless Descuff deterministic evidence already models them.",
    "- Do not set readiness scores, validation status, safety approval, or generated file contents.",
    "- Do not expose sensitive, private, mutating, or high-consequence capabilities.",
    "- Use the exact field names from the JSON shape. Do not rename `description`, `rationale`, or `message`.",
    "",
    "Current deterministic summary:",
    "",
    `- Domain profile: ${packet.deterministicSummary.domainProfile.primaryDomain || "unknown"} (${packet.deterministicSummary.domainProfile.confidence})`,
    `- Domain summary: ${packet.deterministicSummary.domainProfile.summary}`,
    `- Compatibility application type: ${packet.deterministicSummary.applicationType} (${packet.deterministicSummary.applicationTypeConfidence})`,
    `- Routes: ${packet.deterministicSummary.routeCount}`,
    `- APIs: ${packet.deterministicSummary.apiCount}`,
    `- Capabilities: ${packet.deterministicSummary.capabilityCount}`,
    "",
    "Return JSON matching this shape:",
    "",
    JSON.stringify(template, null, 2),
    ""
  ];

  return lines.join("\n");
}

export function validateSemanticEnrichment(
  packet: SkillEvidencePacket,
  enrichment: unknown
): SemanticEnrichmentValidationResult {
  const knownEvidenceIds = evidenceIdSet(packet);
  const issues: SemanticEnrichmentIssue[] = [];
  const candidate = asRecord(enrichment);

  if (candidate === undefined) {
    issues.push({
      code: "SEMANTIC_ENRICHMENT_SHAPE_INVALID",
      message: "Semantic enrichment must be a JSON object.",
      path: "$",
      disposition: "rejected",
      evidenceIds: []
    });

    return {
      accepted: createEmptySemanticEnrichment(),
      candidateConceptsAccepted: [],
      issues,
      valid: false
    };
  }

  if (candidate.schemaVersion !== semanticEnrichmentSchemaVersion) {
    issues.push({
      code: "SEMANTIC_ENRICHMENT_SCHEMA_VERSION_UNSUPPORTED",
      message: `Unsupported semantic enrichment schema version: ${String(candidate.schemaVersion)}`,
      path: "schemaVersion",
      disposition: "rejected",
      evidenceIds: []
    });
  }

  const domainProfile = readDomainProfile(candidate.domainProfile, issues);
  const entityMeanings = readSemanticMeaningArray(
    candidate.entityMeanings,
    issues,
    "entityMeanings"
  );
  const capabilityMeanings = readSemanticMeaningArray(
    candidate.capabilityMeanings,
    issues,
    "capabilityMeanings"
  );
  const candidateConcepts = readCandidateConceptArray(
    candidate.candidateConcepts,
    issues,
    "candidateConcepts"
  );
  const standardSuitability = readStandardSuitabilityArray(
    candidate.standardSuitability,
    issues,
    "standardSuitability"
  );
  const uncertaintyNotes = readUncertaintyNoteArray(
    candidate.uncertaintyNotes,
    issues,
    "uncertaintyNotes"
  );

  checkEvidenceRefs(
    issues,
    knownEvidenceIds,
    "domainProfile.evidenceIds",
    domainProfile.evidenceIds,
    "SEMANTIC_DOMAIN_PROFILE_EVIDENCE_UNKNOWN"
  );

  const accepted: SemanticEnrichment = {
    schemaVersion: semanticEnrichmentSchemaVersion,
    domainProfile,
    entityMeanings: [],
    capabilityMeanings: [],
    candidateConcepts: [],
    standardSuitability: [],
    uncertaintyNotes: []
  };

  accepted.entityMeanings = filterEvidenceBackedItems(
    entityMeanings,
    knownEvidenceIds,
    issues,
    "entityMeanings",
    "SEMANTIC_ENTITY_MEANING_EVIDENCE_UNKNOWN"
  );

  accepted.capabilityMeanings = filterEvidenceBackedItems(
    capabilityMeanings,
    knownEvidenceIds,
    issues,
    "capabilityMeanings",
    "SEMANTIC_CAPABILITY_MEANING_EVIDENCE_UNKNOWN"
  );

  accepted.candidateConcepts = filterEvidenceBackedItems(
    candidateConcepts,
    knownEvidenceIds,
    issues,
    "candidateConcepts",
    "SEMANTIC_CANDIDATE_CONCEPT_EVIDENCE_UNKNOWN"
  );

  accepted.standardSuitability = filterEvidenceBackedItems(
    standardSuitability,
    knownEvidenceIds,
    issues,
    "standardSuitability",
    "SEMANTIC_STANDARD_SUITABILITY_EVIDENCE_UNKNOWN"
  );

  accepted.uncertaintyNotes = filterEvidenceBackedItems(
    uncertaintyNotes,
    knownEvidenceIds,
    issues,
    "uncertaintyNotes",
    "SEMANTIC_UNCERTAINTY_EVIDENCE_UNKNOWN"
  );

  if (domainProfile.primaryDomain.length > 0) {
    issues.push({
      code: "SEMANTIC_DOMAIN_LABEL_DESCRIPTIVE_ONLY",
      message:
        "Domain labels are descriptive and must not independently trigger standards selection or safety behavior.",
      path: "domainProfile.primaryDomain",
      disposition: "investigation",
      evidenceIds: domainProfile.evidenceIds
    });
  }

  return {
    accepted,
    candidateConceptsAccepted: accepted.candidateConcepts,
    issues,
    valid: issues.every((issue) => issue.disposition !== "rejected")
  };
}

export function renderSemanticEnrichmentDiff(
  packet: SkillEvidencePacket,
  result: SemanticEnrichmentValidationResult
): string {
  const accepted = result.accepted;
  const rejected = result.issues.filter((issue) => issue.disposition === "rejected");
  const investigation = result.issues.filter((issue) => issue.disposition === "investigation");
  const evidenceBackedCount =
    accepted.entityMeanings.length +
    accepted.capabilityMeanings.length +
    accepted.candidateConcepts.length +
    accepted.standardSuitability.length;

  const lines = [
    "# Semantic Enrichment",
    "",
    "Current:",
    `  Domain profile: ${packet.deterministicSummary.domainProfile.primaryDomain || "unknown"}`,
    `  Compatibility application type: ${packet.deterministicSummary.applicationType}`,
    "",
    "Proposed:",
    `  Summary: ${accepted.domainProfile.summary || "none"}`,
    "  Domains:"
  ];

  if (accepted.domainProfile.domains.length === 0) {
    lines.push("    none");
  } else {
    for (const domain of accepted.domainProfile.domains) {
      lines.push(`    ${domain}`);
    }
  }

  lines.push("", "New capability meanings:");
  if (accepted.capabilityMeanings.length === 0) {
    lines.push("  none");
  } else {
    for (const meaning of accepted.capabilityMeanings) {
      lines.push(`  ${meaning.targetId} -> ${meaning.meaning}`);
    }
  }

  lines.push("", "Candidates:");
  if (accepted.candidateConcepts.length === 0) {
    lines.push("  none");
  } else {
    for (const candidate of accepted.candidateConcepts) {
      lines.push(
        `  ${candidate.id}: ${candidate.name} (${candidate.kind}, ${candidate.confidence})`
      );
    }
  }

  lines.push(
    "",
    `Evidence-backed: ${evidenceBackedCount}`,
    `Rejected: ${rejected.length}`,
    `Needs investigation: ${investigation.length}`,
    ""
  );

  return lines.join("\n");
}

function readDomainProfile(value: unknown, issues: SemanticEnrichmentIssue[]): DomainProfile {
  const item = asRecord(value);
  if (item === undefined) {
    addShapeIssue(issues, "domainProfile", "Domain profile must be an object.");
    return createEmptySemanticEnrichment().domainProfile;
  }

  return {
    summary: readString(item.summary, issues, "domainProfile.summary"),
    primaryDomain: readString(item.primaryDomain, issues, "domainProfile.primaryDomain"),
    domains: readStringArray(item.domains, issues, "domainProfile.domains"),
    confidence: readConfidence(item.confidence, issues, "domainProfile.confidence"),
    evidenceIds: readStringArray(item.evidenceIds, issues, "domainProfile.evidenceIds")
  };
}

function readSemanticMeaningArray(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): SemanticMeaning[] {
  return readArray(value, issues, path).flatMap((entry, index) => {
    const item = asRecord(entry);
    const itemPath = `${path}[${index}]`;
    if (item === undefined) {
      addShapeIssue(issues, itemPath, "Semantic meaning must be an object.");
      return [];
    }

    const parsed: SemanticMeaning = {
      targetId: readString(item.targetId, issues, `${itemPath}.targetId`),
      meaning: readString(item.meaning, issues, `${itemPath}.meaning`),
      confidence: readConfidence(item.confidence, issues, `${itemPath}.confidence`),
      evidenceIds: readStringArray(item.evidenceIds, issues, `${itemPath}.evidenceIds`)
    };

    return hasRejectedIssueAt(issues, itemPath) ? [] : [parsed];
  });
}

function readCandidateConceptArray(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): CandidateSemanticConcept[] {
  return readArray(value, issues, path).flatMap((entry, index) => {
    const item = asRecord(entry);
    const itemPath = `${path}[${index}]`;
    if (item === undefined) {
      addShapeIssue(issues, itemPath, "Candidate concept must be an object.");
      return [];
    }

    const parsed: CandidateSemanticConcept = {
      id: readString(item.id, issues, `${itemPath}.id`),
      kind: readConceptKind(item.kind, issues, `${itemPath}.kind`),
      name: readString(item.name, issues, `${itemPath}.name`),
      description: readString(item.description, issues, `${itemPath}.description`),
      confidence: readConfidence(item.confidence, issues, `${itemPath}.confidence`),
      evidenceIds: readStringArray(item.evidenceIds, issues, `${itemPath}.evidenceIds`)
    };

    return hasRejectedIssueAt(issues, itemPath) ? [] : [parsed];
  });
}

function readStandardSuitabilityArray(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): StandardSuitabilityRationale[] {
  return readArray(value, issues, path).flatMap((entry, index) => {
    const item = asRecord(entry);
    const itemPath = `${path}[${index}]`;
    if (item === undefined) {
      addShapeIssue(issues, itemPath, "Standard suitability rationale must be an object.");
      return [];
    }

    const parsed: StandardSuitabilityRationale = {
      standardId: readString(item.standardId, issues, `${itemPath}.standardId`),
      rationale: readString(item.rationale, issues, `${itemPath}.rationale`),
      evidenceIds: readStringArray(item.evidenceIds, issues, `${itemPath}.evidenceIds`)
    };

    return hasRejectedIssueAt(issues, itemPath) ? [] : [parsed];
  });
}

function readUncertaintyNoteArray(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): SemanticUncertaintyNote[] {
  return readArray(value, issues, path).flatMap((entry, index) => {
    const item = asRecord(entry);
    const itemPath = `${path}[${index}]`;
    if (item === undefined) {
      addShapeIssue(issues, itemPath, "Uncertainty note must be an object.");
      return [];
    }

    const parsed: SemanticUncertaintyNote = {
      message: readString(item.message, issues, `${itemPath}.message`),
      evidenceIds: readStringArray(item.evidenceIds, issues, `${itemPath}.evidenceIds`)
    };

    return hasRejectedIssueAt(issues, itemPath) ? [] : [parsed];
  });
}

function readArray(value: unknown, issues: SemanticEnrichmentIssue[], path: string): unknown[] {
  if (!Array.isArray(value)) {
    addShapeIssue(issues, path, "Semantic enrichment field must be an array.");
    return [];
  }
  return value;
}

function readString(value: unknown, issues: SemanticEnrichmentIssue[], path: string): string {
  if (typeof value !== "string") {
    addShapeIssue(issues, path, "Semantic enrichment field must be a string.");
    return "";
  }
  return value;
}

function readStringArray(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    addShapeIssue(issues, path, "Semantic enrichment field must be an array of strings.");
    return [];
  }
  return value;
}

function readConfidence(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): Confidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  addShapeIssue(issues, path, "Semantic enrichment confidence must be high, medium, or low.");
  return "low";
}

function readConceptKind(
  value: unknown,
  issues: SemanticEnrichmentIssue[],
  path: string
): SemanticConceptKind {
  if (value === "entity" || value === "capability") {
    return value;
  }
  addShapeIssue(issues, path, "Candidate concept kind must be entity or capability.");
  return "entity";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function addShapeIssue(issues: SemanticEnrichmentIssue[], path: string, message: string): void {
  issues.push({
    code: "SEMANTIC_ENRICHMENT_SHAPE_INVALID",
    message,
    path,
    disposition: "rejected",
    evidenceIds: []
  });
}

function hasRejectedIssueAt(issues: SemanticEnrichmentIssue[], path: string): boolean {
  return issues.some(
    (issue) => issue.disposition === "rejected" && issue.path.startsWith(`${path}.`)
  );
}

function filterEvidenceBackedItems<T extends { evidenceIds: string[] }>(
  items: T[],
  knownEvidenceIds: Set<string>,
  issues: SemanticEnrichmentIssue[],
  path: string,
  code: string
): T[] {
  return items.filter((item, index) => {
    const itemPath = `${path}[${index}].evidenceIds`;
    const unknown = unknownEvidenceIds(knownEvidenceIds, item.evidenceIds);
    if (item.evidenceIds.length === 0 || unknown.length > 0) {
      issues.push({
        code,
        message:
          item.evidenceIds.length === 0
            ? "Semantic enrichment item must cite at least one evidence ID."
            : `Semantic enrichment item cites unknown evidence IDs: ${unknown.join(", ")}`,
        path: itemPath,
        disposition: "rejected",
        evidenceIds: item.evidenceIds
      });
      return false;
    }
    return true;
  });
}

function checkEvidenceRefs(
  issues: SemanticEnrichmentIssue[],
  knownEvidenceIds: Set<string>,
  path: string,
  evidenceIds: string[],
  code: string
): void {
  const unknown = unknownEvidenceIds(knownEvidenceIds, evidenceIds);
  if (evidenceIds.length === 0 || unknown.length > 0) {
    issues.push({
      code,
      message:
        evidenceIds.length === 0
          ? "Semantic enrichment section must cite at least one evidence ID."
          : `Semantic enrichment section cites unknown evidence IDs: ${unknown.join(", ")}`,
      path,
      disposition: "rejected",
      evidenceIds
    });
  }
}

function unknownEvidenceIds(knownEvidenceIds: Set<string>, evidenceIds: string[]): string[] {
  return evidenceIds.filter((id) => !knownEvidenceIds.has(id));
}
