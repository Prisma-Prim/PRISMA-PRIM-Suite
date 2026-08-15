# PRD — Historical Migration, Global Search and Export

**Status:** Draft — source inventory pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-140–DEC-154

## 1. Problem statement

Historical Client, Project, Contract, Document and credential information exists across folders, spreadsheets, email, applications, paper and personal files. Sources may disagree, omit identifiers or use Romanian, Russian, Cyrillic, Latin and spelling variants. A naive bulk import or global search could create false certainty, duplicate records or unauthorized metadata leakage.

## 2. Solution

Treat migration as a governed business process with source and batch provenance, preview, validation, idempotence, explicit uncertainty, controlled duplicate proposals and rollback.

Keep search indexes derived and rebuildable. Authorize before returning entity, metadata, content or semantic results. Distinguish current records, deliberate historical views and dossier completeness. Provide governed export and archive independent of one provider.

## 3. User stories

1. As a migration operator, I want every imported fact linked to its source and batch, so that provenance is preserved.
2. As a reviewer, I want a preview before commit, so that mapping errors are detected safely.
3. As an operator, I want rerunning a batch to be idempotent, so that recovery does not duplicate records.
4. As a reviewer, I want unknown and uncertain facts preserved explicitly, so that import does not invent confidence.
5. As a Client owner, I want possible duplicates proposed for human decision, so that records are never merged automatically.
6. As an operator, I want a failed or rejected batch recoverable, so that partial migration does not corrupt canonical data.
7. As a user, I want to search by the clues people remember, so that names, identifiers, people, standards and document numbers find authorized results.
8. As a multilingual user, I want normalized matching across scripts and variants, so that spelling differences do not hide records.
9. As a user, I want current records by default and history deliberately accessible, so that obsolete data is not mistaken for current truth.
10. As an authorized manager, I want “everything for this Client” to show governed completeness, so that missing and unchecked information differ.
11. As a Company-scoped user, I want search to hide unauthorized activity and metadata.
12. As an authorized owner, I want standard export, so that the tenant can leave the provider or satisfy operational needs.

## 4. Migration model

- **Migration Source:** application, folder, sheet, mailbox, archive or other origin.
- **Migration Batch:** one reviewable execution with mapping/configuration version.
- **Staged Record:** parsed candidate before canonical commit.
- **Provenance:** source locator, source identity, import time and transformation.
- **Uncertainty:** known missing, ambiguous, contradictory or unverified state.
- **Duplicate Proposal:** evidence-based candidate relation requiring human disposition.
- **Batch Outcome:** previewed, approved, committed, rejected, failed or rolled back.

## 5. Search model

Search modes remain distinct:

- structured entity search;
- governed Document metadata/content search;
- later semantic retrieval through the AI/Knowledge PRD.

Indexes are projections of canonical authorized data. They may be rebuilt and never own business truth.

## 6. Invariants

1. Import never erases source provenance.
2. Rerun with the same idempotency identity does not duplicate committed facts.
3. Ambiguity remains explicit until a human or authoritative evidence resolves it.
4. Duplicate suggestions never merge automatically.
5. Authorization is applied before results, counts, snippets or suggestions are exposed.
6. Search metadata cannot reveal hidden Company activity.
7. Current and historical meanings are visibly distinct.
8. Export preserves stable identities, versions, relationships and provenance in documented formats.

## 7. Permissions and accountability

Permissions distinguish source inventory, preview, approve/commit, reject/rollback, duplicate resolution, search modes and export. Critical batch and duplicate decisions create Activity Log events.

## 8. UX and failure states

- dry-run summary with counts, warnings and representative samples;
- row/record-level errors without hiding successful staging;
- explicit unknown, uncertain and contradictory indicators;
- no-results versus no-permission-safe semantics;
- current-first results with deliberate history filters;
- export preview and scope confirmation.

## 9. Pilot and migration sequence

1. inventory authoritative and secondary sources;
2. choose ten representative Clients;
3. define mapping and identity rules;
4. stage and preview;
5. review duplicates and uncertainty;
6. commit the pilot;
7. reconcile against source evidence;
8. approve wider batches only after pilot acceptance.

## 10. Security and reliability

Migration staging is isolated from canonical data. Uploaded sources receive the same file-safety controls as governed Documents. Sensitive source content is minimized in logs and error reports. Batch recovery and backups are tested before broad imports.

## 11. Testing decisions

- fixture-based mapping tests for representative scripts, formats and ambiguity;
- PostgreSQL integration tests for idempotence, commit/rollback and tenant isolation;
- authorization tests for results, counts, snippets and suggestions;
- performance tests from measured first-tenant volume, not guessed scale;
- browser acceptance for preview, review, search and export.

## 12. Acceptance journey

An operator stages ten representative Clients from named sources. Preview exposes errors, variants, uncertainty and duplicate proposals. An authorized reviewer resolves or defers candidates and commits the batch. A rerun creates no duplicates. Authorized users find current and deliberate historical results across language variants; Company-scoped users cannot infer hidden activity. An export preserves the governed records and provenance.

## 13. Evidence dependencies

- full historical source inventory and owners;
- trust order when sources disagree;
- identifiers, known gaps and correction rules;
- ten representative Clients;
- ten real search questions;
- default history visibility and completeness meaning;
- required exports and recipients.

Question source: S08.

## 14. Technical dependencies

- format/encoding inventory;
- staging and rollback architecture;
- search technology evaluation after measured volumes;
- authorization-safe indexing design;
- export schemas and restore/portability tests.

## 15. Readiness

This PRD defines the cross-cutting boundary but Release 6 ticketing is blocked on the source inventory, representative pilot and search questions.
