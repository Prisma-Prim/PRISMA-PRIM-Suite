# PRD — Release 1 Document Registry

**Status:** Partially approved — working references, their correction, Project association and correction history approved in #239, #250, #245 and #369; provisional official Versions in #400; wider governance remains Draft
**Version:** 0.8
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

The working-reference registration slice is approved in section 17, Project association in section 18, bounded working-reference correction in section 19, its read-only correction history in section 20 and provisional official Versions in section 21. Wider registration families, formal content correction, numbering, retention and provider-storage work remain blocked on their own normalized contracts. Those deferred decisions do not block the approved bounded slices.

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
The Project remains preparatory. The association is working-material organization,
not accepted evidence, a complete start dossier or operational approval.

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

Under Dan's 24 September 2026 delegation of reversible provisional MVP choices inside a vertical implementation, this section normalizes the content-status dimension of formal Versions for every registered Document, which today means the working questionnaires of section 17. It applies Iurie's confirmed rules:

- an approved official Document is never modified silently;
- current and previous Versions stay visible, with who approved them and when (coverage S03-Q04 and S03-Q06);
- issuing an official Document requires Iurie's approval (#81 sessions 1 and 24, items 705–706).

The mechanism, bounds and permission names are delegated provisional choices, not newly collected Iurie evidence. Iurie validates or corrects them against a demonstration.

**Versions.** Each Document has Versions numbered from 1, at most 50. Each has a content status of `draft`, `official` or `superseded`. The Version created at registration is Version 1 `draft`. A Document has at most one draft and at most one official Version, and may have no official Version.

Content status is one dimension only. Approval rationale, transmission, receipt, signature, archive and numbering remain separate facts (decision record §10.3, DEC-129), and `official` implies none of them.

**Designation.** A holder of Company Document Approver v1 (authorization PRD §8) who also has Document metadata and Representation read designates the current draft as official. One transaction:

- makes the draft `official`, recording the actor and server time;
- freezes its reference, and the Document's title and purpose at that moment, with the Version;
- makes the previously official Version, if any, `superseded`, recording the superseding Version.

A designated Version is never corrected in place. A superseded Version stays readable with its reference, designation and supersession.

First-tenant configuration grants Approver v1 only to Iurie's membership in each Company. This is an assignment, not a product role or hard-coded identity. Because the per-family responsibility matrix is incomplete (S03-Q02 Partial), no family-specific rule exists. A member holding both bundles may designate a Version they prepared; both acts stay attributed.

Designation freezes only what the system records: reference values and metadata. It does not store, fetch or verify external content, which may still change at its source. It does not make the Version an Approved Document for knowledge indexing.

**New draft.** When an official Version exists and no draft does, a holder of Company Document Registrar v3 starts the next Version as `draft`, copying the official Version's reference.

The section 19 working correction now applies only to the current draft: title and purpose on the Document, and the URL of the draft's reference. While no draft exists, the Document is correction read-only.

**References in this slice.** Each Version holds exactly one unverified external reference under section 17. Version 1 holds the registration reference, and each new draft holds a copy of the official Version's reference. The reference of an official or superseded Version never changes. Registrations that existed before this section become Version 1.

**Guarantees.** Every Version command and every section 19 correction share the Document's working revision as one concurrency token. Each committed command:

- requires the expected revision and increments it exactly once;
- commits, together, the Version change, one durable receipt, one Activity Log event and the original Client operational-use fence advance.

Among concurrent commands on one observed revision, at most one commits; the others conflict. Exact retries, scoped to the actor and Workspace, revalidate current authority and return the recorded result.

Every command requires the original Client and its Company relationship to remain active. A superseded original stays readable and read-only, as in section 19. Reading Versions follows the Document detail read boundary, and URLs require Representation read.

**Events.** The events are `document.version.drafted` and `document.version.designated_official` (with the superseded Version number), projected as Activity Log PRD section 7 states.

**Provisional choices for Iurie's validation:**

- Approver v1 is held only by Iurie;
- at most 50 Versions;
- a new draft copies the official reference;
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
- several or typed references per Version, their removal, and references appended to an official Version, such as a signed scan;
- Evidence Links and knowledge indexing;
- Offer and Contract Documents, which reuse this model only through their own capability sections.
