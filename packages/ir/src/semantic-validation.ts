import { applicationModelSchemaVersion, type ApplicationModel } from "./semantic-model.js";

export interface SemanticValidationIssue {
  code: string;
  message: string;
}

export interface SemanticValidationResult {
  valid: boolean;
  issues: SemanticValidationIssue[];
}

export function validateApplicationModel(model: ApplicationModel): SemanticValidationResult {
  const issues: SemanticValidationIssue[] = [];

  if (model.schemaVersion !== applicationModelSchemaVersion) {
    issues.push({
      code: "APPLICATION_MODEL_SCHEMA_VERSION_UNSUPPORTED",
      message: `Unsupported application model schema version: ${model.schemaVersion}`
    });
  }

  requireEvidence(issues, "PROJECT_EVIDENCE_MISSING", "Project metadata", model.project.evidence);
  requireEvidence(
    issues,
    "APPLICATION_TYPE_EVIDENCE_MISSING",
    "Application type",
    model.applicationType.evidence,
    model.applicationType.type === "unknown"
  );

  for (const entity of model.entities) {
    requireEvidence(issues, "ENTITY_EVIDENCE_MISSING", `Entity ${entity.id}`, entity.evidence);
  }

  for (const route of model.routes) {
    requireEvidence(issues, "ROUTE_EVIDENCE_MISSING", `Route ${route.path}`, route.evidence);
  }

  for (const api of model.apis) {
    requireEvidence(issues, "API_EVIDENCE_MISSING", `API ${api.method} ${api.path}`, api.evidence);
  }

  for (const capability of model.capabilities) {
    requireEvidence(
      issues,
      "CAPABILITY_EVIDENCE_MISSING",
      `Capability ${capability.id}`,
      capability.evidence
    );
  }

  for (const boundary of model.authentication.boundaries) {
    requireEvidence(
      issues,
      "AUTH_BOUNDARY_EVIDENCE_MISSING",
      `Authentication boundary ${boundary.id}`,
      boundary.evidence
    );
  }

  for (const standard of model.standards) {
    requireEvidence(
      issues,
      "STANDARD_EVIDENCE_MISSING",
      `Existing standard ${standard.id}`,
      standard.evidence
    );
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function requireEvidence(
  issues: SemanticValidationIssue[],
  code: string,
  subject: string,
  evidence: unknown[],
  allowEmpty = false
): void {
  if (!allowEmpty && evidence.length === 0) {
    issues.push({
      code,
      message: `${subject} must include evidence.`
    });
  }
}
