# Descuff CLI

Command-line entry point for Descuff, an open-source tool that helps developers turn local Next.js apps into websites AI agents can understand and use.

```bash
npx descuff start .
npx descuff finish .
```

`start` creates a baseline, plan, and coding-agent prompt in `.descuff/`. `finish` rescans after implementation and writes the before/after validation report.

The current public preview targets local Next.js applications and keeps automatic source writes disabled.
