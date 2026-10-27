# PRD — Release 3 Commercial Workflow, section 31: Reported signing and case acceptance

Part of the [Commercial Workflow PRD](release-3-commercial-workflow-prd.md).

**Status:** Approved bounded provisional D10 contract by ordered agent product disposition under [#874](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/874), 2026-10-25; not runtime delivery or real-use policy.  
**Authority:** Dan's standing provisional MVP delegation in Commercial §§1/15/19 and ordered representative-dossier continuation under [#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820).  
**Evidence:** Commercial §22/E02/E07, [model-based Contract generation](release-3-commercial-30-model-contract-generation.md), [received Contract PDFs](release-1-document-registry-24-received-contract-pdfs.md), Authorization §8, Activity §§7/25, Governed Documents, Project/Task §§15/23/27/28 and ADRs 0002/0003/0006/0008.

## 31.1 Problem, outcome and authority boundary

The selected case progressed from a transmitted Offer through Client requisites
to a signed Contract; Iurie describes acceptance as confirmed through that
progression and signing. E02 does not establish a separate earlier acceptance,
mandate, verified payment, signature validity or universal legal-effect rule.
Requiring a previously Accepted Offer would recreate the circular gate §30
deliberately avoids for `COMPANY_MODEL_OFFER`.

An independently authorized actor deliberately records one human statement
that both parties signed an exact ordinary Company-model Contract Version,
that a selected preserved PDF corresponds to its exact Contract/Offer content,
and that the named Client accepted that exact Offer in this case. Both parties,
unknown facts, review bases and exact source bytes remain explicit. The valid
stored declaration then qualifies this mode for the existing Project candidate,
link and create-and-link commands. No Project is created by the declaration.

This is reversible provisional product synthesis for a non-official rehearsal,
not a new Iurie answer or approval of operational clauses, prices, mandate,
signatures, numbering, fiscal treatment or actual legal effects. No external
signing, communication, payment, verification service or real assignment occurs.
The PDF may be synthetic in the anonymous rehearsal; its provenance remains
visible. A human statement is preserved as a statement, never certified as true.

Case acceptance belongs to this Contract declaration. It does **not** replace or
write the owning Offer Client Response, create an `Accepted Offer`, rewrite a
`SIMULATED` response/signature or open legacy accepted-Offer conversion. Show
“Case acceptance declared” separately from the Offer's existing response. Later
responses or source changes do not erase an earlier statement or silently
reconcile contradictory evidence. Universal real acceptance/effect policy stays
open under §19.15; this bounded record resolves only D10's rehearsal outcome.

## 31.2 Stories and fixed scope

1. A Company administrator deliberately grants or revokes the separate captured
   declaration capability without expanding any existing assignment.
2. An authorized declarer opens an exact approved Company-model Contract and
   selects a readable preserved received PDF by title, Version and file label.
3. The declarer records both reported signatories, leaves unknown dates unknown,
   and distinguishes an unknown mandate from a declared, unverified basis.
4. The declarer records literal concordance and case-acceptance bases and
   acknowledges the complete fresh Contract warning set.
5. A partial, unsigned, nonmatching or uncertain-about-acceptance case remains
   undeclared; file upload, designation and approval never supply the statement.
6. A Contract reader reopens the immutable statement, its actor/time and exact
   sources; independently unavailable PDF fields are explicitly withheld.
7. An authorized retry returns the original complete outcome after later source
   changes without another event, decision, reference, fence or declaration.
8. An authorized Project linker continues with a matching existing Project,
   including the thirteen-Task pilot, or explicitly uses existing create-and-link.
9. Loss of declaration authority retires its draft without destroying independently
   authorized Contract reads, PDF work or Project-link work.
10. An administrator, reviewer and later agent distinguish declared facts,
    unknown facts, internal approval and unverified external evidence.
11. Existing illustrative signing, Offer responses, Contracts, receipts, Project
    relationships, Task results and ordinary lifecycle retain their contracts.
12. The final whole-case rehearsal later exercises all thirteen ordinary Tasks,
    declared results, exact PDFs and ordinary closure; this slice claims none of
    those results or whole-milestone completion.

Only ordinary `CONTRACT` / origin and provenance `COMPANY_MODEL_OFFER` is added.
Legacy accepted/direct/early preparation, Precontract and Addendum paths remain
unchanged. This mode still refuses legacy simulated-signature and Addendum
commands; they are not an alternative declaration or correction route.

## 31.3 Exact eligibility and frozen content

A new declaration requires the current unsuperseded Contract head, immutable
`APPROVED` decision and `NOT_EXECUTED` state. Its representation checksum must
equal the approved checksum. Recompute §30.6's complete bound quality rule set
under current authority/fences: no ERROR is allowed and acknowledgements equal
the complete current WARNING set, including warnings acknowledged at approval.
Store a fresh immutable run with the declaration. Do not invent another rule set
or relabel historical runs. Reject pending/rejected/superseded/already executed
targets and stale observed revisions. No source/model/economic recalculation or
new internal approval is performed.

The exact source Offer retains §30's new-use conditions: same Workspace, Company,
Opportunity, original Client and fixed named legal entity; current approved,
transmitted, unexpired Version with pending or accepted response; OPEN Opportunity;
active original Client/relationship and available party. Rejection, change request,
supersession, expiry or wrong scope refuses a new declaration. Current model
configuration access/availability is not required: its already approved copy and
stamp remain frozen. Underlying economics and model grants add no authority.

The selected PDF must belong to the same original Client and immutable
`received-contract` relation to this **exact** Contract Version, not merely the
same Contract, resolved Client or legal-entity name. Its exact Document Version
is `official` or `superseded` with the preserved clean PDF representation. A
historical formerly official Version is eligible; a new draft, empty Version,
external URL, questionnaire, mission deliverable, different Contract Version or
different original Client is not. Do not require it to be the Document head or
latest official Version. Later designation/succession does not change frozen
bytes or destroy a conserved statement.

The server derives and freezes scoped identities, original Client/party/source
bindings, Contract/Offer/Document Version numbers, representation id, filename,
media type, byte length, SHA-256 and clean-scan attribution from the existing
owners. No client-supplied Client, issuer, price, file metadata/hash, content,
legal result or execution state is accepted. Neither declared signatory label
retargets the Contract's fixed named Client Legal Entity.

PDF concordance is the human's deliberate statement after comparing the exact
sources. No OCR, signature detection, cryptographic validation, mandate inference
from job title or automatic equivalence is introduced. A disagreement requires
appropriate preparation/preservation before declaring; it cannot be acknowledged
away as a warning or recorded as successful signing through this command.

## 31.4 Public statement and conservation

Use one Contract-owned command for the exact Contract Version. Its closed payload
has these fields; all nested objects also reject unknown fields:

| Field                                                 | Rule                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expectedContractRevision`                            | Required positive safe integer from the displayed Contract.                                                                                                                                                                                                       |
| `documentId`, `documentVersionId`, `representationId` | Required UUIDs from the labeled eligible-PDF selection; the server independently qualifies their exact tuple.                                                                                                                                                     |
| `providerSignatory`, `clientSignatory`                | Each has exactly `label`, `signedOn` and `mandate`. Both parties are recorded together.                                                                                                                                                                           |
| `label`                                               | Required literal, nonblank text, 1–200 UTF-16 code units; a declared and unverified signatory label, not an identity/authority verification.                                                                                                                      |
| `signedOn`                                            | Required nullable calendar date `YYYY-MM-DD`; null means explicitly unknown. A known date has a real year 0001–9999 and cannot exceed the recording instant's UTC date. No default today/receipt/approval date. Historic dates may precede MVP internal approval. |
| `mandate`                                             | Exactly `{kind: UNKNOWN}` or `{kind: DECLARED_UNVERIFIED, basis: text}`. The latter basis is literal nonblank 1–2,000. Neither means a verified mandate; unknown is permitted and remains visible.                                                                |
| `concordanceBasis`                                    | Required literal nonblank 1–2,000: the human's basis for correspondence among this exact PDF, approved Contract and source Offer.                                                                                                                                 |
| `acceptanceBasis`                                     | Required literal nonblank 1–2,000: the human's basis for this case's acceptance of the exact Offer through the reported two-party signing.                                                                                                                        |
| `acknowledgedWarningCodes`                            | Exactly the complete fresh §30.6 warning set, no duplicates or unknown codes.                                                                                                                                                                                     |

Required text rejects NUL and invalid Unicode, counts the submitted string and
preserves its literal value. Do not trim, translate or replace characters in
stored statements/fingerprints. Known dates are calendar values, not instants;
null never becomes a date. Reject malformed dates, partial signatory objects,
unknown variants, undeclared mandate bases and out-of-range/redundant fields.

The command itself deliberately declares both reported signatures, concordance
and case acceptance. It has no partial-success, unsigned, rejected-acceptance,
verification or payment variant. Its server-fixed evidence kind is
`DECLARED_RECEIVED_PDF`, provenance `COMPANY_MODEL_OFFER`, provisional true.
Freeze actor membership/Internal User, server instant, resulting revision,
approved decision/checksum, exact source/PDF facts, fresh run, warnings and all
human fields. No human label/date/basis is prefilled from a model, signature area,
Client function, filename, system date or AI proposal as an established fact.

Commit one immutable declaration, `NOT_EXECUTED` → `EXECUTED` and root revision
plus one, leaving internal approval and all content/representations unchanged.
`EXECUTED` here means the recorded unverified statement in this provisional mode;
it is not a legal-effect or cryptographic state. Case acceptance is server-fixed
`DECLARED` within that evidence. Do not write Offer response/transmission,
Opportunity outcome, Document designation/content, Project state, Tasks or payment.
Allocate no new Contract/Offer/Document reference or Version.

Retain §19.8 conservation: one statement per Version; no overwrite, withdrawal,
hard deletion, second statement or post-execution successor. A failed or uncertain
attempt is not an opportunity to amend a committed statement. Corrective legal
instruments and withdrawal policy for this mode remain separately scoped; legacy
Addendum is still unsupported here. This does not authorize real-use reliance on
incorrect or incomplete facts. Historic decisions, sources and bytes remain
available through their independent read owners.

## 31.5 Independent authority and safe reads

Authorization §8 owns new opt-in **Company Contract Signature Declarer v1**,
containing exactly `commercial.contract.signature.declare_external`. Existing
Company assignment administration explicitly grants/revokes captured v1 for an
active same-Workspace membership and active Company. Old grants, repeated grants,
Workspace ownership, Director status and migration/bootstrap data never confer
it. Null/unknown/revoked captures fail closed. It grants no Company context,
ordinary Contract/Offer/Opportunity/Client/Document/content/Project/Activity read,
preparation, approval, simulated signing or administration.

| Operation                                                          | Independently current prerequisites                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eligible PDF selection; new declaration; committed mutation replay | Active actor/context, new captured Declarer v1, ordinary `commercial.contract.read` and `commercial.contract.signature.record`, exact Offer/Opportunity read, Company Client identity-read authority consumed by §30's current-party check, and existing Document metadata/Client read, Received Contract Access v1 and Content Reader v1 for the exact PDF. |
| Read common declaration facts/history                              | Existing exact Contract/Opportunity/Client read. No Declarer, signature-write, Offer configuration, economics or Document permission is added.                                                                                                                                                                                                               |
| Reveal preserved Document/PDF reference                            | Above plus the independently live exact Document metadata/Client, received-family and content-read boundaries; otherwise an explicit denied projection containing no Document/Version/representation identifiers, filename/hash/size or bytes.                                                                                                               |
| Project candidates/link/create                                     | Existing §19.11 ordinary Contract/Opportunity/Client and Project permissions; the qualifying stored declaration, not live Declarer or Document grants, establishes this mode's execution eligibility.                                                                                                                                                        |

An actor may record against an approval made by another actor. The ordinary
signature permission may come from an existing valid captured Approver v1/v2;
this command grants no model-based approval and requires no such extra permission
when it does not perform approval. Company Client identity-read is the current
recipient owner requirement; Workspace `client.manage` alone must not make the UI
advertise a command that this owner refuses. Other Document-only operations keep
their existing supported alternatives; do not silently narrow them.

The declaration's signatory labels, unknown/declared mandate, dates, literal bases,
actor/instant, quality/decision and copied Contract/Offer provenance are internal
Contract history. PDF/source identifiers remain in their separately gated
projection. Never automatically copy protected file metadata into human prose,
Contract/Offer representations, events or an ungated response. Direct download
uses existing Document content authorization and returns exact conserved bytes.
Loss of PDF access does not conceal otherwise readable declaration facts or turn
a stored declaration into “missing”. Restoring access reveals the same reference.

The eligible selection is exact-Contract-Version scoped, at most 20 visible rows
per page with an opaque bound cursor and no unfiltered total. Apply all current
scope/family/content eligibility before page boundaries/counts/cursors. Labels
show Document title, Version/status and filename, never require typed UUIDs or
reveal another Company/Workspace. Use the existing safe forbidden/not-found
boundaries for authority versus inaccessible known resources. Foreign scope,
same Internal User in another Workspace and hidden association/history/Activity
targets reveal no identity or count. No new global declaration search is added.

## 31.6 Transactions, replay and independent integrity

Contract owns one caller transaction and its existing actor/Workspace/Company
idempotency namespace. Require a key; fingerprint the distinct command kind,
exact Opportunity/Contract/Version, observed revision, selected PDF tuple and all
literal human fields/warnings. Reusing a key for different intent or another
Contract command conflicts. Preserve the original complete declaration result;
do not reconstruct it from mutable current head/source/Project state.

Revalidate all independently current mutation authorities and exact target read
boundaries before inspecting/returning a committed receipt. Resolve a matching
receipt before stale revision, current head/new-source eligibility, new-use
active-original requirements or current quality checks. Thus later source
response/expiry/succession, Client supersession, PDF supersession and Project links
do not erase an authorized conserved outcome. Current authority loss or an
unreadable archived original still denies safely. A replay adds nothing.

For new intent, join the existing Opportunity/Client new-use and identity fences,
Offer source lock, Contract root and Document/Version/PDF reference owners in the
consistent Client → Offer → Contract → Document order. Required Access captures
serialize against revocation/suspension. The Document-owned narrow interface
qualifies/locks the preserved tuple in the caller transaction and projects its
current readability; it exposes no storage rows or bytes to Contract commands.
Use the existing Contract reference-only boundary rather than importing a full
command cycle. No nested independent domain transaction, new storage/scanner,
generic evidence/relation/retry engine or external work is introduced.

If source invalidation, Client archive/union, Contract succession or required
authority loss commits first, a new declaration refuses without effects. If the
declaration commits first, the exact statement is conserved, and subsequent
commands apply their own existing lifecycle rules. Distinct keys/one observed
revision yield one terminal statement and a conflict; identical concurrent keys
converge. PDF designation/succession serializes while preserving eligibility of
an exact formerly official frozen PDF. Wrong tuple/bytes/source can never become
eligible through a race or receipt from another command.

The declaration, fresh run, execution/revision, one operational-use fence,
immutable receipt, minimal event and complete response construction commit or
roll back together. Failures in the final write/event, stored result decoding or
response construction leave no partial evidence/state/fence. No provider call is
retried inside this transaction.

Additive migration preserves every old row, representation/bytes/digest,
SIMULATED response/signature, grant/capture, history, receipt and Project/Task
relationship. No backfill declaration, new authority or execution is assigned.
Independent scoped SQL guards enforce unique statement, exact Contract/Offer/
received-relation/Document-Version/PDF binding, required approved/checksum state,
declaration presence iff this new mode is executed and immutable evidence/source
content. A forged execution flag, missing/wrong-scope relation/PDF, changed
identity/source or overwritten declaration must fail even outside the API.
Preserve old executed illustrative records without imposing new evidence on them.

## 31.7 Existing Project continuation and events

Extend only the new mode's explicit `CONTRACT_EXECUTION_MODE_UNSUPPORTED`
refusal when the exact valid stored declaration and approved executed head exist.
Reuse §19.11's same Company/resolved Client/current readable open Project
candidates, existing link cardinality/capacity, observed revision and immutable
links. Candidate acknowledgement is still the complete current set for
create-and-link, including empty; over-limit candidates still require linking.
Every existing Project/Client/new-use permission/fence and safe refusal remains.

An actor without Declarer or PDF rights may link a properly declared Contract
when independently authorized for that existing command. A pending/approved-only,
empty received file, arbitrary SQL execution flag or malformed stored declaration
never qualifies. New mode reads expose only independently readable linked Projects;
Project detail exposes the Contract only under its ordinary Contract/Opportunity
read. No link/count is revealed through hidden targets.

Declaration and subsequent Project links use the existing root revision history;
the view accounts for all stored links while the public list filters visibility.
Creation receipts retain their original `PENDING` / `NOT_EXECUTED` / null-signature
creation outcome and original shape after declaration or links. Current views
show the new evidence variant; old SIMULATED decoders/records remain unchanged.

For the representative dossier, create/reopen the delivered thirteen-Task pilot
through its existing Template owner, then deliberately select/link that Project.
Never create a second empty Project merely to simulate this link. Existing
create-and-link remains available for its ordinary separate preparatory outcome;
it creates no copied plan/Tasks. Neither route activates/completes a Project,
completes a Task, records a result, creates a stage/obligation or certifies work.

The separately bounded [configured mission continuation](release-1-configurable-mission-plans-prd.md#10-contract-to-configured-mission-continuation)
defines an optional plan-based create-and-link outcome. The empty registration
and pilot-linking routes above retain their existing meaning.

Activity §7 owns one `contract_version.signing_declared` event for the committed
statement, using §25's existing Contract/Version discovery and current target-read
filters.
Its closed stored metadata has exactly `contractId`, `contractVersionId`,
`versionNumber`, `provenance: COMPANY_MODEL_OFFER` and
`evidenceKind: DECLARED_RECEIVED_PDF`. Projection returns §25's minimal Contract
kind/reference/Version and these declared/unverified evidence markers; no
signatory/mandate/basis/date prose, PDF/Document/representation ids, filename/hash/
bytes or payment appears. There is no Offer-accepted event because
its response is unchanged. New capability grant/revoke events are
`company_contract_signature_declarer_assignment.granted` / `.revoked`, with the
existing Company bundle-label-only convention. Exactly one event per actual
transition; none for refusal, rollback, identical replay or unchanged grant state.

## 31.8 Interface and complete public acceptance

Extend the existing Company-model Contract journey, exact Version history and
Project controls. Keep the frozen representation and full original content.
Present an explicitly labeled reported-signing/case-acceptance action only for
eligible current authority/state, labeled bounded PDF choices, blank literal
fields, optional unknown dates and deliberate mandate-unknown/unverified choices.
Keep the named Contract parties and exact source labels visible without inferring
signatory identity/mandate. Explain missing permission, unavailable source,
nonmatching/unsigned evidence and permanent conservation before the deliberate
combined submit. Never show a verification, legal-effect or payment success.

Current/exact history visibly distinguishes internal approval, the declared case
acceptance, the independent Offer Client Response and the independently available
PDF reference. Show unknown dates/mandate and declared/unverified limits after
restart and after PDF read loss. Project candidate/link/create UI retains its
existing behavior and independent eligibility; no UUID entry or parallel router.

Preserve literal text/calendar values, selected tuple and exact uncertain body/key
across locale/frame changes, with no locale-only request or save. Lock sibling
commands consuming the same Contract revision while a declaration is pending;
keep independently authorized read/download work available. A confirmed mutation
stays confirmed if refresh fails, with explicit read recovery. An uncertain or
malformed-success result allows only unchanged explicit retry; a changed intent
gets a deliberate new key. Do not mark success from a partial/mismatched receipt.

Workspace/Company/Opportunity/Contract Version/principal/session/membership and
consumed captured authority loss retires protected drafts, selectors/replies and
keys, aborting owned requests and suppressing held earlier replies. Do not key the
writer on unrelated Mission Access, model/configuration/economics grants, locale
or a changed eligibility revision. Later eligibility change must not destroy an
uncertain exact retry while its receipt-read authority remains live; a known
refusal instead requires explicit reload/new Version/source intent. Source/read,
declaration, PDF and Project command owners retire only for authority they consume.
Losing Declarer or PDF rights must not destroy an independent pending Project link;
losing Project rights must not destroy an independently authorized declaration.

Public acceptance uses existing authenticated isolated PostgreSQL REST and
registered actual App at1440/390, in the current four-locale/classic/Prisme frame:

- New opt-in administration, null/future/revoked captures, independent ordinary
  signature/source/Client/metadata/family/content/Project boundaries and their
  converses; administrator bundle inventory and Activity-label counts remain
  exact, including new entries. No bootstrap/real grant or Clerk setup claim.
- Complete approved-model Offer/Contract source, a preserved exact received PDF,
  fresh checks/whole warnings and deliberately entered two-party declaration;
  unknown and declared facts, restart/exact current/history/PDF bytes, unchanged
  Offer response/representations and immutable statement/creation receipts.
- Every malformed/unknown/text/Unicode/date/limit/mandate/partial-payload refusal;
  pending/rejected/superseded/executed/nonmatching/empty/draft/foreign-source
  cases, fresh-error/warning/checksum refusal and safe read/proof redaction.
- Current source response/expiry/succession, original Client archive/union,
  Contract succession, required grant revocation/suspension and PDF designation/
  succession in **both** deterministic serial orders; identical/distinct keys,
  stale revision, competing statement/Project link and final-write/event/response
  rollback of every coupled effect. No timeout-only race proof.
- Cross-Company and same Internal User/second Workspace list/cursor/history/
  association/Activity confidentiality. Independent SQL missing/wrong binding,
  presence/execution/immutability guards and genuine 0083 upgrade preserving old
  declarations-free Contracts, PDFs, old receipts/grants/responses/signatures,
  links/results; repeat safely, no backfill, explicit fresh grant positive.
- Actual App loading/empty/denied/error/stale/uncertain/malformed/confirmed/reload
  states, identical retry, sibling locking, held old reads, scope/session and
  matching authority retirement, unrelated authority survival, locale/frame and
  literal-value continuity, keyboard/focus and no horizontal overflow.
- Reopen the qualifying declaration and deliberately link the existing thirteen-
  Task Project, with no duplicate Project or Task/result change. Prove the
  existing create-and-link candidate/receipt rules and independent linked-read
  filtering; unsigned/unqualified new mode still refuses. Legacy simulated
  signing, early preparation, Addendum, old Project/Task/Document behavior pass.

Synthetic/provider-boundary fixtures and real PostgreSQL/App execution are
reported distinctly; they prove no actual signature, mandate or real-provider
verification. Applicable review/correction precedes final current-source/current-
base/exact-tree integration verification; no post-green review or routine owner
confirmation is introduced.

## 31.9 Readiness and continuation

This one fixed declaration→existing Project continuation outcome consumes the
delivered §30 and Registry§24 owners and existing public seams. No new business
interview, official numbering rule, external provider or generalized mission
policy is required for the anonymous non-official rehearsal. The product contract
must be approved/merged through #874 before a separate context-free runtime child
is marked ready after all twelve gates, ownership and fresh-context fit checks.

Final whole-case acceptance follows runtime: Request, confirmed economics,
approved generated Offer/Contract, received PDF and deliberate declaration,
existing thirteen ordinary Tasks, exact declared result/PDF Versions and ordinary
Project closure. Qualify the original-Client Activity visibility correction
#853/PR #857 before that Project acceptance. Neither D10 nor an architecture draft
alone completes the dossier. D11/D12 official numbering awaits final policy;
D5/D13 generalized stages/obligations/exceptions remain outside this milestone.

No real data/grants/deployment, operational content approval, legal/fiscal or
cryptographic assurance, signature service, payment accounting, signature/mandate
inference, global Offer response rewrite, received-PDF parser, generalized evidence
engine, new Project plan, automated operational progression or full-MVP credit.
