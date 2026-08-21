import type { ApplicationModel, StructuralAnalysis } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

export function validateBrowserEvidence(
  model: ApplicationModel,
  analysis: StructuralAnalysis
): ValidationSummary {
  const issues: ValidationFailure[] = [];

  if (analysis.runtimePages.length === 0) {
    return createValidationSummary(issues);
  }

  for (const page of analysis.runtimePages) {
    if (page.status < 200 || page.status >= 400) {
      issues.push({
        code: "RUNTIME_BROWSER_PAGE_STATUS_FAILED",
        level: "runtime",
        severity: "error",
        message: `Browser-observed page ${page.path} returned HTTP ${page.status}.`,
        source: page.id,
        evidence: page.evidence,
        suggestedAction:
          "Fix the rendered page before treating browser runtime validation as passing."
      });
    }

    if (page.headings.length === 0) {
      issues.push({
        code: "RUNTIME_PAGE_HEADINGS_MISSING",
        level: "runtime",
        severity: "warning",
        message: `Browser-observed page ${page.path} did not expose any h1, h2, or h3 headings.`,
        source: page.id,
        evidence: page.evidence,
        suggestedAction:
          "Confirm the page rendered correctly and exposes stable visible headings for agents."
      });
    }

    if (page.truncatedNetworkRequestCount > 0) {
      issues.push({
        code: "RUNTIME_NETWORK_OBSERVATION_TRUNCATED",
        level: "runtime",
        severity: "warning",
        message: `Browser-observed page ${page.path} had ${page.truncatedNetworkRequestCount} network request(s) beyond the capture limit.`,
        source: page.id,
        evidence: page.evidence,
        suggestedAction:
          "Increase runtime network limits or narrow the route set before relying on network evidence."
      });
    }
  }

  if (model.standards.some((standard) => standard.kind === "schema-org")) {
    const jsonLdObserved = analysis.runtimePages.some((page) => page.jsonLdCount > 0);
    if (!jsonLdObserved) {
      issues.push({
        code: "RUNTIME_JSONLD_NOT_OBSERVED",
        level: "runtime",
        severity: "error",
        message:
          "Schema.org is claimed, but browser runtime evidence did not observe any JSON-LD blocks.",
        source: "schema-org",
        evidence: model.standards
          .filter((standard) => standard.kind === "schema-org")
          .flatMap((standard) => standard.evidence),
        suggestedAction:
          "Render Schema.org JSON-LD into the page and rerun browser runtime validation."
      });
    }
  }

  if (analysis.forms.length > 0) {
    const formsObserved = analysis.runtimePages.some((page) => page.formCount > 0);
    if (!formsObserved) {
      issues.push({
        code: "RUNTIME_FORMS_NOT_OBSERVED",
        level: "runtime",
        severity: "warning",
        message: "Static form evidence exists, but browser runtime evidence did not observe forms.",
        source: "forms",
        evidence: analysis.forms.flatMap((form) => form.evidence),
        suggestedAction:
          "Confirm the forms render in the validated route set or update route/runtime configuration."
      });
    }
  }

  return createValidationSummary(issues);
}
