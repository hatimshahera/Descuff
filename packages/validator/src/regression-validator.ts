import { createValidationSummary } from "./summary.js";
import type {
  UiRegressionBaseline,
  UiRouteInvariant,
  ValidationFailure,
  ValidationSummary
} from "./types.js";

export function validateUiRegression(
  baseline: UiRegressionBaseline,
  current: UiRouteInvariant[]
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const currentByRoute = new Map(current.map((route) => [route.route, route]));

  for (const expected of baseline.routes) {
    const observed = currentByRoute.get(expected.route);

    if (observed === undefined) {
      issues.push({
        code: "UI_REGRESSION_ROUTE_MISSING",
        level: "regression",
        severity: "error",
        message: `Expected route ${expected.route} was not observed during regression validation.`,
        source: expected.route,
        evidence: expected.evidence,
        suggestedAction: "Restore the route or approve the route removal explicitly."
      });
      continue;
    }

    if (expected.title !== undefined && observed.title !== expected.title) {
      issues.push({
        code: "UI_REGRESSION_TITLE_CHANGED",
        level: "regression",
        severity: "error",
        message: `Route ${expected.route} title changed from ${expected.title} to ${observed.title ?? "<missing>"}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Restore the title or record explicit approval for the UI copy change."
      });
    }

    const missingHeadings = expected.headings.filter(
      (heading) => !observed.headings.includes(heading)
    );
    for (const heading of missingHeadings) {
      issues.push({
        code: "UI_REGRESSION_HEADING_MISSING",
        level: "regression",
        severity: "error",
        message: `Route ${expected.route} is missing expected heading ${heading}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Restore the heading or record explicit approval for the UI copy change."
      });
    }

    if (expected.landmarkCount !== undefined && observed.landmarkCount !== expected.landmarkCount) {
      issues.push({
        code: "UI_REGRESSION_LANDMARK_COUNT_CHANGED",
        level: "regression",
        severity: "warning",
        message: `Route ${expected.route} landmark count changed from ${expected.landmarkCount} to ${observed.landmarkCount ?? 0}.`,
        source: expected.route,
        evidence: [...expected.evidence, ...observed.evidence],
        suggestedAction: "Review the accessibility landmark change before approving validation."
      });
    }
  }

  return createValidationSummary(issues);
}
