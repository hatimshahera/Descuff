# Descuff

We turn every website into an interface AI agents can actually use.

Descuff is an open-source developer tool for analyzing existing web applications, planning agent-facing standards adoption, and validating the result. The first release targets Next.js applications.

Current status: Phase 7 release preparation. The validated path is a conventional Next.js app fixture that exercises scan, report, plan, agent workflow guidance, generated standards, and validation.

## What Descuff Does

- Scans a Next.js project and records evidence-backed structural facts.
- Builds a Descuff-owned semantic model for application type, routes, API operations, capabilities, risk, and readiness.
- Assesses agent-facing standards: `llms.txt`, Schema.org JSON-LD, OpenAPI, RFC 9727 API Catalog, and experimental WebMCP.
- Writes implementation plans for a separate coding agent. Descuff does not call an LLM.
- Validates generated standards, runtime evidence, security boundaries, and release readiness.

## Installation

For local development from this repository:

```bash
pnpm install
pnpm build
node packages/cli/dist/index.js scan fixtures/ecommerce
```

After npm publication, the public command shape is:

```bash
npx descuff scan .
npx descuff report .
npx descuff plan .
npx descuff validate .
```

The package publishing dry run and clean packed install verification are tracked in `docs/implementation/PHASE-07-release.md`.

## Commands

```bash
descuff scan [project-root]
descuff report [project-root]
descuff plan [project-root]
descuff fix
descuff apply-safe [project-root]
descuff validate [project-root]
```

`scan` writes `.descuff/analysis.json`, `.descuff/model.json`, `.descuff/assessments.json`, and `.descuff/generated-changes.json`.

`report` prints the application type, capabilities, route/API counts, and selected standards.

`plan` writes `.descuff/plan.json` and `.descuff/plan.md` for a coding agent.

`fix` prints workflow instructions. It does not invoke an LLM and does not edit application source.

`apply-safe` is intentionally disabled for automatic writes in this release.

`validate` writes `.descuff/validation.json` and `.descuff/validation-repair.md`, then exits non-zero on validation failure.

## Example

The current end-to-end release fixture is `fixtures/ecommerce`, a small Next.js ecommerce app with App Router pages, a Pages Router page, API routes, server actions, middleware, `llms.txt`, and OpenAPI evidence.

```bash
pnpm build
node packages/cli/dist/index.js scan fixtures/ecommerce
node packages/cli/dist/index.js report fixtures/ecommerce
node packages/cli/dist/index.js plan fixtures/ecommerce
node packages/cli/dist/index.js validate fixtures/ecommerce
```

Expected validated summary:

```text
descuff validate passed
Readiness: 100/100
Failures: 0
Warnings: 0
```

## Safety Model

Descuff treats runtime analysis as read-only by default. It does not invoke mutating HTTP methods, submit forms, execute server actions, or expose sensitive/high-consequence capabilities unless a validation scenario explicitly defines setup, expected side effects, verification, and cleanup.

Generated standards are proposed in memory before any write. In this release, automatic safe application is disabled; coding agents or developers review and implement the generated plan.

## Architecture

The main flow is:

```text
Next.js source + runtime evidence
  -> StructuralAnalysis
  -> ApplicationModel
  -> standard adapters
  -> agent implementation plan
  -> validation readiness report
```

Key documents:

- `docs/architecture/overview.md`
- `docs/architecture/analyzers.md`
- `docs/architecture/semantic-ir.md`
- `docs/architecture/standards-adapters.md`
- `docs/architecture/validation.md`
- `docs/decisions/`

## Development

```bash
pnpm install
pnpm format
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm smoke
```

Use the full release check locally with:

```bash
pnpm run ci
```

Read `AGENTS.md`, `docs/implementation/PLAN.md`, the active phase file, related architecture docs, and relevant ADRs before implementing production changes.
