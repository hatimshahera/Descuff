import {
  classifyCapabilityRisk,
  type ApplicationModel,
  type HttpMethod,
  type StructuralAnalysis
} from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type {
  RuntimeValidationConfig,
  RuntimeValidationScenario,
  ValidationFailure,
  ValidationSummary
} from "./types.js";
import { validateWebMcpBehavior } from "./webmcp-validator.js";

export function validateRuntimeConfig(config: RuntimeValidationConfig): ValidationSummary {
  const issues: ValidationFailure[] = [];

  if (!/^https?:\/\//.test(config.baseUrl)) {
    issues.push({
      code: "RUNTIME_CONFIG_BASE_URL_INVALID",
      level: "runtime",
      severity: "error",
      message: "Runtime validation baseUrl must be an HTTP or HTTPS URL.",
      source: "runtime-config",
      evidence: [],
      suggestedAction: "Configure a reachable HTTP(S) base URL for runtime validation."
    });
  }

  for (const envVarName of config.envVarNames) {
    if (envVarName.includes("=")) {
      issues.push({
        code: "RUNTIME_CONFIG_SECRET_VALUE_EMBEDDED",
        level: "runtime",
        severity: "error",
        message: "Runtime config must reference environment variable names, not secret values.",
        source: "runtime-config",
        evidence: [],
        suggestedAction: "Store only the environment variable name in runtime validation config."
      });
    }
  }

  for (const operation of config.apiOperations) {
    issues.push(...validateRuntimeOperationAuthorization(operation, config.scenarios));
  }

  return createValidationSummary(issues);
}

export function validateRuntimeObservations(
  model: ApplicationModel,
  analysis: StructuralAnalysis
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const runtimeRoutesByPath = new Map(analysis.runtimeRoutes.map((route) => [route.path, route]));
  const runtimeApisByOperation = new Map(
    analysis.runtimeApiOperations.map((operation) => [
      `${operation.method}:${operation.path}`,
      operation
    ])
  );

  for (const route of model.routes) {
    const observed = runtimeRoutesByPath.get(route.path);

    if (observed === undefined) {
      issues.push({
        code: "RUNTIME_ROUTE_NOT_OBSERVED",
        level: "runtime",
        severity: "error",
        message: `Route ${route.path} was not observed during runtime validation.`,
        source: route.id,
        evidence: route.evidence,
        suggestedAction:
          "Start the application and validate the route against the configured base URL."
      });
      continue;
    }

    if (!isSuccessfulRuntimeStatus(observed.status)) {
      issues.push({
        code: "RUNTIME_ROUTE_STATUS_FAILED",
        level: "runtime",
        severity: "error",
        message: `Route ${route.path} returned HTTP ${observed.status}.`,
        source: route.id,
        evidence: [...route.evidence, ...observed.evidence],
        suggestedAction:
          "Fix the route or generated references before marking runtime validation successful."
      });
    }
  }

  for (const api of model.apis.filter((operation) => isReadOnlyMethod(operation.method))) {
    const observed = runtimeApisByOperation.get(`${api.method}:${api.path}`);

    if (observed === undefined) {
      issues.push({
        code: "RUNTIME_API_NOT_OBSERVED",
        level: "runtime",
        severity: "error",
        message: `${api.method} ${api.path} was not observed during runtime validation.`,
        source: api.id,
        evidence: api.evidence,
        suggestedAction:
          "Start the application and validate the API operation against the configured base URL."
      });
      continue;
    }

    if (!isSuccessfulRuntimeStatus(observed.status)) {
      issues.push({
        code: "RUNTIME_API_STATUS_FAILED",
        level: "runtime",
        severity: "error",
        message: `${api.method} ${api.path} returned HTTP ${observed.status}.`,
        source: api.id,
        evidence: [...api.evidence, ...observed.evidence],
        suggestedAction:
          "Fix the API handler or generated references before marking runtime validation successful."
      });
    }
  }

  const webMcpSummary = validateWebMcpBehavior(model, analysis);

  return createValidationSummary([...issues, ...webMcpSummary.failures, ...webMcpSummary.warnings]);
}

function validateRuntimeOperationAuthorization(
  operation: { method: HttpMethod; path: string },
  scenarios: RuntimeValidationScenario[]
): ValidationFailure[] {
  const risk = classifyCapabilityRisk(operation.method, operation.path);

  if (isReadOnlyMethod(operation.method)) {
    return [];
  }

  const scenario = scenarios.find(
    (candidate) => candidate.method === operation.method && candidate.path === operation.path
  );

  if (scenario === undefined) {
    return [
      {
        code: "RUNTIME_MUTATION_SCENARIO_MISSING",
        level: "runtime",
        severity: "error",
        message: `${operation.method} ${operation.path} requires an explicit validation scenario before invocation.`,
        source: "runtime-config",
        evidence: [],
        suggestedAction:
          "Define setup, expected side effects, verification, and cleanup before validating this mutating operation."
      }
    ];
  }

  const missingFields = [
    scenario.setup,
    scenario.verification,
    scenario.cleanup,
    ...scenario.expectedSideEffects
  ].some((value) => value.trim().length === 0);

  if (missingFields || scenario.expectedSideEffects.length === 0) {
    return [
      {
        code: "RUNTIME_MUTATION_SCENARIO_INCOMPLETE",
        level: "runtime",
        severity: "error",
        message: `Validation scenario ${scenario.id} must define setup, expected side effects, verification, and cleanup.`,
        source: scenario.id,
        evidence: scenario.evidence,
        suggestedAction: "Complete the mutating validation scenario before runtime invocation."
      }
    ];
  }

  if (risk === "HIGH_CONSEQUENCE" && scenario.safeTestEnvironment !== true) {
    return [
      {
        code: "RUNTIME_HIGH_CONSEQUENCE_ENVIRONMENT_MISSING",
        level: "runtime",
        severity: "error",
        message: `${operation.method} ${operation.path} is high consequence and requires a safe test environment or mock.`,
        source: scenario.id,
        evidence: scenario.evidence,
        suggestedAction:
          "Provide a user-supplied safe test environment or mock before validating this operation."
      }
    ];
  }

  return [];
}

function isReadOnlyMethod(method: HttpMethod): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function isSuccessfulRuntimeStatus(status: number): boolean {
  return status >= 200 && status < 400;
}
