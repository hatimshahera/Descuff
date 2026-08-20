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
- [ ] Record test baseline during scan.
- [ ] Compare post-change test results to baseline.
- [ ] Implement runtime validation.
- [ ] Implement runtime configuration schema.
- [ ] Implement explicit validation scenarios for mutating flows.
- [ ] Implement standard-specific validation runners.
- [ ] Implement security validation.
- [ ] Implement human UI regression validation.
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

## Completion Rule

Do not mark validation complete until it catches intentionally broken fixture implementations and passes correct fixture implementations.
