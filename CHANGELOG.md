# Changelog

All notable changes to Descuff will be documented in this file.

## 0.0.2 - 2026-08-20

### Added

- Added `descuff start` to create a baseline, validation report, agent plan, and `.descuff/codex-prompt.md`.
- Added `descuff finish` to rescan after implementation, validate again, and write `.descuff/before-after.md`.

### Fixed

- `descuff validate` now rescans before scoring readiness so stale validation artifacts do not survive source changes.

## 0.0.1 - 2026-08-20

### Added

- Phase-based TypeScript/pnpm monorepo scaffold.
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
