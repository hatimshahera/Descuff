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

export function validateSemanticEnrichment(
  packet: SkillEvidencePacket,
  enrichment: SemanticEnrichment
): SemanticEnrichmentValidationResult {
  const knownEvidenceIds = evidenceIdSet(packet);
  const issues: SemanticEnrichmentIssue[] = [];

  if (enrichment.schemaVersion !== semanticEnrichmentSchemaVersion) {
    issues.push({
      code: "SEMANTIC_ENRICHMENT_SCHEMA_VERSION_UNSUPPORTED",
      message: `Unsupported semantic enrichment schema version: ${enrichment.schemaVersion}`,
      path: "schemaVersion",
      disposition: "rejected",
      evidenceIds: []
    });
  }

  checkEvidenceRefs(
    issues,
    knownEvidenceIds,
    "domainProfile.evidenceIds",
    enrichment.domainProfile.evidenceIds,
    "SEMANTIC_DOMAIN_PROFILE_EVIDENCE_UNKNOWN"
  );

  const accepted: SemanticEnrichment = {
    ...enrichment,
    entityMeanings: [],
    capabilityMeanings: [],
    candidateConcepts: [],
    standardSuitability: [],
    uncertaintyNotes: []
  };

  accepted.entityMeanings = filterEvidenceBackedItems(
    enrichment.entityMeanings,
    knownEvidenceIds,
    issues,
    "entityMeanings",
    "SEMANTIC_ENTITY_MEANING_EVIDENCE_UNKNOWN"
  );

  accepted.capabilityMeanings = filterEvidenceBackedItems(
    enrichment.capabilityMeanings,
    knownEvidenceIds,
    issues,
    "capabilityMeanings",
    "SEMANTIC_CAPABILITY_MEANING_EVIDENCE_UNKNOWN"
  );

  accepted.candidateConcepts = filterEvidenceBackedItems(
    enrichment.candidateConcepts,
    knownEvidenceIds,
    issues,
    "candidateConcepts",
    "SEMANTIC_CANDIDATE_CONCEPT_EVIDENCE_UNKNOWN"
  );

  accepted.standardSuitability = filterEvidenceBackedItems(
    enrichment.standardSuitability,
    knownEvidenceIds,
    issues,
    "standardSuitability",
    "SEMANTIC_STANDARD_SUITABILITY_EVIDENCE_UNKNOWN"
  );

  accepted.uncertaintyNotes = filterEvidenceBackedItems(
    enrichment.uncertaintyNotes,
    knownEvidenceIds,
    issues,
    "uncertaintyNotes",
    "SEMANTIC_UNCERTAINTY_EVIDENCE_UNKNOWN"
  );

  if (enrichment.domainProfile.primaryDomain.length > 0) {
    issues.push({
      code: "SEMANTIC_DOMAIN_LABEL_DESCRIPTIVE_ONLY",
      message:
        "Domain labels are descriptive and must not independently trigger standards selection or safety behavior.",
      path: "domainProfile.primaryDomain",
      disposition: "investigation",
      evidenceIds: enrichment.domainProfile.evidenceIds
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
    `  Application type: ${packet.deterministicSummary.applicationType}`,
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
