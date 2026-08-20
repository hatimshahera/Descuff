# Descuff Implementation Plan

This is the master tracker. A task or phase is complete only when its acceptance criteria and associated tests pass.

Repository status at plan creation:

- Workspace contained no source files, package manifests, CI, or Git metadata.
- No existing Graphify output was present.
- Planning documentation is the initial project artifact.

## Phase Dependencies

```text
Phase 1 Foundation
  -> Phase 2 Analysis
  -> Phase 3 Semantic Model
  -> Phase 4 Standards
  -> Phase 5 Agent Workflow
  -> Phase 6 Validation
  -> Phase 7 Release
```

Cross-cutting dependencies:

- Fixtures start in Phase 1 and expand through all later phases.
- Minimal versioned evidence and `StructuralAnalysis` contracts start in Phase 1. Phase 2 populates them. Phase 3 transforms them into the semantic `ApplicationModel`.
- Validation scaffolding starts in Phase 1 but becomes product-complete in Phase 6.
- Graphify is optional infrastructure and depends on Phase 2 analyzer contracts.

## Phase 1 - Foundation

- [x] pnpm workspace scaffold
- [x] TypeScript strict configuration
- [x] package boundaries created
- [x] CLI command shell
- [x] minimal versioned evidence contracts
- [x] `StructuralAnalysis` contract
- [x] config loading shell
- [x] Vitest setup
- [x] Playwright setup
- [x] CI workflow
- [x] initial fixtures
- [x] planning and architecture docs

Acceptance criteria:

- `pnpm install` succeeds.
- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` run.
- CLI exposes `descuff scan`, `descuff report`, `descuff plan`, `descuff fix`, `descuff apply-safe`, and `descuff validate` placeholders.
- Package boundaries match the documented monorepo structure.
- Configuration, caches, and process-wide state are passed explicitly through typed contexts or documented cache interfaces.

Required testing:

- CLI smoke tests for every command.
- Package import tests.
- CI workflow dry run or equivalent local command verification.

## Phase 2 - Analysis

- [x] Next.js project detection
- [x] App Router route discovery
- [x] Pages Router route discovery
- [x] API route discovery
- [x] HTTP method extraction
- [x] server action extraction
- [x] form extraction
- [x] authentication middleware detection
- [x] existing standards detection
- [x] Graphify adapter
- [x] runtime evidence correlation

Acceptance criteria:

- Analyzer emits Descuff-owned `StructuralAnalysis`.
- Phase 2 does not create the full semantic `ApplicationModel`; that transformation belongs to Phase 3.
- Static facts include evidence references.
- Runtime observations are correlated with source evidence.
- Graphify output is consumed only through `GraphifyAdapter`.
- Unsupported patterns produce typed warnings rather than silent omissions.

Required testing:

- Unit tests for route and API extraction.
- Fixture tests for App Router and Pages Router applications.
- Runtime Playwright tests for route rendering and network observation.
- Graphify adapter contract tests with sample graph output.

## Phase 3 - Semantic Model

- [x] versioned IR schemas
- [x] evidence index
- [x] entity model
- [x] capability model
- [x] capability risk classification
- [x] application type assessment
- [x] IR validation at boundaries
- [x] deterministic readiness scoring foundation

Acceptance criteria:

- Every semantic conclusion requires evidence.
- Invalid IR fails schema validation with typed errors.
- Capability risk classification covers all required classes.
- Readiness score has deterministic categories, weights, caps, blocking failures, schema version, and lost-point reasons.

Required testing:

- Schema validation tests.
- Capability classification tests.
- IR transformation tests.
- Golden fixture expected IR tests.

## Phase 4 - Standards

- [x] shared `StandardAdapter` contract
- [x] adapter lifecycle contract for assess/generate/plan/apply-safe/validate
- [x] `LlmsTxtAdapter`
- [x] `SchemaOrgAdapter`
- [x] `OpenApiAdapter`
- [x] `ApiCatalogAdapter`
- [x] `WebMcpAdapter`
- [x] vertical E2E path with `llms.txt`
- [x] vertical E2E path with Schema.org or OpenAPI
- [x] idempotent generated changes
- [x] dry-run diffs
- [x] conflict policy for existing files
- [x] sensitive capability approval gates

Acceptance criteria:

- Each adapter can assess, generate, and validate through the common contract.
- `generate` returns proposed changes in memory and never writes files.
- Generated changes are deterministic and idempotent.
- `apply-safe` never exposes sensitive or high-consequence capabilities.
- `apply-safe` is transactional or leaves recoverable partial changes with a recovery report.
- Standard-specific concepts do not leak into the core IR.
- WebMCP is treated as experimental/proposed and pinned to a supported draft version.

Required testing:

- Unit tests for each adapter.
- Golden generated-output tests.
- Vertical scan-to-validation tests for `llms.txt` and one richer standard before full-depth implementation of later adapters.
- Idempotency tests.
- Safety gate tests.

## Phase 5 - Agent Workflow

- [x] `.descuff/plan.json` schema
- [x] `.descuff/plan.md` renderer
- [x] `descuff fix` coding-agent instructions
- [x] `descuff fix` non-LLM command semantics
- [x] minimal source-reading guidance
- [x] Graphify developer workflow instructions
- [x] `pnpm graph:refresh`

Acceptance criteria:

- Coding agents can follow generated plans without Descuff owning an LLM API key.
- `descuff fix` refreshes plans and workflow instructions only; it does not invoke an LLM and does not directly edit application source.
- Plans distinguish automatic, approval-required, and blocked changes.
- Agent instructions require scan, implementation, existing tests, validation, and repair loop.
- Graphify is configured as developer infrastructure after repository architecture exists.

Required testing:

- Plan schema tests.
- Renderer snapshot tests.
- Agent workflow fixture dry runs.
- Graphify command smoke test when Graphify is available.

Validation note:

- Agent workflow dry-run tests prove fixture execution and typed validation failure blocking.
- `pnpm smoke` asserts `graph:refresh` and repository Graphify guidance; live Graphify command smoke is blocked locally because `graphify` is unavailable.

## Phase 6 - Validation

- [x] static validation
- [x] build validation
- [x] existing test runner integration
- [x] test baseline recording and comparison
- [ ] runtime validation
- [x] runtime configuration schema
- [x] explicit validation scenarios for mutating flows
- [ ] security validation
- [ ] regression validation
- [x] typed failure catalog
- [ ] readiness report integration

Acceptance criteria:

- `descuff validate` fails clearly with typed actionable errors.
- Validation proves behavior for generated standards.
- Existing test failures block success unless they match a recorded scan baseline with explicit evidence.
- Security boundaries and human UI invariants are checked.
- Runtime analysis is read-only by default unless an explicit validation scenario allows invocation.

Required testing:

- Validator unit tests.
- Build/test command integration tests.
- Playwright runtime validation tests.
- Security regression fixture tests.
- End-to-end fixture validation.

## Phase 7 - Release

- [ ] complete README
- [ ] installation instructions
- [ ] contributing guide
- [ ] changelog
- [ ] license
- [ ] public examples
- [ ] CI green on all required checks
- [ ] package publishing dry run
- [ ] no known critical or high-severity defects

Acceptance criteria:

- A developer can run `npx descuff scan` on a real Next.js app and receive a trustworthy report.
- A coding agent can implement the plan refreshed by `descuff fix`.
- `npx descuff validate` independently proves generated standards work.
- Documentation explains architecture, usage, safety model, and contribution workflow.

Required testing:

- Full fixture E2E tests.
- CLI smoke tests from packaged artifact.
- Release checklist verification.
- Documentation link and command verification.
