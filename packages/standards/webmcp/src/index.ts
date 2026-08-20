import type { ApiOperation, ApplicationModel, Capability, EvidenceRef } from "@descuff/ir";
import {
  createSensitiveCapabilityApprovalGates,
  generatedChangeSafetyForApprovalGates
} from "@descuff/standard-core";
import type {
  ApprovalGate,
  GeneratedChange,
  StandardAdapter,
  StandardAssessment,
  StandardValidationContext,
  StandardValidationIssue,
  StandardValidationResult
} from "@descuff/standard-core";

export const webMcpAdapterId = "webmcp";
export const supportedWebMcpDraft = "webmcp-draft-2026-08";

const generatedPath = "public/webmcp.json";

interface WebMcpManifest {
  draft: typeof supportedWebMcpDraft;
  tools: WebMcpTool[];
}

interface WebMcpTool {
  name: string;
  description: string;
  method: "GET";
  path: string;
  risk: "PUBLIC_READ";
}

export class WebMcpAdapter implements StandardAdapter {
  readonly id = webMcpAdapterId;

  async assess(model: ApplicationModel): Promise<StandardAssessment> {
    const existing = model.standards.filter((standard) => standard.kind === "webmcp");
    const publicReadTools = publicReadToolCandidates(model);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...existing.flatMap((standard) => standard.evidence),
      ...publicReadTools.flatMap((candidate) => [
        ...candidate.capability.evidence,
        ...candidate.api.evidence
      ])
    ]);

    return {
      standardId: this.id,
      applicability:
        existing.length > 0
          ? "implemented"
          : publicReadTools.length > 0
            ? "recommended"
            : "not-applicable",
      evidence,
      rationale: [
        existing.length > 0
          ? "Existing WebMCP evidence was detected."
          : "Only public read GET capabilities are eligible for the supported WebMCP draft."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "webmcp-supported-draft",
          description: `Validate WebMCP manifest against supported draft ${supportedWebMcpDraft}.`,
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const publicReadTools = publicReadToolCandidates(model);

    return [
      {
        standardId: this.id,
        id: "webmcp:manifest",
        kind: "create-file",
        path: generatedPath,
        content: `${JSON.stringify(renderWebMcpManifest(publicReadTools), null, 2)}\n`,
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(approvalGates),
        conflictPolicy: "approval-required",
        evidence: uniqueEvidence([
          ...model.project.evidence,
          ...publicReadTools.flatMap((candidate) => [
            ...candidate.capability.evidence,
            ...candidate.api.evidence
          ])
        ])
      }
    ];
  }

  async validate(context: StandardValidationContext): Promise<StandardValidationResult> {
    const issues: StandardValidationIssue[] = [];
    const content =
      context.generatedChanges.find(
        (change) => change.standardId === this.id && change.path === generatedPath
      )?.content ?? context.existingFiles?.get(generatedPath);

    if (content === undefined) {
      issues.push({
        code: "WEBMCP_MANIFEST_MISSING",
        severity: "error",
        message: "WebMCP manifest content was not provided for validation.",
        path: generatedPath,
        evidence: []
      });
      return validationResult(issues);
    }

    const manifest = parseWebMcpManifest(content, issues);
    if (manifest === undefined) {
      return validationResult(issues);
    }

    if (manifest.draft !== supportedWebMcpDraft) {
      issues.push({
        code: "WEBMCP_DRAFT_UNSUPPORTED",
        severity: "error",
        message: `WebMCP manifest must use supported draft ${supportedWebMcpDraft}.`,
        path: generatedPath,
        evidence: []
      });
    }

    const eligiblePaths = new Set(
      publicReadToolCandidates(context.model).map((candidate) => candidate.api.path)
    );
    for (const tool of manifest.tools) {
      if (!eligiblePaths.has(tool.path)) {
        issues.push({
          code: "WEBMCP_TOOL_NOT_PUBLIC_READ",
          severity: "error",
          message: `WebMCP tool ${tool.name} does not map to an eligible public read API.`,
          path: generatedPath,
          evidence: []
        });
      }
    }

    return validationResult(issues);
  }
}

export const webMcpAdapter = new WebMcpAdapter();

function renderWebMcpManifest(candidates: WebMcpToolCandidate[]): WebMcpManifest {
  return {
    draft: supportedWebMcpDraft,
    tools: candidates.sort(compareCandidates).map((candidate) => ({
      name: toolName(candidate.capability),
      description: candidate.capability.name,
      method: "GET",
      path: candidate.api.path,
      risk: "PUBLIC_READ"
    }))
  };
}

interface WebMcpToolCandidate {
  capability: Capability;
  api: ApiOperation & { method: "GET" };
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

function parseWebMcpManifest(
  content: string,
  issues: StandardValidationIssue[]
): WebMcpManifest | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<WebMcpManifest>;
    if (
      typeof parsed.draft !== "string" ||
      !Array.isArray(parsed.tools) ||
      !parsed.tools.every(isWebMcpTool)
    ) {
      issues.push({
        code: "WEBMCP_MANIFEST_INVALID",
        severity: "error",
        message: "WebMCP manifest must include a draft string and valid tools.",
        path: generatedPath,
        evidence: []
      });
      return undefined;
    }

    return parsed as WebMcpManifest;
  } catch {
    issues.push({
      code: "WEBMCP_JSON_INVALID",
      severity: "error",
      message: "WebMCP manifest is not valid JSON.",
      path: generatedPath,
      evidence: []
    });
    return undefined;
  }
}

function isWebMcpTool(value: unknown): value is WebMcpTool {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const tool = value as Partial<WebMcpTool>;
  return (
    typeof tool.name === "string" &&
    typeof tool.description === "string" &&
    tool.method === "GET" &&
    typeof tool.path === "string" &&
    tool.risk === "PUBLIC_READ"
  );
}

function compareCandidates(a: WebMcpToolCandidate, b: WebMcpToolCandidate): number {
  return a.api.path === b.api.path
    ? a.capability.id.localeCompare(b.capability.id)
    : a.api.path.localeCompare(b.api.path);
}

function toolName(capability: Capability): string {
  return capability.id
    .replace(/^capability:/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function uniqueEvidence(evidence: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return evidence.filter((ref) => {
    if (seen.has(ref.id)) {
      return false;
    }
    seen.add(ref.id);
    return true;
  });
}

function approvalGateToRiskNote(gate: ApprovalGate) {
  return {
    risk: gate.risk,
    capabilityId: gate.capabilityId,
    message: gate.message,
    evidence: gate.evidence
  };
}

function validationResult(issues: StandardValidationIssue[]): StandardValidationResult {
  return {
    standardId: webMcpAdapterId,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
