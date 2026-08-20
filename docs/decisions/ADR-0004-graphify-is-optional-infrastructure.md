# ADR-0004: Graphify Is Optional Infrastructure

## Status

Accepted

## Context

Graphify can provide useful structural analysis and developer navigation, but Descuff must not depend on Graphify as its core architecture.

The project also intends to run Graphify over Descuff itself once the initial repository architecture exists.

## Decision

Use Graphify in two constrained ways:

- optional analyzer subsystem through `GraphifyAdapter`
- developer infrastructure for repository exploration through `pnpm graph:refresh` and agent instructions

The rest of Descuff must never depend directly on Graphify concepts or Graphify storage formats.

## Consequences

- Graphify can be replaced or removed.
- Analyzer output remains Descuff-owned.
- Coding agents can use Graphify to avoid broad, blind repository traversal after a graph exists.
- License and NOTICE requirements must be preserved if Graphify source is reused directly.

Tradeoff:

- The adapter layer adds work, but prevents Graphify from becoming an architectural dependency.
