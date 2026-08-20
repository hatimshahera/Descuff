# Validation

`descuff validate` is a first-class product feature. It independently proves that generated agent-facing interfaces are valid, safe, and behaviorally connected to the real application.

## Validation Principle

Validation must test behavior, not merely file existence.

A generated standard is not valid until Descuff proves:

- syntax and schemas are correct
- referenced routes exist
- runtime behavior matches the semantic model
- security boundaries remain intact
- existing application tests still pass
- human-facing UI and behavior did not regress unless explicitly approved

## Validation Levels

### Static

Checks:

- generated syntax
- JSON schema conformance
- malformed JSON-LD
- OpenAPI validity
- API Catalog validity
- WebMCP definitions
- `llms.txt` structure
- route reference consistency

### Build

Checks:

- package installation state
- Next.js build
- TypeScript checks
- repository linting where configured

### Existing Tests

Descuff must run the repository's existing tests when configured. Existing failing tests block success unless the failure is explicitly recorded in a scan baseline with evidence.

Baseline handling:

- `scan` records configured test commands, exit codes, and failing test identifiers.
- `validate` compares post-change test results against the recorded baseline.
- New failures always block success.
- A baseline exception must be stored explicitly with evidence.
- Descuff must not infer that a failure is pre-existing merely because it currently fails.

### Runtime

Checks:

- application launches
- generated endpoints are reachable
- WebMCP tools are discoverable and invocable
- API responses match declared schemas
- JSON-LD appears on expected pages
- invalid inputs are rejected
- runtime evidence correlates with source evidence

Runtime configuration must support:

- install command
- build command
- test command
- development/start command
- base URL and port
- readiness URL or readiness condition
- environment-variable names
- authenticated test-state setup
- routes that may be visited
- actions that may be invoked
- teardown behavior

Credentials must be referenced through environment-variable names or external setup hooks, never written into the IR, plans, or reports.

Runtime analysis is read-only by default. No `POST`, `PUT`, `PATCH`, `DELETE`, server action, form submission, or WebMCP write tool may be invoked without an explicit validation scenario. Each scenario must define setup, expected side effects, verification, and cleanup.

`HIGH_CONSEQUENCE` actions must not be automatically executed after ordinary approval. They require a user-supplied safe test environment or mock.

### Security

Checks:

- authenticated operations remain protected
- private information is not exposed
- mutating actions match their risk classification
- high-consequence actions require explicit approval
- generated interfaces do not bypass existing authorization

### Regression

Checks:

- visual snapshots or DOM invariants for key pages
- preserved routes and navigation
- no unexpected copy, layout, or interaction changes

## Typed Failure Output

Validation failures must be actionable for humans and coding agents.

```text
WEBMCP_TOOL_RUNTIME_MISMATCH

Tool:
search_products

Expected:
GET /api/products/search

Observed:
404

Evidence:
app/api/products/search/route.ts

Suggested action:
Verify generated WebMCP handler points to the current route.
```

## Completion Rule

Codex must not mark a task or phase complete merely because code was written. It is complete only when its acceptance criteria and associated tests pass.
