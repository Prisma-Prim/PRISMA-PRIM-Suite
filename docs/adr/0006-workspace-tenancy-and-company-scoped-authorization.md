---
status: accepted
---

# Use Workspace tenancy with Company-scoped additive authorization

PRISMA-PRIM Suite uses `Workspace` as the customer organization and hard isolation boundary—the role commonly called a SaaS tenant. A `Company` is a provider legal or operational entity inside exactly one Workspace, never a competing isolation boundary. This preserves the existing Workspace concept and identifiers while making costly ownership and authorization seams explicit before operational data is added.

## Identity, membership, and authority

An `Internal User` is global to the application. The verified external identity key `(provider, subject)` is globally unique and resolves to one stable Internal User; email, display name, and Workspace-configured labels never establish identity. The same Internal User may have explicit `Workspace Memberships` in more than one Workspace. A Workspace-relative copy of an Internal User is rejected because it would fragment attribution and make later multi-Workspace access ambiguous.

Clerk remains the invitation-only external identity provider, behind the provider-neutral verified-principal interface. Authentication establishes only the external principal. Access requires an active Internal User and an explicit active Workspace Membership. Membership establishes eligibility to enter that Workspace but grants no business permission by itself. Authorization uses named permission bundles assigned to a Workspace Membership at either Workspace scope or one Company scope. Grants combine additively and the absence of a grant is denial; explicit deny rules are deferred.

There is no public Workspace signup, and an arbitrary first sign-in cannot create a Workspace, Internal User, membership, Activity Log event, or authority. A controlled, idempotent bootstrap operation accepts only its configured verified principal and atomically creates or resolves the Internal User, creates the first Workspace and active membership, assigns the Workspace Owner template, and records the provisioning event if and only if it created the Internal User. An accepted invitation similarly creates or resolves the identity and Internal User as needed, establishes the intended active membership, and records exactly one provisioning event only when it creates the Internal User; it never receives the bootstrap owner assignment merely by being invited. Neither path silently reactivates an inactive Internal User or membership. An uninvited principal is denied without orphan state. Names, email domains, and initial Company names never infer membership or authorization. Exact initial people, assignments, and bundle contents remain configuration evidence outside this decision.

The `(provider, subject)` key is global for the current identity model. Linking several external identities to one person, transferring an identity, and external or Client users require later governed decisions; implementations must not approximate them through email matching.

## Server-authoritative context

The Access module owns one deep public seam that resolves a verified external principal plus a requested Workspace and optional Company selection into a server-authoritative actor context. The context contains the stable Internal User and membership, the authorized Workspace, the effective permission grants, and an optional active Company whose Workspace and scope were verified by the server.

A client-supplied Workspace or Company identifier is only a selection hint and cannot add authority. Missing verified identity returns `401 Unauthorized`. Once identity is verified, an uninvited principal, inactive Internal User, missing or inactive membership, and an unauthorized, stale, unknown, inactive, or cross-Workspace Company selection all return `403 Forbidden` without revealing whether hidden records, Companies, lists, counts, or Activity Log events exist. Workspace-scoped operations need no fabricated Company. Every Company-owned command has exactly one explicit responsible Company. A future “All Companies” view is a separately authorized view scope and never record ownership.

## Persistence and isolation

Every business record carries one `workspace_id`. Every Workspace-owned relationship is constrained to that Workspace. A Company belongs to one Workspace, and Company-owned records carry both `workspace_id` and `company_id` so composite database constraints can reject cross-Workspace references. Workspace Membership and Company-scoped Role Assignment relationships use the same pattern. Activity Log actor and target references that include a global Internal User are constrained through the corresponding Workspace Membership rather than assuming the Internal User belongs to only one Workspace. NestJS authorization and Workspace-scoped query interfaces remain mandatory; PostgreSQL constraints provide defense in depth. Row-Level Security may be evaluated later as an additional control, not as the sole boundary.

Owning modules receive the established actor context and expose narrow authorization-aware interfaces. They do not query Access tables independently, accept authority from request payloads, or reproduce permission conditions in controllers. Activity Log remains append-only business evidence: its actor, Workspace, optional Company scope, action, target, and minimal metadata are server-established and no broader than target visibility.

## Migration from the Access foundation

Migration follows an expand–backfill–contract sequence while `/access/current-actor` and `/activity-log` remain available with their delivered #22 semantics:

1. **Expand:** add membership, Company, and assignment structures while the required `internal_users.workspace_id`, singleton Workspace path, and current composite Activity Log foreign keys remain operational. Add the bootstrap and invitation resolution paths before disabling request-time Workspace creation.
2. **Backfill:** create one membership from each Internal User's existing `workspace_id`, preserving active or inactive access state without deleting either identity or membership. Preserve every Workspace, Internal User, external identity, and Activity Log identifier and event. Infer no Company, role, or broader business permission. A narrow, explicit compatibility path keeps existing active users' current-actor and #22 Activity Log visibility until its owning authorization slice replaces it.
3. **Contract:** switch Access and Activity Log constraints to membership-aware relationships, then remove the singleton constraint, request-time auto-create behavior, compatibility path, and finally the required Internal User Workspace relationship only after all consumers have moved and the upgrade seam passes. Existing events are neither rewritten nor duplicated, and deactivation remains a non-destructive state transition.

Company records are added only through explicit configuration because current Access and Activity Log data contains no Company ownership to infer. The owning PRDs specify executable migration, REST, authorization-interface, isolation, metadata-leakage, and browser test seams.

## Considered options

- **Keep one singleton Workspace:** rejected because it hard-codes the first customer and cannot isolate separate customer Workspaces.
- **Introduce a separate Tenant above Workspace:** rejected because Workspace already owns the correct boundary and a rename adds migration cost without a distinct concept.
- **Make each Company a tenant:** rejected because the approved product shares governed Workspace-level identity while protecting Company activity.
- **Keep Internal Users Workspace-relative:** rejected because one verified person could acquire duplicate local identities and fragmented Activity Log attribution.
- **Let authentication or Company selection grant access:** rejected because provider identity and client input are not business authorization.
- **Use role-name conditions or explicit denies:** rejected in favor of small permission-based interfaces, additive grants, and explainable default denial.
- **Use PostgreSQL Row-Level Security as the only isolation control:** rejected because Workspace-safe application queries, authorization, constraints, and negative tests must remain independently reviewable.

## Consequences and deferred choices

The model adds explicit membership and assignment joins and requires every business module to carry Workspace scope. That cost buys stable attribution, cross-Workspace isolation, Company confidentiality, and testable authorization without hard-coded first-tenant behavior.

This ADR does not choose real users, exact permission bundles or assignments, shared versus Company-confidential Client fields, Project workflows, Document practices, support-access workflow, custom roles, explicit deny, resource-specific membership, invitation administration UI, public signup, subscription billing, or “All Companies” behaviour. Those choices require their owning evidence, PRD, and implementation issue.
