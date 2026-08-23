# PRD — Release 1 Company and RBAC

**Status:** Draft — first Company Director Client bundle approved; wider permission matrix pending
**Version:** 0.6
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; Tenant, Company, Shared Client and Authorization PRD

## 1. Problem statement

The delivered access foundation resolves explicit Workspace Membership, provider Companies, server-revalidated Company context and the narrow Company Context Access assignment. Operational work still cannot safely begin until users receive explainable Workspace- or Company-scoped business permissions for PRISMA-PRIM, BIC and ECG.

## 2. Release 1 outcome

An administrator configures the first tenant's Companies, assigns users bounded role templates and users enter a production shell that always shows the active context. The application authorizes through permissions and denies cross-Company activity without metadata leakage.

## 3. User stories

1. As a Workspace Owner, I want to configure the first provider Companies.
2. As a Workspace Admin, I want to invite or manage users and assign Workspace/Company role templates.
3. As a multi-Company user, I want to switch authorized Company context.
4. As a Company user, I want Company-scoped navigation and actions.
5. As a Workspace Manager, I want an authorized All Companies view with explicit ownership.
6. As an administrator, I want to deactivate a user and end business access.
7. As a reviewer, I want Company, membership and role changes attributable.
8. As an unauthorized user, I want a safe denial that reveals no hidden business data.

## 4. In scope

- evolve Workspace from singleton assumption to tenant boundary;
- Company identity, active state and display context;
- Workspace membership and Company-scoped assignments;
- initial role templates and additive permissions;
- current-actor context returned through the public Access interface;
- production shell context selection and permission states;
- Activity Log for critical administration changes;
- migration of existing access records.

## 5. Out of scope

- custom role builder and explicit deny;
- public tenant signup and billing;
- external Client portal;
- advanced temporary-access workflow;
- support impersonation;
- capability-specific sensitive permissions beyond the first operational core.

## 6. Observable rules

1. Every session resolves one active Internal User and Workspace membership.
2. The actor's allowed Workspace/Company scopes are server-authoritative.
3. Selecting All Companies changes the view scope, not record ownership.
4. A client cannot request arbitrary Company authority.
5. Deactivation or assignment removal takes effect according to documented session/revocation behaviour.
6. Company names are configuration data.
7. Every protected read and command uses the same public actor/authorization context.

## 7. Initial role templates

Release 1 supports Workspace Owner, Workspace Admin, Workspace Manager, Company Manager, Project Professional and Read-only. Exact first-tenant assignments and permission bundles are finalized from evidence.

Finance and capability-specific assurance roles may exist as reserved templates but do not authorize absent Release 1 behaviour.

For the first enriched Shared Client flow, `Company Director` is a fixed business role implemented through explicit permissions. The director may create, view and correct Client dossiers only for the Company or Companies they direct. Iurie currently directs all three provider Companies. Future directors do not inherit cross-Company access: each receives only the approved permissions for their own Company.

## 8. UX states

- no verified identity;
- inactive user;
- active user with no Company assignment;
- one Company assigned;
- several Companies with context selector;
- authorized All Companies;
- forbidden action;
- stale/revoked assignment;
- no configured Company during setup.

## 9. Activity Log

Record Company creation/activation changes, membership creation/deactivation and role/scope assignment changes. Event visibility follows authorization.

## 10. Migration

Preserve existing Workspace/Internal User identities and Clerk subject mappings. Add Company and assignment structures through reviewed migrations. Seed/configure first-tenant Companies explicitly; never infer authorization from email domain alone.

## 11. Testing decisions

- [Issue #65](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65) uses the PostgreSQL migration and Access REST seams to prove explicit membership resolution, bootstrap migration, safe missing-membership denial, and preservation of #22 behaviour.
- [Issue #66](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66) uses the public Company REST and authorization interfaces to prove that only the bootstrap Workspace Owner can register and view a provider Company in the current Workspace and that registration records one Activity Log event.
- [Issue #67](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67) uses REST and browser seams to prove visible selection among authorized active Companies, server revalidation on every protected request, and non-leaking invalid or stale selection recovery.
- [Issue #88](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) used REST and browser seams to prove that a Workspace Owner can grant or revoke one narrow Company Context Access Role Assignment for an existing active Workspace Membership. The assignment permits only listing and selecting that active Company; it grants no Client, Project, Document, finance or other domain capability.
- [Issue #141](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/141) uses a distinct bootstrap-only `client.manage` Workspace permission. It does not extend Company Context Access or define an ordinary-user role bundle.
- Cross-cutting migration, isolation, denial, metadata-leakage, and database-constraint cases remain owned by the Tenant, Company, Shared Client and Authorization PRD.

## 12. Acceptance journey

A current owner configures PRISMA-PRIM, BIC and ECG, assigns one Workspace manager and two differently scoped Company users, and signs in as each. Context, navigation and allowed actions match assignments. Cross-Company attempts fail safely. Assignment changes are visible in Activity Log and deactivation removes access.

## 13. Business evidence

The coverage matrix's current audited evidence inventory narrows the first-tenant boundary without completing it.

Confirmed enough to inform this PRD:

- Iurie requires authorized group-wide oversight across PRISMA-PRIM, BIC and ECG;
- the current named actors are Iurie, Dan and Valentin;
- Valentin's ordinary scope is technical maintenance;
- Iurie accepted Dan's access to real Client, Contract and amount data when needed for development/intervention, but the authorization boundary for that exceptional support access is not defined;
- ordinary future Company users must not automatically see another Company's operational activity;
- Iurie is the principal approver for the examples discussed, but the complete approval/delegation set is not established.
- the Company Director is the initial actor who may create, view and correct Client dossiers for their Company;
- Iurie is currently Company Director for PRISMA-PRIM, BIC and ECG;
- a future director's Client authority is limited to the Company they direct;
- cross-Company exceptions for the approved confidential Client-activity categories may be authorized only by Iurie.

Still required before ticketing assignments and permission bundles beyond the approved Company Director Client boundary:

- role/permission bundles beyond the approved Company Director Client boundary;
- authorization boundary for exceptional support access to real data;
- restricted periods and per-category access rules;
- complete approval/delegation and deactivation expectations;
- final product treatment of `All Companies` beyond the already delivered Company-context mechanism.

Question source: S00, S01 and the direct 2026-08-23 answer in #81. Provenance owner: issue #81; semantic coverage owner: [coverage matrix](iurie-business-answer-coverage.md).

## 14. Technical dependencies

- accepted [Workspace tenancy and Company-scoped authorization ADR](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md);
- analysis of current Access public interface and migrations;
- Clerk session/revocation behaviour;
- permission evaluation and test seam.

## 15. Readiness

The PRD is structurally complete. Its delivered business-independent sequence is [#65 — explicit Workspace membership](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/65), [#66 — Workspace Owner provider-Company registration and view](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/66), then [#67 — server-revalidated active Company selection](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/67). [#88 — narrow Company Context Access assignment](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/88) delivered the further approved business-independent slice: a Workspace Owner may grant or revoke an existing active Workspace Membership's narrow access to an active Company context. That named Company-scoped permission bundle permits only listing and selecting the Company and grants no Client, Project, Document, finance or other domain capability.

The conservative #141 tracer grants `client.manage` only through the configured bootstrap Workspace Owner resolution path and requires a server-validated active Company. It does not promote an existing membership through migration and does not extend Company Context Access.

The approved Company Director boundary makes one Client-specific vertical implementation child ready for ticketing after #144 provenance review. It does not make a general role-assignment UI or a consolidated-view child ready. Every other role bundle, broader `All Companies` behaviour, consolidated oversight permission, deactivation rule and exceptional support-access mechanism remains blocked on its owning evidence and issue.

## 16. Evidence authority boundary

The interview coverage matrix maps provenance and semantic completeness. It is not an implementation authority. Any future implementation issue must cite this PRD after the relevant blocker has been normalized here; a raw comment, independently numbered item or matrix row is not sufficient behavioural authority on its own.
