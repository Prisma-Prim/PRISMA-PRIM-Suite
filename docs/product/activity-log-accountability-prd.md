# PRD — Activity Log and Accountability

**Status:** Draft — foundation and Client correction delivered; duplicate-resolution events approved; later event families capability-owned  
**Version:** 0.3\
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

For the approved [working Document–Project association slice](release-1-document-registry-prd.md#18-approved-working-project-associations-245),
one committed link creates `document.project.linked` and one committed removal
creates `document.project.unlinked`, each an append-only relationship event in the
same transaction as the association revision, command outcome and original Client
operational-use fence. Failed commands and exact replays create no new event.
The record retains the original Document and Project, actor membership, responsible
Company and server time. Its Activity Log projection requires current read authority
for both endpoints and the original Client/Company relationship, in addition to
the existing Activity Log boundary. A Document-only reader receives no Project
identifier, title or relationship-event disclosure. Event metadata contains no
Document title, purpose or URL. Visible relationship events participate in the
existing dated, bounded page rather than an appended unsorted list. Removal is a
new attributable event and never erases earlier relationship history.

For [manual preparation Tasks](release-1-project-task-prd.md#18-approved-manual-preparation-tasks-246),
Accountability records `task.created`, `task.updated`, `task.status.changed`,
`task.completed`, `task.cancelled` and `task.reopened` through its public recording
boundary. Each material action has
one event targeting the original Company-owned Task, with server actor membership,
time and resulting Task version. Typed facts retain the initial title/assignee/date/priority,
the prior and new values of corrected fields, the prior and new state of each
transition, and the blockage or cancellation reason where the
[Project/Task PRD §20](release-1-project-task-prd.md#20-approved-task-execution-states-365)
requires one.
Task state/version, command outcome, required history and original Client fence
commit together. Rejected commands, normalized no-op edits and exact committed
replays create no new success event or fence advance.

Task detail exposes ordered immutable history only through current `task.read`
plus the same Project and original Client/Company read boundary. Activity Log
projection also preserves its existing authorization boundary and date/page order;
ordinary Workspace ownership or Client visibility alone cannot disclose Task
events. Assignment grant/revoke uses
`company_task_manager_assignment.granted` and
`company_task_manager_assignment.revoked` with existing administration visibility.
No event mutation/deletion route or general member-directory exposure is added.

For the [Project responsible member](release-1-project-task-prd.md#21-approved-project-responsible-member-367) slice, each material change records one `project.responsible.changed` event targeting the Project. It records the server actor membership and time, the resulting responsibility revision, and the previous and new responsible member (membership identifier and display label, or none). The event commits with the responsibility, command receipt and original Client fence. Rejected commands, no-ops and exact replays record none. Projection requires the same current Project read and original Client/Company boundary as `project.created`; Workspace ownership or Client visibility alone discloses nothing. No email or other member-directory data is recorded.

For the [provisional Project lifecycle](release-1-project-task-prd.md#23-approved-provisional-project-lifecycle-406), each committed transition records one `project.lifecycle.changed` event targeting the Project. The event is written in the same transaction as the status change, the lifecycle revision increment, the transition record, the durable receipt and the original Client operational-use fence advance. It records the server actor membership and time.

Metadata carries only the resulting lifecycle revision, the previous and new status and, for an activation, whether a start exception was recorded. It never carries a reason, completion note, declared item, completion responsible or deadline; Project readers read those on the Project (Project/Task PRD section 23).

Projection follows `project.responsible.changed`: only in the recording Company, with current Project read and the original Client/Company boundary. Rejected, denied and replayed commands record none. Company Project Approver grant and revocation follow the authorization PRD §8 convention.

For the approved [unverified working-reference correction](release-1-document-registry-prd.md#19-approved-unverified-working-reference-correction-250),
each material correction creates one `document.corrected` event in the same
transaction as the field update, working revision, durable command/history receipt
and original Client fence advance. A no-op, failed command or exact replay creates
no event. The event retains actor membership, server time, responsible Company and
Document target. Its public metadata is empty and contains no title, purpose, URL,
Project identifier or before/after values. Projection requires the same current
Document and original Client visibility as registration history and participates
in the existing newest-first bounded page.

For the [provisional official Document Versions](release-1-document-registry-prd.md#21-approved-provisional-official-document-versions-400), one committed command creates exactly one of `document.version.drafted`, `document.version.designated_official`, `document.representation.added` or `document.representation.removed`. The event is written in the same transaction as the Version or reference change, the Document working-revision increment, the durable receipt and the original Client operational-use fence advance. It targets the Document in its responsible Company, with the actor membership and server time.

Metadata carries only the affected Version number plus the source or superseded Version number, or the reference form and whether it was appended after designation. It never carries a title, purpose, URL or Project identity.

Projection follows `document.corrected`: only in the recording Company, to actors with current Document metadata read and the original Client/Company visibility, inside the existing newest-first bounded page. Failed, denied and replayed commands create none. The section 20 correction history of the Document Registry PRD remains limited to `document.corrected`.

For the approved [provisional Opportunity next-action update](release-3-commercial-workflow-prd.md#16-approved-provisional-opportunity-next-action-update-306),
one committed material update creates exactly one
`opportunity.next_action.updated` event in the same transaction as the new
next-action value, the incremented Opportunity version and the durable command
receipt. The event retains the acting membership, server-authoritative time,
responsible Company and Opportunity target; its metadata carries the resulting
version only and contains no previous or new next-action text, request text,
subject or Client-confidential content. Rejected commands, safe denials,
byte-identical no-op updates and exact committed replays create no event. The
owning commercial PRD stores the next action exactly as submitted and applies no
trimming or normalization, so a no-op here is a byte-identical resubmission
rather than the normalized comparison used by Tasks. Recording this event grants
no read of it.

For the approved [provisional Opportunity reassignment](release-3-commercial-workflow-prd.md#21-approved-provisional-opportunity-reassignment-399), one committed material change creates exactly one `opportunity.responsible.changed` event in the same transaction as the new responsible actor, the incremented shared Opportunity version and the durable receipt. It retains the acting membership, server time, responsible Company and Opportunity target; its metadata carries only the resulting version and the previous and new responsible actor (membership identifier and captured display label), with no email or commercial text. Rejected commands, denials, no-ops and exact replays create none. The commercial projection of section 17.3 returns the two responsible actors.

The separately approved [provisional Company commercial Activity read](release-3-commercial-workflow-prd.md#17-approved-provisional-company-commercial-activity-read-306)
owns the first authorized projection of commercial events, which the intake
slice deliberately left unprojected. A commercial event appears only inside the
existing dated, bounded page, in the server-validated active Company that owns
it, for an actor holding the independent opt-in commercial Activity bundle who
also retains current read authority for that event's Request or Opportunity
target. Partial authority and an absent active Company omit the event rather
than widening it to Workspace scope. The projection returns the canonical action,
responsible Company, existing actor label, server time and a target reference
that is linked only where the target is already readable; it returns no request
text, source label, subject, next-action text, Opportunity scope or
Client-confidential content, and it adds no commercial filter, export or
event-mutation route.

For the approved additional Client Legal Entities ([Shared Client PRD section 20](release-1-shared-client-prd.md#20-approved-provisional-additional-client-legal-entities-393)), one committed registration creates `client_legal_entity.registered` and one committed material correction creates `client_legal_entity.corrected`. Each event targets the owning Client Account in the acting Company, in the same transaction as the record change, the Client version increment and the receipt. Metadata carries the entity identifier and the recorded or previous-and-new shared identity values only. Projection follows the delivered `client.corrected` rule: only in the recording Company, and only to actors who can currently read that Client there. Failed commands, no-ops and exact replays create no event.

For the [provisional one-time Client association after Request capture](release-3-commercial-workflow-prd.md#20-approved-provisional-one-time-client-association-after-request-capture-450),
one successful association creates exactly one
`client_request.client_associated` event in the same transaction as the stored
original Client reference, Request version 2 and durable command receipt. It
targets the Request in its responsible Company and retains the acting Membership
and server-authoritative time. Metadata contains only `requestVersion: 2`; it
contains no Client identifier, label, relationship, Request content or
Opportunity data. Failed, denied and replayed commands create none. The event is
eligible for the existing commercial projection only under Company Commercial
Activity Reader plus current Request read, and its projection reveals no Client
identity. Recording or reading it grants no association or Client authority.

For the [approved first confirmed-cost profitability journey](release-3-confirmed-cost-profitability-estimate-prd.md#5-approved-first-journey), normalized under delegated root product review on 2026-10-01 in [#497](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/497), each committed version submission records exactly one `profitability_estimate_version.created`; each committed exact-version Director decision records exactly one `profitability_estimate_version.decided`. Both target the frozen `profitability_estimate_version` identifier in its responsible Company and use the canonical envelope's server actor membership, Workspace, Company and timestamp.

Typed metadata carries only the owning estimate identifier and version number, plus the decision code (`APPROVE`, `MODIFY` or `REJECT`) on the decision event. It contains no amount, currency, percentage, executor type, cost category/label, strategic reason, Client identity or confidential text. Version/decision, any head advance, authorized command result and durable receipt, and required event commit in one transaction through Accountability's public recording boundary. A failed write or response construction rolls back all of them; denied, invalid, stale, already-decided and exact-replay commands create no success event.

These are **internal recording semantics only**. No Activity read surface, commercial allowlist, count, filter, export or target link returns them in this journey, even to an existing Activity reader. Neither profitability bundle confers Activity Log access. The authorization PRD §8 owns the separate Contributor/Director assignment grant/revoke events and their unchanged administration visibility. An approved event contract is not evidence of runtime delivery.

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
- Commercial intake actions `client_request.created`, `opportunity.created`
  and `opportunity.next_action.updated` use the authorized Company projection
  under its separate opt-in permission and current target read. The approved
  provisional reassignment adds `opportunity.responsible.changed`. The approved
  one-time Client-association contract adds `client_request.client_associated`
  to that projection only when its owning implementation is delivered.
  The approved provisional outcome status contract adds
  `opportunity.outcome.changed`, without reason or note text, once delivered.
  The approved provisional Sales Stage contract adds `opportunity.stage.changed`
  once delivered; its `sales_stage.configured` events are recorded, not projected.
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
- The next-action slice proves exactly one `opportunity.next_action.updated`
  event per material update, version-only metadata, and no event for rejected,
  no-op or replayed commands. The commercial Activity read slice proves that the
  opt-in bundle plus current target read are both required, that partial
  authority and another Company or Workspace disclose no event, count or label,
  and that projection adds no mutation route.
- The one-time Client-association slice proves exactly one
  `client_request.client_associated` event with Request-version-only metadata in
  the atomic association transaction, none for refusals or replays, and no Client
  identity disclosure through the commercial projection.
- The profitability journey proves one version-creation or exact-version-decision event per committed command through its public REST/PostgreSQL seam, atomic rollback with its records/receipt/result, exact-retry convergence, constrained identifier/version/decision metadata and no profitability event through any Activity read surface. Separate assignment events retain their existing administration boundary.
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

Issue #22 delivered the initial provisioning event and visible history. [Issue #65](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65) preserves that seam while adding explicit membership; [issue #66](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66) adds only its approved provider-Company registration event; [issue #67](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67) adds active Company selection without authorizing another event family; [issue #88](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) adds the approved Company-context assignment grant and revocation events; [issue #141](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/141) adds Client creation and Client–Company Relationship establishment; and issue #146 / PR #147 adds Company Director Client assignment and Client correction events. After #148 normalization, one next vertical slice may deliver `client.union_confirmed` and `client.union_reversed`. After #306 normalization, one vertical slice may deliver `opportunity.next_action.updated` and a separate vertical slice may deliver the authorized Company projection of commercial intake events; the two are independent in either order. The approved first confirmed-cost profitability contract additionally permits the two internal version/decision recording semantics in section 7 when its implementation child is ready; it permits no projection. Every other event family remains blocked until its owning capability PRD and permissions are ready.
