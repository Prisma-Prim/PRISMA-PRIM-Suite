# PRD — Company Ideas intake and disposition history

**Status:** Approved — bounded contract; runtime not delivered  
**Version:** 0.2  
**Access decision date:** 2026-10-19  
**Delegated agent product review:** 2026-10-20  
**Product owner:** Dan Popescu  
**Business evidence:** Iurie interview sessions 70–71; see section 21  
**Contract boundary:** Record/reopen Ideas and retain attributed defer/reject history

## 1. Authority and downstream consumers

This PRD defines one bounded capability under the [Product Vision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/product-vision-prd.md).
It consumes [Authorization](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/tenant-company-client-authorization-prd.md),
[Activity](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/activity-log-accountability-prd.md),
[UX](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/ux-localization-configuration-prd.md)
and [Platform](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/platform-security-reliability-operations-prd.md)
authorities; it does not redefine them. [ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md)
owns tenancy and additive grants. [Tracker #726](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/726)
owns this documentation prerequisite's delivery state.

The [dated product synthesis](consolidated-product-decision-record.md#347-bounded-ideas-intake-and-access-separation--2026-10-19)
preserves rationale and provenance. DEC-018, DEC-028–DEC-035, DEC-183 and
DEC-194–DEC-207 remain unchanged. Downstream implementation issues derive from
this bounded contract only after canonical product review and live readiness checks.
The capability does not approve real named grants or claim runtime delivery.

## 2. Problem

A useful improvement suggestion can disappear in conversation or be rejected
without its reason being recoverable. Capturing an idea should not require an
approval-to-spend process, a score or a Project created prematurely.

## 3. Outcomes and measurable value

An authorized member can submit an idea and reopen the same text after refresh.
A separately authorized reviewer can record a reasoned defer/reject disposition.
Every saved submission/disposition has durable attributable history. Acceptance
measures: one record per unchanged retry; all disposition reasons recoverable;
zero tested cross-Company/Workspace metadata or content disclosure. No fabricated
business time-saving target or full Ideas-module completion is claimed.

## 4. Solution and principles

Use a Company-owned plain-text Ideas register in the existing application.
Separate recording, reading and reviewing. Preserve original submission and
append decisions rather than overwriting reasons. A recorded idea is a suggestion;
a defer/reject disposition is a collection-review fact. Neither authorizes work,
spending, employment, certification or creation/mutation of another business object.

## 5. Actors and ownership

Every Idea belongs to exactly one Workspace and one owning Company; operations
require that Company to be active. Company
ownership is established from current server-authorized context at creation and
cannot be transferred in this slice. There is no All Companies creation/view.

Actors are Reader, Recorder and Reviewer capabilities, not inferred job
titles or named people. An administrator uses the existing explicit Company
assignment boundary. Dan approved the Company-level separation of consultation, recording and
Ideas defer/reject rights; [decision provenance](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507).
No real assignment is authorized by this PRD. Company context, Workspace ownership, Activity read, Project
rights and the author's identity alone confer no Idea access.

## 6. Numbered user stories

1. As an explicitly authorized Recorder, I submit an idea in the visible Company.
2. As a Reader, I browse a bounded authorized list and reopen exact saved text.
3. As a Reviewer, I defer an idea with a reason and optional reconsideration date.
4. As a Reviewer, I reject an idea with a reason that remains in history.
5. As a Reader, I distinguish original submission from each later disposition.
6. As a user, I recover an uncertain save without duplicate records or lost intent.
7. As a user losing access or changing Company/session, I stop seeing stale data.
8. As a keyboard/mobile user, I complete the journey with coherent styled controls.
9. As an assignment administrator, I explicitly grant/revoke each independent
   capability for an eligible member without expanding old bundles or reading Ideas.
10. As a Reader without a mutation grant, I consult the register and history without
    receiving recording or review actions.
11. As a member with Recorder or Reviewer alone, I receive no Idea access until I
    independently receive Reader and Company context.
12. As a Reviewer, I reload after a concurrent review before making another deliberate
    decision, while preserving the preceding reason.
13. As a Reader, I traverse every authorized list/history page and distinguish a
    genuinely empty register from a failed read.
14. As a user, I correct invalid unsaved text/date input without losing my draft or
    changing already committed history.
15. As a user choosing Romanian, Russian, French or English, I retain literal business
    text and pending intent while interface labels change.
16. As a user, I distinguish a confirmed save from a later refresh failure and retry
    uncertainty without claiming a second review or a rollback.

## 7. Scope and exclusions

In scope: submit, Company list, exact detail/history, defer/reject, safe retries,
conflicts and independent grant/revoke administration under the approved separation.

Excluded: approve, fund, plan, implement, score, rank, estimate/compare benefits,
automatic reminder, Task/Project/action conversion, bulk import/export, AI calls,
attachments, cross-Company sharing, Client/Project/process links and advanced
reports. Their appearance in source evidence is preserved, not silently removed
from the target product. They are separate future behavior, not this slice's credit.

## 8. Domain concepts and minimal fields

| Concept/field          | Proposed contract                                                                                      | Evidence                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Idea                   | Stable identity, one Workspace/Company, original plain-text description                                | session 70 explicit Ideas-register addition             |
| Origin                 | Required plain-text source description, supplied by user; no system source taxonomy                    | session 71 item 362 source classification               |
| Submission attribution | Server actor/time, stable mutation identity                                                            | Activity owner, DEC183                                  |
| Current disposition    | `new` before disposition; latest recorded `deferred` or `rejected` afterwards                          | session 71 items 360–361                                |
| Disposition            | Target Idea, kind, nonblank reason, server reviewer/time; optional reconsideration date only for defer | session 71 item 360                                     |
| Revision               | Monotonic aggregate revision used for stale-command detection                                          | reversible concurrency mechanism, not business approval |

No separate required title is introduced; a compact list excerpt derives from the
first description line without changing stored text. Reconsideration is a date-only
value, not an automatic action. Do not promote source text mentioning AI into proof
of generated content or provider permission. Body/origin/reason are untrusted text.
Description and origin are required nonblank text; every disposition requires a
nonblank reason. Whitespace-only input is invalid, but accepted text, including
spaces, line breaks, diacritics and Cyrillic, is preserved literally. Technical
limits selected for this bounded contract: description 5,000 characters, origin 300,
reason 2,000; reject excess without truncation or hidden normalization. These
bounds use JavaScript string length as a reversible implementation choice.
An optional reconsideration date must be a valid calendar date in `YYYY-MM-DD`
form; no inferred future-only rule, automatic due state or reminder is added.

## 9. Lifecycle, correction and history

Creation produces `new` at aggregate revision 1. A Reviewer records `deferred` or `rejected` against an
explicit expected aggregate revision. Further defer/reject entries may follow
either disposition; they preserve every prior reason and express a later human
review, never approval. An identical repeated decision is allowed only as a new
explicit intent with its own attribution; transport replay is not a new decision.

Every disposition records the exact preceding revision. A different concurrent
review wins once; stale attempts require reload/review before a new command.
Reconsideration date is optional for defer and forbidden for reject. No clock
changes disposition; rejection/defer do not create a Task or external instruction.

Original submission and saved dispositions cannot be edited, deleted or manually
hidden from authorized history.
A later disposition corrects the current review outcome while retaining the
previous one. Original-text correction and return-to-new are excluded from v1;
show the original truthfully, without a pretend editable form. This bounded
exclusion is explicit rather than a claimed complete correction workflow.

Each committed disposition advances the aggregate revision exactly once. Every
mutation requires an explicit idempotency key. Its durable receipt is scoped to
Workspace, Company, acting membership and command kind; its fingerprint includes
the exact submitted payload and target Idea when applicable, including the expected
revision. An unchanged retry returns the original saved result after current
authorization succeeds, even if later dispositions have advanced the Idea. It
does not rerun stale-revision validation or add a record, revision or event.
Reusing that key with a different fingerprint is a conflict. A changed payload or
deliberately repeated review uses a fresh key and the newly reviewed revision;
creation retries preserve the original description/origin and key.

New commands serialize against the aggregate and successful access revocation or
membership/Company deactivation. When access loss commits first, the command is
denied without a write; when the command commits first, later access loss still
prevents confirmation of its cached result. An uncertain transport outcome is
never reported as proof of rollback. Business state, receipt, attributed history,
required event and valid response commit as one unit.

## 10. Invariants and prohibited outcomes

1. Ownership never crosses Workspace/Company; all relations share that scope.
2. Submission text remains exactly what was saved; localization does not translate it.
3. Original and every disposition remain attributable and recoverable.
4. No absent/unknown grant becomes authority; reads/counts are authorized first.
5. No review disposition implies funded/approved work, certification or conversion.
6. No unsupported status, silent truncation, in-place history edit or hard deletion.
7. Failure cannot leave a success event without its committed business record.
8. Repeated transport identity never multiplies the saved submission/disposition.

## 11. Permission matrix

The [Authorization PRD section8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns the exact three independent captured v1 bundles, their grants, live checks
and safe administration events. This capability consumes that authority:

| Operation           | Required current capabilities, in the same active Company                    |
| ------------------- | ---------------------------------------------------------------------------- |
| List/detail/history | Ideas Reader, current Company context and active membership                  |
| Record              | All read prerequisites plus Ideas Recorder                                   |
| Defer/reject        | All read prerequisites plus Ideas Reviewer; Recorder not required or implied |

No work/funding approval exists. The assignment administrator chooses actual
members separately; no bundle is bestowed by a title, Idea authorship, Workspace
ownership or migration. Permission changes retire scoped UI state and late replies.

## 12. Documents, evidence and Activity

No Document, PDF, attachment or legal evidence is generated/admitted. Original
submission and disposition history are application facts, not an official Document.

The [Activity PRD section7](activity-log-accountability-prd.md#7-authorization-and-privacy)
owns exact recorded events and the internal-only restricted family. Idea mutation,
receipt and event are atomic. Own-registry history requires current Idea read.
Generic Activity/Home never reveal this family or its counts, including to Company
administrators. No activity-read grant or projection is introduced.

## 13. Configuration, localization and accessibility

Reuse UX owner and accepted [Prisme provenance](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/apps/web/src/production-shell/prisme/README.md).
Use the default violet/yellow Prisme hierarchy, clear primary/secondary/destructive
review actions, styled accessible controls and four locales. Do not copy Classic
captures as primary proof or introduce raw browser checkbox/select appearance.
Semantic native inputs/buttons remain appropriate under custom presentation.

Labels/errors/dates respect locale; original business text and canonical dates do
not change. Romanian fallback and required-key coverage follow UX section 7;
switching language preserves entered work, focus and unchanged retry identity
without locale-only business requests. No tenant-configurable workflow or arbitrary executable taxonomy.
Keyboard, focus restoration, validation association, target sizes and long-text
wrapping are tested at desktop 1440 px and narrow 390 px. Inspect actual screenshots of
open controls, errors, loading/empty/detail/history and narrow action layout.

## 14. Source of truth and providers

NestJS/PostgreSQL own facts, authorization and final dispositions. No Clerk type
enters the domain; existing authentication remains unchanged. There is no Google,
AI, email, storage or synchronization call. Their outages do not change this
capability; an API failure is reported truthfully with safe explicit retry.

## 15. Migration and compatibility

Additive reviewed migration is required for the new scoped records/constraints;
no migration grants rights or creates real Ideas. Existing assignment versions and
data stay unchanged. No historical import, dedup, role mutation or source-sheet
conversion. Rollout compatibility and corrective-forward recovery are reviewed
at implementation; the API and UI ship as one public-result slice.

## 16. Security, reliability and performance

Use Platform and Authorization owners. Validate untrusted text; render as text,
not executable HTML. No body/reason in diagnostic logs, metrics or generic Activity.
No background worker, new provider secret or real customer fixture is necessary.

List pages are bounded 25, deterministically newest-submission first with stable
identity tie-break; history is bounded 25 newest-first with explicit continuation.
These are reversible mechanical choices, not a measure of importance. Count/rows
use one consistent authorized read snapshot. Do not load an unbounded whole register.
No invented latency/SLA or guessed benchmark; measure fixture behavior and safe
query plans. Existing platform backup obligations include the committed records.

## 17. Complete UI states and recovery

Loading, empty, ready, validation, denied/session-expired, retryable failure,
uncertain mutation, stale disposition and read-only detail are explicit. Keep the
submitted payload and mutation identity for an unchanged uncertain retry; edits
create a new intent. Confirmed save remains confirmed if subsequent refresh fails.

Section navigation preserves local work while authority/context remain unchanged.
Company/identity/session/membership/captured-grant changes retire results and
pending responses; no stale reply may resurrect an Idea. Do not restore drafts
from hidden scope. Permission refusal reveals no hidden existence/count.

Unauthorized context uses the existing opaque refusal. Within an authorized
Company, an unknown or foreign Idea has the same safe unavailable/not-found
outcome. Invalid input preserves the draft for correction; a stale revision
requires fresh detail and deliberate review before a new command. A later-page
read failure never labels old rows/counts as current. Malformed responses fail
closed before rendering records or actions.

## 18. Durable and reversible implementation choices

Existing React/Vite/TypeScript, NestJS, PostgreSQL/Drizzle and Clerk boundary remain
unchanged. ADR 0006 governs ownership; no new architectural ADR is presumed.
The owning module exposes record/read/disposition operations; persistence is
private. Request names, indexes, component factoring and endpoint spelling remain
agent decisions. No dependencies added merely for this proposal.

## 19. Testing decisions

Begin RED at the public REST seam on disposable PostgreSQL: authorized submit,
reload, defer, reject and recover both reasons. Then implement minimal green and
refactor through the module's public seam. Prove replay/conflict, lost rights,
wrong Workspace/Company, captured version fail-closed and absent generic projection.

REST acceptance includes Recorder-only and Reviewer-only denial without Reader,
Reader-only read with both mutations denied, independent Recorder/Reviewer grants,
null/unknown captured versions, exact creation/review retries after uncertain
responses, changed-payload key conflicts and two reviewers submitting the same
expected revision. Deterministic barriers order revocation/deactivation against
new commands and committed replay; assert the resulting state, receipt/history
and restricted event together. Read more than 25 submissions/reviews through
continuation, including tied ordering and the final page. Check generic Activity
and Home responses/counts for ordinary readers and administrators.

The real App with HTTP boundary doubles proves permission-gated controls,
malformed/denied/unavailable states, exact request identity, stale reload,
confirmed-save versus refresh failure, and delayed reply suppression after each
Company, identity/session, membership or captured-assignment change. It also
proves section/locale continuity while authority stays unchanged. Mock the HTTP
boundary, never the feature or permission owner being tested.

Registered browser acceptance proves real App submit→reload→reopen→defer→reject at
1440/390, plus keyboard, locale and failure recovery. Contract fixtures may isolate
UI edge cases but must not be presented as live PG/Clerk proof. Required matching
doctor, statics/types and sensitive stronger gate follow issue-execution at the
later author session; this draft claims no run or visual inspection.

## 20. Acceptance journey and criteria

Synthetic member A in Company A explicitly holds Reader/Recorder; member B holds
Reader/Reviewer; same-Workspace Company B and second-Workspace users are negatives.
A submits “Reduce repeated questionnaire entry” with origin “Internal suggestion.”
After reload, B defers with “Review after the pilot” and optional declared date,
then records rejection with “Existing workflow already covers this proposal.”
A reopens the exact original and both attributed reasons/current rejection.

Acceptance requires that complete public result, unchanged retry uniqueness,
stale-review rejection, Reader/Recorder/Reviewer separation, zero hidden metadata,
truthful saved-versus-refresh-failed feedback and inspected Prisme desktop/narrow
states. No Project/Task is created, no funding/implementation/approval badge appears.
These examples are synthetic test inputs, not Iurie's actual decision or real policy.

## 21. Business evidence and approved access-separation provenance

Sources:

- [Session70/comment5308298781](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5308298781):
  explicit additional Iurie request for an Ideas register; separation from the
  corrective-action register is the source's business interpretation, retained
  as bounded product synthesis here;
  approved future conversion/benefit direction does not decide present authority.
- [Session71/comment5308306511 items 360–362](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5308306511):
  accepted reason/decider/date retention, optional reconsideration, dispositions
  and Company/source classification; interviewer wording is not a schema decree.
- Decision record 34.1/34.4: retain answered subparts, distinguish accepted
  proposition from interpretation, and allow documented reversible synthesis.

Dan answered “Oui, cela me convient” to the plain-language choice of who may
consult Ideas/complaints, who may add them and who may defer/reject an Idea, per
Company, with people selected later. [Durable decision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507).
This approves access **separation only**: no automatic expansion, no named
assignment, no funding/work approval, no scoring or conversion right. An earlier
request for simpler explanation was not approval; this later explicit yes is the
approved source. The delegated agent product-review disposition is recorded in [#726](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/726#issuecomment-6283532399); reviewed canonical publication and live issue readiness remain required before implementation.

No new Iurie questionnaire is needed for the bounded purpose. Excluded work/funding
approval, scoring, conversion and original-text correction remain separate future
contracts. Under [Dan's 2026-10-20 delegation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237),
agents own synthesis, technical choices and the applicable Standards/Spec
preparation; routine documentation and PRD delivery requires no separate human
document review. After both axes passed without findings, the coordinator
approved this bounded contract. This is delegated agent product review, not a
claim that Dan personally reviewed the diff. Approved contract status does not
prove runtime delivery, broaden business authority or replace canonical
publication and fresh implementation readiness.

## 22. Technical research and ADR dependencies

Agents must inspect the current captured-assignment/public REST/Activity patterns,
validate migration constraints and measured bounded queries, and finalize the
sanitized new-event nonprojection. This is research/normalization, not a human
PRD-writing task. No external account, paid provider, source corpus or new durable
architecture is needed. Recheck ADR implications if implementation discovers any.

## 23. Readiness and explicit blockers

The access-separation decision is settled. No new Iurie questionnaire is required
for this bounded behavior. The live issue, not this file, owns execution state.
Before implementation, the reviewed capability/access/Activity normalization must
be on main and the tracker must point to it; ownership/dedup, one-session fit and
current public seams must be rechecked in the fresh author session. Preceding
#721/#725 was merged at `1db7781ba18ef3597c3d88e6af3066dfda46f469`;
it is no longer an open prerequisite. No implementation issue is ready merely
because this approved PRD exists.

This PRD defines Idea and Disposition locally in section 8. The small canonical
glossary addition is deliberately staged with the later complete sensitive
implementation; it creates no alternate behavior owner and is not a blocker for
this documentation-only prerequisite. Broader Draft PRDs retain their status;
this bounded synthesis does not promote their unresolved remainder.

The complete slice is one aggregate: recording/reopening plus attributed defer/
reject history and all three explicit opt-in rights. Current mechanisms fit one
focused issue; a split requires a concrete size or evidence problem rather than
repeating sensitive CI for presumed complexity. Public acceptance must cover the
complete contract before the one review round. No whole Ideas/Sarcina/MVP point
is credited by this document or a narrowly delivered subset.
