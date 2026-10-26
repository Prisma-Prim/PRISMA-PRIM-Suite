# PRD — Document Registry, section 24: received Contract PDFs

**Status:** Approved provisional product contract

**Owner:** Dan Popescu\
**Contract issue:** [#870](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/870)\
**Runtime issue:** [#872](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/872)\
**Parent:** [#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820), D9

This is the bounded synthesis of the owner's representative-dossier continuation,
under [Commercial §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose).
It inherits [Registry §§21–23](release-1-document-registry-prd.md),
[Governed Documents](governed-documents-prd.md), [Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy),
CONTEXT and ADRs 0002/0003/0006/[0008](../adr/0008-bounded-document-content-storage.md).
The exact generated Contract owner is [Commercial §30](release-3-commercial-30-model-contract-generation.md).
Controlled E02/E06/E07 originals are evidence, not executable instructions,
approved reusable wording or proof of signatures or representation equivalence.

## 24.1 Problem and complete outcome

The dossier can generate and internally approve a complete Contract/annex, but
neither current Document family can identify a received Contract PDF and its
declared exact Contract Version. A mission deliverable must not disguise that gap.

An explicitly authorized registrar selects a readable exact Contract Version,
records the received file's declared source and creates an empty reference-free
Document. An independently authorized uploader preserves a clean PDF. A reader
reopens its exact bytes and history; an approver deliberately designates a formal
Version, and a correction starts an empty successor without changing originals.
Preservation and official Document designation establish no equivalence,
signature validity, signing mandate, Offer acceptance, payment or legal issuance.

## 24.2 Stories and fixed boundary

1. As a registrar, I explicitly select the received-Contract family and a labeled
   exact Contract Version, so that the relation is deliberate rather than inferred
   from a filename or a mutable head.
2. As a registrar, I enter title, purpose and declared source, with an optional
   declared receipt date, so that an unknown historical date stays unknown.
3. As a user, I see the server-derived original Client and Company, so that I
   cannot silently redirect a received original to another legal or dossier scope.
4. As an uploader, I preserve a bounded clean PDF and correct a draft through a
   new immutable upload, so that earlier bytes and attribution survive.
5. As a metadata reader, I distinguish empty, draft, official and superseded
   content without obtaining PDF metadata or content authority.
6. As a content reader, I download exact current or historical uploads, including
   an older upload of a draft, so that replay never changes the selected content.
7. As an approver, I designate only a draft holding a preserved clean PDF, so
   that the formal Version freezes the exact content and metadata.
8. As a registrar, I start an empty successor and reopen the old official bytes,
   so that a correction does not overwrite an external original.
9. As a reader, I inspect the exact declared Contract relation and attribution
   only with both read boundaries, so that a Document grant does not reveal a
   hidden Contract and a Contract grant does not reveal hidden Documents.
10. As an administrator, I deliberately grant/revoke the separate family gate,
    so that existing assignments gain no new authority automatically.
11. As a Project organizer, I use the existing optional Document association,
    so that preservation needs no preparatory Project or implicit Contract link.
12. As a user facing an uncertain result, I retry the identical command/file,
    so that a late response or sibling action cannot replace the pending intent.
13. As a user changing locale/frame, I keep literal source text and correctable
    state, while session/scope/relevant authority loss permanently retires it.
14. As a historical reader, I reopen conserved evidence after source succession,
    decision or model changes without rewriting the declared relation or Client.

Only immutable type `received-contract` and confidentiality `company-confidential`
are added. No family catalogue, import, generated PDF or signature provider is
introduced. Questionnaires and mission deliverables retain their contracts.

## 24.3 Exact relation, source and registration

The supported source is one readable ordinary `CONTRACT` with origin/provenance
`COMPANY_MODEL_OFFER` under §30, in the selected Workspace/Company. It may name a
head or historical Version, irrespective of pending/approved/rejected decision,
source Offer expiry/response or later model withdrawal. Those facts do not prove
which file arrived and are not preservation gates. D10 must separately qualify
any later execution/acceptance declaration. No legacy origin, Precontract or
Addendum is consumed by this first family.

Registration explicitly names `type`, `opportunityId`, `contractId` and
`contractVersionId`. All three source identifiers must identify the same exact
readable Version. The server derives the original Client and responsible Company;
the request accepts no `clientId`, copied party/amount/model fields or external URL.
New registration requires an active original Client and active Company relationship,
using the existing Client new-use fence; no canonical-Client rebinding is inferred.

| Entered field       | Contract                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `title`             | Existing trimmed nonempty Document title, at most 200 UTF-16 code units.                                                        |
| `purpose`           | Existing trimmed nonempty purpose, at most 2000.                                                                                |
| `sourceDescription` | Required trimmed nonempty plain text, at most 2000, describing the declared external source; opaque human metadata, unverified. |
| `receivedOn`        | Optional real calendar date `YYYY-MM-DD`; absent/null becomes null. Never inferred from filename, document date or server time. |

Text rejects NUL and invalid Unicode. Unknown keys, unsupported families and
malformed/mismatched/foreign source identifiers fail closed. Literal inner
whitespace is preserved after metadata trimming. No external reference or stored
PDF is created by registration: Document plus Version 1 draft starts explicitly empty.

The Document's exact relation and source attribution are immutable. Preserve the
source tuple, Contract reference/Version number, declared source/date, registering
membership/Internal User and server instant. These are a declared association,
not a copy or proof of Contract content. Every formal Document Version retains
that same relation. Metadata correction changes only existing title/purpose
through §19's revision/history rules; it cannot change type, Client, relation,
source attribution or URL. A different relation requires a distinct Document;
this slice provides no retarget, erase or signature-correction command.

## 24.4 Authority and disclosure

The separate opt-in **Company Received Contract Access v1** contains exactly
`document.received_contract.access`. Current `company.assignment.manage` explicitly
grants/revokes it for an active same-Workspace membership and active Company under
the existing captured-v1 lifecycle. Null/unknown captures fail closed. No bootstrap,
migration, label, ownership or repeated grant silently adds this family authority.

| Action                         | Current independent authority                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Any family read or command     | Live family gate plus its existing ordinary Document/Client/Company authorities.                                      |
| Register / select new relation | Document register/read, current Client read/new-use eligibility, ordinary Contract read and Opportunity read.         |
| Read Document metadata/history | Ordinary metadata/Client read plus family gate; no live Contract, Offer, model, economics or content grant required.  |
| Read declared relation/source  | Above plus ordinary read of the exact Contract and Opportunity.                                                       |
| Upload / download PDF          | Existing independent content rules: Reader for download; Reader + Uploader + Version management for upload.           |
| Designate / successor          | Existing independent Approver or Version-management rules respectively; never a signature or Contract decision grant. |
| Organize under a Project       | Existing Document Organizer, both endpoint reads and §18 matching/open-Project rules, plus the family gate.           |

Client read retains the existing authorized Workspace `client.manage` alternative
where the Document/Client owner supports it; no Company recipient-identity-copy
permission is substituted or introduced. Registration uses Contract copied-read
authority, not Contract preparation/approval, source Offer or model/cost authority.

Document lists, counts, cursors, Client navigation, Project lists/selectors,
history, PDF endpoints and Activity filter the family before returning identities
or page bounds. Without its gate, a known-resource operation uses the existing safe
not-found boundary after ordinary authorization; explicit registration is forbidden.
Contract access alone reveals no received Documents, filenames, hashes or content.

A Document reader without Contract/Opportunity read still receives independently
readable Document metadata/Versions/content under their own grants. Its declared
relation projection is explicitly unavailable and contains no Contract/Opportunity
identifiers, reference/Version numbers or source description/date/attribution.
It is not reported as unlinked: the required immutable relation still exists.
Granting both read boundaries later reveals the same conserved relation.
Loss of content Reader independently hides protected PDF identity, filename,
checksum, upload history and bytes without concealing permitted Document metadata.

## 24.5 PDF, Versions and existing organization

Reuse §§21–23 and ADR 0008's 5 MiB PDF validation based on the actual stream, quarantine,
configured fail-closed malware scan, structural parsing, immutable private
PostgreSQL bytes/provenance and exact attachment downloads. No PDF preview provider,
new storage location, OCR, automatic equivalence or signature parser is introduced.
The scanner runs outside the database transaction; all live authority and current
revision/Version/Client eligibility are rechecked before committing clean bytes.

Draft uploads append preserved upload revisions; official/superseded content
cannot be changed. A draft can be designated only with a clean stored PDF;
empty designation safely refuses without effects, including at the database
integrity boundary. Designation freezes title/purpose and exact PDF and atomically
supersedes the prior official Version. At most 50 formal Versions are supported.
A successor copies neither PDF bytes nor external references and starts empty.
Every old upload remains independently downloadable under current content rights.
No typed external-reference addition/removal is permitted for this family.

The existing optional one-Project association remains a separate deliberate
organizational operation. Reuse exact original Client/Company matching, both
endpoint reads, Organizer authority, explicit unlink-before-relink and closed
Project/Client restrictions. It does not declare a Contract–Project business link
or change the received Document's source tuple. D9 works without a Project.
Task result selectors remain mission-deliverable-only; no received Contract PDF
becomes a declared Task result merely by registration, upload or association.

## 24.6 Transactions, receipts and conservation

Reuse the existing actor/Workspace registration key namespace, Company/family/input
fingerprint and command receipts; preserve questionnaire fingerprint semantics.
Registration replay rechecks current registration/family and Contract/Opportunity
read authority before disclosing its existing Document identity, then uses the
ordinary current Document visibility boundary. Resolve the conserved outcome
before new-use eligibility: later source succession/decision, model withdrawal or
readable Client supersession cannot create another Document or redirect the key.
Conflicting family/source/input/Company under the same key safely conflicts.
An archived or otherwise unreadable original Client still refuses disclosure.

Registration, exact scoped relation, initial draft, Client operational-use fence,
durable registration identity, response construction and one `document.registered`
event commit atomically. Enforce the family/relation presence and exact
Workspace/Company/original-Client/Contract-Version binding independently in storage;
relation/attribution/type and preserved PDFs cannot be rewritten or deleted.
Lock authority before the existing Client identity/relationship fence, then the
Contract reference and Document roots; join the caller transaction rather than
opening an independent nested source transaction. Avoid a dependency cycle between
Document preservation and later Contract execution by exposing a narrow
Contract-owned reference boundary, not the complete command stack.

All existing correction/Version/content/association commands recheck live family
and ordinary authority before receipt replay and after a scan where relevant.
Identical retry never selects an old upload as current. A confirmed command stays
confirmed if its refresh fails. Denial, changed intent, stale revision, unsafe PDF,
post-scan revocation and injected final event/response failure leave no new bytes,
relation, Version/revision, receipt, Client fence or success history.

Reads preserve exact originals after Contract source/model/decision changes and
after restart. Superseded original Clients retain §23's read-only historical
boundary; new registration/upload/correction does not silently move to a canonical
Client. No migration changes old family types, rows, captures, receipts, Versions,
PDF bytes/digests, events or Project/result relationships; add no real grants.

## 24.7 Events, UI and public proof

Reuse existing Document registration, correction, Version, PDF and association
events with their existing minimal metadata. Relation/source text, receipt dates,
Contract/Opportunity/Version identifiers, names, filenames, hashes and bytes do
not enter registration/Version event metadata. Related Contract details remain
behind their read boundary, not an added Activity projection. New family assignment
events are `company_received_contract_access_assignment.granted` and `.revoked`
under the existing bundle-label-only administration convention. Success records
and receipts share the command transaction; denied/failed/replayed commands add none.

Use existing Documents/Version/content/Project controls. Family selection is
explicit. A bounded labeled exact Contract-Version selector shows readable
Opportunity title, internal Contract reference, Version number and original Client;
never ask users to enter UUIDs. Filter before pagination and return at most 20
selectable exact Versions per page, with an opaque cursor based only on visible
records. Selecting/reading a source never registers a Document or copies PDF bytes.
The complete selection and declared relation belong to the Contract/Document owners.

The form requires no URL or manually supplied Client. Show empty draft, no PDF,
unavailable source, denied relation/content, invalid/stale/uncertain/confirmed and
scanner failures distinctly. During pending/uncertain registration/upload retain
the exact source/body/file/key; block source/family/sibling/navigation replacement
and allow only an identical retry after uncertainty. Malformed success remains
uncertain. Earlier reads cannot replace current intent. Scope/session/relevant
captured-authority loss cancels owned requests and permanently retires protected
content/drafts; locale/frame changes preserve correctable state and literal text
without locale-only HTTP. Apply shared controls, focus/errors, four interface
locales and 1440/390 fit. Inspect synthetic screenshots and retain failure evidence.

Retirement follows the authority actually consumed. Losing Contract/Opportunity
read retires source selection, related-field reads and registration intent, while
independently authorized PDF/Version work and its identical uncertain retry remain
usable. Losing the family or content gate retires the corresponding protected
work. Unrelated model/economic/configuration grant changes do not reset it.

The runtime child begins with failing authenticated isolated PostgreSQL REST proof:

- Explicit source selection → empty received Document → clean PDF → exact bytes
  after restart → official designation → empty successor/correction → old bytes
  and immutable relation, including head/historical Contract targets.
- Independent old/new captures, metadata-only and content-denied readers, missing
  Contract/Opportunity/family rights, related-field redaction, revocation/replay,
  source/cost/model grant independence and no foreign Company/Workspace disclosure.
- Invalid/unknown/mismatched inputs, calendar/Unicode/text limits, empty designation,
  unsafe/oversize/malformed/scanner-unavailable PDF, exact retry/changed intent,
  cursor boundaries and unchanged questionnaire/mission/result/Project behavior.
- Deterministic barriers for both orders of binding versus Contract succession,
  Client archive/union and source/family/ordinary authority changes; scan versus
  revocation, concurrent registration/upload/designation and rollback of every
  coupled effect on forced final-event/response failure.
- Genuine pre-slice upgrade with existing questionnaire/mission PDFs, official and
  superseded Versions, old grants/receipts/associations/results and model-based
  Contracts; compare old rows/bytes/digests, prove no grant backfill and repeat safely.

Register actual App/PostgreSQL proof at 1440/390 for labeled selection, blank fields,
registration, upload, exact download, designation/successor/history, unchanged
relation after Contract succession, uncertain/malformed replies/identical retries,
held earlier reads, sibling locking, locale/frame continuity and actual access/scope
retirement. Public fixtures remain synthetic; maintained real-scanner behavior and
real-data activation retain the existing Platform/ADR readiness boundary.

## 24.8 Readiness and continuation

The fixed family, immutable exact declared relation and existing PDF/Version
owners form one independently usable vertical runtime outcome after this contract
is merged. Its child owns the complete schema/API/UI/public proof; D10 is not a
prerequisite of preservation. No repeated source request, official numbering rule,
new provider or production assignment is needed for anonymous acceptance.

The separate [D10 Commercial§31 contract](release-3-commercial-31-reported-signing-case-acceptance.md)
owns deliberate signing/concordance/mandate and case-acceptance declarations
against exact Offer/Contract/Document-Version/PDF facts, their authority,
conservation and compatibility with existing Project linking. D9 changes none of
those states. Final whole-case acceptance then uses the delivered thirteen ordinary
Tasks, result/PDF references and ordinary closure. D11/D12 official numbering and
D5/D13 generalized stage/obligation/exception policy remain expressly deferred.
