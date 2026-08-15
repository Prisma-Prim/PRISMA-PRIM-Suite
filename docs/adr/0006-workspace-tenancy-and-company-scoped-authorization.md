---
status: accepted
---

# Use Workspace tenancy with Company-scoped additive authorization

PRISMA-PRIM Suite uses `Workspace` as both the SaaS tenant and the hard isolation boundary. A `Company` is a provider legal or operational entity inside exactly one Workspace; it is not a tenant. This preserves the existing Workspace concept and identifiers while making the costly ownership and authorization seams explicit before operational data is added.

## Identity, membership, and authority

An `Internal User` is global to the application. The verified external identity key `(provider, subject)` is globally unique and resolves to one stable Internal User; email, display name, and tenant-selected labels never establish identity. The same Internal User may have explicit `Workspace Memberships` in more than one Workspace. A Workspace-relative copy of an Internal User is rejected because it would fragment attribution and make later multi-Workspace access ambiguous.

Authentication establishes only the external principal. Access requires an active Internal User and an explicit active Workspace Membership. Membership establishes eligibility to enter that Workspace but grants no business permission by itself. Authorization uses named permission bundles assigned to a Workspace Membership at either Workspace scope or one Company scope. Grants combine additively and the absence of a grant is denial; explicit deny rules are deferred.

There is no public Workspace signup and an arbitrary first sign-in cannot create a Workspace, membership, or authority. A controlled, idempotent bootstrap operation creates the first Workspace, associates one configured verified external identity, creates its explicit membership, and assigns the Workspace Owner template. Later invited principals may enter only through an explicit invitation or membership transition owned by Access. Names, email domains, and first-tenant Company names never infer membership or authorization. The exact first-tenant people, assignments, and permission bundles remain configuration evidence outside this decision.

The `(provider, subject)` key is global for the current identity model. Linking several external identities to one person, transferring an identity, and external or Client users require later governed decisions; implementations must not approximate them through email matching.

## Server-authoritative context

The Access module owns one deep public seam that resolves a verified external principal plus a requested Workspace and optional Company selection into a server-authoritative actor context. The context contains the stable Internal User and membership, the authorized Workspace, the effective permission grants, and an optional active Company whose Workspace and scope were verified by the server.

A client-supplied Workspace or Company identifier is only a selection hint. It cannot add authority, and stale, inactive, cross-Workspace, or unauthorized selections fail with safe semantics that do not reveal whether hidden records, Companies, lists, counts, or Activity Log events exist. Workspace-scoped operations need no fabricated Company. Every Company-owned command has exactly one explicit responsible Company. A future “All Companies” view is a separately authorized view scope and never record ownership.

## Persistence and isolation

Every business record carries one `workspace_id`. Every Workspace-owned relationship is constrained to that Workspace. A Company belongs to one Workspace, and Company-owned records carry both `workspace_id` and `company_id` so composite database constraints can reject cross-Workspace references. Workspace Membership and Company-scoped Role Assignment relationships use the same pattern. Activity Log actor and target references that include a global Internal User are constrained through the corresponding Workspace Membership rather than assuming the Internal User belongs to only one Workspace. NestJS authorization and tenant-scoped query interfaces remain mandatory; PostgreSQL constraints provide defense in depth. Row-Level Security may be evaluated later as an additional control, not as the sole boundary.

Owning modules receive the established actor context and expose narrow authorization-aware interfaces. They do not query Access tables independently, accept authority from request payloads, or reproduce permission conditions in controllers. Activity Log remains append-only business evidence: its actor, Workspace, optional Company scope, action, target, and minimal metadata are server-established and no broader than target visibility.

## Migration from the Access foundation

Migration is additive and reviewed:

1. Preserve every existing Workspace ID, Internal User ID, external provider/subject mapping, and Activity Log event ID. Replace the singleton constraint and runtime auto-create path only after explicit bootstrap and membership resolution are available.
2. Backfill one explicit Workspace Membership for each existing Internal User from its current `workspace_id`. Do not infer a Company, role, or broader permission from a name, email, or current first-tenant convention.
3. Preserve the delivered Access and #22 behaviour while authorization is introduced: current-actor resolution stays idempotent, inactive users remain denied, existing provisioning events remain attributable and visible under their authorized Workspace semantics, retry/concurrency still produces one logical event, and failed provisioning leaves no success event. The migration must not rewrite, duplicate, or detach those events.
4. Introduce default-deny assignments and the configured bootstrap owner before removing legacy singleton provisioning. Any transition mechanism needed to preserve already-delivered behaviour must be explicit, narrow, tested, and removed by the owning implementation issue; it must not silently grant future business capabilities.
5. Add Company records only from explicit configuration. The current Access and Activity Log records have no Company ownership to guess.
6. Remove obsolete columns or compatibility paths only after all consumers use the new public Access interface and an upgrade test from the current migrations proves identifier and behaviour preservation.

## Stable verification seams

- A migration test upgrades a database at the current Access/#22 migration state and proves stable Workspace, Internal User, external-identity, and Activity Log identifiers and associations.
- PostgreSQL-backed REST tests exercise principal resolution, explicit membership, bootstrap idempotency, inactivity, retry, and concurrency through the public Access routes.
- Public authorization-interface tests prove additive grants, default deny, Workspace versus Company scope, revoked or stale assignments, and rejection of client-asserted authority.
- Negative REST tests probe direct identifiers, lists, counts, error semantics, and Activity Log metadata across Workspaces and unauthorized Companies.
- Database constraint tests reject cross-Workspace Company, membership, assignment, actor, and target relationships.
- Browser journeys later prove visible active context and safe empty, stale, and permission states without treating `/ui-baseline` as implemented behaviour.

## Considered options

- **Keep one singleton Workspace:** rejected because it hard-codes the first tenant and cannot provide commercial tenant isolation.
- **Introduce a separate Tenant above Workspace:** rejected because Workspace already owns the correct boundary and a rename adds migration cost without a distinct concept.
- **Make each Company a tenant:** rejected because the approved product shares governed Workspace-level identity while protecting Company activity.
- **Keep Internal Users Workspace-relative:** rejected because one verified person could acquire duplicate local identities and fragmented Activity Log attribution.
- **Let authentication or Company selection grant access:** rejected because provider identity and client input are not business authorization.
- **Use role-name conditions or explicit denies:** rejected in favor of small permission-based interfaces, additive grants, and explainable default denial.
- **Use PostgreSQL Row-Level Security as the only isolation control:** rejected because tenant-safe application queries, authorization, constraints, and negative tests must remain independently reviewable.

## Consequences and deferred choices

The model adds explicit membership and assignment joins and requires every business module to carry Workspace scope. That cost buys stable attribution, multi-tenant isolation, Company confidentiality, and testable authorization without hard-coded first-tenant behavior.

This ADR does not choose real users, exact permission bundles or assignments, shared versus Company-confidential Client fields, Project workflows, Document practices, support-access workflow, custom roles, explicit deny, resource-specific membership, invitation administration UI, public signup, subscription billing, or “All Companies” behaviour. Those choices require their owning evidence, PRD, and implementation issue.
