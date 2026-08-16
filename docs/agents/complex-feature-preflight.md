# Complex-feature preflight

Use this small pre-code check when one issue crosses a boundary where a missing contract can create late, repeated review cycles. It is repository guidance, not a personal skill or a replacement for Standards, Spec, CI, deep review, or product decisions.

## When it is required

Complete the preflight when the issue involves any of these high-risk boundaries:

- authentication, authorization, permissions, Role Assignments, or Workspace isolation;
- schema constraints, backfills, or migration from the previous schema;
- Activity Log attribution or immutable evidence;
- asynchronous identity, session, or selected-context changes in the UI;
- concurrency, retries, idempotency, ABA, cancellation, or stale requests;
- a transversal slice spanning several of API, persistence, audit, web, and browser seams.

An isolated low-risk change or narrow documentation correction is exempt. Do not use the preflight merely because a diff touches several files. If classification is uncertain, the execution note states the concern and the Spec reviewer decides before code.

## Portable markers and advisory guard

Put exactly one marker in the issue or execution-note Markdown:

```markdown
<!-- complex-feature-preflight: required -->
<!-- complex-feature-preflight: exempt-low-risk -->
<!-- complex-feature-preflight: linked docs/path/to/authoritative-preflight.md -->
```

Keep only the marker that applies. A linked path is repository-relative and must remain inside the repository. Check the note with:

```text
node scripts/validate-complex-feature-preflight.mjs --advisory path/to/issue-or-brief.md
```

The guard checks only the marker and named fields. It deliberately does not judge architecture or natural-language quality. A missing marker does not fail because the agent and Spec reviewer own risk classification; once an issue is marked as required, missing fields produce clear advice. Remove `--advisory` when a harness needs a non-zero exit code.

## Required compact matrix

Use the [ticket template](complex-feature-preflight-template.md) or link an existing authoritative document. Keep entries concise and observable.

1. **States and transitions**: initial, pending, success, error, empty, forbidden, inactive or revoked, and recovery paths that apply.
2. **Actors and identities**: caller, target, Workspace, selected context, and identity replacement or sign-out while work is pending.
3. **Mutation contract**: route, request and response statuses, safe errors, idempotency scope, retry or ABA semantics, stale-actor or cancellation behaviour, and Activity Log transition.
4. **Data authority**: named permissions, server-authoritative checks, database constraints, and previous-schema migration expectations.
5. **Surfaces**: backend, schema or migration, audit, frontend, browser journey, and docs or OpenAPI, explicitly marking non-applicable surfaces.
6. **Test matrix**: the highest stable seam for each meaningful transition, including empty versus forbidden and stale identity when relevant.
7. **Exclusions and unresolved decisions**: scope deliberately deferred and decisions that still block safe implementation.
8. **Spec review result**: the reviewer confirms before code that the matrix covers the issue and its authoritative PRD, or records the missing contract that must be resolved first.

## Worked transversal example

A Company-context access mutation changes authorization, persistence, Activity Log evidence, and an asynchronous selector. Its matrix distinguishes an active member with no assigned Company (empty success) from a caller lacking the named permission (forbidden). It records what happens when the caller signs out during a pending mutation, scopes the idempotency key to the actor and operation, requires the database constraint and previous-schema migration test, then maps those transitions to API, PostgreSQL, UI, and browser seams. Spec review approves that matrix before implementation.

## Exempt narrow example

A correction to a broken documentation link has no business-state transition, identity, mutation, persistence, or browser contract. Its execution note contains only:

```markdown
<!-- complex-feature-preflight: exempt-low-risk -->

Reason: isolated documentation link correction with no observable product behaviour change.
```

Do not manufacture a state matrix for that issue.
