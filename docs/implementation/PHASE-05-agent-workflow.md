# Phase 05 - Agent Workflow

## Objective

Create the implementation planning and coding-agent workflow that lets the developer's existing agent perform safe fixes.

## Dependencies

- Requires Phase 03 semantic IR.
- Uses Phase 04 adapter assessments and generated-change plans.
- Feeds Phase 06 validation.

## Tasks

- [x] Define `.descuff/plan.json` schema.
- [x] Render `.descuff/plan.md`.
- [x] Distinguish automatic, approval-required, and blocked changes.
- [x] Add coding-agent instructions for `descuff fix`.
- [x] Define `descuff fix` as a non-LLM plan refresh and workflow-instruction command.
- [x] Require scan, focused source reading, implementation, tests, validation, and repair loop.
- [x] Preserve human UI rule in agent instructions.
- [x] Add Graphify development guidance.
- [x] Add `pnpm graph:refresh`.
- [x] Configure repository agent instructions to query Graphify before broad traversal after Graphify is generated.

## Acceptance Criteria

- Generated plans are machine-readable and human-readable.
- Plan items include acceptance criteria, evidence, safety classification, and validation requirements.
- Coding agents do not need a Descuff-owned OpenAI or Anthropic API key.
- `descuff fix` does not invoke an LLM and does not directly edit application source.
- Instructions prevent trusting implementation completion without validation.
- Graphify remains developer infrastructure, not core architecture.

## Required Testing

- Plan schema tests.
- Markdown renderer tests.
- Fixture plan snapshot tests.
- Agent workflow dry-run tests.
- Graphify command smoke test when available.

## Validation Notes

- Agent workflow dry-run tests prove a fixture plan can complete only after pending items are executed and validation passes.
- Agent workflow dry-run tests include an intentionally broken fixture implementation blocked by a typed validation failure.
- `pnpm smoke` asserts the `graph:refresh` script and repository Graphify agent instructions.
- Live Graphify command smoke is blocked in the local environment because the `graphify` binary is unavailable.

## Completion Rule

Do not mark workflow tasks complete until a coding agent can execute a fixture plan and validation can catch incorrect implementations.
