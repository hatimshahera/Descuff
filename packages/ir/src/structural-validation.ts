import { structuralAnalysisSchemaVersion, type StructuralAnalysis } from "./structural-analysis.js";

export interface StructuralValidationIssue {
  code: string;
  message: string;
}

export interface StructuralValidationResult {
  valid: boolean;
  issues: StructuralValidationIssue[];
}

export function validateStructuralAnalysis(
  analysis: StructuralAnalysis
): StructuralValidationResult {
  const issues: StructuralValidationIssue[] = [];

  if (analysis.schemaVersion !== structuralAnalysisSchemaVersion) {
    issues.push({
      code: "STRUCTURAL_SCHEMA_VERSION_UNSUPPORTED",
      message: `Unsupported structural analysis schema version: ${analysis.schemaVersion}`
    });
  }

  for (const route of analysis.routes) {
    if (route.evidence.length === 0) {
      issues.push({
        code: "STRUCTURAL_ROUTE_EVIDENCE_MISSING",
        message: `Route ${route.path} has no evidence.`
      });
    }
  }

  for (const operation of analysis.apiOperations) {
    if (operation.evidence.length === 0) {
      issues.push({
        code: "STRUCTURAL_API_EVIDENCE_MISSING",
        message: `API operation ${operation.method} ${operation.path} has no evidence.`
      });
    }
  }

  for (const correlation of analysis.correlations) {
    if (correlation.staticEvidence.length === 0 || correlation.runtimeEvidence.length === 0) {
      issues.push({
        code: "STRUCTURAL_CORRELATION_EVIDENCE_MISSING",
        message: `Correlation ${correlation.id} must include static and runtime evidence.`
      });
    }
  }

  for (const benchmark of analysis.browserAgentBenchmarks) {
    if (
      benchmark.evidence.length === 0 ||
      benchmark.before.evidence.length === 0 ||
      benchmark.after.evidence.length === 0
    ) {
      issues.push({
        code: "BROWSER_AGENT_BENCHMARK_EVIDENCE_MISSING",
        message: `Browser-agent benchmark ${benchmark.id} must include benchmark, before-path, and after-path evidence.`
      });
    }
  }

  for (const scenario of analysis.browserAgentScenarios) {
    if (scenario.evidence.length === 0) {
      issues.push({
        code: "BROWSER_AGENT_SCENARIO_EVIDENCE_MISSING",
        message: `Browser-agent scenario ${scenario.id} must include configuration evidence.`
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}
