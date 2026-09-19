# PRD — Activity Log and Accountability

**Status:** Draft — foundation and Client correction delivered; duplicate-resolution events approved; later event families capability-owned  
**Version:** 0.2  
**Owner:** Dan Popescu  
**Decisions:** DEC-028, DEC-041–DEC-045, DEC-067, DEC-073, DEC-087–DEC-089, DEC-096–DEC-097, DEC-122, DEC-128, DEC-183, DEC-213

## 1. Problem statement

Critical business actions must be reconstructable across access, Clients, Projects, Documents, commercial work, assurance, finance, integrations and AI. Technical logs do not provide governed business meaning, and mutable history cannot prove who authorized or corrected an outcome.

## 2. Solution

Provide one append-only Accountability module with a narrow public recording interface and authorized read models. Owning modules emit canonical business events from server-established actor context, target identity, Company/Workspace scope and constrained metadata.

Activity Log is business evidence, not an application logger, event-sourcing platform or free-form message sink.

## 3. User stories

1. As an authorized user, I want to know who performed an important action and when, so that responsibility is clear.
2. As a Workspace or Company manager, I want events scoped to what I may see, so that history does not leak protected activity.
3. As a user, I want the first provisioning event recorded once, so that retries do not fabricate repeated actions.
4. As a reviewer, I want approval, rejection and acknowledgement events tied to exact versions, so that the governed decision is unambiguous.
5. As a finance reviewer, I want confirmations, reversals and corrections visible, so that financial history is auditable.
6. As an assurance reviewer, I want audit, Report, Decision and credential events separated, so that one status does not hide distinct authority.
7. As an administrator, I want permission and integration changes attributable, so that access and provider risk can be reconstructed.
8. As an AI user, I want material AI proposals and human disposition linked without exposing secrets, so that automation remains accountable.
9. As a user without Activity Log permission, I want hidden event existence protected, so that metadata does not disclose another Company's work.
10. As an operator, I want diagnostic logs separate, so that business evidence remains stable and meaningful.

## 4. Event contract

A canonical event contains:

- stable event identity and idempotency identity where the action may retry;
- server-authoritative timestamp;
- Workspace and optional Company scope;
- actor type and stable actor reference;
- canonical action;
- target type and stable target reference;
- minimal typed metadata needed to explain the business event;
- correlation to the successful business transaction or durable equivalent;
- provenance for automation or external-provider actions when relevant.

The public interface accepts business meaning, not arbitrary log prose or persistence details.

For Workspace invitation consumption, [#163](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/163) records Dan's approved policy: every committed consumption creates one `workspace_invitation.accepted` event, attributed to the verified recipient and targeting that invitation in its intended Workspace. A newly created Internal User additionally receives exactly one `internal_user.provisioned` event; resolving an existing identity does not repeat creation history. Admission and both required events commit together. Rejected attempts and exact replays create neither event. Invitation event visibility remains subject to the invitation-management permission.

## 5. Invariants

1. Successful critical actions create exactly the required event.
2. Failed or rolled-back actions do not create misleading success events.
3. Retry and concurrency do not duplicate a logically single event.
4. Ordinary commands expose no update or delete operation for events.
5. Actor and time are server-authoritative.
6. Event visibility is never broader than target visibility.
7. Event metadata contains no secrets or unnecessary sensitive payload.
8. Diagnostic telemetry does not become the normative business history.

## 6. Critical event families

- identity provisioning, deactivation and role/scope assignment;
- Company and Client identity/relationship changes;
- Project lifecycle and significant Task completion;
- Document formal version, approval, transmission, signature evidence, archive and correction;
- Request assignment, pricing, Offer/Contract approval and acceptance evidence;
- audit planning, Finding, corrective action, Report approval, certification Decision and credential state;
- invoice reference, Payment confirmation/allocation/reversal and financial correction;
- integration configuration and material synchronization outcome;
- historical import approval/rollback and duplicate resolution;
- AI capability execution, proposal disposition and tool action.

Capability PRDs decide exactly which events are critical.

## 7. Authorization and privacy

Activity Log read permission is separate from mutation permissions. Queries enforce Workspace and Company scope before returning events, counts, filters or target labels.

Sensitive metadata is minimized and may require capability-specific permissions. Platform diagnostics reference opaque identifiers where business details are unnecessary.

## 8. Retention, correction and export

Events are append-only. A mistaken business action is corrected in its owning module, which records a compensating or correction event.

Iurie's combined duplicate/correction answer requires both original records, all modifications, actor, date/time and union reason to remain reconstructable. Product normalization applies preservation of prior values, actor and server-authoritative date/time to an ordinary significant correction.

DEC-213 and the Shared Client PRD now authorize two later logical event semantics: `client.union_confirmed` for one successful non-destructive union and `client.union_reversed` for one successful reversal. Both actions target one internal `client_union_operation` record under its server-generated internal operation identifier. That internal identifier is never returned in a redacted Company projection; each affected Company receives its own server-generated, unpredictable public projection reference for the stable `client_union_operation` target type. The restricted operation record preserves both original Clients, the canonical result or restored pair, the complete affected-Company set defined by the Shared Client PRD, verified identity basis, the original union reason and any later separate reversal reason; reading it requires current Client read authority plus an active assignment whose captured version or immutable hash resolves to resolver-enabled `v2` in every affected Company; the shared bundle label and legacy `v1` are insufficient. The first duplicate-resolution slice accepts no Document-derived identity basis, so its operation record and projections contain no Document identifier, metadata, content or derived match reason.

A same-Company operation has one Company-scoped Activity Log projection. A cross-Company operation is materialized as exactly one immutable projection per affected Company, linked only server-side to the internal operation record; no Workspace-scoped copy is created. Each projection is also the independently authorized safe target representation of `client_union_operation` in its own Company scope and has a distinct unpredictable public projection reference that is never reused in another Company. An Activity Log reader in that server-validated Company may read only the action, that projection-specific reference, own Company identifier and a generic “authorized resolver” marker with no actor identifier, name, alias or membership reference. The redacted representation returns no action timestamp, time bucket, cross-scope ordering value or other time-derived join key; any Company-local list position is generated independently from the internal action time and is not comparable across Company scopes. It never returns the internal operation identifier, enumerates another original Client or affected Company, reveals the identity basis or written reason, or offers a restricted-detail link unless the complete resolver authorization passes. After that complete authorization passes, restricted detail may resolve the projection reference server-side and return the internal operation identifier, exact actor and server-authoritative action time. Event visibility is therefore no broader than the target representation visible under the same Company authorization. Failed, conflicted, unauthorized and idempotent replay attempts create no success projection.

Retention and authorized export require a later policy based on business and legal evidence. Absence of a final retention period does not permit silent deletion.

## 9. UX

- reverse chronological initial view;
- clear actor, action, target and time for ordinarily authorized events; a redacted duplicate-resolution projection deliberately shows restricted actor/time placeholders and exposes exact attribution only through fully authorized restricted detail;
- localized canonical action labels;
- empty, loading, error and permission states;
- later filters and export only through separate slices;
- target links only when the actor may read the target.

## 10. Implementation decisions

- Accountability owns persistence, idempotency and serialization.
- Owning business modules call its narrow public interface.
- The delivered event actions are `internal_user.provisioned`, `company.registered`, `company_context_assignment.granted`, `company_context_assignment.revoked`, `company_director_client_assignment.granted`, `company_director_client_assignment.revoked`, `client.created`, `client_company_relationship.established`, and `client.corrected`.
- The approved but not yet delivered duplicate-resolution actions are `client.union_confirmed` and `client.union_reversed`; one logical cross-Company action has one internal operation identifier plus one Company-scoped projection per affected Company, each with a different unpredictable public projection reference and no public cross-Company correlation key.
- Client target labels require an applicable Client read permission in addition to the existing Activity Log visibility boundary. A duplicate-resolution projection uses its own redacted Company-scoped `client_union_operation` target representation; restricted detail additionally requires an active assignment whose captured version or immutable hash resolves to resolver-enabled `v2` in every affected Company; the shared bundle label and legacy `v1` are insufficient. Client–Company Relationship, correction and duplicate-resolution projections are returned only within the server-validated active Company scope; without an active Company, Company-scoped Client events are omitted.
- A generic event bus or observability platform is not required.
- Later filtering, retention controls and exports require separate PRDs/issues.

## 11. Testing decisions

- PostgreSQL REST tests prove atomicity, idempotence, attribution, ordering and isolation.
- Browser tests prove human-readable history through the real access journey.
- Each capability tests its critical event through the capability's highest public seam.
- Tests do not import Accountability persistence internals.
- The #65 migration seam preserves existing event IDs, actor and target attribution, append-only history, `/activity-log` visibility, and exactly-once provisioning semantics while references become membership-aware.
- The #66 public Company seam proves that one successful provider-Company registration creates one attributable event and failed, retried, or unauthorized attempts do not create false or duplicate success history.
- The #141 Client REST seam proves one `client.created` event and one event for each newly established Client–Company Relationship; retries, concurrent attachment and rolled-back mutations do not duplicate or fabricate success history, and another Company's relationship event is not returned.
- PR #147 proves attributable `client.corrected` history within the responsible Company scope.
- The next duplicate-resolution slice must prove exactly one union or reversal projection per affected Company linked server-side to one internal operation, distinct unpredictable public projection references across Companies, no internal operation identifier, actor identity, exact/coarse action time or cross-scope ordering key in redacted reads, independently generated Company-local ordering, complete affected-Company authorization before shared correlation/actor/time is returned, and no success projection for blocked identifiers, disagreement, stale state, cancellation or replay.

## 12. Acceptance journey

A fresh user receives exactly one identity-provisioning event through Access. Invitation consumption additionally follows the event contract above. Reconnection and concurrent resolution create no duplicate. A failed provisioning leaves no success history. For duplicate resolution, one authorized union and one reversal each create one logical action with exactly one visible projection in every affected Company scope, while failed, partial-authority and replay attempts create none. Later capability slices record canonical events through the same public interface, and unauthorized users cannot infer them.

## 13. Evidence and dependencies

Business evidence:

- actions Iurie considers dispute-critical;
- which roles need Workspace or Company history;
- retention/export expectations.

Technical dependencies:

- issue #22 is complete;
- the accepted [Workspace tenancy and Company-scoped authorization architecture](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md);
- transaction/outbox decisions for work that cannot share one transaction.

## 14. Readiness

Issue #22 delivered the initial provisioning event and visible history. [Issue #65](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65) preserves that seam while adding explicit membership; [issue #66](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66) adds only its approved provider-Company registration event; [issue #67](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67) adds active Company selection without authorizing another event family; [issue #88](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) adds the approved Company-context assignment grant and revocation events; [issue #141](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/141) adds Client creation and Client–Company Relationship establishment; and issue #146 / PR #147 adds Company Director Client assignment and Client correction events. After #148 normalization, one next vertical slice may deliver `client.union_confirmed` and `client.union_reversed`. Every other event family remains blocked until its owning capability PRD and permissions are ready.
