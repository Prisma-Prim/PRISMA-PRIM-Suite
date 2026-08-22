# PRD — Tenant, Company, Shared Client and Authorization

**Status:** Draft — audited first-tenant evidence received; material authorization and Client boundaries pending  
**Version:** 0.3  
**Owner:** Dan Popescu  
**Decisions:** DEC-014–DEC-036, DEC-063, DEC-177–DEC-179, DEC-191, DEC-193–DEC-195, DEC-212

## 1. Problem statement

The first tenant operates through PRISMA-PRIM, BIC and ECG. Users need one shared Client identity without exposing Company-confidential Projects, Contracts, finance, assurance work or notes. The delivered foundation now resolves explicit Workspace Membership, provider Companies, server-revalidated Company context and the narrow Company Context Access assignment. It does not yet define the target product's broader business permissions or complete Client visibility boundary.

## 2. Solution

Use Workspace as the tenant and isolation boundary. Configure provider Companies inside it. Preserve one shared Client Account per real Client dossier, exact Client Legal Entities for contracting and other legal acts, and one Client–Company Relationship for Company-specific context.

Clerk authenticates an external principal. NestJS resolves the local actor and authorizes each business command or query through additive Workspace- or Company-scoped permission assignments with default deny.

## 3. Outcomes

- no business record crosses Workspace boundaries;
- Company ownership is explicit on Company-scoped activity;
- one Client is recognizable across the tenant without revealing unrelated Company activity;
- users understand their active Workspace and Company context;
- permission decisions are deterministic, testable and attributable;
- external professionals and platform support receive no implicit access.

## 4. Actors

Workspace Owner, Workspace Admin, Workspace Manager, Company Manager, Project Professional, Finance, Read-only, limited external professional, Client Contact, platform support and AI capability.

Role names are initial templates. Permissions, not role-name conditions, authorize behaviour. The first tenant's exact assignments remain evidence-dependent.

## 5. User stories

1. As a Workspace Owner, I want each business record isolated to my Workspace, so that another tenant cannot access it.
2. As a Workspace Admin, I want to configure provider Companies, so that legal and operational responsibility is explicit.
3. As a user assigned to more than one Company, I want the active context visible, so that I do not act for the wrong Company.
4. As a Workspace Manager, I want an authorized consolidated view, so that group oversight is possible without ambiguous ownership.
5. As a Company Manager, I want to see only authorized Company activity, so that another Company's confidential work remains protected.
6. As an authorized user, I want to find one shared Client dossier, so that duplicate Client identities are reduced.
7. As an authorized user, I want the exact Client Legal Entity selected for legal acts, so that a shared dossier does not hide the contracting party.
8. As a Company user, I want Company-specific Client context separated from shared identity, so that ownership and confidentiality are clear.
9. As an administrator, I want permission bundles assigned at Workspace or Company scope, so that access remains explainable.
10. As an inactive user, I want access denied immediately, so that previous sessions cannot preserve business authority.
11. As an external professional, I want only explicit limited access, so that participation does not expose the wider tenant.
12. As a Client Contact, I want no implicit internal access, so that a future portal can have a separate model.
13. As platform support, I want exceptional access to require authorization, so that support has no standing tenant visibility.
14. As an auditor of business history, I want critical membership and permission changes attributable, so that access decisions can be reconstructed.
15. As a user without permission, I want a safe denial that does not reveal hidden record existence, so that metadata does not leak.

## 6. Domain model

- **Workspace:** one SaaS tenant and hard data boundary.
- **Company:** provider legal or operational entity inside one Workspace.
- **Internal User:** local business identity connected to a verified external subject.
- **Workspace Membership:** the user's relationship to one Workspace.
- **Role Assignment:** permission bundle at Workspace or Company scope.
- **Client Account:** Workspace-level shared dossier.
- **Client Legal Entity:** exact party identified for contracting, invoicing or certification, distinct from the shared Client Account.
- **Client–Company Relationship:** Company-specific commercial and operational context.

The canonical UI label may remain Client while the internal distinction stays precise.

## 7. Invariants

1. Every business record belongs to exactly one Workspace.
2. Every relation remains inside that Workspace.
3. Every Company-scoped action has exactly one responsible Company.
4. One active Client–Company Relationship exists per Client Account and Company pair.
5. Shared Client identity never grants access to Company activity.
6. Default deny applies when no permission grants the action.
7. Permission grants are additive; explicit deny is deferred.
8. Authentication never substitutes for application authorization.
9. Platform support and AI have no standing business permissions.
10. Clients with critical history are archived rather than hard-deleted.

## 8. Initial permission families

| Area             | Representative permissions                                                                |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Workspace        | settings, membership, role assignment and Company administration                          |
| Client           | shared read/create/update, relationship update, archive and governed duplicate resolution |
| Project and Task | read, create, update, assign and close inside Company scope                               |
| Document         | read, register, govern versions and evidence                                              |
| Commercial       | request, pricing, Offer and Contract actions                                              |
| Assurance        | audit, Finding, Decision and credential actions                                           |
| Finance          | read, record, confirm, reverse and export                                                 |
| Accountability   | read authorized Activity Log events                                                       |
| Integrations     | configure only at the owned connection level                                              |

Exact first-tenant bundles remain configuration evidence, not hard-coded product rules.

## 9. Lifecycle and accountability

Companies, memberships, role assignments, Clients, legal entities and relationships have explicit active/archived or enabled/disabled states. Critical create, scope change, archive, duplicate resolution and permission changes create canonical Activity Log events only when their owning capability authorizes the event family.

Corrections preserve prior governed identity when it has been used in Documents, Contracts, credentials or financial records.

## 10. UX and error states

- persistent Workspace and Company context;
- consolidated All Companies view only for authorized users;
- Company ownership visible on activity;
- safe 401 for missing verified identity and 403 for established but unauthorized actors;
- not-found semantics that do not disclose hidden records;
- empty states for no Company assignment and no Client relationship;
- explicit conflict flow for possible duplicate Clients.

## 11. Migration

Extend the existing Workspace and Internal User foundation through reviewed migrations without invalidating the Access and Accountability work already delivered.

Existing Internal Users receive explicit Workspace Memberships, and existing Activity Log events retain their Workspace and identifiers. Current Access and Activity Log records have no Company ownership to backfill. Any later migration of Company-scoped business records requires explicit evidence; no Company is inferred from names, email domains, or free text.

## 12. Testing decisions

- PostgreSQL-backed REST tests prove Workspace and Company isolation.
- Browser journeys prove context visibility and safe permission states.
- Negative tests cover direct identifiers, lists, counts, search metadata and error differences.
- Permission tests use the public authorization interface, not private role implementation.
- Migration tests exercise expand–backfill–contract from the current Access/#22 schema while preserving identifiers and events.
- Access REST tests prove non-leaking denial for unknown, inactive, membership-less and unauthorized actors.
- Database constraint tests reject cross-Workspace relationships.

## 13. Acceptance journey

An administrator configures two Companies and users with different scopes. One shared Client is related to both. Each Company creates separate activity. A Company-scoped user sees shared identity and only authorized activity; a Workspace-authorized manager sees a governed consolidated view. Attempts to cross tenant or Company boundaries fail without metadata leakage, and critical access changes appear in authorized history.

## 14. Evidence normalization

The coverage matrix's current audited boundary establishes the following business direction strongly enough to inform this PRD without closing its readiness gates:

- Iurie requires authorized consolidated visibility across PRISMA-PRIM, BIC and ECG.
- The current named actors are Iurie, Dan and Valentin.
- Valentin's ordinary business-data access is not desired; his role is technical maintenance.
- Iurie accepted Dan's access to real Client, Contract and amount data when development/intervention requires it, but the authorization boundary, duration and per-category limits remain unresolved.
- Future ordinary Company users must not automatically see another Company's operational activity.
- One shared Client dossier is desired while Company-owned activity remains separated.

Material blockers that remain:

- exact first-tenant role/permission bundles and approval delegation;
- exact cross-Company hidden categories, metadata visibility and exception authority;
- legitimate exceptional support-access cases, authorization boundary and restricted periods;
- field-level shared-versus-Company-confidential Client inventory;
- representative Client Legal Entity cases, including branch and natural-person treatment;
- duplicate-resolution/correction authority;
- broader deactivation expectations and final `All Companies` product behaviour.

The prioritized P0 confidentiality follow-up in the coverage matrix is the current business completion package for this authority.

Question sources: S00, S01 and S02. Provenance owner: `docs/product/iurie-business-answer-coverage.md`.

## 15. Technical dependencies

- accepted [Workspace tenancy and Company-scoped authorization ADR](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md);
- database isolation strategy and defense-in-depth threat model;
- permission evaluation interface and caching consequences;
- safe support-access design.

## 16. Readiness

The cross-cutting model is ready to govern Release 1 PRDs. The business-independent foundation through #65, #66, #67 and #88 is delivered. The current coverage audit narrows the remaining evidence boundary but does not make another business-dependent implementation child ready.

Every assignment or permission bundle beyond Company Context Access, consolidated oversight permissions, shared/confidential Client fields, broader deactivation and exceptional access remain blocked until their owning evidence is normalized into this PRD.

## 17. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes runtime behaviour by itself. Future implementation issues must cite this PRD after the relevant business evidence has been normalized here.
