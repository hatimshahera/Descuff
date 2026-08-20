# Ecommerce Fixture

Validated Next.js ecommerce fixture for the first Descuff release path.

This fixture contains:

- App Router pages
- a Pages Router page
- API routes
- server-action evidence
- middleware evidence
- existing `public/llms.txt`
- existing `openapi.json`

Release command path:

```bash
pnpm build
node packages/cli/dist/index.js scan fixtures/ecommerce
node packages/cli/dist/index.js report fixtures/ecommerce
node packages/cli/dist/index.js plan fixtures/ecommerce
node packages/cli/dist/index.js validate fixtures/ecommerce
```

The current expected validation result is:

```text
descuff validate passed
Readiness: 100/100
Failures: 0
Warnings: 0
```
