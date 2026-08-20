# ADR-0001: Use A pnpm TypeScript Monorepo

## Status

Accepted

## Context

Descuff needs separate packages for CLI orchestration, core contracts, IR schemas, analyzers, standards adapters, validation, reporting, fixtures, and coding-agent workflow assets.

The first release targets Next.js applications and should be easy for JavaScript and TypeScript developers to inspect, test, and contribute to.

## Decision

Use a pnpm workspace monorepo with TypeScript throughout.

Planned package boundaries:

- `packages/cli`
- `packages/core`
- `packages/ir`
- `packages/config`
- `packages/analyzers/*`
- `packages/standards/*`
- `packages/validator`
- `packages/reporter`
- `packages/agent-workflow`

## Consequences

- Package boundaries can enforce dependency direction.
- Tests can run at package and workspace levels.
- Publishing can expose a CLI while keeping internals modular.
- Future framework and standard adapters can be added without flattening the architecture.

Tradeoff:

- Workspace setup is heavier than a single package, but the adapter-heavy architecture needs these boundaries from the start.
