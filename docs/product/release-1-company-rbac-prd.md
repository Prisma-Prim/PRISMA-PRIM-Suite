# PRD — Release 1 Company and RBAC

**Status:** Draft — evidence and ADR pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; Tenant, Company, Shared Client and Authorization PRD

## 1. Problem statement

The current access foundation resolves one user inside one singleton Workspace, but operational work cannot safely begin until PRISMA-PRIM, BIC and ECG exist as explicit Companies and users receive explainable Workspace- or Company-scoped permissions.

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

- PostgreSQL REST tests for membership, permissions, revocation and isolation;
- browser tests for single/multi-Company context and denial;
- migration test from the current access state;
- public-interface tests rather than direct authorization-table tests;
- negative identifiers, lists and counts.

## 12. Acceptance journey

A current owner configures PRISMA-PRIM, BIC and ECG, assigns one Workspace manager and two differently scoped Company users, and signs in as each. Context, navigation and allowed actions match assignments. Cross-Company attempts fail safely. Assignment changes are visible in Activity Log and deactivation removes access.

## 13. Business evidence

Required before ticketing:

- named users and responsibilities;
- who needs group-wide oversight;
- exact initial permission matrix;
- deactivation and exceptional-access expectations.

Question source: S00 and S01.

## 14. Technical dependencies

- tenancy/Company schema ADR;
- analysis of current Access public interface and migrations;
- Clerk session/revocation behaviour;
- permission evaluation and test seam.

## 15. Readiness

The PRD is structurally complete but not ready for implementation-ticket decomposition. Role evidence and the tenancy ADR are blockers. Issue #22 may proceed independently against the existing Workspace foundation.
