# Product Requirements Index

**Status:** Active navigation authority  
**Owner:** Dan Popescu  
**Ticketing standard:** [Specification and Vertical Ticketing Standard](specification-and-ticketing-standard.md)

## 1. How to use this index

This page locates the canonical product authorities. The linked PRD owns its complete observable behaviour. GitHub tracker issues record current readiness and status, blockers and delivery children; they must not duplicate the PRD.

Before drafting an implementation issue, read the Product Vision, every applicable cross-cutting PRD, the capability PRD, the consolidated decision record, `CONTEXT.md` and relevant ADRs. An implementation issue is not `ready-for-agent` until every gate in the ticketing standard passes.

## 2. Source and process authorities

| Authority                                                                                | Purpose                                                                                                         |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [Consolidated Product Decision Record](consolidated-product-decision-record.md)          | Approved reconciliation rationale, DEC-001–DEC-213 and interview evidence map                                   |
| [Product Vision PRD](product-vision-prd.md)                                              | Product position, roadmap, outcomes and boundaries                                                              |
| [Specification and Vertical Ticketing Standard](specification-and-ticketing-standard.md) | PRD readiness, tracker hierarchy and Matt Pocock-style vertical tracer bullets                                  |
| [Iurie Business Interview Agent Handoff](iurie-business-interview-agent-handoff.md)      | Read-only brief for Iurie's Codex interview assistant                                                           |
| [Iurie Business Question Bank — Romanian](iurie-business-question-bank-ro.md)            | Business evidence questions and structured answer contract                                                      |
| [Iurie Interview Coverage Matrix](iurie-business-answer-coverage.md)                     | Pinned question-to-answer provenance and historical coverage states                                             |
| [First-tenant Substitution Register](first-tenant-substitution-register.md)              | Provisional MVP stand-ins, the real configuration or document that replaces each, and Iurie's recorded decision |

## 3. Evidence and non-canonical reconciliation

| Artifact                                                                                                                              | Purpose                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Issue #81 comments 109–112 through 2026-08-23](evidence/iurie-business-interview-issue-81-comments-109-112-through-2026-08-23.jsonl) | Verbatim increment containing the rollover note, direction, completion package and Iurie's direct answer |
| [Issue #81 snapshot through 2026-08-21](evidence/iurie-business-interview-issue-81-comments-through-2026-08-21.jsonl)                 | Current immutable 108-comment raw-evidence boundary; non-canonical and evidence-only                     |
| [Historical issue #81 snapshot](evidence/iurie-business-interview-issue-81-comments.jsonl)                                            | Reproducible predecessor boundary of 104 comments through 2026-08-18                                     |
| [Sarcina v1.0 reconciliation](sarcina-v1-reconciliation.md)                                                                           | Non-canonical source comparison, implementation evidence and unresolved conflicts                        |

The [evidence-boundary rollover tracker #112](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/112) records the rollover from 104 to 108 comments. Issue #144 adds immutable comments 109–112 and their semantic delta without reopening recovery of items 526–765. The coverage matrix owns semantic classifications and blocker deltas; immutable snapshots are evidence inputs.

The pinned matrix preserves the duplicate matching/union-design blocker as it stood at the 2026-08-23 evidence snapshot. Later DEC-213 / #148 Product Owner synthesis by Dan resolves one conservative governed duplicate-resolution slice without changing Iurie evidence. General fuzzy matching, asynchronous multi-person approval and Client Legal Entity/branch modelling remain outside that slice. The decision record and owning PRDs resolve only the product-design blocker; live GitHub trackers continue to own current implementation readiness, blockers and delivery state.

## 4. Cross-cutting PRDs

| PRD                                                                                              | Document status | Primary authority                                                         |
| ------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------- |
| [Tenant, Company, Client and Authorization](tenant-company-client-authorization-prd.md)          | Draft           | Scope, ownership, membership, permissions and approvals                   |
| [Activity Log and Accountability](activity-log-accountability-prd.md)                            | Draft           | Attributable business events and durable audit history                    |
| [Governed Documents](governed-documents-prd.md)                                                  | Draft           | Document, Version, Representation, evidence and correction                |
| [Historical Migration, Search and Export](historical-migration-search-export-prd.md)             | Draft           | Import provenance, findability, export and reconciliation                 |
| [AI and Knowledge Governance](ai-knowledge-governance-prd.md)                                    | Draft           | AI authority, citations, privacy and human approval                       |
| [Platform Security, Reliability and Operations](platform-security-reliability-operations-prd.md) | Draft           | Security controls, recovery, observability and service posture            |
| [UX, Localization and Configuration](ux-localization-configuration-prd.md)                       | Draft           | Accessible workflows, terminology, localization and bounded configuration |

## 5. Release 1 capability PRDs

Release 1 is a sequence of integrated capability slices, not five parallel horizontal projects. Capability PRDs may remain Draft while named evidence is collected. Their implementation children are created only when the readiness gates pass.

| Order | Capability PRD                                                                            | Document status | Depends on                                                    |
| ----- | ----------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| 1     | [Company and RBAC](release-1-company-rbac-prd.md)                                         | Draft           | Tenant/Company/Authorization                                  |
| 2     | [Shared Client](release-1-shared-client-prd.md)                                           | Draft           | Company/RBAC; Tenant/Company/Authorization                    |
| 3     | [Project and Task](release-1-project-task-prd.md)                                         | Draft           | Company/RBAC; Shared Client; Activity Log                     |
| 4     | [Document Registry](release-1-document-registry-prd.md)                                   | Draft           | Company/RBAC; Shared Client; Project/Task; Governed Documents |
| 5     | [Operational Dashboard and Acceptance](release-1-operational-dashboard-acceptance-prd.md) | Draft           | All earlier Release 1 capabilities; UX                        |

## 6. Release 3 capability PRDs

| Capability PRD                                                                                  | Document status                                               | Depends on                                                                                                                   |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Commercial Workflow](release-3-commercial-workflow-prd.md)                                     | Provisional MVP execution scope — business validation pending | Tenant/Company/Client Authorization; Activity Log; Governed Documents; UX/Configuration                                      |
| [Illustrative Deterministic Pricing](release-3-illustrative-pricing-prd.md)                     | Provisional MVP execution scope — business validation pending | Commercial Workflow; Tenant/Company/Client Authorization; Activity Log; UX/Configuration                                     |
| [Confirmed-Cost Profitability Estimate](release-3-confirmed-cost-profitability-estimate-prd.md) | Draft — evidence pending                                      | Commercial Workflow; Illustrative Deterministic Pricing; Tenant/Company/Client Authorization; Activity Log; UX/Configuration |

The Commercial Workflow PRD owns the reusable Request → Opportunity → pricing → Offer → Contract → Project journey. Its first manual intake slice is specified independently from the still-missing real Tariffs, calculations and Templates.

The Illustrative Deterministic Pricing PRD owns R3B1–R3B4: the Workspace Service Definition and Company Service Offering, the effective-dated Tariff and Pricing Rule Versions, the immutable Pricing Snapshot that references them by exact version, and the future governed illustrative fixed net discount created atomically with a new Snapshot. It proves catalogue, versioning, provenance, decimal and explicit-adjustment mechanics with illustrative values, and authorizes no real price, ability to perform, discount policy, approval or external effect.

R3B4 is an additive future slice, not a dependency of the priority Offer O1 slice. Existing Snapshots remain unchanged; after R3B4 delivery, a separately approved Offer compatibility slice reads and renders the immutable adjustment trace without repricing it.

## 7. Other later releases

Release 2 and Releases 4–7 remain intentionally skeletal in the Product Vision until priority business evidence arrives. Their current order is:

1. Release 2 — Google Drive, Calendar, assisted email, conditional Gmail and document generation;
2. Release 4 — audit, Findings, certification, credentials and Training;
3. Release 5 — operational financial tracking;
4. Release 6 — historical migration, global search and export;
5. Release 7 — approved Knowledge Base, RAG and measured copilots.

Do not decompose these releases into implementation issues merely to populate a backlog.

## 8. Delivered foundation and live work routing

The original MVP issue is a historical commercial capability source, not the current complete product authority. The Access and Accountability Release 0 sequence through #22 is delivered. The business-independent Company/RBAC foundation through #64–#67 and the narrow Company Context Access assignment in #88 are also delivered.

Current readiness—including whether an implementation issue is `ready-for-agent`—blockers, progress and delivery children are owned by the [Product Vision tracker #51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51) and its linked tracker hierarchy. The Workspace-authority compatibility cleanup is tracked separately in [#71](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/71). Find candidate executable work through the [live open `ready-for-agent` query](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues?q=is%3Aissue%20is%3Aopen%20label%3Aready-for-agent), then open the selected issue and verify every readiness gate before starting. This index intentionally does not copy current issue state.

## 9. Tracker policy

The repository maintains one Product Vision tracker and one tracker for each cross-cutting and Release 1 capability PRD. Tracker issues:

- link to the canonical file and name current blockers;
- represent hierarchy with parent and dependency links;
- keep all Draft trackers free of the `ready-for-agent` label;
- create vertical implementation children only after the applicable PRD passes every readiness gate.
