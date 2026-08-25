import type { StructuralAnalysis } from "@descuff/ir";
import {
  correlateNativeAndGraphifyEvidence,
  type GraphifyNativeCorrelationStatus,
  type StructuralRelationshipEvidence
} from "./graphify-correlation.js";

export const graphifyEnrichmentSchemaVersion = "0.1.0";

export type GraphifyEnrichmentStatus = "available" | "unavailable" | "invalid";

export interface GraphifyEnrichmentSummary {
  schemaVersion: string;
  status: GraphifyEnrichmentStatus;
  message: string;
  counts: GraphifyEnrichmentCounts;
  correlations: GraphifyEnrichmentCorrelation[];
}

export interface GraphifyEnrichmentCounts {
  nativeRelationships: number;
  graphifyRelationships: number;
  agree: number;
  conflict: number;
  graphifyOnly: number;
  nativeOnly: number;
}

export interface GraphifyEnrichmentCorrelation {
  key: string;
  status: GraphifyNativeCorrelationStatus;
  nativeId?: string;
  graphifyId?: string;
  evidenceIds: string[];
  investigationNote?: string;
}

export function buildGraphifyEnrichmentSummary(input: {
  native: StructuralAnalysis;
  graphify: StructuralAnalysis;
}): GraphifyEnrichmentSummary {
  const graphifyReadWarning = input.graphify.warnings.find(
    (warning) => warning.code === "GRAPHIFY_GRAPH_MISSING"
  );

  if (graphifyReadWarning !== undefined && input.graphify.symbols.length === 0) {
    const invalid = graphifyReadWarning.message.includes("could not be parsed");
    return emptyGraphifyEnrichmentSummary({
      status: invalid ? "invalid" : "unavailable",
      message: graphifyReadWarning.message
    });
  }

  const native = input.native.symbols.map(symbolToRelationship);
  const graphify = input.graphify.symbols.map(symbolToRelationship);
  const correlations = correlateNativeAndGraphifyEvidence({ native, graphify });

  return {
    schemaVersion: graphifyEnrichmentSchemaVersion,
    status: "available",
    message:
      graphify.length === 0
        ? "Graphify graph contained no supplemental symbols."
        : "Graphify supplemental structural evidence was correlated with native analysis.",
    counts: countCorrelations(native.length, graphify.length, correlations),
    correlations: correlations.map((correlation) => {
      const summary: GraphifyEnrichmentCorrelation = {
        key: correlation.key,
        status: correlation.status,
        evidenceIds: correlation.evidence.map((ref) => ref.id)
      };
      if (correlation.native !== undefined) {
        summary.nativeId = correlation.native.id;
      }
      if (correlation.graphify !== undefined) {
        summary.graphifyId = correlation.graphify.id;
      }
      if (correlation.investigationNote !== undefined) {
        summary.investigationNote = correlation.investigationNote;
      }
      return summary;
    })
  };
}

export function renderGraphifyEnrichmentSummary(summary: GraphifyEnrichmentSummary): string {
  const lines = [
    "# Graphify Enrichment",
    "",
    `Schema version: ${summary.schemaVersion}`,
    `Status: ${summary.status}`,
    `Message: ${summary.message}`,
    "",
    "## Counts",
    "",
    `- Native relationships: ${summary.counts.nativeRelationships}`,
    `- Graphify relationships: ${summary.counts.graphifyRelationships}`,
    `- Agree: ${summary.counts.agree}`,
    `- Conflict: ${summary.counts.conflict}`,
    `- Graphify only: ${summary.counts.graphifyOnly}`,
    `- Native only: ${summary.counts.nativeOnly}`,
    "",
    "## Correlations",
    ""
  ];

  if (summary.correlations.length === 0) {
    lines.push("No correlations recorded.", "");
  } else {
    for (const correlation of summary.correlations) {
      lines.push(`- ${correlation.key}: ${correlation.status}`);
      if (correlation.investigationNote !== undefined) {
        lines.push(`  Investigation: ${correlation.investigationNote}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function emptyGraphifyEnrichmentSummary(input: {
  status: GraphifyEnrichmentStatus;
  message: string;
}): GraphifyEnrichmentSummary {
  return {
    schemaVersion: graphifyEnrichmentSchemaVersion,
    status: input.status,
    message: input.message,
    counts: {
      nativeRelationships: 0,
      graphifyRelationships: 0,
      agree: 0,
      conflict: 0,
      graphifyOnly: 0,
      nativeOnly: 0
    },
    correlations: []
  };
}

function symbolToRelationship(
  symbol: StructuralAnalysis["symbols"][number]
): StructuralRelationshipEvidence {
  return {
    id: symbol.id,
    kind: symbol.kind,
    subject: symbol.name,
    predicate: "definedIn",
    object: symbol.sourceFile,
    evidence: symbol.evidence
  };
}

function countCorrelations(
  nativeRelationships: number,
  graphifyRelationships: number,
  correlations: Array<{ status: GraphifyNativeCorrelationStatus }>
): GraphifyEnrichmentCounts {
  return {
    nativeRelationships,
    graphifyRelationships,
    agree: correlations.filter((correlation) => correlation.status === "agree").length,
    conflict: correlations.filter((correlation) => correlation.status === "conflict").length,
    graphifyOnly: correlations.filter((correlation) => correlation.status === "graphify-only")
      .length,
    nativeOnly: correlations.filter((correlation) => correlation.status === "native-only").length
  };
}
