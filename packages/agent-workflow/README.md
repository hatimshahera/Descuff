# @descuff/agent-workflow

Agent workflow planning and instruction rendering for Descuff.

It owns host-agent handoff contracts, including legacy semantic enrichment and the Phase 19 LLM discovery schema/validator used by `descuff enrich`.

This is a public runtime dependency of the `descuff` CLI. Most users should install and run the CLI instead:

```bash
npx descuff start .
```

Use this package directly only if you are building on Descuff internals.
