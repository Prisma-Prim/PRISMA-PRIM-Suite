# PRD — Company operational-risk intake and manual follow-up

**Status:** Approved — bounded first journey  
**Version:** 1.0  
**Access decision:** Dan, 2026-10-21  
**Agent review:** Root coordinator, Standards then Spec, 2026-10-21  
**Product owner:** Dan Popescu  
**Boundary:** Record/reopen an unassessed operational risk and preserve factual manual follow-up

**Journal-correction extension:** [Section 24](#24-bounded-attributed-journal-corrections-956) — Ready for product review

## 1. Authority and consumers

This bounded capability consumes [Product Vision](product-vision-prd.md),
[Authorization section 8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity section 7](activity-log-accountability-prd.md#7-authorization-and-privacy),
[UX](ux-localization-configuration-prd.md),
[Platform](platform-security-reliability-operations-prd.md) and
[ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md).
It does not redefine those owners. The [PRD index](prd-index.md) locates them.

Dan's explicit 2026-10-21 answer, “Oui, choisir les personnes autorisées”,
approves choosing separately, per Company, who consults operational risks and
who records or adds follow-up, without automatically expanding existing access.
Actual people are chosen later. The [dated normalization](consolidated-product-decision-record.md#348-bounded-operational-risk-intake-and-access-separation--2026-10-21)
separates this answer from earlier Ideas/complaint decisions, Iurie's evidence
and reversible agent synthesis. Authorization owns the exact independent bundles.
Root completed ordered Standards then Spec review on 2026-10-21 and approved
this bounded contract, including same-issue canonical normalization/local work.
Delivery and publication gates in section 23 remain. This is agent review, not
a personal PRD review by Dan or proof of runtime delivery.

## 2. Problem

An operational concern, planned preventive measure and later observations can disappear in conversation. A team needs to recover the exact original and distinguish corrections, without pretending that data entry proves assessment, effectiveness or resolution.

## 3. Outcomes and value

An authorized member saves a risk, reopens it and appends attributable observations or narrative reassessments. Motivated corrections preserve earlier facts. Acceptance measures: one result per unchanged retry, all committed revisions recoverable, zero tested cross-scope disclosure. No fabricated productivity target, complete Risk-module claim or MVP point.

## 4. Solution and principles

A Company-owned text register separates original, current corrected facts and manual follow-up. Assessment always remains **not assessed**. A reassessment is a person's narrative, not a computed residual score, approval or status transition. Author attribution is a server fact. Responsible person remains **not specified**; the author is never automatically appointed responsible.

## 5. Actors and ownership

Every risk belongs to exactly one Workspace and one active owning Company,
fixed from server-authorized context at creation. Ownership cannot transfer;
there is no All Companies view. Reader and Recorder are independent capabilities,
not job titles. The existing assignment administrator chooses eligible members
explicitly under Authorization section 8. No real person is assigned here.

Captured author Membership and server time provide historical attribution only.
Responsible person remains not specified; the author is not appointed responsible.
No staff directory, responsible-person assignment, Client/Project link or access
inferred from Workspace ownership, another business role or Activity read exists.

## 6. Numbered user stories

1. As a Recorder, I save process, cause, effect and one planned measure in the visible Company.
2. As a Recorder, I distinguish existing measures not recorded from supplied text.
3. As a Recorder, I supply a planned date or explicitly leave it unknown.
4. As a Reader, I reopen exact original and current facts after refresh.
5. As a Recorder, I append an observation without claiming effectiveness or resolution.
6. As a Recorder, I append a narrative reassessment without a calculated score.
7. As a Recorder, I correct current intake facts with a reason and retain every predecessor.
8. As a Reader, I distinguish immutable original facts, corrections and journal entries.
9. As a Reader, I distinguish recording actor from the unspecified responsible person.
10. As a Reader, I recover actor and server time for every committed revision.
11. As a Reader, I page through all authorized records/history and distinguish empty from failure.
12. As a user, I recover an uncertain save without duplicate entries or false rollback claims.
13. As a user, I reload stale state before making a new deliberate command.
14. As a user, I retain an invalid unsaved draft while correcting its inputs.
15. As a user changing Company, session or access, I stop seeing stale records and late replies.
16. As a Romanian, Russian, French or English user, I retain literal business text across language changes.
17. As a keyboard/mobile user, I complete the journey with styled accessible controls.
18. As a Reader, I see not assessed rather than an invented low, zero or closed state.
19. As an administrator, I grant/revoke each independent capability without granting myself Risk content access.
20. As a Reader without Recorder, I consult facts/history without receiving mutation actions.
21. As a Recorder without Reader or Company context, I receive no Risk access.
22. As a user, I distinguish confirmed save plus refresh failure from an unconfirmed command.

Saved journal entries remain immutable. Section 24 specifies the separately
scoped append-only journal-correction extension; it does not authorize editing
an original or changing the meaning of the approved v1.0 first journey.

## 7. Scope and exclusions

In scope: intake, bounded Company list, detail/history, immutable observations and
narrative reassessments, motivated append-only intake corrections, safe retries,
stale recovery and explicit Reader/Recorder grant administration.

Excluded from v1.0: journal-entry correction (separately specified in section 24),
silent replacement, responsible-person assignment,
probability/impact/scoring grids, residual calculation, criticality, status or
closure, deletion, effectiveness approval, schedules, alerts/escalation,
Tasks/Projects/Client/Document links, attachments, procurement/spending,
legal/certification claims, reports, global search/export, AI and integrations.
The wider source remains visible as deferred work, not silently erased or credited.

## 8. Concepts and facts

| Concept            | Bounded contract                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Operational risk   | Stable identity; fixed Workspace/Company; server author Membership/time                                               |
| Intake facts       | Required process, cause, effect and one planned additional measure; optional existing measures and source description |
| Planned date       | Optional valid date-only `YYYY-MM-DD`; absence means unknown                                                          |
| Responsible person | Not specified; no assignment or author-to-owner inference                                                             |
| Assessment         | Not assessed; no severity, score or approval                                                                          |
| Intake successor   | Full corrected intake, nonblank reason, current predecessor, actor/time and aggregate revision                        |
| Journal entry      | Immutable observation or reassessment, required narrative, optional declared occurrence date, actor/time/revision     |
| Revision           | Monotonic aggregate revision for order/conflict detection; no approval meaning                                        |

Reversible technical limits: process 300; cause/effect/planned measure/existing
measures 2,000 each; source description 300; narrative 5,000; correction reason
2,000 JavaScript string units. Required text rejects blanks. Optional text is
null or nonblank. Preserve accepted whitespace, line breaks and all scripts
literally; reject excess without truncation. No title taxonomy, external URL
fetch or inferred future-only date constraint. A measure is a declared plan,
not an authorized work order. Unknown score/status/assignee fields are invalid,
not accepted or inferred business facts.

## 9. Lifecycle and preserved history

Creation commits an immutable original at aggregate revision 1. Each observation,
reassessment or intake successor appends one revision. No risk status changes.
Current intake is its latest successor or original. Original and corrected facts
remain individually recoverable with their reason, actor and server time.
Journal entries cannot be edited, deleted or relabelled in this first journey.

New follow-up/correction commands name the expected aggregate revision; intake
corrections also name the displayed current predecessor. Stale aggregate or
superseded predecessor requires reload. An unchanged-fact correction is invalid,
not an event justified by a new reason alone. Distinct deliberate observations
may share text; transport replay is not a new entry.

Each mutation has an explicit idempotency identity scoped to Workspace, Company,
actor Membership and command kind. The exact-payload fingerprint includes target,
expected revision and predecessor where applicable. After current authorization,
matching committed replay returns its original result without rerunning stale
checks or advancing history/event. Changed fingerprint conflicts; new intent
gets a fresh identity after review. A lost acknowledgement remains uncertainty,
never evidence of rollback or of a second committed entry.

Record/history, aggregate revision, durable receipt, required event and valid
response commit atomically. Recheck current authority before confirming any
receipt and serialize new commands against successful membership, Internal User,
Company or required-assignment deactivation/revocation. Access owns those locks;
Risk does not query Access tables or invent a second authorization owner.

## 10. Invariants

1. No cross-scope transfer, relationship or metadata disclosure.
2. All original/corrected facts remain attributable and recoverable.
3. No overwrite, delete, fabricated score/status/deadline or inferred responsibility.
4. Author identity, Company context, title and Activity read confer no Risk access.
5. No text entry creates Task, alert, spending, effectiveness or closure.
6. Denied, invalid, stale, unchanged correction, failed and exact replay adds no success event.

## 11. Permissions and approvals

[Authorization section 8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns exact independent Reader/Recorder bundles, captured versions, administration,
current-actor projection, live checks and safe assignment events. This capability
consumes that matrix:

| Operation                       | Independent current requirements in the owning Company                     |
| ------------------------------- | -------------------------------------------------------------------------- |
| List/detail/history             | Reader, active Company context and active membership/Internal User         |
| Record intake                   | All read prerequisites plus Recorder                                       |
| Append observation/reassessment | All read prerequisites plus Recorder                                       |
| Correct intake facts            | All read prerequisites plus Recorder                                       |
| Grant/revoke Reader or Recorder | Existing assignment-administration authority; no Risk content read implied |

Recorder grants no Reader or context. Reader grants no mutation or context.
Unknown/null captured versions fail closed. Existing grants, author identity,
responsibility, job title, Workspace ownership and Activity read confer nothing.
No automatic grant, backfill or named-person assignment is created. There is no
risk approval, resolution or effectiveness decision in this slice.

## 12. Documents, evidence and Activity

These are application facts, not official Documents or independently verified
evidence. No attachment or legal-evidence admission exists. [Activity section 7](activity-log-accountability-prd.md#7-authorization-and-privacy)
owns the separate restricted recording family and atomic business-event rules.
Risk-owned history requires current Risk read authority. Generic Activity, Home,
search, counts, filters, exports and target links expose no Risk record or event,
including to administrators or Activity readers. Assignment administration remains
separate and never reveals Risk text. No text is copied into event metadata,
diagnostics or real-data test artifacts.

## 13. Configuration, localization and accessibility

Consume UX's four locales, Prisme violet/yellow direction, shared styled controls and accessible keyboard/focus/error rules. Unknown date, not recorded, responsible not specified and not assessed are distinct truthful labels. User text never translates. Use styled fields/buttons and shared Select if selection is necessary; preserve draft intent across locale changes. No configurable risk scale or notification provider.

## 14. Integrations and truth

NestJS/PostgreSQL own persisted data, validation and order. No external provider, synchronization, URL fetch, email, credential or background task. Narratives remain people's statements, not independently validated truth.

## 15. Migration and compatibility

Reviewed additive migrations preserve existing bundles and captured assignments,
create no real grant and backfill no synthetic risk. Versioned Reader/Recorder
registration and assignment mirrors agree; null, unknown and other-family
versions fail closed. Existing Project, Task, Client, Document, commercial,
Ideas and complaint authority is unchanged. Schema constraints preserve the
Workspace/Company/author and predecessor boundaries. Root coordinates shared
migration/index changes against current main before integration; pending Ideas
and complaint runtime branches are not functional prerequisites.

## 16. Security, reliability and performance

Consume Platform rules. Confidential text enters no event metadata, diagnostic
log or error. Authorize before returning records, counts or existence metadata.
Use bounded default-25/max-50 pages with strict continuation, no total count:
list ordered by immutable creation timestamp then identity, newest first; history
ordered by aggregate revision, newest first. Cursors are positional boundaries,
not authority, and every page rechecks its current scope. Concurrent writes may
change a later read; no frozen multi-request snapshot is promised.

Unknown/malformed/foreign response data fails closed at its owning boundary.
Company/session/authority changes retire scoped state and replies even when the
transport ignores abort. Locale changes preserve literal drafts and the exact
pending/uncertain command payload/version/key without writes. Distinguish a
confirmed save from later refresh failure. Absence of a retention policy permits
no silent deletion.

## 17. Journey and exceptional states

Synthetic example: record dependence on one person's undocumented preparation procedure; plan a written handover, date unknown, responsible not specified. Reopen, record a draft procedure as observation, then describe remaining concern as reassessment. Correct a mistaken cause with reason and reopen both versions. Assessment remains not assessed. Empty/loading/denied/invalid/uncertain/retry-conflict/stale/refresh-failed states differ without draft loss or disclosure. Clock passage alone causes no action.

## 18. Implementation decisions

Use the existing stack and ADR 0006. One deep Risk public boundary owns validated
reads, the three command forms (record intake, append journal, correct intake),
revision checks and durable receipts. Access owns new explicit assignment
families and live authority; Accountability owns restricted recording. Reuse their
public transaction-aware seams and existing administration UI. No dependency,
workflow framework, staff-directory or provider is needed.

The first public behavioral seam is the existing App access-administration
workflow and its Access bundle control. Use a known Workspace assignment
administrator with only already-supported actor fields. Establish actor, active
Company, eligible member and existing administration readiness, then open the
styled Access bundle selector and require the Risk Reader option followed
by Recorder. This proves the first administration step, not completed Risk
authorization. Disposable PostgreSQL and registered browser proof establish real
grants and the complete journey.

## 19. Testing decisions

First use the existing real App, deterministic identity and existing valid
administrator/Company/member HTTP fixtures, not a mocked App or Risk module.
Render access administration through the known company.assignment.manage
capability. Verify the current Company, member and loaded administration, open
Access bundle, then require Company Operational Risk Reader and Recorder options.
No new Risk actor permission or assignment field is needed before this assertion.
An absent option after these readiness checks is the intended first RED; an
import/route/fixture failure is not. Inspect the actual failure and do not predict
a PASS. The smallest green exposes the canonical choices; subsequent real public
commands and persistence tests prove their semantics rather than treating option
visibility as authorization proof.

Then use existing PostgreSQL REST/database harnesses to prove create → reload →
observe → reassess → correct facts → reopen original/current/history. Cover
independent grants/context, unknown versions, direct foreign identifiers,
revocation and exact replay, same-key conflict, concurrent stale writes, event/
receipt/response rollback and generic-projection exclusion. Real browser App/API/
PG proof must use synthetic explicit grants rather than intercepted permission
responses. Test uncertainty, locale and stale replies at actual public seams.

## 20. Acceptance criteria

1. Intake, immutable journal entries and motivated intake successors survive fresh reads with exact prior values and attribution.
2. Unknown dates/measures, unspecified responsibility and unassessed assessment remain truthful; no score/status/approval or automatic side effect appears.
3. Exact replay commits once after current authorization; changed intent conflicts; competing stale commands commit at most one successor. Event, receipt or response-construction failure rolls back the unit.
4. Invalid or unchanged corrections preserve stored facts and the unsaved draft without a success event. Saved journal entries expose no edit/delete command.
5. Reader/context and additional Recorder requirements are independently proven, including administration, unknown versions, revocation, membership/Company loss and denied replay. No existing assignment expands.
6. Other Companies/Workspaces and generic Activity/Home/search/count/filter/export/target surfaces reveal no Risk record/event/content metadata.
7. All authorized list/history pages are reachable with bounded strict continuation and explicit loading/empty/error states. Scope changes retire content/late replies; locale changes preserve page/drafts/selection/uncertain intent.
8. Registered real App/API/PG at desktop 1440 px and narrow 390 px proves record/reopen/journal/intake-correction/history. Four-locale originals are visually inspected with styled accessible controls.
9. Targeted and complete integration evidence binds actual source, base and tested tree. Source preparation itself proves no runtime or MVP credit.

## 21. Business evidence and decisions

[Iurie session 68 items 345–348](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5308284907)
supports process-based risks, cause/effect, measures, responsibility and follow-up,
then broader assessment/residual/escalation needs. Exact raw bytes remain in the
existing interview snapshot. The Sarcina reconciliation maps M14-R101–102 page
74 as non-canonical comparison; this preparation did not inspect the external
DOCX and changes none of that source evidence.

Dan's separate 2026-10-21 answer approves per-Company explicit consultation and
recording/follow-up access, without automatic expansion, with actual people chosen
later. Root's frozen-contract disposition owns reversible bounds, correction/
revision/receipt conventions and this first partial scope. These are not new
Iurie answers or a complete Risk module. Section 24 separately specifies journal
correction. Scoring, responsibility assignment, thresholds, periodic reevaluation
and escalation remain deferred.
No further user answer is needed for this bounded first journey.

## 22. Technical research and ADR dependencies

Future author refreshes public Company assignment/current-actor, safe command, restricted event and App seams, confirms one-session fit/lock order, then chooses reviewed constraints/indices. ADR 0006 remains sufficient unless actual research exposes a costly new choice. No real data, source, staff directory, human test operator or secret is needed for synthetic proof.

## 23. Readiness and publication boundary

The access principle is settled. Source checks found no open functional
prerequisite for this bounded manual journey: Company, membership, explicit
assignment administration, restricted Accountability recording and the Prisme
shell are delivered. Ideas/complaint runtime branches are not prerequisites.
Root completed ordered Standards then Spec review on 2026-10-21, approved this
v1.0 bounded contract and authorized same-issue canonical normalization/local
work. This records real agent review, not Dan's personal PRD review or runtime
delivery.

The originating vertical issue owns canonical normalization and the first runtime
journey in the same focused delivery under root's explicit same-issue
normalization/local-work exception. A fresh author must
verify live ownership/seam/fit and matching doctor before edits. Canonical owner
changes, complete exact-head/base/integration proof, public evidence and the bounded
final review remain required before merge.
No `ready-for-agent` label, real assignment, release reorder or functional credit
is conferred merely by this source preparation. Dan is not asked to review PRDs.

## 24. Bounded attributed journal corrections (#956)

**Status:** Approved — bounded journal-correction extension

**Extension version:** 1.0

**Owner:** Company Operational Risk

**Contract issue:** [#956](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/956)

### 24.1 Authority, outcome and boundary

Under [Dan's selected-lot coordination](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6478554347),
this extension fills only v1.0's explicit journal-correction gap. Sections 1–23
retain their approved intake/follow-up meaning. This section owns the new
observable behavior; Authorization section 8 still owns Reader/Recorder v1 and
live authority, Accountability section 7 restricted recording, and UX/Platform
their existing controls. No new permission, captured version, real assignment,
member directory, actor-reader or shared model-lifetime change is required.

A Recorder who discovers a factual error in a saved observation or narrative
reassessment can append a motivated correction to its text and/or declared date,
reopen the current corrected statement, and recover every predecessor. This is
reversible product synthesis within the selected gap, not a new Iurie answer,
assessment, approval, responsibility appointment, effectiveness or closure.
Assessment stays `not-assessed`; responsibility stays `not-specified`.

In addition to stories 1–22:

23. As a Reader, I want to open the current statement from any original or correction in the complete Risk history, so that an old page cannot masquerade as current facts.
24. As a Recorder, I want to correct literal text and/or its declared date with a reason, so that a factual mistake does not require overwriting the original.
25. As a Reader, I want original author/time and each corrector/time separately, so that a correction does not reattribute the person's original statement.
26. As a Recorder, I want to correct the latest successor again, including restoring an earlier value, so that every motivated change remains recoverable.
27. As a Recorder, I want invalid/no-change and stale drafts preserved for explicit review, so that failure never silently replaces my intent.
28. As a user, I want exact uncertain retry and safe scope/authority retirement, so that a late reply or a language change cannot create or disclose another correction.
29. As a Reader or keyboard/phone user, I want the complete history and truthful current/original labels in all four locales, so that reading does not depend on mutation authority or screen size.

Success means one correction/revision/event/receipt per deliberate accepted intent,
all original and successor values recoverable, and zero tested cross-scope
metadata disclosure. No performance or productivity target is invented.

### 24.2 Original identity, successors and current facts

The **original journal entry** is an existing immutable `observation` or
`reassessment` under one Risk. Its identity, Workspace/Company/Risk, kind,
narrative, `occurredOn`, actor snapshot, server time and revision never change.
A correction has a new entry identity and aggregate revision, kind
`journal-corrected`, that same original's `originalEntryId`, immutable `journalKind`
(`observation` or `reassessment`), immediate `predecessorId`, full replacement
`narrative` and `occurredOn`, nonblank `reason`, corrector snapshot and server time.
It is a factual successor, not another observation/reassessment or an intake
successor. Target, original kind and ownership cannot be relabelled or transferred.

Initially the current journal entry is the original itself, and the first
correction's predecessor is that original identity. Later corrections always
name the last correction as predecessor while retaining the same original target.
Only one committed successor follows each predecessor. Predecessors cannot come
from another original, Risk, Company or Workspace. The revision order is strictly
increasing, so the chain cannot cycle. No deletion, in-place update or rewriting
of an earlier correction/reason is exposed.

The current statement consists of the original kind and the latest successor's
full narrative/date, or the original's values if never corrected. Original author
and recording time stay labelled as original attribution; latest correction
actor/time/reason are separately labelled. A current projection never changes
an older history row or claims the correction time was the occurrence date.
Correcting one target leaves other journal targets and current/original intake
facts unchanged. It increments the existing Risk aggregate revision exactly once;
there is no independent journal aggregate or assessment/status transition.

Narrative uses the existing nonblank 5,000 JavaScript-string-unit bound; reason
uses the existing nonblank 2,000-unit bound. Accepted whitespace, newlines,
Romanian/French diacritics, Cyrillic and markup-like literal text are preserved
without trimming, translation, interpretation or truncation. `occurredOn` is an
explicit valid date-only `YYYY-MM-DD` or `null` meaning unknown, never server time,
a timezone-converted instant or an inferred future-only date. A Recorder may
change known to unknown, unknown to known, or one valid date to another.

Compare proposed narrative/date literally with the selected current statement.
If both are identical, a new command is invalid even with a changed reason; a
reason alone creates no revision, receipt or event. Changing either is sufficient.
Restoring original or earlier values after an intervening change is valid with a
new reason and current predecessor. This is the existing intake-correction no-op
principle applied to journal facts. An exact committed retry is resolved earlier
and still returns its historical success.

### 24.3 Narrow public command, current read and complete history

Operational Risk owns these interfaces through its existing server-authorized
Company context. Names here are the extension contract, not implemented endpoints.
No client-supplied actor, Company ownership, kind or assessment is accepted.

| Interface                                                             | Complete contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /operational-risks/:riskId/journal/:journalEntryId/corrections` | `journalEntryId` is always the original observation/reassessment identity. Requires `Idempotency-Key` and exactly `expectedRevision`, `predecessorId`, `narrative`, `occurredOn`, `reason`; all five fields are required, including explicit date or `null`. No partial patch or kind/owner field.                                                                                                                                                                                      |
| Successful correction                                                 | HTTP 201 with the existing `{ risk, entry }` envelope: `risk` keeps its existing shape and original/current intake, at the resulting aggregate revision; `entry` is the immutable `journal-corrected` successor defined in 24.2. Common `id`, `revision`, `actor.workspaceMembershipId`, `actor.displayName`, `recordedAt` keep existing entry meaning. The additional exact fields are `kind`, `originalEntryId`, `journalKind`, `predecessorId`, `narrative`, `occurredOn`, `reason`. |
| `GET /operational-risks/:riskId/journal/:journalEntryId`              | HTTP 200 with exactly `{ riskId, companyId, revision, originalEntry, currentEntry }` from one authorized consistent read. `originalEntry` retains the existing observation/reassessment shape. `currentEntry` is that identical original or its latest complete correction. `revision` is the Risk aggregate revision observed by this read. No query, nested collection or implicit latest-target selection.                                                                           |
| Existing Risk history                                                 | `GET /operational-risks/:riskId/history` keeps `{ items, next_cursor }`, default 25/max 50, strictly descending aggregate revision and exclusive numeric revision continuation. It returns original intake/journal rows unchanged plus the new correction variant, including every predecessor/reason/attribution. Each original and correction offers the exact original-target current read.                                                                                          |
| Existing Risk list/detail                                             | Existing list ordering/cursors/summary and detail shape remain. Detail revision advances; original/current intake fields keep their existing meaning. No unbounded journal array or journal facts hidden inside intake are added.                                                                                                                                                                                                                                                       |

Complete journal discovery is the existing full aggregate history, including
originals beyond the first page. The UI reaches every continuation and retains
loaded history when an older-page request fails. It never filters only one loaded
page and calls that the complete journal, nor derives current facts by finding a
correction in incomplete history. The exact-target read returns a scalar pair,
so it has no pagination; all collections retain the bounded history/list rules.
There is no total count or generic discovery surface. Separate reads can observe
later aggregate revisions: an older response is labelled historical and cannot
seed a correction against a newer revision without reload/review.

API, durable-receipt and web validators recognize the new variant constructively.
They verify consumed scope/target identities, original journal kind, actor/time,
positive safe revision, current revision at most the read aggregate, predecessor
and exact consumed fields; original/current equality is required when uncorrected,
and a correction's original target/kind must agree with the original. Unknown
kinds, malformed/null required values, contradictory projection links and foreign
successful targets fail closed without presenting them as valid current facts.
No permissive HTTP decoder may discard persisted receipt information.

### 24.4 Authority, ordering, concurrency and transaction

Every new read requires current Reader v1, active Company context, membership,
Internal User and Company. A correction, including replay, additionally requires
Recorder v1. Any currently authorized Recorder may correct a readable original;
author identity does not restrict or confer correction authority. Reader-only
users see the complete read/history, without correction controls. Recorder without
Reader/context receives no content or command access. Assignment administration
continues to reveal no Risk text. Unknown/null captured versions fail closed.

Use a distinct receipt command kind `journal-correct`, preserving `record`,
`journal` and `correct` exactly. Its identity remains Workspace + Company + actor
Membership + command kind + key; target identity is in the fingerprint, not a
second key namespace. Fingerprint both route targets and the complete submitted
body, including expected revision, predecessor, literal date/text and reason,
using the existing stable JSON-key-order convention. Changing target or any input
under a committed same-kind identity conflicts; changing object-key order alone
does not. Old command kinds/keys cannot collide with the new kind.

The transaction order is:

1. Resolve live read/record authority through Access's existing identity-first transaction-aware locks. Hold required Internal User, membership, Company/context and captured Reader/Recorder authority consistently through commit, serializing against successful revocation/deactivation; Risk never queries Access tables or introduces another lock owner.
2. Validate route/key representation and serialize the scoped command identity. Resolve a matching durable receipt under current authority **before** new-intent aggregate, current-target/predecessor and unchanged-fact checks. A changed fingerprint returns `IDEMPOTENCY_CONFLICT` (409); an exact match returns its original validated 201 result without an event, new revision or projection recomputation, even after later corrections or unrelated Risk revisions.
3. For a new intent, validate the complete body, lock the scoped Risk aggregate and resolve the original journal target and latest predecessor. Expected revision must equal the locked Risk revision, and predecessor must equal that target's current entry. An obsolete expected revision or predecessor returns `STALE_RISK_REVISION` (409). Revision exhaustion keeps existing `RISK_REVISION_EXHAUSTED` behavior. No blind rebase or automatic new key occurs.
4. Reject unchanged narrative/date with `UNCHANGED_RISK_JOURNAL_FACTS` (400). Append one validated correction, advance the aggregate once without changing current intake, record one restricted event, build/validate the complete response and persist its durable receipt in the same transaction. Commit only when the entire unit is valid.

Concurrent same-key identical submissions converge to the same result. Distinct
keys naming the same current aggregate can commit at most one new correction,
even when they target different originals or race with append/intake correction.
The loser reloads current facts before a deliberate new command. Stale, invalid,
unchanged, denied, not-found, failed and replay outcomes add no success event and
no new committed receipt/revision. An uncommitted refused key is not consumed.

Missing verified identity is 401; lost required authority is 403, including cached
receipt replay. Malformed input/UUID/key or unknown fields are 400
(`INVALID_RISK_INPUT` for extension fields). A well-formed unavailable/foreign
Risk or journal target is 404 after scope authorization; an intake or correction
identity supplied as the original target has the same 404 outcome. A foreign or
wrong-chain predecessor produces only the generic stale conflict, never its
existence, current value or attribution. Errors include no confidential text.

Failure to insert/advance, record Accountability, validate/build response or store
receipt rolls back the entire unit, including any current-pointer change. A
sanitized 5xx retains `RISK_OUTCOME_UNCONFIRMED`; acknowledgement loss or malformed
successful output remains uncertain to the caller. Neither proves rollback.
The server validates new success and historical receipt inside the transaction.
A confirmed historical replay is not a claim that its result is still current.

### 24.5 Restricted Activity and confidentiality

Extend only the existing restricted Risk recording boundary with
`operational_risk.journal.corrected`. Its server envelope records Workspace,
Company, Risk, new correction entry, resulting aggregate revision, actor
Membership/Internal User and recording time. Metadata is exactly
`{ revision, kind }`, with `kind` the original observation/reassessment kind.
The immutable Risk-owned correction links original and predecessor; no narrative,
reason, date, source description, process/cause/effect or copied author name
enters event metadata or diagnostics. Existing event rows/actions stay unchanged.

Accountability owns recording; Risk owns authorized history/current reads. There
is no generic Activity target/projection, Home result, search hit, count, facet,
filter, export or link for the correction, including for administrators and
Activity readers. All direct and continuation reads recheck the same current
scope; a cursor or historical link confers no authority. Synthetic proof uses no
real sources or confidential source artifacts. No URL is fetched or interpreted.

### 24.6 Production editor, recovery and asynchronous lifetime

Extend the existing production Risk workspace in the Prisme shell. From any
original/correction history row, **View current statement** opens the exact
original/current pair with separate original kind/author/time/text/date and current
correction actor/time/reason. Preserve the full aggregate history and its paging;
labels distinguish a historical correction from the selected current successor.
Use loading, no-correction-yet, unavailable/denied, read failure and older-page
failure states, with explicit safe read retry. Empty history is not a load failure.

Only with Reader + Recorder does **Correct journal statement** open a styled
editor prefilled from the freshly read current narrative/date, with reason blank.
Kind, original identity/attribution and owning Company remain visible and read-only.
The form carries that read's aggregate revision and current predecessor. Date can
be explicitly cleared to unknown. Validation/no-change associates a localized
error with the field/form and preserves literal drafts; there is no write until
explicit save. Cancel before submit discards the unsaved editor without an event.
Keyboard focus enters the editor, errors are announced, and cancel/success returns
to a meaningful target control or current statement.

One existing scoped owner holds selection, current read, history, editor,
submitting/uncertain intent and conflict review. A stale response from another
Risk/entry/read generation cannot replace it, restore a retired editor, or call
shared identity rejection for a newer session, even if transport ignores abort.
A successful read used to prepare a new intent must match the selected root and
Company and still be current for that owner. This is local Risk work; it requires
no shared actor-reader or model-lifetime refactor.

Saving freezes exact serialized body, path, expected revision, predecessor and
key. While submitting or uncertain, disable edits, cancel/replacement, target/Risk
selection and sibling mutation actions that could discard or replace that intent.
Keep the existing safe navigation lifetime: hiding/returning to the section or
changing locale retains selection/draft/pending identity without another POST.
A network/5xx failure, lost acknowledgement or malformed success shows **Outcome
unconfirmed** and an explicit **Retry the same correction** using identical
path/body/key. Reload is a read, never proof that an absent row rolled back, and
never permission for an automatic fresh key. A safe scope retirement may discard
in-memory intent but never claims to cancel the server transaction.

A definite 400 keeps the editable draft and reason. A 409 blocks resubmission:
reload the Risk, selected original/current pair and relevant history; show the
latest values alongside the retained proposal. Only explicit review/continue may
adopt the new expected revision/current predecessor for a new deliberate command
and fresh key. Do not silently overwrite a concurrent correction. A same-key
fingerprint conflict is identified separately from stale state; the occupied key
is never reused for changed intent. A 404 retires the unavailable target and offers
fresh authorized discovery without displaying hidden details. Reader/Recorder or
Company/session loss immediately retires content, draft, pending/review and late
callbacks; existing Access revalidation handles denial and independent Company
context. A late 401/403 from a disposed owner cannot sign out a replacement user.

A validated 201 confirms that exact correction, even if a following current/
Risk/history refresh fails. Show **Saved; refresh failed** with read retry, no
resubmit or new correction key. On successful refresh, show current state (which
may already have a later successor) and retain the confirmed historical result in
history. Opening another original never retargets a pending correction.

All interface copy, accessible names, state labels, field errors, kind and
original/current/history labels exist in `ro`, `ru`, `fr`, `en`, inheriting
Romanian default/fallback. Locale changes preserve all literal values, page/
selection, loaded history and exact uncertain command; only presentation changes.
Use existing styled text/date controls and buttons, shared Select only if needed,
visible focus and multiline wrapping. Prove actual desktop 1440 px/narrow 390 px
reflow with long literal text, all four locales and no clipped history/actions.

### 24.7 Additive genuine-upgrade compatibility

Use reviewed additive Drizzle migration(s) after the actual current predecessor,
not an edit to delivered migration 0072 or its snapshots. Extend the existing
Risk-owned storage/constraints for the new entry/receipt/event variants and any
bounded current-target index/pointer. Preserve original ownership/kind, immutable
entry/event/receipt guards, monotonic aggregate head and complete-committed-history
checks. Enforce same Workspace/Company/Risk/original/predecessor lineage, one
successor per predecessor, positive ordered revisions and valid original kind
with database constraints/transaction guards, not TypeScript annotations alone.

No old entry, event, receipt response/fingerprint, actor snapshot, assignment,
permission version or intake-head pointer is rewritten or backfilled as a
correction. Old uncorrected originals project as their own current entry; any
new current index/pointer is derived without inventing historical corrections.
Retain exact legacy `record`/`journal`/`correct` receipt schemas and replay results;
do not attach new fields to stored JSON or rebuild historical results from current
state. New receipt validation dispatches deliberately by supported command/entry
shape and fails closed on corrupt/unknown stored versions. Existing public intake,
append, intake-correction, list/detail and all history variants keep their meaning.

Prove a genuine upgrade: migrate a disposable database only through the real
immediate predecessor of the new migration, populate it under that schema with
intake, both journal kinds, motivated intake successors, all three old receipt
kinds, restricted events, inactive/revoked and live grants plus representative
unrelated data; capture their bytes/values. Apply the actual migration chain,
compare preserved rows and receipt JSON/fingerprints, replay old commands through
the current public API and then correct an old journal original. A fresh-schema
fixture or merely asserting new tables exist is insufficient. Rollout recovery
preserves appended history: use a compatible forward correction; an older reader
must fail closed on unknown new variants, never delete or coerce them to restore
compatibility. No environment/CI change or new dependency is included.

### 24.8 Runtime test-first seam and required proof

The first meaningful RED is public PostgreSQL REST, using the delivered isolated
PostgreSQL REST harness. Bootstrap synthetic identities/Company and explicitly
grant context + existing Reader/Recorder v1 through public Access commands.
Through existing public routes record intake, append an observation, and confirm
its returned identity, original values and aggregate revision 2. Then POST a
valid motivated correction to that exact original with `expectedRevision: 2`,
`predecessorId` equal to the original, changed literal narrative/date and a fresh
key. Require HTTP 201 and the exact new result/root/predecessor/attribution. Before
implementation the absent correction command is the intended RED (404); setup,
import, identity, migration or connection failure is not. Run and inspect the
actual failure before the smallest green; do not report a predicted result as
executed evidence. This documentation task runs no runtime RED.

Required runtime evidence, all through the smallest real public seam that proves
it, covers:

1. Original → first correction → repeated correction → restore an earlier value, for observation and reassessment, with fresh current reads and complete aggregate-history pages across the page boundary. Preserve exact original text/date/kind/attribution; known/unknown dates and unchanged intake/assessment/responsibility are asserted.
2. Empty/blank/excess narrative/reason, exact Unicode string-unit bounds, malformed dates/UUID/revisions, omitted required date, unknown/owner/kind/score/status fields and both identical facts with changed reason. Rejection consumes no state/event/receipt; a corrected uncommitted intent can reuse its key.
3. Exact same-key concurrent success and historical replay after later target/unrelated revisions; changed text/date/reason/target/expected/predecessor same-key conflicts. Legacy receipt replays remain exact after new corrections and upgrade.
4. Deterministic database barriers prove two distinct-key corrections of the same predecessor, corrections to different originals at one expected aggregate, and correction racing append/intake correction: at most one transition succeeds; loser is stale. Prove both orderings of authority loss: command owns authority until commit and revocation waits, or revocation/deactivation owns the lock first and command/replay is denied. Include Reader, Recorder, context, Company, membership and Internal User loss and no authority from creator/admin/other-family/unknown versions.
5. Direct foreign/missing Risk, original and predecessor identifiers, list/history/current read and continuation, plus generic Activity/Home/search/count/filter/export/target exclusion. Exercise Reader-only and Recorder-without-Reader/context independently; no real assignments or member directory.
6. Real insertion/update failure at correction/current-index/head/event/receipt boundaries, invalid server clock, Accountability failure and response-construction/validation failure. Compare every affected row/revision before and after; remove only the synthetic failure and retry the same command successfully. Direct SQL cannot update/delete history, fork a predecessor, skip a head or cross scope. Execute the populated genuine upgrade in 24.7.
7. Actual App composition tests establish admitted actor, visible Company, loaded Risk and selected original/current read before requiring the correction action. Exercise form and history via production controls, rather than replacing App/Risk with a mock. Targeted web tests prove malformed/foreign successful reads, invalid/no-op draft retention, stale review, distinct conflict recovery, uncertain exact retry, confirmed-save/refresh failure, four locales and late abort-ignoring read/write/401 replies after root/Company/session/authority retirement.
8. Extend the registered real App/API/PostgreSQL acceptance journey at desktop 1440/narrow 390. Explicit real synthetic grants, observation and reassessment corrections, repeated history/current reopen after reload, Reader-only/denied behavior, keyboard/focus and all four locale views are required. A lost acknowledgement may be simulated only after the real command commits, never with a fake successful write/permission response. Inspect synthetic screenshots saved through `testInfo.outputPath(...)` and preserve the required browser-evidence directory.

### 24.9 Acceptance and publication/readiness boundary

The extension is acceptable only when all 24.8 cases and the complete production
journey prove the contract in 24.2–24.7. Runtime must refresh the owning Risk,
Access, Accountability, schema and registered App seams and demonstrate the whole
bounded outcome fits one fresh session. ADR 0006 remains sufficient; an actual
costly new architectural choice is surfaced before implementation. Scoring,
thresholds, residual/effectiveness judgments, responsibility assignment, closure,
deletion, scheduled reevaluation, alerts, Client/Project/Document links,
attachments, exports, finance, AI and the broader Risk workflow remain deferred.

Ordered independent Standards then Spec preparation passed with zero findings.
The coordinator [approved this bounded contract](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/956#issuecomment-6479032648)
on 2026-10-28 under delegated product authority. Only the coordinator publishes,
runs/publishes exact integration evidence and merges this contract.
No local author declaration constitutes that approval or runtime/MVP credit.

A separate context-free vertical runtime issue follows only the approved merged
contract and fresh live readiness/ownership/fit checks. Its outcome is this entire
correction/current/history/recovery journey; schema/API/UI proof stays one slice.
It names this section and inherited authorities, starts with 24.8's actual REST
RED, and retains all exclusions. Run the matching web/PostgreSQL doctor before
runtime edits, targeted strict format/lint/types and affected API/migration/web/
registered acceptance checks, then the applicable review and exact-source/base/
integration gate from [issue execution](../agents/issue-execution.md). No next
issue, runtime implementation or heavy test process starts in this contract task.
