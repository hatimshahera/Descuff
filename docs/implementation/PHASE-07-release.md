# Phase 07 - Release

## Objective

Prepare the first public release with complete documentation, examples, CI, package readiness, and no known critical or high-severity defects.

## Dependencies

- Requires Phases 01 through 06.
- Requires realistic fixture applications and full E2E validation.

## Tasks

- [x] Complete README.
- [x] Add installation instructions.
- [x] Add contributing guide.
- [x] Add changelog.
- [x] Add license.
- [x] Add public examples.
- [x] Complete fixture applications.
- [x] Run Graphify over Descuff.
- [x] Configure coding-agent instructions to use Graphify for repository exploration.
- [x] Verify CI is green.
- [x] Run package publishing dry run.
- [x] Run full release checklist.
- [x] Triage all known critical and high-severity defects.

## Acceptance Criteria

- `npx descuff scan` works on a real Next.js application.
- Output explains application type, capabilities, readiness, selected standards, and evidence.
- A coding agent can execute the plan refreshed by `descuff fix`.
- `npx descuff validate` proves generated standards, security, build health, tests, and human UI regression status.
- Documentation explains installation, architecture, safety, contribution, examples, and release limitations.
- CI blocks failing required checks.

## Required Testing

- Full fixture E2E suite.
- Packaged CLI smoke test.
- Documentation command verification.
- CI verification.
- Release dry run.

## Validation Notes

- `pnpm run ci` passed on 2026-08-20 after wiring `scan`, `report`, `plan`, and `validate` to the ecommerce fixture.
- Documentation command verification passed with:
  - `node packages/cli/dist/index.js scan fixtures/ecommerce`
  - `node packages/cli/dist/index.js report fixtures/ecommerce`
  - `node packages/cli/dist/index.js validate fixtures/ecommerce`
- `pnpm -r --filter './packages/**' pack --pack-destination /private/tmp/descuff-release-pack-20260820-1830` produced package tarballs with built `dist` artifacts only.
- Clean install verification passed in `/private/tmp/descuff-clean-install-20260820-1830` by installing the packed tarballs and running:
  - `npx descuff scan /Users/hatimshaherawala/descuff/fixtures/ecommerce`
  - `npx descuff report /Users/hatimshaherawala/descuff/fixtures/ecommerce`
  - `npx descuff plan /Users/hatimshaherawala/descuff/fixtures/ecommerce`
  - `npx descuff validate /Users/hatimshaherawala/descuff/fixtures/ecommerce`
- Release checklist passed for current release scope: docs, license, changelog, public ecommerce example, CI, package dry run, clean install CLI smoke, and explicit critical/high defect marker audit.
- Critical/high triage found no known critical or high-severity defects. Non-blocking release caveats: no npm registry publication has been performed, Graphify is not on this shell's default PATH, and Graphify community labels are generic without an LLM backend key.
- Graphify was installed with `uv tool install --upgrade graphifyy`. The executable is available at `/Users/hatimshaherawala/.local/bin/graphify`, but that directory is not on this shell's default PATH.
- Code-only Graphify refresh passed with `/Users/hatimshaherawala/.local/bin/graphify . --update --no-viz --code-only`, producing `graphify-out/graph.json` with 1001 nodes, 1324 edges, and 74 communities.
- Graphify cluster/report refresh passed with `/Users/hatimshaherawala/.local/bin/graphify cluster-only /Users/hatimshaherawala/descuff --no-viz`, producing `graphify-out/GRAPH_REPORT.md` with generic community labels because no LLM backend key was configured.
- Fixture completion added realistic booking, content, SaaS, ecommerce, and intentionally broken Next.js fixture source trees. Focused analyzer fixture verification passed with `pnpm exec vitest run packages/analyzers/nextjs/test/nextjs.test.ts`.

## Completion Rule

Do not mark this phase complete until the release artifact itself has been tested from a clean install path.
