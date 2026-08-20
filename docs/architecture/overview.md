# Descuff Architecture Overview

Descuff analyzes an existing web application, builds a provenance-backed semantic model of what the application exposes, recommends existing agent-facing standards, supports coding-agent implementation, and independently validates the result.

Descuff is not a new agent protocol. It compiles application facts into existing standards and proposed standards: `llms.txt`, WebMCP, Schema.org / JSON-LD, OpenAPI, and RFC 9727 API Catalog.

## Product Boundary

Descuff owns:

- deterministic and runtime evidence collection
- semantic intermediate representation
- standard assessment and generation adapters
- implementation planning
- validation and readiness scoring
- coding-agent workflow instructions

Descuff does not own:

- a hosted LLM dependency for the first release
- an MCP server implementation as a first-release target
- human UI redesign
- business-logic decisions for sensitive or high-consequence actions

## First-Release Target

The first public release targets conventional Next.js applications using:

- App Router
- Pages Router
- TypeScript
- JavaScript
- REST/API routes
- detectable server actions
- forms
- public and authenticated routes

Other frameworks and future standards must be added through adapters without redesigning the core IR.

## Command Responsibilities

- `descuff scan`: read repository and runtime evidence, then write `.descuff/project.json`, `.descuff/evidence.json`, `.descuff/semantic-model.json`, `.descuff/capabilities.json`, `.descuff/standards.json`, `.descuff/plan.json`, and `.descuff/plan.md`.
- `descuff report`: render a concise human-readable summary from the latest scan artifacts.
- `descuff plan`: refresh implementation plans from current scan artifacts without changing application source.
- `descuff fix`: agent-workflow command alias for plan refresh and instructions. It does not invoke an LLM and does not directly edit application source. The developer's existing coding agent reads the plan and performs implementation.
- `descuff apply-safe`: apply only deterministic, approved, safe generated changes.
- `descuff validate`: independently verify static, build, test, runtime, security, and regression behavior.

`generate` and `apply` are separate operations. Standard adapters return proposed changes in memory. Planning combines proposed changes into `.descuff/plan.*`. `apply-safe` writes only changes classified as deterministic and safe.

## System Flow

```text
Repository + running application
        |
        v
Static analyzers + runtime analyzer
        |
        v
Evidence store
        |
        v
Descuff semantic IR
        |
        v
Standard adapters + readiness scoring
        |
        v
Implementation plan
        |
        v
Developer coding agent implements
        |
        v
Descuff validation
```

## Package Boundaries

Planned monorepo packages:

- `packages/cli`: command entry points for `scan`, `report`, `plan`, `fix`, `apply-safe`, and `validate`
- `packages/core`: orchestration, project context, planning, and shared workflow contracts
- `packages/ir`: versioned schemas and TypeScript types for Descuff-owned models
- `packages/config`: optional `descuff.config.ts` loading and validation
- `packages/analyzers/nextjs`: deterministic Next.js source analyzer
- `packages/analyzers/runtime`: Playwright-based runtime analyzer
- `packages/analyzers/graphify`: optional Graphify adapter
- `packages/standards/*`: isolated standard adapters
- `packages/validator`: static, build, test, runtime, security, and regression validation
- `packages/reporter`: human-readable reports and readiness scoring output
- `packages/agent-workflow`: coding-agent instructions and workflow assets

## Dependency Direction

Dependencies must point inward toward Descuff-owned contracts:

```text
CLI -> core -> IR
analyzers -> IR
standard adapters -> IR
validator -> IR + adapter validation contracts
reporter -> IR + readiness results
Graphify adapter -> IR
```

The core IR must not depend on Next.js, Graphify, WebMCP, OpenAPI, or Playwright-specific storage formats.

## Safety Invariants

- Human-facing UI and behavior are unchanged unless explicitly approved.
- High-consequence capabilities are never silently exposed.
- Every semantic conclusion includes evidence.
- Validation checks behavior, not only file existence.
- A task is complete only when its acceptance criteria and tests pass.
- Runtime analysis is read-only by default.
- Credentials are referenced through environment variable names or setup hooks, never stored in IR, plans, or reports.
