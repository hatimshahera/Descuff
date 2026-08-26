import {
  driftResultSchemaVersion,
  type DriftDiffResult,
  type DriftImpactKind,
  type DriftValidationPlan,
  type DriftValidationSuite
} from "./types.js";
import { uniqueSorted } from "./shared.js";

export function createDriftValidationPlan(diff: DriftDiffResult): DriftValidationPlan {
  if (diff.status === "fail") {
    return {
      schemaVersion: driftResultSchemaVersion,
      validationDepth: diff.validationDepth,
      suites: ["none"],
      fullValidationFallback: false,
      reasons: ["Drift baseline failed before validation planning."]
    };
  }

  if (diff.validationDepth === "none") {
    return {
      schemaVersion: driftResultSchemaVersion,
      validationDepth: "none",
      suites: ["none"],
      fullValidationFallback: false,
      reasons: ["No agent-facing evidence was affected by the changed files."]
    };
  }

  const impactKinds = uniqueSorted(
    diff.impacts.filter((impact) => impact.kind !== "none").map((impact) => impact.kind)
  ) as DriftImpactKind[];
  const suites = new Set<DriftValidationSuite>();
  const reasons: string[] = [];

  if (impactKinds.includes("metadata")) {
    suites.add("static-standards");
    suites.add("source-fingerprints");
    reasons.push("Machine-facing metadata changed.");
  }

  if (impactKinds.includes("route") || impactKinds.includes("model")) {
    suites.add("static-generated-changes");
    suites.add("static-standards");
    suites.add("source-fingerprints");
    reasons.push("Route, model, or structured content evidence changed.");
  }

  if (impactKinds.includes("api") || impactKinds.includes("runtime")) {
    suites.add("static-generated-changes");
    suites.add("static-standards");
    suites.add("source-fingerprints");
    suites.add("runtime-observations");
    reasons.push("API or runtime-observed behavior changed.");
  }

  if (impactKinds.includes("server-action")) {
    suites.add("static-generated-changes");
    suites.add("security-model");
    suites.add("capability-confidence");
    reasons.push("Server Action behavior or exposure may have changed.");
  }

  if (
    impactKinds.includes("auth-boundary") ||
    diff.affectedStandards.includes("webmcp") ||
    impactKinds.includes("unknown")
  ) {
    suites.add("security-model");
  }

  if (diff.affectedStandards.includes("webmcp")) {
    suites.add("webmcp-behavior");
    reasons.push("WebMCP-facing capability contracts may have changed.");
  }

  if (diff.validationDepth === "full" || impactKinds.includes("unknown")) {
    suites.clear();
    suites.add("full-validation");
    reasons.push("Targeted validation cannot prove safety for this change set.");
  }

  return {
    schemaVersion: driftResultSchemaVersion,
    validationDepth: diff.validationDepth,
    suites: [...suites].sort(),
    fullValidationFallback: true,
    reasons: reasons.length > 0 ? reasons : ["Agent-facing evidence changed."]
  };
}
