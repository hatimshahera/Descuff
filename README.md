# Descuff

Turn your existing website into an interface AI agents can use.

Descuff is an open-source developer tool for measuring, planning, and validating agent-facing standards adoption. It scans an existing app, creates a baseline, writes an implementation plan for your coding agent, and proves the before/after difference.

Current release: `descuff@0.0.2` on npm. v1 supports Next.js App Router and Pages Router codebases.

## Quick Start

Run Descuff inside a Next.js project:

```bash
npx descuff start .
```

Descuff writes:

```text
.descuff/baseline.json
.descuff/model.json
.descuff/assessments.json
.descuff/generated-changes.json
.descuff/plan.md
.descuff/codex-prompt.md
```

Give `.descuff/codex-prompt.md` and `.descuff/plan.md` to Codex, Cursor, Claude Code, or another coding agent. After implementation:

```bash
npx descuff finish .
```

Descuff rescans, validates, and writes:

```text
.descuff/final-validation.json
.descuff/before-after.md
```

## What Descuff Does

- Detects Next.js routes, API operations, forms, middleware, server-action evidence, and existing standards.
- Builds an evidence-backed semantic model of application type, capabilities, risks, routes, APIs, standards, and readiness.
- Recommends agent-facing standards: `llms.txt`, Schema.org JSON-LD, OpenAPI, RFC 9727 API Catalog, and experimental WebMCP.
- Generates a conservative implementation plan for a developer-owned coding agent.
- Validates standards, security boundaries, runtime evidence, and readiness.
- Reports before/after improvement so teams can see what changed.

## Commands

```bash
npx descuff start [project-root]
npx descuff finish [project-root]
npx descuff scan [project-root]
npx descuff report [project-root]
npx descuff plan [project-root]
npx descuff validate [project-root]
npx descuff fix
npx descuff apply-safe [project-root]
```

Recommended first-time flow:

```text
start -> coding agent implements plan -> finish
```

Lower-level commands:

- `scan` writes `.descuff/analysis.json`, `.descuff/model.json`, `.descuff/assessments.json`, and `.descuff/generated-changes.json`.
- `report` prints application type, capability count, route/API counts, and standard status.
- `plan` writes `.descuff/plan.json` and `.descuff/plan.md`.
- `validate` rescans before scoring, writes `.descuff/validation.json`, and exits non-zero on validation failure.
- `fix` prints agent workflow instructions. It does not invoke an LLM and does not edit source directly.
- `apply-safe` is intentionally disabled for automatic source writes in this release.

## Example Result

A simple Next.js landing page with one waitlist endpoint can move from:

```text
Readiness: 60/100
Standards: none
```

to:

```text
Readiness: 85/100
Standards: api-catalog, llms-txt, openapi, schema-org
Failures: 0
Warnings: 0
```

The remaining points depend on the app. A simple landing page may not have structured product, article, booking, or workspace entities for Descuff to model.

## Safety Model

Descuff treats runtime analysis as read-only by default. It does not invoke mutating HTTP methods, submit forms, execute server actions, or expose sensitive/high-consequence capabilities unless a validation scenario explicitly defines setup, expected side effects, verification, and cleanup.

Descuff does not directly call an LLM. It writes a plan and prompt for the coding agent you already use.

## Supported Today

- Next.js App Router
- Next.js Pages Router
- API routes
- basic form and server-action evidence
- existing `llms.txt`, OpenAPI, Schema.org JSON-LD, API Catalog, and WebMCP detection

Not yet supported as a general-purpose website crawler:

```bash
npx descuff scan https://example.com
```

Descuff v1 expects a local Next.js codebase:

```bash
cd my-nextjs-app
npx descuff start .
```

## Documentation

- [How To Use Descuff](HOW-TO-USE.md)
- [Next Potential Features](docs/NEXT-FEATURES.md)
- [Architecture Overview](docs/architecture/overview.md)
- [Validation](docs/architecture/validation.md)
- [Standards Adapters](docs/architecture/standards-adapters.md)
- [Implementation Plan](docs/implementation/PLAN.md)

## Development

```bash
pnpm install
pnpm run ci
```

Read `AGENTS.md`, `docs/implementation/PLAN.md`, the active phase file, related architecture docs, and relevant ADRs before implementing production changes.
