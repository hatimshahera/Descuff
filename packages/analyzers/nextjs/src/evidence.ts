import { relative } from "node:path";
import type { EvidenceRef } from "@descuff/ir";

export function sourceEvidence(rootDir: string, filePath: string, summary: string): EvidenceRef {
  const location = relative(rootDir, filePath);

  return {
    id: `source:${location}`,
    kind: "source",
    location,
    confidence: "high",
    summary
  };
}
