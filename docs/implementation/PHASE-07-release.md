# Phase 07 - Release

## Objective

Prepare the first public release with complete documentation, examples, CI, package readiness, and no known critical or high-severity defects.

## Dependencies

- Requires Phases 01 through 06.
- Requires realistic fixture applications and full E2E validation.

## Tasks

- [x] Complete README.
- [x] Add installation instructions.
- [x] Add contributing guide.
- [x] Add changelog.
- [x] Add license.
- [x] Add public examples.
- [ ] Complete fixture applications.
- [ ] Run Graphify over Descuff.
- [x] Configure coding-agent instructions to use Graphify for repository exploration.
- [x] Verify CI is green.
- [ ] Run package publishing dry run.
- [ ] Run full release checklist.
- [ ] Triage all known critical and high-severity defects.

## Acceptance Criteria

- `npx descuff scan` works on a real Next.js application.
- Output explains application type, capabilities, readiness, selected standards, and evidence.
- A coding agent can execute the plan refreshed by `descuff fix`.
- `npx descuff validate` proves generated standards, security, build health, tests, and human UI regression status.
- Documentation explains installation, architecture, safety, contribution, examples, and release limitations.
- CI blocks failing required checks.

## Required Testing

- Full fixture E2E suite.
- Packaged CLI smoke test.
- Documentation command verification.
- CI verification.
- Release dry run.

## Validation Notes

- `pnpm run ci` passed on 2026-08-20 after wiring `scan`, `report`, `plan`, and `validate` to the ecommerce fixture.
- Documentation command verification passed with:
  - `node packages/cli/dist/index.js scan fixtures/ecommerce`
  - `node packages/cli/dist/index.js report fixtures/ecommerce`
  - `node packages/cli/dist/index.js validate fixtures/ecommerce`
- `pnpm --filter @descuff/cli pack --dry-run` succeeds, but the current package identity is still `@descuff/cli`, so it does not yet satisfy the `npx descuff scan` release acceptance criterion.
- Live Graphify refresh remains blocked locally unless the `graphify` executable is installed. Repository coding-agent instructions and smoke checks verify the optional Graphify workflow guidance.

## Completion Rule

Do not mark this phase complete until the release artifact itself has been tested from a clean install path.
