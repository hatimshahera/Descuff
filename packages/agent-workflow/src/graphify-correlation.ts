import type { EvidenceRef } from "@descuff/ir";

export type GraphifyNativeCorrelationStatus =
  "agree" | "conflict" | "graphify-only" | "native-only";

export interface StructuralRelationshipEvidence {
  id: string;
  kind: string;
  subject: string;
  predicate: string;
  object: string;
  evidence: EvidenceRef[];
}

export interface GraphifyNativeCorrelation {
  key: string;
  status: GraphifyNativeCorrelationStatus;
  native?: StructuralRelationshipEvidence;
  graphify?: StructuralRelationshipEvidence;
  evidence: EvidenceRef[];
  investigationNote?: string;
}

export function correlateNativeAndGraphifyEvidence(input: {
  native: StructuralRelationshipEvidence[];
  graphify: StructuralRelationshipEvidence[];
}): GraphifyNativeCorrelation[] {
  const nativeByKey = new Map(input.native.map((item) => [relationshipKey(item), item]));
  const graphifyByKey = new Map(input.graphify.map((item) => [relationshipKey(item), item]));
  const keys = [...new Set([...nativeByKey.keys(), ...graphifyByKey.keys()])].sort();

  return keys.map((key) => {
    const native = nativeByKey.get(key);
    const graphify = graphifyByKey.get(key);

    if (native !== undefined && graphify !== undefined) {
      const status: GraphifyNativeCorrelationStatus =
        native.object === graphify.object && native.kind === graphify.kind ? "agree" : "conflict";
      const correlation: GraphifyNativeCorrelation = {
        key,
        status,
        native,
        graphify,
        evidence: uniqueEvidence([...native.evidence, ...graphify.evidence])
      };
      if (status === "conflict") {
        correlation.investigationNote =
          "Native and Graphify evidence describe the same relationship key differently.";
      }
      return correlation;
    }

    if (native !== undefined) {
      return {
        key,
        status: "native-only",
        native,
        evidence: native.evidence,
        investigationNote: "Relationship is present only in native Descuff analysis."
      };
    }

    if (graphify === undefined) {
      throw new Error(`Missing Graphify relationship for correlation key: ${key}`);
    }

    return {
      key,
      status: "graphify-only",
      graphify,
      evidence: graphify.evidence,
      investigationNote: "Relationship is present only in Graphify evidence."
    };
  });
}

function relationshipKey(item: StructuralRelationshipEvidence): string {
  return `${item.subject}:${item.predicate}`;
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
