# PRD — Release 3 Commercial Workflow, section 29: Company consulting Contract model

**Status:** Approved provisional product contract — model-configuration runtime delivered ([#864](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/864))

**Owner:** Dan Popescu  
**Contract issue:** [#862](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/862)

This is the first independently usable D8 outcome under Dan's 2026-10-24
[representative-dossier continuation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820)
and the provisional delegation in [Commercial §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose).
It applies DEC-119/DEC-122 and [Governed Documents](governed-documents-prd.md)
without approving actual clauses, Company identities, signatory mandates or
tenant assignments. The controlled sources supply shape and provenance, not
instructions or operational approval. Configuration runtime is delivered by
[#864](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/864); generated
Contract instances and source concordance belong to [§30](release-3-commercial-30-model-contract-generation.md).

## 29.1 Problem and complete outcome

The full generated Offer under [§28](release-3-commercial-28-model-offer-generation.md)
is delivered. This configuration outcome replaces the previously
[blank candidate skeleton](commercial-candidate-contract-2026-10.md) with a complete
reviewable Company model; [§30](release-3-commercial-30-model-contract-generation.md)
owns its populated Contract and annex. Existing
illustrative Contract placeholders are not reusable approved legal content, and
neither legacy Contract source route consumes the new Offer variant.

An explicitly assigned Company editor records a complete immutable Romanian
ordinary consulting Contract model. A separately assigned approver reviews all
its content and decides the exact Version. Authorized users reopen complete
history, distinguish a pending head from the currently available approval and
withdraw that approval from future selection. Installation creates no model or
approval. This is configuration and review, independently useful before the
separate generated-Contract/Offer-concordance continuation.

Official numbering remains dependent on the expressly deferred policy in
[§22.2](release-3-commercial-22-controlled-evidence-2026-10.md#222-numbering-direction-without-an-invented-final-rule).
D11/D12 do not block this configuration or the anonymous non-official rehearsal.
Their defaults, reservation moments, resets and cancellation details are not
invented here.

## 29.2 Stories and fixed boundary

1. An assignment administrator deliberately grants or revokes model editing and
   model approval independently without widening any existing grant.
2. An editor enters the intended Romanian Contract wording, issuer details,
   explicit framework editions and all thirteen intended activity/result rows.
3. An editor preserves the intended place and annex reference wording without
   choosing which contradictory historical date or edition was legally correct.
4. A reviewer reads every section, party-detail and signature-area field before
   approving or rejecting the exact pending head with an attributed basis.
5. A preparer holding ordinary Contract rights gains no model configuration
   access or approval merely from those rights.
6. An editor deliberately copies a readable Version into a complete successor
   draft, preserving the old Version, its source and its decision.
7. A reader distinguishes an approved active Version from an older approval or a
   pending successor; source declaration and legal validity remain distinct.
8. An approver withdraws the exact active selection with a reason while retaining
   all decisions and any future consumer's independently frozen content.
9. A user retries an uncertain command with its original body/key, while sibling
   actions cannot silently replace the owner of that retry.
10. A user changes interface language without changing literal business content,
    issuing a locale-only request or losing an active draft.
11. A user loses protected drafts and late responses when scope/session/current
    authority changes; another Company or Workspace learns no model existence.
12. A user reopens complete content, attribution and history after restart, with
    all existing Offer models and commercial records preserved.

One root per Company has fixed code
`INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO`, kind `CONTRACT` and language `ro`.
This names one bounded configuration family, not a Service Definition, catalogue
Offering, generic Template, Contract identity or proof of certification ability.
Precontract, Addendum, other service/language variants and shared cross-Company
models are excluded. The eighteen Offer rows and thirteen Contract/Project rows
remain separate; no one-to-one conversion or Task generation is introduced.

## 29.3 Complete literal content and provenance

Each Version contains exactly the fields below. Required strings contain a
non-whitespace character; lengths are UTF-16 code units. Preserve accepted text
verbatim, including spaces and line breaks. Refuse NUL and malformed Unicode,
unknown keys, missing/invalid fields and wrong row counts with safe validation
errors; never echo submitted text in diagnostics. The complete JSON content is
at most 64 KiB UTF-8. No HTML, script, expression, include, placeholder engine,
URL fetch, attachment or conversion executes. Review renders escaped plain text.

| Field                       | Complete contract                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceKind`                | Exactly `ILLUSTRATIVE` or `COMPANY_SUPPLIED`, deliberately selected for each Version, with no default. Company-supplied is a human provenance declaration, not legal validation.                                                                                                                                                          |
| `sourceDescription`         | Required 1–500 characters describing the editor's basis; no external source file is required. It belongs to protected configuration, not a future client-facing representation or Activity metadata.                                                                                                                                      |
| `title`, `serviceTitle`     | Each required 1–300 characters: the intended ordinary Contract heading and consulting service label.                                                                                                                                                                                                                                      |
| `place`                     | Required 1–200 characters, entered by the editor. It is reusable place wording, not an inferred signing place, date or jurisdiction decision.                                                                                                                                                                                             |
| `issuer`                    | Exactly required `legalName` 1–300, `taxId` 1–100 and `legalAddress` 1–1,000; optional `contactDetails`, absent/null normalized to null, otherwise required non-whitespace text 1–1,000. No automatic copy from a Company/Offer model. These are intended model values, not a mutation or independent verification of the Company record. |
| `providerDetails`           | Required 1–4,000 characters containing the intended provider requisites wording beyond the structured identity. Any bank/contact/representative information is literal human input; nothing is inferred, verified or used for a payment.                                                                                                  |
| `clientDetailsIntroduction` | Required 1–1,000 characters introducing the eventual Client requisites area. No Client identity, account, bank details or mandate is selected or defaulted in this Company model.                                                                                                                                                         |
| `frameworks`                | 1–10 ordered entries, each exactly required `name` 1–200 and explicit `edition` 1–100 characters. No automatic edition choice/replacement.                                                                                                                                                                                                |
| `sections`                  | Exactly the nine required fields listed below, each 1–4,000 characters. These are the complete proposed reusable narrative/clauses, not approved-by-code boilerplate.                                                                                                                                                                     |
| `signatureAreas`            | Exactly `provider`, `client`, `annexProvider`, `annexClient`, each required 1–500 characters of intended blank-area label/guidance. No actual signer, signature, signing requirement, mandate or execution is established.                                                                                                                |
| `annex`                     | Required `title` 1–300, `referenceWording` 1–1,000 and exactly thirteen ordered `activities`. Each row has required `title` 1–200, `plannedActivity` 1–1,000 and `intendedResult` 1–1,000. No date, official number or source-to-Task binding is inferred.                                                                                |

The exact section keys and their order are:

| Section | Key                    | Content to enter/review                                                                                                      |
| ------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| I       | `subject`              | Service scope/subject clauses; framework editions remain explicit above.                                                     |
| II      | `executionTerm`        | Reusable term and handover clauses, without a default case date or duration.                                                 |
| III     | `rightsAndObligations` | Complete intended rights and obligations wording.                                                                            |
| IV      | `confidentiality`      | Complete intended confidentiality wording.                                                                                   |
| V       | `priceAndPayment`      | Complete intended price/settlement/payment clauses; no calculated rate, amount, share or schedule.                           |
| VI      | `liability`            | Complete intended liability wording; no penalty rate supplied by code.                                                       |
| VII     | `termination`          | Complete intended termination wording; no notice interval supplied by code.                                                  |
| VIII    | `finalProvisions`      | Complete intended final provisions.                                                                                          |
| IX      | `partiesAndSignatures` | Complete intended party-detail/signature provisions, alongside the structured issuer, requisites and four blank-area fields. |

This covers the [CT field mapping](commercial-candidate-models-2026-10.md), including
both party details and both annex signature areas, without copying received
clauses, case values or historical identifiers. Literal prose is opaque reviewed
content, not a machine-readable financial rule, mandatory obligation or legal
equivalence assertion. A later Contract generation contract supplies the exact
recipient, case dates, source Offer and financial facts; this model selects none.
Approval records the human's intended reusable wording and editions, while the
received originals and their contradictions remain unchanged.

## 29.4 Independent Company authority

The [authorization owner §8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
adds two explicit Company-scoped captured v1 bundles:

| Bundle                          | Exact permissions                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Company Contract Model Editor   | `commercial.contract.model.read`, `commercial.contract.model.version.create`                               |
| Company Contract Model Approver | `commercial.contract.model.read`, `commercial.contract.model.decide`, `commercial.contract.model.withdraw` |

All reads, commands and receipt disclosure require current active Workspace
membership, independently authorized active Company context and a live captured
v1 assignment for the needed permission. Missing/null/unknown captures fail
closed. The existing administrator with `company.assignment.manage` explicitly
grants/revokes for an active same-Workspace member and active Company using the
ordinary attribution/retry contract. No backfill or automatic assignment occurs.

No Director, Workspace owner, Offer/Contract preparer/approver, Offer model,
pricing, Project or Document grant substitutes. Neither new bundle grants Company
context, Client/Opportunity/commercial/cost reads, ordinary Contract operation,
Activity read or administration. A person may hold both explicit grants and
review their own submission; no mandatory two-person business rule is invented.
Editing never decides, approval never edits. Future generated-Contract selection
must establish separate opt-in authority; ordinary Contract read does not gain
this configuration catalogue.

## 29.5 Versions, decisions and availability

The server owns root id/Workspace/Company/code/kind/language, monotone revision,
head Version and optional active approved Version. Version numbers start at one
and increase monotonically. A Version freezes complete content/provenance,
predecessor, creator membership/Internal User and server time. No edit/delete
operation exists. A deliberate full successor may follow a pending, rejected or
approved head and leaves the active approval available.

Only the exact pending head can receive its one immutable `APPROVE` or `REJECT`
decision. The decision freezes Version id/number, required literal basis
1–2,000 characters, actor membership/Internal User and server time. No decision
means `PENDING`. Approval atomically selects the head for new use and replaces the
former selection; rejection leaves selection unchanged. Earlier content and
decisions never change.

Withdrawal names the exact active Version id/number, expected root revision and
required literal reason 1–2,000 characters. It clears selection and records a
separate immutable actor/time/reason fact, even with a newer pending head. A
withdrawn Version cannot be reactivated; resubmission and a new approval require
a complete new Version. Recorded approval and current availability are distinct.
Model approval alone creates no Contract, representation, signature or acceptance.
Future consumption must validate selection in its own mutation transaction and
freeze its own content; withdrawal must never rewrite such a frozen record.

## 29.6 Public commands, reads and integrity

The narrow Company-owned boundary supports complete first/successor submission
with `expectedModelRevision` (zero only for first creation), exact pending-head
decision, exact active-selection withdrawal, root/head/active summaries, exact
full Version reads and stable descending Version history. History defaults to
20/max50 summaries with an explicit opaque next cursor; full text is opened by
exact id. Empty configuration is explicit; no global list/search/count is added.

Each material command increments root revision once. Only submission allocates
a Version number; identical-content deliberate resubmission is still a new
Version. All mutation strings, including basis/reason, obey §29.3's literal and
valid-Unicode boundary. A request idempotency key uses one shared namespace per
Workspace/Company/acting membership across these model commands. Its fingerprint
binds command kind, fixed model identity, applicable exact Version ids/numbers,
expected revision and all literal inputs.
Revalidate live authority before disclosing a receipt. An exact committed replay
returns the original result before later head/revision/availability checks;
changed intent under the key conflicts. A new key cannot re-decide or withdraw
an unavailable Version. Replay creates no new Version, number, decision or event.

One transaction protects live authority, root/head/selection, immutable content,
decision/withdrawal, receipt and minimal events. Use the existing membership,
Company and grant revocation fences before the model root in consistent order;
do not hold their locks across nested public transactions. Composite references
and immutable guards reject foreign scope and tampering independently of UI.
Concurrent first submissions produce one root; identical keys converge.
Competing expected revisions, decision versus successor and approval versus
withdrawal have deterministic serial outcomes, never two active selections.
Final-write/event/response-construction failure rolls back all effects, including
root creation, counters, fences, receipts and events.

Unverified identity yields401, invalid current context/grant403, and unknown,
foreign or unreadable exact Versions one safe unavailable response without
existence disclosure. Invalid content yields400; stale revision, changed-key
intent, non-head/already-decided and unavailable-selection transitions yield
distinct safe409 codes. Unknown modes/versions never fall back. Denied, invalid,
conflicted and rolled-back commands commit no receipt or success event.

## 29.7 Activity, privacy and compatibility

Record one event for each committed `contract_model.version.created`,
`contract_model.version.approved`, `contract_model.version.rejected` or
`contract_model.version.withdrawn`, targeted at exact model/Version with Workspace,
Company, actor and server time. Metadata contains only fixed model code, Version
number and resulting root revision. No party/requisites, framework, clause,
source description, basis/reason, amount or signature-area text enters events or
diagnostics. Assignment events retain the ordinary bundle-label-only convention.

These model events are internally recorded, not projected through commercial
Activity, dashboards, counts or filters in this slice. Protected model history
exposes attribution under model read without granting Activity access. Existing
commercial projections and every unrelated event contract remain unchanged.

An additive reviewed migration adds empty schema, never seeded roots, Versions,
approvals or assignments. Preserve all existing captured grants and receipts,
Offer models/states, generated model/economic Offer snapshots and HTML/digests,
internal drafts, illustrative Offers and all Contract origins/versions/checks/
decisions/signatures/Project links. No old capture gains authority, no existing
provenance is promoted and no legacy representation bytes change. Installation
requires no Clerk/file provider setup, real content or new package.

## 29.8 Interface and safe asynchronous work

Use the accepted Prisme Company configuration and ordinary assignment controls.
The fixed ordinary Contract/service/language, source declaration, pending head
and active approval are visibly distinct. First entry has blank business values
and no selected source kind; thirteen blank structural rows are not business
defaults. A deliberate copy-from-readable-Version action may prefill a complete
successor, preserving literal source fields until the editor deliberately changes
them. Display all nine sections, provider/Client areas, four signature labels and
thirteen rows for full review. Decide/withdraw uses a visible exact Version label
and explicit basis/reason, never UUID entry. An illustrative approval stays
visibly illustrative. No UI claims legal validation or sends a document.

Provide loading, empty, invalid, unavailable, denied, stale, uncertain and
confirmed states. Preserve correctable drafts. While a command is running or its
outcome is uncertain, retain its exact body/key and block conflicting edits,
decisions, copying and history/succession that could replace its owner; its own
explicit identical retry remains available after uncertainty. Malformed success
is uncertain. Changing intent requires known resolution or deliberate retirement
of the complete owner; an ordinary sibling action is not such retirement. Late
reads started earlier cannot overwrite protected draft/command ownership. A
confirmed mutation remains confirmed if a subsequent refresh fails.

Company, principal/session, Workspace membership or live captured authority
changes retire protected content/drafts, cancel owned requests and suppress late
responses. Fresh reads require remaining current authority. Preserve the owning
state across ordinary section/frame and interface-locale changes; locale alone
does not request/save or translate stored text. Use shared Select, labels,
keyboard/focus/error association and desktop1440/narrow390 fit under the UX owner.

## 29.9 Acceptance and public evidence

The separate runtime child completes explicit assignment administration and the
full schema/API/Prisme/history path in one vertical outcome. Its highest stable
seam is authenticated REST against isolated PostgreSQL, with registered actual
App proof at both viewports; isolated fixtures are not real-provider evidence.

Prove complete literal create/restart/exact read; all fields and thirteen rows;
escaping/Unicode/limits/unknown-key refusal; independent edit/approve/read and
null/unknown/revoked assignment denial; pending-head approval/rejection with exact
attribution; successor/replacement/withdrawal/history and unavailable reactivation;
exact replay after later state versus changed intent and denial before replay
after authority loss. Include foreign Company and a second Workspace membership
of the same Internal User, with no existence/count/text leakage.

Use deterministic PostgreSQL barriers to prove both dangerous orders for
first-create/key/revision competition, decision/successor/withdrawal and grant,
membership, Company or Internal User invalidation. Hold the authority or model
fence deliberately, observe the blocked operation, commit the first actor, then
assert the valid serial result and absence of extra effects. Force the last
recorded event to fail and compare all records/counters/fences/receipts/events.
Verify scoped constraints and immutable storage through the public-owned state.

Upgrade a genuine pre-slice schema containing existing Offer model states,
captured old/new Offer grants, full generated model/economic and internal/ordinary
Offer history plus ordinary/early executed synthetic Contracts and Project links.
Compare preserved rows, exact representation bytes/digests and original receipts;
repeat migration safely. Current-schema fixtures are not a historical baseline.

The actual App journey proves full entry/review/approval, pending successor with
prior active approval, replacement, withdrawal and exact history after reload;
committed-but-unconfirmed and malformed-success identical retries; blocked sibling
actions and late navigation; localized draft continuity and real scope/access
retirement. Inspect synthetic screenshots at1440/390 and preserve complete browser
evidence, including failure evidence. All repository content, fixtures and public
evidence remain synthetic; no source dossier or actual clauses are committed.

## 29.10 Readiness and deferred continuation

The source catalogue, CT skeleton and existing model administration provide
enough shape/prior art for this narrow configuration outcome. Actual Company
wording and its approval remain explicit human runtime acts; neither an agent
nor installation approves them. No repeated dossier request or final numbering
policy is needed to implement and demonstrate this bounded configuration safely.

After ordered Standards then Product/Spec disposition and canonical publication,
create one context-free runtime child only when all twelve ticket-readiness gates
and one-fresh-context fit pass. Schema/API/UI/tests are one outcome, not separate
layer issues. Its delivered state and proof remain owned by that live tracker.

The separate [D8 generated-Contract contract (§30)](release-3-commercial-30-model-contract-generation.md)
owns exact eligible model/Offer selection, full frozen Romanian Contract/annex,
party/financial concordance and internal approval while source acceptance remains
pending. Its runtime is delivered separately in [#868](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/868); later
exact-Version human evidence still requires a separate contract. Existing D1 preparation does not automatically
consume this new Offer/model mode, and none of those runtime changes occurs here.
D9/D10 received PDF and human signing/acceptance declarations and existing Project
linking follow their own contracts. D11/D12 await separately final official
numbering policy. No generic Template/clause library, Precontract/Addendum
variant, historical cost reconstruction, actual fiscal/payment rule, signature
provider, task/certification result, real grant, deployment or production activation
is a prerequisite of this configuration or claimed by its approval.
