# How To Use Descuff

Descuff is an early public preview for local Next.js codebases. Run it from the root of the app you want to improve.

Install is optional. The easiest path is:

```bash
npx descuff start .
```

## 1. Start With A Baseline

```bash
cd my-nextjs-app
npx descuff start .
```

This creates `.descuff/` with:

- `baseline.json`: readiness score, validation result, detected routes, APIs, capabilities, and standards before implementation
- `model.json`: semantic model of the app
- `assessments.json`: standard recommendations
- `generated-changes.json`: proposed standards work
- `plan.md`: implementation plan
- `codex-prompt.md`: prompt for your coding agent

## 2. Give The Plan To Your Coding Agent

Paste this into Codex, Cursor, Claude Code, or another coding agent:

```text
Use Descuff to make this Next.js app more usable by AI agents.

Read:
- .descuff/baseline.json
- .descuff/model.json
- .descuff/assessments.json
- .descuff/generated-changes.json
- .descuff/plan.md
- .descuff/codex-prompt.md

Implement the plan conservatively. Preserve existing UI, routes, behavior, styling, and visible copy unless the plan requires a metadata-only standards change.

Do not expose private, sensitive, mutating, or high-consequence actions without explicit approval.

After implementation, run:

  npx descuff finish .

Also run the project checks that exist, such as lint, build, and tests.

Return a final report with baseline score, files changed, standards added, final score, before/after comparison, remaining blockers, and confirmation that UI behavior was preserved.
```

## 3. Finish And Compare

After the coding agent implements the plan:

```bash
npx descuff finish .
```

Descuff writes:

- `final-validation.json`: final readiness and validation result
- `before-after.md`: human-readable before/after report

Example:

```text
descuff finish passed
Readiness: 60/100 -> 85/100
Failures: 0 -> 0
Warnings: 0 -> 0
Before/after report: .descuff/before-after.md
```

## 4. Read The Result

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

## Command Reference

```bash
npx descuff start .
```

Baseline, validate, plan, and write a coding-agent prompt.

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
npx descuff validate .
```

Freshly rescan and validate the current app state.

## What To Commit

Commit source and standards files that the coding agent added, such as:

- `public/llms.txt`
- Schema.org JSON-LD changes
- `openapi.json`
- `public/openapi.json`
- `public/.well-known/api-catalog`
- safe WebMCP metadata, if generated

Usually do not commit `.descuff/`, because it contains local absolute paths and generated working artifacts. Add it to `.gitignore` unless you intentionally want to keep project-local reports.

## Current Limitations

- The current public preview supports local Next.js codebases, not arbitrary deployed URLs.
- `apply-safe` does not write application source automatically yet.
- Descuff guides your coding agent; it does not directly call an LLM.
- Readiness scoring is useful for comparison, not a universal quality grade for every kind of app.
