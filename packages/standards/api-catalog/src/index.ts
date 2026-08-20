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

export const apiCatalogAdapterId = "api-catalog";

const generatedPath = "public/.well-known/api-catalog";
const openApiHref = "/openapi.json";
const supportedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

type SupportedMethod = (typeof supportedMethods)[number];

interface ApiCatalogDocument {
  linkset: ApiCatalogLinkset[];
}

interface ApiCatalogLinkset {
  anchor: string;
  "service-desc": ApiCatalogLink[];
}

interface ApiCatalogLink {
  href: string;
  type: string;
  title: string;
}

export class ApiCatalogAdapter implements StandardAdapter {
  readonly id = apiCatalogAdapterId;

  async assess(model: ApplicationModel): Promise<StandardAssessment> {
    const existing = model.standards.filter((standard) => standard.kind === "api-catalog");
    const apiOperations = knownApiOperations(model.apis);
    const openApiEvidence = model.standards
      .filter((standard) => standard.kind === "openapi")
      .flatMap((standard) => standard.evidence);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...existing.flatMap((standard) => standard.evidence),
      ...openApiEvidence,
      ...apiOperations.flatMap((api) => api.evidence)
    ]);

    return {
      standardId: this.id,
      applicability:
        existing.length > 0
          ? "implemented"
          : apiOperations.length > 0
            ? "recommended"
            : "not-applicable",
      evidence,
      rationale: [
        existing.length > 0
          ? "Existing API Catalog evidence was detected."
          : "Known API operations can be advertised through an API Catalog linkset."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "api-catalog-linkset",
          description: "Validate API Catalog Linkset JSON and OpenAPI service description link.",
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const apiOperations = knownApiOperations(model.apis);

    return [
      {
        standardId: this.id,
        id: "api-catalog:linkset",
        kind: "create-file",
        path: generatedPath,
        content: `${JSON.stringify(renderApiCatalogDocument(), null, 2)}\n`,
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(approvalGates),
        conflictPolicy: "approval-required",
        evidence: uniqueEvidence([
          ...model.project.evidence,
          ...model.standards
            .filter((standard) => standard.kind === "openapi")
            .flatMap((standard) => standard.evidence),
          ...apiOperations.flatMap((api) => api.evidence)
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
        code: "API_CATALOG_MISSING",
        severity: "error",
        message: "API Catalog content was not provided for validation.",
        path: generatedPath,
        evidence: []
      });
      return validationResult(issues);
    }

    const document = parseApiCatalogDocument(content, issues);
    if (document === undefined) {
      return validationResult(issues);
    }

    const serviceLinks = document.linkset.flatMap((linkset) => linkset["service-desc"]);
    if (knownApiOperations(context.model.apis).length > 0 && serviceLinks.length === 0) {
      issues.push({
        code: "API_CATALOG_SERVICE_DESCRIPTION_MISSING",
        severity: "error",
        message: "API Catalog must include a service-desc link for API-bearing applications.",
        path: generatedPath,
        evidence: context.model.apis.flatMap((api) => api.evidence)
      });
    }

    if (!serviceLinks.some((link) => link.href === openApiHref)) {
      issues.push({
        code: "API_CATALOG_OPENAPI_LINK_MISSING",
        severity: "error",
        message: `API Catalog must link to ${openApiHref}.`,
        path: generatedPath,
        evidence: []
      });
    }

    return validationResult(issues);
  }
}

export const apiCatalogAdapter = new ApiCatalogAdapter();

function renderApiCatalogDocument(): ApiCatalogDocument {
  return {
    linkset: [
      {
        anchor: "/",
        "service-desc": [
          {
            href: openApiHref,
            type: "application/openapi+json",
            title: "OpenAPI description"
          }
        ]
      }
    ]
  };
}

function knownApiOperations(
  apis: ApiOperation[]
): Array<ApiOperation & { method: SupportedMethod }> {
  return apis.filter((api): api is ApiOperation & { method: SupportedMethod } =>
    supportedMethods.includes(api.method as SupportedMethod)
  );
}

function parseApiCatalogDocument(
  content: string,
  issues: StandardValidationIssue[]
): ApiCatalogDocument | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<ApiCatalogDocument>;
    if (!Array.isArray(parsed.linkset) || !parsed.linkset.every(isApiCatalogLinkset)) {
      issues.push({
        code: "API_CATALOG_LINKSET_INVALID",
        severity: "error",
        message: "API Catalog must be Linkset JSON with service-desc links.",
        path: generatedPath,
        evidence: []
      });
      return undefined;
    }

    return parsed as ApiCatalogDocument;
  } catch {
    issues.push({
      code: "API_CATALOG_JSON_INVALID",
      severity: "error",
      message: "API Catalog document is not valid JSON.",
      path: generatedPath,
      evidence: []
    });
    return undefined;
  }
}

function isApiCatalogLinkset(value: unknown): value is ApiCatalogLinkset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const linkset = value as Partial<ApiCatalogLinkset>;
  return (
    typeof linkset.anchor === "string" &&
    Array.isArray(linkset["service-desc"]) &&
    linkset["service-desc"].every(isApiCatalogLink)
  );
}

function isApiCatalogLink(value: unknown): value is ApiCatalogLink {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const link = value as Partial<ApiCatalogLink>;
  return (
    typeof link.href === "string" && typeof link.type === "string" && typeof link.title === "string"
  );
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
    standardId: apiCatalogAdapterId,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
