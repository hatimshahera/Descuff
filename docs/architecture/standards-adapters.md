# Standards Adapters

Every supported standard is isolated behind a common adapter contract. Standard-specific concepts must not leak into the core semantic IR.

## Adapter Contract

```ts
interface StandardAdapter {
  id: string;

  assess(model: ApplicationModel): Promise<StandardAssessment>;

  generate(model: ApplicationModel): Promise<GeneratedChange[]>;

  validate(context: ValidationContext): Promise<ValidationResult[]>;
}
```

The adapter lifecycle is:

- `assess`: determine applicability, current coverage, gaps, risks, and required validation.
- `generate`: return proposed `GeneratedChange` objects in memory; never write files.
- `plan`: combine generated changes and manual work into `.descuff/plan.json` and `.descuff/plan.md`.
- `apply-safe`: write only approved deterministic safe changes.
- coding agent: implement changes requiring source-code reasoning.
- `validate`: independently verify behavior after changes.

## First-Release Adapters

- `LlmsTxtAdapter`
- `SchemaOrgAdapter`
- `OpenApiAdapter`
- `ApiCatalogAdapter`
- `WebMcpAdapter`

Future standards such as UCP must be added as new adapters without redesigning the IR.

Rollout order is vertical before broad. Descuff must first prove scan -> IR -> assessment -> plan -> generation -> runtime validation with `llms.txt` and one richer standard, preferably Schema.org or OpenAPI. API Catalog and experimental WebMCP follow after the full pipeline has survived end-to-end tests.

## Assessment

Assessment determines whether a standard is:

- already implemented
- required
- recommended
- not applicable
- blocked

Each assessment must include:

- evidence
- rationale
- risk notes
- generated-change eligibility
- validation requirements

## Generation

Generated changes must be deterministic and idempotent where possible.

Requirements:

- detect existing files before writing
- preserve user code
- define conflict behavior before writing: skip, merge, create a companion file, or require approval
- use AST-based edits where practical
- produce diffs
- support dry-run mode
- avoid duplicate generated content on repeated runs
- apply changes transactionally or leave recoverable partial changes with a written recovery report

`apply-safe` may generate deterministic files such as `llms.txt`, API Catalog from known OpenAPI documents, config files, and metadata scaffolding. It must not automatically expose sensitive or mutating capabilities.

## Validation

Adapters validate standard behavior, not only output files.

Examples:

- `llms.txt`: structure, reachable URLs, route consistency
- Schema.org: JSON-LD syntax, type validity, page correlation
- OpenAPI: schema validity, route correspondence, runtime status checks
- API Catalog: RFC 9727 validity, `/.well-known/api-catalog`, GET and HEAD behavior, HTTPS deployment behavior, Linkset JSON, `application/linkset+json`, and linked API availability
- WebMCP: experimental/proposed standard validation, pinned supported draft version, imperative JavaScript tool registration, declarative form annotations, browser feature detection, unsupported-browser results, schema validity, discovery, invocation, and real response correlation

## Safety

Standard generation must respect capability risk:

- `PUBLIC_READ`: eligible for automatic exposure if evidence is strong
- `AUTHENTICATED_READ`: eligible only with preserved auth boundaries
- `LOW_RISK_WRITE`: requires conservative validation and clear plan review
- `SENSITIVE_WRITE`: requires explicit developer approval
- `HIGH_CONSEQUENCE`: requires explicit developer approval and strong validation
