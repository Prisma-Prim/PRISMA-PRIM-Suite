<!-- complex-feature-preflight: required -->

# Company Director shared Client dossier

## Outcome and risk classification

- Observable outcome: a Workspace Owner grants or revokes one fixed Company Director Client Access bundle; an assigned director creates, reads and corrects the shared general Client dossier only inside a server-validated active Company.
- Triggering high-risk boundary: Company-scoped authorization, shared cross-Company identity, optimistic correction, idempotency and attributable history.
- Authoritative issue, PRD, or ADR: GitHub issue #146, `docs/product/release-1-shared-client-prd.md`, `docs/product/tenant-company-client-authorization-prd.md`, ADR 0006.

## Complex-feature preflight

### States and transitions

| From                  | Event                             | Pending          | Success                                            | Error or recovery                                                               |
| --------------------- | --------------------------------- | ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Bundle absent/revoked | Owner grants fixed bundle         | command reserved | active canonical assignment                        | replay returns the same result; changed intent is rejected                      |
| Bundle active         | Owner revokes fixed bundle        | command reserved | assignment revoked                                 | replay returns the same result; stale Company context fails on the next request |
| Client absent         | Director creates dossier          | command reserved | Client and Company relationship created atomically | validation/forbidden/retry creates no partial result                            |
| Client version N      | Director submits correction for N | command reserved | version N+1 and one `client.corrected` event       | stale version returns conflict; fresh-version retry uses a new command          |

### Actors and identities

- Caller and required permission: Workspace Owner with `company.assignment.manage` grants/revokes; bootstrap owner retains `client.manage`; the fixed Company bundle confers only Company context plus Client create/read/update.
- Target and Workspace or selected context: target must be an active Workspace Membership and the Company must be active in the actor Workspace; Client reads and writes require an active relationship to the selected Company.
- Sign-out or identity replacement while pending: the production shell aborts superseded requests; the server resolves verified identity and Company authority for every request.

### Mutation contract

- Route and request or response statuses: dedicated fixed-bundle grant/revoke REST routes; `POST /api/clients`; `GET /api/clients` and `GET /api/clients/:id`; `PATCH /api/clients/:id` with expected version and Idempotency-Key.
- Safe errors: 400 validation or changed idempotent intent, 403 absent/revoked authority, 404 invisible Client, 409 stale version; none disclose a foreign Client.
- Idempotency, retry, ABA, cancellation, and stale-actor behaviour: commands are scoped by actor membership, Workspace and key; correction persists canonical intent and response; a monotonically increasing version rejects ABA and stale updates.
- Activity Log transition: one successful material correction records exactly one `client.corrected` event with server actor/time and the minimal changed field set; failed, replayed and unauthorized requests record no additional success event.

### Data authority

- Server-authoritative permission checks: the fixed bundle maps to explicit Client permissions; active Company context and active Client relationship are revalidated per request; bootstrap owner compatibility is permission-based.
- Database constraints: Workspace-scoped foreign keys protect assignment, command, Client and relationship targets; correction commands have one actor/key identity; Client version is positive and monotonic.
- Previous-schema migration expectation: existing #141 Client ids and relationships remain unchanged; new optional fields backfill to null/empty values and version 1.

### Surfaces

- Backend/API: fixed access bundle, Company-scoped Client list/read/create/correct and safe conflict handling.
- Schema/migration: enriched shared fields, correction version and durable correction command.
- Activity Log: `client.corrected` persistence and Company-scoped visibility.
- Frontend/browser: enriched create/read/correct states at desktop and narrow widths while preserving the Atlas Blue baseline.
- Docs/OpenAPI: fixed-bundle and enriched Client contracts.

### Test matrix

| State or transition                            | Highest stable seam       | Expected evidence                                                      |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Grant, use, revoke                             | PostgreSQL REST           | fixed bundle is idempotent, narrow and immediately revoked             |
| Enriched create/read across involved Companies | PostgreSQL REST           | approved shared fields and provider names only                         |
| Foreign/inactive/stale context                 | PostgreSQL REST           | 403/404 without Client or operational metadata                         |
| Correction and replay                          | PostgreSQL REST           | N to N+1, exactly one event, canonical replay                          |
| Concurrent stale correction                    | PostgreSQL REST           | one success, one 409, one event                                        |
| Production interaction                         | React and Playwright      | loading, empty, validation, forbidden, stale, success and retry states |
| #141 upgrade                                   | previous-schema migration | ids and relationships preserved with version 1                         |

### Exclusions and unresolved decisions

- Explicit exclusions: duplicate detection/union, legal entities/branches, archive/restore, general role builder, cross-Company operational activity, exception workflow, documents, projects, pricing and payments.
- Unresolved decisions or blockers: none for issue #146; PostgreSQL and browser execution are delegated to exact-head CI because the local harness lacks both capabilities.

### Spec review result

- Reviewer: implementation agent preflight against issue #146 and the normalized Shared Client PRD.
- Result: approved before code.
- Contract gaps found: Contact storage is fixed here as an ordered shared list of name, optional telephone and optional email; optional scalar fields accept null to clear and reject unknown/invalid shapes.
