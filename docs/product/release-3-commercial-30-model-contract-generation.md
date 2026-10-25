# PRD — Release 3 Commercial Workflow, section 30: corresponding model-based Contract

**Status:** Approved provisional product contract — non-official generation and internal-decision runtime delivered ([#868](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/868))

**Owner:** Dan Popescu\
**Contract issue:** [#866](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/866)

This is the next D8 outcome under [#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820)
and the delegated provisional execution authority in [Commercial §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose).
It consumes the independently approved [Company Contract model (§29)](release-3-commercial-29-company-contract-model.md)
and full [model/economic Offer (§28)](release-3-commercial-28-model-offer-generation.md).
It applies DEC-117–DEC-120 and Governed Documents without deciding actual clauses,
tax rules, signatory mandates or official numbering. Controlled originals remain
evidence, never executable instructions or installation defaults.

## 30.1 Problem and complete outcome

The representative dossier can preserve an approved full Offer and an approved
Company Contract model, but both existing Contract source routes deliberately
reject `COMPANY_MODEL_ESTIMATE`. Illustrative placeholders cannot produce the
corresponding nine-section Romanian Contract and thirteen-row annex.

An explicitly authorized preparer selects the exact eligible Offer and currently
approved Contract model, enters the case details and preserves a complete frozen
ordinary Contract. The preparer reopens it, checks its source concordance and
deliberately creates a complete successor when necessary. An independently
authorized approver reviews and decides the exact head. All copied content,
financial facts, provenance and HTML bytes survive source changes and restart.

The case's acceptance followed Contract progression and signing. For this new
mode only, internal approval may therefore precede Offer acceptance. It confirms
internal readiness, never acceptance or execution. This avoids a circular gate
before D10's separate exact signing/acceptance declaration. Existing illustrative
`OFFER_PREPARATION` retains §22.4's accepted-source approval/signature gate.

## 30.2 Stories and fixed boundary

1. An administrator deliberately grants or revokes new preparation and decision
   capabilities without silently expanding an old captured assignment.
2. A preparer sees an empty/unavailable model state or selects its exact active
   approval, independently of model configuration/history authority.
3. A preparer selects a current approved/transmitted full Offer while its response
   is pending, without recording acceptance or using a direct-origin workaround.
4. A preparer reviews all copied party, service, financial and provenance fields,
   enters the case date, Client requisites and a concordance declaration, and
   preserves a complete first Contract/annex representation.
5. A reader reopens exact historical bytes, all thirteen intended activity/result
   rows and the separate pending/decision/execution dimensions after restart.
6. A preparer deliberately revises a non-executed Contract using a fresh explicit
   model/Offer selection, preserving the previous Version and its source.
7. An approver sees machine comparisons and the limits of opaque prose checking,
   acknowledges the actual warning set and records an attributed review basis.
8. A user distinguishes internal approval from acceptance, signing, payment,
   official issuance and legal verification.
9. A user retries an uncertain command identically and cannot replace its owner
   through sibling actions, history navigation or late earlier reads.
10. A user changes locale/frame without losing a draft or translating literal
    business content; scope/session/authority loss retires protected state.
11. A foreign Company or Workspace cannot discover records, sources or receipts;
    losing model/economic access does not erase independently readable copies.
12. An existing user retains every legacy origin, capture, receipt, representation
    and Project link without automatic migration into the new mode.

Only kind `CONTRACT` is supported. The new immutable origin is
`COMPANY_MODEL_OFFER`; each Version has provenance `COMPANY_MODEL_OFFER`, language
`ro`, `provisional: true` and eligibility `NON_OFFICIAL_REHEARSAL`. No Precontract,
Addendum, DIRECT fallback, import or renewal consumes this mode. The existing
one-main-Contract-per-Opportunity invariant and per-Company/kind illustrative
reference remain. This internal reference is never an official Contract number.

## 30.3 Exact source eligibility and immutable copies

Initial preparation and each complete successor explicitly name the Offer Version
and model Version/number/approval-decision id. The server derives all source
records; callers cannot submit copied model, price or approval data.

The Offer must be the same Company's current unsuperseded
`COMPANY_MODEL_ESTIMATE` Version, internally approved, transmitted and still
within validity at a new binding, with response pending or `ACCEPTED` (the latter
remains the existing explicitly simulated fact). Rejection or change request is
ineligible. Its Opportunity must be `OPEN`; original Client Account, resolved
active Client/Company relationship and fixed named Legal Entity must be valid.
Successors stay within the same Offer identity, Opportunity, original Client and
named entity. The original root source remains provenance; per-Version source
identifies what actually generated that Version. No existing Contract root can
switch origins or consume this mode through a legacy revision command.

The Contract model must be the exact current active approved Version of §29's
fixed family in the same Workspace/Company, including with a newer pending head.
Withdrawal/replacement before consumption refuses it; consumption first freezes
it independently. Later withdrawal never changes or retroactively invalidates
copied Contract content or its recorded human approval.

Each new Version freezes:

- Full model content, code/language, exact model/Version/decision identifiers and
  numbers, approver membership/Internal User and server approval instant.
- Exact source Offer id/reference/Version/number/representation SHA256, copied
  recipient, scope note and commercial conditions, and its model/economic
  provenance stamp. Retain only the approved economic amount/currency/approval
  identifiers already exposed by the Offer; never costs, margin or rationale.
- Source net amount, declared tax amount/label, gross amount and currency, copied
  exactly without a tax/FX calculation, amount override or second declaration.
  Internal tax basis and model source descriptions stay out of external HTML.
- The named Client entity's current legal name, tax id and address, resolved by
  the Client owner; Company label; entered case details and declaration; creator
  membership/Internal User, server instant, predecessor and monotone number.
- The complete generated representation and its renderer identity/SHA256.

The client cannot submit arbitrary template syntax, HTML, placeholders or clause
overrides. Plain model content is literal opaque reviewed prose. Eighteen Offer
rows and thirteen Contract rows remain distinct; no inferred one-to-one mapping,
completed result, Task or certification follows.

## 30.4 Case input and public mutation contract

The complete case input is exactly:

| Field                          | Rule                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source selection               | Exact Offer Version id and exact Contract model Version id, positive Version number and approval-decision id; server validates the complete binding.                                                                                                      |
| `documentDate`                 | Required real calendar date `YYYY-MM-DD`, deliberately entered, never inferred from a source filename or system date. It is document content, not evidence of signing.                                                                                    |
| `clientDetails`                | Required literal non-whitespace text, 1–4,000 UTF-16 code units, for the case's intended additional Client requisites/representative wording. Structured legal identity is copied separately and cannot be overridden here. No mandate/bank verification. |
| `termStartsOn`, `termEndsOn`   | Both optional, absent normalized to null; if both present, end is not before start. Real calendar dates only. No duration, deadline or legal effect inferred.                                                                                             |
| `specialConditions`            | Optional literal non-whitespace text, at most 4,000; absent/null normalized to null. Additional intended wording is visibly flagged for review.                                                                                                           |
| `sourceConcordanceDeclaration` | Exactly `true`, with required literal `sourceConcordanceBasis` 1–2,000. The preparer declares that the selected Contract/annex wording is intended to correspond to this Offer, not that software has verified legal equivalence.                         |

All entered text preserves literal whitespace, rejects NUL/invalid Unicode and
whitespace-only required values. Unknown keys, modes, invalid ids/positive numbers
and non-calendar dates are rejected. Canonical case-input JSON is at most 16 KiB
UTF-8; model content retains §29's independent 64 KiB bound. No automatic values
for business fields or automatically checked declaration are installed.

The Contract boundary exposes separate named first/successor preparation commands,
exact reads/history/representation and quality/decision operations. First creation
has no caller-assigned root/counter. Successor, approval and rejection name the
exact target and `expectedContractRevision`; first creation uses the established
Opportunity slot. Quality runs do not advance revision. Every other committed
material command increments it once; only preparation allocates a Version.

Use the existing scoped Contract idempotency namespace and exact intent
fingerprints, including command kind, source/model selections, case literals,
expected revision and decision fields. Live current authority and owning
Opportunity visibility precede receipt disclosure. Authorized exact committed
replay returns its original result before later source availability, head,
revision or model-selection checks. Changed intent under the same key conflicts;
failed/denied/rolled-back commands commit no receipt or success event. A new key
cannot re-decide a Version or bypass an occupied Contract slot.

## 30.5 Independent authority and selected-model projection

Two explicit compatible captures are introduced through existing Company
assignment administration, never through backfill or owner/Director inference:

| Capture                      | Authority                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Company Contract Preparer v2 | Preserves v1's read, ordinary prepare and Project-link permissions; adds exactly `commercial.contract.model.select` and `commercial.contract.model_based.prepare`. |
| Company Contract Approver v2 | Preserves v1's read, ordinary approve and simulated-signature permissions; adds exactly `commercial.contract.model_based.approve`.                                 |

Fresh grants at introduction capture v2. Existing active v1, repeated grants and
historical receipts stay v1 until explicit revoke/fresh grant. Null/unknown
captures fail closed. Existing Early Preparation v1 is neither expanded nor
required for this distinct opt-in mode. Model Editor/Approver v1, Offer roles,
Workspace ownership and Director rights never substitute for these capabilities.

New preparation requires both new permissions, current ordinary Contract prepare,
Offer read, Opportunity read and current Client recipient-read authority, all
independent. The model owner supplies one bounded currently selectable complete
Version projection under model-select authority, not its configuration catalogue,
pending content, basis/reason or history. No economic, pricing Snapshot, model
configuration or Activity read is granted. No locks are held across independent
nested public transactions.

New-mode quality runs require ordinary Contract read and either the new
model-based preparation or approval permission, together with its ordinary
prepare/approve permission. New-mode approval/rejection requires ordinary
approval plus `commercial.contract.model_based.approve`. Quality runs and decisions
also require current Offer read to evaluate the live source.
Copied Contract reads require current ordinary Contract and Opportunity read,
without live model/economic/Offer access. This is access to independently frozen
Contract content, not a source-catalogue or cost grant. Current context, membership,
Internal User and captured grants are checked on every read, command and replay.
No production assignments are created. Self-review is permitted when both exact
grants are explicitly held; no mandatory two-person rule is invented.

## 30.6 Checks, internal decisions and conservation

`CONTRACT_QUALITY_COMPANY_MODEL` v1 is bound only to this provenance. Old rule-set
v1/v2/v3 bindings, stored runs and decisions remain unchanged. Runs are stored,
immutable, attributed and reproducible; approval recomputes at its own instant.

| Code                            | Severity                | Rule                                                                                                                                                                                                        |
| ------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_COMPANY_MATCHES`        | ERROR                   | Contract, exact Offer, model approval and Opportunity share Workspace/Company and original source binding.                                                                                                  |
| `PARTY_AVAILABLE`               | ERROR                   | Current original Client resolves to an active Client/relationship and the fixed named entity.                                                                                                               |
| `PARTY_MATCHES_SOURCE`          | ERROR                   | The named entity is the exact source Offer's entity.                                                                                                                                                        |
| `PARTY_TAX_ID_RECORDED`         | ERROR                   | Copied Client identity has a tax id.                                                                                                                                                                        |
| `PARTY_IDENTITY_MATCHES_SOURCE` | WARNING when different  | Current-at-creation copied Client identity differs from the Offer copy; later receipt of requisites can legitimately cause this.                                                                            |
| `PARTY_IDENTITY_CURRENT`        | WARNING when different  | Frozen Client identity differs from the current readable entity.                                                                                                                                            |
| `ISSUER_MATCHES_SOURCE`         | ERROR                   | Model and copied Offer-model issuer legal name, tax id and address are exactly equal. Contact prose remains human reviewed.                                                                                 |
| `SERVICE_MATCHES_SOURCE`        | ERROR                   | Service title and ordered explicit framework name/edition pairs exactly match the copied Offer model. No fuzzy or edition normalization.                                                                    |
| `FINANCIALS_MATCH_SOURCE`       | ERROR                   | Frozen net/tax/gross/label/currency exactly equal the source Offer; stored source/financial formats and exact gross addition remain valid.                                                                  |
| `CONDITIONS_MATCH_SOURCE`       | ERROR                   | Frozen scope and commercial conditions exactly equal source Offer values.                                                                                                                                   |
| `SOURCE_OFFER_READY`            | ERROR                   | Exact source remains current approved/transmitted, unexpired and pending or accepted; Opportunity remains OPEN and no rejected/change-request response exists. Acceptance is not required by this new rule. |
| `MODEL_APPROVAL_PRESERVED`      | ERROR                   | Complete copied model and exact immutable APPROVE stamp remain coherent. Later withdrawal/replacement is not an error for already frozen content.                                                           |
| `MODEL_WORDING_REVIEWED`        | WARNING                 | Always: opaque Contract wording, payment provisions, party requisites and added conditions require a human concordance review.                                                                              |
| `ANNEX_SCOPE_REVIEWED`          | WARNING                 | Always: thirteen intended Contract activities/results need deliberate review against the distinct eighteen-row Offer proposal.                                                                              |
| `ADDED_CONDITIONS_CONFIRMED`    | WARNING when present    | Entered special conditions or structured term dates add intended content.                                                                                                                                   |
| `TERM_END_NOT_PASSED`           | WARNING when applicable | Entered term end precedes the evaluation instant's UTC date.                                                                                                                                                |
| `PROVISIONAL_MARKER_PRESENT`    | ERROR                   | New provenance/eligibility and frozen representation visibly retain non-official/unverified markers.                                                                                                        |

Internal `PENDING` → `APPROVED` or `REJECTED` applies only to the unsuperseded head.
Approval requires no ERROR, acknowledgements equal to the complete current WARNING
set and required literal review basis 1–2,000. Rejection requires literal reason
1–500. Freeze actor/server time, run, warning codes, basis and exact representation
checksum with the immutable decision; no second decision exists. Basis is internal
readable Contract history, never rendered or copied to Activity.

A complete successor is permitted while no Version is executed, including after
approval/rejection. It starts PENDING, updates only predecessor lineage/root head,
and retains all old content, sources, checks and decisions. An old-model choice
is never silently reused; every new binding meets §30.3. History explains source,
model, case and financial differences without leaking costs.

Execution remains `NOT_EXECUTED` in this slice. Existing simulated-signature,
Addendum and Project-link/create commands explicitly refuse this new provenance
with `CONTRACT_EXECUTION_MODE_UNSUPPORTED`; no receipt or state change results.
Internal approval writes nothing to Offer response. D10 must separately decide
exact-Version external declaration and existing Project-link eligibility; neither
upload nor preparation nor a synthetic approval supplies those facts. No delete,
in-place edit, operational/legal lifecycle or withdrawal of a Contract decision
is introduced.

## 30.7 Exact representation, events and integrity

Store deterministic escaped Romanian HTML with renderer code
`COMPANY_CONSULTING_CONTRACT_RO` v1 and SHA256. Reuse sandboxed preview/exact HTML
download; no PDF converter, dependency or Document Registry record is required.
Render the complete model title/place, nine sections, issuer/provider requisites,
Client identity/entered requisites, framework editions, entered document/term
dates, copied scope/conditions and explicit net/tax/gross/currency, added conditions,
four blank signature-area labels and full thirteen-row annex/reference wording.
Display internal reference/Version, exact Offer/model provenance and creation
instant. Keep the visible non-official rehearsal, not-signed/unverified markers;
draft/decision/execution information outside frozen bytes may change without
changing their hash. No signer, signature, official number, tax rate, exchange
rate, payment or achieved result is manufactured. Escape all literal fields;
no executable content or locale-dependent regeneration. Later reads validate the
complete frozen format and reproduce exact stored bytes without live source reads.

Reuse `contract.created`, `contract_version.created`, `contract_version.approved`
and `contract_version.rejected`, transactionally attributed and Company scoped.
Metadata adds only new provenance/origin, exact model Version/decision ids/numbers,
source Offer Version, renderer/rule-set version and resulting Contract revision
to the existing identifier/code-only convention. No clause, Client identity,
requisites, financial amount, basis, dates or private source prose enters events,
diagnostics, counts or unauthorized projections. Existing commercial Activity
visibility requires Contract and Opportunity read; protected copied content is
never added to event summaries. Quality/reads/replays/refusals emit no success.

One transaction binds live authority, Opportunity/Client/Offer/model fences,
Contract slot/root/counter, immutable Version, representation, receipt and events.
Use established authority fences before domain roots; a bounded model-selection
interface joins the caller's transaction. Source changes, Client changes, model
withdrawal/replacement and access invalidation serialize with consumption. Scoped
composite references and immutable guards reject foreign binding/tampering.
Competing first creations, same-key commands, successors and decisions have one
valid serial outcome. Last-event or response-construction failure rolls back
everything including allocated reference, lineage, fences and receipt.

Unauthorized identity returns401, invalid current context/grant403, unknown or
foreign/unreadable exact records one safe unavailable response. Invalid input is 400. Stale revision, changed intent, occupied slot, superseded/decided target,
ineligible Offer/model, quality errors and unequal warnings are distinguishable
safe409 conflicts. Unknown provenance/version never falls back to legacy behavior.

An additive reviewed migration adds empty support, no roots, copied models,
decisions or assignments. Preserve all old Contract/Offer/model rows, frozen HTML,
quality versions, counters, receipts, decisions/signatures and Project links.
Legacy accepted/pending source guards continue rejecting COMPANY_MODEL_ESTIMATE;
only the new named boundary consumes it. DIRECT cannot launder this source or
switch an existing root. Installation requires no Clerk/provider changes.

## 30.8 Interface and acceptance

Use existing Prisme Request/Opportunity/Contract detail and assignment controls.
Select labeled Offer/model Versions, never enter UUIDs. Present eligibility,
current approval, the full populated document, financial provenance, new-mode
pending acceptance, checks, exact warnings and human review basis. Input starts
blank; copying an opened Version deliberately preserves literals into a successor
draft while requiring a new explicit currently eligible source selection. Provide
complete exact history/source differences and sandboxed preview/download.

Provide loading/empty/unavailable/denied/invalid/stale/uncertain/confirmed states.
During pending/uncertain writes retain exact key/body, block sibling mutations,
copy/source replacement/history ownership changes, and allow only the same retry
after uncertainty. Malformed success is uncertain; a confirmed mutation stays
confirmed if a later refresh fails. Earlier reads cannot replace command/draft
ownership. Scope/session/current captured-authority loss retires protected
content, cancels owned requests and suppresses late responses. Locale/frame
changes preserve correctable state and cause no locale-only read/save or literal
translation. Apply shared controls, labels/focus/errors and1440/390 fit.

The runtime child proves through authenticated isolated PostgreSQL REST:

- Full pending-source first preparation, all copied fields/13 rows, internal
  checks/approval without acceptance, restart/exact bytes/digest/history, explicit
  successor and old frozen content after model withdrawal or source changes.
- Every warning/error, Client requisites change, issuer/service/framework/price
  mismatch, rejected/expired/superseded/untransmitted Offer, unavailable/replaced
  model, bad text/date/Unicode/unknown keys and state transition refusal.
- Independent v1/v2 permissions, model-selection/configuration separation, lost
  source/cost/model grants, denial before replay, original receipt after later
  state, changed-key intent, foreign Company and same User/second Workspace.
- Deterministic barriers for both serial orders of consumption versus source,
  Client, model and authority changes; first-slot/key/revision competition,
  successor versus decision and forced final-event/response rollback. Assert
  scoped immutable storage and all counters/events/receipts/fences, not timing.
- Upgrade from genuine pre-slice schema with all legacy origins/quality versions,
  executed agreements/Project links, old captures/receipts and delivered model
  states/full generated Offers; compare old rows/bytes/digests and repeat migration.
- Explicit refusal of new-mode simulated signature, Addendum and Project linking,
  and unchanged complete ordinary/early illustrative journeys.

Registered actual App proof at desktop1440/narrow390 covers full source selection,
case entry, preview, warnings/internal decision, successor/history/reload,
committed-but-unconfirmed/malformed-success retries, held earlier reads/navigation,
locale continuity and actual access/scope retirement. Inspect screenshots and
retain complete failure evidence. Fixtures and public artifacts remain synthetic;
they prove neither actual business wording nor independent provider behavior.

## 30.9 Readiness and continuation

This fixed complete generation/decision outcome uses delivered Offer/model owners
and existing Contract/history/quality/preview seams. It requires no official
numbering policy, PDF provider, actual content or repeated source request.
[#868](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/868) delivers the
named Contract preparation, exact copied reads, bounded history, checks and
internal decisions in one schema/API/UI outcome. The
[public PostgreSQL REST tests](../../apps/api/src/contract/model-contract.rest.test.ts),
[genuine pre-slice upgrade](../../apps/api/src/contract/model-contract.migration.test.ts)
and [registered actual App journey](../../apps/web/e2e/model-contract.acceptance.spec.ts)
own reproducible synthetic proof; the linked delivery PR owns its exact review,
source/base/tree and final integration evidence. Installation creates no models,
approvals or production assignments. This delivery leaves execution pending.

D9's separate [Document Registry§24 contract](release-1-document-registry-24-received-contract-pdfs.md)
owns the received-Contract PDF family/relation and independent content access;
its runtime follows that merged contract. Preservation alone declares no
equivalence or signing. D10 then
owns attributed exact Offer/Contract/PDF-version signing and case-acceptance
declarations, their current authority/concordance/conservation and compatibility
with existing Project linking. Those contracts may extend this explicitly
unexecuted mode without promoting old SIMULATED evidence into actual verification.
Final anonymous acceptance uses existing thirteen ordinary Tasks, exact result/PDF
links and ordinary closure. D11/D12 await final official numbering policy;
D5/D13's generalized obligations/stages are not invented as prerequisites.

No generic Template/clause engine, historical price reconstruction, legal/fiscal
verification, external signature provider, payment accounting, new Project plan,
certification decision, real grant, deployment or production activation is in
scope or follows from this contract's approval.
