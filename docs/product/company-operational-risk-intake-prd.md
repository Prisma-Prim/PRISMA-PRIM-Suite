# PRD — Company operational-risk intake and manual follow-up

**Status:** Approved — bounded first journey; runtime not delivered  
**Version:** 1.0  
**Access decision:** Dan, 2026-10-21  
**Agent review:** Root coordinator, Standards then Spec, 2026-10-21  
**Product owner:** Dan Popescu  
**Boundary:** Record/reopen an unassessed operational risk and preserve factual manual follow-up

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

Saved journal entries are immutable in this first journey. Structured correction
of a journal entry is explicitly deferred; adding another observation preserves
both statements and never silently replaces the earlier one.

## 7. Scope and exclusions

In scope: intake, bounded Company list, detail/history, immutable observations and
narrative reassessments, motivated append-only intake corrections, safe retries,
stale recovery and explicit Reader/Recorder grant administration.

Excluded: journal-entry correction/replacement, responsible-person assignment,
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
styled Access bundle selector and require the new Risk Reader option followed
by Recorder. Source currently lacks those choices. This predicts an observable
missing capability after readiness, not a missing route/import or a fabricated
Risk authority parsed before readiness. No grant command is sent by this first
RED. It proves the first administration step, not completed Risk authorization.
Disposable PostgreSQL and registered browser proof must then establish real
grants and the complete journey. No test has executed in this preparation.

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
No test has run in this source-only preparation.

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
Iurie answers or a complete Risk module. Structured journal correction, scoring,
responsibility assignment, thresholds, periodic reevaluation and escalation
remain deferred. No further user answer is needed for this bounded first journey.

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
normalization/local-work exception and the existing four-Draft publication
priority. A fresh author must
verify live ownership/seam/fit and matching doctor before edits. No new PR may
bypass that hold; canonical owner changes, complete exact-head/base/integration
proof, public evidence and the bounded final review remain required before merge.
No `ready-for-agent` label, real assignment, release reorder or functional credit
is conferred merely by this source preparation. Dan is not asked to review PRDs.
