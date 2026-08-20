# ADR-0006: Command Lifecycle And Fix Semantics

## Status

Accepted

## Context

Descuff must support coding-agent implementation without depending on its own hosted LLM. The phrase `descuff fix` can be misread as a command that edits application code directly or invokes an LLM.

The standards adapter contract also has `generate`, while the product has planning, safe application, coding-agent implementation, and validation.

## Decision

Use this command lifecycle:

- `descuff scan`: collect evidence and write scan artifacts.
- `descuff report`: render a report from scan artifacts.
- `descuff plan`: refresh `.descuff/plan.json` and `.descuff/plan.md`.
- `descuff fix`: refresh the plan and coding-agent workflow instructions only. It does not invoke an LLM and does not directly edit application source.
- `descuff apply-safe`: apply only deterministic, approved, safe generated changes.
- `descuff validate`: independently verify behavior.

Adapter `generate` methods return proposed changes in memory. They never write files. Planning decides how those changes are represented. `apply-safe` is the only command that writes generated safe changes automatically.

## Consequences

- Descuff remains compatible with Codex, Claude Code, and other developer-owned coding agents.
- The CLI can expose a familiar `fix` workflow without hiding LLM behavior.
- File writes are constrained to explicit commands.
- Validation remains the authority for completion.

Tradeoff:

- `descuff fix` is intentionally less magical than the name might imply, so documentation and CLI help must state its semantics clearly.
