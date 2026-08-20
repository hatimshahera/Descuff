# Phase 07 - Release

## Objective

Prepare the first public release with complete documentation, examples, CI, package readiness, and no known critical or high-severity defects.

## Dependencies

- Requires Phases 01 through 06.
- Requires realistic fixture applications and full E2E validation.

## Tasks

- [ ] Complete README.
- [ ] Add installation instructions.
- [ ] Add contributing guide.
- [ ] Add changelog.
- [ ] Add license.
- [ ] Add public examples.
- [ ] Complete fixture applications.
- [ ] Run Graphify over Descuff.
- [ ] Configure coding-agent instructions to use Graphify for repository exploration.
- [ ] Verify CI is green.
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

## Completion Rule

Do not mark this phase complete until the release artifact itself has been tested from a clean install path.
