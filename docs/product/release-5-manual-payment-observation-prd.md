# PRD — Bounded manual incoming Payment observations

**Status:** Approved — bounded software contract after ordered independent Standards then Spec preparation and [actual root disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1032#issuecomment-6561911019), 2026-11-01. No runtime readiness or delivery is claimed.\
**Version:** 1.0\
**Owner:** Dan Popescu\
**Capability owner:** Finance, consuming native Access, Client, Document and Accountability owners.\
**Parent:** [Product Vision #51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51)

## 1. Authority, software selections and completion boundary

This is the single owner of the complete **preserve exact confidential
payment evidence → record a manual incoming observation → correct/review/confirm →
withdraw or reverse a mistake → reopen exact history and source** outcome.
[Product Vision §9.4](product-vision-prd.md#94-finance) and
[financial architecture §12 / DEC-061–075](consolidated-product-decision-record.md#12-financial-architecture)
retain the separation between externally issued invoices, expected schedules,
observed Payments and explicit allocations. The
[financial discovery register §24](consolidated-product-decision-record.md#24-internal-discovery-register-for-finance)
still gates fiscal, accounting, bank and automated-payment integrations.

[Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Shared Client](release-1-shared-client-prd.md),
[Governed Documents](governed-documents-prd.md),
[Registry §§21–24](release-1-document-registry-prd.md#21-approved-provisional-official-document-versions-400),
[Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy),
[UX](ux-localization-configuration-prd.md),
[Platform](platform-security-reliability-operations-prd.md),
[AI Governance](ai-knowledge-governance-prd.md),
[CONTEXT](../../CONTEXT.md),
[ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md) and
[ADR 0008](../adr/0008-bounded-document-content-storage.md) retain their general
rules. This owner specializes only this capability's consequences and exceptions.
The [external Invoice Record contract](release-5-external-invoice-record-prd.md)
retains its own source, grammar, history and captured v1 meanings; none expands.

| Classification                          | Meaning here                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reused approved direction               | Separate observed Payment and independent confirmation; one responsible Company; exact currency/precision; immutable confirmed history; traceable reversal/adjustment; manual before automation.                                   |
| Bounded software selections under #1032 | Incoming known-Client payer, distinct evidence family, five unassigned captures, copied-read policy, closed grammar, DRAFT/CONFIRMED/REVERSED/WITHDRAWN, non-autoconfirmation, explicit replacement and private bounded discovery. |
| Operational facts not supplied          | Real people and grants, sufficient confirmation/reversal evidence, actual separation-of-duty practice, methods/currencies used, source handling/redaction/retention and bank/accountant/legal meaning.                             |

The recorded root disposition approves this bounded software contract. It is not
personal Dan/Iurie/accountant approval, an actual assignment, real tenant policy or
operational activation. It cannot establish that a transfer settled, that a PDF
is authentic, that its payer had a mandate, or that two observations represent
distinct external cash movements. No whole Release 5 or SARCINA completion follows.

## 2. Problem, outcome and measurable value

An authorized user needs to retain what they observed, which exact evidence they
used, who reviewed it and how a mistake was corrected. An invoice's existence,
a due date or an uploaded PDF alone cannot truthfully mean money was received.
Overwriting a confirmed amount would also erase the history needed to understand
an error.

The complete outcome preserves a bounded private PDF, deliberately captures a
manual incoming declaration, reopens literal facts and exact source, corrects a
draft, obtains explicit separately permissioned review and retains any withdrawal,
reversal and linked replacement. Value is demonstrated by the complete synthetic
public journey, byte-identical historical content after restart, reconstructible
attribution and absence of unauthorized tested disclosure. No financial total,
adoption percentage, settlement metric or live-provider result is inferred.

## 3. Workspace, payer scope and user stories

Access establishes one authenticated active Internal User, Workspace membership
and responsible receiving Company. An All Companies view is not an ownership
value. The payer is one original native Client Account and its exact recorded
PRIMARY or ADDITIONAL Client Legal Entity discriminator. The Company receives;
a display name never establishes ownership or identity. Third-party/unknown payers,
suppliers, outbound payments and external refunds are outside this first scope.

1. As a source preparer, I choose a labeled native Client and exact payer, so that
   the evidence cannot silently attach to a similarly named entity.
2. As a registrar, I preserve the source declaration and an unknown receipt date
   without inventing chronology, money or a Payment.
3. As an uploader, I conserve a clean bounded PDF, correct a draft through a new
   upload and reopen exact older uploads and formal Versions.
4. As a Document approver, I deliberately designate clean stored content, so that
   a frozen source is distinct from confirmation of an observed Payment.
5. As a Payment Recorder, I select one exact eligible source and deliberately
   enter amount, currency, declared effective date, method, reference and basis.
6. As a Payment Reader, I reopen copied facts and immutable history under my own
   opt-in without acquiring live Client, Document or content rights.
7. As a recorder, I materially correct a DRAFT transcription with a reason while
   preserving every previous value and the fixed source/payer.
8. As a recorder, I withdraw a mistaken DRAFT without deleting it or claiming a
   bank refund or reversal of a transfer that was never confirmed here.
9. As a separate permitted confirmer, I review the exact displayed DRAFT revision
   and explicitly record confirmation without gaining Recorder/source-write rights.
10. As a draft author, I cannot confirm that same observation through another
    membership, session or label, even if I also hold the Confirmer capture.
11. As a reverser, I motivate reversal of a confirmed observation without changing
    its values, original source or historical confirmation.
12. As a recorder, I create one explicitly linked corrected replacement for a
    terminal observation and can reopen both roots and their histories.
13. As a reader, I distinguish frozen payer copies from independently unavailable
    live Client/evidence projections and deliberately download only permitted bytes.
14. As a recorder, I can declare separate observations supported by the same PDF
    or external reference without the software asserting external uniqueness.
15. As an administrator, I explicitly grant/revoke the five captured opt-ins and
    receive no hidden financial content merely by administering assignments.
16. As a user, I retry an uncertain command with its identical body/key, and retry
    only the read after a confirmed save whose refresh failed.
17. As a user changing locale/frame, I preserve literal transient input and exact
    attempts; identity/scope/relevant-authority replacement retires old work.
18. As an ordinary Company/Project/Contract/Knowledge/Activity reader, I learn no
    financial existence, title, amount, source or hidden count from those grants.

A Payment requires no Invoice Record, Contract, Project or Payment Schedule.
Delivered Invoice Records and selected R2C work are sequencing/current-source-fit
context, not artificial business prerequisites. No payment execution, allocation,
paid/partially-paid flag, collection/outstanding/unallocated/overdue balance, tax,
FX, schedule, reminder, import/export, bank/accounting/provider/AI integration or
real activation belongs here. Show that **allocation is not tracked by this
capability**; do not substitute a zero balance or available-to-allocate amount.

## 4. Exact confidential evidence and registration grammar

Add only the immutable `payment-evidence` Document family, fixed to
`company-confidential`. Neither external-invoice, received-contract, questionnaire,
mission-deliverable nor an ordinary Project attachment qualifies by relabeling.
No URL or pasted bank transaction substitutes for the preserved PDF.

Source registration uses the existing actor/Workspace Document command-key
protocol with this closed branch:

| Input               | Meaning                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | Exactly `payment-evidence`; confidentiality is server fixed.                                                                                                        |
| `clientId`          | Native UUID for the exact original readable Client with an active Company relationship/new-use eligibility.                                                         |
| `payer`             | Exactly `{kind: PRIMARY}` or `{kind: ADDITIONAL, legalEntityId}`; ADDITIONAL uses a native UUID belonging to that original Client. No invented PRIMARY entity UUID. |
| `title`, `purpose`  | Native trimmed nonempty Document metadata, at most 200/2000 UTF-16 code units; inner whitespace preserved.                                                          |
| `sourceDescription` | Required trimmed nonempty plain text, at most 2000 UTF-16 code units, recording an unverified human-declared source.                                                |
| `receivedOn`        | Required null or real Gregorian `YYYY-MM-DD`, years 0001–9999; null means not recorded.                                                                             |

Reject unknown/missing fields, invalid dates/Unicode/NUL, mismatched/foreign
Client/entity/context and unsupported families. The server derives Workspace,
Company, exact original Client/party, immutable legal name/tax identifier/address
copy including nulls, Company label, registering membership/Internal User and
server instant. Client input is selection, never authority or a supplied party
snapshot. Preserve native supported Client-read alternatives, including
Workspace `client.manage` where that owner permits it. No party inference,
Company default, filename date or tax/mandate validation is added.

Registration creates one Document and Version 1 empty draft, its immutable
source/payer/date/registration context, receipt, native registration event and
original-Client operational-use fence atomically. It creates no Payment, amount,
external reference or PDF. The fingerprint contains all validated input and
Company/family/party selection; changed input under the same key conflicts.

Relation/family/source/date/attribution stay fixed across all Versions. Native
draft title/purpose correction is allowed under its observed-revision/history
rules; no retargeting, source/date edit, erase or purge command is added. A wrong
payer/source association needs a distinct Document. Later Client corrections,
additional-entity changes, union or source succession never rewrite the original.
Native historical original-Client read remains available where that owner permits;
new mutations never follow a union to a different canonical Client.

## 5. Stored PDF, formal Versions and source identity

Reuse ADR 0008 and native Registry storage: actual at-most-5-MiB stream, quarantine,
configured fail-closed malware scanning with recorded scanner attribution, pinned
structural parsing/encryption refusal, immutable private bytes and deliberate exact
attachment downloads. No storage/scanner provider, URL, inline preview, OCR,
bank parser or signature validator is introduced. A clean synthetic scanner fixture
is software proof, not real production-provider or source-authenticity approval.

Scan outside the transaction, then revalidate all consumed live authority, original
Client/new-use eligibility, exact Document revision and Version state before
commit. Missing configuration, outage, infection, malformed/unsupported result,
invalid/encrypted PDF, wrong type or actual excess bytes commits no content,
receipt, success event or Client fence. No provider I/O holds a database transaction.

Draft correction appends immutable uploads; byte-identical inputs still have
distinct Document/Version/Representation identities. The current successful draft
upload never changes through replay of an older one. Native upload history remains
completely reachable through its existing protected 20-entry pages. Formal Version
states are `draft → official → superseded`, at most 50 Versions, with at most one
draft and one official. Empty designation refuses at both application and native
integrity boundaries. Designation freezes the current clean PDF and title/purpose
and supersedes the previous official Version atomically. Official/superseded
Versions accept no overwrite or appended upload. A successor starts empty and
copies no PDF or external reference; all earlier uploads/Versions remain exact.

Here `official` means native frozen Document content. It implies no financial
confirmation, authenticity, bank settlement, legal receipt or approval for Knowledge.
The Payment selector accepts only the exact current clean Representation of an
official or deliberately superseded Version, never a draft/empty source, guessed
latest source or a hash-equivalent identity. A Payment conserves its selected tuple
and original size/hash; later upload, succession or Client change cannot retarget it.

One evidence PDF may support several declared observations. Neither checksum,
filename, external reference nor date/amount combination is an external-payment
uniqueness key. An explicit human single-observation acknowledgement is required;
confirmation is not automatic duplicate adjudication. Future allocation/reporting
needs its own eligibility contract and cannot silently treat these rows as verified
distinct cash flows. Use a minimal fictional notice for demonstration, never an
unrestricted real bank statement or credential-bearing document. Actual evidence
sufficiency/redaction/retention remains a real-operation dependency.

## 6. Captured assignments and independent operation matrix

Add exactly these new Company-scoped, captured `v1`, initially unassigned bundles.
Codes are this capability's bounded stable interfaces, not existing grants:

| Bundle / code                                                       | Exact captured v1 permissions      | Meaning                                                                               |
| ------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Company Payment Reader / `company_payment_reader`                   | `payment.read`                     | This capability's copied current/history and financial evidence-read prerequisite.    |
| Company Payment Recorder / `company_payment_recorder`               | `payment.read`, `payment.record`   | Reader plus evidence preparation and CREATE/CORRECT_DRAFT/WITHDRAW_DRAFT/replacement. |
| Company Payment Confirmer / `company_payment_confirmer`             | `payment.read`, `payment.confirm`  | Exact eligible DRAFT confirmation under the independent-author rule.                  |
| Company Payment Reverser / `company_payment_reverser`               | `payment.read`, `payment.reverse`  | Exact CONFIRMED observation reversal.                                                 |
| Company Payment Evidence Access / `company_payment_evidence_access` | `document.payment_evidence.access` | Additional native family gate only, granting no Payment or ordinary native authority. |

Existing `company.assignment.manage` explicitly grants/revokes captured v1 for an
active same-Workspace membership and active Company, using the native assignment
lifecycle. Owner/title/membership, bare permission strings, `finance.read/manage`,
Invoice Reader/Recorder v1 and External Invoice Access confer none of these new
rights. No old capture, repeated grant, migration, bootstrap or mutable bundle
constant expands. Missing, null, unknown, malformed, duplicate required or
revoked/replaced captures fail closed. The gate grants no Company context, Client,
Document/content/mutation, approval or administration permission.

Every row also needs verified identity and current active Internal User,
Workspace/membership/Company with exact supported captures and same-scope target:

| Operation                                                             | Payment prerequisite                                             | Independent source/native requirements                                                                                                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copied Payment inventory/detail/history                               | Reader, Recorder, Confirmer or Reverser carrying `payment.read`. | No live Client, Document, family or content prerequisite.                                                                                                                                                         |
| Evidence metadata/Versions/native history/live Document link          | Any supported `payment.read` capture.                            | Evidence Access plus native Document metadata/Version and original-Client/Company read.                                                                                                                           |
| Evidence bytes/protected Representation/name/size/hash/upload history | Any supported `payment.read` capture.                            | Preceding metadata boundary plus native Content Reader for the exact tuple.                                                                                                                                       |
| Register evidence                                                     | Recorder.                                                        | Evidence Access, native Document registration/read and exact original Client/party read/new-use eligibility.                                                                                                      |
| Upload evidence                                                       | Recorder.                                                        | Evidence Access, metadata/Client read, Content Reader + Uploader, native Version management and applicable Client/new-use/revision; post-scan revalidation.                                                       |
| Designate evidence official                                           | Recorder.                                                        | Evidence Access, native Approver `document.version.designate_official`, metadata/Representation read, clean stored draft and applicable original-Client/new-use/revision. No Content Reader or Uploader is added. |
| Empty evidence successor                                              | Recorder.                                                        | Evidence Access, native Version management, metadata/Representation read, revision and applicable original-Client/new-use eligibility; no content copied.                                                         |
| Correct evidence title/purpose                                        | Recorder.                                                        | Evidence Access, native `document.correct`, Document/Client read, draft/revision and applicable original-Client/new-use eligibility.                                                                              |
| CREATE / CORRECT_DRAFT                                                | Recorder.                                                        | Evidence Access, exact eligible source/Version/content and original-Client read; fresh use also qualifies current active original Client–Company eligibility.                                                     |
| CONFIRM                                                               | Confirmer.                                                       | Evidence Access, exact eligible source/Version/content and original-Client read, applicable fresh new-use eligibility and §8 independent-author rule. **Recorder / `payment.record` is not required.**            |
| WITHDRAW_DRAFT                                                        | Recorder.                                                        | No live evidence-family, Document, content or Client prerequisite.                                                                                                                                                |
| REVERSE                                                               | Reverser.                                                        | No live evidence-family, Document, content or Client prerequisite; no Recorder or source-write grant.                                                                                                             |
| Administer the five captures                                          | Existing current assignment administrator.                       | No source/Payment content is revealed by administration.                                                                                                                                                          |

The native owner remains authoritative for each operation's supported Client-read,
Representation, revision and historical/new-use rules. Do not apply a blanket new-use
condition to evidence/copied reads, withdrawal or reversal. Source Recorder rights
must never leak into CONFIRM or read authorization. Designation without Content
Reader remains possible for an otherwise authorized Approver; protected PDF details
and bytes remain independently withheld.

**Selected copied-read policy:** a Payment read opt-in explicitly
discloses recorded receiving-Company/payer copies, literal values, reasons, review
attribution and lineage even after Client/evidence/family/content read is lost.
It grants no live corrected party data or raw internal source/context row.
A currently permitted native metadata projection may reveal an exact Document/
Version link; protected Representation/filename/size/hash needs content authority.
Live Client and source links are independently optional. Otherwise return a closed
unavailable branch with no protected identifier or guessed reason. Never serialize
an internal context, command intent or receipt wholesale as permissive detail.

## 7. Literal values and closed command grammar

Every `values` object has exactly these required keys:

| Field               | Literal submitted meaning                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amountMinor`       | Canonical positive integer string `[1-9][0-9]{0,13}`; at most 14 minor-unit digits.                                                                  |
| `currency`          | Exactly `MDL`, `EUR`, `RON` or `USD`, all with two minor digits; first software support set, not actual Company usage or default.                    |
| `effectiveOn`       | Real Gregorian `YYYY-MM-DD`, years 0001–9999; human-declared effective date, without UTC-midnight conversion, clock default or settlement inference. |
| `method`            | Literal nonblank 1–120 UTF-16 code units; no invented verified bank/provider enum.                                                                   |
| `externalReference` | Explicit null or literal nonblank 1–200; no external/global uniqueness claim.                                                                        |
| `observationBasis`  | Literal nonblank 1–2000 describing what was observed; not an account-number/credential field or automatic parser.                                    |

Preserve submitted case, whitespace and valid Unicode without trim/normalization,
translation or truncation. Refuse blank-only, invalid Unicode, NUL and C0/C1
controls. Reasons and confirmation notes use the same literal nonblank 1–2000
UTF-16 grammar. Date values may be future declarations; do not turn them into a
schedule or reject them through an undocumented settlement rule. Money never
uses binary floating point, numeric/exponent/signed input, rounding, FX, tax or
implicit currency. Decimal UI entry maps exactly to minor strings and refuses
excess fractional digits. A locale switch preserves both the entered semantic
value and an invalid literal draft rather than silently reinterpreting it.

Closed commands are:

| Command        | Exact input object                                                                                                                                                                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE         | `{source, values, acknowledgeObservedDeclaration, replacesClosedPaymentId}`. Source is exactly `{documentId, documentVersionId, representationId}` with native UUIDs; acknowledgement is exactly true; predecessor is explicitly null or a readable same-Company terminal Payment UUID. |
| CORRECT_DRAFT  | `{action: CORRECT_DRAFT, expectedRevision, values, reason}`. Full values must materially change; source/payer/lineage do not.                                                                                                                                                           |
| WITHDRAW_DRAFT | `{action: WITHDRAW_DRAFT, expectedRevision, reason}`.                                                                                                                                                                                                                                   |
| CONFIRM        | `{action: CONFIRM, expectedRevision, acknowledgeReviewedObservation, confirmationNote}` with acknowledgement exactly true.                                                                                                                                                              |
| REVERSE        | `{action: REVERSE, expectedRevision, reason}`.                                                                                                                                                                                                                                          |

Every nested object is closed; reject missing/extra fields and unknown actions or
formats. Expected revision is an integer 1–2147483647 with checked advance; refuse
exhaustion without effects. Membership/actor/time/context and Payment identifiers
are server-established or path selection, never arbitrary authority from a body.
A user deliberately selects labeled eligible evidence; no UUID-paste workflow.

## 8. State machine, non-autoconfirmation and replacement

| Command                   | From → to                        | Invariants                                                                                                                                |
| ------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CREATE                    | absent → DRAFT revision 1        | Exact conserved source/context, full values and explicit observation acknowledgement; no implicit confirmation.                           |
| CORRECT_DRAFT             | DRAFT → DRAFT                    | Material full-value change plus reason; fixed source/payer/context and all earlier values preserved.                                      |
| WITHDRAW_DRAFT            | DRAFT → WITHDRAWN                | Values/source/confirmation-null preserved; motivated terminal unconfirmed withdrawal.                                                     |
| CONFIRM                   | DRAFT → CONFIRMED                | Exact observed revision, explicit review acknowledgement/note and independently authorized actor.                                         |
| REVERSE                   | CONFIRMED → REVERSED             | Same values/source and immutable confirmation retained; motivated reversal of the recorded observation.                                   |
| CREATE linked replacement | terminal predecessor → new DRAFT | Same Company, explicit direct link, predecessor has no direct replacement; new qualified evidence/payer/values may correct fixed context. |

WITHDRAWN is a selected additional operational state for an unconfirmed mistake,
not an external cancellation. WITHDRAWN and REVERSED are terminal; no reopen,
extra correction, confirmation or second reversal is added. Exact committed
replay is resolved before fresh lifecycle refusal after current relevant authority.
Reversal changes no bank transfer, allocation, Invoice Record or schedule and
creates no negative amount or external refund.

**Selected independent-author rule:** a confirming stable server Internal User
must have authored neither CREATE nor any material DRAFT correction of this
observation, including an earlier correction later superseded. Compare stable
Internal User identity across memberships/sessions; labels, only membership and
the current last editor are insufficient. Multiple draft authors can require a
further person to confirm. This is the selected bounded software policy, not
reported first-tenant separation-of-duty practice. A Reverser requires its own
capture but no extra person-separation condition.

Replacement is one explicit direct relation from a terminal predecessor to a new
DRAFT; it never overwrites/reopens the predecessor or silently substitutes a source.
Two concurrent creators of one replacement yield at most one committed successor.
A replacement can itself later reach a terminal state and have its own explicit
successor; no direct predecessor gets two. Ordinary observations are not merged
because reference, evidence, amount or date happens to match. The relation describes
corrected PRISMA observations, not an external bank correction.

## 9. Receipts, immutable history and atomic integrity

One actor-membership/Workspace command namespace spans all Payment actions;
fingerprints include Company/action/root/source and complete literal intent.
Before committed replay, check current relevant action captures, Company and
permitted target/source reads. Resolve an exact conserved outcome before fresh
new-use eligibility, lifecycle and observed-revision tests. Later readable source
succession or Client supersession cannot create a duplicate, redirect a root or
require a fresh latest official source for that old outcome. An unreadable required
source still denies commands that consume it. WITHDRAW_DRAFT/REVERSE consume only
their own current Payment authority, not those source reads.

Successful receipt has exactly `{format: PAYMENT_COMMAND/1, commandId, paymentId,
revision, action, recordedAt}`, with server UTC instant and native UUIDs. The
receipt contains no copied financial/source/credential payload. Identical replay
returns the same closed receipt, no event or revision; changed Company/target/
input/action under the same key conflicts. Evidence commands retain the native
Document namespace/protocol, current rights before replay, no repeated scan and
no restoration of an old upload over a newer one. Evidence registration checks
current Recorder/Evidence Access/native registration and original-Client read
before resolving its key. Resolve a conserved Document through its current native
visibility before fresh Client/party/new-use eligibility; historical identity is
never rebound to a canonical Client. Other evidence commands likewise resolve
exact authorized replay before fresh revision/Version/new-use refusal.

Each immutable Payment revision has exactly `{format: PAYMENT_REVISION/1,
paymentId, revision, action, commandId, actor, recordedAt, before, after, reason}`.
Public actor is exactly `{membershipId, displayName}` from the server; stable
Internal User guard identity remains internal. A snapshot is exactly `{state,
values, confirmation}`. Confirmation is null before CONFIRM and otherwise exactly
`{actor, recordedAt, note}`, immutable and conserved on REVERSE. CREATE has null
before/reason; CONFIRM has null reason and its note in confirmation; correction,
withdrawal and reversal carry their literal reason. Fixed source/payer/Company and
replacement lineage belong to immutable root context, never editable revision input.

Head, immutable revision, stable attribution, complete intent/closed receipt,
restricted typed event, valid successful response and any required Client fence
commit or roll back together. Event/receipt/response-construction/commit failure,
denial, stale revision, unchanged correction or conflict leaves no reserved key,
partial head/history/source/lineage/fence or orphan success.

Use Access-owned live authority locks and native Client/Document reference
participants in one caller transaction, then deterministic Payment/predecessor
locks. Fit the actual owning lock order; no foreign private-table queries in
controllers, duplicated Access predicates or nested independent transactions.
Scoped constraints bind Workspace/Company/original Client/exact payer/source and
immutable attribution. Integrity and deferred coupling reconstruct lawful
before→intent→after, non-autoconfirmation and unique direct replacement even for
fully coupled forged roots/receipts/history/events; omitting a child row alone
is not a sufficient proof. Both command/revocation orders, concurrent correction/
confirmation/withdrawal/reversal and final-event/response failures are deterministic
native proof obligations, without sleeps or relaxed guards.

## 10. Reads, bounded discovery and privacy

Inventory includes all four states for the active Company in descending
createdAt/UUID order, 25 eligible rows plus lookahead and an opaque continuation.
It reveals no total, external-reference lookup, state/date filter, aggregate,
allocated/allocatable amount or global search. Scope and live authority filter
before every bound; cursors bind actor/Company/required captures/order and reject
tampering, foreign scope, malformed or replaced-capture input safely. Inventory,
Payment history and eligible-evidence discovery accept only an optional opaque
cursor of at most 2048 UTF-16 code units; unknown query fields fail closed.

Current/detail and first immutable history page share one repeatable snapshot.
History is revision-descending, at most 25 per page, with a head-bound continuation
and explicit 409 reload when the head changes. All revisions remain reachable.
The exact eligible evidence selector is bounded to 25 plus eligible lookahead,
under its complete stronger source predicate before bounds; its continuation
cannot leak draft, foreign or hidden sources. Existing native Client/party
selection remains with its authorized owner, with labeled deliberate selection.
No first-N Company truncation, hidden count or broad generic search is introduced.

Validate every consumed closed public representation, correct root/revision/action,
before/after/order, canonical literal amount/date and independently unavailable
projections before UI publication. Extra/unknown/corrupt stored formats fail closed;
never recover permissively by guessing a latest source or silently dropping facts.
Reads advance no revision, receipt, Client fence, scan, confirmation or success event.

Private Payment actions are `payment.observation.recorded`,
`payment.draft.corrected`, `payment.draft.withdrawn`, `payment.confirmed` and
`payment.reversed`, each with server actor/Company/target/time and only resulting
revision as typed metadata. Evidence uses existing native Document event meanings.
No payer/title/amount/currency/date/basis/reason/reference/file/hash/bytes enters
event metadata, errors or diagnostics. Financial facts/native history are exposed
only through their corresponding protected owner.

Exclude substantive Payment and evidence facts/events before generic Activity,
Home, search/filter/count/cursor/export/target-link bounds even for ordinary
all-grants administrators. Neither Payment read nor source read grants generic
Activity projection. Knowledge draft/admission/retrieval/MCP/AI, Project
association/selected PDF bundles, Task results and shared duplicate-resolution
evidence cannot consume the family; a known UUID or all native grants cannot
bypass that restriction. Existing families and protocols retain their own rules.
Only the five captured bundles' grant/revoke actions keep native ordinary Company
administration visibility, bundle-label-only metadata and one event per actual
transition. Denied/rolled-back/replayed commands emit no success event.

## 11. Complete UI, recovery and operation lifetime

Provide a distinct authorized financial entry, evidence preparation through its
native Document owner and one Payment workspace with bounded inventory,
current/copied detail, full history and independently authorized exact source.
Reuse accepted Prisme controls and shared Select; preserve explicit Classic
compatibility and `/ui-baseline`. Selecting evidence performs no registration,
Payment command, confirmation or automatic download. Clear copy distinguishes a
manual observation, source-content designation, human financial confirmation and
an untracked allocation; no paid badge or bank-certification wording is introduced.

| State                                                      | Observable outcome                                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Initial/delayed read or no entries/eligible evidence       | Native loading/empty state; no hidden count, guessed zero balance or automatic source substitution.                          |
| Empty/draft/official/superseded evidence                   | Exact selected Version/upload, presence and preserved history; draft/empty evidence cannot become a Payment source.          |
| Invalid/literal/malformed/unsafe/oversize/provider failure | Safe actionable error, retained correctable input, no saved/clean/settled claim.                                             |
| DRAFT/CONFIRMED/WITHDRAWN/REVERSED                         | Exact recorded state and attribution; only currently authorized lawful commands.                                             |
| Live Client/evidence/content unavailable                   | Permitted copied facts/history and withdrawal/reversal remain; protected links/details/bytes and guessed cause are withheld. |
| Stale revision/key/state/predecessor/no-op conflict        | Explicit conflict and deliberate reload/recovery, no overwrite or new key by default.                                        |
| Running/uncertain write or malformed success               | Preserve exact body/file/key/intent owner; block sibling, target, source and navigation replacement; retry identically only. |
| Confirmed write with failed refresh                        | Keep the receipt/confirmation and retry only the read, never resubmit the mutation.                                          |
| Identity/scope/relevant capture replacement                | Permanently retire consumed old work and refuse every older continuation.                                                    |

Separate copied Payment read, stronger source/mutation, evidence editor, native
projection and download operation owners. Source/Client/family/content loss retires
only the work consuming that authority; it does not erase copied facts or disable
independently permitted withdrawal/reversal. Recorder replacement retires its
CREATE/correction/evidence attempts, not a valid Confirmer/Reverser read/command.
An equivalent unrelated Actor update preserves valid owned work.

Identity/session/Internal User/membership/Workspace/Company or selected-operation
replacement retires old work monotonically, including A → B → A and fresh equal-
permission captures. Fence token acquisition, HTTP/body/parser/hash/scan, full-Actor
recovery, focus, Blob creation/click and cleanup after every await. An older
full-Actor recovery must never overwrite a newer Actor. Abort owned requests and
revoke Blob URLs; already downloaded bytes cannot be recalled. No protected ID,
query/source, literal finance/basis/reason, command key or receipt enters browser
navigation/URL/storage/cache/analytics/diagnostics; authorized native API transport
remains distinct from navigation persistence.

Locale/frame-only changes while the operation owner remains present preserve
literal text, invalid drafts, immutable attempts and exact decimal semantics with
zero duplicate I/O. All interface/accessibility/error/date/number copy covers
`ro`, `ru`, `fr`, `en`; business content is not translated. Prove keyboard/focus,
error association, shared Select and actual 1440/390 fit in both Prisme and Classic.
No new configuration/default source, role activation or permission from a title.

## 12. Public acceptance journeys and testing decisions

The highest stable seam is actual App → authenticated native HTTP → isolated
PostgreSQL, composing native Access/Client/Document/Accountability owners and the
configured scanner fixture. Use public behavior assertions, exact bytes and
original browser artifacts; private table-layout checks are reserved for separate
integrity and populated-upgrade proof. These are plans, not executed evidence.

### 12.1 First frontier: preserve and reopen the source

Use fictional receiving Company and native original Client with both a PRIMARY
selection and a separately recorded ADDITIONAL identity. Grant synthetic actors
the new opt-ins and independent native rights explicitly. A minimal single-page
PDF says “Fictional payment notice — not bank or fiscal proof”, FICT-PAY-001,
1255.50 MDL, declared 2026-01-15; no real bank/person/account/provider is involved.

Select the labeled payer, register empty evidence with attributable source and
unknown receivedOn, upload a bounded clean PDF, reload and download exact bytes.
Correct the draft with another immutable upload, designate, start an empty
successor and designate different bytes. Deliberately reopen the former Version
and older upload/history after two real App restarts. Source registration creates
no Payment. Native designation by an otherwise authorized Approver without Content
Reader succeeds while protected upload metadata/history/bytes remain hidden.

After source-family/route/grant wiring is runnable, the first meaningful source
RED proves an existing ordinary Document grant cannot disclose the new private
family or consume it through an indirect owner while an independently authorized
native source control succeeds. Missing route/import/schema/grant, unsupported
family or fake no-op is setup, not proof. Complete positive and negative journeys
under the real registered owners after the behavioral RED.

### 12.2 Dependent frontier: record, confirm and correct observations

Recorder A selects the qualified exact source and records DRAFT
`amountMinor: "125500"`, MDL and declared effectiveOn2026-01-15. Reload exact values,
correct to `"125550"` with a literal reason and reopen both revisions/original PDF.
Even when A separately holds Confirmer, A's CONFIRM refuses. Confirmer B with no
Recorder capture explicitly confirms the exact displayed revision and note; its
immutable confirmation/receipt survive restart.

Independently revoke/replace Client, family, Document and content authority.
Copied Payment Reader still reopens facts/history; native projections disappear.
A separately captured Reverser still reverses with a reason, preserving the
confirmation and amount. Create one explicit replacement DRAFT against qualified
corrected context; both roots/lineage/history remain. Separately withdraw a
mistaken DRAFT without claiming a refund. Demonstrate one PDF and repeated external
reference supporting separate observations without an external uniqueness claim.

The meaningful Payment RED follows runnable persistence/source/native grants:
prove that a previously material draft author cannot confirm through another
membership/session, while an independent authorized non-Recorder confirmer can.
Ordinary missing route/import/table or an unprovisioned grant is setup. Preserve
the actual failed behavior, implement the boundary and complete the full journey.

### 12.3 Exceptional, concurrency and visual proof

Acceptance also covers:

- all four currencies,14-digit/minor/decimal edges, explicit null, literal
  whitespace/case/Unicode, invalid controls/unknown fields and real date grammar;
- exact PRIMARY/ADDITIONAL server copy, original Client corrections/union,
  wrong/foreign source/Company/Client/entity and official/superseded/draft cases;
- independent captures/ordinary native rights, supported Client-read alternatives,
  no Recorder requirement on CONFIRM, no content prerequisite added to designation,
  source-loss copied reads/withdrawal/reversal and all indirect exclusions;
- all material draft authors, stable Internal User identity, nonself confirmation,
  unchanged confirmation on reversal, terminal refusal and unique direct replacement;
- exact replay/current-authority/fresh-eligibility ordering, same/different-key
  races, no-op/stale/unknown state/format, competing correction/confirm/withdraw/
  reverse/replacement, both revocation lock orders and scan-time authority loss;
- fully coupled native source/history/receipt/event/confirmation-author forgery,
  event/response rollback and no orphan bytes/key/fence/success;
- more than25 inventory and history entries, equal ordering ties, hidden eligibility
  before bounds, opaque scope/capture cursors, head-change409 and every page;
- actual PDF stream/scan/structure/encryption/outage refusal, immutable uploads,
  official-empty integrity, max50 Versions and exact historical bytes/two restarts;
- actual App uncertainty/malformed-success/confirmed-read-failure, sibling locking,
  held token/parser/hash/focus/Blob/full-Actor callbacks, scoped capture changes,
  A → B → A/equal-permission retirement and locale/frame continuity;
- all four locales, both frames and viewports, visible keyboard focus, original
  inspected synthetic screenshots and the retained deliberate failure-evidence
  probe under the existing verification owner;
- unchanged Invoice Record/financial source/Date, native old Document families,
  Client, Project/Task, commercial and Knowledge protocols with no implicit grant.

Future runtime issues inherit normal doctor/TDD/targeted checks, affected provider/
PG/browser/production-packaging proof, bounded review and exact final integration/
CI rules. No unchecked suite or synthetic contract test may substitute for native
execution or a final current-source/base/tree gate.

## 13. Migration, ownership and all twelve readiness gates

At runtime launch inspect actual delivered main, native public owner interfaces,
captured protocols and journal/snapshot. Reserve no migration number here. Prepare
a genuine populated immediate predecessor containing delivered Invoice Source,
Invoice Records, Date, R2C and any intervening capability. Compare all old rows,
captures, receipts, reads/events, exact PDF/ZIP bytes and protocol meaning through
the additive migration twice and two real restarts. Infer no Payment, confirmation,
source reclassification, wider v1 or grant; compare the exact current schema set.
A new Actor projection can change a captured read without a schema migration:
inspect actual consumed protocols rather than blanket-dropping new fields.

When no qualified evidence family exists, first deliver **preserve/register/upload/
designate/reopen payment evidence** as a complete vertical. Only its actual
conformant delivery and a fresh fit can unblock the complete **manual Payment
observation/correction/confirmation/withdrawal/reversal/replacement** vertical.
These are real source and financial integrity frontiers, never schema/API/UI
horizontal tickets. Do not assert both fit one session or create a blocked backlog.

One fresh principal per complete vertical integrates all shared Access/Client/
Document/Accountability, schema/journal/snapshot, App/navigation/current Actor,
public API/OpenAPI and acceptance seams. Optional helpers can own new feature-local
UI after DTO freeze or separately named new native proof files. No simultaneous
shared writer, mutable clone/index/ref/graph, PG/browser/build/heavy owner or
competing final main window. This is a future allocation plan, not a runtime lease.

| Standard gate                      | Contract coverage                                                                        | Closure still required                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1. Unambiguous outcome             | Approved §§1–3 and12 define complete source then observation journey.                    | Recheck outcome and public seams on the fresh runtime source.                                                       |
| 2. Workspace/Company/legal entity  | §§3–4 exact receiving Company/original Client/payer.                                     | Fit the actual native Client/reference seam and representative synthetic contexts.                                  |
| 3. Actors/permissions/approvals    | §6 five captured opt-ins and exact matrix; §8 nonself rule.                              | Fit current captures/permission prerequisites; no real assignments inferred.                                        |
| 4. Lifecycle/correction/deletion   | §§5/7–9 exact source, four Payment states and immutable correction/confirmation/lineage. | Confirm native rules, full boundary plan and one-session fit for each frontier.                                     |
| 5. Source/provider                 | §§4–6 native bounded private PDF/scan and independent source truth.                      | Current source/adapter/provider fit; real operational source sufficiency stays unqualified.                         |
| 6. Representative examples         | §12 fictional notice, payer choices and distinct synthetic authors.                      | Bind to runnable native public fixtures; no actual receipt or first-tenant-example claim.                           |
| 7. Failure/empty/permission states | §§6–11 independent denial/unavailability/conflict/uncertainty/recovery.                  | Complete the then-current public/App lifetime proof plan.                                                           |
| 8. Security/Activity/observability | §§6/9–12 scoped copies/native rights, private events and coupled integrity.              | Fit actual consumers/lock/seams against the approved privacy boundary.                                              |
| 9. Dependencies/migration          | Genuine immediate predecessor and source-first boundary above.                           | Canonical merge, selected Record/R2C sequencing, current journal/source/fixture and exclusive shared/heavy handoff. |
| 10. Public acceptance              | §12 full native/App/restart/upgrade/provider/visual plan.                                | Bind actual public seams/fixtures before launch; execute proof during runtime delivery.                             |
| 11. One fresh session              | Two complete sequential frontiers, optional disjoint helpers.                            | Fresh complexity/ownership assessment for the selected first vertical; no blocked follow-on launch.                 |
| 12. Every blocker closed           | Product contract approved; runtime blockers remain unclosed.                             | Canonical merge, complete current-source readiness and one fresh issue/claim/resource handoff.                      |

Current runtime status is **NOT READY**. Product approval alone creates no runtime
child and waives none of these gates. Executed new-family tests/browser evidence
belong to subsequent delivery, not a circular prerequisite for starting a properly
qualified first implementation. Invoice Records/R2C remain implementation order,
not a hidden Contract/invoice business dependency for incoming observations.

## 14. Missing operational evidence and deferred frontier

Real sufficient proof to record/confirm/reverse, named people/grants, actual
nonself practice, source ownership/redaction/retention, methods/currencies, bank
statement workflow and accountant/legal meaning remain absent. Synthetic actors,
notices and manual software semantics do not supply them. They gate affected real
use or later integrations; §24/DEC-075 still applies before fiscal/accounting/bank/
automated-payment tickets. No business interview, actual provider research,
credential collection or operational approval is claimed here.

Dan and agents own current-main interface/capture/consumer/lock research, integrity,
additive migration/backup/storage fit, genuine synthetic proof and ticket sizing
under existing ADRs. Newly discovered external or product blockers stay explicit,
not invented defaults. Collect missing business reality through the existing
consolidated process, without sending raw technical questions or repeating them.

Deferred: outgoing payments/refunds, third-party/unknown payer, Contract financial
terms/schedules, allocations/deallocation/reallocation, paid/overdue/unapplied
balances or collected totals, FX/tax/fiscal numbering, CSV/import/export,
accounting/bank/e-Factura/payment-provider automation, Project linkage, generic
search/reporting, legal-source verification, AI/OCR, real grants and real activation.
Later reviewed allocation/reporting cannot silently infer external uniqueness,
settlement or allocatable funds from these bounded human observations.
