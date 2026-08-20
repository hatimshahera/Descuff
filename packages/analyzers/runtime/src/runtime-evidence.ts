import type { EvidenceRef } from "@descuff/ir";

export function runtimeEvidence(location: string, summary: string): EvidenceRef {
  return {
    id: `runtime:${location}`,
    kind: "runtime",
    location,
    confidence: "high",
    summary
  };
}
