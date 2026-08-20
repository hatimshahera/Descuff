# Analyzers

Analyzers collect facts about the repository and running application. They emit Descuff-owned evidence and IR fragments, never standard-specific output.

## Analyzer Contract

```ts
interface StructuralAnalyzer {
  analyze(project: ProjectContext): Promise<StructuralAnalysis>;
}
```

Every analyzer must return:

- discovered facts
- evidence references
- confidence levels
- typed errors for unsupported or ambiguous cases

## Native Next.js Analyzer

`NativeNextAnalyzer` is the first-release deterministic analyzer.

Responsibilities:

- detect App Router and Pages Router structure
- discover pages, layouts, route handlers, and API routes
- extract HTTP methods
- detect server actions where reliably identifiable
- inspect imports, exports, functions, classes, and React components
- find forms and likely submission targets
- detect middleware and authentication boundaries
- detect existing standards files
- identify common model/schema definitions

It must not infer business capabilities purely from UI labels or button text.

## Runtime Analyzer

The runtime analyzer uses Playwright to inspect real behavior.

Responsibilities:

- visit discovered routes
- capture rendered status and metadata
- inspect forms and accessibility tree
- observe network requests and API responses
- detect authentication redirects or access denial
- check currently exposed JSON-LD, `llms.txt`, WebMCP, OpenAPI, and API Catalog endpoints
- correlate runtime observations with static source evidence

Runtime analysis must avoid destructive actions by default. Mutating flows require explicit fixture-safe scenarios or developer approval.

## Graphify Analyzer

Graphify is optional developer infrastructure and an optional structural-analysis subsystem. Descuff must not depend directly on Graphify storage formats.

```text
Graphify
   |
   v
GraphifyAdapter
   |
   v
Descuff IR
```

Rules:

- Graphify concepts stop at `GraphifyAdapter`.
- The rest of Descuff consumes only `StructuralAnalysis`.
- Graphify can be removed or replaced without changing standard adapters.
- Any directly reused Graphify source must preserve license and provenance requirements.

## Evidence Correlation

The analyzer layer must cross-reference static and runtime facts. A capability reaches high confidence only when sufficient evidence exists.

Example:

- static route exists at `app/api/products/search/route.ts`
- route exports `GET`
- runtime request to `/api/products/search` returns product-shaped data
- search page submits a query to the route

This can support a `search_products` capability. A button labelled "Search" alone cannot.

## Testing

Analyzer tests must cover:

- App Router discovery
- Pages Router discovery
- API route method extraction
- server action extraction where detectable
- forms and submission target detection
- middleware/auth boundary detection
- runtime route observation
- static/runtime evidence correlation
- Graphify adapter format conversion
