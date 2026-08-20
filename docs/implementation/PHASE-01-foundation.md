# Phase 01 - Foundation

## Objective

Create the repository structure, tooling, package boundaries, and test infrastructure required for long-term Descuff development.

## Dependencies

- No implementation dependencies.
- Must precede all other phases.

## Tasks

- [ ] Initialize pnpm workspace.
- [ ] Add strict shared TypeScript configuration.
- [ ] Create monorepo package directories.
- [ ] Add CLI package and command entry shell.
- [ ] Add core package with orchestration contracts.
- [ ] Add minimal versioned evidence contracts.
- [ ] Add `StructuralAnalysis` contract.
- [ ] Add IR package shell.
- [ ] Add config package shell.
- [ ] Add analyzer, standard, validator, reporter, and skill package shells.
- [ ] Configure Vitest.
- [ ] Configure Playwright.
- [ ] Add CI workflow for format, lint, typecheck, tests, build, and CLI smoke test.
- [ ] Add initial fixture applications.
- [x] Add planning and architecture documentation.

## Acceptance Criteria

- Package structure matches `docs/architecture/overview.md`.
- `pnpm install` succeeds from a clean checkout.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` run.
- CLI command names exist even if implementation is placeholder-only: `scan`, `report`, `plan`, `fix`, `apply-safe`, and `validate`.
- Configuration, caches, and process-wide state are passed explicitly through typed contexts or documented cache interfaces.

## Required Testing

- CLI smoke test for each command.
- Package import tests.
- CI workflow verification.
- Fixture workspace install/build smoke test.

## Completion Rule

Do not mark this phase complete until all acceptance criteria pass locally and in CI.
