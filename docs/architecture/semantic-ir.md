# Semantic IR

Descuff owns a stable intermediate representation that all analyzers and standard adapters use. The IR is the boundary between evidence collection, semantic reasoning, planning, generation, validation, and reporting.

## Goals

- Preserve provenance for every important conclusion.
- Keep analyzer-specific formats outside the core product.
- Make standard generation deterministic where possible.
- Allow future framework and standard adapters without redesigning the model.
- Represent uncertainty explicitly instead of storing unexplained guesses as facts.
- Keep raw evidence and semantic conclusions separate.

## Evidence And Semantic Boundary

Phase 1 defines minimal versioned evidence and `StructuralAnalysis` contracts. Phase 2 analyzers populate those contracts. Phase 3 transforms evidence-backed structural analysis into the semantic `ApplicationModel`.

This avoids forcing the deterministic analyzer to design the full semantic IR before real extraction behavior exists.

## Core Model

```ts
interface ApplicationModel {
  schemaVersion: string;
  project: ProjectMetadata;
  applicationType: ApplicationTypeAssessment;
  entities: Entity[];
  capabilities: Capability[];
  routes: Route[];
  apis: ApiOperation[];
  authentication: AuthenticationModel;
  integrations: Integration[];
  standards: ExistingStandard[];
  evidence: EvidenceIndex;
}
```

## Evidence

Evidence is a first-class part of the IR. An entity, route, capability, API operation, authentication boundary, or standards recommendation must reference concrete evidence.

```ts
interface EvidenceRef {
  id: string;
  kind: "source" | "runtime" | "config" | "test" | "generated";
  location: string;
  observedAt?: string;
  confidence: "high" | "medium" | "low";
  summary: string;
}
```

`observedAt` values must be normalized or excluded from golden snapshots so tests remain deterministic.

Evidence can come from:

- source files and AST symbols
- rendered routes
- accessibility tree snapshots
- network requests
- API responses
- configured routes and middleware
- existing metadata files
- validation tests

## Entities

Entities describe domain objects such as products, orders, users, bookings, articles, teams, invoices, subscriptions, or locations.

```ts
interface Entity {
  id: string;
  name: string;
  kind: string;
  properties: EntityProperty[];
  relationships: EntityRelationship[];
  evidence: EvidenceRef[];
}
```

Entity extraction must prefer deterministic facts: schemas, database models, validation objects, TypeScript types, API response shapes, and route data dependencies.

## Capabilities

Capabilities describe what users or agents can do.

```ts
interface Capability {
  id: string;
  name: string;
  operationType: "read" | "write";
  risk: CapabilityRisk;
  visibility: "public" | "authenticated" | "admin" | "unknown";
  inputs: CapabilityInput[];
  outputs: CapabilityOutput[];
  linkedRoutes: string[];
  linkedApis: string[];
  evidence: EvidenceRef[];
  confidence: "high" | "medium" | "low";
}
```

Required risk classes:

- `PUBLIC_READ`
- `AUTHENTICATED_READ`
- `LOW_RISK_WRITE`
- `SENSITIVE_WRITE`
- `HIGH_CONSEQUENCE`

Descuff must not expose `SENSITIVE_WRITE` or `HIGH_CONSEQUENCE` capabilities without explicit developer approval.

## Routes And APIs

Routes represent user-facing and machine-facing entry points. API operations represent callable HTTP behavior.

Routes must record:

- path pattern
- router type
- source files
- HTTP methods where applicable
- authentication boundary
- runtime observability status

API operations must record:

- method
- path
- request schema where known
- response schema where known
- auth requirements
- side-effect classification
- source and runtime evidence

## Semantic Reasoning

Semantic reasoning converts structured evidence into domain conclusions. It may use an LLM through the developer's coding agent, but output must validate against strict schemas and remain evidence-backed.

Invalid semantic output examples:

- capability without evidence
- arbitrary readiness score without lost-point reasons
- application type without supporting routes/entities/APIs
- write capability with unknown risk

## Versioning

The IR must be versioned from the beginning. Breaking schema changes require:

- schema version bump
- migration notes
- fixture updates
- compatibility decision in an ADR

## Readiness Scoring

Readiness scoring is a versioned deterministic model, not an AI-generated percentage.

The scoring model must define:

- categories and weights
- caps per category
- blocking failures that force a maximum score
- how unknown evidence is scored
- whether runtime validation can lower a score
- whether scores are comparable across application types
- schema version of the scoring rules

Initial categories:

- discoverability
- structured content
- agent actions
- API quality
- semantic metadata
- security
- runtime correctness

Every lost point must include a reason and evidence reference.
