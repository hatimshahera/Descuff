# ADR-0003: Isolate Standards Behind Adapters

## Status

Accepted

## Context

Descuff targets multiple existing agent-facing standards. These standards evolve independently and represent application capabilities differently.

## Decision

Each standard is implemented behind a `StandardAdapter` with `assess`, `generate`, and `validate` operations.

First-release adapters:

- `LlmsTxtAdapter`
- `WebMcpAdapter`
- `SchemaOrgAdapter`
- `OpenApiAdapter`
- `ApiCatalogAdapter`

## Consequences

- Adding a future standard such as UCP should mean adding another adapter.
- Core IR remains standard-neutral.
- Adapter-specific validation can be tested independently.
- Safety approval gates can be shared across adapters.

Tradeoff:

- Some standards may need adapter-local mapping layers instead of direct IR fields.
