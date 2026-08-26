# Contributing

Thanks for helping improve Descuff. This project is a TypeScript/pnpm monorepo for the `descuff` CLI and its analyzer, standards, workflow, reporting, and validation packages.

Descuff changes should be conservative. The tool analyzes other people's applications, generates agent-facing implementation plans, and validates safety boundaries. A small incorrect change can make users expose the wrong capability or trust a bad validation result.

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

## Before Opening A Change

- Start with an issue or a clear proposal for behavior changes that affect scoring, validation, standards output, or CLI workflow.
- Keep pull requests focused. Do not combine analyzer changes, scoring changes, docs rewrites, and package-release changes unless they are directly tied together.
- Preserve public CLI behavior unless the change intentionally updates it and documents the migration.
- Do not commit generated artifacts such as `.descuff/`, `graphify-out/`, `dist/`, `node_modules/`, coverage reports, or local build output.

## Architecture Boundaries

- Preserve Descuff-owned IR and evidence contracts independent of framework, standard, runtime, and Graphify storage formats.
- Keep external standards behind adapters.
- Keep Graphify optional and behind `GraphifyAdapter`.
- Keep framework-specific logic inside analyzer packages, such as `packages/analyzers/nextjs`.
- Keep scoring and semantic contracts in `packages/ir`.
- Keep generated standard-specific output inside `packages/standards/*`.
- Keep CLI orchestration thin. Prefer implementing reusable behavior in packages and calling it from `packages/cli`.

## Safety And Validation

- Runtime analysis is read-only by default.
- Do not invoke mutating actions without an explicit validation scenario defining setup, expected side effects, verification, and cleanup.
- Never silently expose sensitive or high-consequence capabilities.
- Validation must prove behavior, not just file existence.
- Security-sensitive changes need tests for private routes, mutating endpoints, high-consequence capabilities, and safe non-exposure behavior where relevant.
- Do not weaken a validation failure or warning only to make a fixture pass. Fix the underlying model, adapter, fixture, or test expectation.

## Testing Expectations

- Analyzer changes need fixture coverage for the relevant framework shape.
- IR changes need semantic model or validation tests in `packages/ir/test`.
- Standards adapter changes need package-local tests under `packages/standards/*/test`.
- CLI workflow changes need tests in `packages/cli/test` and must keep `pnpm smoke` passing.
- End-to-end behavior changes should update or add a validator fixture test when the change affects the scan-to-validation flow.

Run before submitting:

```bash
pnpm run ci
```

## Pull Requests

- Explain the user-facing change.
- Include tests for behavior changes.
- Call out safety implications, especially for generated standards, WebMCP browser-tool registration, authenticated routes, Server Actions, or mutating APIs.
- Include before/after CLI output when changing command behavior.
- Use a one-line release heading in `CHANGELOG.md` for dated entries: `## version - YYYY-MM-DD - Short Release Title`.
- Keep unrelated formatting churn out of the diff.
