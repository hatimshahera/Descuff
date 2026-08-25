# Descuff CLI

Command-line entry point for Descuff, an open-source tool that helps developers turn local Next.js apps into websites AI agents can understand and use.

```bash
npx descuff start .
npx descuff finish .
npx descuff install --platform codex
npx descuff install --platform claude-code .
npx descuff install --platform cursor .
npx descuff enrich .
```

`start` creates a baseline, plan, and coding-agent prompt in `.descuff/`. `finish` rescans after implementation and writes the before/after validation report.

`install --platform codex` installs the Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`. `install --platform claude-code` writes a project slash command to `.claude/commands/descuff.md`. `install --platform cursor` writes a project rule to `.cursor/rules/descuff.mdc`. `install all` still writes local preview skill instructions under `.descuff/skills/`.

`enrich` deterministically validates `.descuff/semantic-enrichment.json` and writes a reviewable semantic diff.

`scan` also writes optional Graphify/native correlation artifacts when `graphify-out/graph.json` exists. Missing or invalid Graphify output is recorded but does not block native analysis.

The current public preview targets local Next.js applications and keeps automatic source writes disabled. It detects App Router and Pages Router projects, common nested monorepo app layouts, API routes, Server Actions, auth boundaries, route visibility, and common agent-facing standards.
