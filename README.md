# Descuff

[![npm version](https://img.shields.io/npm/v/descuff.svg)](https://www.npmjs.com/package/descuff)
[![CI](https://github.com/hatimshahera/Descuff/actions/workflows/ci.yml/badge.svg)](https://github.com/hatimshahera/Descuff/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Turn your existing website into an interface AI agents can understand and use.

Descuff is an open-source developer tool that scans a local app, measures how ready it is for AI agents, writes a conservative implementation plan, and validates the before/after improvement. It focuses on practical agent-facing standards: `llms.txt`, Schema.org JSON-LD, OpenAPI, API Catalog metadata, and safe browser-registered WebMCP planning.

Current release: `descuff@0.13.2` on npm. Descuff is an early public preview for local Next.js App Router and Pages Router codebases, including common monorepo layouts where the app lives under folders such as `apps/web`.

## Quick Start

Run Descuff inside a Next.js project:

```bash
npx descuff doctor .
```

If `doctor` says the project is supported, create the baseline:

```bash
npx descuff start .
```

Descuff writes:

```text
.descuff/baseline.json
.descuff/model.json
.descuff/assessments.json
.descuff/generated-changes.json
.descuff/graphify-enrichment.json
.descuff/skill-evidence-packet.json
.descuff/semantic-enrichment-prompt.md
.descuff/semantic-enrichment-template.json
.descuff/plan.md
.descuff/codex-prompt.md
```

Give `.descuff/codex-prompt.md`, `.descuff/plan.md`, and the semantic enrichment artifacts to Codex, Cursor, Claude Code, or another coding agent. The agent writes `.descuff/semantic-enrichment.json`, runs `npx descuff enrich .`, reviews `.descuff/semantic-enrichment-diff.md`, then implements the accepted standards while preserving the existing UI and behavior.

After implementation:

```bash
npx descuff finish .
```

Descuff rescans, validates, and writes:

```text
.descuff/final-validation.json
.descuff/before-after.md
```

## What Descuff Does

- Detects Next.js routes, API operations, forms, middleware/proxy/route-handler auth boundaries, Server Actions, route visibility, and existing standards.
- Builds an evidence-backed semantic model of domain profile, compatibility application type, capabilities, risks, routes, APIs, standards, and readiness.
- Records optional Graphify/native structural correlation when `graphify-out/graph.json` is present, and continues with native analysis when it is absent or invalid.
- Recommends agent-facing standards: `llms.txt`, Schema.org JSON-LD, OpenAPI, RFC 9727 API Catalog, and experimental WebMCP implementation plans for browser-registered public read tools.
- Generates a conservative implementation plan for a developer-owned coding agent.
- Validates standards, security boundaries, runtime evidence, and readiness.
- Reports before/after improvement so teams can see what changed.
- Tracks a local drift baseline so CI can fast-pass irrelevant changes and revalidate agent-facing changes before they ship.

## Why It Exists

Most websites were designed for humans and browsers. AI agents need clearer entry points: public summaries, structured entities, documented APIs, discoverable catalogs, and strict safety boundaries around anything sensitive or mutating.

Descuff gives developers a repeatable workflow:

```text
baseline -> semantic enrichment review -> plan -> implement with your coding agent -> validate -> compare
```

## Commands

```bash
npx descuff start [project-root]
npx descuff finish [project-root]
npx descuff scan [project-root]
npx descuff report [project-root]
npx descuff plan [project-root]
npx descuff diff [project-root]
npx descuff check [project-root]
npx descuff doctor [project-root]
npx descuff install [codex|claude-code|cursor|all] [project-root]
npx descuff install --platform codex
npx descuff install --platform claude-code [project-root]
npx descuff install --platform cursor [project-root]
npx descuff install codex --global
npx descuff enrich [project-root]
npx descuff validate [project-root]
npx descuff fix
npx descuff apply-safe [project-root]
```

Recommended first-time flow:

```text
start -> enrich -> coding agent implements accepted plan -> finish
```

Lower-level commands:

- `scan` writes `.descuff/analysis.json`, `.descuff/model.json`, `.descuff/assessments.json`, `.descuff/generated-changes.json`, `.descuff/graphify-enrichment.*`, `.descuff/skill-evidence-packet.*`, and semantic-enrichment prompt/template artifacts.
- `report` prints domain profile, compatibility application type, capability count, route/API counts, and standard status.
- `plan` writes `.descuff/plan.json` and `.descuff/plan.md`.
- `diff` compares changed files against `.descuff/drift-baseline.json` and writes `.descuff/drift-diff.json` plus `.descuff/drift-report.md`.
- `check` performs the same drift analysis, fast-passes unrelated changes, writes a validation plan, and runs validation for changes that can affect routes, APIs, capabilities, auth boundaries, or published standards.
- `doctor` diagnoses the current root before first use, writes `.descuff/doctor.json` and `.descuff/doctor.md`, and suggests a likely nested app root when Descuff was run from the wrong folder.
- Drift baselines are generated local artifacts by default. Keep `.descuff/` ignored for public repos, and let CI preserve `.descuff/drift-baseline.json` as a protected cache/artifact or regenerate it from the base branch before checking a pull request.
- `install --platform codex` installs the tested Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`; invoke it with `$descuff .`.
- `install --platform claude-code` writes a project slash command to `.claude/commands/descuff.md`; invoke it with `/descuff .`.
- `install --platform cursor` writes a project rule to `.cursor/rules/descuff.mdc`; ask Cursor Agent to Descuff the app from that project.
- `install all` writes local preview skill instructions for Codex, Claude Code, and Cursor under `.descuff/skills/`.
- `enrich` validates `.descuff/semantic-enrichment.json` against the skill evidence packet and writes `.descuff/semantic-enrichment-diff.md`.
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
- nested Next.js apps in common monorepo layouts, such as `apps/web/app`
- API routes
- basic form evidence
- conservative Server Action capability modelling
- middleware and `proxy.ts` auth-boundary detection
- route-handler auth evidence for common session, API-key, permission, and wrapper patterns
- authenticated route filtering for public metadata
- existing `llms.txt`, OpenAPI, Schema.org JSON-LD, API Catalog, and WebMCP detection

## External Hardening

Descuff has been tested against unrelated public Next.js repositories covering static sites, content sites, commerce, SaaS dashboards, booking flows, Pages Router auth, analytics apps, and forms-heavy monorepos. Those audits turned into regression tests for route discovery, Server Actions, auth boundaries, monorepo route roots, and safety classification.

Not yet supported as a general-purpose website crawler:

```bash
npx descuff scan https://example.com
```

Descuff currently expects a local Next.js codebase:

```bash
cd my-nextjs-app
npx descuff start .
```

## Documentation

- [How To Use Descuff](HOW-TO-USE.md)
- [CLI Package README](packages/cli/README.md)
- [Example Next.js App](examples/ecommerce-nextjs/README.md)

## Development

```bash
pnpm install
pnpm run ci
```

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.
