import type { ApplicationModel } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateSecurityModel(model: ApplicationModel): ValidationSummary {
  const issues: ValidationFailure[] = [];

  for (const capability of model.capabilities) {
    if (
      (capability.visibility === "authenticated" || capability.visibility === "admin") &&
      model.authentication.boundaries.length === 0
    ) {
      issues.push({
        code: "SECURITY_AUTH_BOUNDARY_MISSING",
        level: "security",
        severity: "error",
        message: `${capability.name} is ${capability.visibility} but no authentication boundary was detected.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction:
          "Verify middleware or route-level auth evidence before exposing this capability."
      });
    }

    if (capability.visibility === "public" && capability.risk === "AUTHENTICATED_READ") {
      issues.push({
        code: "SECURITY_AUTHENTICATED_READ_EXPOSED_PUBLICLY",
        level: "security",
        severity: "error",
        message: `${capability.name} is classified as authenticated read but marked public.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction:
          "Mark the capability authenticated or remove it from public generated output."
      });
    }

    if (
      (capability.risk === "SENSITIVE_WRITE" || capability.risk === "HIGH_CONSEQUENCE") &&
      capability.visibility === "public"
    ) {
      issues.push({
        code: "SECURITY_SENSITIVE_CAPABILITY_PUBLIC",
        level: "security",
        severity: "error",
        message: `${capability.name} is ${capability.risk} and must not be silently exposed publicly.`,
        source: capability.id,
        evidence: capability.evidence,
        suggestedAction: "Require explicit approval and authenticated or mocked validation."
      });
    }
  }

  return createValidationSummary(issues);
}
