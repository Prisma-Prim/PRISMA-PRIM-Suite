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

The [October controlled commercial source reconciliation](commercial-source-reconciliation-2026-10.md) maps the newly received dossier package to existing commercial, pricing and Document owners. It is non-canonical evidence, with source hashes and remaining decisions; it authorizes no operational Templates, prices, acceptance, signatures or numbering. Commercial Workflow §22 owns its workflow consequences.

The [candidate Offer/Contract models](commercial-candidate-models-2026-10.md) turn that primary evidence into blank review skeletons and a located placeholder matrix. They are non-canonical preparation, with operational Template, clause, variant and policy approval still pending.

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

| Capability PRD                                                                                                                           | Document status                                               | Depends on                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Commercial Workflow](release-3-commercial-workflow-prd.md): core sections 1–15 and an index of one file per capability (sections 16–25) | Provisional MVP execution scope — business validation pending | Tenant/Company/Client Authorization; Activity Log; Governed Documents; UX/Configuration                                      |
| [Illustrative Deterministic Pricing](release-3-illustrative-pricing-prd.md)                                                              | Provisional MVP execution scope — business validation pending | Commercial Workflow; Tenant/Company/Client Authorization; Activity Log; UX/Configuration                                     |
| [Confirmed-Cost Profitability Estimate](release-3-confirmed-cost-profitability-estimate-prd.md)                                          | Approved — bounded first journey; runtime not delivered       | Commercial Workflow; Illustrative Deterministic Pricing; Tenant/Company/Client Authorization; Activity Log; UX/Configuration |

The Commercial Workflow PRD owns the reusable Request → Opportunity → pricing → Offer → Contract → Project journey. Its first manual intake slice is specified independently from the still-missing real Tariffs, calculations and Templates.

The Illustrative Deterministic Pricing PRD owns R3B1–R3B4: the Workspace Service Definition and Company Service Offering, the effective-dated Tariff and Pricing Rule Versions, the immutable Pricing Snapshot that references them by exact version, and the governed illustrative fixed net discount created atomically with a new Snapshot (delivered by #458 / #470). It proves catalogue, versioning, provenance, decimal and explicit-adjustment mechanics with illustrative values, and authorizes no real price, ability to perform, discount policy, approval or external effect.

The Confirmed-Cost Profitability Estimate PRD owns a separate manual-input first journey finalized in [#497](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/497): immutable cost/price/result versions and exact Director decisions with independent opt-in assignments. Approval changes no existing illustrative record or Offer and does not claim runtime delivery. Its implementation child and readiness are owned by the live tracker.

R3B4 is an additive slice, not a dependency of the priority Offer O1 slice. Existing Snapshots remain unchanged; the delivered Offer compatibility slice O8 and its Contract follow-up read, check and render the immutable adjustment trace without repricing it (Commercial Workflow PRD [section 18.2](release-3-commercial-18-offers.md#182-offer-and-offer-version) and [section 19.5](release-3-commercial-19-contracts.md#195-quality-checks-and-offer-concordance)).

## 7. Other later releases

Release 2 and Releases 4–7 remain intentionally skeletal in the Product Vision until priority business evidence arrives. Their current order is:

1. Release 2 — Google Drive, Calendar, assisted email, conditional Gmail and document generation;
2. Release 4 — audit, Findings, certification, credentials and Training;
3. Release 5 — operational financial tracking;
4. Release 6 — historical migration, global search and export;
5. Release 7 — approved Knowledge Base, RAG and measured copilots.

Do not decompose these releases into implementation issues merely to populate a backlog.

The [complete My attention drill-down](release-1-operational-dashboard-acceptance-prd.md#20-approved-complete-my-attention-drill-down--2026-10-21)
extends only the existing own-Task attention preview with complete bounded pages,
under delegated agent product review. Its §20 owns the set, unchanged rights,
read lifecycle, acceptance and local-work/publication boundary; approval is not
runtime delivery.

### Bounded operational additions

The [Company Ideas intake PRD](company-ideas-intake-prd.md) defines the separately
selected record/reopen and attributed defer/reject journey, under [Dan's
2026-10-19 access-separation decision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507).
Its status is Approved under [delegated agent product review](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/726#issuecomment-6283532399);
runtime and implementation readiness are not inferred. It consumes Authorization, Activity, UX and Platform owners. This
bounded addition does not approve scoring, funding, work conversion, the broader
risk/improvement module or a reordered whole-release roadmap.

### Bounded ordinary service complaints

The [Company complaint intake PRD](company-complaints-intake-prd.md) defines
ordinary intake and factual action/response/correction history under [Dan's
2026-10-19 access-separation decision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507).
It is Approved v0.2 by [root's 2026-10-20 product disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/731#issuecomment-6284035912)
after ordered Standards/Spec PASS. Its readiness section owns the explicit local-
work exception and canonical-publication dependency. It proves no runtime delivery
or actual assignment.
Authorization, Activity, Client/Project, UX and Platform owners retain
their boundaries. No sending, automatic closure, assurance appeal, reminder,
finance or attachment capability is approved by this bounded addition.

### Bounded Company operational-risk intake

The [Company operational-risk intake PRD](company-operational-risk-intake-prd.md)
prepares an unassessed manual record/reopen, factual follow-up and preserved intake-
correction journey. Dan's separate 2026-10-21 access choice permits explicit
Company consultation/recording assignments without expanding existing rights.
Its status is Approved — bounded first journey, v1.0, following root's ordered
Standards then Spec agent review on 2026-10-21; runtime delivery is not inferred. Authorization, Activity, UX and Platform retain their ownership.
The capability's readiness section owns the local-work/publication boundary.
Scoring, responsible-person assignment, structured journal correction, escalation
and the broader Risk/improvement module remain outside this first journey.

## 8. Delivered foundation and live work routing

The original MVP issue is a historical commercial capability source, not the current complete product authority. The Access and Accountability Release 0 sequence through #22 is delivered. The business-independent Company/RBAC foundation through #64–#67 and the narrow Company Context Access assignment in #88 are also delivered.

Current readiness—including whether an implementation issue is `ready-for-agent`—blockers, progress and delivery children are owned by the [Product Vision tracker #51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51) and its linked tracker hierarchy. The Workspace-authority compatibility cleanup is tracked separately in [#71](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/71). Find candidate executable work through the [live open `ready-for-agent` query](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues?q=is%3Aissue%20is%3Aopen%20label%3Aready-for-agent), then open the selected issue and verify every readiness gate before starting. This index intentionally does not copy current issue state.

## 9. Tracker policy

The repository maintains one Product Vision tracker and one tracker for each cross-cutting and Release 1 capability PRD. Tracker issues:

- link to the canonical file and name current blockers;
- represent hierarchy with parent and dependency links;
- keep all Draft trackers free of the `ready-for-agent` label;
- create vertical implementation children only after the applicable PRD passes every readiness gate.
