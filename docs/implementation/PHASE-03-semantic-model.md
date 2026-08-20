# Phase 03 - Semantic Model

## Objective

Create the stable Descuff intermediate representation and semantic reasoning boundaries.

## Dependencies

- Requires Phase 02 structural evidence.
- Required by standard adapters, planner, validator, reporter, and readiness scoring.

## Tasks

- [x] Define versioned IR schemas.
- [x] Implement evidence index.
- [x] Implement project metadata model.
- [x] Implement route model.
- [x] Implement API operation model.
- [x] Implement entity model.
- [x] Implement capability model.
- [x] Implement authentication model.
- [x] Implement integration model.
- [x] Implement existing standards model.
- [x] Implement capability risk classification.
- [x] Implement application type assessment.
- [x] Validate semantic reasoning output at schema boundaries.
- [x] Add deterministic readiness scoring categories and lost-point reasons.

## Acceptance Criteria

- Every entity, route, API operation, capability, auth conclusion, and standards recommendation links to evidence.
- Invalid IR fails with typed errors.
- Capability risk includes `PUBLIC_READ`, `AUTHENTICATED_READ`, `LOW_RISK_WRITE`, `SENSITIVE_WRITE`, and `HIGH_CONSEQUENCE`.
- Readiness scoring is explainable and deterministic.
- No unexplained AI guesses can be stored as facts.

## Required Testing

- Schema validation tests.
- Evidence index tests.
- Capability risk tests.
- Application classification tests.
- Readiness scoring tests.
- Golden fixture semantic model tests.

## Completion Rule

Do not mark this phase complete until semantic fixture outputs are stable and validated.
