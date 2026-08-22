# Product Requirements Index

**Status:** Active navigation authority  
**Owner:** Dan Popescu  
**Ticketing standard:** [Specification and Vertical Ticketing Standard](specification-and-ticketing-standard.md)

## 1. How to use this index

This page locates the canonical product authorities. The linked PRD owns its complete observable behaviour. GitHub tracker issues record current readiness and status, blockers and delivery children; they must not duplicate the PRD.

Before drafting an implementation issue, read the Product Vision, every applicable cross-cutting PRD, the capability PRD, the consolidated decision record, `CONTEXT.md` and relevant ADRs. An implementation issue is not `ready-for-agent` until every gate in the ticketing standard passes.

## 2. Source and process authorities

| Authority                                                                                | Purpose                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Consolidated Product Decision Record](consolidated-product-decision-record.md)          | Approved reconciliation rationale, DEC-001–DEC-212 and interview evidence map  |
| [Product Vision PRD](product-vision-prd.md)                                              | Product position, roadmap, outcomes and boundaries                             |
| [Specification and Vertical Ticketing Standard](specification-and-ticketing-standard.md) | PRD readiness, tracker hierarchy and Matt Pocock-style vertical tracer bullets |
| [Iurie Business Interview Agent Handoff](iurie-business-interview-agent-handoff.md)      | Read-only brief for Iurie's Codex interview assistant                          |
| [Iurie Business Question Bank — Romanian](iurie-business-question-bank-ro.md)            | Business evidence questions and structured answer contract                     |
| [Iurie Interview Coverage Matrix](iurie-business-answer-coverage.md)                     | Question-to-answer provenance, coverage states and unresolved arbitrations     |

## 3. Evidence and non-canonical reconciliation

| Artifact                                                                                                              | Purpose                                                                              |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [Issue #81 snapshot through 2026-08-21](evidence/iurie-business-interview-issue-81-comments-through-2026-08-21.jsonl) | Current immutable 108-comment raw-evidence boundary; non-canonical and evidence-only |
| [Historical issue #81 snapshot](evidence/iurie-business-interview-issue-81-comments.jsonl)                            | Reproducible predecessor boundary of 104 comments through 2026-08-18                 |
| [Sarcina v1.0 reconciliation](sarcina-v1-reconciliation.md)                                                           | Non-canonical source comparison, implementation evidence and unresolved conflicts    |

The [evidence-boundary rollover tracker #112](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/112) records the rollover from 104 to 108 comments. The current boundary contains atomic evidence only for recovered items 702–706; consolidated claims for the missing ranges remain non-atomic. Any later source requires another versioned rollover. The coverage matrix owns semantic classifications and blocker deltas; immutable snapshots are evidence inputs.

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

## 6. Later releases

Release 2–7 capability PRDs remain intentionally skeletal in the Product Vision until priority business evidence arrives. Their current order is:

1. Release 2 — Google Drive, Calendar, assisted email, conditional Gmail and document generation;
2. Release 3 — commercial intake, catalogue/pricing, Offers and Contracts;
3. Release 4 — audit, Findings, certification, credentials and Training;
4. Release 5 — operational financial tracking;
5. Release 6 — historical migration, global search and export;
6. Release 7 — approved Knowledge Base, RAG and measured copilots.

Do not decompose these releases into implementation issues merely to populate a backlog.

## 7. Delivered foundation and live work routing

The original MVP issue is a historical commercial capability source, not the current complete product authority. The Access and Accountability Release 0 sequence through #22 is delivered. The business-independent Company/RBAC foundation through #64–#67 and the narrow Company Context Access assignment in #88 are also delivered.

Current readiness—including whether an implementation issue is `ready-for-agent`—blockers, progress and delivery children are owned by the [Product Vision tracker #51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51) and its linked tracker hierarchy. The Workspace-authority compatibility cleanup is tracked separately in [#71](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/71). Find candidate executable work through the [live open `ready-for-agent` query](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues?q=is%3Aissue%20is%3Aopen%20label%3Aready-for-agent), then open the selected issue and verify every readiness gate before starting. This index intentionally does not copy current issue state.

## 8. Tracker policy

The repository maintains one Product Vision tracker and one tracker for each cross-cutting and Release 1 capability PRD. Tracker issues:

- link to the canonical file and name current blockers;
- represent hierarchy with parent and dependency links;
- keep all Draft trackers free of the `ready-for-agent` label;
- create vertical implementation children only after the applicable PRD passes every readiness gate.
