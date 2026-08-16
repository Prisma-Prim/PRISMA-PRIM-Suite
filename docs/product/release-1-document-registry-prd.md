# PRD — Release 1 Document Registry

**Status:** Draft — interview evidence received; representative practice pending
**Version:** 0.2  
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
- critical Activity Log events.

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

Record Document registration, Company/Client/Project relationship changes, confidentiality changes, Version creation, official promotion or supersession, governed metadata correction, Representation addition/replacement/inaccessibility and archival/restoration. Routine reads are excluded unless a later compliance policy explicitly requires them.

## 11. Testing decisions

- PostgreSQL REST tests for scope, permissions, Version invariants and concurrent promotion;
- provider-adapter contract tests without making a provider the business source of truth;
- browser journey from Client or Project to Document, Version and Representation;
- negative tests for cross-Company access and metadata-versus-content permissions;
- retry/idempotency tests for failed Representation registration.

## 12. Acceptance journey

An authorized Company user opens a Project, registers a representative Document, records its type and confidentiality, and attaches a Representation. The user promotes the Version as official. A corrected file creates a second formal Version; the original remains visible and attributable. A user without confidential-content permission can see only the permitted metadata. If the provider link later fails, the governed Document and its history remain intact with a clear inaccessible state.

## 13. Business evidence

- representative Release 1 Document types and purposes;
- which records require a current official Version;
- draft-to-official authority and correction practice;
- confidentiality classes and who may open content;
- real examples of multiple files or formats representing one Version;
- archive/restoration practice and required metadata;
- whether initial Release 1 uses upload, external links or both.

Question source: S03.

## 14. Technical dependencies

- Company/RBAC, Shared Client and Project/Task capabilities;
- canonical Document/Version/Representation vocabulary;
- storage and malware-scanning boundary for direct uploads, if enabled;
- optimistic concurrency or equivalent for official-Version promotion;
- provider adapter interface and durable external-reference policy.

## 15. Readiness

Ticket decomposition is blocked on representative Document practice, confidentiality authority, official-Version rules and the Release 1 Representation mechanism. It follows Company/RBAC, Shared Client and the minimum Project relationship.

## 16. Interview evidence reconciliation (2026-08-16)

**Confirmed evidence**

- Received external originals must remain preserved.
- Official Documents require visible version history and may not be silently overwritten.
- Corrections after officialization require a new governed state/version and attributable history.
- The system must preserve attributable evidence of approval or signature for the exact Version; sending and receipt evidence remain partially defined.

**Still blocking**

- Representative Release 1 Document families and confidentiality classes are not selected.
- Exact draft-to-official authority, retention/archive rules and initial upload-versus-link mechanism remain incomplete.
- A general “yes” to automation does not authorize automatic legal, signature or deletion behaviour.

Provenance: [issue #81](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81), sessions 6–7 and 35–36; [coverage matrix](iurie-business-answer-coverage.md). The provider-independent Document/Version/Representation model remains the canonical boundary.
