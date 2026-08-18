# Product Requirements Index

**Status:** Active navigation authority  
**Owner:** Dan Popescu  
**Ticketing standard:** [Specification and Vertical Ticketing Standard](specification-and-ticketing-standard.md)

## 1. How to use this index

This page locates the canonical product authorities. The linked PRD owns its complete observable behaviour. GitHub tracker issues record status, blockers and delivery children; they must not duplicate the PRD.

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

## 3. Cross-cutting PRDs

| PRD                                                                                              | State                                         | Primary authority                                                         |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------- |
| [Tenant, Company, Client and Authorization](tenant-company-client-authorization-prd.md)          | Draft — first-tenant evidence pending         | Scope, ownership, membership, permissions and approvals                   |
| [Activity Log and Accountability](activity-log-accountability-prd.md)                            | Draft — foundation in progress                | Attributable business events and durable audit history                    |
| [Governed Documents](governed-documents-prd.md)                                                  | Draft — business inventory pending            | Document, Version, Representation, evidence and correction                |
| [Historical Migration, Search and Export](historical-migration-search-export-prd.md)             | Draft — source inventory pending              | Import provenance, findability, export and reconciliation                 |
| [AI and Knowledge Governance](ai-knowledge-governance-prd.md)                                    | Draft — use-case evidence pending             | AI authority, citations, privacy and human approval                       |
| [Platform Security, Reliability and Operations](platform-security-reliability-operations-prd.md) | Draft — operational evidence pending          | Security controls, recovery, observability and service posture            |
| [UX, Localization and Configuration](ux-localization-configuration-prd.md)                       | Draft — role and terminology evidence pending | Accessible workflows, terminology, localization and bounded configuration |

## 4. Release 1 capability PRDs

Release 1 is a sequence of integrated capability slices, not five parallel horizontal projects. Capability PRDs may remain Draft while named evidence is collected. Their implementation children are created only when the readiness gates pass.

| Order | Capability PRD                                                                            | State                                            | Depends on                                                    |
| ----- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| 1     | [Company and RBAC](release-1-company-rbac-prd.md)                                         | Draft — role evidence pending                    | Tenant/Company/Authorization                                  |
| 2     | [Shared Client](release-1-shared-client-prd.md)                                           | Draft — identity evidence pending                | Company/RBAC; Tenant/Company/Authorization                    |
| 3     | [Project and Task](release-1-project-task-prd.md)                                         | Draft — workflow examples pending                | Company/RBAC; Shared Client; Activity Log                     |
| 4     | [Document Registry](release-1-document-registry-prd.md)                                   | Draft — representative Document practice pending | Company/RBAC; Shared Client; Project/Task; Governed Documents |
| 5     | [Operational Dashboard and Acceptance](release-1-operational-dashboard-acceptance-prd.md) | Draft — role and metric evidence pending         | All earlier Release 1 capabilities; UX                        |

## 5. Later releases

Release 2–7 capability PRDs remain intentionally skeletal in the Product Vision until priority business evidence arrives. Their current order is:

1. Release 2 — Google Drive, Calendar, assisted email, conditional Gmail and document generation;
2. Release 3 — commercial intake, catalogue/pricing, Offers and Contracts;
3. Release 4 — audit, Findings, certification, credentials and Training;
4. Release 5 — operational financial tracking;
5. Release 6 — historical migration, global search and export;
6. Release 7 — approved Knowledge Base, RAG and measured copilots.

Do not decompose these releases into implementation issues merely to populate a backlog.

## 6. Existing delivery frontier

The original MVP issue is a historical commercial capability source, not the current complete product authority. The Access and Accountability work remains the Release 0 foundation. Its current implementation frontier continues independently until merged; the new PRD hierarchy does not relabel blocked future work as ready.

## 7. Tracker policy

After these documents merge:

- create one Product Vision tracker;
- create one tracker for each cross-cutting PRD and Release 1 capability PRD;
- link each tracker to its canonical file and name its blockers;
- represent hierarchy with parent and dependency links;
- keep all Draft trackers free of the `ready-for-agent` label;
- create vertical implementation children only after the applicable PRD passes every readiness gate.
