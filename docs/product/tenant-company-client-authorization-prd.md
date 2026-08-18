# PRD — Tenant, Company, Shared Client and Authorization

**Status:** Draft — first-tenant evidence pending  
**Version:** 0.2  
**Owner:** Dan Popescu  
**Decisions:** DEC-014–DEC-036, DEC-063, DEC-177–DEC-179, DEC-191, DEC-193–DEC-195, DEC-212

## 1. Problem statement

The first tenant operates through PRISMA-PRIM, BIC and ECG. Users need one shared Client identity without exposing Company-confidential Projects, Contracts, finance, assurance work or notes. The delivered foundation now resolves explicit Workspace Membership, provider Companies, server-revalidated Company context and the narrow Company Context Access assignment. It does not yet define the target product's broader business permissions or Client visibility.

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

Role names are initial templates. Permissions, not role-name conditions, authorize behaviour.

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

Companies, memberships, role assignments, Clients, legal entities and relationships have explicit active/archived or enabled/disabled states. Critical create, scope change, archive, duplicate resolution and permission changes create canonical Activity Log events.

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

Extend the existing Workspace and Internal User foundation. Replace singleton assumptions through reviewed migrations without invalidating the Access and Accountability work already delivered.

Existing Internal Users receive explicit Workspace Memberships, and existing Activity Log events retain their Workspace and identifiers. Current Access and Activity Log records have no Company ownership to backfill. Any later migration of Company-scoped business records requires explicit evidence; no Company is inferred from names, email domains, or free text.

## 12. Testing decisions

- PostgreSQL-backed REST tests prove Workspace and Company isolation.
- Browser journeys prove context visibility and safe permission states.
- Negative tests cover direct identifiers, lists, counts, search metadata and error differences.
- Permission tests use the public authorization interface, not private role implementation.
- Migration tests exercise expand–backfill–contract from the current Access/#22 schema. They preserve Workspace, Internal User and Activity Log IDs and events, keep `/access/current-actor` and `/activity-log` usable throughout, prove non-destructive inactive membership backfill, and move Activity Log actor/target constraints to membership-aware relationships before contracting the old required `internal_users.workspace_id` and singleton paths.
- Access REST tests prove that missing verified identity returns `401`, while an uninvited principal, inactive Internal User, missing or inactive membership, and every unauthorized or invalid Company selection return non-leaking `403` responses. Uninvited resolution creates no Internal User, membership, or provisioning event.
- Bootstrap and accepted-invitation tests prove atomic creation or resolution, membership establishment, configured-owner assignment only on bootstrap, and exactly-once Internal User provisioning-event semantics under failure, retry, and concurrency.
- Database constraint tests reject cross-Workspace Company, membership, assignment, Activity Log actor, and Activity Log target relationships.

## 13. Acceptance journey

An administrator configures two Companies and users with different scopes. One shared Client is related to both. Each Company creates separate activity. A Company-scoped user sees shared identity and only authorized activity; a Workspace-authorized manager sees the governed consolidated view. Attempts to cross tenant or Company boundaries fail without metadata leakage, and critical access changes appear in authorized history.

## 14. Evidence dependencies

- named first-tenant users and responsibilities;
- who needs authorized consolidated oversight;
- shared versus Company-confidential Client fields;
- representative branch and natural-person cases before their treatment as Client Legal Entities is specified;
- sensitive capability-specific visibility;
- legitimate external-professional access cases;
- future Client portal priority.

Question sources: S00, S01 and S02 in the Romanian question bank.

## 15. Technical dependencies

- schema-impact analysis and the accepted [Workspace tenancy and Company-scoped authorization ADR](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md);
- database isolation strategy and defense-in-depth threat model;
- permission evaluation interface and caching consequences;
- safe support-access design.

## 16. Readiness

The cross-cutting model is ready to govern Release 1 PRDs. The delivered business-independent sequence is [#65 — explicit Workspace membership](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65), then [#66 — Workspace Owner provider-Company registration and view](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66), then [#67 — server-revalidated active Company selection](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67). [#88 — narrow Company Context Access assignment](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) delivered the further business-independent slice approved by DEC-212: the Workspace-scoped `company.assignment.manage` permission, included in the bootstrap Workspace Owner bundle, authorizes grant and revocation of the named `Company Context Access` permission bundle as a canonical Company-scoped Role Assignment for an existing active Workspace Membership. The recipient bundle contains only `company.context.use`; it permits listing and selecting that active Company and grants no business-domain capability. Every other real user assignment, the broader role matrix, detailed business permission bundles, consolidated oversight, Client visibility, deactivation policy beyond preserved active state, and exceptional access remain blocked on first-tenant evidence.
