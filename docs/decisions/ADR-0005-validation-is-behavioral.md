# ADR-0005: Validation Is Behavioral

## Status

Accepted

## Context

Descuff is the source of truth for what should exist and whether it works. File existence alone cannot prove that generated agent-facing interfaces are correct, safe, or connected to real application behavior.

## Decision

`descuff validate` must validate behavior across static, build, existing tests, runtime, security, and regression levels.

A task or phase is complete only when its acceptance criteria and associated tests pass.

## Consequences

- Generated standards cannot be considered successful until they work against the running application.
- Existing application test failures block success unless explicitly recorded in a scan baseline with evidence.
- Security and human UI regression checks are first-class validation concerns.
- Failure output must be typed and actionable for humans and coding agents.

Tradeoff:

- Validation requires more fixture and runtime infrastructure, but prevents false-positive "agent ready" claims.
