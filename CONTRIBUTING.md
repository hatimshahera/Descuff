# Contributing

Thanks for helping improve Descuff. This project is a TypeScript/pnpm monorepo for the `descuff` CLI and its analyzer, standards, workflow, reporting, and validation packages.

## Development Setup

```bash
pnpm install
pnpm run ci
```

Use focused checks while developing:

```bash
pnpm build
pnpm test
pnpm lint
```

## Project Boundaries

- Preserve Descuff-owned IR and evidence contracts independent of framework, standard, runtime, and Graphify storage formats.
- Keep external standards behind adapters.
- Keep Graphify optional and behind `GraphifyAdapter`.
- Prefer small, focused changes with tests that cover the behavior being changed.

## Safety And Validation

- Runtime analysis is read-only by default.
- Do not invoke mutating actions without an explicit validation scenario defining setup, expected side effects, verification, and cleanup.
- Never silently expose sensitive or high-consequence capabilities.
- Validation must prove behavior, not just file existence.

## Pull Requests

- Explain the user-facing change.
- Include tests for behavior changes.
- Run `pnpm run ci` before submitting when possible.
- Do not commit `.descuff/`, `graphify-out/`, `dist/`, `node_modules/`, or local build artifacts.
