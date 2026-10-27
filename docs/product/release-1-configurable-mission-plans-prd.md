# PRD — Company-configured mission plans

**Status:** Approved bounded MVP contract — ordered Standards then Spec/Product
preparation and root delegated approval, 2026-10-27, under
[#918](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/918) for Dan's
explicit outcome in [#917](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/917).
Approval uses [the standing delegation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237),
not a personal owner review. Product approval is separate from runtime delivery;
this is no new Iurie answer or approval of actual business content.

**Owner:** Dan Popescu. Project/Task [§1 and §§23–29](release-1-project-task-prd.md),
[authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity](activity-log-accountability-prd.md), [UX](ux-localization-configuration-prd.md)
and [Platform](platform-security-reliability-operations-prd.md) retain their authority.

## 1. Problem, outcome and boundary

The delivered thirteen-activity pilot is fixed. A Company cannot configure a
different reusable activity plan without entering ordinary Tasks again. A
configurator publishes a named flat plan once; an independently authorized user
selects an exact Version to create a preparatory Project and its ordinary Tasks.
The measurable outcome is one deliberate creation producing exactly one Task per
selected activity, with no repeated activity/result entry and no changed old copy.

A **Company mission plan** is Company-owned planning content. A **mission plan
Version** is its immutable ordered title/activity/intended-result content. A
**copied mission plan** identifies the exact Version used by one Project and its
one-to-one activity-to-Task mapping. These are Project planning concepts, not a
governed Document, Contract annex, approval, certification policy or workflow stage.

The fixed pilot and legacy illustrative Template remain separate, unchanged
sources. Custom plans have their own identities and explicit authority; publishing
one never edits those sources or expands their captured grants. Intended results,
including certification wording entered as text, prove no achieved result.

### 1.1 User stories

1. As a Company configurator, I publish a named activity/intended-result plan so
   future Projects do not require entering that planning content again.
2. As a configurator, I author planning content without unrelated Client, Project
   or Task access, while other Companies cannot read my Company's source.
3. As an editor, I add, remove, reorder or correct activities in a successor so
   existing published Versions and Project copies remain unchanged.
4. As a reader, I inspect complete catalogue/history pages and an exact Version
   before using it, without silently selecting a different current head.
5. As an independently authorized creator, I select an exact Version and related
   Client to create one preparatory Project with all its ordinary Tasks.
6. As a creator or publisher with a lost response, I explicitly retry the exact
   intent/key to recover one original result rather than duplicate work.
7. As a Project collaborator, I reopen the preserved source and exact Task links,
   then use native Task work without rewriting the copied intended results.
8. As a historical reader, I retain the exact original plan after Task edits,
   later publications, ordinary closure or original Client supersession.
9. As an administrator, I explicitly grant or revoke the dedicated role while
   every existing grant and independent business permission stays unchanged.
10. As a user changing Company, session or access, I receive no old source data or
    late command effects in the new context.
11. As a keyboard or narrow-screen user in any supported interface locale, I can
    inspect/edit/select the complete plan while preserving literal work and retries.
12. As a manual Project/Task user, I retain my unfinished work when an independent
    plan region is unavailable or its configuration permission changes.
13. As a mission collaborator, I distinguish planning/intended results from actual
    declared evidence, review, acceptance and certification.

## 2. Actors, Company ownership and authority

Every operation revalidates verified identity, active Workspace/Internal User/
membership, active Company and live captured grants through Access. There is no
implicit Owner/Director, Project-responsible, Task-assignee or first-user authority.
Authorization §8 owns two independent opt-in captured bundles:

| Bundle                             | Exact v1 permissions                                            |
| ---------------------------------- | --------------------------------------------------------------- |
| Company Mission Plan Configuration | `project.mission_plan.read`, `project.mission_plan.publish`     |
| Company Mission Plan User          | `project.mission_plan.read`, `project.mission_plan.instantiate` |

An administrator with existing `company.assignment.manage` deliberately grants/
revokes through the existing Company assignment owner. Known v1 only; null/unknown
captures fail closed. Both bundles grant no Company context, Client, Project,
Task, Document, Activity, lifecycle, stage or result-review authority. Neither old
Template Configuration v1 nor Template User v1/v2 gains a new permission.

| Operation                                 | Live independent requirements                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Catalogue, exact Version, Version history | Company context and mission-plan read through either known bundle                                                             |
| First or successor publication            | Above plus Configuration v1 publish; no Client, Project or Task access required merely to configure                           |
| New Project from a Version                | User v1 read/instantiate, native Project create/read, Task manage/read and native active original Client/Company requirements |
| Copied-plan read                          | Mission-plan read, native Project/original-Client visibility and Task read; no configuration or instantiate prerequisite      |
| Work on linked Tasks/results/Documents    | Existing independent owners and permissions; copying grants none                                                              |

Read failures preserve 401, safe403 and the established uniform unavailable404
after relevant base authority. No foreign labels, source rows, counts, references,
Task identities or command receipts are disclosed. One Company's source is never
implicitly shared with another Company, even within the same Workspace.

## 3. Content, identity, Versions and history

Each plan and Version has a server-established stable UUID. Version numbers start
at1 and append consecutively within that plan, up to the supported positive
32-bit integer limit; reject overflow. Names need not be globally unique and never
serve as identity or deduplication. Each publication contains:

- a nonblank plan title using the native Project title grammar, at most200characters;
- one to50 ordered activities, each with a stable opaque UUID key, nonblank Task
  title using the native Task title grammar, planned action and intended result;
- planned action and intended result of at most2000Unicode code points each,
  retaining literal internal whitespace, line breaks and Unicode;
- established Company/Workspace, Version number, author membership/display label
  and server publication instant. Expose no author email or unrelated identity.

The server applies native title normalization once. Action/result text must contain
non-whitespace text; it is stored literally. Interface locale never translates
business content. The row UUID is generated for a new editor row and remains stable
through edits/reordering and successor publication. Keys must be valid and unique
within a Version; they carry no authority outside their exact plan/Version context.
Adding/removing/reordering rows and changing all three business cells are supported
in a successor. Old source rows and old Project mappings never change.

These finite limits bound an interactive first slice, not a business rule that a
mission may have at most50 obligations. No required/optional flag, stage, dependency,
due date, assignee, completion predicate or automatic result belongs in the source.
Unknown fields, duplicate keys, empty/oversized lists and malformed identities are
rejected, without partial publication or partially trusted rendering.

There is no persistent draft or separate approval/withdrawal/deletion lifecycle.
The editor's deliberate publish action makes immutable planning content available;
it is not operational certification or approval of completed work. A correction
publishes another complete Version. Every published historical Version remains
readable and explicitly selectable; there is no silent latest-Version substitution.

Catalogue pages contain25 plan summaries plus one-row lookahead, ordered by exact
plan creation instant then plan UUID ascending. An opaque cursor retains PostgreSQL
precision and binds Workspace/Company. Only an optional strict cursor is supported;
malformed, foreign, repeated, array and unsupported query parameters receive safe400
after authority. Return no total or whole-set cap. Summaries include explicit scope,
plan id, current head id/number/title, activity count and publication attribution;
source rows require the owning exact read. Version history has complete25-row pages
ordered by descending number, using an optional strict positive `beforeVersion`
boundary scoped by the plan path. Empty/later-empty/denied/unavailable are distinct.
Reads use coherent read-only snapshots and create no receipt, event or fence.

## 4. Publication commands and failure recovery

First publication creates one plan identity and Version1 atomically. A successor
supplies the exact plan id and observed current head number with the complete
next content; stale expected head is a definite409. Do not silently rebase, overwrite,
merge text or infer a different user intent. Refresh loads the current head for a
deliberate new edit. Historical inspection does not mutate that Version.

Publication uses the existing actor/Workspace stable idempotency convention. One
publication namespace covers first and successor commands. The fingerprint includes
operation, Company, plan/expected-head identity where applicable, and complete
normalized content including row order/keys. An identical committed retry returns
the original exact Version/attribution even after a newer publication. A changed
Company, operation, plan, head or content with the same key is a definite409; no
foreign receipt disclosure. Recheck current dedicated read/publish authority before
returning a receipt. No new-creation precondition replaces a committed-replay check.

Serialize actual publications by plan and expected head and serialize against live
revocation/suspension through native Access lock order: denial first means no new
publication; publication first means one complete attributable Version. Two publishers
with the same observed head yield one successor and one stale conflict; exact
concurrent retries yield one Version, one receipt and one publication event.
Validation, insertion or Activity failure rolls back all of them.

The browser retains the literal submitted content, exact body and key during pending
or uncertain outcome. New save/reload/model-selection controls cannot replace that
owner. Only an explicit identical retry is offered; transport failure, server5xx or
malformed success never silently creates another command. A definite validation,
stale-head, key-conflict or denial is distinguished from uncertainty. A successful
receipt remains confirmed if a subsequent catalogue refresh fails.

## 5. Exact Project creation and preserved Task work

The creator chooses plan identity and exact published Version, reviews its complete
content, then supplies the ordinary Project title and active related original
Client. This creates one `preparatory` Project and exactly one ordinary Task per
activity, initially `todo`, normal priority, unassigned and undated. Each Task's
initial title is that selected source row's normalized title. Action/intended result
remain source context, independently of later Task titles, state or result entries.

The preserved copy binds Project/Workspace/Company/original Client, exact plan and
Version, every ordered activity key and exactly one same-Project Task id per row.
It reads the immutable selected Version, never today's head or current Task titles.
An extra ordinary Task is not another source row. No command attaches a plan to an
existing Project, changes its source, mixes Versions, copies only a subset or
reuses one Task twice. Source Versions and copy mappings cannot be edited/deleted.
Database constraints and immutable guards protect same-scope links and completeness.

Use the native Project and Task creation owners inside the caller-owned transaction,
including their Client barrier/fence, lock order, ordinary histories and events.
Do not duplicate Project/Task business commands or open a nested owning transaction.
Project, all Tasks, preserved source/mapping and creation receipt commit atomically;
failure at the last row leaves none of that new creation or its effects. Concurrent
revocation/suspension and Client invalidation retain existing serialization semantics.

The creation fingerprint includes Company, original Client, Project title and exact
plan/Version identity. Identical/concurrent retries recover the one original Project
without another Task/event/fence. Changed intent with the same key conflicts. A key
already used by manual or illustrative-Template Project creation conflicts here, and
a new copied-Project key cannot later masquerade as a manual creation retry. Retain
all previously valid manual/legacy receipts. A deliberately new key may create
another Project; equal titles are not deduplication.

Current User v1 read/instantiate and native Project/Task read authority precede a
committed retry; native Project-create/Task-manage rights are required only for a new
creation, not to recover an already committed readable copy. After closure or original Client supersession, preserve native historical
Project visibility without requiring the old active-Client/new-creation state or
repeating writes. New creation still requires the active original relationship.
Source publication after selection does not invalidate an explicitly chosen old
Version. Source/configuration access loss retires only its consuming work; ordinary
authorized Project, Task, Document and result owners remain independently usable.

The copied-plan panel lists every initial title/action/intended result and opens the
exact linked Task through its existing owner. Existing Task edits, assignment,
dates, priority, completion/cancellation/reopening and actual result/Document
declarations remain independent. They never rewrite the preserved source or imply
that a planning result was achieved, reviewed, accepted or certified.

## 6. UI, localization and owner lifetime

Use the accepted Prisme Project/configuration frame and existing shared controls.
A dedicated configuration region supports model catalogue/history, exact preview,
new model and successor editing, accessible add/remove/move row controls and clear
publication confirmation. Creation and copied-plan panels compose with the existing
Project workspace and native exact Task continuation. Configuration requires no
manual Project/Task data access just to author planning content.

Manual Project registration and its unfinished title/Client draft remain independent.
New plan configuration/source errors or grant changes do not clear it. New Project
creation preserves exact title/Client/source/key through uncertainty; only its own
controls are protected. A selected copied plan cannot silently retarget to another
Project or Task when responses arrive late. Internal identifiers do not enter the
browser URL/history or become business-facing configuration fields.

Central ro/ru/fr/en interface copy distinguishes loading, empty/later-empty, denied,
unavailable/retry, invalid input, stale head, definite key conflict, uncertainty and
success. Locale-only changes retain page, selected exact Version, literal drafts,
focus and immutable command intent with no new I/O. Consumed identity/session,
Workspace/Company and captured-grant changes permanently retire old requests/commands;
abort or ignore late200/403 before data, navigation, Activity or shared-access effects.
Unrelated grants do not reset an independent Project/Task command owner. No polling,
automatic retry, global router/unload policy or AI-generated content is added.

All rows and actions are keyboard operable, labelled and readable without horizontal
overflow at1440px and390px. Required success/validation and unavailable states remain
accessible. Bounds make the full selected plan inspectable without a hidden total.

## 7. Activity, privacy, source of truth and operations

PostgreSQL/NestJS own planning state, validation, live permission and atomicity.
There is no external integration, background worker or new dependency. Use reviewed
Drizzle migration and the existing append-only Activity owner.

Each actual publication records one `mission_plan.version.published`, targeting the
same-Company plan/Version with only their identifiers, Version number and row count;
no title/action/result body, Client data, financial text, email or command key.
Assignment actions are `company_mission_plan_configuration_assignment.granted`/
`.revoked` and `company_mission_plan_user_assignment.granted`/`.revoked`, following
existing bundle-label-only metadata and one-event-per-actual-transition convention.
Project creation reuses one ordinary `project.created` and one `task.created` per
new Task; its immutable copy record provides source attribution without an extra
duplicate Activity event. Reads, exact retries and rollbacks record no new event.

Activity access remains independent; a publication event additionally requires live
mission-plan read and Company scope. Copies retain the native Project/Task Activity
rules. No plan grant expands Activity or Document content access. Access loss cannot
leak content through an event, cursor, stale UI, response or receipt. Logs remain
sanitized; actual Client documents, data, credentials and environment dumps do not
enter Git. Existing Platform backup/recovery/deployment authorities remain unchanged.

## 8. Migration, compatibility and architectural boundaries

Add Company-owned source/version/ordered-row, receipt and Project-copy structures;
retain immutable selected source identity rather than a mutable current-head lookup.
Native Project/Task owners retain all ordinary mutations. A separate narrow mission
plan owner avoids relaxing the existing fixed pilot/legacy snapshot grammar, guards,
lineage, stage checks or permission captures. Pure actual reuse is permitted when
ownership stays explicit; do not build a generic workflow/approval/template engine.

The additive upgrade creates no model, source row, Project, Task, grant, result,
approval, default assignment or retroactive plan. All old ids, captured sets,
receipts, four-Task and thirteen-Task copies, immutable source contents, stage
transitions and actual result/review/Document bytes remain valid. Historical Project
reads remain possible after normal closure and Client succession. This contract
does not generalize the pilot-only readiness/result-review or stage/closure policy.

No existing source/Project can be deleted or retagged to make a malformed custom
copy appear compatible. Unknown persisted formats/versions fail closed. Migration
proof starts from the genuine preceding schema with representative existing data.

## 9. Public acceptance and delivery readiness

1. Public REST/disposable PostgreSQL proves creation/publication/history and complete
   model/Version pagination beyond25, row bounds/identity/ordering/Unicode and strict
   malformed/foreign input; read-only effects and minimal publication Activity.
2. Prove distinct Configuration/User captures, missing independent native rights,
   null/unknown grants, Owner-title refusal, live revocation/suspension ordering and
   foreign Company/Workspace privacy, including empty catalogue and receipt paths.
3. Two concurrent successor publications from one head, exact and changed-key
   retries, stale head, malformed success and fault rollback retain one immutable
   outcome. Replays after later publication or closed/superseded-Client Projects
   retain exact identity without requiring old creation state.
4. Exact selected Version creates complete native Project/Tasks/mapping/defaults;
   later source publication, Task edits and extra Tasks leave the source unchanged.
   Reject mixed/partial/foreign mappings and cross-owner Project intent collisions.
5. Genuine previous-schema upgrade preserves manual/legacy/pilot data, receipts,
   assignments, stages, result/review and Document links; grants/immutable source
   rows are not widened or backfilled. Ordinary existing journeys still pass.
6. Public HTTP/native-owner App tests cover malformed/foreign/stale responses,
   consumed context round trips, late200/403, explicit refresh, independent drafts,
   all four locales/no-I/O continuity and protected literal/key retry.
7. Registered actual PostgreSQL App at1440/390 deliberately grants only synthetic
   actors, publishes a plan, creates a Project from its exact Version by keyboard,
   opens/edits a linked native Task, publishes a reordered/changed successor and
   reopens the unchanged earlier Project source. Include committed-response-loss
   identical retry and permission loss without destroying unrelated work. Inspect
   original synthetic screenshots and prove no horizontal overflow.

After ordered Standards then Spec/Product preparation and delegated root approval,
merge this contract with current docs-only evidence. Only then create one complete
runtime issue after fresh readiness/fit/ownership inspection. Run doctor before
edits, TDD at the public seam, targeted checks and appropriate broader development,
then bounded review before final exact source/base/tree integration and guarded merge.
Root owns routine monitoring; review/test/proof rules remain in AGENTS/issue-execution.

All required planning examples can be synthetic; no Iurie answer, real model text,
actual grant, Clerk/provider setup or manual user test blocks implementation.
MISSION-CLOSE-01 remains solely in [Mission Obligations§12](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
for one consolidated email. It is neither answered nor waived by configurable plans.

Excluded: real operational model approval, original pilot import/edit, universal
workflow/category editors, required/optional obligations, stages/dependencies,
automatic assignment/dates, result verification/approval, certification, D5/D13
policy, official numbering, prices/legal clauses, signature/payment, actual data,
providers, deployment and whole-MVP completion. These are not hidden prerequisites.
