import type { ApiOperation, ApplicationModel, Capability, StructuralAnalysis } from "@descuff/ir";
import { createValidationSummary } from "./summary.js";
import type { ValidationFailure, ValidationSummary } from "./types.js";

interface WebMcpToolCandidate {
  capability: Capability;
  api: ApiOperation & { method: "GET" };
}

export function validateWebMcpBehavior(
  model: ApplicationModel,
  analysis: StructuralAnalysis
): ValidationSummary {
  const issues: ValidationFailure[] = [];
  const claimsWebMcp = model.standards.some((standard) => standard.kind === "webmcp");
  const observedTools = analysis.runtimeWebMcpTools;
  const observedExecutions = analysis.runtimeWebMcpToolExecutions;

  if (!claimsWebMcp && observedTools.length === 0) {
    return createValidationSummary(issues);
  }

  if (analysis.runtimePages.length === 0) {
    issues.push({
      code: "RUNTIME_BROWSER_OBSERVATION_MISSING",
      level: "runtime",
      severity: "warning",
      message: "WebMCP behavior cannot be proven without browser page observations.",
      source: "webmcp",
      evidence: model.standards.flatMap((standard) => standard.evidence),
      suggestedAction:
        "Run validation with browser runtime analysis enabled so Descuff can inspect document.modelContext."
    });
    return createValidationSummary(issues);
  }

  const candidates = publicReadToolCandidates(model);

  if (claimsWebMcp && observedTools.length === 0) {
    issues.push({
      code: "WEBMCP_TOOL_NOT_REGISTERED",
      level: "runtime",
      severity: "error",
      message: "WebMCP metadata exists, but no browser-registered WebMCP tools were discovered.",
      source: "webmcp",
      evidence: model.standards.flatMap((standard) => standard.evidence),
      suggestedAction:
        "Register tools with document.modelContext.registerTool(...) from browser-executed code, then rerun descuff validate."
    });
  }

  for (const candidate of candidates) {
    const expectedName = toolName(candidate.capability);
    const observed = observedTools.find((tool) => tool.name === expectedName);

    if (observed === undefined) {
      if (claimsWebMcp) {
        issues.push({
          code: "WEBMCP_EXPECTED_TOOL_MISSING",
          level: "runtime",
          severity: "error",
          message: `Expected WebMCP tool ${expectedName} for GET ${candidate.api.path} was not discovered in the browser.`,
          source: candidate.capability.id,
          evidence: [...candidate.capability.evidence, ...candidate.api.evidence],
          suggestedAction:
            "Register the planned WebMCP tool in browser-executed code or remove the unsupported WebMCP claim."
        });
      }
      continue;
    }

    if (observed.description.trim().length === 0) {
      issues.push({
        code: "WEBMCP_TOOL_DESCRIPTION_MISSING",
        level: "runtime",
        severity: "error",
        message: `WebMCP tool ${expectedName} must include a human-readable description.`,
        source: candidate.capability.id,
        evidence: [...candidate.capability.evidence, ...observed.evidence],
        suggestedAction: "Add a stable tool description before claiming WebMCP support."
      });
    }

    if (!isJsonObjectSchema(observed.inputSchema)) {
      issues.push({
        code: "WEBMCP_TOOL_SCHEMA_INVALID",
        level: "runtime",
        severity: "error",
        message: `WebMCP tool ${expectedName} must expose a JSON-compatible object inputSchema.`,
        source: candidate.capability.id,
        evidence: [...candidate.capability.evidence, ...observed.evidence],
        suggestedAction: "Provide an object inputSchema that matches the tool input contract."
      });
    }

    if (observed.annotations?.readOnlyHint !== true) {
      issues.push({
        code: "WEBMCP_TOOL_UNSAFE_TO_EXECUTE",
        level: "runtime",
        severity: "error",
        message: `WebMCP tool ${expectedName} is not explicitly annotated as read-only.`,
        source: candidate.capability.id,
        evidence: [...candidate.capability.evidence, ...observed.evidence],
        suggestedAction:
          "Set readOnlyHint: true for safe read-only tools or require an explicit validation scenario for mutating tools."
      });
    }

    if (observed.annotations?.readOnlyHint === true) {
      const execution = observedExecutions.find(
        (candidate) =>
          candidate.toolName === observed.name &&
          candidate.origin === observed.origin &&
          candidate.frameUrl === observed.frameUrl
      );

      if (execution === undefined) {
        issues.push({
          code: "WEBMCP_TOOL_EXECUTION_MISSING",
          level: "runtime",
          severity: "error",
          message: `WebMCP tool ${expectedName} was discovered but no safe execution evidence was recorded.`,
          source: candidate.capability.id,
          evidence: [...candidate.capability.evidence, ...observed.evidence],
          suggestedAction:
            "Run browser runtime validation with safe WebMCP execution enabled for read-only tools."
        });
      } else if (execution.status !== "executed") {
        issues.push({
          code:
            execution.status === "skipped"
              ? "WEBMCP_TOOL_EXECUTION_SKIPPED"
              : "WEBMCP_TOOL_EXECUTION_FAILED",
          level: "runtime",
          severity: "error",
          message: `WebMCP tool ${expectedName} execution ${execution.status}.`,
          source: candidate.capability.id,
          evidence: [...candidate.capability.evidence, ...execution.evidence],
          suggestedAction:
            "Fix the read-only WebMCP tool execution path before claiming behavioral WebMCP support."
        });
      } else if (execution.resultShape === undefined) {
        issues.push({
          code: "WEBMCP_TOOL_RESULT_MISSING",
          level: "runtime",
          severity: "error",
          message: `WebMCP tool ${expectedName} executed but did not record result shape evidence.`,
          source: candidate.capability.id,
          evidence: [...candidate.capability.evidence, ...execution.evidence],
          suggestedAction:
            "Record minimal result shape evidence so validation can compare behavior across runs."
        });
      } else {
        const runtimeApi = analysis.runtimeApiOperations.find(
          (operation) =>
            operation.method === candidate.api.method && operation.path === candidate.api.path
        );

        if (runtimeApi === undefined || runtimeApi.status < 200 || runtimeApi.status >= 400) {
          issues.push({
            code: "WEBMCP_TOOL_RUNTIME_MISMATCH",
            level: "runtime",
            severity: "error",
            message: `WebMCP tool ${expectedName} executed but linked GET ${candidate.api.path} was not successfully observed at runtime.`,
            source: candidate.capability.id,
            evidence: [
              ...candidate.capability.evidence,
              ...candidate.api.evidence,
              ...execution.evidence,
              ...(runtimeApi?.evidence ?? [])
            ],
            suggestedAction:
              "Validate the linked GET API successfully and ensure the WebMCP tool uses that same application data boundary."
          });
        } else if (
          runtimeApi.responseShape !== undefined &&
          execution.resultShape !== runtimeApi.responseShape
        ) {
          issues.push({
            code: "WEBMCP_TOOL_RUNTIME_MISMATCH",
            level: "runtime",
            severity: "error",
            message: `WebMCP tool ${expectedName} returned ${execution.resultShape}, but linked GET ${candidate.api.path} returned ${runtimeApi.responseShape}.`,
            source: candidate.capability.id,
            evidence: [
              ...candidate.capability.evidence,
              ...candidate.api.evidence,
              ...execution.evidence,
              ...runtimeApi.evidence
            ],
            suggestedAction:
              "Align the WebMCP tool result with the linked application API response shape."
          });
        } else if (
          runtimeApi.responseSummary !== undefined &&
          execution.resultSummary !== undefined &&
          execution.resultSummary !== runtimeApi.responseSummary
        ) {
          issues.push({
            code: "WEBMCP_TOOL_RUNTIME_MISMATCH",
            level: "runtime",
            severity: "error",
            message: `WebMCP tool ${expectedName} result summary did not match linked GET ${candidate.api.path}.`,
            source: candidate.capability.id,
            evidence: [
              ...candidate.capability.evidence,
              ...candidate.api.evidence,
              ...execution.evidence,
              ...runtimeApi.evidence
            ],
            suggestedAction:
              "Ensure the WebMCP tool reads from the same data boundary as the linked GET API."
          });
        }
      }
    }

    if (!isKnownPageOrigin(observed.origin, analysis)) {
      issues.push({
        code: "WEBMCP_TOOL_ORIGIN_UNOBSERVED",
        level: "runtime",
        severity: "warning",
        message: `WebMCP tool ${expectedName} was discovered on unobserved origin ${observed.origin}.`,
        source: candidate.capability.id,
        evidence: observed.evidence,
        suggestedAction:
          "Verify the tool origin is same-origin or explicitly exposed by the intended page."
      });
    }
  }

  return createValidationSummary(issues);
}

function publicReadToolCandidates(model: ApplicationModel): WebMcpToolCandidate[] {
  const apisById = new Map(model.apis.map((api) => [api.id, api]));
  const candidates: WebMcpToolCandidate[] = [];

  for (const capability of model.capabilities) {
    if (
      capability.operationType !== "read" ||
      capability.risk !== "PUBLIC_READ" ||
      capability.visibility !== "public"
    ) {
      continue;
    }

    for (const apiId of capability.linkedApis) {
      const api = apisById.get(apiId);
      if (api?.method === "GET") {
        candidates.push({ capability, api: api as ApiOperation & { method: "GET" } });
      }
    }
  }

  return candidates;
}

function toolName(capability: Capability): string {
  return capability.id
    .replace(/^capability:/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isJsonObjectSchema(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === "object"
  );
}

function isKnownPageOrigin(origin: string, analysis: StructuralAnalysis): boolean {
  return analysis.runtimePages.some((page) => page.origin === origin);
}
