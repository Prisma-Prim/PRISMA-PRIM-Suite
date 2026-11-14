# PRD — Manual Working Evidence Case

**Status:** Approved — bounded software contract; runtime implementation and verification tracked in [#1056](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1056)

**Version:** 1.0  
**Owner:** Dan Popescu  
**Direction and tracker:** [#1054](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1054), following [Product Vision §11.1](product-vision-prd.md#111-first-working-version-priorities--2026-11-06)

## 1. Authority, problem and outcome

An authorized collaborator needs to preserve a human observation, open its exact supporting originals, correct it without losing the earlier statement, and download a reproducible working statement with its source annex. A folder, mutable URL or completed-looking form cannot supply that traceability.

This capability owns **one Company-owned Working Evidence Case: literal declared context, one process, one unclassified human working statement and one to three preserved PDF supports per complete immutable revision**. Multiple Cases may belong to the same Project. The useful outcome is record → reopen exact proof → correct → frozen statement and exact annex, delivered as one vertical including necessary source admission.

Under the delegated owner instruction recorded by [#1054](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1054), root approves this bounded software contract following ordered Standards then Spec preparation and the focused selector-protocol correction. This is delegated product disposition, not new business evidence or personal review by Dan. [Specification Standard §4](specification-and-ticketing-standard.md#4-prd-preparation-workflow) requires canonical documentation merge before a separate runtime issue; this PRD grants no workflow exception.

Authority owners remain:

- [Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families): captures, administration and exact actor matrix;
- [Document Registry §26](release-1-document-registry-prd.md#26-received-audit-source-preservation-and-working-case-references-1054): truthful source family, native preservation and exact-reference participant;
- [Project lifecycle §23](release-1-project-task-prd.md#23-approved-provisional-project-lifecycle-406) and [Shared Client invariants](release-1-shared-client-prd.md#6-invariants): original context, lifecycle and Client history;
- [Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy): restricted event recording;
- [UX](ux-localization-configuration-prd.md), [Platform](platform-security-reliability-operations-prd.md) and [ADR 0008](../adr/0008-bounded-document-content-storage.md): presentation, confidentiality, scanning, storage and recovery.

## 2. Scope, meaning and inventory disposition

Every Case belongs to one Workspace, one active Company, one existing native Project and that Project's immutable original Client Account. The server derives these links. A canonical union successor, selected label or client-supplied Company cannot replace them. There is no Client Legal Entity, Scheme, Contract or formal Audit record created or inferred.

New RECORD/CORRECT requires an open Project (`preparatory`, `active`, `on_hold`), active original Client and active original Company relationship. Closed Projects and readable superseded original Clients retain historical reads and committed replay under their native owners. They refuse new revisions. Case recording neither activates a preparatory Project nor authorizes professional work.

Received representative genres include questionnaires, duration and team declarations, Plans, Reports, annexes, review and decision forms, with editable/rendered/scanned variants and correction/provenance uncertainties. The scoped inventory supports literal context and exact supported PDF preservation for this working outcome. It establishes neither underlying evidence sufficiency nor approved procedures, operational masters, professional authority, numbering, competence or separation. Unsupported formats and oversized sources stay outside the admission envelope; no whole-dossier admission is claimed.

[DEC-099/139 and source qualification](consolidated-product-decision-record.md#3410-bic-pilot-direction-and-source-qualification--2026-11-06) remain in force. Their inventory disposition is specific to this bounded software action. Later formal actions still require their real rules, actors, models and evidence. This adds no blanket exception, commercial substitution rule or reordered release roadmap.

The statement is always identified as **working, human-declared, unclassified and non-official**. A reported duration, method, team, Plan approval or prior decision may appear only as literal unverified context. No formula, selection mark, signature, professional conclusion or authorization is inferred. A Working Evidence Case statement is distinct from the formal Audit Finding in decision record §13.10. It supplies no Audit Report approval/completion, corrective-action closure, Certification Decision, Credential or approved-model pilot credit.

## 3. User stories and actor boundary

1. A source registrar deliberately preserves a received PDF under its truthful family, without inventing a URL or mission deliverable.
2. A source uploader corrects a draft by another immutable upload, designates only under native Approver authority and retains exact predecessor bytes.
3. A Case Recorder opens an eligible Project, enters literal context/process/statement and selects one to three exact frozen sources with optional locators and support notes.
4. A Case Reader reopens the current revision, its attribution and exact permitted supports.
5. A Recorder corrects the complete revision with a reason and expected revision; the earlier statement and annex remain unchanged.
6. A Reader downloads a fixed factual statement or complete self-contained original-source annex under current combined rights.
7. A person without source rights may retain independently permitted Case text without learning protected tuples, source counts or file metadata.
8. A user facing an uncertain response explicitly retries the exact sealed command; later refresh failure never turns confirmed success into uncertainty.
9. A historical reader follows an older Case revision after source succession, Project closure or Client supersession without substitution of latest content.
10. An administrator explicitly grants/revokes software captures without creating professional roles or expanding existing assignments.
11. A user changing consumed identity, Company or capture cannot revive retired confidential work or late download effects.
12. A reviewer proves persistence, isolation and populated predecessor compatibility using fictional public scenarios.

All operations require current identity, membership, selected Company and the native Project/original-Client read boundary. The exact combination of new Case and native Document permissions is owned solely by Authorization §8. Source preparation is independently authorized native work, not an implicit Case permission. No real assignment is supplied.

## 4. Complete values and closed command grammar

Case JSON request bodies are bounded to 256 KiB before parsing. Objects below have exactly the listed keys. Reject missing/extra keys, coercion, unsupported formats/actions, malformed UUIDs, unsafe integers, invalid UTF-8/unpaired Unicode surrogates and NUL. IDs are canonical lowercase UUID strings; persisted text and source metadata must also satisfy their owning native bounds before output construction. Text lengths use native JavaScript UTF-16 code units after trimming outer whitespace; preserve internal whitespace, Unicode and literal spelling without normalization, translation or interpretation. Required text must be nonblank; an optional value is explicitly null or nonblank bounded text, never an omitted field or empty string.

| Value          | Closed fields and bounds                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Values`       | `title` (1–200), `declaredContext` (null or 1–2000), `process` (1–200), `statement` (1–2000), `observationNote` (null or 1–2000), `supports` (ordered array of 1–3 `SupportInput`) |
| `SupportInput` | `documentId`, `versionId`, `representationId` (UUIDs); `locator` (null or 1–500); `supportNote` (1–2000)                                                                           |
| `RecordBody`   | `format: "WORKING_EVIDENCE_CASE_COMMAND/1"`, `commandId` (UUID), `expectedRevision: 0`, `values: Values`                                                                           |
| `CorrectBody`  | `format: "WORKING_EVIDENCE_CASE_COMMAND/1"`, `commandId` (UUID), `expectedRevision` (integer 1–2147483646), `reason` (1–2000), `values: Values`                                    |

Duplicate exact support tuples are invalid, even with different locators. Ordering is part of intent. A locator is an attributed human location hint, not parsed page evidence, a storage path or a URL the application fetches. Literal text containing a URL is displayed escaped and inert; it cannot become a source identity or executable link. The optional context may state unknown/unverified duration, method, team or Plan facts; there are no hidden mandatory professional fields.

| Public operation                                                                 | Exact request and success                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `POST /projects/:projectId/working-evidence-cases`                               | `RecordBody`; RECORD; 201 with `Receipt`                                     |
| `POST /working-evidence-cases/:caseId/corrections`                               | `CorrectBody`; CORRECT; 201 with `Receipt`                                   |
| `GET /projects/:projectId/working-evidence-cases`                                | No body; optional `cursor` only; `CasePage`                                  |
| `GET /projects/:projectId/working-evidence-sources`                              | No body; optional `cursor` only; `SourcePage` owned by Document Registry §26 |
| `GET /working-evidence-cases/:caseId`                                            | No body/query; `CaseDetail` for current revision                             |
| `GET /working-evidence-cases/:caseId/revisions`                                  | No body; optional `cursor` only; `RevisionPage`                              |
| `GET /working-evidence-cases/:caseId/revisions/:revisionId`                      | No body/query; `RevisionDetail`                                              |
| `GET /working-evidence-cases/:caseId/revisions/:revisionId/statement`            | No body/query; exact frozen HTML attachment                                  |
| `GET /working-evidence-cases/:caseId/revisions/:revisionId/annex`                | No body/query; exact frozen ZIP attachment                                   |
| `GET /working-evidence-cases/:caseId/revisions/:revisionId/evidence/:evidenceId` | No body/query; exact original PDF attachment                                 |

Workspace/Company selection and authentication use existing application headers. Bodies contain no actor, Client, Company, source hash, mutable source title/purpose or requested output status. No PATCH, delete, approve, finalize, automatic retry or arbitrary state endpoint exists. CORRECT always creates a complete successor, even if its values match the predecessor, because the attributed correction reason is a new fact. At the native integer capacity, refuse another correction safely without mutation.

## 5. Revisions, conserved intent and transaction order

RECORD creates a server UUID Case and revision 1. CORRECT appends revision n+1 and advances only the current pointer. Every revision retains complete values, reason (null on RECORD), predecessor (null on RECORD), server actor membership/time, frozen exact support bindings and output bytes/digests. No revision or original bytes can be edited, deleted or discarded. Native source corrections and Case corrections are independent.

The command key is unique across this capability for `(Workspace, actor membership, commandId)`. Conserved intent is a versioned closed object of selected Company, action, route Project/Case target, expected revision, every normalized literal/null and ordered support tuple. Persist the complete intent and a deterministic fingerprint; never reconstruct it from today's source title/purpose, filename, lifecycle or head. Source qualification stores an immutable snapshot separately. Unknown persisted formats fail closed without rewriting or silently dropping fields.

Process commands in this order:

1. Establish current identity, Company, Case/action permission, native Project/original-Client read and each submitted support's native metadata/reference/family/content authority under the owners' transaction participants. Scope checks reveal no foreign object. Authorization requires no fresh byte download or new-use eligibility.
2. Resolve the actor/Workspace command key. Exact intent and current authority return the original `Receipt`, before new-use lifecycle, current revision, current source eligibility or physical-byte checks. Changed reuse returns conflict. Replay after later corrections never moves the head or restores older sources as current.
3. For a new key, lock original Client identity before its relationship using the Client owner; require active original context/open Project. Lock the Case head and compare expected revision. Qualify each exact frozen source through Documents, in stable tuple order, and acquire required live Access captures. Never nest a native top-level transaction expecting it to join this transaction.
4. Construct and validate bounded exact output from qualified immutable originals, then atomically persist Case/head, immutable revision/bindings, output/digests, conserved intent/receipt, one restricted Activity event and original Client operational-use fence. A failure through response construction rolls back the entire unit. No partial receipt, orphan output or success event survives.

Access coordinates capture/identity/Company locks against revocation/suspension; Client owns identity-first locks and reversal fences; Project owns open-lifecycle serialization; Documents owns exact source qualification/storage; Accountability owns event persistence. Same-key races converge on one receipt. Distinct corrections racing from the same revision yield one winner. Revocation or Project closure racing new use produces one lawful serialized result, never a commit authorized only by a stale actor projection. Scanning occurs during native upload before the short Case transaction; no provider/scan call occurs inside it.

## 6. Closed read and receipt formats

`SourcePage` and the source selector's exact request/cursor/failure protocol are owned by [Document Registry §26](release-1-document-registry-prd.md#26-received-audit-source-preservation-and-working-case-references-1054). The Case-owned public route composes that Document-owned eligible-selection participant; it does not reinterpret native Document inventory as a paginated exact-source protocol.

`Receipt` is exactly `{format: "WORKING_EVIDENCE_CASE_RECEIPT/1", commandId, caseId, revisionId, revisionNumber, action, recordedAt}`. The first three IDs after `format` are UUIDs; `revisionNumber` is a positive native integer; `action` is `RECORD` or `CORRECT`; `recordedAt` is a canonical UTC ISO instant. No text, support data, hash, command fingerprint or permission capture appears in it. Exact replay returns the same status/body.

`ActorStamp` is exactly `{membershipId, displayName}` using server attribution and existing display-label semantics, never email or a general directory lookup. `SupportView` is exactly `{evidenceId, documentId, versionId, versionNumber, representationId, sourceTitle, sourcePurpose, filename, mediaType, sizeBytes, sha256, locator, supportNote}`. UUIDs, positive native Version number, `application/pdf`, byte size and lowercase 64-hex digest come from the native frozen source snapshot; user-supplied hash/filename never establishes identity. An evidence ID is revision-scoped and server-generated.

`EvidenceView` is exactly one of `{state: "visible", supports: [SupportView, ...]}` or `{state: "unavailable"}`. The former is returned only when **all** selected supports retain current independent native read authority. Otherwise return the latter as one generic indication: no tuple fragments, source title/purpose, filename/hash, array slots, placeholders, source totals or hidden count. Independently authorized native Document reads/history remain available through their owners. Evidence visibility says nothing about current physical byte availability.

`RevisionDetail` is exactly `{format: "WORKING_EVIDENCE_CASE_REVISION/1", caseId, revisionId, revisionNumber, previousRevisionId, action, recordedAt, actor, reason, title, declaredContext, process, statement, observationNote, evidence}`. Literal fields/bounds follow §4; predecessor/reason follow §5; `evidence` follows the current redacted projection, not the persisted full snapshot. `CaseDetail` is exactly `{format: "WORKING_EVIDENCE_CASE/1", caseId, projectId, originalClientId, current: RevisionDetail}` with current native Project/original-Client visibility. No source count appears outside `EvidenceView`.

`CasePage` is exactly `{format: "WORKING_EVIDENCE_CASE_PAGE/1", items, nextCursor}`, with each item exactly `{caseId, revisionId, revisionNumber, title, recordedAt}` for the current revision. `RevisionPage` is exactly `{format: "WORKING_EVIDENCE_CASE_HISTORY/1", items, nextCursor}`, with each item exactly `{revisionId, revisionNumber, action, recordedAt, actor}`. Pages contain at most 25 items, no total; continuation is null or opaque, bounded to 256 ASCII characters. Bind cursors to Workspace/Company, Project or Case, consumed Reader identity/captures and ordering. Unknown/malformed/wrong-scope cursors refuse safely. Apply visibility before the 25+1 lookahead. Order Cases by original creation time then Case UUID descending; revisions by revision number descending. Each page uses one consistent read snapshot; fetching a page never marks anything read or creates an event.

Live readers may tolerate additive HTTP fields only after establishing every field they consume; publishers and conserved persistence retain the closed format. Receipt/snapshot decoders cannot use permissive HTTP parsing that discards historical intent or silently upgrades unknown formats.

## 7. Frozen statement, annex and failure contract

Each revision freezes one UTF-8 safe HTML working statement with fixed neutral English headings and explicit working/human-declared/unclassified/non-official wording. The literal business text stays in its entered language. Display title, Project/original-Client identifiers, revision, attribution, context/process/statement/note, correction reason and factual support index from the frozen revision. No mutable current Client/Company/source label is interpolated into historical output. Do not import received model wording, licensed Standard text, marks or logos. No renderer, template approval, PDF generation or external integration is needed.

The statement is self-contained, with all text HTML-escaped, no script, remote style/font/image, form, active literal URL or executable user markup. Its evidence links are opaque same-origin authenticated application routes from §4; no raw storage address, signed URL, token, filename or business text enters a route. Online support opening rechecks current rights. Set private/no-store, attachment, safe fixed filename, `nosniff` and a restrictive content-security policy. UI locale changes do not regenerate an existing statement.

The annex is a deterministic uncompressed ZIP containing exactly `statement.html`, `index.html` and one original PDF per selected support under `evidence/<opaque-evidence-id>.pdf`. No directory traversal, absolute paths, symlinks, duplicate entries, hidden files or extra source is permitted. Freeze ZIP entry order and metadata at revision creation so reopening returns identical bytes/digest. `index.html` gives factual exact-Version/Representation/size/hash/locator/support-note information and the same non-official label. Annex statement/index link to these opaque relative PDF entries, not online routes; the offline annex is wholly self-contained.

Bound each HTML file to 256 KiB, originals to the native 5 MiB each and the complete ZIP to 16 MiB. Bound construction before publication; exceeding a bound refuses the complete new command. Artifact delivery and each exact support download require current Case/Project/original-Client and native rights; statement and annex additionally require rights to **all** supports and availability/integrity of every exact original. Verify size/hash without substituting latest. Complete authorization and integrity qualification before emitting headers or a byte prefix. A missing/corrupt source or output refuses the whole artifact; do not silently omit a protected source, return a partial archive or regenerate from today's state. Basic independently permitted Case text/history can remain readable.

A downloaded annex contains confidential bytes; later server revocation cannot revoke an offline copy. No email, sharing, public publication or external sending is provided.

| Situation                                                                | Observable result and conservation                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| No verified identity                                                     | Existing safe 401; no business payload/effect                                                    |
| Established actor lacks context/captured prerequisites                   | Existing safe 403; hidden resource IDs receive opaque 404 after ordinary scope authorization     |
| Invalid closed body or bounds                                            | 400 with fixed localized validation category, no echoed confidential input                       |
| Stale revision, changed command-key intent or capacity reached           | 409 with fixed code; reload before a new intent; no writes                                       |
| Closed Project/inactive original context on new use                      | 409 safe new-use refusal; exact authorized replay already resolved                               |
| Ineligible/unreadable exact support                                      | Opaque 404; no partial tuple/count or success                                                    |
| Missing/corrupt exact content/output during new construction or delivery | 503 safe unavailable; no artifact prefix or success                                              |
| Unexpected failure/lost response                                         | No false saved claim; exact command remains uncertain until explicit identical retry resolves it |
| Empty authorized Case/history list                                       | Empty page; no inferred source or other-Company totals                                           |

New Case failures use exactly `{code}` with a fixed value from `invalid_request`, `conflict`, `new_use_unavailable`, `not_found`, `content_unavailable`; existing authentication/context envelopes remain native. No raw SQL, paths, payloads or scanner errors enter responses/diagnostics. Operational diagnostics use bounded outcome/category and opaque correlation only; Activity owns business success history.

## 8. Actual application journey and consumed lifetime

Use the existing Prisme Project detail navigation for Cases and existing Documents workspace for deliberate source preparation. A closed/read-only Project can open historical Cases, with no enabled create/correct action. Select only independently visible eligible exact sources through the Document-owned selector. No automatic upload, designation, Task result or Knowledge activation follows selection.

Provide explicit loading, empty, validation, denied, unavailable, historical, conflict, pending, uncertain and confirmed states. Show the exact selected Version and non-official meaning before save. Correction starts from the complete current revision, adds a reason and retains prior output/history. A confirmed command remains confirmed when refresh/download later fails. Refresh rereads state; it never constructs a new command or retries automatically. A conflict requires deliberate reload/new intent; an uncertain result retains the complete normalized body, ordered source IDs, expected revision and command key in memory for explicit identical retry. Do not silently reseal against refreshed metadata or current head. No confidential local/session storage or URL state is introduced.

The consumed lifetime includes verified principal/session generation, Workspace, membership, Company, native Project/Client read captures, Case Reader/Recorder as used and source family/Registrar/Content Reader captures as used. Changing a consumed identity/capture permanently retires that owner, including A→B→A and equal-permission replacement. Reader loss retires Case reads; Recorder loss retires the mutation owner while independently valid reading may remain. Source capture loss retires selectors/artifacts and redacts source views without deleting independently authorized text. Unrelated grants and independent native Document drafts remain with their own owners.

Retirement clears confidential state and sealed intent, aborts where possible and suppresses all late token, HTTP, parser, hash, recovery, navigation and Blob/download effects; revoke owned object URLs. A native refresh must prove the same still-live owner before preserving work. Guard global Actor recovery separately from the local operation; each still-current local 401 branch settles without a false save, while a retired owner cannot mutate global recovery. No returning to the old Company revives disposed work.

Use existing localized Prisme controls and shared Select, visible context, keyboard/focus, accessible status/error association and desktop1440/narrow390 fit. UI labels/errors/actions exist in ro/ru/fr/en; changing locale preserves literals and sealed command identity. No new visual system or changes to `/ui-baseline` are supplied.

## 9. Public proof, migration and one-session fit

All public code/docs/issues/fixtures/evidence use independently written fictional content. No actual dossier names, identifiers, wording, inventories/counts, provenance, hashes, locators or metadata enter Git or CI. Originals, extracts, minimized copies and source mappings remain private. A fixture may say `Fictional evidence; no certification claim`; it must not copy or anonymize a real model. Actual private rehearsal and rights/provenance checks are later work; verified backup restoration precedes actual-data use.

The first causal RED is a runnable public authorized record→exact statement/annex behavior failure, not a missing import/route. Required runtime evidence is:

1. Native public source preservation and explicit synthetic grants prepare one fictional Project/original Client and distinct fictional PDF originals. Case RECORD produces exactly one revision/receipt/event/fence and a safe statement/annex; unpack it and compare original bytes against independently retained expected digests.
2. CORRECT changes statement/support with a reason. Revision 1 values, output and originals remain identical. A source successor changes native current content; revision 1 still opens its exact predecessor. Native source title/purpose correction cannot break old command replay.
3. Foreign Workspace/Company/original Client, Project-only actor, missing/unknown captures, forged tuple and draft/unsupported family all deny without labels, counts or effects. Source loss yields safe Case text plus one unavailable marker; statement/annex refuse wholly. Independent native metadata/history remains governed as before.
4. Lost committed response plus native refresh and identical retry returns the original receipt before lifecycle/fresh-byte checks. Changed intent conflicts. Deterministic same-key/two-correction, revocation/closure/Client-union and post-scan races prove one lawful outcome. Inject final event/response failure and prove rollback of head/history/receipt/output/fence. No download prefix on any missing/corrupt support.
5. Registered actual App/HTTP/PostgreSQL acceptance proves keyboard source preparation→record→history/correction→statement→annex→exact support at desktop1440/narrow390 in all four locales, including safe literal markup. Hold token/response/recovery/Blob stages while switching consumed context A→B→A or replacing captures; prove no retired effect. Capture original screenshots and overflow evidence.
6. Two API restarts over the same persisted database conserve revisions, receipts, digests, exact bytes and denials. From launch on ([#1356](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1356)), a genuinely populated immediate-predecessor upgrade preserves existing identities, grants/revocations/captured versions, family eligibility, native/commercial/finance/result/Knowledge history and PDF/ZIP identities without reseed, repair or fresh grant.

Actual-head inspection at `63a823b493a3677d7ab8f496d3dd59de5131881b` found a closed native family union, explicit family authorization/registration/DTO/browser consumers, private byte adapter and mission-only Task-result qualifier. Project and original-Client owners already supply caller-transaction participants; Documents exports exact Version/read-only content seams, not a generic Case mutation qualifier. Top-level native transaction methods open their own transaction. The new Document-owned qualifier in §26 is therefore part of this vertical, not a private-table shortcut.

One coherent implementation session is feasible for this deliberately finite behavior: extend native family/capture/selector participation, add one Case aggregate with two commands and fixed output, and attach its bounded UI/public tests to existing shells/harnesses. No universal source framework, Audit workflow, renderer, new dependency/provider or native capture redesign is required. Native registration/upload/designation may be separate confirmed steps inside the same delivered journey. Splitting source-only and Case runtime by default would remove the selected business outcome; split only if fresh head inspection demonstrates a concrete prerequisite/fit failure, and leave the implementation unready until explicitly re-scoped.

Migration is additive: extend closed family/assignment constraints without changing existing values or captures; add scoped Case/head/revision/support/output/intent/receipt persistence with composite Workspace/Company/Project/original-Client/Document-Version-Representation integrity. Database guards enforce append-only revision/intent/output, contiguous expected-revision advance, 1–3 distinct supports, exact frozen source identity and atomic output/receipt/event/fence conservation. Preserve existing byte and official-Version guards, no-delete policy and old migration hashes. No default/backfill assignment or legacy retagging is permitted. Populated predecessor upgrade and direct SQL invariant/race probes are required in runtime, not executed by this documentation change.

## 10. Readiness and explicit later gates

| Standard gate             | Concrete disposition                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Outcome                | §§1–3: one complete working statement and exact-source annex, no professional completion claim                                                                                    |
| 2. Scope                  | §2: server-bound Workspace/Company/native Project/immutable original Client; no legal-party inference                                                                             |
| 3. Actors                 | Authorization §8 closes new unassigned captures and exact native matrix; no real grant or professional mandate                                                                    |
| 4. Lifecycle              | §§4–6: RECORD/CORRECT, immutable complete revisions, exact conserved intent/replay and no deletion                                                                                |
| 5. Source/provider        | Document §26 closes truthful admission, exact reference, 5 MiB scan/storage envelope and no provider shortcut                                                                     |
| 6. Examples               | §2 scoped genre/variant disposition and §9 independently fictional positive/negative examples                                                                                     |
| 7. Failures               | §§6–8: withheld tuple/count, safe denial, atomic artifacts, stale/uncertain/recovery and permanent retirement                                                                     |
| 8. Security/Activity      | Authorization and Activity owning consequences plus §§5–8; no generic confidential projection                                                                                     |
| 9. Dependencies/migration | §9 actual-head public-participant, additive migration and closed-consumer qualification; no runtime implementation claimed                                                        |
| 10. Acceptance            | §9 real public seams, exact artifact comparison, races, restart and, from launch on, genuine populated upgrade                                                                    |
| 11. Session fit           | §9 finite combined native-source/Case/output/UI/test vertical; fresh actual-head recheck required before assignment                                                               |
| 12. Blockers              | Software choices and ordered Standards→Spec/root disposition are closed; canonical merge and fresh actual-head ownership/fit checks remain prerequisites before any runtime issue |

No business answer is missing for the bounded unclassified manual behavior. This status does not approve real source sufficiency, operational Templates, professional role/separation, compliant duration, formal Audit/Report/Decision, whole pilot, actual grants, integrations or production activation. Their owning evidence and verified restore gates remain later prerequisites. The live tracker owns review/publication/runtime readiness; approval of this contract alone is neither executed acceptance nor delivered software.
