export const evidenceSchemaVersion = "0.1.0";

export type EvidenceKind = "source" | "runtime" | "config" | "test" | "generated";

export type Confidence = "high" | "medium" | "low";

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  location: string;
  observedAt?: string;
  confidence: Confidence;
  summary: string;
}

export interface EvidenceIndex {
  schemaVersion: string;
  items: EvidenceRef[];
}

export function createEvidenceIndex(items: EvidenceRef[] = []): EvidenceIndex {
  return {
    schemaVersion: evidenceSchemaVersion,
    items
  };
}
