# Sarcina v1.0 repository reconciliation

Status: **non-canonical reconciliation**  
Repository issue: [#98](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/98)  
Repository baseline: `9399acf43ffe8c225b3e186fe5383c1a80bf72d2`  
External source SHA-256: `091ce476dfa7430bd7a14c0aefa2e43ea2c8d92d3849604b947c0c9d653c7520`  
Reviewed on: 2026-08-18

## Decision

The attached 105-page document is useful input, but it is **not a final technical specification and must not be implemented as a whole**.

This is not an interpretation based on its filename or the covering email. The document itself says:

- it is a proposed baseline for verification and acceptance (page 1);
- it is a controlled working document (the header on every page);
- its D1 and D2 acceptance gates are not complete, and further reconciliation outputs remain to be produced (page 7);
- its final checklist still requires a source, state and proof for each requirement (page 105).

The repository should therefore keep this report and its traceability CSV as a **candidate-source reconciliation**, while preserving existing Product Vision, PRDs, accepted ADRs, decision records, code and tests as their respective authorities.

The strict implementation result is:

| Classification | Modules       | Count |
| -------------- | ------------- | ----: |
| Implemented    | None          |     0 |
| Partial        | M01, M18, M19 |     3 |
| Missing        | M02-M17       |    16 |

“Missing” means that no corresponding product module, data model or public API is present at the fixed repository baseline. It does not claim that an external operational control or third-party system does not exist. Those cases are marked `not-assessable` when repository evidence cannot determine them.

## What was verified

The review used four evidence axes:

1. a complete text extraction of the DOCX and its PDF rendering;
2. a visual pass across all 105 rendered pages;
3. independent source-structure, repository-gap and authority-crosswalk reviews;
4. exact repository files, issues, PRs, tests and CI evidence at the fixed baseline.

The original DOCX is intentionally not committed. Page references below identify the external file with the SHA-256 above.

## Source integrity

The source contains 19 modules and 95 module cards: five cards per module, on pages 9-103. Each card presents six requirement IDs and three acceptance-criterion IDs.

| Measure                                                | Verified result |
| ------------------------------------------------------ | --------------: |
| Pages                                                  |             105 |
| Modules                                                |              19 |
| Module cards                                           |              95 |
| Requirement IDs                                        |             570 |
| Acceptance-criterion IDs                               |             285 |
| Total addressable IDs                                  |             855 |
| Literal requirement texts after deduplication          |              96 |
| Literal acceptance-criterion texts after deduplication |               3 |
| Total literal base texts                               |              99 |

The apparent volume overstates the amount of distinct behavior:

- within each module, the same six rules are repeated across all five cards;
- the sixth rule is identical across all 19 modules;
- the same four-step nominal flow, three exception bullets and three acceptance criteria are repeated across all 95 cards;
- 570 requirement IDs therefore reduce to 114 module/rule positions and 96 literal requirement texts;
- 285 acceptance-criterion IDs reduce to three generic texts.

This repetition is not harmless formatting. An identifier looks traceable even when it adds no new behavior. The CSV resolves that risk by retaining all 855 identifiers while linking each repeated identifier to one literal base row through `duplicate_group` and `duplicate_of`.

## Authority model

The reconciliation applies the repository's knowledge system as follows:

| Question                                          | Authority                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| What business outcome or rule has Iurie accepted? | Addressable direct evidence, then the consolidated product decision record after reconciliation |
| What observable product behavior is required?     | Owning PRD                                                                                      |
| What release order is canonical?                  | Product Vision PRD                                                                              |
| What durable technical constraint applies?        | Accepted ADR, then repository engineering rules                                                 |
| What is implemented?                              | Code, schema, API surface and tests at an exact commit                                          |
| What work is active or blocked?                   | Current GitHub issue and PR state                                                               |
| What does the Sarcina v1.0 establish?             | Candidate evidence only; it cannot override the rows above without explicit normalization       |

The source's filename and email description are delivery metadata, not acceptance evidence. Likewise, a source requirement that resembles a canonical rule is not automatically canonical: the row must have an addressable source and an owning authority.

## Exact implementation boundary

At the fixed baseline, the application composition contains only Access, Accountability, Company and Database modules. The database schema contains Workspace, Internal User, Workspace Membership, permission, Company, Company assignment and Activity Log structures. The public API exposes only current actor, Activity Log, Company and Company-context-assignment routes.

The strongest immutable evidence is:

- **E0 — delivered boundary:** [application composition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/application-composition.module.ts), [database schema](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/database/schema/index.ts), [OpenAPI](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/openapi.yaml), and [future AI worker boundary](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/ai-worker/README.md).
- **E1 — M01 proof:** [Access REST tests](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/access/access.rest.test.ts), [Company-context assignment tests](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/access/company-context-assignment.rest.test.ts), [Company REST tests](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/company/company.rest.test.ts), and [production-shell journeys](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/web/e2e/production-shell.spec.ts).
- **E18 — M18 proof:** fail-closed and metadata-safe access behavior in E1, plus [test-database safety](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/database/test-database-target.test.ts) and [previous-schema migration tests](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/apps/api/src/database/previous-schema.migration.test.ts).
- **E19 — M19 proof:** [AGENTS.md](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/AGENTS.md), [issue execution](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/docs/agents/issue-execution.md), [repository knowledge system](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/docs/agents/repository-knowledge-system.md), [CI](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/.github/workflows/ci.yml), and [agent governance](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/9399acf43ffe8c225b3e186fe5383c1a80bf72d2/.github/workflows/agent-governance.yml).

The representative UI baseline is synthetic and backend-free. It is design evidence, not implementation evidence for the business modules.

## Module reconciliation

| Module                                    | Strict state | Verified repository result                                                                                                                                                                                                                                                                                                                     | Canonical owner and next disposition                                                                                      |
| ----------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| M01 — Companies, users and access         | Partial      | Workspace/identity boundary, Membership, Company registration/read, server-revalidated Company context, narrow grant/revoke, four Activity Log event families and browser journeys exist (E1). Full business roles, All Companies, expiring exceptional access, deactivation/session revocation, generic approvals and export controls do not. | Tenant/Company authorization, Company RBAC, Activity Log, Security and UX PRDs. Continue by focused Release 0/1 slices.   |
| M02 — Client 360 and contacts             | Missing      | No Client Account, Client Legal Entity, contact or deduplication model/API exists (E0).                                                                                                                                                                                                                                                        | Release 1 Shared Client PRD. Preserve the Client Account/legal-entity distinction.                                        |
| M03 — CRM and offers                      | Missing      | No CRM, Opportunity, tariff, Offer or discount model/API exists (E0).                                                                                                                                                                                                                                                                          | Product Vision Release 3 and a future dedicated PRD.                                                                      |
| M04 — Contracts and obligations           | Missing      | No Contract, obligation, due-date or addendum model/API exists (E0).                                                                                                                                                                                                                                                                           | Product Vision Release 3 and a future Contract PRD. Do not replace DEC-117 with an Offer-only origin.                     |
| M05 — Projects and tasks                  | Missing      | No Project, Task, dependency, blocker or completion-evidence model/API exists (E0).                                                                                                                                                                                                                                                            | Release 1 Project/Task PRD. Preserve pre-contract Project creation and gate the appropriate transition, not existence.    |
| M06 — Documents and registers             | Missing      | No Document, version, registry, retention, archive or export model/API exists (E0).                                                                                                                                                                                                                                                            | Governed Documents, Release 1 Document Registry and Migration/Search/Export PRDs.                                         |
| M07 — Knowledge base                      | Missing      | No knowledge-base, provenance search, retrieval or reuse service exists; the AI worker README explicitly says no service is implemented (E0).                                                                                                                                                                                                  | AI/Knowledge governance plus a later dedicated capability PRD.                                                            |
| M08 — Document generator                  | Missing      | No template, generation job, draft or approval model/API exists (E0).                                                                                                                                                                                                                                                                          | Governed Documents plus a Release 2 generation PRD.                                                                       |
| M09 — Audit and certification             | Missing      | No audit engagement, auditor allocation, finding or nonconformity model/API exists (E0).                                                                                                                                                                                                                                                       | Product Vision Release 4 and a dedicated PRD. Exact C/S1/S2/R semantics still require normalization.                      |
| M10 — Training and certificates           | Missing      | No training, attendance, assessment, certificate or QR verification model/API exists (E0).                                                                                                                                                                                                                                                     | Product Vision Release 4 and a dedicated PRD.                                                                             |
| M11 — Managerial finance                  | Missing      | No invoice, payment, reconciliation, profitability or forecast model/API exists (E0).                                                                                                                                                                                                                                                          | Product Vision Release 5 and a dedicated PRD.                                                                             |
| M12 — Personnel and collaborators         | Missing      | No employee/collaborator, competence, absence, replacement or resource-cost model/API exists (E0).                                                                                                                                                                                                                                             | The Product Vision does not yet provide a sufficient scheduled boundary; create a capability decision before a PRD.       |
| M13 — Suppliers, procurement and orders   | Missing      | No supplier, procurement, purchase order or expense-evidence model/API exists (E0).                                                                                                                                                                                                                                                            | Not normalized into the canonical roadmap; decide the capability boundary before a PRD.                                   |
| M14 — Risk, complaints and improvement    | Missing      | No risk, complaint, corrective action, effectiveness or KPI model/API exists (E0).                                                                                                                                                                                                                                                             | Complaints/corrective action partly relate to Release 4; broader risk/improvement scope requires a decision.              |
| M15 — Dashboards and reports              | Missing      | No operational dashboard, indicator, threshold, drill-down or business report API exists (E0).                                                                                                                                                                                                                                                 | Release 1 Operational Dashboard and UX PRDs.                                                                              |
| M16 — Meetings and multilingual assistant | Missing      | No meeting, recording consent, transcript, translation, glossary or participant confirmation model/API exists (E0).                                                                                                                                                                                                                            | Localization is cross-cutting; the meeting-assistant boundary is not scheduled and needs a PRD before implementation.     |
| M17 — Governed AI                         | Missing      | No AI/RAG runtime exists; the future worker boundary explicitly owns no service (E0).                                                                                                                                                                                                                                                          | AI/Knowledge governance and Product Vision Release 7. Deterministic workflows remain authoritative.                       |
| M18 — Security and continuity             | Partial      | Fail-closed authorization, Workspace isolation, metadata-safe denials and database/migration safety exist (E18). Repository evidence does not prove 3-2-1 backups, restoration exercises, incident operations, device/MFA policy, offline synchronization or secure operational export.                                                        | Platform Security/Reliability/Operations PRD. Treat external infrastructure as not assessable until evidence is attached. |
| M19 — Development governance              | Partial      | Issues, PRDs, ADRs, CI, preflight, exact-head reviews and the repository knowledge system exist (E19). The terminal Codex gate remains advisory under #78, and the repository does not prove the complete external environment topology or a universal rollback/component register.                                                            | Repository workflow and technical governance. This is an engineering boundary, not a client/project business module.      |

## Material conflicts and gaps

| Topic                   | Verified source claim                                                                                                                           | Repository evidence                                                                                                                                                                                                                       | Disposition                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Finality                | Filename/email says final v1.0.                                                                                                                 | Pages 1, 7 and 105 retain proposed-baseline status, incomplete gates and acceptance work.                                                                                                                                                 | Keep non-canonical until the gates are actually evidenced.                                        |
| Provenance              | Page 6 calls 1-525 canonical and 526-765 validated/consolidated.                                                                                | Issue #81 has 104 comments: 102 numbered sessions, plus two non-session comments. Sessions 69 and 91 are absent, and visible numbered answers stop at 525. No atomic 526-765 evidence is linked.                                          | Request the raw addressable export from the father's agent; do not question Iurie again yet.      |
| Identifier quality      | 855 IDs appear individually addressable.                                                                                                        | Only 99 literal base texts exist; 756 rows are literal duplicates.                                                                                                                                                                        | Preserve all IDs, but implement only resolved base rows.                                          |
| Contract origin         | M04 says the Contract starts from the approved Offer.                                                                                           | DEC-117 permits multiple controlled origins, and an existing Project may be linked.                                                                                                                                                       | Existing canonical decision wins unless Iurie explicitly changes it.                              |
| Project creation        | Source summaries imply a Contract/pre-contract sequence before Project.                                                                         | Project/Task authorities allow a potential Project before Contract; the controlled gate applies to activation or later transitions.                                                                                                       | Do not gate Project existence on Contract. Normalize the exact lifecycle transition.              |
| Client identity         | M02 describes one unique Client identifier.                                                                                                     | Shared Client authorities distinguish Client Account, one or more legal entities and their identifiers.                                                                                                                                   | Treat the source wording as too coarse, not as a schema instruction.                              |
| Recovery objectives     | Page 5 says critical RPO 4h/RTO 8h and ordinary 24h/24h.                                                                                        | Issue #81 session 26 records normal RPO max 4h, critical ideal RPO 1h and critical RTO max 4h, with feasibility still partly dependent on Valentin.                                                                                       | Do not adopt either table as final. Normalize one feasible objective set with evidence.           |
| Backup topology         | Page 5 mandates 3-2-1, Synology and an external controlled copy.                                                                                | Security authorities require tested recovery, but do not canonically establish this exact topology; repository evidence cannot verify it.                                                                                                 | Treat as an operational proposal requiring ownership and proof.                                   |
| MFA boundary            | Page 5 and M18 broadly mandate MFA/sensitive access.                                                                                            | DEC-177 requires MFA where policy/risk requires it; the exact “sensitive” boundary and enforcement owner are not mapped.                                                                                                                  | Normalize the policy boundary before implementing a bespoke application gate.                     |
| Approval levels         | Page 4 defines four levels and level-four double confirmation.                                                                                  | No addressable source in #81 establishes that exact universal ladder.                                                                                                                                                                     | Do not generalize it to every module. Define approvals per owning PRD.                            |
| Management report times | Page 5 fixes 08:00, 20:30, Friday 17:00 and monthly 09:00.                                                                                      | No addressable direct source or owning PRD establishes those exact schedules.                                                                                                                                                             | Keep configurable/proposed until operationally confirmed.                                         |
| Roadmap                 | Page 6 places Google integrations in phase 1, finance with commercial work in phase 2, migration in phase 0 and dashboard/reporting in phase 5. | Product Vision sequences operational core first, integrations/document generation in Release 2, commercial in Release 3, audit/training in Release 4, finance in Release 5, migration/search/export in Release 6 and AI/RAG in Release 7. | Product Vision remains canonical. Do not use source phases to open implementation issues.         |
| Acceptance authority    | Every card repeats an acceptance criterion in which Iurie accepts, corrects, rejects or postpones.                                              | Repository policy assigns Iurie business decisions and Dan/agents technical design, proof and merge governance within accepted authority.                                                                                                 | Replace the generic criterion with objective expected results and the correct owner per decision. |

## Repository facts that are stale

These findings are factual maintenance work, not permission to rewrite product authorities inside this reconciliation PR:

- `docs/product/iurie-business-answer-coverage.md` is a 2026-08-16 snapshot over 61 comments. It records 18 fully mapped questions, 29 partial, 2 wrong associations and 229 not atomically mapped out of 278 official questions. It does not cover the current 104-comment issue state.
- issue #81 still says several PRDs await answers even though later comments and the external consolidation now exist.
- `CONTEXT.md` still models Client as the legal organization and describes Project creation from Accepted Offer plus Contract; newer Shared Client and Project decisions supersede that wording.
- #17 still names closed issue #22 as the frontier.
- #52 and #59 still name closed issue #65 as the frontier even though #65, #66, #67 and #88 are closed.
- #53 understates the Activity Log event families already delivered.
- all current product PRDs remain Draft; the source cannot silently promote them.
- no open issue currently carries the `ready-for-agent` state.
- #71 remains legitimately blocked on deployment evidence, and #78 remains open because the terminal review gate is advisory without the required private ruleset capability.

These should be corrected in a small follow-up hygiene issue after #98, with each fact changed only in its owning document or tracker.

## Work that can proceed without asking Iurie again

The reconciliation does **not** require another large questionnaire. Existing authorities and direct evidence are sufficient for the following sequence.

### 1. Finish repository normalization

Merge this report and CSV, then open one small hygiene issue to:

- update the stale issue frontiers and delivered Activity Log facts;
- correct `CONTEXT.md` against the Shared Client and pre-contract Project authorities;
- refresh the #81 comment/session inventory and coverage snapshot;
- link this reconciliation from #81 without copying its 855 rows into issue comments.

This is maintenance, not a product decision.

### 2. Next executable feature: deactivate a Workspace Membership

This is the strongest next tracer bullet because the business direction is already present and the repository has the required identity, Membership, authorization and Activity Log foundations. A focused issue can specify:

- authorized administrator deactivation;
- immediate fail-closed denial on the next request;
- session revocation where the configured identity provider supports it;
- an invariant preventing removal of the last active owner;
- idempotent and concurrency-safe commands;
- an attributable Activity Log transition with a reason;
- metadata-safe failures and Workspace isolation;
- REST and browser proof, including stale-session behavior.

The issue must distinguish application truth from external identity-provider session evidence, but it does not need a new business interview.

### 3. Continue the accepted Release 1 spine

After Membership deactivation, use the existing PRDs to create focused, dependency-aware issues for:

1. Shared Client Account and legal-entity identity;
2. Project/Task lifecycle and completion evidence;
3. Document Registry metadata and immutable versioning;
4. Operational Dashboard evidence drill-down.

Each issue should normalize only the relevant candidate rows from the CSV. It should not import a whole Sarcina module or its repeated generic acceptance criteria.

### 4. Defer later modules to their canonical release

CRM/Offer/Contract, audit/certification/training, finance, migration/search/export and AI/RAG should remain in Product Vision order. Modules M12, M13, the broader M14 scope and the meeting-assistant part of M16 need a capability-boundary decision before a PRD, not immediate implementation issues.

## Smallest required external follow-up

Do not send Iurie another broad questionnaire. Ask the father's agent for a machine-readable export of the claimed 526-765 evidence with one row per item:

| Required field                         | Purpose                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------- |
| Source item ID                         | Resolve 526-765 and the out-of-range duplicate 766 exactly.                            |
| Original prompt/question               | Establish what was actually asked.                                                     |
| Exact answer                           | Preserve the evidence without paraphrase drift.                                        |
| Answer author/decision owner           | Separate Iurie's business answer from agent synthesis or Valentin's feasibility input. |
| Timestamp                              | Establish ordering and supersession.                                                   |
| Stable source URL/comment/file locator | Make the evidence independently inspectable.                                           |
| Agent transformation note              | Explain any merge, split, duplicate or inferred rule.                                  |

If that export cannot be produced, rows 526-765 remain unsourced candidate synthesis. They may still inform future questions, but they cannot close D2 or override existing authorities.

## Questions to ask only when their capability reaches implementation

These are real gaps, but batching them now would recreate the same traceability problem:

- final feasible RPO/RTO targets and proof cadence, with Valentin's operational validation;
- the exact legal/operational consent model for recorded meetings;
- whether M12 Personnel and M13 Procurement belong in this product and in which release;
- the boundary of the broader M14 risk-management scope;
- whether fixed management-report schedules are requirements or configurable examples;
- approval ladders for specific high-risk workflows, rather than one universal four-level model.

## Traceability CSV contract

`sarcina-v1-traceability.csv` is the machine-readable companion to this report.

- Every source identifier appears exactly once.
- `source_status` remains `candidate-noncanonical` until an owning authority changes it.
- `source_authority=unsourced-in-sarcina` means the DOCX row has no atomic evidence locator; it does not mean that no related interview ever occurred.
- `decision_state` records whether the literal base is covered, partial, delegated, contradictory, ambiguous or unverified.
- `implementation_state` is independent of decision state. A canonical requirement can be missing in code, and a delivered behavior can still be only part of a broader candidate rule.
- `duplicate_of` must resolve to another row and must never be implemented as a separate requirement.
- `not-assessable-external` is used when the repository cannot prove or disprove external infrastructure or operations.
- all repository evidence is evaluated against the fixed baseline SHA in each row.

The CSV is deliberately large and mechanical; this report owns the conclusions. Future agents should filter the CSV by module and base rows, not copy the entire file into a new PRD or issue.

## Deliverable policy

GitHub is the maintained source of truth for this reconciliation. If an external email package is later required, generate a versioned DOCX from the reviewed, merged Markdown and identify the source commit in that document. Do not edit an exported DOCX independently and then attempt to synchronize two competing versions.
