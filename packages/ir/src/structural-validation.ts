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

  return {
    valid: issues.length === 0,
    issues
  };
}
