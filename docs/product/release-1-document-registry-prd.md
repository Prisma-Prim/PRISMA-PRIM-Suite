# PRD — Release 1 Document Registry

**Status:** Partially approved — working references, their correction, Project association and correction history approved in #239, #250, #245 and #369; provisional official Versions in #400; typed references in #401; stored questionnaire PDFs in #633; wider governance remains Draft
**Version:** 1.0
**Owner:** Dan Popescu
**Parent authorities:** Product Vision; Governed Documents PRD; Tenant/Company/Authorization PRD; Activity Log PRD; UX PRD

## 1. Problem statement

Operational evidence is currently easy to confuse with a storage-provider file. The product needs a stable, provider-independent Document identity so users can find the right evidence, understand which Version is official and preserve history even when a file moves, a link changes or a correction is required.

## 2. Release 1 outcome

An authorized Company user registers a Document for a shared Client or Company-owned Project, records its business purpose and confidentiality, creates an initial formal Version, attaches or links at least one Representation, and can identify the current official Version without losing prior history.

## 3. User stories

1. As an authorized user, I want to register a Document independently of its storage location.
2. As a user, I want the responsible Company, related Client and optional Project visible.
3. As a user, I want a clear Document type and business purpose.
4. As a user, I want to upload or link a Representation without treating its provider identifier as the Document identity.
5. As a user, I want to create a formal Version and know whether it is draft or official.
6. As a reviewer, I want exactly one current official Version when the Document type requires one.
7. As a user, I want prior Versions and Representations preserved after a correction.
8. As an authorized user, I want to replace a broken or obsolete Representation without rewriting the formal Version's history.
9. As a user, I want confidentiality and access consequences visible before opening evidence.
10. As a reviewer, I want registration, official-version and correction events attributable.
11. As a user, I want missing, inaccessible or processing Representations explained without making the Document disappear.
12. As an authorized user, I want to archive a Document while retaining its governed history.

## 4. In scope

- provider-independent Document identity;
- responsible Company, Client and optional Project relationship;
- bounded Document type and purpose metadata;
- formal Version identity, status and current-official designation;
- one or more Representations with provider/location metadata;
- confidentiality classification and permission enforcement;
- registration, list and detail UI;
- correction and archive paths that preserve history;
- critical Activity Log events owned by this capability.

## 5. Out of scope

- Google Drive folder automation or bidirectional synchronization;
- document templates and generated deliverables;
- electronic signature workflows;
- OCR, extraction or semantic indexing;
- full-text content search;
- automatic retention purge;
- assurance-specific evidence conclusions;
- treating every Task attachment as a governed Document.

## 6. Domain and lifecycle

A **Document** is the governed business record. A **Version** is a formal revision of that record. A **Representation** is a concrete file, link or rendition of one Version. Storage provider, path and external identifier locate a Representation; they never replace Document or Version identity.

The initial lifecycle distinguishes active and archived Documents, draft and official Versions, and available, processing, inaccessible and superseded Representations. Exact labels and promotion/correction authority are finalized from business evidence.

An official Version is immutable as a formal historical record. A correction creates a new Version or a governed metadata correction event; it does not silently rewrite official content.

## 7. Invariants

1. Document, Client, Project and responsible Company belong to one Workspace.
2. Every Document has one responsible Company.
3. A Project-linked Document uses the Project's responsible Company.
4. Provider location and external identifier are not business identity.
5. Every Representation belongs to exactly one Version.
6. An official Version is not edited in place.
7. Changing a current-official designation preserves the previous designation and actor history.
8. Loss of provider access does not delete the Document record.
9. Archival does not erase Versions, Representations or Activity Log history.

## 8. Permissions

Separate permission to read metadata, open/download a Representation, register a Document, create a Version, promote an official Version, correct metadata, replace Representation metadata and archive. Company scope and confidentiality apply independently: visibility of a Client or Project does not automatically grant access to every Representation.

## 9. UX and failure states

- Client or Project with no governed Documents;
- Document metadata saved but Representation upload/link fails;
- provider link inaccessible or permission revoked;
- Representation still processing;
- duplicate-looking filename with distinct Document identity;
- attempted official promotion with missing required metadata;
- simultaneous official-Version promotion;
- archived Document and historical Versions;
- metadata visible while Representation access is denied;
- safe retry without duplicate Version creation.

## 10. Activity Log

Record Document registration, relationship changes, confidentiality changes, Version creation, official promotion/supersession, governed metadata correction, Representation addition/replacement/inaccessibility and archival/restoration only after the exact owning mutation and authorization rules are approved.

## 11. Testing decisions

- PostgreSQL REST tests for scope, permissions, Version invariants and concurrent promotion;
- provider-adapter contract tests without making a provider the business source of truth;
- browser journey from Client or Project to Document, Version and Representation;
- negative tests for cross-Company access and metadata-versus-content permissions;
- retry/idempotency tests for failed Representation registration.

## 12. Acceptance journey

An authorized Company user opens a Project, registers a representative Document, records its type and confidentiality, and attaches a Representation. The user promotes the Version as official. A corrected file creates a second formal Version; the original remains visible and attributable. A user without confidential-content permission can see only the permitted metadata. If the provider link later fails, the governed Document and its history remain intact with a clear inaccessible state.

## 13. Business evidence at the current audited boundary

The current audited evidence supports these directions:

- received external originals must remain preserved;
- official Documents require visible version history and may not be silently overwritten;
- corrections after officialization require a new governed state/version and attributable history;
- exact-Version approval/signature evidence is important;
- Company separation, selected confidentiality examples, retention concerns and active-case holds are supported as direction.

Still blocking wider governance ticket decomposition (not the bounded working-reference slice in section 17):

- representative Release 1 Document families and purposes;
- per-family responsibility matrix;
- exact confidentiality classes and who may open content;
- per-family draft-to-official authority (section 21 applies one provisional Approver rule to every family);
- exact retention schedule and archive/restoration rules;
- reusable-evidence rules and file-format policy;
- whether Release 1 uses upload, external links or both;
- exact sending/receipt evidence where it matters;
- official numbering lifecycle: when numbers are assigned, what happens to reserved/unused/abandoned numbers, reuse policy and required history.

The P1 official-numbering completion package in the coverage matrix is the current prioritized follow-up for numbering.

Question source: S03. Provenance owner: `docs/product/iurie-business-answer-coverage.md`.

## 14. Technical dependencies

- Company/RBAC, Shared Client and Project/Task capabilities;
- canonical Document/Version/Representation vocabulary;
- storage and malware-scanning boundary for direct uploads, if enabled;
- optimistic concurrency or equivalent for official-Version promotion;
- provider adapter interface and durable external-reference policy.

## 15. Readiness

The working-reference registration slice is approved in section 17, Project association in section 18, bounded working-reference correction in section 19, its read-only correction history in section 20 and provisional official Versions in section 21. Wider registration families, formal content correction, numbering, retention and provider-storage work beyond section 22 remain blocked on their own normalized contracts. Those deferred decisions do not block the approved bounded slices.

## 16. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes numbering, legal/signature behaviour, promotion authority or storage mechanisms by itself. Future implementation issues must cite this PRD after the relevant blocker is normalized here.

## 17. Approved working questionnaire-reference tracer (#239)

Dan authorized this first independent Document slice on 2026-09-19 under the
parallel MVP delivery decision. The following is a bounded product synthesis,
not a claim that Iurie supplied the full future permission matrix.

An authorized Company user registers a working questionnaire for an existing
Client related to the selected Company. Required trimmed title (1–200 characters),
purpose (1–2000) and an external HTTPS URL create distinct, provider-independent
Document, draft Version and Representation identities. The Workspace, responsible
Company, original Client association, creator and creation time are server-established.
The original Client reference remains immutable through Client union/reversal;
existing references remain readable under their original Company relationship.
A new post-union reference atomically advances the Client reversal fence so
reversal cannot silently relocate later operational history.

The fixed **Company Document Registrar v1** bundle grants `document.read`,
`document.register` and `document.reference.read` as separate permissions. Existing
Client Director, Company Context Access and Workspace Owner assignments gain no
Document rights automatically. An administrator with `company.assignment.manage`
explicitly grants or revokes the captured v1 bundle through Company assignment
administration, with attributable grant/revoke history. Current Client-read
authority and an active Client–Company relationship are additionally required.
There is no cross-Company sharing or metadata-only assignment bundle in this
slice; the read seam nevertheless never serializes a URL without the separate
Representation-read permission.

All records are Company-confidential. The Representation is an explicitly
**unverified, mutable external reference**, not preserved bytes, an official
original or accepted evidence. The server accepts HTTPS only, rejects embedded
credentials and does not fetch, proxy, download or verify the external content.
The UI opens the reference explicitly in a separate tab with opener isolation.

Registration atomically creates the three identities and one append-only
`document.registered` event. Its server attribution, responsible Company and
Document target are visible only wherever the Document metadata is visible;
its metadata contains no title, purpose or URL. Exact retries use one stable key
per actor and Workspace and recheck live authority; conflicting input or Company
context returns a conflict without further records or history.

The public surface is authenticated register/list/detail REST and a production
Working Documents page with localized-copy ownership, empty/loading/error/denied
states and reload/reopen support. Tests own proof through real PostgreSQL REST,
the metadata-only Documents read seam, component interactions and desktop/narrow
browser journeys. No schema backfill grants additional permissions.

The existing local filter over already loaded readable Document titles and visible
Client labels uses NFC canonical equivalence, case-insensitive substring matching
and Romanian `ă/â/a`, `î/i`, `ș/ş/s`, `ț/ţ/t` equivalence (#757). It preserves the
literal input and stored/displayed spelling, server row order, exact dossier
identity restrictions and current read/refresh authority. Other letters, including
Russian `й/и` and French `é/e`, remain distinct. Typing or switching interface
locale adds no request or mutation; purpose, content, URLs and identifiers are not
searched. This does not introduce global search or expand any Document access.

Official promotion, signatures, numbering, replacement, archival/retention,
uploads, Google integration, byte preservation, evidence reuse,
generation/OCR/AI and the wider role taxonomy remain deferred. Section 21
later authorizes provisional official Versions. This tracer does
not complete the parent Document Registry capability. Section 18 separately
authorizes only the working Project-association boundary; section 19 authorizes
only in-place correction of this unverified working reference.

## 18. Approved working Project associations (#245)

Dan approved the next bounded MVP progression on 2026-09-19: organize existing
working Documents within preparatory Projects, then add manual preparation Tasks.
This section records the conservative product synthesis delegated by that
approval. It does not attribute an exact relationship or permission matrix to
Iurie. The existing evidence supports Project-specific Documents and finding a
Client's work together (coverage S02-Q07, S02-Q21 and S00-Q11).

### Association and correction

Each working questionnaire Document may be unlinked or linked to one Project;
a Project may have many such Documents. Workspace, responsible Company and exact
stored original Client identity must match at both ends. Linking does not
reinterpret a Client union, rewrite original references, create a Version or
change the draft, confidentiality or unverified external-reference status.
Linking or removal never changes the Project lifecycle (Project/Task PRD section 23). The association is working-material organization,
not accepted evidence, a complete start dossier or operational approval.
Once the Project is completed or cancelled, link and removal are refused and existing associations stay readable.

An explicit link changes unlinked to linked; an explicit removal changes linked
to unlinked. Reassignment requires those two deliberate actions. Removing a link
preserves the Document, Version, Representation and prior relationship history.
Many-Project reuse, content corrections and deletion remain outside this slice.

### Authority and historical Clients

Association reads require active Company context, Project read, Document metadata
read and the existing original Client/read relationship boundary. The separate
Representation-read permission is still required before returning or opening a
URL. Project visibility alone grants neither Document metadata nor content.

The new opt-in Company Document Project Organizer v1 bundle grants only
`document.project.manage`. The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns its captured assignment and administration rules. Linking and removal require
this permission in addition to both records' read authority; they never expand
the captured permissions of an existing assignment.

Every new association mutation requires the exact original Client to be active
and still related to the Company. Existing links involving a superseded original
Client remain readable but cannot be linked or removed by this first slice.
The UI explains that refusal without exposing canonical union details. A future
contract may extend correction of these historical records; this slice does not
silently apply new writes to a canonical Client.

### Concurrency, retries and history

Each Document association has a monotonically increasing revision starting at
zero. Commands carry an expected revision; stale revisions and linking a Document
that is already linked conflict without overwrite. Company, actor and time are
server-established. A stable command key is scoped to actor and Workspace;
reusing it with a different Company, Document, action, Project or expected revision
conflicts. An identical replay rechecks current authority and confirms the recorded
outcome without another event or fence advance. A later association state is
refreshed separately and must not be misrepresented by replayed success.

Every successful new link or removal atomically advances the original Client's
existing operational-use/reversal fence, updates the association and stores one
append-only relationship event and command outcome. Failed commands roll back all
four effects. The Client-owned lock ordering and active-relationship validation
remain authoritative. Existing union/reversal behavior is otherwise unchanged.

History retains the original Document and Project identifiers, actor and server
time. The [Activity Log PRD](activity-log-accountability-prd.md#7-authorization-and-privacy)
owns its read projection: both endpoints must remain readable and no title,
purpose or URL belongs in the event metadata. Document-only readers receive no
Project identity or relationship-history disclosure.

### User journey and proof

Project detail shows only authorized linked Documents. An explicitly opened
selector offers eligible existing working Documents for that exact original
Client and Company. An authorized user links one, reloads the Project, opens its
existing reference if separately permitted, and can remove an accidental link.
Empty, denied, loading, conflict and recoverable-failure states remain distinct.
An uncertain result retains the unchanged command for explicit retry; changing
Project, Company or actor authority invalidates pending UI work and late replies.

Public PostgreSQL REST tests prove both-end authorization, immutable identities,
revision/idempotency behavior, atomic history and the Client reversal fence.
Component and desktop/narrow browser tests prove the attach/reload/open/remove
journey. No external provider integration or new verification harness is needed.

Section 23 extends this same association contract to its opt-in mission-deliverable
family, without changing endpoint authority, original Client identity or lifecycle effects.

## 19. Approved unverified working-reference correction (#250)

Dan approved this bounded MVP correction on 2026-09-19. An explicitly authorized
Company user may correct the trimmed title, purpose and credential-free external
HTTPS URL of the unverified working questionnaire introduced in section 17.
Correction updates that working record in place while preserving its Document,
draft Version and Representation identifiers, original Client, creator, creation
time and optional Project association. It neither creates a formal Version nor
approves, verifies, replaces, archives or officializes content.

`workingRevision` starts at one and is separate from Version identity and the
Project-association revision. A command supplies the expected revision and at
least one allowed field. A material change increments the revision once; a stale
or competing intent conflicts without overwrite. A normalized no-op records an
`unchanged` receipt at the same revision without an Activity Log event or Client
fence advance. Exact actor-and-Workspace-scoped retries recheck live authority and
visibility and return their durable receipt; changed reuse of a key conflicts.

The existing Company Document Registrar v1 remains unchanged. A fresh explicitly
granted **Company Document Registrar v2** contains v1 plus `document.correct`.
Correction requires the v2 assignment, Document metadata and Representation read,
the active Company context and the existing Client-read prerequisite. Existing v1
assignments do not expand automatically; unknown or null versions fail closed.
The stored original Client and its Company relationship must remain active for a
new correction. A superseded original stays readable but correction read-only;
writes never follow a canonical Client created by a union.

Field changes, the revision, an append-only internal before/after command ledger,
one `document.corrected` event and one material Client operational-use fence
advance commit or roll back together. The Activity Log event exposes actor, server
time, Company and Document target with empty metadata; title, purpose, URL,
Project identity and before/after values remain absent. Section 20 owns the
read-only before/after history of these corrections.

The Document detail UI provides Edit, Cancel and Save only with current correction
authority and Representation read. It preserves the exact body and idempotency key
for an explicit retry after an uncertain result, requires reload after conflict,
and invalidates drafts and late responses when Company, session, membership or
permission context changes. Uploads, URL fetching, storage integration, new
Versions or Representations, Client reassignment, Project mutation, official
governance and deletion remain outside this slice. Section 21 restricts this
correction to the current draft Version.

## 20. Approved working-reference correction history (#369)

Under Dan's 24 September 2026 delegation to implement sourced business
functions and reversible MVP choices, this section exposes the existing
section 19 ledger as a bounded read. Stories 8 and 10 and sections 7, 8 and 19
already require attributable retained corrections. This is a delegated product choice,
not newly collected Iurie evidence or official Document governance.

A current reader of the working Document's metadata may read its material
before/after correction history. Each entry shows the working revision it
produced, the server time, the actor's existing display label (never an email)
and only the fields it materially changed. Prior title and purpose share the
current metadata visibility. A prior URL requires current Representation read;
without it the URL change, its key and both values are omitted, so a URL-only
correction remains a generic attributed entry. Historical URLs are inert plain
text: they are never fetched, opened or linked. Unchanged retry receipts are
excluded.

The read uses the detail read's existing Workspace, active Company, Document read
and original Client relationship boundary, with its exact refusals and without
counts or hidden values. A superseded original Client stays readable as for the
detail. No correction or Activity Log read permission is required, and no
permission, bundle or implicit grant is added. Authority is rechecked for every
page, in one read snapshot with the page itself.

Pages hold at most 20 entries, newest revision first. An older page continues
strictly below the last returned revision, so later corrections neither
duplicate nor displace it, and there is no total count. Reading writes nothing:
no ledger row, receipt, revision, event or Client fence change.

Historical values remain history even when later corrected and are never
presented as the current reference. The Document detail offers the history
collapsed; losing access, or Representation read, removes the rows or prior URLs
already shown. This creates no official Version, legal validity, restore or
export, and it changes neither the ledger nor the empty public metadata of
`document.corrected`.

## 21. Approved provisional official Document Versions (#400)

Under Dan's 24 September 2026 delegation of reversible provisional MVP choices inside a vertical implementation, this section normalizes the content-status dimension of formal Versions for every registered Document, initially the working questionnaires of section 17. Section 23 extends these Version semantics to its PDF-only family, with the explicit reference-free draft and stored-PDF designation rules stated there. It applies Iurie's confirmed rules:

- an approved official Document is never modified silently;
- current and previous Versions stay visible, with who approved them and when (coverage S03-Q04 and S03-Q06);
- issuing an official Document requires Iurie's approval (#81 sessions 1 and 24, items 705–706).

The mechanism, bounds and permission names are delegated provisional choices, not newly collected Iurie evidence. Iurie validates or corrects them against a demonstration.

**Versions.** Each Document has Versions numbered from 1, at most 50. Each has a content status of `draft`, `official` or `superseded`. The Version created at registration is Version 1 `draft`. A Document has at most one draft and at most one official Version, and may have no official Version.

Content status is one dimension only. Approval rationale, transmission, receipt, signature, archive and numbering remain separate facts (decision record §10.3, DEC-129), and `official` implies none of them.

**Designation.** A holder of Company Document Approver v1 (authorization PRD §8) who also has Document metadata and Representation read designates the current draft as official. One transaction:

- makes the draft `official`, recording the actor and server time;
- freezes its references and their forms, and the Document's title and purpose at that moment, with the Version;
- makes the previously official Version, if any, `superseded`, recording the superseding Version.

A designated Version is never corrected in place. A superseded Version stays readable with its references, designation and supersession.

First-tenant configuration grants Approver v1 only to Iurie's membership in each Company. This is an assignment, not a product role or hard-coded identity. Because the per-family responsibility matrix is incomplete (S03-Q02 Partial), no family-specific rule exists. A member holding both bundles may designate a Version they prepared; both acts stay attributed.

Designation freezes only what the system records: reference values and metadata. It does not store, fetch or verify external content, which may still change at its source. It does not make the Version an Approved Document for knowledge indexing.

**New draft.** When an official Version exists and no draft does, a holder of Company Document Registrar v3 starts the next Version as `draft`, copying its references as the References paragraph states.

The section 19 working correction now applies only to the current draft: title and purpose on the Document, and the URL of the draft's primary reference. While no draft exists, the Document is correction read-only.

**References (#401).** Every Version holds typed, credential-free HTTPS external references. Each has a form: `editable`, `rendered`, `signed` or `other`. They remain unverified external references under section 17, and a received original is never replaced by a working copy (coverage S03-Q08). A holder of Company Document Registrar v3 may:

- on the draft, add references (at most 5 current) and remove any reference except the last one. A removal is retained internally and attributed, but hidden from the Version;
- on the current official Version, only append references (at most 10 in total), for example a signed scan of that exact Version (DEC-133; Governed Documents invariant 3). An appended reference can never be removed.

Superseded Versions accept nothing. A new draft copies the references the official Version held when it was designated; references appended afterwards stay with their own Version. The primary reference of a Version is its lowest-positioned current reference. Existing references become form `other` at position 1.

A `signed` form is a label on a reference, not signature evidence: it proves no signatory, time or validity (DEC-136).

**Guarantees.** Every Version command and every section 19 correction share the Document's working revision as one concurrency token. Each committed command:

- requires the expected revision and increments it exactly once;
- commits, together, the Version change, one durable receipt, one Activity Log event and the original Client operational-use fence advance.

Among concurrent commands on one observed revision, at most one commits; the others conflict. Exact retries, scoped to the actor and Workspace, revalidate current authority and return the recorded result.

Every command requires the original Client and its Company relationship to remain active. A superseded original stays readable and read-only, as in section 19. Reading Versions follows the Document detail read boundary, and URLs require Representation read.

**Events.** The events are `document.version.drafted`, `document.version.designated_official` (with the superseded Version number), `document.representation.added` and `document.representation.removed`, projected as Activity Log PRD section 7 states.

**Provisional choices for Iurie's validation:**

- Approver v1 is held only by Iurie;
- at most 50 Versions;
- a new draft copies the references held at designation, not later appends;
- Registrar v3 holders append to official Versions;
- at most 5 draft references and 10 official references;
- no reason or note on designation;
- no discarding of a draft;
- no review or rejection state.

Excluded, and not presented as business fact:

- uploads, bytes, checksums and provider storage (DEC-181);
- fetching or verifying external content;
- Document families and per-family approvers (S03-Q01, S03-Q02);
- an "in review" state, rejection and approval notes;
- official numbering;
- transmission, receipt and signature evidence, and e-signature (DEC-136);
- templates and generation;
- archive, restore and deletion;
- discarding a draft;
- changing a reference's form or position in place, removing an appended reference, and appending to a superseded Version;
- Evidence Links and knowledge indexing;
- Offer and Contract Documents, which reuse this model only through their own capability sections.

## 22. Approved provisional stored questionnaire PDFs (#633)

Dan explicitly approved this bounded MVP scope on 2026-10-16 in
[#60](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/60#issuecomment-6218569852):
Company-confidential questionnaire PDFs, upload and download, preservation of
all official Versions, corrections by successor Version, no deletion, and
explicit content rights distinct from metadata without automatic expansion of
existing assignments. His answer was “Oui, valider ce périmètre provisoire”.
This is Dan's provisional product approval, not Iurie evidence or approval of
other Document families, retention, real assignments or operational use.

### Stored content and Version meaning

A registered working questionnaire may hold preserved PDF Representations for
its Versions, independently of its existing unverified external references.
An authorized uploader adds or replaces the current PDF only while the Version
is draft. Every upload appends a new immutable Representation; no previous bytes
are overwritten or removed. The newest explicitly successful upload is the
current draft PDF. Each PDF is bounded to 5 MiB.

Dan explicitly confirmed draft correction on 2026-10-16 in
[#633](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/633#issuecomment-6219349016):
“Oui, permettre la correction du brouillon”. This supersedes the implementing
agent's proposed single-file slot; it does not require officializing a mistaken
working file merely to correct it. Prior uploads remain reopenable with their
exact Representation identity, actor, server time and Document revision, under
the same independent content-read permission. History is newest first, at most
20 entries per page, with explicit continuation until all prior uploads are
reachable. No total upload cap is introduced by the page size.
The system records provider-independent Representation identity, exact bytes,
SHA-256, media type, size, safe filename, clean-scan result, actor and server time.

Designation freezes the current PDF held by that Version with its existing reference
and metadata snapshot. Neither official nor superseded Versions accept content
replacement, removal or a new upload. Starting a successor draft copies only
the existing eligible external references under section 21; it copies no stored
PDF. A corrected PDF is uploaded to that new draft, preserving every predecessor.
This slice introduces no removal, deletion, archive, purge, discard or retention
schedule. The existing URL correction and typed-reference rules stay unchanged.
Stored bytes are preserved content; scanning does not make them signed, sent,
accepted, approved for knowledge indexing or verified business evidence.

### Independent content authority

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns separate opt-in Company Document Content Reader v1 and Company Document
Content Uploader v1 assignments. A download requires current metadata-read and
content-read authority, selected Company context and the original Client read
boundary. An upload additionally requires current content-upload and existing
Version-management authority. The original Client and its Company relationship
must still be active for a new upload. A superseded original stays readable.
Existing Registrar, Approver, Company Context Access, Workspace Owner and
reference-read assignments gain no content rights automatically.

A metadata-only reader may see that a Version has stored PDF content, but
receives no filename, checksum, bytes or download capability. Content metadata
and every download recheck live content authority. Client or Project visibility
and an external reference URL never authorize stored bytes. New grants and
revocation use the existing explicit Company assignment administration; no
migration grants authority or changes the first-tenant Approver configuration.

### Upload safety and atomicity

Treat filenames, declared types and bytes as untrusted. Bound the actual stream,
validate PDF type/signature, and quarantine bytes until a real configured malware
scanner reports clean. Record its identity and result. Missing configuration,
scanner outage, malformed or unsupported scanner result, infection, invalid type
or excess size publishes no content. Do not equate a PDF header or successful
transport with a clean scan. There is no inline preview, OCR or execution.

Scan outside the short database transaction. Before committing, revalidate live
authority and target state under the same Document working-revision and original
Client lock order as existing Version commands. Upload uses the existing
`representation_added` command semantic with form `other` and no post-designation
append. Its immutable bytes/metadata, revision increment, durable receipt,
`document.representation.added` event and Client operational-use fence advance
commit or roll back together. Event metadata remains Version/form facts only;
filename, checksum, bytes and provider location never enter it.

An exact actor/Workspace-scoped replay rechecks live authority and confirms the
recorded receipt without another scan, upload, event or fence advance. Replaying
a prior upload never restores it as current or rewrites a later successful upload. Different
input or Company under the same key conflicts. A stale revision or a concurrent designation refuses the new upload without overwrite.
No mutation follows a Client union to a different canonical Client.

### Download, storage and failure recovery

Download addresses the current PDF of an exact Document Version, or an exact
preserved Representation from its upload history, through the authenticated
application boundary. Return byte-identical PDF as an attachment with a safe
filename, `nosniff` and private/no-store caching; expose no public file URL,
filesystem path or provider credential. The UI displays the exact Version and
keeps absent, loading, denied, validation, stale, uncertain and unavailable states
distinct. An uncertain upload preserves its exact file, payload identity and key
for explicit retry; a conflict requires reload. Authority/context changes retire
pending UI work and suppress late replies. A later refresh failure never changes
confirmed upload success into uncertainty.

[ADR 0008](../adr/0008-bounded-document-content-storage.md) owns the initial private
PostgreSQL byte-storage adapter and fail-closed scanner boundary. Provider
independence and future external adapters remain intact. API container storage
is not durable content storage. Metadata and history survive storage failure;
the UI reports safe unavailability rather than inventing absence or success.
Production still requires configured scanning, protected transport/storage and
recovery evidence under the Platform PRD; no real-data deployment is authorized
by this implementation.

### Acceptance proof and provisional choices

Public PostgreSQL REST tests prove independent grants, exact bytes, revocation,
cross-scope refusal, clean/malformed/infected/unavailable scanning, exact retries,
concurrent upload/designation and official-successor preservation. Scanner
adapter tests own its real external protocol; disposable real ClamAV proof uses
synthetic clean PDF and EICAR content. Component and desktop/narrow browser
journeys prove upload, unchanged retry, reload, download and authority loss.

Iurie may validate or replace the provisional questionnaire family and size
bound through a later focused contract. Section 23 separately authorizes one
mission-deliverable family using these same stored-content guarantees. Other families,
formats, provider sync, general malware operations, sending, signature, evidence
reuse, indexing, retention and deletion remain deferred. The substitution register
indexes the provisional storage scope without recording an Iurie decision.

## 23. Approved bounded mission-deliverable PDFs (#825)

**Authority and status:** Dan requested D3 → D4 → D2 on 2026-10-23 after the
source-backed #820 recommendation and D1 delivery. This is the approved bounded
D3 product synthesis for that request, not new Iurie evidence, a general family
catalogue or approval of a real operational document. Sections 18, 20–22,
[Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy)
and [ADR 0008](../adr/0008-bounded-document-content-storage.md) retain their owners.
Runtime delivery requires a separate implementation issue after this contract is
merged. D2 and D4 do not block D3.

### Outcome, actors and stories

A collaborator preserves one Company-confidential **mission-deliverable** Document
with its own exact stored PDF Versions, can organize it under an existing Project
and can reopen what was preserved. This supplies a usable mission output without
inventing a URL or claiming that upload means completion, external delivery,
acceptance, certification or verified evidence.

1. As a registrar, I select the mission-deliverable family and original Client,
   enter its title/purpose and create a clearly empty draft without an external URL.
2. As a metadata reader, I distinguish that family and draft/official/superseded
   content states without acquiring stored-content authority.
3. As an uploader, I upload a clean bounded PDF and explicitly correct a draft
   by another preserved upload without overwriting earlier bytes.
4. As a content reader, I download exact current or historical bytes, including
   a previous upload of a draft, with its original attribution.
5. As an approver, I designate a draft only after it holds a clean stored PDF,
   freezing its metadata and content under the existing official-Version rules.
6. As a registrar, I start a successor draft without copying predecessor PDF
   bytes and preserve the prior official Version while preparing its correction.
7. As a Project organizer, I link/remove the Document using the existing exact
   original Client/Company and open-Project association contract.
8. As a Project reader, I see only independently readable mission Documents;
   Project visibility alone reveals neither their metadata nor their bytes.
9. As an administrator, I explicitly grant/revoke the new captured family gate
   independently from ordinary metadata, content, organization and approval rights.
10. As an actor facing a lost response, I retry the unchanged command safely;
    a saved outcome remains saved even if a later refresh fails.
11. As a historical reader, I reopen readable Versions after original Client
    supersession without silently redirecting a write to the canonical Client.
12. As a reviewer, I reconstruct actor/time, correction and supersession through
    existing bounded history without learning hidden content or Project facts.

### Family, registration and representation

The new immutable type is `mission-deliverable`; existing Documents remain
`questionnaire`. Both remain `company-confidential`. Type is server-validated and
never changed by correction. Unsupported types fail closed. Preserve existing
questionnaire registration payloads, receipts, required HTTPS references and
Version behavior.

Mission registration requires the existing title (trimmed 1–200), purpose
(trimmed 1–2000), exact active original Client and active Company relationship.
It explicitly selects the new family, accepts no external URL, and creates a
Document and Version 1 draft with no external Representation or stored PDF.
Do not synthesize a placeholder URL or conflate a missing PDF with a failed read.
The server establishes Workspace, Company, creator, time and original Client.
Registration, one `document.registered` event and the original Client operational-use
fence commit together; an exact authorized replay returns its existing outcome.
Different family/input/Company under that actor/Workspace key conflicts without
new records, history or fence advances. Retain questionnaire fingerprint semantics.

A mission draft permits title/purpose correction through the existing correction
revision, no-op, receipt and before/after history contract. It permits no external
URL correction, typed-reference addition or removal. These operations remain
available to questionnaires exactly as before. Read models constructively
represent a reference-free mission Version; no fabricated Representation identity
or nullable-field combination may mislabel it as an external reference.

### Stored content and formal Versions

Reuse section 22's 5 MiB PDF limit, actual-stream validation, quarantine,
fail-closed configured scan, structural parsing, immutable bytes/provenance,
private adapter, content metadata minimization, upload history and exact attachment
downloads. A mission upload is an ordinary stored-content Version command, never
an implicit official designation. The absence of external references does not
prevent uploading, reading or listing a mission Version.

Version status remains `draft → official → superseded`, at most 50 Versions.
A mission draft can become official only when it has a successfully preserved
clean PDF. A new designation freezes the current PDF and title/purpose and
supersedes the prior official Version atomically. Empty draft designation is a
named safe refusal with no revision, receipt, status, event or Client-fence effect.
The database integrity boundary also prevents a mission official Version without
its stored clean PDF. Existing questionnaire designation semantics are unchanged.

A successor draft copies no stored PDF and no external references for this family.
It is explicitly empty until upload; the preceding official and all superseded
Versions and their exact uploads stay readable. No Version, upload or bytes are
discarded, replaced in place or removed. Metadata correction requires an active
original Client and current draft; historical superseded Clients remain read-only.
Official designation is not transmission, signature, Client acceptance, an
Approved Document for indexing or a declaration that a Task was completed.

### Authority and association

The independent opt-in **Company Mission Deliverable Access v1** contains exactly
`document.mission_deliverable.access`. Authorization §8 owns captured-version,
live-check and administration semantics. It is required for every mission-family
metadata/content/history/Activity/association read and every command, in addition
to the already required authorities. It grants none of those ordinary rights.

Registration needs existing Document register/read and original Client authority.
Correction and Version management retain their distinct permissions. Upload keeps
content Reader + Uploader + Version-management requirements; download keeps
metadata + content Reader. Designation retains Document metadata/reference read
and the existing separate Approver permission; no per-family approver matrix or
first-tenant assignment is inferred. The family gate never substitutes for
Project read or the separate Project Organizer permission.

Lists, counts, dated pages, Client navigation, Project-linked lists/selectors and
Activity projections filter unauthorized mission records before pagination and
returning labels or identities. Known-resource reads/commands without the family
gate use the existing safe not-found boundary after ordinary read authorization;
explicit mission registration without the gate is forbidden. Loss of the family
gate retires pending UI work and denies subsequent reads/replays; loss of content
Reader hides content metadata/history/downloads without concealing otherwise
readable Document metadata. Existing assignments, roles and migration rows gain
no new family authority. No migration or bootstrap grants the opt-in.

Reuse section 18's optional one-Project association, exact original Client,
Company/Workspace matching, independent two-end read authority, Organizer grant,
association revision, explicit unlink-before-relink, receipts and immutable history.
Existing links survive Project closure and original Client supersession as readable
history; new link/removal remains refused. Project progress and Task states do not
change. A mission can be registered/uploaded independently of a Project; linking
is a separate deliberate command, not a side effect of registration or upload.

### Transactions, UI and public proof

Reuse existing Version revision/key/fingerprint/receipt and Client lock ordering.
Every new content/Version/correction/association command rechecks live family
and ordinary authority before receipt replay and at the owning write boundary.
Recheck after scanning before any byte commit. Revocation racing a scan, stale
revision, concurrent designation or invalidated original Client cannot publish
bytes, increment revisions/fences or append misleading success history. Preserve
existing exact-replay meaning: replay never selects old content as current or
rewrites a later state. Never hold the database transaction open during scanning.

Use the existing Documents workspace, Version/content controls and Project
Document association UI. Family selection is explicit and localized; the mission
form has no required URL. Show empty draft, absent PDF, denied content, unavailable
content, loading, malformed upload, stale conflict and uncertain command distinctly.
Uncertain upload preserves its exact file/body/key for explicit retry. Context,
actor or relevant authority changes retire pending work and late replies. A
confirmed command followed by refresh failure stays confirmed. A visible current
Version and older selectable Versions remain unambiguous at desktop and narrow widths.

First prove a failing public PostgreSQL REST registration/upload/official-successor
journey, then make it pass with original questionnaire regressions. Cover unknown
types, family/Company/Workspace refusal, metadata-only readers, family revocation,
post-scan revocation, original Client union/archive, exact replay, changed keys,
concurrent upload/designation and injected rollback. Prove migration from existing
questionnaire rows without backfill grants or changed identity/history; reject
family mutation and empty mission designation at the integrity boundary. Inspect
all affected metadata/history/Activity/list/association routes for the same family
leak pattern. Register an actual App/PostgreSQL desktop1440/narrow390 journey that
creates without URL, uploads, links/reloads, downloads byte-identical content,
designates, starts a successor and reopens prior bytes under negative permissions.

### Deliberately deferred

Task result links (D4), reproducible thirteen-activity plans (D2), general stages
and mission closure, new family catalogs, generation/Templates, operational legal
content, source imports, actual sending/signing/receipt evidence, numbering,
automatic verification, OCR/AI/indexing, cross-Company sharing, provider sync,
retention/deletion and real assignments or deployment remain outside D3. Real-data
use still needs the existing Platform readiness and configured maintained scanner;
synthetic protocol fixtures are not real-provider proof. No additional Iurie
questionnaire is needed to implement this bounded provisional family.
