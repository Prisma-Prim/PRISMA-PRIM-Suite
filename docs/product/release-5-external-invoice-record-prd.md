# PRD — Bounded manual external Invoice Records

**Status:** Approved bounded software contract — runtime readiness remains separate.

**Version:** 0.1

**Capability owner:** Finance, consuming native Access, Contract, Client and Document owners.

**Tracking:** [#1009](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1009), under [Product Vision #51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51). This is documentation preparation, not implementation or operational approval.

**Disposition:** [Root's actual delegated product selection](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1009#issuecomment-6549665126), after ordered independent Standards PASS then Spec PASS, accepts this bounded software contract. It supplies no personal Dan/Iurie review, broader release readiness, real role/source approval or activation.

The separate Approved [manual incoming Payment-observation contract](release-5-manual-payment-observation-prd.md)
under [#1032](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1032) owns its
bounded payment-evidence family and observation/confirmation/reversal journey,
following [root disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1032#issuecomment-6561911019).
It grants no Invoice v1 expansion or allocation/balance meaning. Canonical merge
and its own fresh runtime gates remain required.

## 1. Authority and selected boundary

[Product Vision §9.4](product-vision-prd.md#94-finance) and [financial architecture §12 / DEC-061–075](consolidated-product-decision-record.md#12-financial-architecture) own the distinction between operational tracking, external fiscal issuance, schedules, Payments and allocations. The [Authorization](tenant-company-client-authorization-prd.md), [Governed Documents](governed-documents-prd.md), [Document Registry](release-1-document-registry-prd.md), [Activity](activity-log-accountability-prd.md) and [UX](ux-localization-configuration-prd.md) owners, [CONTEXT](../../CONTEXT.md), [ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md) and [ADR 0008](../adr/0008-bounded-document-content-storage.md) retain their authority. This first-finance capability specializes their consequences; it does not approve the whole financial release.

| Classification                            | Meaning here                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reused approved direction                 | External issuance remains authoritative; explicit responsible Company and receiving Client Legal Entity; governed exact source; immutable monetary/tax snapshots; independent finance permissions; traceable corrections; no arbitrary paid flag or inferred cross-currency total.                                                   |
| Bounded synthesis selected by disposition | The first eligible Contract mode; a new confidential external-invoice Document family and its Knowledge exclusion; three unassigned captured bundles; copied financial read; source/Record constraints and grammar; duplicate-reference policy; transcription correction and entry withdrawal; two complete runtime frontiers below. |
| Operational evidence not supplied         | Actual issuers, legally authorized people, real assignments, source-system conventions, numbering/reuse, tax status, external correction/credit practice, actual currencies and representative real examples.                                                                                                                        |

The [finance discovery register §24](consolidated-product-decision-record.md#24-internal-discovery-register-for-finance) still gates fiscal, accounting, bank and automated-payment integrations. This manual contract neither answers that register for real Companies nor invents fiscal rules. Ordered independent Standards then Spec preparation and root's actual delegated product disposition are complete for this bounded contract. No personal Dan/Iurie review is implied.

## 2. Problem, outcome and measurable value

An authorized Internal User needs to conserve the external invoice used for a particular Contract, record the values they read, and reconstruct later corrections. A generic Contract PDF or Project attachment cannot safely represent confidential financial evidence. A spreadsheet-like paid checkbox would also confuse external issuance with observed collection.

The complete bounded outcome is: select an exact eligible Contract Version and its recorded receiving party → preserve one external invoice PDF through native Document governance → record its declared references, dates and monetary snapshots → reopen exact history and source bytes → correct a transcription or withdraw a mistaken PRISMA entry without erasing its past.

Value is demonstrated by that complete synthetic public journey, exact byte retention after restart, reconstructable revisions and no unauthorized disclosure. There is no adoption percentage, collection metric, legal verification or live fiscal-system result in software acceptance.

The responsible Company is the provider issuing the invoice through an external process; the receiving party is its named Client Legal Entity. “External invoice” does **not** mean a supplier purchase invoice received by that Company. Procurement/payables are outside this contract.

## 3. User stories and exclusions

1. As an independently authorized recorder, I can deliberately choose a labeled exact eligible Contract Version and see its frozen receiving party before registering evidence.
2. I can register an explicitly confidential external-invoice Document without inventing a Project, Invoice Record or payment.
3. I can upload and conserve a bounded clean PDF, designate its exact formal Version and reopen earlier immutable uploads/Versions under current rights.
4. As a source reader, I can inspect only financial Documents for which I hold both financial-family and ordinary native rights; missing content authority reveals no protected PDF metadata or bytes.
5. As an Invoice Reader, I can list and reopen recorded financial snapshots for the active Company without gaining live Contract, Client or Document access.
6. As a recorder, I can transcribe one exact source's external references, known amounts and dates, with unknown values visibly distinct from zero.
7. I can retry an uncertain command with the same intent/key and recover the same durable outcome without creating a second entry.
8. I can correct a transcription with a reason while preserving every earlier value and the original source/party.
9. I can withdraw a mistaken PRISMA entry with a reason and, when necessary, create its explicitly linked replacement without claiming external cancellation or credit.
10. I can read ordered immutable history and deliberately download the exact selected source when I independently retain native authority.
11. I can distinguish pending, confirmed-but-refresh-failed, validation, denial, unavailable source, stale revision and historical states.
12. As an assignment administrator, I can explicitly grant/revoke only the new scoped bundles; no existing assignment expands.
13. As a user who loses authority or changes context, I cannot publish an old response, resurrect a draft or release old bytes after that operation retires.
14. As an ordinary Project, Contract, Document, Knowledge or Activity reader, I learn no financial existence, title, count, amount or source merely through those grants.

Excluded: invoice generation or authoritative numbering; tax/rate computation; OCR; fiscal/signature/mandate validation; e-Factura/accounting/bank adapters; imports/exports; schedules, instalments, milestones or reminders; Payments, confirmation, allocation, credit/refund or external cancellation; paid/partially-paid, outstanding, collection or overdue indicators; profit/forecast; Project linkage; bulk operations; external users; models/AI; real grants, operational activation or legal approval.

## 4. Exact Contract and receiving-party context

The first source is an ordinary `CONTRACT` whose origin and exact Version provenance are `COMPANY_MODEL_OFFER`, with immutable `APPROVED` decision and `EXECUTED` state backed by the existing [§31 reported-signing declaration](release-3-commercial-31-reported-signing-case-acceptance.md). The execution label remains a human declaration with unverified signature/mandate/concordance, not verified legal effect. A forged execution flag without its native conserved declaration is ineligible.

The exact readable Version may be current or historical. Later Offer expiry/response, Opportunity outcome, model withdrawal or a successor does not rewrite that Version or add a new preservation condition. Do not require a new signing declaration, current model/economic grants, an OPEN Opportunity or a new pricing calculation. Precontracts, Addenda and all other origins/provenances are unsupported by this first capability.

New source registration and new Record/source selection require live native Contract and Opportunity read, original Client read and active original Client–Company relationship/new-use eligibility in the same Workspace/Company. The Contract owner qualifies the exact tuple in the caller transaction and supplies the immutable party snapshot. It exposes a narrow reference seam; Finance/Document controllers do not query private Contract/Access tables or change the existing received-Contract selector's policy.

The named party is the Contract Version's existing recorded recipient discriminator: primary Client Legal Entity or exact additional Legal Entity. Preserve its native identity and copied legal name, tax identifier and address, including nulls. A primary party does not acquire a fabricated additional-entity UUID. No party/name/address/Company/Contract amount supplied by the browser is accepted as this snapshot. Current Client corrections, additional-entity changes and Client unions never retarget it. The source is a declared association with that Contract party, not verification that the PDF actually names it.

## 5. Confidential external-invoice Document family

### 5.1 Registration and immutable relation

Add only Document type `external-invoice`, with fixed `company-confidential` confidentiality. Reusing questionnaire, mission-deliverable or received-Contract types is forbidden. The bounded first Document represents one declared external invoice, with no optional Project association or Task-result/reference use.

Registration uses the existing Document command/key protocol plus exactly the new family and source fields below. The Company and original Client are server-derived from the qualified Contract. No financial Record, amount, external URL or PDF is created by registration; Version 1 starts as an empty draft.

| Field                                              | Rule                                                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                             | Exactly `external-invoice`.                                                                                                                                    |
| `opportunityId`, `contractId`, `contractVersionId` | Required UUIDs identifying the same exact §4 source; never three independently accepted records.                                                               |
| `title`, `purpose`                                 | Existing native Document rules: trimmed nonempty metadata, at most 200/2000 UTF-16 code units respectively; valid Unicode, no NUL, inner whitespace conserved. |
| `sourceDescription`                                | Required trimmed nonempty plain text, at most 2000; the human-declared external source, not verified issuer/legal authority.                                   |
| `receivedOn`                                       | Required nullable real calendar date `YYYY-MM-DD`, year 0001–9999; null means not recorded, with no server/filename fallback.                                  |

Unknown fields fail closed. Persist immutable exact relation, original Client, native receiving-party snapshot, Contract reference/Version number, declared source/date and registering membership/time. Every formal Document Version retains that relation. Ordinary draft metadata correction can change only title/purpose under the native revision rules; it cannot retarget family, source, party, attribution or received date. A wrong association requires a distinct Document. This contract supplies no Document erase/retarget command.

### 5.2 Stored PDF and formal Versions

Reuse ADR 0008's actual 5 MiB body bound, configured fail-closed malware scan, structural parsing, immutable private byte adapter, scan attribution and exact Representation downloads. Scan outside the transaction, then recheck live authority, original-Client eligibility, exact Document revision and Version state before committing. Missing/outage/malformed/infected/encrypted/structurally invalid input refuses without orphan bytes. No new storage/scanner provider or bypass is introduced.

Draft correction appends an immutable upload; official/superseded Versions cannot be overwritten. Designation requires a clean stored PDF, freezes exact content/title/purpose, and atomically supersedes the former official Version. The existing maximum 50 formal Versions and native successor-empty/no-copy rules apply. Every preserved old upload remains selectable only through its exact Document/Version/Representation and current native content authority. Official designation means native content freezing, not a legally valid invoice or verified party/amount.

A successor may preserve a different received file without rewriting earlier bytes. An Invoice Record never follows that successor automatically. The first Record scope freezes one exact source; replacing that selection uses §8's withdrawn-entry replacement, not a hidden update or a claim of external fiscal correction.

### 5.3 All indirect readers and Knowledge

Apply the additional finance/family boundary before Registry list rows, page bounds/cursors/counts, Client Document navigation, detail/history, Version/upload selectors, content, downloads and any existing Document projection. Missing family authority uses the native safe not-found boundary for known resources after ordinary authentication; explicit unauthorized registration is forbidden. Ordinary Contract access reveals no invoice Document, filename, hash or existence.

For independently authorized Document reads, the declared relation/source projection follows the native two-end rule: without live exact Contract/Opportunity read it is explicitly unavailable, with no relation identifiers, Contract reference/Version, copied party or source description/date/attribution. Permitted title/purpose/native Version metadata do not disappear solely because Contract read was lost. Content Reader loss independently removes filename, byte length, checksum, Representation/upload history and bytes.

The new family is **ineligible for Knowledge drafting/admission and evidence retrieval**, even for a holder of all finance, Document and Knowledge grants. Check this explicitly at the Knowledge owner and its native integrity/read boundaries; do not rely on an old three-family decoder accidentally refusing it. Existing Knowledge paths, MCP tools and outputs do not expand. A future financial-source policy requires its own reviewed scope; no automatic admission, projection, model use or bundle expansion follows here.

Project selectors/associations, Task results, shared duplicate-resolution evidence and selected Project PDF bundles cannot consume this family. Generic Activity/Home/search/filter/count/export surfaces have no financial source projection, including for users with their ordinary grants. The native financial Document owner still exposes its authorized history. Existing family data, selection, events and permissions remain unchanged.

## 6. Actors, captured assignments and read disclosure

The scope is one active Workspace and Company resolved by Access, with active Internal User and membership. There is no All Companies view. Client-supplied context is a hint. Add exactly these initially unassigned Company bundles:

| Bundle                                                              | Captured version and exact permissions   | Bounded meaning                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Company Invoice Reader / `company_invoice_reader`                   | `v1`: `finance.read`                     | Read this capability's copied Invoice Records/history and satisfy its financial source-read prerequisite. |
| Company Invoice Recorder / `company_invoice_recorder`               | `v1`: `finance.read`, `finance.manage`   | Reader plus this capability's source-registration/financial mutation prerequisite.                        |
| Company External Invoice Access / `company_external_invoice_access` | `v1`: `document.external_invoice.access` | The additional native Document family gate; no ordinary native or finance permission.                     |

Only existing `company.assignment.manage` administration explicitly grants/revokes them for an active same-Workspace membership/Company, using the existing captured assignment-ID/version lifecycle and bundle-label-only administrative events. Neither Owner/title/membership nor existing permissions, migration, bootstrap, repeat grant or a future bundle definition supplies them. Missing, duplicate/malformed required captures, unknown/null versions and revoked/replaced assignment identities fail closed. Later finance capabilities cannot silently broaden these captured v1 meanings.

| Action                                                          | Current independent requirements                                                                                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read copied Invoice Record/list/history                         | Reader or Recorder capture in the active Company; no implicit live Client/Contract/Document access.                                                                                                                              |
| Any financial Document metadata/history read                    | Reader or Recorder, External Invoice Access, and all existing Document/Client/Company read requirements.                                                                                                                         |
| Register a source / select a new Record source                  | Recorder, External Invoice Access, ordinary Document registration/read where applicable, and §4's exact native Contract/Opportunity/Client new-use authority. Record selection additionally requires native source/content read. |
| Upload / designate / create successor / correct source metadata | Recorder, External Invoice Access and the independent native Version/Approver/metadata/content permissions for that action, including Content Reader + Uploader for upload and post-scan revalidation.                           |
| Download source bytes or reveal protected upload metadata       | Reader or Recorder, External Invoice Access and current native Document/Client/content Reader authority for the exact tuple.                                                                                                     |
| Correct a Record transcription                                  | Recorder plus current independent exact source/content and §4 Contract/Client new-use authority; source and party stay fixed.                                                                                                    |
| Withdraw an entry / read its withdrawal history                 | Recorder / Reader respectively. No new source/party use or native bytes; withdrawal remains possible if live source/Contract access was lost.                                                                                    |
| View live related Contract or Client details                    | Their own current native authority; a copied financial snapshot grants none.                                                                                                                                                     |

**Selected copied-read policy:** a Reader/Recorder explicitly receives the recorded Company label, Contract reference/Version number, original receiving-party copy, external references, amounts, dates, reasons and revision attribution through this capability. This remains readable if the Contract, Client or source is now independently unavailable, archived or superseded. It is an intentional new opt-in financial disclosure, not an expansion of old ordinary grants. It exposes no live related content or newly corrected party values.

Stored exact source/party identities remain immutable internally. Public live source projections are separate from copied financial facts: a permitted native metadata reader can receive its exact Document/Version link; protected Representation/filename/size/hash require native content authority. Otherwise the corresponding projection is unavailable with no protected identifiers or guessed reason. Related live links are similarly withheld when their native read fails. Never serialize an internal stored snapshot/receipt wholesale as a permissive read response.

## 7. Invoice Record facts and fixed input grammar

An `InvoiceRecord` is one Company-owned manual operational record, not the external invoice itself. Its immutable source context contains the exact financial Document/Version/Representation and original byte length/SHA-256, the exact §4 Contract/Version, original Client and recorded receiving-party discriminator/copy. Server-established identifiers/snapshots are not editable browser input. No Project is attached in this first scope.

The entry lifecycle is `RECORDED → WITHDRAWN`. This is PRISMA entry state, not authoritative external issuance/cancellation, debt or collection state. Creation allocates revision 1; a material transcription correction or entry withdrawal adds one revision. Withdrawal is terminal; it neither deletes history nor retracts the Document. There is no reopen command.

Every `values` object has exactly these required keys; nullable fields are explicit, not omitted:

| Field                  | Exact submitted meaning and bound                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `externalSystem`       | Literal nonblank 1–120 UTF-16 code units naming the declared external process/system. It is human input, not a configured or verified provider identity.                 |
| `externalNumber`       | Literal nonblank 1–200, with no generated prefix, renumbering or global uniqueness claim.                                                                                |
| `issuedOn`             | Real `YYYY-MM-DD`, year 0001–9999; a declared source date, not proof that issuance occurred.                                                                             |
| `dueOn`                | Same real calendar date or null. Null means unknown/not recorded, never due immediately.                                                                                 |
| `currency`             | Exactly `MDL`, `EUR`, `RON` or `USD`, an explicit first software support set, all with two minor digits; no inferred Company default.                                    |
| `grossMinor`           | Canonical integer string matching `[1-9][0-9]{0,13}`: positive, at most 14 minor-unit digits.                                                                            |
| `netMinor`, `taxMinor` | Each independently null, `0`, or a canonical string matching `[1-9][0-9]{0,13}`. Null is unknown and never silently converted to zero or derived from the other amounts. |

Literal strings preserve submitted whitespace/case/Unicode without normalization, trimming or translation; reject blank-only values, invalid Unicode, NUL and C0/C1 controls. All objects reject unknown keys. Dates are calendar values, with no UTC/local-midnight conversion, default or inferred payment term. Preserve entered valid dates even if future or due-before-issue; this contract records a declaration rather than enforcing an undocumented external invoicing rule. Show their declared meaning and calculate no overdue state.

Money never enters binary floating point, exponent notation, signed/rounded input or cross-currency arithmetic. Native UI decimal entry maps exactly to supported minor units without rounding; reject more than two fractional digits. Net/tax/gross are independent preserved source declarations: perform no tax-rate calculation, missing-value derivation or fiscal/arithmetic verification. In particular, this bounded transcription does not assert `net + tax = gross`. Preserve a source discrepancy visibly rather than invent or silently repair a value. The immutable PDF remains the original evidence.

There is deliberately no uniqueness rule on external system/number, even within a Company. Identical references can be legitimate external reuse or repeated transcription; the software cannot decide from numbering alone. Creation requires the human declaration in §8, and copied-read displays unverified source identity. No aggregate reports these entries as verified distinct receivables. Exact source deduplication below is a PRISMA constraint, not fiscal numbering law.

## 8. Commands, correction, withdrawal and replacement

All commands use the existing validated `Idempotency-Key` boundary and authenticated active context. The new Record family has one actor-membership/Workspace command namespace across CREATE, CORRECT and WITHDRAW_ENTRY, with Company, action, exact target/source and complete validated intent in its fingerprint. It does not collide with or reinterpret old Document command namespaces.

### 8.1 CREATE

The closed payload is exactly `{ source, values, acknowledgeExternalDeclaration, replacesWithdrawnRecordId }`. `source` is exactly `{ documentId, documentVersionId, representationId }`, all required native UUIDs; `values` is §7. `acknowledgeExternalDeclaration` must be true: the actor declares this exact source represents one externally issued invoice for the fixed party and that references/values are transcribed and unverified. It is not legal validation or approval. `replacesWithdrawnRecordId` is explicitly null for an ordinary creation or the exact same-Company predecessor permitted below.

The native source owner must qualify a clean exact Representation from an `official` or `superseded` Version of the financial family and its immutable §4 context. No draft, empty Version, different upload/Document/party, external URL, mutable latest selection or checksum-equivalent identity is accepted. Do not require head/latest official status; later designation never changes an already captured source.

At most one `RECORDED` entry may name a given financial Document, across its Versions/uploads. Different keys cannot create duplicate active entries for that same Document. For a Document used by an earlier withdrawn entry, creation must explicitly name its latest withdrawn entry as predecessor. A named predecessor must be withdrawn, readable in the same Company, and have no replacement already; one direct replacement is permitted. A replacement can select a newly qualified Document/Version/party if the old source/context was wrong, preserving the earlier record unchanged. If source reuse and the requested replacement would require different predecessors, refuse rather than merge or branch chains. Chains remain explicit, and all identities stay inside the Company/Workspace.

These source/predecessor rules are enforced transactionally and independently in storage; two concurrent creators/replacements cannot win. Reusing an external number on a different source does not conflict merely because the number matches. A replacement means a replacement PRISMA entry, never an external legal credit/correction relationship.

### 8.2 CORRECT and WITHDRAW_ENTRY

On one exact Record, the closed CORRECT payload is exactly `{ action: CORRECT, expectedRevision, values, reason }`; WITHDRAW_ENTRY is exactly `{ action: WITHDRAW_ENTRY, expectedRevision, reason }`. `expectedRevision` is a positive integer at most 2147483647 equal to the currently displayed revision. `reason` is literal nonblank 1–2000 UTF-16 code units with §7's Unicode/control rules. Reject unknown/missing fields and a revision advance beyond that maximum without effects.

CORRECT submits the full §7 values object and changes at least one value. It re-establishes §6's source/Contract authority but cannot change source tuple, Company, original Client, party, Contract, attribution or replacement lineage. A no-op safely refuses without reserving a key or creating history/event. It is a correction of PRISMA transcription only; it does not replace/credit/cancel the external invoice. Wrong source or fixed context requires withdrawal and a new explicit replacement.

WITHDRAW_ENTRY changes only entry state and records its reason/attribution. It is permitted without current native source/Contract access under the separate §6 rule and never grants that access. A withdrawn entry rejects new corrections or withdrawals; exact earlier committed replay is considered before this lifecycle refusal after rechecking its current command authority.

### 8.3 Receipt, replay and failure conservation

A successful command returns one closed receipt: `{ format: EXTERNAL_INVOICE_COMMAND/1, commandId, recordId, revision, action, recordedAt }`. The server allocates UUID command/Record identities, resulting revision and UTC instant; action is exactly CREATE, CORRECT or WITHDRAW_ENTRY. The persisted successful result and returned receipt agree, contain no source bytes/location/credential or copied financial payload, and remain immutable. Detail refresh is separate; its failure never turns a confirmed mutation into an uncertain retry with changed intent.

Exact committed replay rechecks live actor/Company and the original command's relevant §6 authority before returning the same receipt, with no new revision/event or source retarget. Resolve that conserved outcome before applying new-use eligibility/state checks that only guard a new mutation. Do not recreate a source after later designation/Client succession, revalidate source scanning for a committed upload, or silently upgrade a captured assignment. Reusing a committed key for a different action/Company/source/target/value/reason conflicts safely.

Unknown/foreign/unreadable resources use the owning safe not-found boundary after access checks. Malformed input is a safe validation error; stale revision, duplicate active source, wrong source state and conflicting key/intent are conflicts. A current 401/403 retires pending protected work and invokes scoped access recovery. Scan/storage/source outage is unavailable, never an empty success. Refusal, rollback and injected event/response-construction failure commit no partial Record/revision/history/receipt/event or new source reference.

## 9. Reads, history, atomicity and compatibility

Use one feature-owned authorized Company inventory, exact Record detail and bounded ordered revision history. Invent no global search, external-number lookup, total or balance. Inventory sorts by server creation instant then Record UUID descending, page size 25 with one-row lookahead and an opaque continuation bound to Workspace/Company, requesting captured actor and unchanged ordering. History sorts revision descending, page size 25 with lookahead. Invalid/foreign/mismatched cursors refuse safely; do not infer hidden counts. Both RECORDED and WITHDRAWN entries remain listed with their distinct entry labels and no payment-status filter.

Read current entry and its history head under one repeatable snapshot. A history continuation carries that exact observed head revision and cannot splice a concurrent successor into an earlier page; changed head requires deliberate reload. Public readers validate consumed envelopes, revision/order/identity binding and unavailable relation/content projections before publication. Persisted history/receipt formats are closed versioned contracts, not permissive HTTP projections that discard unknown historical facts.

Each immutable revision fact has exactly `{ format: EXTERNAL_INVOICE_REVISION/1, recordId, revision, action, commandId, actor, recordedAt, before, after, reason }`. `actor` has exactly server-established `{ membershipId, displayName }`. A state snapshot has exactly `{ entryState, values }`, using the closed state and §7 values. CREATE has revision 1, null before/reason and RECORDED after; CORRECT has its exact predecessor snapshot, at least one changed value, RECORDED before/after and a reason; WITHDRAW_ENTRY changes only RECORDED to WITHDRAWN with identical values and a reason. Each fact references the same immutable root source/context and its matching command/event; context and replacement lineage cannot be supplied again through a correction fact. Unknown formats/fields or a fabricated before/after chain fail closed, including native direct-write tests.

Create/correction/withdrawal commits current snapshot, append-only revision fact, original actor membership/time, exact before/after values or initial/terminal state, command fingerprint/receipt, typed restricted event and successful response construction in one owning transaction. Freeze server actor display label from the established Actor context with membership attribution; it is a historical label, not a member-directory endpoint or proof of legal authority. Reasons/values/source identity never enter generic event metadata or diagnostics.

Canonical `invoice_record.created`, `invoice_record.transcription.corrected` and `invoice_record.entry.withdrawn` events target the exact Record through Accountability's typed restricted participant with exactly resulting `{ revision }` metadata. Their private owner history supplies the authorized detail. Native financial Document actions retain their native event meanings but use the same restricted-family privacy; no generic Activity/Home/search/count projection is added. Replays, reads, refusals and no-ops emit no new success event. Assignment transitions retain only existing administrative visibility and bundle labels.

Use Access-owned live assignment/context locks and native Contract/Client/Document reference seams within the caller transaction, then deterministic source/Record/predecessor locking; no controller-private queries or independently nested business transaction. Qualify both revocation orderings: a command owning the relevant authority lock may commit before withdrawal; a revocation committed first makes the old capture refuse. Test Company, membership, Internal User, finance/family/native source grants and equal-permission replacement, including scan-to-commit revalidation. Concurrent correction/withdrawal, same/different keys and source/replacement races conserve one lawful result.

Native constraints, scoped foreign keys, immutable data and deferred coupling must reject malformed/null/unknown history/receipt formats, foreign relations, omitted required effects and **fully coupled invented transitions**. An event/receipt alone does not prove intent: reconstruct the permitted before→input→after evolution and source/predecessor constraints. Additive reviewed migrations preserve every populated immediate-predecessor family/Record/permission/receipt/event/byte row and digest; create no real grants or inferred historical invoice. The exact migration frontier is chosen on the actual merged source, not a hard-coded old journal position.

## 10. UI, localization and operation lifetime

Use existing Prisme controls and compatible legacy navigation, with explicit active Company. The first source frontier lives in native Documents with explicit family/source selection and ordinary Version/content controls. The dependent Record frontier adds a feature-owned Invoice Records entry for valid Reader/Recorder captures, a labeled qualified-source selector, complete form, list/detail/history, exact source action and correction/withdrawal/replacement confirmation. Use human Contract reference/Version and party labels; no raw UUID form or pasted source identifier navigation is a substitute for authorized discovery.

Before a new source is registered, show its unverified external-source/party meaning. Record creation additionally requires §8.1's explicit transcription acknowledgement. Distinguish PRISMA entry withdrawal from external cancellation. Display recorded amounts with their currency, explicit unknown net/tax/due date and “collection not tracked” meaning; display no zero balance, paid badge, overdue count or verified invoice claim. Preserve literal source/reference/reason text as untrusted text, never markup/commands. Source PDF opening is deliberate, rechecks the exact native tuple and current authority, bounds MIME/body/hash under the Document owner, and never substitutes latest content.

| State                                 | Required behavior                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing represented authority/context | No protected source/Record request, row, count or guessed reason; fragments confer no grant.                                                                             |
| Loading/empty                         | Accessible scoped pending/empty state; no hidden totals, no duplicate submit or background source download.                                                              |
| Validation/conflict/stale             | Safe localized message; preserve the current owned correctable intent, never raw server payload. Reload deliberately on conflict; do not silently merge changed amounts. |
| Uncertain command result              | Retain the exact immutable body/file/key attempt; block intent replacement and retry that same attempt under its still-current owner.                                    |
| Confirmed command, refresh failure    | Keep confirmation and durable identity distinct; retry the read, not a new mutation.                                                                                     |
| Denied/context retired                | Clear protected draft/result/source/file/continuation, retire old callbacks irreversibly and use scoped recovery.                                                        |
| Related source/Contract unavailable   | Retain independently permitted copied financial facts; withhold the protected related projection and bytes without inferring a cause.                                    |
| Source/provider failure               | No partial file/Record; existing independently readable facts remain honestly labeled, with deliberate retry.                                                            |
| Historical/withdrawn                  | Exact immutable old values/source and entry meaning; no current/latest substitution or implicit reopening.                                                               |

The lifetime consumes identity object/session generation, Workspace/membership/Internal User, Company, exact finance/family assignment IDs/versions and every native authority capture/Client generation used by the active operation. Mode/Record/source selection, unmount, navigation-away and required authority replacement permanently retire old operations, even across A→B→A or equal permission strings. Fence token lookup, scan/HTTP/parser/hash/recovery, focus, Blob creation and click after each await. Abort where possible; revoke object URLs. A stale shared full-Actor recovery result cannot overwrite a newer context. Already downloaded bytes cannot be recalled.

Do not persist source bytes, query, financial values, IDs or reasons in navigation URLs, storage, analytics or diagnostics. Locale/frame-only changes while the owner remains visible preserve correctable input, exact command attempt and source semantics, with zero duplicate I/O. Deliberate departure retires its owner. Localize all interface/accessibility/error/date/number copy in ro/ru/fr/en without translating literal source content or changing money/date meaning. Inspect actual keyboard/focus and desktop/narrow layout; `/ui-baseline` remains unchanged.

## 11. Public acceptance and testing decisions

Documentation verification is formatting and changed authority/link inspection; it executes no runtime or business proof. Each future vertical issue names concrete synthetic fixtures, meaningful behavioral RED/GREEN and the actual required tests before it is marked ready.

### 11.1 First frontier: preserve and reopen the original

1. Through actual App→Nest→PostgreSQL and explicit fictional grants, create a native Company-model Contract with its approved §31 declaration; select its exact party/Version and register a financial Document with no Project/Invoice Record/payment.
2. Upload a synthetic clean PDF through the native scanner fixture boundary, designate its Version, reload/restart and download byte-identical current and deliberately historical uploads/Versions. Test successor-empty behavior and unchanged old-family public journeys.
3. Prove exact Contract/Company/Workspace/party binding, PRIMARY versus ADDITIONAL identity, wrong origin or absent/forged declaration refusal, active original Client new-use fence and no current Client/union retargeting.
4. Exercise every independent new/old capture, Owner/title/ordinary-only denial, metadata versus content versus related Contract redaction, null/unknown/replaced grants, both revocation orders, scan revocation and atomic failed final event/response. Inspect all indirect lists/cursors/counts and family exclusions, not only the direct controller.
5. Prove explicit Knowledge create/admit/read/MCP exclusion even with all grants, no Project/Task/evidence/bundle use and no generic financial source Activity/Home/search/count disclosure. Preserve existing Knowledge outputs and existing supported families.
6. Prove malformed/oversize/unsafe/provider-unavailable input, exact replay/concurrency conservation, native malformed/coupled relation guards, genuinely populated predecessor upgrade, actual admin capture lifecycle and four-locale desktop/narrow browser behavior with held token/scan/recovery/download cases.

This frontier is independently useful evidence preservation, including actual source selection, bytes, history, permissions and UI. A table, enum, migration, role alone or opaque upload endpoint is not its completion.

### 11.2 Dependent frontier: record and correct manual facts

1. Use the delivered source frontier and actual native creation/declaration to complete Record creation → reload/list/detail/history → exact source download → reasoned transcription correction → entry withdrawal → explicit linked replacement, preserving every earlier value and source after restart.
2. Cover all §7 bounds/nulls/Unicode, zero versus unknown, exact minor units and each supported currency. Include equal external references on different sources, a duplicate active source, different source uploads, due-before-issue/future declared dates, mismatched declared net/tax/gross and no fiscal/collection inference.
3. Prove copied-read policy after live Contract/Client/content loss, safe unavailable related projections, source/party immutability, archived/superseded original behavior and separate correction versus withdrawal authority.
4. Prove safe malformed/foreign/stale/no-op/withdrawn/conflicting-key cases; same/different-key races; both revocation orders; source/predecessor replacement races and exactly one active entry; repeatable current/history paging under interleaved correction. Native tests reconstruct fully coupled forged CREATE/CORRECT/WITHDRAW/replacement histories rather than merely omit a row.
5. Prove rollback at final event/response construction, closed persisted receipt/history compatibility, populated immediate-predecessor conservation and no generic Activity/Home/search/filter/count/export leak. Keep confirmed-but-refresh-failed and uncertain attempts distinct.
6. Drive the real App/admin boundary and native HTTP/PostgreSQL, four interface locales and both desktop/narrow projects. Hold token/response/hash/full-Actor recovery through session/Company/member/grant/source changes and A→B→A; old work cannot dispatch, publish, focus or download, while unchanged authorized work remains usable.

Use deterministic public/provider fixtures where appropriate; no fixture establishes a real scanner deployment, legally authorized issuer/person, representative financial corpus, accountant review or production activation. A new family reusing the unchanged scanning adapter preserves its existing provider acceptance rather than claiming a new live-provider result.

### 11.3 Fictional software vectors

These are specified test inputs, not existing runtime fixtures or real financial/pricing evidence. Construct all identities, grants, Contract declarations and Documents through native synthetic seams; use no real Client, person, invoice or legal numbering.

| Vector                                | Concrete input and expected meaning                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original and transcription error      | A synthetic single-page PDF prominently says “Fictional external invoice — not a fiscal document”, external system `Fictional manual process`, reference `SYN-INV-001`, amount `1255.50 MDL`, issue date `2026-01-15`. An initial Record deliberately transcribes `grossMinor: 125500`; a reasoned CORRECT changes it to `125550` against the same exact PDF. No PDF/party/Contract changes. |
| Unknown and zero                      | For the same supported source, null net/tax/due date remain unknown. Explicit `taxMinor: 0` remains known zero. The Record never derives the other fields or a balance from either case.                                                                                                                                                                                                     |
| Declared discrepancy                  | Preserve `netMinor: 100000`, `taxMinor: 10000`, `grossMinor: 125550` and a due date earlier than issue date as transcribed declarations. No fiscal correction, arithmetic-support claim or overdue state is generated.                                                                                                                                                                       |
| Reused number versus duplicate source | A different qualified synthetic Document can use `SYN-INV-001`; a second RECORDED entry on the first Document conflicts. Withdrawal followed by one explicitly linked replacement conserves both histories.                                                                                                                                                                                  |
| Exact identity and bound              | Two immutable Representations with equal bytes/hashes remain different identities; source selection accepts only its exact tuple. Exercise each supported currency, zero/15-digit gross refusal, malformed dates/Unicode/controls and foreign source tuples independently.                                                                                                                   |

## 12. Readiness, dependencies and delivery frontier

The new family, indirect privacy gates, live reference seams, native migration/byte conservation and full browser lifetime proof form a complete first session. Adding Record money/correction/withdrawal/replacement concurrency in the same session would substantially enlarge the integrity and authorization frontier. Select **source preservation first**, then **Record entry and correction** as its dependent complete outcome; neither is a horizontal layer ticket. Create only the first qualified issue, not a backlog of partial financial components.

| Standard readiness gate   | Current assessment and required closure                                                                                                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Observable outcome     | This approved bounded contract defines both full outcomes; first source preservation is selected in isolation. The future runtime issue must verify canonical merge.                                                               |
| 2. Scope                  | One Workspace/responsible Company, original Client and exact native receiving-party discriminator; no Project or All Companies operation.                                                                                          |
| 3. Actors/approvals       | The three explicit unassigned bundles, independent native gates and copied-read policy have the recorded bounded product/security-sensitive disposition; actual people are not assigned.                                           |
| 4. Lifecycle/history      | Native immutable source Versions and separate RECORDED/WITHDRAWN transcription history are specified; no external cancellation/payment state is inferred.                                                                          |
| 5. Sources/providers      | External issuer owns legal truth; native source tuple/scan/storage remains owning. No new provider/configuration is needed for software qualification.                                                                             |
| 6. Examples               | Section 11.3 supplies concrete fictional vectors. Future issues must bind them and the source/authority/negative cases to actual native/browser fixtures. Representative real examples remain operational evidence, not invented.  |
| 7. Exceptional states     | Section 10 and command rules define empty/invalid/denied/unavailable/uncertain/confirmed/stale/historical behavior.                                                                                                                |
| 8. Security/events        | All-family privacy, explicit Knowledge exclusion, native/copy disclosure, restricted canonical events and both revocation orders are specified; ordered independent Standards and Spec preparation passed for this contract.       |
| 9. Dependencies/migration | Merge the disposed contract; recheck actual native owners and populated journal frontier. Reserve all shared Access/Document/Accountability/schema/OpenAPI/App interfaces after #1006 or explicit root handoff.                    |
| 10. Public proof          | Section 11 requires actual App/admin/native HTTP/PostgreSQL and original bytes, not private-helper-only proof. No runtime check was executed by this PRD.                                                                          |
| 11. Fresh-session fit     | First source-preservation outcome is a candidate requiring actual-head readiness. Record commands are a distinct dependent outcome and cannot be marked ready before that source delivery.                                         |
| 12. All blockers closed   | Not established by this document: canonical merge, concrete fixtures/current-head fit and exclusive central ownership require verification in the future issue. No ready runtime issue or completed financial delivery is claimed. |

No first-tenant answer is silently supplied for source systems, legally authorized people, fiscal numbering/taxes, external credit/correction/retention practice, real currencies or representative examples. Those remain explicit operational/integration dependencies under financial discovery. Root selected this bounded manual software contract after the ordered preparation; actual tenant use and any later fiscal/accounting/payment automation retain their separate reviews and evidence.
