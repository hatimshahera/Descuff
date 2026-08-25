# Changelog

All notable changes to Descuff will be documented in this file.

## Unreleased

### Added

- Added shared host-agent skill groundwork: compact skill evidence packets, semantic enrichment validation, semantic diff rendering, Graphify/native correlation contracts, and Codex/Claude Code/Cursor instruction rendering.
- Added `descuff install [codex|claude-code|cursor|all]` to write local preview skill instructions under `.descuff/skills/`.
- Added `descuff install codex --global` to install a real Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`.
- Added `descuff enrich` to deterministically validate `.descuff/semantic-enrichment.json` and write semantic enrichment review artifacts.
- Added an evidence-backed domain profile to the semantic model and skill evidence packet while preserving `applicationType` as a compatibility field.
- Added optional Graphify/native enrichment artifacts to scan output and the skill evidence packet without making Graphify required.
- `descuff scan` now writes `.descuff/graphify-enrichment.json`, `.descuff/graphify-enrichment.md`, `.descuff/skill-evidence-packet.json`, `.descuff/skill-evidence-packet.md`, `.descuff/semantic-enrichment-prompt.md`, and `.descuff/semantic-enrichment-template.json`.

## 0.1.1 - 2026-08-24

### Fixed

- Replaced publish-time `workspace:` dependency ranges with concrete `^0.1.1` internal package ranges so `npx descuff@0.1.1` installs correctly from npm.

## 0.1.0 - 2026-08-21

### Added

- Added route discovery support for Next.js projects that use `src/app` and `src/pages`.
- Added route discovery support for nested Next.js apps in common monorepo layouts, such as `apps/web/app`.
- Added Next.js `proxy.ts` authentication-boundary detection.
- Added route-handler authentication-boundary detection for common session, API-key, permission, and wrapper patterns.
- Added route-level visibility so authenticated pages are filtered out of public `llms.txt` and Schema.org output.
- Added conservative Server Action capability modelling for file-level `"use server"` exports.
- Added structured Phase 10 external audit benchmark records for eight completed public repository audits.

### Fixed

- Avoid generating non-applicable standards for apps with no APIs or capabilities.
- Improved content, SaaS, sensitive-read, and high-consequence capability classification from external audit findings.
- Fixed validation false positives where protected route-handler mutations were treated as public sensitive capabilities.

### Release Notes

- Audited against eight unrelated public Next.js repositories covering static sites, content sites, commerce, SaaS, booking, Pages Router auth, analytics, and forms-heavy monorepos.
- The audit intentionally used `descuff start`, model/plan inspection, and validation results as the benchmark loop. Implementing standards inside every external repository was skipped because it would be expensive and would mainly test coding-agent behavior, not Descuff's analysis and validation engine.
- Remaining known limitation: generated `llms.txt` validation can reject intercepted/parallel App Router route markers until those route references are normalized or omitted.

## 0.0.2 - 2026-08-20

### Added

- Added `descuff start` to create a baseline, validation report, agent plan, and `.descuff/codex-prompt.md`.
- Added `descuff finish` to rescan after implementation, validate again, and write `.descuff/before-after.md`.

### Fixed

- `descuff validate` now rescans before scoring readiness so stale validation artifacts do not survive source changes.

## 0.0.1 - 2026-08-20

### Added

- TypeScript/pnpm monorepo foundation.
- Next.js static analyzer for App Router, Pages Router, API routes, server actions, forms, middleware, existing standards, and runtime correlation.
- Descuff-owned structural and semantic IR with evidence-backed capability, risk, application-type, validation, and readiness models.
- Standard adapters for `llms.txt`, Schema.org JSON-LD, OpenAPI, RFC 9727 API Catalog, and experimental WebMCP.
- Agent workflow planning artifacts and non-LLM `descuff fix` instructions.
- Validation package covering static generated changes, build/test command integration, runtime observations, mutating scenario guardrails, security checks, UI regression checks, readiness reports, and repair guidance.
- Ecommerce Next.js fixture E2E proving the scan-to-validation path.
- Booking, content, SaaS, and intentionally broken Next.js source fixtures for broader analyzer and validation coverage.
- CLI commands for `scan`, `report`, `plan`, `fix`, `apply-safe`, and `validate`.

### Known Release Limitations

- `apply-safe` does not write application source in this release.
- Graphify is optional developer infrastructure and may require adding `~/.local/bin` to `PATH`.
- `0.0.0` was superseded by `0.0.1` because the initial registry publish used workspace dependency metadata. `latest` now points to `0.0.2`.
