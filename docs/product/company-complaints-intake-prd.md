# PRD — Ordinary Company complaint intake and factual history

**Status:** Approved — bounded first journey; runtime not delivered  
**Version:** 0.2  
**Normalization date:** 2026-10-20  
**Product owner:** Dan Popescu  
**Business evidence:** Iurie interview session 43; see section 21  
**Contract boundary:** Ordinary complaint intake and attributed factual history; no sending or closure

## 1. Authority and downstream consumers

This PRD defines one bounded ordinary-service intake capability under the
[Product Vision](product-vision-prd.md).
Cross-cutting owners are [Authorization](tenant-company-client-authorization-prd.md),
[Activity](activity-log-accountability-prd.md),
[Governed Documents](governed-documents-prd.md),
[UX](ux-localization-configuration-prd.md)
and [Platform](platform-security-reliability-operations-prd.md).
[ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md)
owns tenancy and additive grants. The [Shared Client](release-1-shared-client-prd.md)
and [Project/Task](release-1-project-task-prd.md) PRDs retain Client/Project identity
and read boundaries; this contract creates no broader directory or Document access.

The [dated bounded synthesis](consolidated-product-decision-record.md#344-unresolved-arbitrations)
retains provenance without inventing a new numbered decision. DEC-028–DEC-035,
DEC-076, DEC-085–DEC-099, DEC-183, DEC-190 and DEC-194–DEC-207 still apply.
DEC-099 remains an explicit gate for assurance; ordinary factual intake neither
satisfies nor bypasses it. Canonical normalization on main remains required before
runtime publication and merge; section 23 records the explicit local-work exception.
[Issue #731](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/731) owns this
documentation prerequisite and proves no runtime delivery or actual grant.
After ordered Standards then Spec PASS with zero findings, coordinating root
[approved the bounded v0.2 contract on 2026-10-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/731#issuecomment-6284035912).
This is agent product disposition. No personal Dan review or new access approval
is required by the [2026-10-20 instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237).

## 2. Problem

A complaint can remain in a message or personal memory. Staff need to preserve
what was received and what was actually recorded afterwards without suggesting
that a response was sent, a legal deadline met or the complaint resolved.

## 3. Outcomes and measurable value

An explicitly authorized Company recorder registers a complaint against a readable
Client, accepts responsibility themself and reopens its original intake/history.
They can append a factual action or response record. The original and all explicit
corrections remain attributable. Measures for acceptance: exactly one entry per
unchanged retry, complete history after reload, zero tested hidden metadata and
no false external-send/final-resolution status. No invented SLA or business KPI.

## 4. Solution and principles

Provide an ordinary complaints register separate from Task or assurance records.
Company-owned intake and factual journal entries are preserved in PostgreSQL.
Responsibility is explicit but initially self-only. Described facts are not
permission grants, external communications, approval, effectiveness verification
or certification decisions. Unknown information stays unknown; no severity scale
or legal response term is invented.

## 5. Actors, Company and Client scope

A Complaint belongs to exactly one Workspace and one Company, established by the
server's active authorized Company context. It identifies one existing same-
Workspace readable Client with the owning Company's active relationship. An
optional Project must belong to that Client and Company and be currently readable.
No All Companies creation/view, public portal, anonymous external submitter or
cross-Company transfer is included.

Reader and Recorder are independent explicit Company capabilities,
approved as a separated Company-level boundary by Dan; [decision provenance](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507).
No real assignment is made. The recording member explicitly chooses themself as
responsible; no new member directory, delegated assignment, notification or grant
results. A person's job title, Workspace ownership, Project/Task/Document access
or their name in complaint content alone confers no complaint visibility.

## 6. Numbered user stories

1. As a permitted Recorder, I preserve a received ordinary complaint in my Company.
2. As that Recorder, I explicitly select myself as responsible without granting rights.
3. As a Reader, I reopen the exact original intake and attributed chronological history.
4. As a Recorder, I append what was done without claiming a completed investigation.
5. As a Recorder, I record response text/date without claiming actual sending or receipt.
6. As a Recorder, I correct permitted intake facts explicitly while preserving prior values.
7. As a user, I recover uncertainty/staleness without duplicate or hidden lost records.
8. As a member losing Company/Client/Project authority, I stop seeing stale complaint data.
9. As a Reader, I see a superseded original Client only through retained owner-authorized history.
10. As a Recorder, I may link a currently readable completed Project without changing its lifecycle.
11. As an administrator, I assign or revoke Reader and Recorder independently without expanding old grants.
12. As a user, I see no confidential complaint through generic Activity, Home, counts or search.
13. As a keyboard/mobile user, I complete the journey in the chosen interface locale.

## 7. Scope and exclusions

In scope: ordinary service complaint intake, Company-scoped list/detail/history,
self-responsibility, explicit bounded factual correction, action/response journal,
safe retries, authority loss and opt-in grant administration under the approved separation.

Excluded: final resolved/closed status, serious/repeated thresholds, cause matching,
corrective-action effectiveness, assurance NC/complaint/appeal handling, impartial
case assignment, legal deadline determination, outgoing messages, receipt proof,
reminders/escalation, attachments, public filing, export/import, risk scoring and
management reports. These source-supported later needs remain deferred; this
first slice must never be credited as the full complaints/improvement module.

## 8. Concepts and minimal sourced fields

**Complaint** means a Company-owned ordinary service complaint whose original
intake and factual follow-up remain attributable. **Complaint Journal Entry**
means one immutable factual action, response or motivated correction within that
Complaint. These terms are defined locally for this prerequisite; the small
CONTEXT glossary addition travels with the later sensitive implementation, without
duplicating this behavior or creating a missing glossary dependency.

Session 43 item 226 supplies the factual field categories below. The input lengths,
optional Project, unknown severity/deadline and self-only responsibility are
explicit reversible agent synthesis for this bounded journey, not additional
Iurie answers, a severity policy or legal response thresholds.

| Field                | Bounded representation                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Complaint date       | Declared calendar date or explicit unknown; separate from server recording time                            |
| Complainant          | Nonblank plain text, at most 300 characters; not a new authenticated account                               |
| Subject              | Nonblank plain text, at most 5,000 characters                                                              |
| Client               | Existing authorized Client/active owning-Company relationship                                              |
| Project              | Optional existing readable Project for that Client and Company                                             |
| Severity description | Optional plain text at most 1,000; missing explicitly unknown, no score/category                           |
| Responsible          | Recording active membership, explicitly self-selected at creation                                          |
| Response due date    | Optional declared calendar date; missing explicitly unknown                                                |
| Action entry         | Nonblank factual plain text at most 5,000 plus optional declared action date                               |
| Response entry       | Nonblank factual response plain text at most 5,000 plus declared response date or unknown                  |
| Correction/reason    | Nonblank plain text at most 5,000 for corrected journal text and at most 1,000 for every correction reason |
| Attribution          | Server actor/recorded time, stable scoped identity and revision                                            |

Complaint identity, ownership, Client/Project association and original responsible
member are immutable in v1. No email/phone/personnel attachment is required. User-
entered factual dates and names remain declarations; they are not verified evidence.
Calendar date validation does not imply a legal SLA or backdated system approval.

## 9. Lifecycle, correction and history

Creation preserves intake revision 1 and the self-responsibility fact. A recorder
may append action or response entries. Each has server actor/time and stable
mutation identity; declared action/response dates are separate and can remain
unknown. A recorded response is not sent, delivered, accepted, effective or final.

Permitted intake correction appends a complete successor revision of complaint
date, complainant, subject, severity description and declared due date, with a
nonblank reason and exact expected current revision. Original values and every
intermediate revision stay readable. Company, original Client, optional Project and responsible
member never change in this bounded correction. A wrong association is not
silently reparented; any later move needs its own governed contract.

A saved action/response is not edited. A factual correction references one
original action/response entry in this same Complaint, states the correction and
a required reason, with new server actor/time. It carries the complete corrected
factual text and declared action/response date or explicit unknown. Corrections target an original
entry, not a correction-of-correction tree; later corrections still refer to that
original and retain all earlier statements/reasons. The original is visibly
marked corrected and every correction remains displayed in recording order.
A correction erases no declaration and proves no actual sending.
No automatic financial/date/status result is derived from journal text.

Concurrent correction/append commands name the expected aggregate revision;
stale input requires explicit reload/review, never a hidden replay over new facts.
No archive, delete, purge, final closure or case-reopening command exists.
“Reopen” in the acceptance journey means read a saved record again. “Received”
and “response recorded” describe recorded facts, not a case-resolution lifecycle.
An intake correction that leaves all normalized facts unchanged is a no-op and
creates no successor revision, event or Client fence advance. A distinct journal
entry remains a new attributed declaration even if its text matches an earlier
entry; only an exact replay reuses the original result.

Mutation keys are scoped to the actor and responsible Company. Reusing a key
with changed normalized payload, target, operation or expected revision conflicts;
it never executes the changed intent or returns an unrelated receipt. A committed
receipt preserves that operation's historical result, even after later revisions.
No failed transaction reserves a success receipt. The UI retains the unchanged
payload and key after an uncertain save, and uses a fresh key for changed intent.

### Existing Client/Project boundaries and operational-use fence

Client owns resolution of the immutable original Client, its active Company
relationship and any readable canonical dossier after governed union/reversal.
No Complaint reparenting or identity matching is introduced. Follow the existing
operational-reference read semantics: a superseded original may remain readable
through that owner, but is read-only for new Complaint mutations. The original
Client and relationship must be active for every new material write.

Every first committed intake, intake correction or journal append/correction
advances the original Client's existing operational-use/reversal fence once,
atomically with the Complaint revision/history, receipt and restricted event.
Denied, invalid, stale, failed, normalized no-op and exact-replayed commands advance nothing.
Use Client's identity-before-relationship lock order and revalidate related reads
inside the transaction. No private permission copy or direct identity substitution.
Resolve an exact committed receipt after current Reader/Recorder and related-read
revalidation under transaction locks and matching its fingerprint, before new-write active-original and
expected-revision checks. Thus a now-superseded but still-readable original may
return its prior committed receipt without a new write/event/fence; lost current
authority still denies replay. This preserves the existing operational-owner
receipt ordering rather than treating a historical retry as a new mutation.

Optional Project association requires current Project read through its owner,
including the current Client prerequisites. It requires no Project mutation or
Task grant. A closed/completed but currently readable Project may be associated;
recording a complaint never edits or reopens that Project. If an associated
Project becomes unreadable, hide the Complaint rather than leaking its title or
association; current read prerequisites filter before rows/counts/pagination.

## 10. Invariants and prohibited outcomes

1. Every record/revision/entry is constrained to one Workspace/Company.
2. Client/Project associations are authorized before creation/read/count exposure.
3. Recording grants no authority to the responsible member or a named complainant.
4. Original intake, corrections, response and action history cannot be overwritten/deleted.
5. Unknown severity/deadline does not become a guessed classification/legal term.
6. A response entry never triggers mail, final resolution, NC closure or certification.
7. One committed business operation has one attributable event; failure is atomic.
8. Transport replay is idempotent; changed intent cannot reuse a prior command silently.
9. Ordinary Project/Task/Document/Activity read alone leaks no complaint metadata.
10. Session, Company and grant changes retire stale results and late responses.
11. Revocation or suspension that commits before protected command authorization denies the write or replay; a later check uses current authority, not a cached actor snapshot.

## 11. Permission matrix

[Authorization section8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns exact independent Complaints Reader/Recorder v1 grants and administration.
Dan approved access separation, not closure, sending, a staff directory or an
expanded old bundle. This bounded capability consumes the following prerequisites:

| Operation                      | Current authority required in the same active Company                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| List/detail/history            | Reader, active membership/Company context and current Client/relationship/optional Project reads for each record   |
| Intake                         | All applicable read prerequisites plus Recorder; original Client/relationship active; explicit self-responsibility |
| New correction/action/response | Same read+Recorder/current active-original prerequisites; expected aggregate revision                              |

Recorder never includes read or context; responsibility is not authority. Owner,
Project/Task/Document/general Activity rights or authorship alone confer no read.
A lost prerequisite retires content/history and stale replies; persisted evidence
remains intact. Real named assignments are later explicit configuration.

## 12. Documents, evidence and Activity

No Document bytes, attachment, signature, transmission evidence, licensed source
or legal-retention rule is created/admitted. A user declaration remains a factual
application entry; the Document owner retains future attachment/evidence policy.

The [Activity owner section7](activity-log-accountability-prd.md#7-authorization-and-privacy)
defines exact internal recorded events and sanitized metadata, atomic with the
material write, history/revision, receipt and Client fence. New family storage is
restricted separately from the generic Activity envelope/projection. Existing
Activity/Home/search counts never disclose it, even to administrators or existing
Activity readers. Complaint's own history requires every current read prerequisite.
No new Activity read, staff-directory, upload or final-resolution grant exists.

## 13. Configuration, localization and accessibility

Reuse the UX owner and accepted [Prisme source](../../apps/web/src/production-shell/prisme/README.md).
Use coherent violet/yellow presentation, deliberate primary/secondary actions,
custom styled accessible controls/buttons and progressive intake/detail/history.
No raw browser checkbox/select appearance or plain unstyled action buttons.
Preserve native semantic labels/buttons/input behavior under presentation.

Four locales translate interface/validation/dates while complaint text remains
unchanged. Explicit unknown values are visible. The displayed Company, chosen
Client and optional Project are never ambiguous. Desktop 1440 px/narrow 390 px, keyboard,
visible focus, error association, long complaint text and open controls receive
real screenshot review; Classic is compatibility coverage, not primary evidence.
No configurable severity scale or legal countdown is introduced.

## 14. Source of truth, integrations and failure

NestJS/PostgreSQL own intake, history, authorization and committed revisions.
Existing Clerk identity is consumed through the neutral actor boundary. There is
no email/AI/Google/Calendar adapter, attachment upload or external provider call.
A declared response date cannot be a successful provider-send result. Optional
provider outage cannot remove or mutate this capability's committed facts.

## 15. Migration and compatibility

Use a reviewed additive Drizzle migration for scoped identities, immutable intake
versions and journal relations/constraints. Do not migrate role assignments,
create real complaints or reuse personnel/Client Contact identity by matching a
name. Existing Client/Project and permission versions remain compatible and
unchanged. No spreadsheet/history import or assurance-case conversion is included.
Implementation reviews deployment/corrective-forward recovery before publication;
no schema push or production data is permitted.

## 16. Security, privacy, reliability and performance

Use Platform/Authorization owners, with complaint text treated as confidential
and untrusted. Render plain text safely; no automatic link/script execution.
No body or sensitive terms in URLs, logs, telemetry or generic Activity metadata.
Synthetic fixtures only. No new secret, paid API, model processing or staff dump.

Company lists and per-record history use bounded 25-row pages and deterministic
server-recorded ordering with identity tie-break. Authorized count/rows share one
consistent read snapshot. Current Client/Project rights filter before counts, rows, pagination or
metadata. Existing Client/Project owners keep canonical identity/read semantics. No unbounded full-register fetch, cross-Company search or guessed SLA.
Measure query behavior on fixtures; existing recovery obligations include records.
A preserved complaint is not a claim of legal/compliance-ready indefinite retention.

## 17. States, exceptions and recovery

Specify loading, empty, ready, validation, unknown fields, permission denial,
session expiry, retryable read failure, uncertain save, stale correction and
read-only history. A successful mutation remains confirmed if refresh later fails.
Keep exact payload/key for an unchanged uncertain retry; changed input is a new
intent. Reload before replacing a stale current intake; do not discard draft work
without an explicit recovery action.

Context/session/membership/grant change clears scoped data and suppresses late
responses. Section navigation alone preserves unsaved work while authority is
unchanged. Denial never reveals record existence, complainant or hidden count.
A lost Client/Project association read is unavailable history, not a deleted record.
No UI state says resolved, closed, sent or effective from a factual journal entry.

## 18. Durable implementation decisions

Keep React/Vite/TypeScript, NestJS, PostgreSQL/Drizzle, neutral Clerk and ADR 0006.
The module exposes record/read/correct/append operations; transaction/persistence
is private. Endpoint spelling, indexes and component factoring are agent work;
exact permission contents remain owned by Authorization section 8. No universal complaints workflow engine, generic
staff assignment platform or speculative dependency is needed.

## 19. Testing decisions

Start RED through public REST on disposable PostgreSQL: record intake, append an
action/response, correct a permitted fact and reload original plus all history.
Then prove one event/record per unchanged replay, stale revision refusal, wrong
Workspace/Company/Client/Project denial, closed-readable Project compatibility,
superseded-original read-only history, Client fence atomicity, absent grants,
revoked prerequisites and no body/metadata from Project-only readers or generic
Activity/Home/count/search surfaces, including administrator requests. Deterministically
hold revocation/suspension and Client union/reversal locks to prove both orderings
through public commands; assert rollback leaves no partial record, history,
receipt, event or fence. Prove exact historical receipt replay after later
revisions and a readable superseded original, changed-key-intent conflict before
stale checks, new-write refusal for that original, and denial of replay after
Reader, Recorder or related-read loss. No-op intake corrections advance nothing.

Real registered App/PG browser acceptance at 1440 px/390 px proves intake→reload→history,
explicit self-responsibility, action/response recording and correction with visible
original. Add focused fixture UI tests for difficult uncertain/error/locale states,
accurately labeled as intercepted rather than real provider proof. Matching doctor,
statics/types and sensitive stronger verification follow issue-execution only in
the later assigned author session. These are acceptance requirements for later
implementation; this prerequisite claims no runtime test or screenshot.

## 20. Acceptance journey and testable criteria

Synthetic Company A member holds explicit Reader/Recorder and existing Client/
Project reads. They record “Questionnaire instructions were unclear” for a
synthetic Client, select themself responsible, leave severity and due date unknown,
and reopen the exact saved record. They append an action “Reviewed instructions”
and a response text “Clarification prepared,” with date unknown. No message is sent.
They append an explicit subject correction with a reason; original and successor
remain visible. A later journal correction points to its original entry visibly.

Acceptance requires that useful public journey after reload, truthful unknown/
recorded date distinctions, preserved attribution, current history, safe conflict/
retry behavior, independent permission/refusal tests and inspected accessible
Prisme desktop/narrow UI. Same-Workspace other Company, second Workspace,
Project-only reader and revoked Client/Project grant reveal no record metadata.
No automatic status says resolved/sent or claims an investigation was effective.
The example is synthetic verification, not an actual complaint or Iurie acceptance.

## 21. Business evidence and approved access-separation provenance

- [Session43/comment5307431470, item 226](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5307431470)
  explicitly confirms separate complaints register, Client/Project linkage, date,
  complainant, subject, severity, responsible, response term, actions/response and
  final status. This bounded contract preserves but defers the final-resolution portion.
- Items227–230 confirm wanted reminders/escalation, serious/repeated cause/
  corrective action/effectiveness and periodic analysis; none is silently included.
- [Coverage S06-Q40](iurie-business-answer-coverage.md)
  distinguishes answered complaint handling from unanswered appeals/contestations.
- Decision record34.4 permits bounded reversible synthesis without repeating the
  full compound question. A declared severity is not a validated severity scheme.

Dan answered “Oui, cela me convient” to choosing who consults Ideas/complaints,
who adds them and who defers/rejects an Idea, per Company; named people come later.
[Durable decision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507). This approves the separated access
boundary, no automatic permission expansion and no real-person assignment. It does
not approve complaint closure, transmission, impartial review, automatic escalation,
legal deadlines, staff-directory access or any new authority inferred from a title.
The explicit access yes is the source. [Dan's 2026-10-20 instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237)
removes routine human PRD review: agents perform Standards then Spec preparation
and root owns the final product-review disposition and canonical publication.
[Independent preparation authorization](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283696600)
supersedes the former global serial frontier while preserving one issue per
author and dependency-aware publication. Neither statement invents Dan's personal
review of this diff, runtime delivery, real assignments or broader business rights.

The [actual 2026-10-20 coordinating product disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/731#issuecomment-6284035912)
approves the frozen bounded v0.2 contract after ordered Standards and Spec PASS,
with zero findings. This is agent approval under the delegation above, not Dan's
personal review. Section 23 records the separately authorized local preparation
and implementation exception while canonical publication remains pending.

The complete source comment is unchanged at normalization: UTF-8 body SHA256
`f29be72ac661c7b1919f5f83a44f2f1e75c8ec40586fe44abea4e7bed9945af0`.
Source-confirmed wants, approved access and reversible bounded product synthesis
remain distinct; source-supported later effects retain their deferred status.

No further Iurie questionnaire is needed for this factual first slice. Final
resolution, impartial handling, serious/repeated thresholds and legal response
policy remain excluded effects, not claimed outcomes.

## 22. Technical research and ADR dependencies

Agents inspect current Client/Project read, Company assignments, scoped history,
Activity nonprojection and safe-retry seams, then normalize exact field limits,
validation and reviewed migration constraints. No broader staff directory is
necessary: responsibility is explicit self-only. No external account, taxpayer,
Scheme, corpus, retention schedule or provider key is required for synthetic proof.
Existing ADR 0006 suffices unless actual design exposes a new costly decision;
that determination belongs to implementation research, not a human questionnaire.

## 23. Readiness and explicit blockers

Access separation is settled; no fresh access question or questionnaire is needed.
The ordered Standards and Spec reviews passed with zero findings; root's
[recorded product disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/731#issuecomment-6284035912)
approves bounded v0.2. A separate one-issue runtime author may prepare and implement
locally against that frozen Approved contract under the owner's explicit partial-
work instruction, after refreshing current public seams, ownership/duplicate-work
checks, slice fit and required check support. Canonical capability, Authorization
and Activity normalization must reach main before runtime publication or merge.
This exception grants no additional business authority, actual assignment or
runtime delivery credit. This prerequisite creates no runtime issue; actual named
assignments and runtime delivery require separate evidence.

One complete bounded tracer covers original intake, self-responsibility, factual
action/response history, motivated append-only corrections and the two opt-in
grants. Current mechanisms fit without a new role/workflow engine, but original-
Client fence and related reads make this medium-large rather than a cosmetic form.
Re-scope only on concrete excess volume; do not silently drop the authorized
history/correction outcome or split merely to duplicate sensitive CI. No whole
complaints/assurance/Sarcina module or historical MVP point is credited here.
