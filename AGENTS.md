# Repository Instructions

This repository is planned and implemented through the documentation in `docs/`.

## Required Reading

Before writing production code:

- Read `docs/implementation/PLAN.md`.
- Read the phase file for the work being performed.
- Read the relevant files in `docs/architecture/`.
- Read any relevant ADRs in `docs/decisions/`.

## Planning Discipline

- Work one phase at a time unless the user explicitly asks otherwise.
- Keep `docs/implementation/PLAN.md` and the active phase file synchronized.
- Break work into checkable tasks with dependencies, acceptance criteria, and required tests.
- Do not mark a task or phase complete because code was written. Mark it complete only when its acceptance criteria and associated tests pass.
- If a test cannot be run, leave the task incomplete and document the blocker.

## Architecture Discipline

- Preserve the phase boundaries in the plan.
- Do not change later phases merely to make the current phase easier to pass.
- Keep Descuff-owned IR and evidence contracts independent of framework, standard, runtime, and Graphify storage formats.
- Isolate external standards behind adapters.
- Keep Graphify optional and behind `GraphifyAdapter`.
- Record newly discovered architectural decisions as ADRs.

## Safety And Validation

- Preserve human-facing UI and behavior unless the user explicitly approves a change.
- Treat runtime analysis as read-only by default.
- Do not invoke mutating actions without an explicit validation scenario defining setup, expected side effects, verification, and cleanup.
- Do not execute high-consequence actions unless a user-supplied safe test environment or mock exists.
- Never expose sensitive or high-consequence capabilities silently.
- Validation must prove behavior, not just file existence.

## Working With Existing Changes

- Preserve existing user work.
- Do not revert changes you did not make unless the user explicitly asks.
- If existing changes affect the task, work with them or report a blocker.
- Prefer small, phase-aligned changes over broad refactors.
- Avoid guessing when evidence is missing; record uncertainty and blockers explicitly.
