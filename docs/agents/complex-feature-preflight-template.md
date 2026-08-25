# Complex feature execution note

<!-- Keep exactly one marker and delete the other examples. -->
<!-- complex-feature-preflight: required -->
<!-- The Spec reviewer adds the exact approval marker documented in complex-feature-preflight.md only after approval. -->

## Outcome and risk classification

- Observable outcome:
- Triggering high-risk boundary:
- Authoritative issue, PRD, or ADR:

## Complex-feature preflight

### States and transitions

| From | Event | Pending | Success | Error or recovery |
| ---- | ----- | ------- | ------- | ----------------- |
|      |       |         |         |                   |

### Actors and identities

- Caller and required permission:
- Target and Workspace or selected context:
- Sign-out or identity replacement while pending:

### Mutation contract

- Route and request or response statuses:
- Safe errors:
- Idempotency, retry, ABA, cancellation, and stale-actor behaviour:
- Activity Log transition:

### Data authority

- Server-authoritative permission checks:
- Database constraints:
- Previous-schema migration expectation:

### Surfaces

- Backend/API:
- Schema/migration:
- Activity Log:
- Frontend/browser:
- Docs/OpenAPI:

### Test matrix

| State or transition | Highest stable seam | Expected evidence |
| ------------------- | ------------------- | ----------------- |
|                     |                     |                   |

### Exclusions and unresolved decisions

- Explicit exclusions:
- Unresolved decisions or blockers:
