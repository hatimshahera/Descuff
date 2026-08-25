import type { Confidence, EvidenceIndex, EvidenceRef } from "./evidence.js";
import type {
  HttpMethod,
  RouterKind,
  RouteVisibility,
  StandardKind
} from "./structural-analysis.js";

export const applicationModelSchemaVersion = "0.1.0";

export type ApplicationType = "ecommerce" | "saas" | "content" | "booking" | "unknown";

export type CapabilityRisk =
  "PUBLIC_READ" | "AUTHENTICATED_READ" | "LOW_RISK_WRITE" | "SENSITIVE_WRITE" | "HIGH_CONSEQUENCE";

export type CapabilityVisibility = "public" | "authenticated" | "admin" | "unknown";

export interface ProjectMetadata {
  rootDir: string;
  framework: "nextjs" | "unknown";
  evidence: EvidenceRef[];
}

export interface ApplicationTypeAssessment {
  type: ApplicationType;
  confidence: Confidence;
  evidence: EvidenceRef[];
}

export interface DomainProfile {
  summary: string;
  primaryDomain: string;
  domains: string[];
  confidence: Confidence;
  evidence: EvidenceRef[];
  migrationSource: "applicationType" | "semantic-enrichment";
}

export interface EntityProperty {
  name: string;
  type: string;
  evidence: EvidenceRef[];
}

export interface EntityRelationship {
  from: string;
  to: string;
  relationship: string;
  evidence: EvidenceRef[];
}

export interface Entity {
  id: string;
  name: string;
  kind: string;
  properties: EntityProperty[];
  relationships: EntityRelationship[];
  evidence: EvidenceRef[];
}

export interface Capability {
  id: string;
  name: string;
  operationType: "read" | "write";
  risk: CapabilityRisk;
  visibility: CapabilityVisibility;
  inputs: CapabilityField[];
  outputs: CapabilityField[];
  linkedRoutes: string[];
  linkedApis: string[];
  evidence: EvidenceRef[];
  confidence: Confidence;
}

export interface CapabilityField {
  name: string;
  type: string;
  required: boolean;
}

export interface Route {
  id: string;
  path: string;
  routerKind: RouterKind;
  sourceFile: string;
  visibility?: RouteVisibility;
  runtimeObserved: boolean;
  evidence: EvidenceRef[];
}

export interface ApiOperation {
  id: string;
  path: string;
  method: HttpMethod;
  sourceFile: string;
  runtimeObserved: boolean;
  sideEffect: "read" | "write" | "unknown";
  evidence: EvidenceRef[];
}

export interface AuthenticationModel {
  boundaries: AuthenticationBoundaryModel[];
  evidence: EvidenceRef[];
}

export interface AuthenticationBoundaryModel {
  id: string;
  kind: "middleware" | "proxy" | "route-handler";
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface Integration {
  id: string;
  name: string;
  evidence: EvidenceRef[];
}

export interface ExistingStandardModel {
  id: string;
  kind: StandardKind;
  sourceFile: string;
  evidence: EvidenceRef[];
}

export interface ApplicationModel {
  schemaVersion: string;
  project: ProjectMetadata;
  applicationType: ApplicationTypeAssessment;
  domainProfile: DomainProfile;
  entities: Entity[];
  capabilities: Capability[];
  routes: Route[];
  apis: ApiOperation[];
  authentication: AuthenticationModel;
  integrations: Integration[];
  standards: ExistingStandardModel[];
  evidence: EvidenceIndex;
}
