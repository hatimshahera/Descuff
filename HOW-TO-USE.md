# How To Use Descuff

Descuff is an early public preview for local Next.js codebases. Run it from the root of the app you want to improve.

Install is optional. The easiest path is:

```bash
npx descuff doctor .
npx descuff start .
```

## 1. Check The Project Root

```bash
cd my-nextjs-app
npx descuff doctor .
```

This writes `.descuff/doctor.json` and `.descuff/doctor.md`.

Use `doctor` when:

- you are running Descuff for the first time
- you are unsure whether you are in the right folder
- a monorepo may contain the app under a nested folder such as `apps/web`
- you want to confirm `.descuff/`, Git, and optional Graphify state before starting

If the current root is unsupported, `doctor` exits non-zero with typed blocker codes and next steps. It does not edit application source, install dependencies, call an LLM, launch a browser, submit forms, or run mutating flows.

## 2. Start With A Baseline

```bash
npx descuff start .
```

This creates `.descuff/` with:

- `baseline.json`: readiness score, validation result, detected routes, APIs, capabilities, and standards before implementation
- `model.json`: semantic model of the app
- `assessments.json`: standard recommendations
- `generated-changes.json`: proposed standards work
- `graphify-enrichment.json` and `graphify-enrichment.md`: optional Graphify/native correlation summary
- `skill-evidence-packet.json` and `skill-evidence-packet.md`: compact evidence for host-agent skill workflows
- `semantic-enrichment-prompt.md` and `semantic-enrichment-template.json`: strict host-agent semantic enrichment handoff artifacts
- `plan.md`: implementation plan
- `codex-prompt.md`: prompt for your coding agent

The terminal summary shows detected route/API/capability/form counts, standards status, validation failures and warnings, readiness notes, generated artifact paths, and the next command.

## 3. Optional Browser Runtime Evidence

By default, Descuff uses conservative synthetic runtime evidence so first runs do not require a running dev server.

To let Descuff inspect a running local app in the browser, start your app and create `.descuff/runtime.json`:

```json
{
  "baseUrl": "http://localhost:3000",
  "routes": ["/"],
  "apiOperations": [{ "method": "GET", "path": "/api/products" }],
  "webMcpToolScenarios": [
    {
      "toolName": "search_products",
      "input": { "q": "shirt" },
      "expectedApi": { "method": "GET", "path": "/api/products" },
      "description": "Safe read-only product search validation"
    }
  ]
}
```

Then run:

```bash
npx descuff scan .
npx descuff validate .
```

If `runtime.json` is missing or malformed, Descuff falls back to synthetic runtime evidence and records a typed warning. WebMCP tool execution still requires an explicit read-only scenario; Descuff does not guess inputs or execute mutating/high-consequence actions.

## 4. Give The Plan To Your Coding Agent

For Codex, install the tested skill once:

```bash
npx descuff install --platform codex
```

Then invoke it in Codex with:

```text
$descuff .
```

For Claude Code, install the project command from the app root:

```bash
npx descuff install --platform claude-code .
```

Then invoke it in Claude Code with:

```text
/descuff .
```

For Cursor, install the project rule from the app root:

```bash
npx descuff install --platform cursor .
```

Then ask Cursor Agent to Descuff the app from that project.

If you do not want a host-specific install, paste this into Codex, Cursor, Claude Code, or another coding agent:

```text
Use Descuff to make this Next.js app more usable by AI agents.

Read:
- .descuff/baseline.json
- .descuff/model.json
- .descuff/assessments.json
- .descuff/generated-changes.json
- .descuff/skill-evidence-packet.json
- .descuff/semantic-enrichment-prompt.md
- .descuff/semantic-enrichment-template.json
- .descuff/plan.md
- .descuff/codex-prompt.md

Write evidence-backed semantic enrichment to .descuff/semantic-enrichment.json using only evidence IDs from the packet.

Run:

  npx descuff enrich .

Inspect .descuff/semantic-enrichment-diff.md before implementation.

Implement the accepted plan items conservatively. Preserve existing UI, routes, behavior, styling, and visible copy unless the plan requires a metadata-only standards change.

Do not expose private, sensitive, mutating, or high-consequence actions without explicit approval.

After implementation, run:

  npx descuff finish .

Also run the project checks that exist, such as lint, build, and tests.

Return a final report with baseline score, files changed, standards added, final score, before/after comparison, remaining blockers, and confirmation that UI behavior was preserved.
```

## 5. Finish And Compare

After the coding agent implements the plan:

```bash
npx descuff finish .
```

Descuff writes:

- `final-validation.json`: final readiness and validation result
- `before-after.md`: human-readable before/after report
- `drift-baseline.json`: baseline used by later `diff` and `check` runs

Example:

```text
descuff finish passed
Readiness: 60/100 -> 85/100
Failures: 0 -> 0
Warnings: 0 -> 0
Before/after report: .descuff/before-after.md
```

## 6. Read The Result

Open:

```bash
.descuff/before-after.md
```

Check:

- readiness score improvement
- standards added
- validation failures
- validation warnings
- remaining lost readiness points
- whether sensitive or mutating capabilities were preserved safely

## 7. Keep Readiness From Drifting

After a successful `start` or `finish`, Descuff writes `.descuff/drift-baseline.json`.

Keep `.descuff/` local by default. The drift baseline is a generated last-known-good snapshot, so public repos usually should not commit it. In CI, either preserve `.descuff/drift-baseline.json` as a protected cache/artifact from the last successful main-branch run, or regenerate it from the base branch before running `check` on a pull request.

Use `diff` to see whether a change can affect agent readiness:

```bash
npx descuff diff .
```

Use `check` in CI:

```bash
npx descuff check .
```

`check` fast-passes changes such as docs, tests, styles, images, and GitHub metadata. If a change touches routes, APIs, capabilities, auth boundaries, or published agent-facing standards, Descuff runs validation and writes `.descuff/drift-check.json` plus `.descuff/drift-report.md`.

The drift report includes a validation plan with affected suites such as static standards, source fingerprints, runtime observations, WebMCP behavior, security model, and capability confidence. Descuff runs targeted suites for supported drift classes, and falls back to full validation when a narrower targeted validator cannot prove safety on its own.

When validation fails, the report maps low-level validation failures into drift-oriented repair codes such as `WEBMCP_TOOL_DISCONNECTED`, `OPENAPI_BEHAVIOR_MISMATCH`, `MACHINE_CONTRACT_STALE`, and `STRUCTURED_METADATA_STALE`.

CI systems can pass changed files directly:

```bash
DESCUFF_CHANGED_FILES="app/page.tsx,app/api/search/route.ts" npx descuff check .
```

Or compare against a base ref:

```bash
DESCUFF_BASE_REF=origin/main npx descuff check .
```

Minimal GitHub Actions example:

```yaml
name: Descuff

on:
  pull_request:

jobs:
  agent-readiness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: DESCUFF_BASE_REF=origin/main npx descuff check .
```

## Command Reference

```bash
npx descuff start .
```

Baseline, validate, plan, and write a coding-agent prompt.

```bash
npx descuff doctor .
```

Diagnose the current root, support status, `.descuff/` artifact state, optional Graphify state, Git availability, and likely nested app roots.

```bash
npx descuff finish .
```

Rescan, validate, and compare against the baseline.

```bash
npx descuff scan .
```

Write raw analysis and semantic model artifacts.

```bash
npx descuff report .
```

Print the application type, route/API count, capability count, and standard status.

```bash
npx descuff plan .
```

Write only the implementation plan files.

```bash
npx descuff diff .
```

Compare changed files against the latest drift baseline and report whether validation is needed.

```bash
npx descuff check .
```

Fast-pass irrelevant changes and validate changes that can affect agent readiness.

```bash
npx descuff install all .
```

Write local preview skill instructions for Codex, Claude Code, and Cursor under `.descuff/skills/`.

```bash
npx descuff install --platform codex
```

Install the Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`.

```bash
npx descuff install --platform claude-code .
```

Install a Claude Code project slash command at `.claude/commands/descuff.md`.

```bash
npx descuff install --platform cursor .
```

Install a Cursor project rule at `.cursor/rules/descuff.mdc`.

```bash
npx descuff install codex --global
```

Legacy alias for the Codex platform install.

```bash
npx descuff enrich .
```

Validate `.descuff/semantic-enrichment.json` after a host agent fills it, then write `.descuff/semantic-enrichment-diff.md`.

```bash
npx descuff validate .
```

Freshly rescan and validate the current app state.

The `.descuff/validation.json` report includes `readinessExplanations` with structured statuses for complete categories, acceptable gaps, recommendations, and blockers.

## What To Commit

Commit source and standards files that the coding agent added, such as:

- `public/llms.txt`
- Schema.org JSON-LD changes
- `openapi.json`
- `public/openapi.json`
- `public/.well-known/api-catalog`
- browser WebMCP registration code and `.descuff/webmcp-implementation-plan.md`, only when Descuff recommends safe public read tools

Usually do not commit `.descuff/`, because it contains local absolute paths and generated working artifacts. Add it to `.gitignore` unless you intentionally want to keep project-local reports.

## Current Limitations

- The current public preview supports local Next.js codebases, not arbitrary deployed URLs.
- `apply-safe` does not write application source automatically yet.
- Descuff guides your coding agent; it does not directly call an LLM.
- WebMCP support is implementation-plan and validation oriented; static `webmcp.json` metadata alone is not treated as proof.
- Readiness scoring is useful for comparison, not a universal quality grade for every kind of app.
