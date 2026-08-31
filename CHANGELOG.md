# Changelog

All notable changes to Descuff will be documented in this file.

## Unreleased - Next Changes

### Added

- Added initial `descuff recon <url>` hosted URL reconnaissance with public standards discovery, same-origin page inspection, confidence-labeled artifacts, and read-only browser-agent reachability summaries.
- Added typed hosted recon blockers for robots exclusions, cross-origin links, crawl budgets, unsafe scenarios, destination misses, fetch failures, and baseline comparison failures.
- Added hosted recon diagnostics for malformed scenarios, inconclusive public evidence, and redacted sensitive query parameters.
- Added hosted recon fixture coverage for unsafe browser-agent scenarios and real local HTTP recon when the environment permits local sockets.
- Added opt-in `descuff recon <url> --browser` rendered-page evidence with browser network counts and browser-discovered WebMCP tool reporting.

### Fixed

- Fixed `descuff recon` argument parsing so flags and flag values can appear before the target URL.
- Fixed hosted recon canonical-origin handling after public URL redirects, so browser rendering is not incorrectly skipped after normal domain redirects.
- Fixed Next.js analyzer route discovery for App Router `.mdx` page files.
- Replaced the deprecated `pnpm/action-setup@v4` workflow setup with Corepack-pinned `pnpm@10.30.0` so CI and publish runs no longer emit Node 20 action deprecation warnings.

## 0.16.1 - 2026-08-30 - Browser-Agent Validation And Readiness Explanations

### Added

- Added standard-neutral browser-agent runtime scenarios that compare baseline browser exploration against Descuff-assisted standards evidence.
- Added browser-agent scenario/result artifacts and readiness explanation artifacts that link score losses to affected scenarios, evidence surfaces, and repair guidance.
- Added typed validation failures for browser-agent baseline failure, post-Descuff failure, scenario budget overruns, benchmark regression, and inconclusive results.
- Added `READINESS_EXPLANATION_MISSING_EVIDENCE` validation so incomplete readiness explanations cannot publish without evidence, affected surfaces, or scenario context.
- Added fixture and snapshot coverage for content-site readiness explanations, static-site acceptable gaps, API-contract browser-agent scenarios, and browser-agent result Markdown.
- Added scenario route/origin boundary enforcement for browser-agent benchmarks so configured `allowedRoutes`, `allowedOrigins`, and `blockedOrigins` are respected.

### Changed

- Improved runtime proof summaries so CLI output reports browser-agent scenario counts, comparable effort changes, and after-path evidence surfaces.

## 0.15.2 - 2026-08-30 - Apache 2.0 License Metadata

### Changed

- Switched repository and package metadata from MIT to Apache-2.0 so npm package pages reflect the stronger contribution and patent-license posture.

## 0.15.1 - 2026-08-30 - Real WebMCP Execution Improvements

### Added

- Added explicit WebMCP runtime execution scenarios so browser-discovered read-only tools are only executed with approved validation inputs.
- Added a framework-neutral browser-agent task benchmark contract and pure effort comparison helper for Phase 15 evidence artifacts.
- Added browser-agent benchmark JSON and Markdown artifact rendering for scans that produce benchmark evidence.
- Added optional `.descuff/runtime.json` support so CLI scans can use real browser/runtime evidence instead of synthetic runtime evidence.
- Added `BROWSER_AGENT_BENCHMARK_INCONCLUSIVE` runtime validation when benchmark evidence cannot prove both paths succeeded.
- Added automatic browser-agent benchmark records for explicit WebMCP runtime scenarios observed during browser analysis.
- Added runtime proof summaries to scan, start, validate, and finish output.
- Documented runtime analyzer benchmark generation, reporter benchmark output, and validator benchmark checks in package READMEs.
- Added `BROWSER_AGENT_BENCHMARK_REGRESSED` runtime validation when browser-agent effort gets worse after Descuff.

### Changed

- Aligned runtime WebMCP validation failures with the Phase 15 metadata-only and missing-tool contract.

## 0.14.2 - 2026-08-30 - Doctor Diagnostic Accuracy

### Fixed

- Fixed `descuff doctor` diagnostics so fresh projects report existing `.descuff` artifacts as absent before doctor writes its own artifacts.
- Fixed `descuff doctor` timestamps to use the actual check time instead of the deterministic test epoch when no test clock is provided.
- Fixed malformed `package.json` handling so invalid JSON is reported as `PACKAGE_JSON_MALFORMED` instead of `PACKAGE_JSON_MISSING`.

## 0.14.1 - 2026-08-30 - First-Run Doctor Diagnostics

### Added

- Added `descuff doctor [project-root]` to diagnose supported Next.js roots, wrong-folder monorepos, writable `.descuff/` artifacts, optional Graphify state, Git availability, and typed first-run blockers before creating a baseline.
- Added stale `.descuff/source-fingerprints.json` detection to `doctor` so users are told when local artifacts no longer match current source files.
- Added advisory browser/runtime prerequisite diagnostics to `doctor`, including Node support, project-level Playwright dependency presence, and explicit confirmation that no browser launch was performed.
- Added structured `readinessExplanations` to validation reports so machine consumers can distinguish complete categories, acceptable gaps, recommendations, and blockers.
- Improved `descuff start` output with detected app counts, standards status, validation status, readiness notes, generated artifact paths, and next-step guidance.
- Improved `descuff install` completion output with explicit `finish` versus `check` guidance for Codex, Claude Code, Cursor, and local preview installs.

## 0.13.2 - 2026-08-30 - Package README And Publish Preflight

### Added

- Added minimal npm READMEs for public internal runtime packages so users know to install `descuff` unless they are building on Descuff internals.

### Fixed

- Added a release publish preflight that fails before `npm publish` when any target package version is already present on npm.
- Increased the packed release install smoke timeout so slow clean npm installs do not fail a valid release candidate.
- Added provenance-compatible repository metadata to every public package so npm Trusted Publishing can verify GitHub Actions provenance.

## 0.13.1 - 2026-08-28 - Release Automation And Installability Hardening

### Added

- Added host-agent instruction guidance to run `descuff check .` after ordinary edits in already-Descuffed apps, while reserving `descuff finish .` for explicit Descuff plan implementation.
- Adopted phase-based preview versioning for future releases: `0.<phase>.<patch>`, starting from the next publish.
- Added release package graph validation and dependency-first publish-order reporting to harden release checks.
- Added a packed CLI install smoke command that installs tarballs into a clean temp project and runs `descuff --help`, `start`, and `finish`.
- Added changelog release heading validation for version, ISO date, and one-line release title.
- Added npm environment diagnostics for root-owned cache entries and pnpm-only config warnings during release checks.
- Added post-publish registry verification for packuments, latest dist-tags, tarball reachability, internal dependency resolution, and fresh public CLI install smoke tests.
- Documented public package-boundary rules and partial-publish recovery steps for contributors.
- Added a manual GitHub Actions Trusted Publishing workflow and dependency-ordered publish script for npm releases.
- Added an executable release recovery drill for simulated broken internal-package publish scenarios.
- Added a release version preparation script that updates public package versions, internal ranges, README release text, and the changelog heading.
- Fixed the Trusted Publishing workflow to avoid token auth during `npm publish` so npm can use OIDC.

## 0.1.15 - 2026-08-27 - Installable Drift Recovery

### Fixed

- Renamed the published drift runtime package to `@descuff/drift-core` and moved the CLI dependency to that package after npm accepted `@descuff/drift` publish metadata but did not serve its installable package document.

## 0.1.14 - 2026-08-27 - Registry Recovery Release

### Fixed

- Republished the continuous-readiness release with all internal package ranges moved to `0.1.14` after `descuff@0.1.13` reached npm before `@descuff/drift@0.1.13` was publicly installable.

## 0.1.13 - 2026-08-27 - Continuous Readiness Drift Detection

### Added

- Added initial continuous-readiness drift detection with `descuff diff`, `descuff check`, `.descuff/drift-baseline.json`, `.descuff/drift-diff.json`, `.descuff/drift-check.json`, and `.descuff/drift-report.md`.
- Added drift baseline contract fingerprints and typed baseline failures for missing, malformed, unsupported, and project-mismatched baselines.
- Added drift validation plans that identify affected validation suites and explicitly record when full validation is used as the safety fallback.
- Added targeted `descuff check` execution for static metadata, source fingerprints, runtime observations, WebMCP behavior, security model, and capability-confidence suites.
- Added drift-level repair mapping for stale baselines, WebMCP disconnections, OpenAPI/API behavior mismatches, stale machine contracts, and structured metadata drift.
- Added fixture coverage for removed API capabilities and new-route structured metadata drift.
- Added deterministic runtime analyzer coverage for browser-collected WebMCP tool results alongside API response-shape evidence.
- Documented the default drift-baseline storage policy for local projects and CI.

## 0.1.12 - 2026-08-25 - Cursor Platform Install

### Added

- Added `descuff install --platform cursor` to write a Cursor project rule at `.cursor/rules/descuff.mdc`.

## 0.1.11 - 2026-08-25 - Host-Agent Skill Workflow

### Added

- Added shared host-agent skill groundwork: compact skill evidence packets, semantic enrichment validation, semantic diff rendering, Graphify/native correlation contracts, and Codex/Claude Code/Cursor instruction rendering.
- Added `descuff install --platform codex` and `descuff install --platform claude-code` for short assistant-specific setup.
- Added `descuff install [codex|claude-code|cursor|all]` to write local preview skill instructions under `.descuff/skills/`.
- Added `descuff install codex --global` to install a real Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`.
- Added fixture coverage proving the installed Codex skill contract can run `start -> enrich -> finish`.
- Added `descuff enrich` to deterministically validate `.descuff/semantic-enrichment.json` and write semantic enrichment review artifacts.
- Added tested skill-style orchestration coverage for `start -> enrich -> finish` without any hidden LLM call.
- Added an evidence-backed domain profile to the semantic model and skill evidence packet while preserving `applicationType` as a compatibility field.
- Added optional Graphify/native enrichment artifacts to scan output and the skill evidence packet without making Graphify required.
- `descuff scan` now writes `.descuff/graphify-enrichment.json`, `.descuff/graphify-enrichment.md`, `.descuff/skill-evidence-packet.json`, `.descuff/skill-evidence-packet.md`, `.descuff/semantic-enrichment-prompt.md`, and `.descuff/semantic-enrichment-template.json`.

### Fixed

- Tightened host-agent semantic-enrichment validation so malformed JSON with renamed or missing required fields is rejected before it can appear in accepted enrichment output.

## 0.1.1 - 2026-08-24 - npm Dependency Range Fix

### Fixed

- Replaced publish-time `workspace:` dependency ranges with concrete `^0.1.1` internal package ranges so `npx descuff@0.1.1` installs correctly from npm.

## 0.1.0 - 2026-08-21 - Public Preview Hardening

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

## 0.0.2 - 2026-08-20 - Start And Finish Workflow

### Added

- Added `descuff start` to create a baseline, validation report, agent plan, and `.descuff/codex-prompt.md`.
- Added `descuff finish` to rescan after implementation, validate again, and write `.descuff/before-after.md`.

### Fixed

- `descuff validate` now rescans before scoring readiness so stale validation artifacts do not survive source changes.

## 0.0.1 - 2026-08-20 - Initial Monorepo Foundation

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
