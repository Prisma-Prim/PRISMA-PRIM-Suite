# PRD — Release 3 Commercial Workflow, section 28: approved-model Offer generation

**Status:** Approved provisional product contract — non-official generation runtime delivered ([#852](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/852))\
**Owner:** Dan Popescu\
**Contract issue:** [#850](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/850)

This completes the next bounded D7 contract under the owner's 2026-10-24
instruction to finish the representative consulting pilot
[#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820), using the
standing provisional delegation in [Commercial §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose).
These are reversible product conventions, not Iurie approval of actual content,
fiscal values, prices, numbering or legal effect. [§26](release-3-commercial-26-estimate-offer-preparation.md)
owns internal economic drafts; [§27](release-3-commercial-27-company-offer-model.md)
owns model configuration. Those delivered contracts are not relaxed in place.

## 28.1 Problem and complete outcome

The approved economic handoff produces an internal draft without a representation
or tax meaning. The Company can now approve its complete consulting model, but
cannot select it to produce an Offer. Retyping either source would lose approval
provenance; removing an internal-only flag would fabricate missing authority.

An explicitly opted-in preparer selects the exact currently available approved
Company model and one exact approved Profitability Estimate Version. The preparer
explicitly confirms that the source amount is to be used as net, enters the
declared sales-tax amount and its basis, and produces a complete Romanian Offer
Version and reproducible representation. A separate opted-in Offer approver
reviews it through versioned Quality Checks. The existing simulated transmission
and Client-response journey may then rehearse this Version. No real sending,
actual acceptance, official issuance or Contract consumption is enabled here.

The result is useful for reviewing a source-shaped Offer before numbering and
the corresponding Contract slices. It remains visibly non-official regardless of
whether its model source is illustrative or Company-supplied. The actual model
content is entered and approved by humans; installation supplies no approved
model, tax amount, first-tenant identity or assignment.

## 28.2 User stories

1. An administrator explicitly enables new-model preparation and execution
   independently of earlier captured grants and model configuration authority.
2. A preparer sees only the currently selectable approved model, reviews its
   complete intended content and deliberately chooses its exact Version.
3. A preparer selects an exact Director-approved economic Version, including an
   older approval, without retyping its price or exposing costs to Offer readers.
4. A preparer confirms net meaning and supplies a declared tax amount and basis
   without the application inventing a fiscal rate or using internal fiscal cost.
5. A preparer names the readable Client Legal Entity, validity and literal terms,
   reviews all sources and totals, creates and reopens the populated document.
6. An independently authorized Offer approver sees the full frozen content,
   attribution, exact checks and warnings before approving or rejecting it.
7. A preparer records a simulated transmission of the approved exact bytes; an
   approver records the distinct simulated response, never an actual Client act.
8. A user creates an explicit complete successor, preserving every earlier price,
   model, recipient, declaration, decision and representation.
9. A current Offer reader retains the frozen commercial document after source
   permission loss or model withdrawal, without gaining configuration or costs.
10. A user safely retries uncertain success with the same literal body/key after
    later state changes, while revoked authority still prevents replay disclosure.
11. An unauthorized or foreign-scope user cannot infer source, Offer, history,
    count, event or representation existence.
12. A legacy user continues the original Snapshot and internal-only journeys
    without changed bytes, grants, checks, Contract sources or historical meaning.

## 28.3 One identity, three closed Version variants

Use the existing Company-owned Offer, one-Offer-per-Opportunity invariant,
non-official internal reference, optimistic revision and complete Version lineage.
There is no parallel generated-Offer aggregate. Every read remains provisional.

| Version variant                             | Complete source and eligibility                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `ILLUSTRATIVE`                     | Unchanged §18 Snapshot, Template/rule bindings, exact representation and simulated lifecycle                                                                   |
| Existing `APPROVED_ESTIMATE_INTERNAL_DRAFT` | Unchanged §26 exact economic approval, unspecified tax, no representation/checks/execution/Contract                                                            |
| New `COMPANY_MODEL_ESTIMATE`                | Exact economic approval, frozen selected approved model, explicit net/declared-tax facts, representation and §28 checks; non-official simulated rehearsal only |

The new variant never contains a fake Pricing Snapshot, illustrative Template
binding, fake priced stage rows or a half-Snapshot/half-estimate shape. Its source
amount/currency and approval stamp follow §26's protected commercial projection:
estimate identity, exact Version id/number, exact `APPROVE` decision id/time,
proposed commercial amount and currency. No costs, profit, target, pricing intent
or strategic rationale enter the Offer, receipt, representation or Activity read.

The frozen model stamp identifies the same-Company fixed
`INTEGRATED_MANAGEMENT_CONSULTING_RO` model, exact Version id/number, its unique
approval decision id, approving membership and instant, source kind/description,
and the complete §27 content. An approval basis or withdrawal reason is not copied.
The model's issuer values are human-entered intended identity, not independent
verification or a mutation of the Company master record. The Offer also preserves
its ordinary Company label, exact recipient copy, validity, actor/time and terms.

The immutable output's eligibility is `NON_OFFICIAL_REHEARSAL`. Model approval,
economic approval and Offer approval are distinct facts. A Company-supplied model
never removes the non-official or declared-tax limits. Old Versions are never
promoted, re-pointed or reclassified by installation or new configuration.

## 28.4 Explicit financial facts

The new command requires this complete declaration, with no populated defaults:

| Input/fact          | Rule                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meaning             | Explicit closed value `NET_PLUS_DECLARED_TAX`                                                                                                       |
| Net confirmation    | Literal true, freshly confirmed for every first/successor command                                                                                   |
| Net and currency    | Server copies the exact approved source amount/currency; caller cannot override them                                                                |
| Declared tax amount | Required zero-or-positive plain decimal string with exactly two fractional digits, in the source currency; explicit zero is allowed, never inferred |
| Tax label           | Required literal plain text, 1–200 characters; it selects no rate, exemption or formula                                                             |
| Declaration basis   | Required literal plain text, 1–2,000 characters, explaining the preparer's basis; it is internal Offer content, not a verified fiscal opinion       |
| Gross               | Server adds net and declared tax exactly using scaled integers; no rounding, percentage calculation, conversion or discount                         |

Preserve submitted scale-two source/tax strings and literal declaration text;
derive gross as canonical scale-two text without insignificant leading zeros.
No economic precision/range limit or JavaScript floating-point calculation is
introduced. All three amounts are displayed before commit and retain the source
currency. Unknown fields, caller totals, tax rates, false/missing confirmation,
negative/exponent/locale-formatted values and unsupported meanings are invalid.
Required text contains a non-whitespace character; NUL and lone surrogates refuse,
while valid Unicode, whitespace and line breaks are preserved and escaped.

The server attributes the declaration to the creating membership/Internal User
and instant. Later independent Offer approval reviews this exact declaration; it
does not retroactively change the Director's estimate decision. A correction is a
new complete Version with a new declaration and fresh confirmation.

This is recorded human commercial data plus exact addition, not official tax
calculation, invoice issuance, rate/exemption selection or a fiscal-cost mapping.
No historical tax, cost or margin is reconstructed. Synthetic125.00 net plus
declared25.00 tax yields150.00 gross; explicit0.00 yields125.00. These are test
examples only. Actual amounts/basis remain human responsibilities.

## 28.5 Independent authority and selected-model projection

The [authorization owner §8](tenant-company-client-authorization-prd.md#8-initial-permission-families)
adds captured versions without modifying older captures:

| Bundle                    | Exact additions to its previous version                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Company Offer Preparer v3 | v2 plus `commercial.offer.model.select`, `commercial.offer.model_based.prepare`, `commercial.offer.model_based.transmission.record` |
| Company Offer Approver v2 | v1 plus `commercial.offer.model_based.approve`, `commercial.offer.model_based.response.record`                                      |

New grants capture these versions; active older grants, repeated grants and old
receipts retain their old capture. Explicit revocation followed by a fresh grant
is required. Existing operations accept the newer captures wherever the earlier
ones were accepted. Null/unknown captures fail closed. Administration, active
same-Workspace membership/Company and minimal bundle-label events stay unchanged;
no backfill, automatic grant or real-tenant assignment occurs.

New first/successor preparation requires all ordinary Offer/Opportunity/Client
prerequisites, v3 selection/preparation, and independent live estimate read through
Contributor or Director. The model owner's narrow selected-for-Offer projection
requires v3 selection plus active Company context; it returns empty or the one
currently active approved Version with full content and the allowed stamp above.
It returns no pending/rejected/withdrawn catalogue, history, counts, approval basis
or unrelated Company model. Neither model configuration read nor editing/approval
is required or conferred. Configuration roles alone cannot prepare an Offer.

Quality Check runs require ordinary prepare plus new model-prepare authority, or
ordinary approve plus new model-approve authority. Approve/reject requires the
latter; simulated transmission requires ordinary transmission plus new model
transmission authority. Simulated response requires ordinary response plus new
model-response authority. Opportunity visibility and active membership/context
remain mandatory. A Director or Workspace Owner has no substitute authority.

Ordinary current Offer read permits the frozen commercial/model/declaration
content and historical representation, independently of source cost/model grants.
This deliberately copied Offer content grants no live configuration/economic
read, administration, model decision, Contract, Document or Activity authority.
Opening a live source performs its own current authorized read and clears protected
source state on refusal; a denied source never erases the readable frozen Offer.

## 28.6 Commands, eligibility, history and replay

The existing Offer boundary adds deliberate first and complete successor creation
for this variant. The input names exact estimate Version id/displayed number,
exact model Version id/displayed number, ordinary recipient/validity/terms and
the full declaration. Successor input also carries observed Offer revision.
Server supplies all amounts except declared tax, source approvals, scopes,
content/renderer/check bindings, actor/time and state. Selection is never implicit
latest, and a second first-create never silently becomes a successor.

The economic source must retain its exact immutable `APPROVE`; a later economic
submission does not invalidate an older approval. A new generated Version must
select the model's exact currently active approved Version in its committing
transaction. Pending, rejected, withdrawn/replaced, wrong displayed number,
foreign/unreadable sources and unsupported families refuse without partial writes
or source-existence disclosure. A pending model successor does not invalidate its
older active approval. Source selection is serialized against approval,
replacement and withdrawal through the model owner.

Ordinary initial `OPEN` Opportunity, original Client fence, active relationship,
named-entity and succession rules remain. A new Version may deliberately switch
between any supported variants under their own full authority/source contracts.
No accepted Offer permits a successor. Every new generated Version starts pending,
untransmitted, with no response, decision or Quality Check run. Rejection is
terminal for that Version; recovery creates a successor. History retains source,
model, declaration, price/total, recipient and term differences without costs.
Existing bounded cursor and exact read semantics remain, including mixed histories.

One actor/Workspace/Company-scoped Offer receipt namespace covers all command
kinds. Its exact fingerprint includes kind, target, observed revision, every source
identity/number, recipient, literal declaration and terms. Changed intent conflicts.
Current required membership/context/grants, Opportunity and original Client/source
read authority precede receipt disclosure. For an authorized identical replay,
return the original committed complete result before current revision/head,
selection availability, validity or later workflow-state checks. Model replacement
or withdrawal after a committed creation does not defeat its receipt or rewrite
its document. Revoked selection/preparation or economic read still denies replay.
No changed payload is normalized into the old intent. Persisted receipt decoding
must retain the complete variant; permissive HTTP readers cannot truncate history.

Preparation and its replay require live model-selection/preparation and economic
read. Check, decision, transmission and response replays require their own §28.5
rights and ordinary target readability, not live configuration or economic read.
Naming a recipient retains its ordinary independent Client-read prerequisite;
other commands use their existing narrow Client eligibility/quality boundary.

Use one caller-owned transaction for Access/source/Client fences, model selection,
Offer/reference/Version/lineage, frozen representation/declaration, receipt and
minimal events. Owning modules expose narrow transaction-compatible projections;
no nested public transaction or external call holds their locks. Consistent lock
ordering must serialize first-create, same-key, same-revision, successor/decision,
transmission/successor, response/successor, selection/withdrawal/replacement and
Access/Client invalidation. The valid serial outcome commits once or refuses
cleanly. Final-write failure rolls back all records, counters, fences and events.

Preserve401/403/uniform unavailable boundaries. Invalid inputs return400; stale
revision, changed-key intent, changed/unavailable selection and unavailable
workflow transitions return distinct safe409 codes only after relevant read
authority. Unknown variants/bindings never fall back to the illustrative mode.

## 28.7 Complete immutable Romanian representation

Bind renderer `OFFER_COMPANY_CONSULTING_RO` version1, independently from the exact
approved model Version. Preserve the complete HTML bytes and SHA256 at generation
with the frozen inputs; read/restart/download cannot rerender from mutable Company,
Client, model or estimate state. A future renderer change receives a new version.
The existing illustrative renderer versions and byte-level goldens remain frozen.

The HTML uses Romanian labels and language, escaped literal text with readable
line breaks, semantic headings/table cells, responsive and print styles, and no
script, resource fetch, active links, executable markup or template expressions.
Use the existing sandboxed representation viewer and exact HTML download seam;
the original generation slice requires no new package, provider, PDF conversion
or Document Registry entry. [§33](release-3-commercial-33-non-official-pdf-download.md)
separately owns the bounded derived PDF download contract; it preserves this
exact HTML and grants no additional commercial or Document authority.
The internal view shows current workflow state outside the immutable bytes.

The fixed content order is:

1. Visible non-official rehearsal/no-official-number/no-legal-effect banner,
   separately identifying an illustrative model when applicable.
2. Model service title, full intended issuer legal identity/contact, Offer internal
   reference/Version, frozen recipient identity, creation instant and valid-until.
3. All explicit framework names/editions and all ten complete narrative sections
   in §27 order; optional Offer scope/commercial terms remain separately labelled.
4. Financial section with confirmed net, declared tax label/amount, gross and
   currency, visibly identifying tax as human-declared and unverified.
5. All eighteen ordered proposed title/activity/intended-result rows. They are
   unpriced proposed work, never performed Tasks or thirteen-activity mappings.
6. A provenance footer identifying exact model/approval, economic Version/approval,
   renderer version and the document's non-official eligibility.

Source description and declaration basis stay reviewable internal Offer content;
the external HTML identifies the tax declaration without printing either internal
basis, model decision notes, costs, margin or strategic rationale. It prints all
intended model body/issuer text. No historical source number/date, signatory
mandate, payment schedule, payment fact, FX rate or legal effect is inferred.
Changing interface language leaves these Romanian bytes/checksum unchanged.

## 28.8 Checks and simulated execution

Bind immutable `OFFER_QUALITY_COMPANY_MODEL` version1 runs to this variant only.
Use §18's run/decision timing, warning-set equality, attribution, checksum and
revision guarantees. The complete rule set is:

| Code                          | Failing severity | Rule                                                                                                                                        |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `MODEL_APPROVAL_COHERENT`     | ERROR            | Frozen supported complete model and exact same-scope immutable approval stamp agree; no live current-selection requirement after generation |
| `ECONOMIC_SOURCE_COHERENT`    | ERROR            | Exact frozen approved source amount/currency and stamp agree with the named same-Opportunity Version; no cost projection                    |
| `DECLARED_TOTALS_COHERENT`    | ERROR            | Explicit net confirmation, supported declaration and literal required basis/label; exact nonnegative tax and net+tax=gross                  |
| `REPRESENTATION_COHERENT`     | ERROR            | Frozen supported renderer/model/input binding, complete representation and exact digest agree                                               |
| `VALIDITY_OPEN`               | ERROR            | Current decision instant is strictly before valid-until                                                                                     |
| `RECIPIENT_AVAILABLE`         | ERROR            | Current active original Client/Company relation and named entity remain available through the owning boundary                               |
| `RECIPIENT_IDENTITY_CURRENT`  | WARNING          | Frozen named recipient identity equals the current authorized identity                                                                      |
| `RECIPIENT_TAX_ID_RECORDED`   | WARNING          | Frozen recipient has a tax identifier                                                                                                       |
| `CURRENCY_UNCHANGED`          | WARNING          | Currency equals the last earlier transmitted Version's currency, if any                                                                     |
| `NON_OFFICIAL_MARKER_PRESENT` | ERROR            | Metadata and HTML retain the required non-official/provisional identity and no official number                                              |
| `DECLARED_TAX_UNVERIFIED`     | WARNING          | Always warns that tax is entered human data, not verified fiscal calculation                                                                |
| `NON_OFFICIAL_OFFER`          | WARNING          | Always warns that approval/transmission/response are a non-official rehearsal                                                               |
| `ILLUSTRATIVE_MODEL`          | WARNING          | Warns exactly when frozen model source kind is illustrative                                                                                 |

Model withdrawal/replacement prevents new generation but does not revoke the
recorded approval used by an existing Offer. Runs check its immutable source,
not current model availability or the deciding actor's configuration/cost rights.
Source/grant changes never rewrite old checks, decisions, declarations or bytes.

The new opted-in actors may approve/reject, record `SIMULATED` transmission and
record `SIMULATED` accepted/rejected/expired responses under all §18 transition,
warning, validity, received-time, exact-hash and supersession rules. None creates
a real message, actual acceptance, signature, payment, legal effect or Project.
An accepted rehearsal remains immutable/final like other accepted Offers.

Both accepted-source and pending-Offer legacy Contract preparations explicitly
refuse this variant with safe `OFFER_MODEL_CONTRACT_UNSUPPORTED`; direct origin
must not substitute a fake Snapshot. The separate [D8 contract (§30)](release-3-commercial-30-model-contract-generation.md) defines the matching Contract
compatibility. Existing internal-only drafts retain their §26 refusals.

## 28.9 Activity, storage and compatibility

Reuse §18's creation/Version/decision/transmission/response events atomically.
Minimal stored creation metadata may identify the closed variant, exact model
Version/approval and economic Version/approval instead of a Snapshot. Include no
content, issuer/recipient values, amounts, tax label/basis, source description or
economic rationale. No event follows read, check-only run, refusal, rollback or
replay. Commercial Activity retains §25's already-authorized target/version fields
only; no source/configuration/economic metadata, count or dashboard expansion.
Model lifecycle events remain internally restricted under §27.

Reviewed additive migration and scoped constraints admit exactly the three valid
content/source/binding shapes, protect immutable source/content/bytes/receipts,
retain exact same-Company/Workspace approval references and reject unknown modes.
No backfill grants new permission, generates a representation or changes a
recorded decision. Generated metadata is committed with the migration.

Genuine0079 upgrade proof preserves configured pending/approved/withdrawn model
history, captured old grants, unadjusted/adjusted Snapshot Offers and bytes,
internal drafts, old checks/decisions/transmissions/responses and their ordinary
and early-origin Contracts/Project links. Every consumer/decoder/history/receipt
and refusal boundary handles the new variant explicitly. A mixed optional-field
bag, assertion or permissive decoder cannot invent a valid historical record.

## 28.10 Interface, proof and readiness

Use the delivered Request/Opportunity detail and Offer preparation/view/history
entry points, existing Prisme controls and explicit Company access administration.
Show a deliberate source-mode choice, full selected approved model, exact approved
economic Version, net meaning, declared tax/basis, gross, recipient and validity
before creation. No model means an explicit empty state with a separately
authorized configuration route; an internal-only draft remains distinguishable.

Display full frozen content, approvals, declaration and checksum on reload, with
separate current workflow state. A price-only Offer reader sees no cost or cached
live source response. Runs/actions require current exact-version rights. Every
first/successor requires fresh net confirmation; locale switches preserve literal
drafts, source identities, canonical amounts and bytes. Source selection changes
never silently reuse the prior source's confirmation.

Provide delayed/empty/malformed/denied/unavailable/stale/check-error/warning,
uncertain and success states. Preserve correctable drafts; uncertain outcome
retains exact body/key and blocks sibling commands until explicit identical retry
or deliberate retirement. Scope/session/captured-grant loss clears protected source
state and late replies; child unmount must not cancel shell access revalidation.
Use labelled multiline controls and readable escaped line breaks, keyboard/focus,
localized interface copy/numbers, and actual1440/390 visual inspection. Document
language and interface language remain independent.

The runtime issue must prove:

| Acceptance family                                                                               | Highest stable public proof                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete model/approved source/declaration → first/successor → exact reload/restart/HTML/digest | Real PostgreSQL REST, synthetic125.00+25.00=150.00 and explicit-zero examples, full18 rows, literal Unicode/newlines/escaped markup, large exact decimal values                                                                                  |
| Independent versions/grants and no implicit scope/cost/configuration read                       | Explicit public administration; every prerequisite absent/unknown/revoked, price-only read after source loss, foreign Company/Workspace including same Internal User                                                                             |
| Active model/source identity and frozen historical approval/representation                      | Pending head with older active approval, replacement/withdrawal before new command vs after committed generation, older economic approval, exact replay after later state                                                                        |
| Complete checks/independent approval/simulated transitions and warning equality                 | Public check/decision/transmission/response, validity boundary, wrong digest, changed recipient, supersession and unsupported Contract paths                                                                                                     |
| Same-key/first-create/revision and decision/selection/invalidation races                        | Deterministic PostgreSQL barriers in both serial orders, original Client fencing, no duplicate reference/receipt/event or hidden metadata                                                                                                        |
| Final-write rollback and frozen/scoped storage                                                  | Public command failure injection at final event, no partial allocation/content/receipt/fence; direct constraint refusal of foreign/incoherent/mutable records                                                                                    |
| Genuine upgrade and unchanged legacy journey                                                    | Real0079 baseline, all three source variants, earlier literal bytes and captured grants/Contracts preserved                                                                                                                                      |
| Real owning App1440/390                                                                         | Explicit grant/selection/confirmation, complete document, checks/approval/simulated transmission, successor/exact history, committed uncertain success and identical retry, malformed replies and access/scope retirement; inspected screenshots |

Before publication, inspect every affected canonical-role/version fixture,
registry CHECK expectation, option list and browser decoder; preserve exact
assertions and deliberate legacy captures. Do not discover a known static-list
omission by repeating a full CI. Follow root Standards then Spec preparation,
bounded independent review and final current-main exact-tree integration proof.

Relevance is verified against actual merged main3eb8a2cb013f07d55dd40619afec7004c2b0dd8a:
§26 and §27 are delivered, and no generated-model Offer route exists. After this
contract merges, qualify one complete vertical runtime child for the above narrow
fixed family. It spans only the existing source/Offer owners, explicit grant
versions and one populated document journey; no generic Template engine, provider
or horizontal prerequisite is needed. If the one-session fit assessment fails,
split only at another independently usable complete business outcome before claim.

Next remains D11's separate configured Offer numbering, D8/D12's corresponding
Contract/annex and numbering, then D9/D10's preserved received signed PDF and human
exact-Version signing/acceptance declarations. Numbering must create an explicit
new complete unaccepted Version/representation before fresh approval; it cannot
rewrite an approved hash or turn an accepted rehearsal into a real agreement.
Its final production policy is still separately configured, with no default here.
Existing thirteen-Task/result/PDF and ordinary Project closure capabilities are
reused for the final anonymous representative rehearsal. No real-data trial,
production activation or full-project completion is claimed.
