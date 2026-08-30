# Descuff CLI

Command-line entry point for Descuff, an open-source tool that helps developers turn local Next.js apps into websites AI agents can understand and use.

```bash
npx descuff doctor .
npx descuff start .
npx descuff finish .
npx descuff diff .
npx descuff check .
npx descuff install --platform codex
npx descuff install --platform claude-code .
npx descuff install --platform cursor .
npx descuff enrich .
```

`doctor` diagnoses the current root before first use, writes `.descuff/doctor.json` and `.descuff/doctor.md`, and suggests likely nested app roots when Descuff was run from the wrong folder.

`start` creates a baseline, plan, and coding-agent prompt in `.descuff/`. `finish` rescans after implementation and writes the before/after validation report.

Optional `.descuff/runtime.json` lets `scan` and `validate` inspect a running local app in the browser. WebMCP tool execution requires explicit read-only scenarios in that file; Descuff does not guess tool inputs or execute mutating actions by default.

`diff` compares changed files against `.descuff/drift-baseline.json` and writes a drift impact report. `check` fast-passes irrelevant changes, writes a validation plan, and runs validation when routes, APIs, capabilities, auth boundaries, or published standards may have changed.

Keep `.descuff/` ignored in public repositories by default. For CI drift checks, preserve `.descuff/drift-baseline.json` as a protected cache/artifact from the last successful base-branch run, or regenerate it from the base branch before running `descuff check` on a pull request.

`install --platform codex` installs the Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`. `install --platform claude-code` writes a project slash command to `.claude/commands/descuff.md`. `install --platform cursor` writes a project rule to `.cursor/rules/descuff.mdc`. `install all` still writes local preview skill instructions under `.descuff/skills/`. Install output explains the exact invocation and reminds users to run `finish` after explicit Descuff plan implementation, or `check` for ordinary later edits.

`enrich` deterministically validates `.descuff/semantic-enrichment.json` and writes a reviewable semantic diff. `validate` writes structured readiness explanations so tools can distinguish complete categories, acceptable gaps, recommendations, and blockers.

`scan` also writes optional Graphify/native correlation artifacts when `graphify-out/graph.json` exists. Missing or invalid Graphify output is recorded but does not block native analysis.

The current public preview targets local Next.js applications and keeps automatic source writes disabled. It detects App Router and Pages Router projects, common nested monorepo app layouts, API routes, Server Actions, auth boundaries, route visibility, and common agent-facing standards.
