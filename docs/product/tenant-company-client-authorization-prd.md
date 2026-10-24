# PRD — Tenant, Company, Shared Client and Authorization

**Status:** Draft — Company Director dossier delivered and governed duplicate-resolution boundary approved; wider authorization pending
**Version:** 0.8
**Owner:** Dan Popescu  
**Decisions:** DEC-014–DEC-036, DEC-063, DEC-177–DEC-179, DEC-191, DEC-193–DEC-195, DEC-212, DEC-213
**Profitability authorization direction:** Dan, 2026-09-30, normalized through [#488](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/488)

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
16. As a designated profitability contributor, I want to read and create confirmed-cost estimates for Opportunities I may already read, so that colleagues can prepare the calculation without receiving Director authority.
17. As the explicitly assigned profitability Director, I want to decide one exact estimate version, so that final validation stays separate from preparation.

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
13. Profitability-estimate contribution and Director decision are separate opt-in permissions; neither implies the other.
14. A business title, role label or person identity never substitutes for an explicit captured profitability assignment.

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

The [exact mission Task result contract](release-1-project-task-prd.md#27-approved-exact-mission-task-results-832)
adds independent opt-in **Company Task Result Recorder v1**, containing exactly
`task.result.record`. Existing Company assignment administration explicitly grants
or revokes captured `v1` for an active same-Workspace membership and active Company
through current `company.assignment.manage`. Null/unknown versions fail closed.
No existing Task Manager or other bundle, ownership, title, assignment or migration
gains this permission. It grants no context, Task/Project/Client/Document/content
read, Task management, upload, designation, Organizer, verification, Activity or
administration authority.

New result commands and their committed replay require all independently live
Task-manage/read and exact Project/original-Client plus Document metadata,
Mission Deliverable Access and Content Reader prerequisites from §27. Read-only
result/history access retains the combined read prerequisites without requiring
Recorder. Access serializes required grants against successful revocation or
suspension; captured assignment identity/version enters UI retirement only,
never substitutes for server checks. Its attributable transitions are
`company_task_result_recorder_assignment.granted` and `.revoked`, following the
existing minimal bundle-label Company assignment administration convention,
exactly once per actual state change and never for failed/repeated/replayed state.
No real assignment is authorized by this contract.

The [Project responsible member slice](release-1-project-task-prd.md#21-approved-project-responsible-member-367) adds `project.update`, listed among the initial permissions of the consolidated decision record §8.1. It exists only through captured **Company Project Access v2**, which is v1 (`project.read`, `project.create`) plus `project.update`. Project Access v1 remains exactly read and create. Existing v1 assignments never expand in place and receive no migration grant. A fresh grant after explicit revocation captures v2 through the existing Company assignment administration and its attributable grant/revoke events. Every delivered Project-read and Project-create check accepts captured v1 or v2; `project.update` requires a live v2; null or unknown versions fail closed. In this slice `project.update` authorizes only the responsible-member change defined by the Project/Task PRD. It grants no Task, Document, Client, Company context or administration authority. No other bundle, Workspace ownership, Company Context Access, Company Director Client Access or Task Manager assignment confers it.

The [provisional Project lifecycle](release-1-project-task-prd.md#23-approved-provisional-project-lifecycle-406) adds the opt-in **Company Project Approver v1**. It contains exactly `project.lifecycle.transition` (activate, hold, resume) and `project.close` (complete, cancel): the separate lifecycle-transition and close permissions of Project/Task PRD section 8 and decision record §8.1.

An active administrator with `company.assignment.manage` explicitly grants or revokes the captured v1 assignment for an active same-Workspace membership and an active Company, through the existing Company assignment administration. No existing bundle, assignment, Workspace ownership or migration backfill confers it. Null or unknown captured versions fail closed.

It confers no Company context; no Project read, create or update authority; and no Task, Document, Client or administration authority. Its holder transitions a Project only while independently holding current Project read and Client read for that Project in the active Company.

Its lifecycle is `company_project_approver_assignment.granted` and `company_project_approver_assignment.revoked`. It follows the canonical Company-scoped permission-transition convention stated above for the Company Commercial Activity Reader, including metadata limited to the bundle label and exactly one event per actual state change.

First-tenant configuration grants it only to Iurie's membership in each Company. This is an assignment, not a hard-coded identity.

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

The [stored questionnaire-PDF slice](release-1-document-registry-prd.md#22-approved-provisional-stored-questionnaire-pdfs-633), explicitly approved by Dan on 2026-10-16, adds independent opt-in **Company Document Content Reader v1** (`document.content.read`) and **Company Document Content Uploader v1** (`document.content.upload`). Each contains exactly its named permission. Existing Company assignment administration explicitly grants or revokes it for an active same-Workspace membership and Company, with captured `v1`; null or unknown versions fail closed. The attributable lifecycle events are `company_document_content_reader_assignment.granted` / `.revoked` and `company_document_content_uploader_assignment.granted` / `.revoked`, with the existing assignment-transition metadata convention.

Neither bundle grants context, Client read, Document metadata/reference read, Version management, designation or the other content permission. Existing bundles and assignments never expand automatically. Download additionally requires the current Document metadata/Client/Company read boundary. Upload additionally requires the Reader grant and existing Version-management authority, and revalidates all of them after scanning before committing. No migration or bootstrap implicitly assigns either bundle; real first-tenant grants remain an explicit configuration action.

The [mission-deliverable PDF family](release-1-document-registry-prd.md#23-approved-bounded-mission-deliverable-pdfs-825)
adds the separate opt-in **Company Mission Deliverable Access v1**, containing
exactly `document.mission_deliverable.access`. An active holder of
`company.assignment.manage` explicitly grants/revokes its captured `v1` for an
active same-Workspace membership and active Company through existing Company
assignment administration. Null/unknown captured versions fail closed. Existing
assignments and bootstrap/migration data never gain it implicitly.

The gate adds no Company context, Client, Document register/read/correct,
Version/reference/content, Project/Organizer, designation, Activity or administration
permission. Each mission read/command requires the live gate and its existing
ordinary permissions; questionnaires do not require it. Gate revocation removes
mission metadata/content/history/Activity visibility and mutation/replay authority,
including after an in-flight scan. Content Reader revocation independently hides
protected PDF metadata/history/downloads. Authorization is enforced by the owning
live Company assignment boundary, not a label, cached actor flag or storage path.
Its attributable transitions are
`company_mission_deliverable_access_assignment.granted` and `.revoked`, following
the existing Company assignment event/metadata convention with no real grants.

The [provisional Opportunity next-action update](release-3-commercial-16-opportunity-next-action.md#16-approved-provisional-opportunity-next-action-update-306)
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

The [provisional one-time Client association after Request capture](release-3-commercial-20-client-association.md#20-approved-provisional-one-time-client-association-after-request-capture-450)
adds `commercial.request.client.associate` only through captured **Company
Commercial Intake v3**. Intake v3 is v2 plus that one permission. Intake v1 and
v2 assignments never expand in place and receive no migration backfill grant;
an administrator with `company.assignment.manage` must revoke the old assignment
and issue a fresh grant that captures v3 through the existing attributable
Company assignment lifecycle. Null or unknown versions fail closed.

Every Intake check evaluates contained permissions: delivered Request and
Opportunity read/create checks accept v1, v2, v3 or v4, and next-action update accepts
v2, v3 or v4. Only v3 and v4 permit the association command, and only v4 permits
Sales Stage assignment. The permission grants no
Client read, relationship, Company context, administration, pricing, Offer,
Contract, Activity read or cross-Company authority. Association execution and
exact replay independently require current Request read, current Client read and
an active Client–Company Relationship in the server-validated Company. No other
bundle, assignment, Workspace ownership or migration substitutes for v3.

The [provisional Company commercial Activity read](release-3-commercial-17-commercial-activity-read.md#17-approved-provisional-company-commercial-activity-read-306)
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

Dan's 2026-09-30 Product Owner decision for [#488](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/488) adds two separate opt-in bundles for the [approved first confirmed-cost profitability journey](release-3-confirmed-cost-profitability-estimate-prd.md):

| Bundle                                   | Captured v1 permissions                                                              | Authorized result                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Company Profitability Contributor v1** | `commercial.profitability_estimate.read`, `commercial.profitability_estimate.create` | Read and create estimates for Opportunities the holder may already read             |
| **Company Profitability Director v1**    | `commercial.profitability_estimate.read`, `commercial.profitability_estimate.decide` | Read estimates and record `APPROVE`, `MODIFY` or `REJECT` against one exact version |

An active administrator with `company.assignment.manage` explicitly grants or revokes each captured v1 assignment for an active same-Workspace membership and active Company through existing Company assignment administration. Both are independent. No existing bundle, assignment, Workspace ownership, migration backfill, business title, role-name string or hard-coded identity confers either permission; null or unknown captured versions fail closed.

Contributor v1 grants no Company context, Opportunity read, Director decision, Offer, Contract, Activity Log, assignment administration or cross-Company authority. Estimate read requires live Contributor v1 or Director v1; estimate create requires live Contributor v1. Both operations also require the server-validated active Company and current readability of the target Opportunity through its existing owner.

Director v1 grants only estimate read and `commercial.profitability_estimate.decide`. It grants no estimate create, Company context or Opportunity read. An `APPROVE`, `MODIFY` or `REJECT` command therefore requires live Director v1, current Opportunity readability and the same active Company. A Director who prepares estimates must receive Contributor v1 through the same explicit administration path. Contributor v1 alone never authorizes a Director decision, and a Company Director label without the captured assignments authorizes nothing.

The two assignment lifecycles are `company_profitability_contributor_assignment.granted` / `.revoked` and `company_profitability_director_assignment.granted` / `.revoked`. They follow the canonical Company-scoped permission-transition convention already stated for the Commercial Activity Reader: acting administrator membership, server time, responsible Company, `company_role_assignment` target and bundle-label-only metadata; exactly one event per actual state change; none for repeated state, denied or failed attempts, or exact replay. These administration events remain visible only through the existing assignment-administration boundary and confer no profitability access.

The [provisional Opportunity reassignment](release-3-commercial-21-opportunity-reassignment.md#21-approved-provisional-opportunity-reassignment-399) adds **Company Opportunity Manager v1**, containing exactly `commercial.opportunity.assign`. An administrator with `company.assignment.manage` explicitly grants or revokes the captured v1 bundle for an active same-Workspace membership and active Company through the existing Company assignment administration. It is an independent opt-in bundle: no existing bundle, assignment or backfill confers it, Commercial Intake is unchanged, and null or unknown captured versions fail closed. It authorizes reassignment only while its holder independently retains live captured Commercial Intake read and Company context in the same server-validated active Company. It grants none of those prerequisites and no create, next-action, Client, pricing, Offer, Contract, Activity Log, administration or cross-Company authority, and holding it does not make its holder the responsible actor. Access owns the Opportunity responsible-actor eligibility rule and its narrow membership-and-label query. [Section 23.3](release-3-commercial-23-opportunity-outcome-status.md#233-permission) adds **Company Opportunity Manager v2**, whose permission set is v1 plus `commercial.opportunity.outcome.change`, under the same grant, prerequisite and fail-closed rules; v1 assignments never expand in place, and only revocation followed by a fresh grant captures v2. The bundle's assignment lifecycle is exactly `company_opportunity_manager_assignment.granted` and `company_opportunity_manager_assignment.revoked`, recorded under the same convention, bundle-label-only metadata, one-event-per-actual-state-change rule and administration visibility as the Commercial Activity Reader lifecycle above.

The [provisional configurable Sales Stage contract](release-3-commercial-24-sales-stages.md#243-permissions) adds **Company Sales Stage Configuration v1**, containing exactly `commercial.sales_stage.configure`, an independent opt-in bundle under the same grant, prerequisite and fail-closed rules as Company Opportunity Manager v1, and **Company Commercial Intake v4**, whose permission set is v3 plus `commercial.opportunity.stage.set`; v3 assignments never expand in place, and only revocation followed by a fresh grant captures v4. Every check that accepts v3 also accepts v4. The configuration bundle's assignment lifecycle is exactly `company_sales_stage_configuration_assignment.granted` and `company_sales_stage_configuration_assignment.revoked`, under the same convention, bundle-label-only metadata, one-event-per-actual-state-change rule and administration visibility as the Commercial Activity Reader lifecycle above.

Access owns a narrow eligible-assignee query for the manager's authorized Project
scope. It filters active Internal Users and active same-Workspace memberships by
effective captured Company-context, Project-read, Task-read and Client-read grants,
returning only membership identifiers and display labels. It never exposes email,
unrelated members, denied-candidate counts or exclusion reasons. A non-null new
assignment is revalidated transactionally, including direct submitted identifiers;
assignment itself grants no access. The Project/Task PRD owns the lifecycle and
preserved attribution when a responsible member later becomes ineligible.

The [provisional illustrative Project Template creation journey](release-1-project-task-prd.md#24-approved-provisional-creation-from-an-illustrative-template-634)
adds the explicitly assigned **Company Project Template User v1**, containing
exactly `project.template.read` and `project.template.instantiate`. Company context,
Project and Client read, Project creation and Task authority remain independent
prerequisites owned by that contract. It grants no publishing, stage, lifecycle
or assignment authority and expands no existing captured permission set. Null or
unknown versions fail closed; no migration or first-user backfill grants it.

The [bounded thirteen-activity pilot plan](release-1-project-task-prd.md#28-approved-bounded-thirteen-activity-pilot-plan-836)
adds captured **Company Project Template User v2** through this same assignment
type. Its exact set is v1's two permissions plus `project.template.pilot.read`
and `project.template.pilot.instantiate`, covering only the identified pilot
source and copies. Existingv1 remains legacy-only; it receives no new permission
or source scope in place. An administrator with `company.assignment.manage`
explicitly revokes/regrants to capture v2 for an active same-Workspace member and
Company. Null/unknown versions fail closed; no real assignment is created by
migration or bootstrap. Pilot reads/creation keep the independent Project,
Task and original Client/Company requirements in that contract. User v2 grants
no publishing, stage, lifecycle, assignment, Document or broader business right.
Configuration v1 still publishes only the legacy four-title model. The existing
User grant/revoke event names and minimal bundle-label metadata below apply.

Its `company_project_template_user_assignment.granted` and
`company_project_template_user_assignment.revoked` follow this section's existing
Company-scoped assignment administration and minimal bundle-label Activity
convention. Each actual grant/revocation records one transition, and exact retries
record none. No user or business title substitutes for the explicit assignment.

The [illustrative Project stage gate](release-1-project-task-prd.md#stage-progress-and-deliberate-advance-687)
adds independent opt-in **Company Project Stage Advancer v1**, containing exactly
`project.stage.advance`. The administrator with `company.assignment.manage`
explicitly grants/revokes its captured v1 for an active same-Workspace membership
and active Company. Null or unknown captured versions fail closed. No existing
assignment, Workspace ownership, Project responsibility, Task assignment or
migration confers it, and Project Template User v1 and `project.update` remain
unchanged.

The bundle grants no Company context, Template/Project/Task/original-Client read,
Task management, Project lifecycle or Template publication authority. Advancing
requires those independent copied-plan read prerequisites, including `task.read`
without requiring `task.manage`; ordinary Task completion and reopening still
require their existing Task Manager authority. Live dedicated and independent
read grants are checked before confirming a committed receipt and serialized
against successful revocation or suspension for a new command. Its lifecycle is
`company_project_stage_advancer_assignment.granted` and
`company_project_stage_advancer_assignment.revoked`, using the existing minimal
bundle-label event and Company assignment administration convention.

The [compatible illustrative Template successors](release-1-project-task-prd.md#compatible-immutable-successor-versions-695)
add independent opt-in **Company Project Template Configuration v1**, containing
exactly `project.template.version.create`. Existing Company assignment
administration explicitly grants/revokes captured v1 for an active same-Workspace
membership and Company, with null/unknown versions failing closed. Existing grants,
Workspace ownership, Project responsibility and migration confer nothing. Project
Template User v1 remains exactly read + instantiate.

Configuration grants no context, Project/Template read, Client or Task authority.
Publication independently requires current Company context, Project read and
Template read; it requires no Client or Task authority merely to configure the
four illustrative titles. Exact-version Project instantiation keeps its separate
Project-create, Task Manager and active original Client/Company requirements.
Publication rechecks dedicated creation and catalogue-read authority before
confirming an exact committed receipt, and serializes against successful
revocation/suspension. Its lifecycle is
`company_project_template_configuration_assignment.granted` and
`company_project_template_configuration_assignment.revoked`, under this section's
existing Company administration, bundle-label-only metadata and one-event-per-actual-
state-change convention. It adds no standalone Activity grant.

For the [Company Ideas intake journey](company-ideas-intake-prd.md),
[Dan's 2026-10-19 decision](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507)
separates reading, recording and defer/reject review per Company. The bounded
contract, approved through the capability PRD's delegated agent product review,
uses three independent opt-in captured bundles:

| Bundle                    | Exact captured v1 permissions |
| ------------------------- | ----------------------------- |
| Company Ideas Reader v1   | `idea.read`                   |
| Company Ideas Recorder v1 | `idea.record`                 |
| Company Ideas Reviewer v1 | `idea.disposition.record`     |

An administrator with current `company.assignment.manage` explicitly grants or
revokes each bundle for an active same-Workspace membership and active Company
through existing Company assignment administration. No existing bundle, captured
version, assignment, title, author identity, Workspace ownership or migration
backfill gains any new permission. Null or unknown versions fail closed.

Every operation independently requires current active Company context and live
Reader v1. Recording additionally requires live Recorder v1; a disposition
additionally requires live Reviewer v1. Neither mutation bundle includes read or
Company context. Reviewer grants no Idea recording, work/funding approval,
scoring, Task/Project conversion, confidential-record access or other business
authority. A user who both records and reviews receives both explicit assignments
and Reader. No named real person is assigned by this contract.

Current authority is revalidated, including required assignments, membership,
Internal User and Company, before reads and under transaction locks before a
command or exact committed replay is confirmed. Captured assignment IDs/versions
are exposed through the existing current-actor boundary for coherent UI retirement;
those projections never substitute for live server checks.

Each actual grant/revoke records its canonical
`company_ideas_reader_assignment.granted` / `.revoked`,
`company_ideas_recorder_assignment.granted` / `.revoked`, or
`company_ideas_reviewer_assignment.granted` / `.revoked` transition under this
section's existing Company assignment target, bundle-label-only metadata and
one-event-per-actual-change convention. No-op, denied, failed and exact-replayed
administration commands create no event. Existing administration visibility is
unchanged; Ideas content/history remains a separate restricted capability.

For [ordinary Company complaint intake](company-complaints-intake-prd.md),
[Dan's 2026-10-19 choice](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6273448507)
separates consultation from recording by Company, with no automatic expansion or
real-person assignment. The bounded contract uses two independent opt-in bundles:

| Bundle                         | Exact captured v1 permissions |
| ------------------------------ | ----------------------------- |
| Company Complaints Reader v1   | `complaint.read`              |
| Company Complaints Recorder v1 | `complaint.record`            |

Current `company.assignment.manage` administers each captured assignment explicitly
for an active same-Workspace membership and Company through the existing seam.
No old bundle/version, title, Workspace ownership, author/responsible identity or
migration grants either. Null/unknown captured versions fail closed. Both grant
no Company context, Client/Project, Document, staff-directory, Activity, finance,
assurance, sending, closure, notification or cross-Company authority.

Every read requires live Reader plus active Company context/membership and current
visibility of the original Client/relationship and optional associated Project
through their owners. Recorder independently requires those reads plus its live
captured grant for intake and bounded factual history/corrections. Superseded
original Client permits only its owner's retained read semantics; each new write
requires original Client/relationship active. Project read is required when linked,
not Project mutation or an open lifecycle. Self-responsibility grants nothing.

Commands and exact receipt replay recheck live grants and current related-read
visibility under transaction locks. Resolve a matching committed receipt before
new-write active-original and revision checks; a readable superseded original
permits only that historical replay, never another write/event/fence. Lost current
authority denies replay. UI current-actor captured IDs/versions retire stale state,
never substitute for live checks. Client retains its operational-use/reversal fence
and identity-first lock order.

Actual grants/revocations emit `company_complaints_reader_assignment.granted` /
`.revoked` and `company_complaints_recorder_assignment.granted` / `.revoked` using
this section's existing Company assignment target, bundle-label-only metadata and
one-event-per-actual-change convention. Failed, denied, no-op and exact-replayed
administration commands emit none. Existing administration visibility stays as is;
it never reveals Complaint content/history or adds complaint read implicitly.

For [Company operational-risk intake and manual follow-up](company-operational-risk-intake-prd.md),
Dan's explicit 2026-10-21 access choice separates consultation from recording and
follow-up by Company, without automatic expansion; actual people are chosen later.
The bounded contract uses two independent opt-in captured bundles:

| Bundle                               | Exact captured v1 permissions |
| ------------------------------------ | ----------------------------- |
| Company Operational Risk Reader v1   | `risk.read`                   |
| Company Operational Risk Recorder v1 | `risk.record`                 |

An administrator with current `company.assignment.manage` explicitly grants or
revokes each assignment for an active same-Workspace membership and active Company
through existing Company assignment administration. No existing bundle/version,
assignment, author/responsible identity, job title, Workspace ownership or migration
backfill confers either. Null/unknown captured versions fail closed. Neither
bundle grants Company context, another business capability, staff-directory,
Activity, approval, financial or cross-Company authority.

Every Risk list/detail/history read requires current Reader v1, active Company
context and live membership/Internal User/Company. Recording intake, appending an
observation/reassessment or correcting intake additionally requires current
Recorder v1. Recorder never includes Reader or context. There is no risk approval,
responsibility assignment, score, closure or effectiveness permission in this slice.

Commands and exact committed replay recheck every required live authority under
transaction locks coordinated by Access; they serialize against successful grant
revocation and membership/Internal User/Company deactivation. A matching receipt
is returned only after current authorization and before new-intent revision checks.
Captured assignment IDs/versions enter the existing current-actor boundary for
coherent UI retirement, never as a substitute for server revalidation.

Actual state changes emit `company_operational_risk_reader_assignment.granted` /
`.revoked` and `company_operational_risk_recorder_assignment.granted` / `.revoked`.
They follow this section's existing Company assignment target, administrator
membership/server time and bundle-label-only metadata convention. No-op, denied,
failed and exact-replayed administration commands emit none. Their existing
administration visibility reveals no Risk content and confers no Risk read.

The approved [pending-Offer Contract preparation contract](release-3-commercial-22-controlled-evidence-2026-10.md#224-bounded-pending-offer-contract-preparation-821)
adds **Company Contract Early Preparation v1**, containing exactly
`commercial.contract.prepare_pending_offer`. It is an independent opt-in
captured Company bundle, explicitly granted/revoked through existing assignment
administration by an active administrator with `company.assignment.manage` for
an active same-Workspace member and active Company. No old assignment, title,
Workspace ownership or migration acquires it; absent/null/unknown captured
versions fail closed. No real person is assigned by this contract.

Creating or revising the `OFFER_PREPARATION` origin additionally requires ordinary
captured Contract preparation, exact source Offer/Opportunity read and the
existing Company Client identity-read authority in the same active Company.
This retains the Client recipient-copy boundary; it grants no Client read
through Contract rights. The extra grant supplies none of those prerequisites
and no Client, pricing, approval, signature, Project, Activity, administration or
cross-Company permission. Reads of the resulting Contracts and exact historical
Versions use ordinary Contract/Opportunity read authority, without gaining Offer
or pricing rights. Ordinary approval/signature rights remain independently
captured and require the source-acceptance and check gates in section22.4.

Revocation/suspension is rechecked on new early commands and their receipt replay.
Loaded write drafts and late replies retire when required captured authorities
change; an independently authorized ordinary Contract read owner may retain only
its permitted history. Assignment events are exactly
`company_contract_early_preparation_assignment.granted` and
`company_contract_early_preparation_assignment.revoked`, with existing
administration visibility, bundle-label-only metadata and one event per actual
state change. The #821 delegated product disposition approves this bounded
contract; runtime delivery is tracked in #823.

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
- The profitability slice proves each bundle independently in both directions; explicit grant and revoke; no expansion of existing assignments; read with Contributor v1 or Director v1 plus current Opportunity and Company prerequisites; create only with Contributor v1; Director decision only with Director v1; a Director able to create only after explicit Contributor grant; actors with neither bundle and label-only actors denied; revocation before replay denied; and no cross-Company record, amount, count, event or identifier leakage.

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
- Dan's 2026-09-30 decision permits designated collaborators to read and create confirmed-cost profitability estimates while preserving the final `APPROVE`, `MODIFY` or `REJECT` decision for the explicitly assigned Director. A Director receives create authority only through a separate Contributor assignment; neither a title nor a named person grants access.

Material blockers that remain:

- other first-tenant role/permission bundles beyond the approved Company Director Client slice and the bounded profitability bundles above;
- legitimate exceptional support-access cases, authorization boundary and restricted periods;
- the Client Legal Entity capabilities excluded by [Shared Client PRD section 20](release-1-shared-client-prd.md#20-approved-provisional-additional-client-legal-entities-393);
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

Issue #146 / PR #147 delivered the Company Director's bounded Client permissions, approved shared fields and server-side Company confidentiality. After #148 normalization, one next vertical slice may add governed duplicate resolution for a resolver who holds every affected Company scope. Dan's 2026-09-30 decision additionally normalizes the two profitability bundles above for the bounded first estimate lot, whose bounded first-journey PRD was approved under delegated root review on 2026-10-01 in [#497](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/497); approval is not runtime delivery. Every other broader assignment or permission bundle, asynchronous multi-person approval, consolidated view, broader deactivation and exceptional-access mechanism remains blocked on a separately approved vertical issue.

## 17. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes runtime behaviour by itself. Future implementation issues must cite this PRD after the relevant business evidence has been normalized here.
