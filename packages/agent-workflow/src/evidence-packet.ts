import type {
  ApplicationModel,
  CapabilityRisk,
  CapabilityVisibility,
  EvidenceRef
} from "@descuff/ir";

export const skillEvidencePacketSchemaVersion = "0.1.0";

export interface SkillEvidencePacket {
  schemaVersion: string;
  projectRoot: string;
  generatedAt: string;
  deterministicSummary: SkillDeterministicSummary;
  routes: SkillRouteEvidence[];
  apis: SkillApiEvidence[];
  capabilities: SkillCapabilityEvidence[];
  authBoundaries: SkillAuthBoundaryEvidence[];
  standards: SkillStandardEvidence[];
  validationIssues: SkillValidationIssueEvidence[];
  evidence: EvidenceRef[];
}

export interface SkillDeterministicSummary {
  applicationType: string;
  applicationTypeConfidence: string;
  routeCount: number;
  apiCount: number;
  capabilityCount: number;
  standardCount: number;
}

export interface SkillRouteEvidence {
  id: string;
  path: string;
  routerKind: string;
  sourceFile: string;
  visibility: string;
  runtimeObserved: boolean;
  evidenceIds: string[];
}

export interface SkillApiEvidence {
  id: string;
  method: string;
  path: string;
  sourceFile: string;
  sideEffect: string;
  runtimeObserved: boolean;
  evidenceIds: string[];
}

export interface SkillCapabilityEvidence {
  id: string;
  name: string;
  operationType: "read" | "write";
  risk: CapabilityRisk;
  visibility: CapabilityVisibility;
  confidence: string;
  linkedRoutes: string[];
  linkedApis: string[];
  evidenceIds: string[];
}

export interface SkillAuthBoundaryEvidence {
  id: string;
  kind: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface SkillStandardEvidence {
  id: string;
  kind: string;
  sourceFile: string;
  evidenceIds: string[];
}

export interface SkillValidationIssueEvidence {
  code: string;
  severity: string;
  message: string;
  evidenceIds: string[];
}

export interface BuildSkillEvidencePacketInput {
  model: ApplicationModel;
  generatedAt?: string;
  validationIssues?: SkillValidationIssueEvidence[];
}

export function buildSkillEvidencePacket(
  input: BuildSkillEvidencePacketInput
): SkillEvidencePacket {
  const { model } = input;

  return {
    schemaVersion: skillEvidencePacketSchemaVersion,
    projectRoot: model.project.rootDir,
    generatedAt: input.generatedAt ?? "1970-01-01T00:00:00.000Z",
    deterministicSummary: {
      applicationType: model.applicationType.type,
      applicationTypeConfidence: model.applicationType.confidence,
      routeCount: model.routes.length,
      apiCount: model.apis.length,
      capabilityCount: model.capabilities.length,
      standardCount: model.standards.length
    },
    routes: model.routes.map((route) => ({
      id: route.id,
      path: route.path,
      routerKind: route.routerKind,
      sourceFile: route.sourceFile,
      visibility: route.visibility ?? "unknown",
      runtimeObserved: route.runtimeObserved,
      evidenceIds: evidenceIds(route.evidence)
    })),
    apis: model.apis.map((api) => ({
      id: api.id,
      method: api.method,
      path: api.path,
      sourceFile: api.sourceFile,
      sideEffect: api.sideEffect,
      runtimeObserved: api.runtimeObserved,
      evidenceIds: evidenceIds(api.evidence)
    })),
    capabilities: model.capabilities.map((capability) => ({
      id: capability.id,
      name: capability.name,
      operationType: capability.operationType,
      risk: capability.risk,
      visibility: capability.visibility,
      confidence: capability.confidence,
      linkedRoutes: capability.linkedRoutes,
      linkedApis: capability.linkedApis,
      evidenceIds: evidenceIds(capability.evidence)
    })),
    authBoundaries: model.authentication.boundaries.map((boundary) => ({
      id: boundary.id,
      kind: boundary.kind,
      sourceFile: boundary.sourceFile,
      evidenceIds: evidenceIds(boundary.evidence)
    })),
    standards: model.standards.map((standard) => ({
      id: standard.id,
      kind: standard.kind,
      sourceFile: standard.sourceFile,
      evidenceIds: evidenceIds(standard.evidence)
    })),
    validationIssues: input.validationIssues ?? [],
    evidence: model.evidence.items
  };
}

export function renderSkillEvidencePacket(packet: SkillEvidencePacket): string {
  const lines = [
    "# Descuff Skill Evidence Packet",
    "",
    `Schema version: ${packet.schemaVersion}`,
    `Project root: ${packet.projectRoot}`,
    `Generated at: ${packet.generatedAt}`,
    "",
    "## Deterministic Summary",
    "",
    `- Application type: ${packet.deterministicSummary.applicationType} (${packet.deterministicSummary.applicationTypeConfidence})`,
    `- Routes: ${packet.deterministicSummary.routeCount}`,
    `- APIs: ${packet.deterministicSummary.apiCount}`,
    `- Capabilities: ${packet.deterministicSummary.capabilityCount}`,
    `- Standards: ${packet.deterministicSummary.standardCount}`,
    "",
    "## Capabilities",
    ""
  ];

  if (packet.capabilities.length === 0) {
    lines.push("No capabilities detected.", "");
  } else {
    for (const capability of packet.capabilities) {
      lines.push(
        `- ${capability.id}: ${capability.name} (${capability.operationType}, ${capability.risk}, ${capability.visibility}, ${capability.confidence})`
      );
      lines.push(`  Evidence: ${capability.evidenceIds.join(", ") || "none"}`);
    }
    lines.push("");
  }

  lines.push("## Routes", "");
  for (const route of packet.routes) {
    lines.push(`- ${route.id}: ${route.path} (${route.routerKind}, ${route.visibility})`);
  }
  if (packet.routes.length === 0) {
    lines.push("No routes detected.");
  }
  lines.push("");

  lines.push("## APIs", "");
  for (const api of packet.apis) {
    lines.push(`- ${api.id}: ${api.method} ${api.path} (${api.sideEffect})`);
  }
  if (packet.apis.length === 0) {
    lines.push("No APIs detected.");
  }
  lines.push("");

  lines.push("## Validation Issues", "");
  if (packet.validationIssues.length === 0) {
    lines.push("No validation issues supplied.", "");
  } else {
    for (const issue of packet.validationIssues) {
      lines.push(`- ${issue.code} (${issue.severity}): ${issue.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function evidenceIdSet(packet: SkillEvidencePacket): Set<string> {
  return new Set(packet.evidence.map((evidence) => evidence.id));
}

function evidenceIds(evidence: EvidenceRef[]): string[] {
  return evidence.map((ref) => ref.id);
}
