# PRD — Activity Log and Accountability

**Status:** Draft — foundation delivered; later event families capability-owned  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-028, DEC-041–DEC-045, DEC-067, DEC-073, DEC-087–DEC-089, DEC-096–DEC-097, DEC-122, DEC-128, DEC-183

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

Iurie's combined duplicate/correction answer requires both original records, all modifications, actor, date/time and union reason to remain reconstructable. Product normalization applies preservation of prior values, actor and server-authoritative date/time to an ordinary significant correction; preservation of both original records and the stated reason additionally applies when two records are united. The Shared Client PRD owns the exact command/event split; no union event is authorized until its separate destructive workflow is approved.

Retention and authorized export require a later policy based on business and legal evidence. Absence of a final retention period does not permit silent deletion.

## 9. UX

- reverse chronological initial view;
- clear actor, action, target and time;
- localized canonical action labels;
- empty, loading, error and permission states;
- later filters and export only through separate slices;
- target links only when the actor may read the target.

## 10. Implementation decisions

- Accountability owns persistence, idempotency and serialization.
- Owning business modules call its narrow public interface.
- The delivered event actions are `internal_user.provisioned`, `company.registered`, `company_context_assignment.granted`, `company_context_assignment.revoked`, `client.created`, and `client_company_relationship.established`.
- Client target labels require `client.manage` in addition to the existing Activity Log visibility boundary. Client–Company Relationship events are returned only for the server-validated active Company; without an active Company, Client events are omitted.
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

## 12. Acceptance journey

A fresh user is provisioned through Access and sees exactly one event. Reconnection and concurrent resolution create no duplicate. A failed provisioning leaves no success history. Later capability slices record canonical events through the same public interface, and unauthorized users cannot infer them.

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

Issue #22 delivered the initial provisioning event and visible history. [Issue #65](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65) preserves that seam while adding explicit membership; [issue #66](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66) adds only its approved provider-Company registration event; [issue #67](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67) adds active Company selection without authorizing another event family; [issue #88](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) adds only the approved Company-context assignment grant and revocation events; and [issue #141](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/141) adds only Client creation and Client–Company Relationship establishment. All other event families remain blocked until their owning capability PRD and permissions are ready.
