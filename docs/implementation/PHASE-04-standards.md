# Phase 04 - Standards

## Objective

Implement isolated adapters for first-release standards.

## Dependencies

- Requires Phase 03 semantic IR.
- Validator integration matures in Phase 06.

## Tasks

- [x] Define `StandardAdapter`.
- [x] Define `StandardAssessment`.
- [x] Define `GeneratedChange`.
- [x] Define explicit assess/generate/plan/apply-safe/validate lifecycle.
- [x] Implement dry-run diff support.
- [x] Implement idempotency checks.
- [x] Implement conflict policy for existing files.
- [x] Implement `LlmsTxtAdapter`.
- [ ] Implement `SchemaOrgAdapter`.
- [ ] Implement `OpenApiAdapter`.
- [ ] Implement `ApiCatalogAdapter`.
- [ ] Implement `WebMcpAdapter`.
- [x] Prove vertical E2E path with `llms.txt`.
- [ ] Prove vertical E2E path with Schema.org or OpenAPI.
- [x] Implement sensitive and high-consequence capability approval gates.
- [ ] Integrate safe deterministic generation with `apply-safe`.

## Acceptance Criteria

- All adapters use the same contract.
- Adapter assessments include evidence and rationale.
- `generate` returns proposed changes in memory and never writes files.
- Generated changes are idempotent.
- Existing user files are preserved.
- Existing-file conflicts are skipped, merged, written to companion files, or escalated for approval according to policy.
- `apply-safe` is transactional or leaves recoverable partial changes with a recovery report.
- Sensitive and high-consequence capabilities are not silently exposed.
- WebMCP is treated as experimental/proposed and pinned to a supported draft version.
- UCP could be added later as another adapter without redesigning the IR.

## Required Testing

- Unit tests for each adapter, added in rollout order.
- Golden generated-output tests.
- Vertical scan-to-validation tests for `llms.txt` and one richer standard before full-depth implementation of later adapters.
- Idempotency tests.
- Existing-file preservation tests.
- Approval-gate tests.
- Adapter validation contract tests.

## Completion Rule

Do not mark a standard adapter complete until assess, generate, and validate tests pass for representative fixtures.
