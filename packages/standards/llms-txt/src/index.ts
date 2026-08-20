import type { ApplicationModel, Capability, EvidenceRef, Route } from "@descuff/ir";
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

export const llmsTxtAdapterId = "llms-txt";

const generatedPath = "public/llms.txt";

export class LlmsTxtAdapter implements StandardAdapter {
  readonly id = llmsTxtAdapterId;

  async assess(model: ApplicationModel): Promise<StandardAssessment> {
    const existing = findExistingLlmsTxt(model);
    const publicRoutes = model.routes.filter((route) => route.path !== "/api");
    const eligibleCapabilities = safeCapabilities(model.capabilities);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...existing.flatMap((standard) => standard.evidence),
      ...publicRoutes.flatMap((route) => route.evidence),
      ...eligibleCapabilities.flatMap((capability) => capability.evidence)
    ]);

    return {
      standardId: this.id,
      applicability:
        existing.length > 0
          ? "implemented"
          : publicRoutes.length > 0
            ? "recommended"
            : "not-applicable",
      evidence,
      rationale: [
        existing.length > 0
          ? "Existing llms.txt evidence was detected."
          : "A deterministic llms.txt can summarize public routes and safe read capabilities."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "llms-txt-structure",
          description: "Validate llms.txt heading, links, and route correspondence.",
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const evidence = uniqueEvidence([
      ...model.project.evidence,
      ...model.routes.flatMap((route) => route.evidence),
      ...safeCapabilities(model.capabilities).flatMap((capability) => capability.evidence)
    ]);

    return [
      {
        standardId: this.id,
        id: "llms-txt:public-summary",
        kind: "create-file",
        path: generatedPath,
        content: renderLlmsTxt(model),
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(
          createSensitiveCapabilityApprovalGates(model.capabilities)
        ),
        conflictPolicy: "approval-required",
        evidence
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
        code: "LLMS_TXT_MISSING",
        severity: "error",
        message: "llms.txt content was not provided for validation.",
        path: generatedPath,
        evidence: []
      });
      return validationResult(issues);
    }

    if (!content.startsWith("# ")) {
      issues.push({
        code: "LLMS_TXT_HEADING_MISSING",
        severity: "error",
        message: "llms.txt must start with an H1 heading.",
        path: generatedPath,
        evidence: []
      });
    }

    for (const route of publicPageRoutes(context.model.routes)) {
      if (!content.includes(`(${route.path})`)) {
        issues.push({
          code: "LLMS_TXT_ROUTE_MISSING",
          severity: "error",
          message: `llms.txt does not reference route ${route.path}.`,
          path: generatedPath,
          evidence: route.evidence
        });
      }
    }

    for (const line of content.split("\n")) {
      const linkMatch = /\[[^\]]+\]\(([^)]+)\)/.exec(line);
      if (linkMatch?.[1] !== undefined && !isKnownPublicRoute(linkMatch[1], context.model.routes)) {
        issues.push({
          code: "LLMS_TXT_UNKNOWN_ROUTE",
          severity: "error",
          message: `llms.txt references unknown route ${linkMatch[1]}.`,
          path: generatedPath,
          evidence: []
        });
      }
    }

    return validationResult(issues);
  }
}

export const llmsTxtAdapter = new LlmsTxtAdapter();

function renderLlmsTxt(model: ApplicationModel): string {
  const title = projectTitle(model);
  const routes = publicPageRoutes(model.routes);
  const capabilities = safeCapabilities(model.capabilities);
  const lines = [`# ${title}`, "", "> Agent-readable summary generated from Descuff evidence.", ""];

  if (routes.length > 0) {
    lines.push("## Routes", "");
    for (const route of routes) {
      lines.push(`- [${route.path}](${route.path}): ${route.sourceFile}`);
    }
    lines.push("");
  }

  if (capabilities.length > 0) {
    lines.push("## Capabilities", "");
    for (const capability of capabilities) {
      lines.push(`- ${capability.name}: ${capability.risk}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function publicPageRoutes(routes: Route[]): Route[] {
  return routes
    .filter((route) => !route.path.startsWith("/api"))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function safeCapabilities(capabilities: Capability[]): Capability[] {
  return capabilities
    .filter((capability) => capability.risk === "PUBLIC_READ")
    .sort((a, b) => a.id.localeCompare(b.id));
}

function findExistingLlmsTxt(model: ApplicationModel) {
  return model.standards.filter((standard) => standard.kind === "llms-txt");
}

function approvalGateToRiskNote(gate: ApprovalGate) {
  return {
    risk: gate.risk,
    capabilityId: gate.capabilityId,
    message: gate.message,
    evidence: gate.evidence
  };
}

function isKnownPublicRoute(path: string, routes: Route[]): boolean {
  return publicPageRoutes(routes).some((route) => route.path === path);
}

function projectTitle(model: ApplicationModel): string {
  const lastSegment = model.project.rootDir.split("/").filter(Boolean).at(-1);
  return lastSegment === undefined ? "Application" : titleCase(lastSegment);
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
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

function validationResult(issues: StandardValidationIssue[]): StandardValidationResult {
  return {
    standardId: llmsTxtAdapterId,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
