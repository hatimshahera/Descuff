# Phase 03 - Semantic Model

## Objective

Create the stable Descuff intermediate representation and semantic reasoning boundaries.

## Dependencies

- Requires Phase 02 structural evidence.
- Required by standard adapters, planner, validator, reporter, and readiness scoring.

## Tasks

- [ ] Define versioned IR schemas.
- [ ] Implement evidence index.
- [ ] Implement project metadata model.
- [ ] Implement route model.
- [ ] Implement API operation model.
- [ ] Implement entity model.
- [ ] Implement capability model.
- [ ] Implement authentication model.
- [ ] Implement integration model.
- [ ] Implement existing standards model.
- [ ] Implement capability risk classification.
- [ ] Implement application type assessment.
- [ ] Validate semantic reasoning output at schema boundaries.
- [ ] Add deterministic readiness scoring categories and lost-point reasons.

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
