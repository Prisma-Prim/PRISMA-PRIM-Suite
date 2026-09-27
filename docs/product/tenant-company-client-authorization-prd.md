# PRD — Tenant, Company, Shared Client and Authorization

**Status:** Draft — Company Director dossier delivered and governed duplicate-resolution boundary approved; wider authorization pending
**Version:** 0.6
**Owner:** Dan Popescu  
**Decisions:** DEC-014–DEC-036, DEC-063, DEC-177–DEC-179, DEC-191, DEC-193–DEC-195, DEC-212, DEC-213

## 1. Problem statement

The first tenant operates through PRISMA-PRIM, BIC and ECG. Users need one shared Client identity without exposing Company-confidential Projects, Contracts, finance, assurance work or notes. The delivered foundation resolves explicit Workspace Membership, provider Companies, server-revalidated Company context and the narrow Company Context Access assignment. Issue #141 adds only a bootstrap Workspace Owner tracer for minimal shared Client identity and explicit active-Company relationships. It does not define the target product's broader business permissions or complete Client visibility boundary.

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

Role names are initial templates. Permissions, not role-name conditions, authorize behaviour. For the first Shared Client flow, `Company Director` is the approved business actor: the director of a Company may create, view and correct Client dossiers for that Company. Iurie currently directs PRISMA-PRIM, BIC and ECG and therefore requires that authority in all three Companies. A future director receives authority only for the Company they direct, through approved permissions; this decision does not define the wider future role matrix.

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
11. A Company Director's Client authority is limited to the Company or Companies they direct.
12. Cross-Company shared identity never includes Company-confidential operational categories.

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

Issue #141 introduces the narrow Workspace permission `client.manage` only through the configured bootstrap Workspace Owner path. It authorizes listing, searching, creating and explicitly relating the minimal Client identity in a server-validated active Company context. It grants no ordinary Company-user access and no access to operational activity.

The first vertical slice defines a new permission-set version of the delivered fixed Company-scoped `company_director_client_access` bundle that includes `client.duplicate.resolve`. It creates no separate assignment type, standalone grant or wider bundle. Existing active assignments remain on their prior captured version and gain no resolver authority automatically. The active Workspace Owner must explicitly revoke a prior assignment and issue a fresh grant through the existing governed Role Assignment commands before that Company scope can resolve duplicates. The fresh grant records the exact permission-set version or immutable hash; the delivered `company_director_client_assignment.revoked` and `company_director_client_assignment.granted` events attribute the transition and remain the complete assignment lifecycle. Runtime authorization evaluates the version or hash captured by the active assignment, never a mutable current bundle constant, display title or free-form role-name string. Every full comparison requires current Client read authority for every persisted candidate and the resolver-enabled bundle version in each Company in the live candidate review scope defined by the Shared Client PRD. Every union or reversal requires current Client read authority for both Clients and that resolver-enabled version in each affected Company defined there. Every restricted `client_union_operation` detail read requires current Client read authority for every named Client and that same version in every affected Company; generic Activity Log read is insufficient. One cross-Company resolver must direct every affected Company and already hold every affected scope; asynchronous multi-person approval remains separate. Neither Workspace ownership nor ordinary Client read/update access substitutes for that complete authority.

Before resolver authorization is enabled, an additive migration adds a required captured permission-set version or immutable hash and deterministically backfills every current and historical unversioned `company_director_client_access` row to legacy `v1`, whose exact effective permissions are `client.read`, `client.create` and `client.update`. The backfill preserves assignment identity, Company scope, status and existing access, denies `client.duplicate.resolve`, and makes null or unknown versions fail closed. Only an explicit fresh Workspace Owner grant after that migration may capture resolver-enabled `v2` (`v1` plus `client.duplicate.resolve`).

The `client.duplicate.resolve` predicate above gates full candidate comparison, resolver-only pending-review listing and `duplicate_review_reference` lookup in every Company in the live candidate review scope defined by the Shared Client PRD, including the selected Company of a rejected create or correction attempt. Union and reversal require it in every affected Company defined there, while restricted operation detail requires it in every affected Company recorded by the Activity Log authority. Partial authority fails closed without hidden metadata. The [Shared Client PRD](release-1-shared-client-prd.md#11-governed-duplicate-resolution) solely owns warning and reference contents, candidate and conflict outcomes, concurrency behavior, stale-review handling and Document-evidence exclusions.

The separately approved [working Document–Project association slice](release-1-document-registry-prd.md#18-approved-working-project-associations-245)
introduces **Company Document Project Organizer v1**, containing only
`document.project.manage`. An active administrator with `company.assignment.manage`
may explicitly grant or revoke its captured v1 assignment for an active
same-Workspace membership in an active Company, through the existing Company
assignment administration and attributable grant/revoke history. Existing bundles
and assignments receive no added permission or migration backfill grant. Unknown
captured versions fail closed. This bundle authorizes association mutation only
when the actor independently has current Company context, Project and Document
read, and Client read/relationship authority; it grants none of those prerequisites
and no Representation-read authority. The owning Document PRD defines link and
removal state, original Client constraints and record visibility.

The [manual preparation Task slice](release-1-project-task-prd.md#18-approved-manual-preparation-tasks-246)
adds **Company Task Manager v1**, containing exactly `task.read` and `task.manage`.
An administrator with `company.assignment.manage` explicitly grants or revokes the
captured v1 bundle for an active membership and Company in the same Workspace.
Existing assignments receive no new permission; unknown versions fail closed.
The bundle grants no Company context, Project, Client, administration or execution
authority. Its holder must independently possess the owning Project's context and
read prerequisites before reading Tasks; `task.manage` additionally permits their
bounded manual mutations under the Project/Task PRD.

The [Project responsible member slice](release-1-project-task-prd.md#21-approved-project-responsible-member-367) adds `project.update`, listed among the initial permissions of the consolidated decision record §8.1. It exists only through captured **Company Project Access v2**, which is v1 (`project.read`, `project.create`) plus `project.update`. Project Access v1 remains exactly read and create. Existing v1 assignments never expand in place and receive no migration grant. A fresh grant after explicit revocation captures v2 through the existing Company assignment administration and its attributable grant/revoke events. Every delivered Project-read and Project-create check accepts captured v1 or v2; `project.update` requires a live v2; null or unknown versions fail closed. In this slice `project.update` authorizes only the responsible-member change defined by the Project/Task PRD. It grants no Task, Document, Client, Company context or administration authority. No other bundle, Workspace ownership, Company Context Access, Company Director Client Access or Task Manager assignment confers it.

The [working-reference correction slice](release-1-document-registry-prd.md#19-approved-unverified-working-reference-correction-250)
adds `document.correct` only through captured **Company Document Registrar v2**.
Registrar v1 remains exactly `document.read`, `document.register` and
`document.reference.read`; existing v1 assignments never expand in place. A fresh
grant after explicit revocation captures v2, whose permission set is v1 plus
`document.correct`, and the existing attributable grant/revoke commands record the
transition. Runtime authorization requires the live v2 assignment and all read
prerequisites; null or unknown versions fail closed. No other Client, Project,
Workspace or Company permission substitutes for correction authority.

The [provisional official Version slice](release-1-document-registry-prd.md#21-approved-provisional-official-document-versions-400) adds `document.version.manage` only through captured **Company Document Registrar v3** (v2 plus `document.version.manage`). That permission authorizes the Version-management commands the Document Registry PRD section 21 defines. The slice adds `document.version.designate_official` only through the new opt-in **Company Document Approver v1**, which contains exactly that permission.

Registrar v1 and v2 assignments never expand in place. A fresh grant after explicit revocation captures v3, and every delivered Registrar check accepts v3 wherever it accepts v2.

An active administrator with `company.assignment.manage` explicitly grants or revokes the captured Approver v1 for an active same-Workspace membership and an active Company, through the existing Company assignment administration. No existing bundle, assignment, Workspace ownership or migration backfill confers it. It confers no Company context, Document or Representation read, Client read, correction or version-management authority. Null or unknown versions of either bundle fail closed.

Its lifecycle is `company_document_approver_assignment.granted` and `company_document_approver_assignment.revoked`. It follows the canonical Company-scoped permission-transition convention stated in this section for the Company Commercial Activity Reader, including metadata limited to the bundle label and exactly one event per actual state change.

First-tenant configuration grants Approver v1 only to Iurie; this is an assignment, not a hard-coded identity.

The [provisional Opportunity next-action update](release-3-commercial-workflow-prd.md#16-approved-provisional-opportunity-next-action-update-306)
adds `commercial.opportunity.next_action.update` only through captured
**Company Commercial Intake v2**. Intake v1 remains exactly the four read and
create permissions decided by the
[commercial PRD](release-3-commercial-workflow-prd.md#82-explicit-permission);
existing v1 assignments never expand in place and receive no migration backfill
grant. An administrator with `company.assignment.manage` issues a fresh grant
after explicit revocation to capture v2, whose permission set is v1 plus that
update permission, and the existing attributable Company assignment
grant/revoke commands record the transition. Runtime authorization
evaluates the captured version, never a mutable bundle constant or role-name
string; null or unknown versions fail closed. The bundle grants no Client,
Company context, assignment administration, pricing, Offer, Contract, approval,
Activity Log or cross-Company authority, and holding it neither makes the actor
the responsible actor nor permits any other Opportunity mutation.

The [provisional one-time Client association after Request capture](release-3-commercial-workflow-prd.md#20-approved-provisional-one-time-client-association-after-request-capture-450)
adds `commercial.request.client.associate` only through captured **Company
Commercial Intake v3**. Intake v3 is v2 plus that one permission. Intake v1 and
v2 assignments never expand in place and receive no migration backfill grant;
an administrator with `company.assignment.manage` must revoke the old assignment
and issue a fresh grant that captures v3 through the existing attributable
Company assignment lifecycle. Null or unknown versions fail closed.

Every Intake check evaluates contained permissions: delivered Request and
Opportunity read/create checks accept v1, v2 or v3, and next-action update accepts
v2 or v3. Only v3 permits the association command. The permission grants no
Client read, relationship, Company context, administration, pricing, Offer,
Contract, Activity read or cross-Company authority. Association execution and
exact replay independently require current Request read, current Client read and
an active Client–Company Relationship in the server-validated Company. No other
bundle, assignment, Workspace ownership or migration substitutes for v3.

The [provisional Company commercial Activity read](release-3-commercial-workflow-prd.md#17-approved-provisional-company-commercial-activity-read-306)
adds **Company Commercial Activity Reader v1**, containing exactly
`commercial.activity.read`. An administrator with `company.assignment.manage`
explicitly grants or revokes the captured v1 bundle for an active same-Workspace
membership and active Company through the existing Company assignment
administration. It is an independent opt-in bundle: no existing bundle,
assignment or backfill confers it, Commercial Intake v1, v2 and v3 do not include it,
and unknown captured versions fail closed. It authorizes no mutation and no
Request, Opportunity, Client or cross-Company read; its holder sees a commercial
event only when they independently retain current read authority for that event's
commercial target in the server-validated active Company.

That bundle's assignment lifecycle is exactly
`company_commercial_activity_reader_assignment.granted` and
`company_commercial_activity_reader_assignment.revoked`, recorded through the
existing Company assignment administration and visible under its existing
administration boundary rather than through any commercial permission. Both
actions follow the canonical Company-scoped permission-transition convention
already used by the delivered Company assignment bundles: the acting
administrator's membership, server-authoritative time, the responsible Company
scope, a `company_role_assignment` target identifying the affected assignment,
Company, target membership and Internal User, and metadata limited to the bundle
label. No permission name, captured version, previous state or other payload is
added. Exactly one event is recorded per actual assignment state change; a grant
that repeats an already active assignment, a revocation of an already inactive
assignment, an exact idempotent replay of either command and every denied or
failed attempt record none. These events attribute the transition only; neither
recording nor reading them confers `commercial.activity.read` or any commercial
read, and the bundle's permission semantics above are unchanged.

The [provisional Opportunity reassignment](release-3-commercial-workflow-prd.md#21-approved-provisional-opportunity-reassignment-399) adds **Company Opportunity Manager v1**, containing exactly `commercial.opportunity.assign`. An administrator with `company.assignment.manage` explicitly grants or revokes the captured v1 bundle for an active same-Workspace membership and active Company through the existing Company assignment administration. It is an independent opt-in bundle: no existing bundle, assignment or backfill confers it, Commercial Intake is unchanged, and null or unknown captured versions fail closed. It authorizes reassignment only while its holder independently retains live captured Commercial Intake read and Company context in the same server-validated active Company. It grants none of those prerequisites and no create, next-action, Client, pricing, Offer, Contract, Activity Log, administration or cross-Company authority, and holding it does not make its holder the responsible actor. Access owns the Opportunity responsible-actor eligibility rule and its narrow membership-and-label query. The bundle's assignment lifecycle is exactly `company_opportunity_manager_assignment.granted` and `company_opportunity_manager_assignment.revoked`, recorded under the same convention, bundle-label-only metadata, one-event-per-actual-state-change rule and administration visibility as the Commercial Activity Reader lifecycle above.

Access owns a narrow eligible-assignee query for the manager's authorized Project
scope. It filters active Internal Users and active same-Workspace memberships by
effective captured Company-context, Project-read, Task-read and Client-read grants,
returning only membership identifiers and display labels. It never exposes email,
unrelated members, denied-candidate counts or exclusion reasons. A non-null new
assignment is revalidated transactionally, including direct submitted identifiers;
assignment itself grants no access. The Project/Task PRD owns the lifecycle and
preserved attribution when a responsible member later becomes ineligible.

## 9. Lifecycle and accountability

Companies, memberships, role assignments, Clients, legal entities and relationships have explicit active/archived or enabled/disabled states. Critical create, scope change, archive, duplicate resolution and permission changes create canonical Activity Log events only when their owning capability authorizes the event family.

Corrections preserve prior governed identity when it has been used in Documents, Contracts, credentials or financial records. Significant Client corrections record the previous values, every change, server-authoritative date and time, and the actor. A governed duplicate union additionally preserves both original records, source values, Contacts, relationships and the written identity basis. It is reversible under equivalent authority, and reversal never rewrites intervening history or invents ownership for ambiguous later activity.

## 10. UX and error states

- persistent Workspace and Company context;
- consolidated All Companies view only for authorized users;
- Company ownership visible on activity;
- safe 401 for missing verified identity and 403 for established but unauthorized actors;
- not-found semantics that do not disclose hidden records;
- empty states for no Company assignment and no Client relationship;
- explicit conflict flow for possible duplicate Clients.

## 11. Migration

Extend the existing Workspace and Internal User foundation through reviewed migrations without invalidating the Access and Accountability work already delivered. The duplicate-resolution migration must prove from the delivered label-only schema that every legacy `company_director_client_access` assignment becomes immutable `v1` with exactly its existing Client read/create/update authority and no resolver permission before `v2` authorization code is enabled. Migration and authorization tests cover active and revoked rows, null/unknown fail-closed behavior, preserved Company scope/status and the explicit revoke/fresh-grant path to `v2`.

Existing Internal Users receive explicit Workspace Memberships, and existing Activity Log events retain their Workspace and identifiers. Current Access and Activity Log records have no Company ownership to backfill. Any later migration of Company-scoped business records requires explicit evidence; no Company is inferred from names, email domains, or free text.

## 12. Testing decisions

- PostgreSQL-backed REST tests prove Workspace and Company isolation.
- Browser journeys prove context visibility and safe permission states.
- Negative tests cover direct identifiers, lists, counts, search metadata and error differences.
- Permission tests use the public authorization interface, not private role implementation.
- Migration tests exercise expand–backfill–contract from the current Access/#22 schema while preserving identifiers and events.
- Access REST tests prove non-leaking denial for unknown, inactive, membership-less and unauthorized actors.
- Database constraint tests reject cross-Workspace relationships.
- Issue #141 uses REST/PostgreSQL and browser seams to prove that the bootstrap Workspace Owner can create one minimal Workspace Client, relate the same identifier to two active Companies deliberately, and receive no other-Company relationship or activity metadata.
- The next duplicate-resolution slice proves that authorization covers every affected Company as defined by the Shared Client PRD, and that missing, stale, inactive or partial authority denies without revealing hidden activity.
- The commercial Activity Reader slice proves that one committed grant records exactly one `company_commercial_activity_reader_assignment.granted` event and one committed revocation records exactly one `company_commercial_activity_reader_assignment.revoked` event, each attributed to the acting administrator's membership with server time, Company scope, the `company_role_assignment` target and bundle-label-only metadata; that a repeated grant, a repeated revocation, an exact replay and a denied attempt record none; that the captured version stored by the grant is `v1`; and that these events remain visible only under the existing Company assignment administration boundary while conferring no commercial read.

## 13. Acceptance journey

An administrator configures two Companies and users with different scopes. One shared Client is related to both. Each Company creates separate activity. A Company-scoped user sees shared identity and only authorized activity; a Workspace-authorized manager sees a governed consolidated view. Attempts to cross tenant or Company boundaries fail without metadata leakage, and critical access changes appear in authorized history.

## 14. Evidence normalization

The audited evidence boundary and Iurie's direct 2026-08-23 response establish the following business direction:

- Iurie requires authorized consolidated visibility across PRISMA-PRIM, BIC and ECG.
- The current named actors are Iurie, Dan and Valentin.
- Valentin's ordinary business-data access is not desired; his role is technical maintenance.
- Iurie accepted Dan's access to real Client, Contract and amount data when development/intervention requires it, but the authorization boundary, duration and per-category limits remain unresolved.
- Future ordinary Company users must not automatically see another Company's operational activity.
- One shared Client dossier is desired while Company-owned activity remains separated.
- The director of each Company may create, view and correct Client dossiers for that Company. Iurie currently holds that responsibility for all three Companies.
- The Shared Client PRD owns the approved common-field inventory, Company-confidential categories and Client correction/duplicate-history boundary.
- Cross-Company exceptions to that Shared Client confidentiality boundary may be authorized only by Iurie.

Material blockers that remain:

- first-tenant role/permission bundles beyond the approved Company Director Client slice and wider approval delegation;
- legitimate exceptional support-access cases, authorization boundary and restricted periods;
- exact Client Legal Entity and branch modelling for the representative complex case;
- asynchronous multi-person duplicate approval and general fuzzy-matching evaluation against real examples;
- broader deactivation expectations and final `All Companies` product behaviour.

The five-question completion package is satisfied by the direct response preserved in #81 and normalized by #144. It made the Company Director + Shared Client enrichment slice ready and PR #147 delivered it. Dan's separately approved DEC-213 / #148 synthesis authorizes one non-destructive, reversible duplicate-resolution slice without changing Iurie evidence.

Dan approved the reversible #141 tracer before the completion package was answered: shared data was restricted to the server id and display name, only the bootstrap Workspace Owner received `client.manage`, every query and command required an active Company, and reuse required an explicit attach action. The later response expands the canonical target boundary but does not retroactively broaden #141.

Question sources: S00, S01, S02 and the direct 2026-08-23 answer in #81. Provenance owner: issue #81; semantic coverage owner: `docs/product/iurie-business-answer-coverage.md`.

## 15. Technical dependencies

- accepted [Workspace tenancy and Company-scoped authorization ADR](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md);
- database isolation strategy and defense-in-depth threat model;
- permission evaluation interface and caching consequences;
- safe support-access design.

## 16. Readiness

The cross-cutting model is ready to govern Release 1 PRDs. The foundation through #65, #66, #67 and #88 is delivered, and #141 delivers the separately approved conservative Shared Client tracer.

Issue #146 / PR #147 delivered the Company Director's bounded Client permissions, approved shared fields and server-side Company confidentiality. After #148 normalization, one next vertical slice may add governed duplicate resolution for a resolver who holds every affected Company scope. Every broader assignment or permission bundle, asynchronous multi-person approval, consolidated view, broader deactivation and exceptional-access mechanism remains blocked on a separately approved vertical issue.

## 17. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes runtime behaviour by itself. Future implementation issues must cite this PRD after the relevant business evidence has been normalized here.
