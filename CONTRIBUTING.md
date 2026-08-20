# Contributing

Descuff is implemented phase by phase. Before production code changes, read:

- `AGENTS.md`
- `docs/implementation/PLAN.md`
- the relevant phase file in `docs/implementation/`
- related architecture docs and ADRs

Do not mark tasks complete until their acceptance criteria and tests pass.

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
```

Run the full local release check before opening a release-facing change:

```bash
pnpm run ci
```

## Phase Discipline

- Work one phase at a time unless a maintainer explicitly asks otherwise.
- Keep `docs/implementation/PLAN.md` and the active phase file synchronized.
- Preserve Descuff-owned IR and evidence contracts independent of framework, standard, runtime, and Graphify storage formats.
- Keep external standards behind adapters.
- Keep Graphify optional and behind `GraphifyAdapter`.
- Record newly discovered architectural decisions as ADRs.

## Safety And Validation

- Runtime analysis is read-only by default.
- Do not invoke mutating actions without an explicit validation scenario defining setup, expected side effects, verification, and cleanup.
- Never silently expose sensitive or high-consequence capabilities.
- Validation must prove behavior, not just file existence.

## Commit Scope

Prefer small, phase-aligned changes with focused tests. Do not revert unrelated user or contributor work while preparing a change.
