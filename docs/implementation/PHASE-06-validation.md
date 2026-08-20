# Phase 06 - Validation

## Objective

Make `descuff validate` independently prove standards correctness, runtime behavior, security boundaries, and regression safety.

## Dependencies

- Requires Phase 02 runtime analysis.
- Requires Phase 03 IR.
- Requires Phase 04 adapters.
- Receives implementation plans from Phase 05.

## Tasks

- [x] Implement static validation.
- [x] Implement build validation.
- [x] Integrate existing repository test commands.
- [x] Record test baseline during scan.
- [x] Compare post-change test results to baseline.
- [ ] Implement runtime validation.
- [x] Implement runtime configuration schema.
- [x] Implement explicit validation scenarios for mutating flows.
- [x] Implement standard-specific validation runners.
- [x] Implement security validation.
- [x] Implement human UI regression validation.
- [x] Implement typed failure catalog.
- [ ] Integrate readiness scoring and validation results.
- [ ] Add repair-oriented suggested actions.

## Acceptance Criteria

- Validation checks behavior, not only file existence.
- Existing application tests are run and failing tests block success.
- Pre-existing failures require an explicit baseline with command, exit code, failing identifiers, and evidence.
- Runtime validation proves generated interfaces correspond to real application behavior.
- Runtime analysis is read-only by default unless an explicit scenario authorizes a mutating action.
- High-consequence runtime actions require a user-supplied safe test environment or mock.
- Security validation confirms auth boundaries and capability risk rules.
- Regression validation detects unexpected human UI changes.
- Failures are typed, specific, and actionable.

## Required Testing

- Validator unit tests.
- Build/test runner integration tests.
- Runtime Playwright validation tests.
- Security fixture tests.
- UI regression tests.
- Full scan-to-validate fixture E2E tests.

## Validation Notes

- Static validator unit tests cover standard-adapter validation issues, generated-change metadata, typed actionable failures, warning separation, and intentionally invalid generated changes.
- Build and existing-test command integration tests use an injected runner and fail nonzero command results without assuming failures are pre-existing.
- Existing-test baseline tests record command, exit code, failing identifiers, and evidence; validation accepts only matching evidenced baseline failures and blocks new failures.
- Runtime config tests enforce HTTP(S) base URLs, environment-variable names without embedded values, explicit mutating scenarios, complete side-effect verification/cleanup, and safe test environments for high-consequence operations.
- Standard-specific validation runner tests execute adapter `validate` methods, aggregate typed failures, and convert runner exceptions into actionable validation failures.
- Security validation tests block authenticated/admin capabilities without auth boundaries, public authenticated-read exposure, and public sensitive or high-consequence capabilities.
- UI regression tests compare route invariants, block missing routes and unexpected title/heading changes, and warn on accessibility landmark changes.

## Completion Rule

Do not mark validation complete until it catches intentionally broken fixture implementations and passes correct fixture implementations.
