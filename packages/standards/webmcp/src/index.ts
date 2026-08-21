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
const implementationPlanPath = ".descuff/webmcp-implementation-plan.md";

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
    const metadataOnly = model.standards.filter((standard) => standard.kind === "webmcp");
    const publicReadTools = publicReadToolCandidates(model);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...metadataOnly.flatMap((standard) => standard.evidence),
      ...publicReadTools.flatMap((candidate) => [
        ...candidate.capability.evidence,
        ...candidate.api.evidence
      ])
    ]);

    return {
      standardId: this.id,
      applicability: publicReadTools.length > 0 ? "recommended" : "not-applicable",
      evidence,
      rationale: [
        metadataOnly.length > 0
          ? "Existing WebMCP metadata was detected, but metadata-only files do not prove browser tool registration."
          : "Only public read GET capabilities are eligible for WebMCP planning.",
        "Real WebMCP implementation requires browser registration through document.modelContext.registerTool(...), discovered through a runtime compatibility layer."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "webmcp-browser-registration",
          description:
            "Validate that planned tools are registered in the browser with document.modelContext and discoverable through WebMCP runtime analysis.",
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const publicReadTools = publicReadToolCandidates(model);

    const evidence = uniqueEvidence([
      ...model.project.evidence,
      ...publicReadTools.flatMap((candidate) => [
        ...candidate.capability.evidence,
        ...candidate.api.evidence
      ])
    ]);

    return [
      {
        standardId: this.id,
        id: "webmcp:implementation-plan",
        kind: "companion-file",
        path: implementationPlanPath,
        content: renderWebMcpImplementationPlan(model, publicReadTools),
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(approvalGates),
        conflictPolicy: "companion-file",
        evidence
      }
    ];
  }

  async validate(context: StandardValidationContext): Promise<StandardValidationResult> {
    const issues: StandardValidationIssue[] = [];
    const content =
      context.existingFiles?.get(generatedPath) ??
      context.generatedChanges.find(
        (change) => change.standardId === this.id && change.path === generatedPath
      )?.content;

    if (content === undefined) {
      return validationResult(issues);
    }

    const manifest = parseWebMcpManifest(content, issues);
    if (manifest === undefined) {
      return validationResult(issues);
    }

    issues.push({
      code: "WEBMCP_METADATA_ONLY",
      severity: "warning",
      message:
        "WebMCP metadata is planning evidence only; browser registration must be validated with runtime WebMCP discovery.",
      path: generatedPath,
      evidence: []
    });

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

function renderWebMcpImplementationPlan(
  model: ApplicationModel,
  candidates: WebMcpToolCandidate[]
): string {
  const lines = [
    "# WebMCP Implementation Plan",
    "",
    "This file is a coding-agent implementation aid. It is not proof of WebMCP support.",
    "",
    "Real WebMCP support requires browser tool registration through `document.modelContext.registerTool(...)` and runtime discovery through Descuff's WebMCP compatibility layer.",
    "",
    ...renderFrameworkGuidance(model),
    "",
    "## Tools",
    ""
  ];

  if (candidates.length === 0) {
    lines.push("No public read GET capabilities are eligible for WebMCP registration.", "");
    return lines.join("\n");
  }

  for (const candidate of candidates.sort(compareCandidates)) {
    const name = toolName(candidate.capability);
    lines.push(`### ${name}`, "");
    lines.push(`- Capability: ${candidate.capability.name}`);
    lines.push(`- API: GET ${candidate.api.path}`);
    lines.push("- Risk: PUBLIC_READ");
    lines.push("- Required registration fields:");
    lines.push(`  - name: \`${name}\``);
    lines.push(`  - description: ${candidate.capability.name}`);
    lines.push("  - inputSchema: JSON-compatible object schema");
    lines.push("  - execute: read-only function that preserves existing auth and data boundaries");
    lines.push("  - annotations: include read-only intent, such as `readOnlyHint: true`");
    lines.push("- Validation:");
    lines.push("  - load a browser page where the tool is registered");
    lines.push("  - discover it through the WebMCP runtime abstraction");
    lines.push("  - validate schema, annotations, origin, and linked capability");
    lines.push("  - execute only with scenario-approved safe inputs");
    lines.push("");
  }

  return lines.join("\n");
}

function renderFrameworkGuidance(model: ApplicationModel): string[] {
  if (model.project.framework !== "nextjs") {
    return [
      "## Framework Guidance",
      "",
      "Descuff did not detect a supported framework-specific integration path.",
      "",
      "- Register WebMCP tools from browser-executed code only.",
      "- Feature-detect `document.modelContext` before registering tools.",
      "- Keep route handlers, server-rendered code, and build-time code free of direct browser global access.",
      "- Preserve existing UI and behavior; the integration should be non-visual unless the application already exposes agent settings."
    ];
  }

  const routerKinds = new Set(model.routes.map((route) => route.routerKind));
  const hasAppRouter = routerKinds.has("next-app");
  const hasPagesRouter = routerKinds.has("next-pages");
  const lines = [
    "## Framework Guidance",
    "",
    "Detected framework: Next.js.",
    "",
    "- Register WebMCP tools from browser-executed client code only.",
    "- Feature-detect `document.modelContext` before calling `registerTool(...)`.",
    "- Do not call `document.modelContext` from route handlers, Server Components, metadata functions, or build-time code.",
    "- Keep the registration component non-visual unless the application already has an agent settings surface.",
    "- Keep each `execute` function read-only and backed by the existing public GET endpoint listed below.",
    "- Preserve existing auth, caching, rate-limit, and data exposure boundaries."
  ];

  if (hasAppRouter) {
    lines.push(
      "- App Router: add a small `'use client'` component, for example `app/_agent/WebMcpTools.tsx`, and mount it from the narrowest relevant layout or page."
    );
  }

  if (hasPagesRouter) {
    lines.push(
      "- Pages Router: add a browser-only component and mount it from the relevant page or `pages/_app.tsx` only if the tools should be globally available."
    );
  }

  if (!hasAppRouter && !hasPagesRouter) {
    lines.push(
      "- Router kind was not detected. Locate the browser-rendered entry point first, then mount a small client-side registration component there."
    );
  }

  return lines;
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
