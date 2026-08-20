# Next Potential Features

These are ten high-impact features that would improve Descuff as a service and product. The package should remain the deterministic source of truth; agent integrations should sit on top of it.

## 1. Codex Skill Installer

Add:

```bash
npx descuff install --platform codex
```

This would install a Descuff skill so users can type `$descuff .` in Codex instead of pasting a long prompt. The skill should call `npx descuff start .`, read `.descuff/codex-prompt.md`, implement the plan, run checks, then call `npx descuff finish .`.

## 2. Browser/URL Baseline Mode

Add a lightweight deployed-site mode:

```bash
npx descuff scan-url https://example.com
```

This should not replace source analysis, but it can detect public `llms.txt`, JSON-LD, OpenAPI links, API Catalog, sitemap, robots metadata, and basic route discoverability for marketing and audit use cases.

## 3. Framework Adapters Beyond Next.js

Add analyzer packages for:

- Remix / React Router
- Astro
- SvelteKit
- Nuxt
- Express/Fastify API services

Each adapter should emit Descuff-owned `StructuralAnalysis`, not framework-specific output.

## 4. First-Class Before/After Dashboard

Turn `.descuff/before-after.md` into an HTML report:

```bash
npx descuff report --html
```

It should show readiness delta, standards added, routes documented, APIs covered, risks preserved, and remaining blockers.

## 5. CI Mode

Add:

```bash
npx descuff ci .
```

This should fail pull requests when agent-facing standards regress, validation failures appear, or readiness drops below a configured threshold.

## 6. Config File

Add `descuff.config.ts` support for:

- app type hints
- routes to include/exclude
- expected standards
- readiness thresholds
- validation commands
- safe runtime scenarios
- approved public capabilities

This lets teams tune Descuff without weakening the default safety model.

## 7. Safer `apply-safe`

Enable deterministic writes only for low-risk generated files:

- `public/llms.txt`
- `public/openapi.json`
- `public/.well-known/api-catalog`
- generated metadata files

Do not automatically expose mutating or sensitive capabilities.

## 8. Richer Entity Modeling

Improve semantic inference for apps that are not ecommerce:

- landing pages
- waitlists
- SaaS dashboards
- booking flows
- content sites
- marketplaces

This would reduce misleading readiness losses when a simple app has no product/article/workspace entity.

## 9. Standard Quality Scoring

Move beyond “implemented vs missing” and score standard quality:

- route coverage
- API schema completeness
- examples present
- auth and error responses documented
- JSON-LD type fit
- API Catalog link correctness

This gives teams a better improvement path after the first pass.

## 10. Hosted Project History

Add an optional hosted service that stores before/after runs over time:

- readiness trend
- standards coverage
- validation history
- pull request comparison
- team-visible reports

The hosted service should remain optional. The CLI must continue to work locally and in CI without a hosted account.
