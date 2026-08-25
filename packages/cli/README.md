# Descuff CLI

Command-line entry point for Descuff, an open-source tool that helps developers turn local Next.js apps into websites AI agents can understand and use.

```bash
npx descuff start .
npx descuff finish .
npx descuff install all .
npx descuff install codex --global
npx descuff enrich .
```

`start` creates a baseline, plan, and coding-agent prompt in `.descuff/`. `finish` rescans after implementation and writes the before/after validation report.

`install` writes local preview skill instructions for Codex, Claude Code, and Cursor under `.descuff/skills/`. `install codex --global` installs the Codex skill under `$CODEX_HOME/skills/descuff` or `~/.codex/skills/descuff`.

`enrich` deterministically validates `.descuff/semantic-enrichment.json` and writes a reviewable semantic diff.

The current public preview targets local Next.js applications and keeps automatic source writes disabled. It detects App Router and Pages Router projects, common nested monorepo app layouts, API routes, Server Actions, auth boundaries, route visibility, and common agent-facing standards.
