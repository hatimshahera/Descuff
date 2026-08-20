# Phase 02 - Analysis

## Objective

Build deterministic and runtime analyzers that extract evidence from Next.js applications without exposing analyzer-specific formats to the rest of Descuff.

## Dependencies

- Requires Phase 01 package structure, TypeScript, tests, and fixtures.
- Requires Phase 01 minimal evidence and `StructuralAnalysis` contracts.
- Provides evidence and structural facts required by Phase 03.

## Tasks

- [x] Define `StructuralAnalyzer` contract.
- [x] Refine `ProjectContext` and `StructuralAnalysis` from Phase 01 as extraction needs become concrete.
- [x] Implement Next.js project detection.
- [x] Implement App Router route discovery.
- [x] Implement Pages Router route discovery.
- [x] Implement API route discovery.
- [x] Extract HTTP methods.
- [x] Extract imports, exports, functions, classes, and React component symbols.
- [x] Detect server actions where deterministic.
- [x] Detect forms and submission targets.
- [x] Detect middleware and likely authentication boundaries.
- [x] Detect existing standards files and routes.
- [ ] Implement Playwright runtime route observation.
- [ ] Correlate runtime network evidence with source evidence.
- [ ] Implement `GraphifyAnalyzer` through a clean adapter.

## Acceptance Criteria

- Analyzer output validates against Descuff-owned schemas.
- Analyzer output remains structural evidence; semantic `ApplicationModel` transformation belongs to Phase 03.
- Every discovered fact has evidence.
- Static and runtime evidence can be correlated by route/API operation.
- Graphify storage formats are isolated to the Graphify adapter.
- Ambiguous discoveries emit typed warnings.

## Required Testing

- Unit tests for route discovery.
- Unit tests for API method extraction.
- Unit tests for server-action detection.
- Fixture tests for App Router.
- Fixture tests for Pages Router.
- Runtime Playwright tests for rendered pages and network observation.
- Graphify adapter contract tests.

## Completion Rule

Do not mark any analyzer task complete until fixture coverage proves it and relevant tests pass.
