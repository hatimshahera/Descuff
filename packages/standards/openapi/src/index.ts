import type { ApiOperation, ApplicationModel, EvidenceRef } from "@descuff/ir";
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

export const openApiAdapterId = "openapi";

const generatedPath = "openapi.json";
const supportedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

type SupportedMethod = (typeof supportedMethods)[number];

interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

interface OpenApiOperation {
  operationId: string;
  summary: string;
  responses: {
    "200": {
      description: string;
    };
  };
}

export class OpenApiAdapter implements StandardAdapter {
  readonly id = openApiAdapterId;

  async assess(model: ApplicationModel): Promise<StandardAssessment> {
    const existing = model.standards.filter((standard) => standard.kind === "openapi");
    const documentedApis = knownApiOperations(model.apis);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...existing.flatMap((standard) => standard.evidence),
      ...documentedApis.flatMap((api) => api.evidence)
    ]);

    return {
      standardId: this.id,
      applicability:
        existing.length > 0
          ? "implemented"
          : documentedApis.length > 0
            ? "recommended"
            : "not-applicable",
      evidence,
      rationale: [
        existing.length > 0
          ? "Existing OpenAPI evidence was detected."
          : "Known API operations can be described in an OpenAPI document."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "openapi-route-correspondence",
          description: "Validate OpenAPI syntax and correspondence with semantic API operations.",
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const apis = knownApiOperations(model.apis);

    return [
      {
        standardId: this.id,
        id: "openapi:document",
        kind: "create-file",
        path: generatedPath,
        content: `${JSON.stringify(renderOpenApiDocument(model, apis), null, 2)}\n`,
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(approvalGates),
        conflictPolicy: "approval-required",
        evidence: uniqueEvidence([
          ...model.project.evidence,
          ...apis.flatMap((api) => api.evidence)
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
        code: "OPENAPI_DOCUMENT_MISSING",
        severity: "error",
        message: "OpenAPI content was not provided for validation.",
        path: generatedPath,
        evidence: []
      });
      return validationResult(issues);
    }

    const document = parseOpenApiDocument(content, issues);
    if (document === undefined) {
      return validationResult(issues);
    }

    if (!document.openapi.startsWith("3.")) {
      issues.push({
        code: "OPENAPI_VERSION_UNSUPPORTED",
        severity: "error",
        message: `Unsupported OpenAPI version ${document.openapi}.`,
        path: generatedPath,
        evidence: []
      });
    }

    for (const api of knownApiOperations(context.model.apis)) {
      const pathItem = document.paths[api.path];
      const operation = pathItem?.[api.method.toLowerCase()];
      if (operation === undefined) {
        issues.push({
          code: "OPENAPI_OPERATION_MISSING",
          severity: "error",
          message: `OpenAPI document does not include ${api.method} ${api.path}.`,
          path: generatedPath,
          evidence: api.evidence
        });
      }
    }

    return validationResult(issues);
  }
}

export const openApiAdapter = new OpenApiAdapter();

function renderOpenApiDocument(model: ApplicationModel, apis: ApiOperation[]): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};

  for (const api of apis.sort(compareApis)) {
    const pathItem = (paths[api.path] ??= {});
    pathItem[api.method.toLowerCase()] = {
      operationId: operationId(api),
      summary: `${api.method} ${api.path}`,
      responses: {
        "200": {
          description: "Successful response"
        }
      }
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: projectTitle(model),
      version: "0.0.0"
    },
    paths
  };
}

function knownApiOperations(
  apis: ApiOperation[]
): Array<ApiOperation & { method: SupportedMethod }> {
  return apis.filter((api): api is ApiOperation & { method: SupportedMethod } =>
    supportedMethods.includes(api.method as SupportedMethod)
  );
}

function parseOpenApiDocument(
  content: string,
  issues: StandardValidationIssue[]
): OpenApiDocument | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<OpenApiDocument>;
    if (
      typeof parsed.openapi !== "string" ||
      typeof parsed.paths !== "object" ||
      parsed.paths === null
    ) {
      issues.push({
        code: "OPENAPI_DOCUMENT_INVALID",
        severity: "error",
        message: "OpenAPI document must include an openapi version and paths object.",
        path: generatedPath,
        evidence: []
      });
      return undefined;
    }

    return parsed as OpenApiDocument;
  } catch {
    issues.push({
      code: "OPENAPI_JSON_INVALID",
      severity: "error",
      message: "OpenAPI document is not valid JSON.",
      path: generatedPath,
      evidence: []
    });
    return undefined;
  }
}

function operationId(api: ApiOperation): string {
  return `${api.method.toLowerCase()}_${api.path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function compareApis(a: ApiOperation, b: ApiOperation): number {
  return a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path);
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
    standardId: openApiAdapterId,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
