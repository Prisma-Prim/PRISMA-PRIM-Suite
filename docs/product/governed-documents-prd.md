# PRD — Governed Documents, Templates, Versions and Evidence

**Status:** Draft — business inventory pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-043–DEC-045, DEC-125–DEC-139

## 1. Problem statement

Documents currently exist across editable files, PDFs, scans, email attachments and storage folders. A filename or provider identifier cannot reliably answer which business document exists, which version was approved or sent, what representation was signed, who may see it, or what evidence proves its use.

## 2. Solution

Create a provider-independent governed Document model that separates:

- durable Document identity;
- formal Document Version;
- file Representation such as editable, rendered or signed;
- physical or provider Location;
- Template and immutable Template Version;
- exact Evidence links and provenance.

Release 1 provides the minimal registry. Generation, Drive automation, signatures, OCR and advanced retention enter through later capabilities.

## 3. User stories

1. As a user, I want one durable Document identity, so that moving or converting a file does not create a new business document.
2. As a user, I want working saves separated from formal versions, so that normal editing does not flood history.
3. As an approver, I want every officially used version frozen, so that later changes cannot rewrite what I approved.
4. As a user, I want editable, rendered and signed files related to the same version, so that representations are not mistaken for revisions.
5. As a reviewer, I want evidence linked to an exact version, so that a claim can be verified.
6. As a user, I want externally received originals preserved unchanged, so that provenance remains trustworthy.
7. As a template owner, I want durable template identity and immutable versions, so that generated output can be reproduced.
8. As a Company manager, I want shared masters and Company variants explicit, so that branding and authority remain correct.
9. As a user, I want current, replaced, archived and disputed versions distinguished, so that I use the correct material.
10. As an authorized user, I want confidentiality and Company ownership enforced on Documents and metadata.
11. As a records owner, I want retention, legal hold and purge decisions governed, so that deletion is not accidental.
12. As a user, I want official numbers independent from filenames, so that renaming does not alter identity.

## 4. Domain model

- **Document:** durable governed identity and purpose.
- **Document Version:** formal immutable content state with author, time, status and context.
- **Representation:** concrete editable, rendered, scanned or signed file for one version.
- **Location:** provider/storage reference for a Representation.
- **Template:** durable generation definition.
- **Template Version:** immutable approved generation content.
- **Evidence Link:** typed relation from a business fact to an exact Document Version or Representation.
- **Transmission Evidence:** proof of sending or receipt.
- **Signature Evidence:** proof and validation data for signature.

## 5. Invariants

1. A formal Version belongs to exactly one Document.
2. An officially used Version is immutable.
3. Representations do not change the formal Version's meaning.
4. Locations are replaceable and never become business identity.
5. Externally received originals are preserved byte-for-byte when legally and operationally required.
6. Generation records the exact Template Version, inputs, configuration and resulting representations.
7. Evidence references an exact version, not a mutable “latest” file.
8. Official numbers are Company-scoped where the issuing Company owns them and are concurrency-safe.
9. Deletion respects retention, hold and historical dependencies.

## 6. Lifecycle dimensions

Document content status, approval, transmission, signature and retention are separate dimensions. One overloaded status must not imply all of them.

Formal content may move through draft, pending review, approved/rejected, superseded and archived. Errors after official use produce a new version or governed correction; they do not overwrite history.

The bounded Release 1 working-reference correction in issue #250 is deliberately
not a formal-content correction: it may update only title, purpose and the URL of
an unverified mutable external reference while retaining an append-only internal
before/after ledger. It preserves Document, draft Version and Representation
identity. Official or evidentiary content remains subject to the immutable-Version
rules above.

Document Registry PRD [section 21](release-1-document-registry-prd.md#21-approved-provisional-official-document-versions-400) provisionally implements the content-status part of this dimension: `draft → official → superseded`, with frozen official Versions.

## 7. Permissions

Permissions distinguish reading metadata, reading content, registering Documents, creating formal Versions, reviewing/approving, managing Templates, attaching evidence, managing Locations and authorizing archive/purge.

Visibility inherits Workspace/Company and owning business-record scope. Search and AI must apply authorization before revealing Document metadata or content.

## 8. Configuration and localization

Document types, required fields, numbering policies, language, branding, signatories and permitted marks are typed configuration. Changes that affect historical meaning are effective-dated or versioned.

User-facing labels are localized independently from stable internal semantics.

## 9. Integration boundaries

PostgreSQL owns Document identity, formal versions, permissions and provenance. Google Drive, Synology or another provider stores Locations and file bytes through adapters.

External sync is asynchronous and idempotent. Provider deletion, renaming, duplicate callbacks and outages produce visible recoverable states without rewriting the business record.

## 10. Security and reliability

- validate and quarantine uploads before trusted use;
- record checksum, media type, size and scan outcome;
- encrypt transport and protected storage;
- minimize sensitive metadata in logs;
- back up governed metadata and required content;
- prove restoration and provider-exit export.

## 11. Migration

Historical folders are imported through governed batches. Unknown version relationships and ambiguous ownership remain explicit. Ten representative Clients prove mapping before broad migration.

## 12. Testing decisions

- test formal-version immutability and correction through public commands;
- test Company/Workspace content and metadata isolation;
- test provider adapter retries and degraded states separately from business identity;
- test generation reproducibility when introduced;
- test upload rejection and safe error states;
- use browser journeys for registration, review, version selection and evidence.

## 13. Acceptance journey

An authorized user registers a Document for a Client Project, creates a formal Version with one Representation and later freezes it for official use. A corrected Version is created without changing the first. An Evidence Link identifies the exact used version. A Company-unauthorized user cannot infer its metadata. Storage-provider unavailability does not erase business identity or history.

## 14. Evidence dependencies

- real Document families and responsible Companies;
- draft-to-official moments;
- approval, transmission, signature and correction practice;
- Template ownership and variants;
- numbering and abandoned-number rules;
- confidentiality, retention, disputes and holds;
- representative anonymized examples.

Question source: S03.

## 15. Technical dependencies

- storage/provider inventory and adapter research;
- upload threat model and malware-scanning design;
- checksum and signature-validation choices;
- retention-law research;
- Document module interface and migration design.

## 16. Readiness

The cross-cutting model is ready to govern the Release 1 Document registry PRD. Detailed generation, Drive, signature and retention tickets remain blocked on evidence and their capability PRDs.
