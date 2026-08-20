# ADR-0002: Own A Stable Semantic IR

## Status

Accepted

## Context

Descuff consumes source analysis, runtime observations, optional Graphify output, coding-agent reasoning, and standard-specific validation. If the core product depends directly on any one analyzer or standard format, future extensions will require invasive rewrites.

## Decision

Descuff will own a versioned semantic intermediate representation. All analyzers emit Descuff-owned structures. All standards adapters consume Descuff-owned structures.

Every important conclusion in the IR must retain evidence/provenance.

## Consequences

- Graphify, Next.js parsing, Playwright observations, and future analyzers remain replaceable.
- Standard adapters remain isolated.
- Validation and reporting can use one stable model.
- Schema migrations become explicit release work.

Tradeoff:

- The IR requires careful design and fixture coverage before feature velocity increases.
