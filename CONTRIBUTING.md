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

## Package Boundaries

Descuff is intentionally split into packages where the boundary protects a real product concern:

- Public runtime packages are allowed when the CLI imports them directly, users may reasonably import them later, or the package owns a stable boundary such as IR, validation, analyzers, standards, reporting, drift, or host-agent workflow.
- Keep framework-specific code in analyzer packages and standard-specific code in `packages/standards/*`.
- Prefer adding code to an existing package when the behavior is an implementation detail of that package.
- Do not add a new public package only to organize files. A new public package adds npm publish, dependency graph, registry, and installability risk.
- Every public package must include a minimal `README.md` so npm does not present blank package pages. Internal runtime package READMEs should point most users to the `descuff` CLI instead of duplicating full product docs.
- If a new public package is needed, update `scripts/release-graph.mjs`, `vitest.config.ts`, `tsconfig.packages.json`, package dependency ranges, package README, tests, and release notes in the same change.
- Consider bundling into the CLI only when the code is CLI-only, has no stable reusable contract, and would not be useful to validators, analyzers, standards adapters, or host-agent workflows.

## Release Checks

Run the local release gates before publishing:

```bash
pnpm run release:version -- <version> <short release title>
pnpm run release:check
pnpm run release:install-smoke
pnpm run release:publish-plan -- <version>
```

After publishing, verify npm registry state:

```bash
pnpm run release:registry -- <version>
```

The registry check verifies package packuments, `latest` dist-tags, tarball reachability, internal dependency availability, and a fresh public `npm install descuff@<version>` plus `npx descuff --help`.

Use the recovery drill to inspect the expected response to a simulated broken internal-package publish:

```bash
pnpm run release:recovery-drill
```

## Trusted Publishing

Releases should use GitHub Actions Trusted Publishing instead of local OTP/passkey publishing once npm is configured.

Manual npm setup is required before `.github/workflows/publish.yml` can publish:

- Configure Trusted Publishing for every public Descuff package on npm.
- Use GitHub Actions as the publisher.
- Set the organization/user to `hatimshahera`.
- Set the repository to `Descuff`.
- Set the workflow filename to `publish.yml`.
- Set the environment name to `npm-publish` if npm asks for one.
- Allow `npm publish`.

The workflow runs on `workflow_dispatch`, requires a concrete version input, uses Node 24 so npm supports OIDC publishing, disables package-manager caching for the release job, grants `id-token: write`, runs the release gates, publishes packages in dependency order without `NODE_AUTH_TOKEN`, and then runs the public registry verifier.

Before publishing, the publish script checks whether the target version already exists for any public package and fails before calling `npm publish`, because npm versions are immutable. Before publishing any package with internal dependencies, the publish script rechecks the dependency package packuments, latest dist tags, and tarball URLs from npm. After publishing each package, it waits until that package is publicly readable before moving to dependents. If any internal package is not publicly readable at the target version, the workflow stops before publishing its dependents.

Do not run the publish workflow until every public package manifest already has the target version and all internal ranges point at that version. Use `pnpm run release:version -- <version> <short release title>` to prepare those changes.

## Publish Recovery

If a publish looks broken, do not hide it by silently publishing again.

- Wait briefly only when npm publish succeeded but packuments or tarballs are still propagating.
- Run `pnpm run release:registry -- <version>` before deciding that a version is usable.
- If an internal package is missing or a dependency range is wrong, publish a patch version using the current phase convention instead of trying to rewrite the broken version.
- If `latest` points to a broken version, move `latest` back to the last verified version or forward to a verified patch after the fix is published.
- Deprecate broken versions with a short reason once a working replacement exists.
- Record recovery notes in `CHANGELOG.md` so users can understand which version to install.
- The executable recovery drill maps registry failures to the expected recovery class, so maintainers can verify the policy without breaking npm on purpose.

## Pull Requests

- Explain the user-facing change.
- Include tests for behavior changes.
- Call out safety implications, especially for generated standards, WebMCP browser-tool registration, authenticated routes, Server Actions, or mutating APIs.
- Include before/after CLI output when changing command behavior.
- Use a one-line release heading in `CHANGELOG.md` for dated entries: `## version - YYYY-MM-DD - Short Release Title`.
- Use phase-based preview versions from the next release onward: `0.<phase>.<patch>`. For example, Phase 12 follow-ups use `0.12.1`, `0.12.2`, and Phase 13 starts at `0.13.1`. Already-published npm versions are never rewritten.
- Keep unrelated formatting churn out of the diff.
