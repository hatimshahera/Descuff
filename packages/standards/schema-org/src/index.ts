import type { ApplicationModel, Entity, EvidenceRef, Route } from "@descuff/ir";
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

export const schemaOrgAdapterId = "schema-org";

const generatedPath = "schema-org.jsonld";

interface JsonLdNode {
  "@id": string;
  "@type": string;
  name: string;
  url?: string;
}

interface SchemaOrgDocument {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

export class SchemaOrgAdapter implements StandardAdapter {
  readonly id = schemaOrgAdapterId;

  async assess(model: ApplicationModel): Promise<StandardAssessment> {
    const existing = model.standards.filter((standard) => standard.kind === "schema-org");
    const structuredEntities = model.entities;
    const publicRoutes = publicPageRoutes(model.routes);
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);
    const evidence = uniqueEvidence([
      ...existing.flatMap((standard) => standard.evidence),
      ...structuredEntities.flatMap((entity) => entity.evidence),
      ...publicRoutes.flatMap((route) => route.evidence)
    ]);

    return {
      standardId: this.id,
      applicability:
        existing.length > 0
          ? "implemented"
          : structuredEntities.length > 0 || publicRoutes.length > 0
            ? "recommended"
            : "not-applicable",
      evidence,
      rationale: [
        existing.length > 0
          ? "Existing Schema.org JSON-LD evidence was detected."
          : "Public routes and semantic entities can be described with JSON-LD."
      ],
      riskNotes: approvalGates.map(approvalGateToRiskNote),
      generatedChangeEligibility: generatedChangeSafetyForApprovalGates(approvalGates),
      validationRequirements: [
        {
          id: "schema-org-json-ld",
          description: "Validate JSON-LD syntax, known node types, and route/entity correlation.",
          evidence
        }
      ]
    };
  }

  async generate(model: ApplicationModel): Promise<GeneratedChange[]> {
    const approvalGates = createSensitiveCapabilityApprovalGates(model.capabilities);

    return [
      {
        standardId: this.id,
        id: "schema-org:jsonld",
        kind: "create-file",
        path: generatedPath,
        content: `${JSON.stringify(renderSchemaOrgDocument(model), null, 2)}\n`,
        deterministic: true,
        safety: generatedChangeSafetyForApprovalGates(approvalGates),
        conflictPolicy: "approval-required",
        evidence: uniqueEvidence([
          ...model.project.evidence,
          ...model.entities.flatMap((entity) => entity.evidence),
          ...publicPageRoutes(model.routes).flatMap((route) => route.evidence)
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
        code: "SCHEMA_ORG_DOCUMENT_MISSING",
        severity: "error",
        message: "Schema.org JSON-LD content was not provided for validation.",
        path: generatedPath,
        evidence: []
      });
      return validationResult(issues);
    }

    const document = parseSchemaOrgDocument(content, issues);
    if (document === undefined) {
      return validationResult(issues);
    }

    for (const route of publicPageRoutes(context.model.routes)) {
      if (!document["@graph"].some((node) => node.url === route.path)) {
        issues.push({
          code: "SCHEMA_ORG_ROUTE_MISSING",
          severity: "error",
          message: `Schema.org JSON-LD does not include route ${route.path}.`,
          path: generatedPath,
          evidence: route.evidence
        });
      }
    }

    for (const entity of context.model.entities) {
      if (!document["@graph"].some((node) => node["@id"] === entityNodeId(entity))) {
        issues.push({
          code: "SCHEMA_ORG_ENTITY_MISSING",
          severity: "error",
          message: `Schema.org JSON-LD does not include entity ${entity.name}.`,
          path: generatedPath,
          evidence: entity.evidence
        });
      }
    }

    return validationResult(issues);
  }
}

export const schemaOrgAdapter = new SchemaOrgAdapter();

function renderSchemaOrgDocument(model: ApplicationModel): SchemaOrgDocument {
  const nodes: JsonLdNode[] = [
    {
      "@id": "#application",
      "@type": applicationSchemaType(model),
      name: projectTitle(model)
    }
  ];

  for (const route of publicPageRoutes(model.routes)) {
    nodes.push({
      "@id": `#route:${route.path}`,
      "@type": "WebPage",
      name: route.path,
      url: route.path
    });
  }

  for (const entity of [...model.entities].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push({
      "@id": entityNodeId(entity),
      "@type": entitySchemaType(entity),
      name: entity.name
    });
  }

  return {
    "@context": "https://schema.org",
    "@graph": nodes
  };
}

function parseSchemaOrgDocument(
  content: string,
  issues: StandardValidationIssue[]
): SchemaOrgDocument | undefined {
  try {
    const parsed = JSON.parse(content) as Partial<SchemaOrgDocument>;
    if (
      parsed["@context"] !== "https://schema.org" ||
      !Array.isArray(parsed["@graph"]) ||
      !parsed["@graph"].every(isJsonLdNode)
    ) {
      issues.push({
        code: "SCHEMA_ORG_JSON_LD_INVALID",
        severity: "error",
        message: "Schema.org document must include https://schema.org context and graph nodes.",
        path: generatedPath,
        evidence: []
      });
      return undefined;
    }

    return parsed as SchemaOrgDocument;
  } catch {
    issues.push({
      code: "SCHEMA_ORG_JSON_INVALID",
      severity: "error",
      message: "Schema.org JSON-LD document is not valid JSON.",
      path: generatedPath,
      evidence: []
    });
    return undefined;
  }
}

function publicPageRoutes(routes: Route[]): Route[] {
  return routes
    .filter((route) => !route.path.startsWith("/api"))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function applicationSchemaType(model: ApplicationModel): string {
  switch (model.applicationType.type) {
    case "ecommerce":
      return "Store";
    case "content":
      return "WebSite";
    case "booking":
      return "LocalBusiness";
    case "saas":
      return "SoftwareApplication";
    case "unknown":
      return "WebSite";
  }
}

function entitySchemaType(entity: Entity): string {
  switch (entity.kind.toLowerCase()) {
    case "product":
      return "Product";
    case "article":
      return "Article";
    case "person":
    case "user":
      return "Person";
    case "organization":
    case "team":
      return "Organization";
    default:
      return "Thing";
  }
}

function entityNodeId(entity: Entity): string {
  return `#entity:${entity.id.replace(/[^a-zA-Z0-9:_-]+/g, "_")}`;
}

function isJsonLdNode(value: unknown): value is JsonLdNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const node = value as Partial<JsonLdNode>;
  return (
    typeof node["@id"] === "string" &&
    typeof node["@type"] === "string" &&
    typeof node.name === "string" &&
    (node.url === undefined || typeof node.url === "string")
  );
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
    standardId: schemaOrgAdapterId,
    valid: issues.every((issue) => issue.severity !== "error"),
    issues
  };
}
