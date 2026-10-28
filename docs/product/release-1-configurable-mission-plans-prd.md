# PRD — Company-configured mission plans

**Status:** Approved bounded MVP contract — §§1–9 under
[#918](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/918) for
[#917](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/917), and Contract
continuation §10 under [#923](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/923)
for [#922](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/922).
Ordered Standards then Spec/Product preparation and root delegated approval,
2026-10-27, use [the standing delegation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237).
Product approval is separate from runtime delivery; this is no new Iurie answer
or approval of actual business content.
Current-work composition §11 is **Approved** under
[#939](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/939); its separate
readiness statement governs that extension.

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

## 10. Contract to configured mission continuation

**Status:** Approved bounded continuation after ordered Standards then
Spec/Product preparation and root delegated approval, 2026-10-27, under
[#923](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/923), child of
[#922](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/922).
Product approval is separate from runtime and first-tenant business approval.

### 10.1 Outcome and authority

An independently authorized user starts a configured mission directly from an
agreement already eligible for native Project continuation. One deliberate action
creates its preparatory Project, exact selected plan Tasks and preserved source,
and the existing Contract–Project link. The user does not re-enter the Client or
create and link a second Project separately. This joins delivered planning and
commercial paths; it does not interpret the Contract annex or infer obligations.

[Commercial Workflow §19.11](release-3-commercial-19-contracts.md#1911-project-creation-or-linking)
continues to own agreement eligibility, candidates, cardinality, Client resolution,
link revision and visibility; [§31.7](release-3-commercial-31-reported-signing-case-acceptance.md#317-existing-project-continuation-and-events)
owns the qualifying Company-model signing declaration. This section is an explicit
opt-in exception to the empty-Project creation outcome, not a change to those
owners or to manual creation/linking. §§1–9 above own every source/Task-copy rule.

User stories:

1. As a Contract collaborator, I explicitly choose a mission plan and inspect one
   exact Version before creating the linked Project and Tasks together.
2. As a creator, I retain the agreement's server-established Client relationship
   and acknowledge all existing candidates before choosing a new Project.
3. As a manual user, I keep empty Project creation and existing-Project linking
   unchanged, without acquiring a mission-plan or Task permission requirement.
4. As a user with a lost response, I recover the same Project, link and Tasks with
   an explicit identical retry, including after native refresh or lifecycle change.
5. As a collaborator, I open native Task work and the preserved exact source from
   the created Project; successor source publications never rewrite that copy.
6. As a user changing Company, access or interface language, I retain the existing
   separation between protected command work and independent authorized drafts.

### 10.2 Actors, eligibility and exact creation

Require live native Contract read/link and its Opportunity/Client visibility,
independent known-v1 mission-plan User read/instantiate, Project read/create and
Task read/manage for a new configured creation. Configuration alone, role titles,
signatory declarations and Document access confer none of those rights. No new
bundle, captured-set expansion, implicit assignment or actual grant is introduced.

Reuse native eligible CONTRACT/PRECONTRACT states and the current Company-model
evidence qualification. Addendum, unexecuted or unqualified agreements retain
their native refusal. Reuse complete candidate acknowledgement, empty included,
the native over-50-candidate refusal, link capacity and optimistic Contract
revision. A candidate change must cause deliberate review, never blind creation.

The user selects the plan and exact published Version/id/number through existing
complete catalogue/history pages and previews its full content. No plan is
implicitly selected from a Contract title, annex or current source head. A later
source publication does not invalidate the explicitly chosen older Version.

The server alone resolves the Contract's original Client through the native Client
owner under its creation lock. The new Project preserves that actual native
creation Client; the Contract's historical original reference stays unchanged.
Reject a supplied Client override and malformed, foreign or mixed source identity.

One caller-owned transaction creates the preparatory Project, all ordinary Tasks,
immutable copy/mapping, native histories/events/fence, Contract link/revision/event
and command receipt. Defaults and exact one-to-one mapping follow §5. Failure at
the last row/event leaves none of the new creation or its effects. Compose native
owners through a narrow reusable transaction seam; neither nested owning
transactions nor duplicated Project/Task/Client policy is permitted.

The chosen plan is human-selected planning context. Selection proves no identity
with the Contract annex, amendment, complete obligation set, accepted delivery or
certification. Existing activation, stages, result review and closure retain their
independent authority. This command performs no activation or achieved-result act.

### 10.3 Command identity, recovery and history

The existing Contract Workspace/Company/actor command-key namespace owns this user intent.
Its fingerprint distinguishes configured creation from manual creation/linking and
includes Company, exact agreement/Opportunity, normalized Project title, complete
sorted acknowledged candidate ids, expected Contract revision and exact plan/
Version/number. Within that namespace, identical/concurrent retries recover one
outcome; changed intent with the same key conflicts. Preserve Company key isolation
and every old manual/link fingerprint, receipt
and refusal. Do not create a global key namespace shared with unrelated Project
commands. Any internal native creation identity is server-established inside the
same transaction and is not a separate user command or retry.

Current Contract/Opportunity/Client visibility, mission-plan User read/instantiate
and native Project/Task read precede committed replay. Fresh Project-create,
Task-manage, candidate-set, active-Client creation and original-revision checks
must not replace that historical readable replay. Native closure or Client
supersession does not retarget the stored Project, Client, source or link.
Existing manual receipt semantics are not relaxed to share the new path.

Preserve native lock order and whole-command recovery against Client union/reversal,
candidate/Contract changes, revocation and suspension. Denial first creates nothing;
creation first leaves one complete attributable outcome. Replays, read failures
and rollbacks append no extra events. No new Activity family or source-body
metadata is needed: reuse ordinary Project/Task creation and Contract-link events.

### 10.4 Interface, privacy and continuation

Use the existing Prisme Contract continuation and mission-plan source controls.
Configured creation is explicit and optional. Preserve literal title, exact source,
candidate acknowledgement, submitted body and key while pending/uncertain, including
through native Contract/candidate refresh. Mode/source/reload controls cannot
destroy that owner. Only explicit identical retry recovers uncertainty; a confirmed
success remains confirmed if a subsequent list refresh fails.

Consumed identity/session/Company and authority changes permanently retire
consuming work and suppress late data/navigation/Activity/shared-access effects.
Independent manual registration, Contract decision and native Task drafts survive
unrelated plan denial. Locale-only changes preserve focus, literal work, exact
source and command with no I/O. Central ro/ru/fr/en copy distinguishes loading,
empty, unavailable/retry, denied, invalid, stale candidates/revision, definite key
conflict, uncertainty and confirmation. Preserve keyboard use and no horizontal
overflow at1440px and390px. Internal ids never become business fields or URL state.

The confirmed Project opens through existing native continuation. Its preserved
plan and exact linked Task navigation follow §5; later Task edits or source
publications leave that copy intact. Reads disclose no foreign source, receipt,
candidate, Contract, Task or count. No new file, provider, polling or AI is added.

### 10.5 Public acceptance and readiness

1. Public REST/disposable PostgreSQL proves one complete configured create-and-link,
   exact source/defaults/Tasks/mapping, native attribution and no Client input.
2. Prove independent missing/unknown/foreign permissions, native agreement/evidence
   refusal, complete candidate/capacity/revision conflicts and strict malformed or
   mixed source input without partial creation or information disclosure.
3. Exact/concurrent retries, changed-mode/source/Contract intent, last-step rollback,
   live authorization ordering and historical closed/superseded-Client replay keep
   one outcome. Existing empty creation, linking and their receipts remain valid.
4. Public HTTP/native-parent tests prove protected recovery through native refresh,
   context round trips and late200/403, unavailable source, exact continuation,
   no-I/O locale continuity and preserved independent drafts. Audit actual parent
   mounting and consumed authority wiring, not only the isolated new component.
5. Registered actual PostgreSQL App at1440/390 chooses an exact plan by keyboard
   from an eligible synthetic agreement, acknowledges candidates, loses a committed
   response, refreshes and identically retries to one Project/link/Task set. Open
   and edit a native Task, publish a changed successor and reopen the unchanged
   original source. Inspect original synthetic screenshots and overflow.

Product preparation and delegated approval are complete. Runtime delivery and
verification are tracked by [#925](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/925),
under #922; the approved behavior above remains its authority. No real operational
plan, actual assignment, provider setup, manual user test or Iurie answer is required.
MISSION-CLOSE-01 remains solely Mission Obligations§12, for the consolidated email.

Excluded: attach/replace a plan on an existing Project, auto-create on signature,
new obligation/applicability/completion policy, activation, operational model
approval, legal/price/numbering/signature decisions, actual business data/grants,
imports, external providers, deployment and a whole-MVP completion claim.

## 11. Current work for a configured mission plan

**Status:** Approved bounded current-work contract under
[#939](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/939), child of
[#63](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/63).
Ordered independent Standards then Spec preparation passed;
[root delegated approval](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/939#issuecomment-6468646867)
was recorded on 2026-10-28. Product approval is separate from runtime delivery.
This section owns
only the new read composition; §§1–10 and the native owners retain their rules.

### 11.1 Outcome, boundary and stories

A collaborator opens a Company's copied mission plan and compares its complete
preserved intended results with current ordinary Task facts and independently
readable current result declarations. The user can find a later activity, open
its exact native Task, then return to freshly read facts without rewriting the
source. The outcome is complete inspection and continuation without re-entering
planning content or opening each Task merely to inspect its current state.

This is a separate current-work overview for the one-to50-activity Company source
in §§3,5. [Mission Obligations §13](release-1-mission-obligations-prd.md#13-approved-first-vertical--inspect-mission-activityresult-readiness)
remains fixed to its thirteen-activity pilot, with its own diagnostic derivation.
Neither that policy nor its review boundary is generalized to configurable plans.
No new diagnostic state, progress percentage, result count, fulfillment predicate,
qualification, review, acceptance, stage or closure meaning is derived here.
`done`, `cancelled` and a recorded result remain their native factual declarations.

1. As a copied-plan reader, I see each original activity/title/action/intended
   result beside the exact mapped Task's current facts, even after a successor
   source is published or the Task title changes.
2. As a collaborator, I inspect current state, responsibility, due date, priority
   and a current blockage reason without opening every ordinary Task.
3. As an independently authorized result reader, I inspect the latest native
   declaration and its exact frozen Document reference without following a newer
   Document Version or treating it as approved work.
4. As a Task reader without result access, I retain ordinary Task facts and
   continuation without confidential result metadata or an invented empty stream.
5. As a reader of more than25 activities, I reach every row in source order and
   return to the same local display window without additional page requests.
6. As a collaborator, I open the exact native Task, use its independent controls
   and return to freshly read current facts with the preserved source unchanged.
7. As a user with pending or uncertain native Task/result work, I retain its exact
   literal draft, observations and retry identity through overview refresh or
   unrelated plan/result unavailability.
8. As a historical reader, I inspect the same mapping after ordinary closure or
   original Client supersession under current native read authority.
9. As a user changing Company, Project, session or consumed access, I cannot
   restore old protected data or effects through a round trip or a late response.
10. As a keyboard or narrow-screen user in ro/ru/fr/en, I retain the current
    window, literal content and focus across a locale-only change with no I/O.
11. As a manual, legacy or fixed-pilot user, I keep the existing source, native
    work, readiness, review and lifecycle paths without adopting this overview.

### 11.2 Actors and independent authority

Every request re-establishes the verified identity, active Internal User,
Workspace Membership and Company context through Access. The base read consumes
known Configuration v1 or User v1 `project.mission_plan.read`, native Project read,
Task read and the exact Project/original-Client read relationship. It requires
neither publish/instantiate nor Task manage, result Recorder or Reviewer authority.
Titles, assignment and responsibility grant nothing. Null/unknown captures and
foreign Workspace/Company context fail closed, including on a no-copy read.

The optional current result keeps every
[Project/Task §27](release-1-project-task-prd.md#27-approved-exact-mission-task-results-832)
Document metadata, mission-family, content and original-Client
read gate. No plan, Task or review grant substitutes for them. Only a refusal of
that independent native result-read gate becomes the row's unavailable result.
It reveals no declaration/reason, result/Document/Version/PDF identity, actor/time,
title, filename, existence hint or hidden count. Known authorized empty is a
different state. Result access does not require recording or review permission.

Current source and ordinary Task work remain independent of result-only denial.
The existing copied-source read still consumes Task read; actual Task-read loss
retires both source and overview. Plan-read loss retires consuming plan regions
without discarding independently authorized native Task/Document/result work.
A transport or shape failure of this new read does not invalidate a separately
valid existing copied-source read or create authority for another owner.

### 11.3 Native composition and coherent snapshot

The mission-plan owner composes the existing immutable copy/Version, Project,
Task and optional result owners through narrow public read participants. One
caller-owned PostgreSQL repeatable-read, read-only snapshot covers base authority,
original Client/Project visibility, complete source/mapping and every current
Task/result read. Do not join by title, read today's plan head, fan out through
Version history, scan unrelated Project Tasks or query private Document storage.

The current native seams are the copied-plan read, `TaskService`'s transaction
participant and `TaskResultsService`'s factual readiness participant. The latter's
available/current or unavailable union is reusable without its pilot caller's
diagnostic derivation. Reuse native owner DTOs and validation rather than copying
Task, result or Document policy into the mission-plan module. Supply narrowly
needed caller-snapshot participants where a public method currently opens its
own transaction. A method named “within transaction” must actually stay inside
this snapshot throughout its transitive native calls.

Reuse the Client and Document read-only participants delivered with #937 where
their authority is consumed. Validate live Client read authority without command
locks before resolving the Project's original reference. Preserve native
active-or-superseded historical visibility; do not require an active Client or
open Project merely to read. Native read participants take no `FOR SHARE`,
`FOR UPDATE` or other command row locks and open no independent/nested owning
transaction. Do not change global `DatabaseContext` transaction semantics or
weaken native mutation fences to achieve composition.

Concurrent source publication, Task editing or result correction yields one
coherent snapshot, never a source/Task/result mixture assembled from independent
transactions. A later deliberate read observes later committed native facts.
Reads create no schema, receipt, history, Activity event, operational-use fence,
assignment, write, external call, content download or background work.

### 11.4 Public read and whole-response validation

The new endpoint is `GET /projects/:projectId/mission-plan/current-work`. It uses
the existing actor context and UUID Project selection, with no business payload,
filter, cursor, offset or other query parameter. Unsupported query parameters,
including repeated/array forms, receive safe400. Existing
`GET /projects/:projectId/mission-plan` and native Task/result endpoints keep
their response and behavior.

The actor guard retains401 for missing verified identity and safe403 for invalid
context. Inside the read snapshot, live plan/Task/Project and Client base authority
precedes query interpretation and scoped resource lookup. After that authority,
malformed Project identity/query is400; a missing or unreadable Project/original
Client or foreign scoped target is the native uniform unavailable404. No hidden
label, identity, row count or source content enters refusal details.

Return exactly one `overview` member:

| Outcome                                                       | Published value                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| Readable Project with legitimately no Company-configured copy | `overview: null`                                                  |
| Valid configured copy                                         | `overview: { workspaceId, companyId, project, plan, activities }` |

`project` contains the requested `id`, immutable original `clientAccountId` and
current native `status`. `plan` is the existing non-null copied-plan value
`{ projectId, version, tasks }`, including the exact native Version metadata,
ordered source activities and preserved mapping. Each `activities` row contains
`{ activityKey, position, task, result }`. `task` is the current native `TaskView`,
not a second editable model. It includes the native title, version, state,
assignee-or-null, due-date-or-null, priority and applicable blockage declaration
with reason/actor/time. Native completion/cancellation facts retain their meaning.
`result` is exactly `{ kind: 'unavailable' }` or
`{ kind: 'available', current: null | TaskResultDeclaration }`, using §27's
current declaration/reference DTO and no new result qualification or history.
Continuation consumes `task.id` through the existing exact Task-in-Project owner;
no new URL, locator or Document-byte route is returned, and no raw-ID entry is
introduced in the interface.

The server validates the complete bounded persisted composition before returning
success. The browser treats JSON as unknown and validates the complete response
before publishing any row, count, selection or continuation. The server's native
result owner establishes which declaration is current and belongs to that Task;
the browser validates its native shape and the enclosing exact-row binding.
Together these boundaries prove all of:

- requested Project and established Workspace/Company match every scoped field;
- one to50 unique source activity UUID keys, valid source content/Version and
  declared activity count, preserving the exact selected identity and literals;
- complete contiguous zero-based source positions and exactly one unique mapped
  Task per source row, with matching activity key/position and no extra/missing row;
- every native Task identity equals its mapping, with the requested Project,
  same Company and exact original Client, and a valid complete native Task shape;
- every result union is recognized and valid, with protected fields absent from
  unavailable; any available current declaration is the actual latest native
  declaration for that exact Task, with its exact valid §27 reference.

Do not render a trusted prefix, silently drop a bad row, coerce unknown states,
invent defaults or present an older readable result as current. Native HTTP
readers may retain their documented additive-field compatibility; it never relaxes
these consumed invariants or the publisher's exact wrapper/union contract.
Unknown/corrupt copy or source, duplicate/cross-scope/partial mapping, missing
mapped Task, invalid current declaration/reference, malformed success and other
server/transport failures are errors, never null, empty or gate-unavailable success.
In particular, a404 while resolving an already-authorized latest exact result
reference fails the read; do not catch it as the independent gate refusal.

Manual, legacy four-Task and fixed-pilot Projects with no configured instance
legitimately return null only after base authority and Project visibility. A
configured plan cannot have zero rows. For a valid row, only
`available/current: null` says “no result recorded in the application”; unavailable
says nothing about whether a result exists. Neither says no work or evidence
exists outside the application. Extra ordinary Tasks never join the source set.

### 11.5 Interface, refresh and native continuation

Compose a narrowly owned current-work region with existing Project detail and
copied-source/native Task owners in Prisme and existing compatibility coverage.
Clearly label initial source title/action/intended result separately from current
Task title/facts and the human-declared current result. Preserve native literal
text, assignee display labels, exact calendar dates and reasons. No result
editor, assignment form, inferred next action or completion control is added.
Exact native Task detail continues to own all work, result/history and PDF access.

One successful response loads the complete at-most50-row set. Show at most25
activity rows per local display window in preserved source order, with labelled
Previous/Next and current-window position; all rows are reachable, including row26
and row50. Window changes perform no I/O and add no server pagination or search.
There is an explicit Refresh/Retry. Initial entry and a deliberate return from
native Task detail each read current work afresh; neither silently follows a
newer source Version. Refresh and same-context return retain the current window
and restore useful focus when still valid. Newer reads supersede older reads.
Do not poll, automatically retry failed reads or load each activity's source anew.

Loading, ready, legitimately no configured plan, base denied, native unavailable,
malformed/server failure and retry remain distinct. A result-unavailable row
retains current Task facts and its exact native continuation. A failed refresh
never presents retained old facts as freshly confirmed; hide the unconfirmed
projection behind its failure/retry state. Existing source/native owners remain
usable under their own authority. Closed Project and historical original-Client
reads preserve their existing read-only explanations and native mutation refusal.

Overview opening, refresh, window controls and locale changes cannot destroy or
replace pending/uncertain native Task/result intent. Preserve each native owner's
literal draft, exact target, observations, payload and idempotency key; only its
existing explicit identical retry recovers uncertainty. A confirmed native command
stays confirmed when the separate overview refresh fails. Consume no overview
response as a command receipt. Preserve independent manual Project registration,
Task creation/editing, plan publication and Document work under their own owners.

### 11.6 Lifetime, localization and privacy

Consume the actual identity/session, Workspace/Company, selected Project and
source identity, and assignment identities/captured versions used by the base
plan/Project/Client/Task read. Optional result projections separately consume
their native Document/family/content authority. Changing any consumed identity,
selection or authority permanently retires its old owner/generation, held read
and continuation. An A→B→A round trip, including revoke/regrant with equal
permission strings, cannot revive the old generation.

Abort or ignore late200 and late403 before rendering data, navigating, showing
Activity or invoking shared actor/access callbacks. Repeat this through the
actual App/Project/native parent mounting, including held responses that ignore
abort. Optional result-only access changes immediately hide and retire protected
results without clearing independently valid source/Task facts or native drafts;
base Task-read loss also removes the source and overview. Unconsumed publication,
instantiate, Recorder, Reviewer or unrelated grants do not reset this read owner.
Fresh restored authority may start a new read; it never validates an old reply.

Use centralized ro/ru/fr/en copy for headings, state/priority labels, unassigned,
undated, declaration/empty/unavailable distinctions, windows, refresh and errors.
Locale-only changes retain source/result literals, window, exact Task selection,
focus and held requests with no fetch, write, navigation or shared-access effect.
They do not translate business text or reinterpret dates/statuses. Preserve
semantic keyboard actions, visible focus, named controls, wrapped literal text
and accessible errors, with no horizontal overflow at1440px and390px. Internal
identifiers remain internal and never become browser URL/history or business copy.
No result details leak through summaries, errors, logs or stale callbacks.

### 11.7 Public acceptance and readiness

1. Start future runtime RED at public REST/disposable PostgreSQL: publish a
   synthetic plan with at least26 activities, create its exact copy, read every
   ordered current row, and prove the50-row bound. Publish a reordered/changed
   successor, edit the old mapped Task's title/state/assignee/date/priority/block
   reason and record/correct its native result. Refresh preserves the old exact
   source/mapping while returning current native facts; extra Tasks stay excluded.
2. Prove authorized empty versus current result versus independent metadata/
   family/content denial with no protected-field/count leakage. Native result
   correction and later Document designation preserve exact references; §27 owns
   byte/qualification proof. Ordinary Task read/continuation remains usable after
   result denial, and existing source read survives a new-read transport failure.
3. Exercise every consumed missing/null/unknown/foreign capture, inactive actor,
   Company/Workspace and Project/original-Client boundary, malformed identity/
   query, invalid source/mapping/Task/result shape and exact-reference refusal.
   Prove safe base error ordering, no partial rendering and no malformed-as-empty.
   Closed Projects and readable superseded original Clients retain exact history.
4. Public native/API PostgreSQL tests prove the caller's one repeatable-read,
   read-only snapshot through all participants, including Client and Document
   access, with no nested transaction, command row lock, event/history/receipt,
   fence advance or PDF-byte read. Controlled concurrent Task/result/source edits
   produce coherent snapshots; re-read observes the later commits. Existing copy,
   manual/legacy/pilot, readiness/review and native work regressions remain valid.
5. Actual App HTTP/native-parent tests prove whole-response validation, all local
   windows, exact Task continuation and fresh return, deliberate refresh,
   source/Task/result independence and protected pending/uncertain/confirmed native
   intent. Cover consumed Company/Project/session/source/base/result capture
   A→B→A, held late200/403 and unrelated-grant continuity before any shared effect.
   In each of four locales, ready and held-read changes preserve literal nodes,
   window, exact selection, focus and unchanged I/O counts.
6. Register the real App/API/disposable PostgreSQL journey at1440×900 and390×844.
   By keyboard, open a later local window, compare old preserved intended results
   with edited current Task/result facts after successor publication, open the
   exact native Task and return freshly, refresh and inspect optional result
   denial without losing ordinary work. Inspect original synthetic screenshots
   for readable labels, wrapping, focus and no overflow. Intercepted HTTP tests
   complement this proof; they do not replace actual PostgreSQL content/mapping.

This documentation issue introduces no runtime, migration or behavior test. Its
checks are formatting and authority/link/contract inspection. Ordered independent
Standards then Spec preparation and root delegated approval are complete.
Only after this contract is merged may
root recheck readiness/fit/ownership and create the separate complete runtime child.
No actual model, grant, provider setup, manual user test or new Iurie answer is
required for this synthetic, factual read contract. The existing single
[MISSION-CLOSE-01 register](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
remains its sole owner for one consolidated email; do not repeat its question or
add its pilot clarification marker to configurable plans.

Excluded: source replacement/rewriting, plan attachment to existing Projects,
generic workflow/stages/dependencies, obligation adoption/applicability/exceptions,
review/acceptance/fulfillment/closure policy, metrics/automatic assignment/dates,
result or Document mutation/qualification, new permissions/captured sets, schema,
dependencies, providers, real configuration/data, legal/pricing/certification
decisions, external delivery, deployment and whole-MVP completion.
