# PRD — Release 1 Project and Task

**Status:** Preparatory registration, manual preparation Tasks, My Tasks, the Project responsible member and manual Task priority approved by #238, #246, #347, #367 and #375, and the provisional Project lifecycle (§23) delivered by #406 and #407, and the provisional illustrative Template creation journey (§24) approved by #634, and the bounded My open Projects read (§25) approved through delegated agent review, and Company unassigned preparation Task discovery (§26) approved under delegated 2026-10-21 synthesis, exact mission Task results (§27) approved by #832, the bounded thirteen-activity pilot plan (§28) approved by #836 and grouped Task planning (§31) approved by #927 and Company blocked-Task supervision (§32) approved by #931; Company team Task workboard (§33) approved by #944 through delegated agent product review; ordinary Task description (§34) approved by #949 through delegated agent product review; remaining capability Draft\
**Project next action (§35):** Approved bounded contract under [root’s actual delegated approval](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/973#issuecomment-6484463391); no runtime or grant.\
**Version:** 0.16\
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; Tenant/Company/Authorization PRD; Activity Log PRD; UX PRD

## 1. Problem statement

Operational work cannot depend on an accepted Offer and signed Contract in every case. Projects may begin for preparation, migration, free/internal work or delayed paperwork. Different service categories use different stages and Tasks, while ambiguous names such as Stage 1, Stage 2, S1 and S2 must not become one global workflow.

## 2. Release 1 outcome

Authorized users create a Company-owned Project for a shared Client, choose a bounded Project category/template, record applicable Standard Editions, progress through explicit lifecycle status and configured stages, and complete copied Tasks with responsibility, dates and evidence.

## 3. User stories

1. As a Company user, I want to create a Project before a Contract when the business permits it.
2. As a user, I want the responsible Company and Client visible.
3. As a user, I want a Project category with an appropriate copied workflow template.
4. As a user, I want lifecycle status separated from the current workflow stage.
5. As a user, I want exact Standard Editions attached to the Project.
6. As a manager, I want required Tasks instantiated from the template.
7. As an assignee, I want responsibility, due date and completion evidence clear.
8. As a reviewer, I want required Task completion validated before gated progress.
9. As a manager, I want template changes not to rewrite active Projects silently.
10. As a user, I want suspension, cancellation, archive and closure to preserve unfinished work history.
11. As an authorized user, I want the Client overview to show Project state and next actions.
12. As a reviewer, I want critical Project/Task transitions attributable.

## 4. In scope

- Project identity, responsible Company and Client;
- optional Client Legal Entity and Contract reference;
- Project category;
- copied Project Template and Stage definitions;
- lifecycle status separate from workflow stage;
- multiple Standard Editions;
- Task instances with Company scope, assignee, due date and completion;
- required Task and evidence rules kept bounded;
- Client/Project list and detail UI;
- critical Activity Log events owned by this capability.

## 5. Out of scope

- universal BPM/workflow builder;
- cross-Company Project ownership;
- complex dependency graph or resource planning;
- time tracking and payroll;
- Google Calendar synchronization;
- assurance-specific audit execution;
- commercial Project creation automation unless separately specified.

## 6. Domain and lifecycle

Project lifecycle initially distinguishes planned/preparatory, active, suspended, completed, cancelled and archived meanings. Exact labels and permitted transitions are finalized from business evidence. Section 23 normalizes the provisional MVP lifecycle; `archived` remains deferred.

Workflow stages are template/category-specific progress markers. Stage labels never replace stable lifecycle semantics.

Tasks are copied into the Project when a template is instantiated. Later template changes create new template versions and do not rewrite existing Task instances.

## 7. Invariants

1. Project, Client and Company belong to one Workspace.
2. Every Project has one responsible Company.
3. A linked Contract must use the same provider Company.
4. Project existence does not require a Contract.
5. Every Task has explicit Company scope inherited from its Project.
6. Template instantiation copies governed definitions.
7. Standard identity includes its exact edition.
8. Completion and closure do not erase prior stages, assignments or evidence.

## 8. Permissions

Separate read, create, update, stage/lifecycle transition, Task assign/complete and close/archive permissions. Users cannot move a Project into another Company through ordinary editing.

## 9. UX and failure states

- no Project for Client;
- Project without Contract;
- missing required setup/evidence;
- empty Task list versus template error;
- overdue/unassigned Task;
- blocked transition with explanation;
- concurrent completion;
- suspended/cancelled/archived history;
- permission-safe Client/Project navigation.

## 10. Activity Log

Record Project creation, responsible-scope changes if ever allowed through governance, lifecycle transitions, significant stage transitions, assignment of sensitive Tasks, required Task completion/reopening and closure/cancellation only after their exact owning rules are approved. Raw interview examples do not create event families by themselves.

## 11. Testing decisions

- PostgreSQL REST tests for scope, transitions, copied templates and concurrency;
- browser journey from Client to Project, Task and next action;
- state-transition tests at the public module interface;
- negative Company/permission tests;
- historical-template tests.

## 12. Acceptance journey

An authorized Company user opens a shared Client, creates a pre-contract Project from a real category, selects Standard Editions and receives copied Tasks. Assigned users complete required Tasks with evidence. A blocked stage transition explains the missing requirement. A later template change does not alter the active Project. Closure preserves attributable history.

## 13. Business evidence at the current audited boundary

The current audited evidence supports the following direction strongly enough to keep it in this PRD:

- a real job should be represented as its own Project with separate responsibility, status, deadlines and Documents;
- Project Templates and copied Tasks are desired, and template versions must not rewrite historical Projects;
- Task reminders/escalation examples are supported, but the complete reminder catalogue by Project type remains incomplete;
- completion evidence and explicit responsibility are desired;
- later sessions support controlled Project start, kickoff and start-dossier concepts, but they do not define a complete universal gate;
- one interview statement suggests a precontract requirement before Project start, but this conflicts with approved DEC-026, which also permits preparation, migration, free/internal work and delayed-paperwork cases. That evidence remains subject to PRD arbitration and does not create an exclusive precontract rule.

Section 23 decides the provisional Project lifecycle: statuses and transitions, the start declaration and start exception, the approver, the conservative unfinished-Task default and the pre-Contract arbitration in favour of DEC-026.

Still blocking broader workflow/Task ticket decomposition:

- bounded first-release Project categories and one representative anonymized case per category;
- representative Project Templates and exact required Tasks;
- observable distinction between lifecycle status and category-specific workflow stage;
- exact meaning/use of Stage 1, Stage 2, S1 and S2 in each relevant workflow;
- actors, dates, dependencies and required completion evidence;
- unfinished-Task treatment beyond the section 23 default (S02-Q19);
- verification of start-dossier evidence, the required-documents list, kickoff and closing a start exception;
- complete reminder catalogue by Project type.

The P0 initial-Project-categories completion package in the coverage matrix is the current highest-priority business follow-up for this PRD.

Question source: S02. Provenance owner: `docs/product/iurie-business-answer-coverage.md`.

## 14. Technical dependencies

- Company/RBAC and shared Client capabilities;
- canonical Project/Stage/Task vocabulary;
- state-machine and template-version decisions;
- highest stable Project acceptance seam.

## 15. Approved preparatory registration slice (#238)

Dan authorized this bounded MVP slice on 2026-09-19 from existing evidence and DEC-025–026. It is a preparation record only, not permission to execute operational work. This synthesis does not claim that Iurie supplied an exact permission matrix.

- The user supplies a trimmed title (1–200 characters) and an existing active Client related to the selected active Company. Workspace, Company, identifier, creator and timestamp are server-established. Registration always sets status `preparatory` (section 23 owns later transitions); creator is attribution, not operational responsibility.
- Explicit Company Project Access v1 grants `project.read` and `project.create` through the existing Company-assignment administrator. Grants capture v1 and attributable grant/revoke history. Existing users and assignments receive no automatic grant, including Workspace Owner, Company Context Access and Company Director Client Access.
- Project access additionally requires current Client read authority (`client.manage` for the delivered minimal owner flow or Company `client.read`) and the selected Client–Company relationship. Project authority never follows from Client visibility alone. Read/list/create revalidate active access; immutable Company/Client links cannot be edited.
- An authenticated REST create/list/detail seam and production page let the user create, reload and reopen a Project with its Company, Client and preparation warning. No Task, template, category, Standard, owner, deadline, activation, Contract or external integration is created.
- Exactly one `project.created` event targets each successful Project. Server actor/time and Company scope are appended atomically with the Project, with empty metadata. Event visibility requires Project read and the same Client relationship/read boundary; Workspace ownership alone does not expose it.
- A stable idempotency key is scoped to actor and Workspace. An identical normalized retry revalidates authority and returns the original Project; a different input or Company conflicts. No duplicate Project or history is created.
- Original Company and Client references survive union/reversal. Reads retain the original Client identity (including a superseded identity) and its original Company relationship, without revealing canonical union detail or other-Company activity. New registration uses an active Client, locks its identity before relationship checks and increments its version in the same transaction, so new post-union activity invalidates the existing reversal fence.
- Real PostgreSQL REST tests own isolation, idempotency, atomic history and union/reversal races. Component and desktop/narrow browser journeys own create/reload/reopen, empty and denied states. No new test harness is required.

The existing authorized directory's local title/Client-label filter also accepts
Romanian spelling with or without diacritics under [#735](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/735).
It preserves trimmed case-insensitive substring matching, canonical Unicode
equivalence and the Romanian pairs `ă/â/a`, `î/i`, `ș/ş/s`, `ț/ţ/t` on both sides.
Other language distinctions, including Russian `й/и`, remain distinct. This is
comparison only: original text, authorization, server order, open/closed status,
exact dossier restrictions and detail navigation remain unchanged. Typing or
changing interface locale makes no request and changes no identity or business
record; the literal filter survives a locale change and existing authority changes
still retire scoped state. This bounded local convenience is not global, content
or historical search and adds no permission, event or backend behavior.

## 16. Remaining readiness

The preparatory registration slice and manual preparation Tasks in section 18 are independently bounded approvals. The separate [Document Registry association contract](release-1-document-registry-prd.md#18-approved-working-project-associations-245) permits attaching and removing working references in an open Project (section 23) without changing its identity or lifecycle. Broader ticket decomposition remains blocked on real Project categories, stage meanings, required Tasks and acceptance examples. The current coverage audit narrows the evidence boundary; those broader workflows remain unapproved. This capability follows Company/RBAC and Shared Client.

## 17. Evidence authority boundary

Issue #81 preserves raw business evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes lifecycle transitions, automation, permissions or start gates by itself. Any implementation issue must cite this PRD after the relevant evidence has been normalized here.

## 18. Approved manual preparation Tasks (#246)

Dan approved this bounded next MVP slice on 2026-09-19. It implements manual
preparation work on an existing preparatory Project; these are delegated product
choices under that approval, not newly collected Iurie evidence or a complete
operational role/workflow matrix. The existing direction includes responsibility,
dates and visible unfinished work. Templates, required Tasks, execution approval,
completion evidence and wider workflow decisions remain separate.

### Record and lifecycle

An authorized manager creates a Task with a trimmed title of 1–200 characters, an
optional eligible responsible Workspace Membership and an optional calendar due
date. Dates use exact YYYY-MM-DD values, years 0001–9999, without timezone
conversion; impossible dates fail validation and past dates are permitted.
The separately bounded [ordinary description contract (§34)](#34-bounded-ordinary-task-description-949)
qualifies the optional instructions field and its compatibility; its own status
governs approval and later implementation.
Unassigned and undated Tasks are valid. The server derives immutable Workspace,
Company, Project and original Client from the Project, and establishes identity,
creator, timestamps and initial version.

A new Task is `todo`. While a Task is open (§20), a manager can edit its title, assignee and date
or mark it `done`. A done Task is read-only except for explicit reopening to
`todo`, which preserves its fields. Completion records the declaring actor and
time; reopening preserves that declaration in immutable history. A manager need
not be the assignee or creator. No deletion or archive is introduced; §20 adds cancellation.

Task commands never change the Project lifecycle (section 23). Neither a Task assignment nor completion grants
access, approves operational execution, closes a nonconformity, satisfies a
required-evidence gate or changes a Document/Contract state. There are no reminders,
automatic assignment, urgency rules, automatic priorities, dependencies or background
state transitions; §22 adds a manual priority.

### Authority and responsible member

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families)
owns explicit captured **Company Task Manager v1**, containing only `task.read`
and `task.manage`. No existing assignment gains Task permissions. Every Task read
and history request additionally requires current Company context, Project read
and the original Client/read relationship boundary. Every new mutation additionally
requires `task.manage`; assigning a Task never substitutes for those permissions.

The manager selects an assignee through a narrow Project-scoped eligible-member
query. Access owns the evaluation; business code does not inspect Access storage
or impersonate candidate actors. Eligible members have an active Internal User,
active same-Workspace membership and effective Company context, Project read, Task
read and Client read for the Project. The query reveals only membership identifier
and display label, never email, unrelated members or reasons for exclusion.
Empty eligibility leaves unassigned creation available. Direct submissions undergo
the same live check inside create/reassignment.

Later suspension or loss of eligibility preserves existing assignment/history
without retaining access. The member disappears from new selection; an authorized
manager can clear or replace that assignment on a todo Task. Historical attribution
is preserved without becoming a general member-directory lookup.

### Historical Clients, versions and retry

Reads retain immutable original Project/Client links, including a readable
superseded original Client. Every new create, edit, completion or reopen requires
that exact original Client to be active and related to the Company. Superseded
original records are read-only in this slice; the UI explains this without exposing
canonical union or other-Company details. Writes against superseded originals
remain deferred.

A material mutation carries the observed Task version and a stable actor/Workspace
idempotency key. Stale versions, invalid transitions and conflicting reuse of a
key fail without change. Concurrent writes on the same version allow at most one
material outcome. A normalized no-op edit must pass current authorization, todo
state and expected version checks; it adds no version, event or fence advance.

An exact committed replay rechecks live authority and target visibility before
returning its recorded outcome, without repeating writes. It is resolved before
rejecting its old expected version and may confirm an earlier result after original
Client supersession. Current Task state is refreshed separately from that prior
command result. The UI preserves an uncertain command's original payload, observed
version and key for explicit retry; conflict recovery requires an explicit reload.

Each new material change atomically updates Task state/version, command outcome,
the original active Client's existing reversal fence, and append-only history.
Use the Client-owned write interface and identity-before-relationship lock order.
Reads, rejected commands, no-ops and exact replays do not advance the fence.
Current actor and changed-assignee authority is serialized against relevant
suspension/revocation through the existing Access boundary.

### History and user journey

The [Activity Log PRD](activity-log-accountability-prd.md#7-authorization-and-privacy)
owns authorized projections of `task.created`, `task.updated`,
`task.completed` and `task.reopened`. Task detail preserves ordered server
attribution and versions, initial title/assignee/date, correction before/after
values and each completion/reopening. No route modifies or erases history.
Task history is visible through `task.read` plus the same Project/Client boundary;
mutation permission is separate.

From Project detail, a user creates, reloads, opens, edits, completes and reopens
a Task without entering raw identifiers. The view shows responsible member or
Unassigned, optional date, state, Company/Project context and the preparation
warning. Loading, empty, validation, no eligible assignee, denied/revoked access,
missing, conflict/reload, uncertain retry and historical-Client read-only states
are explicit. Same-context navigation preserves useful drafts and command
identity; actor, Company and permission changes invalidate old state and replies.

### Local Task title filtering

The existing local Task title filter delivered under [#270](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/270)
also accepts Romanian spelling with or without diacritics under [#778](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/778).
Preserve trimmed case-insensitive substring matching, canonical Unicode equivalence
and the Romanian pairs `ă/â/a`, `î/i`, `ș/ş/s`, `ț/ţ/t` on both query and Task title.
Other language distinctions, including Russian `й/и`, remain distinct. This is
comparison only: keep stored and displayed text and the literal query unchanged.

Filter only already-loaded authorized Task titles, preserving server order and
the existing status, responsible-member and date filter choices. Typing, clearing
or changing interface locale adds no request or business write; locale changes
preserve the literal query. Existing authority/context retirement and stale-reply
rules remain intact. Filtering does not close selected detail, discard drafts or
alter an uncertain command's exact payload, expected version or key. Existing
authoritative refreshes still determine current rows and do not redefine the open
detail's authority. This bounded convenience adds no field, permission, event,
backend behavior, global/content/history search or identity-matching rule.

Public component tests start the observable red-to-green proof. PostgreSQL REST
tests own permission isolation, assignment eligibility, dates, state/version
concurrency, atomic history, retry and union/reversal boundaries. Existing browser
journeys prove the full path at desktop and narrow widths. No new CI, runtime,
provider or test framework is introduced.

## 19. Approved My Tasks read (#347)

Dan approved this bounded read on 2026-09-24: the actor's own unfinished Tasks in
the active Company, ordered by date, with existing access rights and no urgency
rule or new grant. It is a delegated product choice under that approval, not newly
collected Iurie evidence.

**My Tasks** lists every open Task (§20) whose responsible member is the reader's own
Workspace Membership, in the active Company, whose Project the reader can read
under section 18: current Company context, Company Task Manager v1 `task.read`,
Project read, and an active or superseded original Client with an active
relationship to that Company. Done, unassigned and other members' Tasks, other
Companies and unreadable Projects are excluded. The read reveals no other member's
Task and no count of them.

Each row shows the Task title, its due date or "No due date", the Project title
and the Client label the Project list shows. Each row also shows the Task's
priority (§22); it does not change the order. A superseded original Client keeps
its original label, without canonical union or other-Company detail. Rows are
ordered by due date ascending, compared as exact `YYYY-MM-DD` text without
timezone conversion, with undated Tasks last; ties follow creation time, then
identifier.

No permission is added. Being the responsible member, Workspace ownership, Company
Context Access and Company Director Client Access grant nothing. Every read
revalidates current authority; lost authority, a suspended membership or no Company
context is denied. The list is read-only: Tasks are still edited and completed from
Project detail, and the next read reflects completion, reopening and reassignment.
A read writes no Activity Log event, command outcome or Client reversal-fence
advance, and needs no schema change.

My Tasks is not a Dashboard next action. It has no overdue or urgency label,
count, badge or ranking, and no filter, search, team view, reminder or
notification. Opening a row's Task in its Project is owned by #377. The
operational home (Operational Dashboard PRD §17) counts the Company's overdue
Tasks and builds its My attention queue from this same read boundary; My Tasks
itself is unchanged.

## 20. Approved Task execution states (#365)

Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section normalizes the Task states of the consolidated decision record §9.4 for manual preparation Tasks. It is a delegated product choice, not newly collected Iurie evidence.

A Task has one of five states: `todo`, `in_progress` and `blocked` are open; `done` and `cancelled` are closed. A manager with `task.manage` and the §18 read prerequisites may move an open Task to another open state, mark any open Task `done`, or cancel any open Task. A `done` or `cancelled` Task can only be reopened to `todo`. Entering `blocked` requires a blockage reason; entering `cancelled` requires a cancellation reason. Each reason is trimmed text of 1–500 characters, recorded with the declaring actor and server time. Leaving `blocked` or reopening a cancelled Task retires the current declaration without erasing it from history. Title, assignee and due date remain editable in every open state; closed Tasks are read-only except reopening.

States are manual declarations. They grant no access, satisfy no gate, trigger no reminder, escalation, notification or automatic transition, and do not change the Project. Cancellation is not deletion: the Task, its fields, assignment and history remain readable under §18. The §18 rules for version, idempotency, replay, historical Clients, the reversal fence and UI states apply to every new command. A move to the current state, or any transition not listed here, conflicts without change.

My Tasks (§19) lists the reader's open Tasks (`todo`, `in_progress` and `blocked`) in the same order, and shows each row's state. Done and cancelled Tasks are excluded.

Automatic priorities (§22 adds a manual priority), dependencies, structured blocker details and reason vocabularies remain separate decisions. [Section 34](#34-bounded-ordinary-task-description-949) separately qualifies ordinary descriptions under its own approval/readiness status. Dashboard counts and queues are governed by Operational Dashboard PRD §17. Section 23 decides that no Project lifecycle transition changes a Task.

## 21. Approved Project responsible member (#367)

Iurie confirmed that each simultaneous Project needs its own responsible person, status, deadlines and Documents (S02-Q07). Later answers route Project work to the Project's responsible person, whom the business must be able to change. Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section is the bounded delegated synthesis. It is not a complete role matrix.

A preparatory Project has zero or one responsible Workspace Membership, initially none. A manager holding `project.update` sets, replaces or clears it. Only an eligible member may be newly set: an active Internal User with an active same-Workspace membership and effective Company context, Project read and Client read for the Project's original Client–Company relationship. Access owns that evaluation and a narrow Project-scoped query that reveals only membership identifiers and display labels. Being responsible grants no access, approves nothing, assigns no Task and triggers no reminder. Later loss of eligibility preserves the assignment and its label without retaining access, and a manager may replace or clear it.

Every Project reader sees the responsible member, or none, with the attribution of the last change. The responsibility has its own revision starting at zero. A command carries the observed revision and a stable actor/Workspace idempotency key. Stale revisions conflict, and concurrent commands allow one material outcome. A normalized no-op records an unchanged receipt without revision, event or fence advance. Exact replays recheck live authority and visibility before returning the recorded outcome; changed key reuse conflicts. A material change atomically updates the responsibility and its revision, its receipt, one `project.responsible.changed` event and the original active Client's operational-use fence. A superseded original Client keeps the responsibility readable and refuses changes without exposing union detail.

A responsible-member change never changes the Project lifecycle. Section 23 requires a responsible member for activation and forbids clearing it while the Project is active or on hold. These remain separate decisions:

- title correction;
- categories;
- Contract and commercial links;
- multiple or role-specific responsibles;
- substitution;
- responsibility-based notifications.

## 22. Approved manual Task priority (#375)

Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section normalizes the Task priority that Iurie confirmed in Session 13 (_normal / important / critic_) and that the consolidated decision record §9.4 lists as an essential field. The three levels are sourced; their manual handling below is a delegated product choice, not newly collected Iurie evidence.

Every Task has exactly one priority: `normal`, `important` or `critical`. A manager with `task.manage` and the §18 prerequisites chooses it at creation or changes it through the §18 edit while the Task is editable under its owning execution rule (§18, refined independently by §20); a Task created without a choice, and every Task that existed before this section, is `normal`. A closed Task keeps its priority read-only. A priority change is a corrected field of `task.updated`, under the §18 rules for version, idempotency, replay, historical Clients, the reversal fence and normalized no-ops.

Priority is a manual declaration. It grants no access, satisfies no gate, changes no Task or Project state, and triggers no reminder, escalation, notification or automatic assignment. It does not reorder the Project Task list or My Tasks and adds no filter, count, badge, queue or urgency rule.

The operational home's My attention queue (Operational Dashboard PRD §17.3) reads `critical` as one of its rules; priority still changes no My Tasks order.

Automatic priority rules, priority-based ordering or filtering, and escalation or notification of important or critical Tasks remain separate decisions.

## 23. Approved provisional Project lifecycle (#406)

Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section normalizes the Project lifecycle from these sources:

- decision record §9.1 and DEC-037 (stable lifecycle statuses, separate from workflow stages);
- DEC-026 (a Project may precede its Contract, with the condition visible);
- S02-Q08: a Project is marked potential or uncontracted, then becomes active;
- issue #81 session 104, items 521–523 (coverage S02-Q22): the start dossier; activation only when it is complete or when Iurie explicitly approves an exception; the recorded content of that exception;
- issue #81 session 1: Iurie is the principal approver, including for Project closure.

The status names, transitions, bounds, permission names and the treatment of unfinished Tasks are delegated provisional choices, not newly collected Iurie evidence. Iurie validates them against a demonstration.

This section arbitrates the section 13 pre-Contract evidence in favour of DEC-026. Project existence stays ungated; activation requires a start declaration and, when any item is missing, a start exception.

**Statuses.** A Project has one lifecycle status:

- `preparatory`: decision record DRAFT, meaning potential or uncontracted;
- `active`;
- `on_hold`;
- `completed`;
- `cancelled`.

`preparatory`, `active` and `on_hold` are open. `completed` and `cancelled` are closed and terminal. Registration (section 15) creates `preparatory`. A lifecycle status is not a workflow stage. `archived` and reopening are deferred.

**Transitions.** No other transition exists.

| Transition | From → to                                          | Condition                                                 |
| ---------- | -------------------------------------------------- | --------------------------------------------------------- |
| Activate   | `preparatory` → `active`                           | A responsible member (section 21) and a start declaration |
| Hold       | `active` → `on_hold`                               | A reason                                                  |
| Resume     | `on_hold` → `active`                               | —                                                         |
| Complete   | `active` → `completed`                             | A completion note; no open Task (section 20)              |
| Cancel     | `preparatory`, `active` or `on_hold` → `cancelled` | A reason; no open Task                                    |

Reasons and notes are trimmed text of 1–500 characters, recorded with the actor and server time.

**Start declaration and start exception.** Activation records the approver's declaration of each start-dossier item of item 521, except the responsible member, which section 21 records. The seven items are:

- approved Offer;
- Contract or precontract;
- project plan;
- initial documents;
- deadlines;
- financial conditions;
- relevant risks.

Each item is declared present or missing. The declaration is shown as declared, not verified, until the Offer, Contract and Document capabilities can prove it (DEC-152).

When any item is missing, the activation is a start exception (item 523). It also records:

- a reason;
- an eligible completion responsible, under the section 21 eligibility;
- a completion deadline, as an exact date under the section 18 date rules.

Until a signed Contract can be linked to a Project (decision record §14.10), a Project without a Contract activates only through this visible exception (DEC-026). The declaration and the exception are immutable once recorded.

**Authority.** Every transition requires the captured Company Project Approver v1 (authorization PRD §8), plus current Project read and Client read for the Project in the active Company:

- `project.lifecycle.transition` to activate, hold and resume;
- `project.close` to complete and cancel.

First-tenant configuration grants the bundle only to Iurie (session 1; item 522). Where Iurie named no authority, his approval is the conservative default. Reading the status, the declaration, the exception and the transition history requires only Project detail read.

**Responsible member.** Activation requires a responsible member. While the Project is active or on hold, the responsible member may be replaced but not cleared.

**Unfinished Tasks.** S02-Q19 was never asked. The conservative default:

- no transition creates, changes, completes or cancels a Task, and none changes a Document association, Request or responsible member;
- Tasks stay editable while the Project is preparatory, active or on hold;
- completion and cancellation are refused while the Project has an open Task, so each Task is closed explicitly, with its own reason where section 20 requires one;
- transfer to another Company remains impossible (DEC-025, section 8).

**Closed Projects.** A completed or cancelled Project refuses:

- new Tasks and every Task command, including reopening;
- Document link and removal;
- responsible-member changes.

Its Tasks, Documents, responsible member, declaration, transitions and Activity history stay readable under the delivered read boundaries. Project lists show open Projects by default, with an explicit filter to include closed Projects and a status label (DEC-151).

**Guarantees.**

- The lifecycle has its own revision, starting at zero, separate from the responsibility revision.
- A transition carries the expected revision and a stable actor/Workspace idempotency key. A stale revision conflicts, and concurrent transitions allow one outcome.
- Exact replays recheck live authority and visibility before returning the recorded outcome. Changed key reuse conflicts.
- A committed transition atomically updates the status and revision, and records the transition, its receipt, one `project.lifecycle.changed` event and the original active Client's operational-use fence.
- Transitions, Task commands, Document association commands and responsible-member changes of one Project serialize on its original Client. No Project therefore closes with an open Task, and no active Project loses its responsible member.
- A superseded original Client keeps the lifecycle readable and refuses transitions, without exposing union detail.

**Provisional choices for Iurie's validation:**

- only Iurie holds the Approver bundle;
- the seven declared items, and a present-or-missing choice with no "not applicable";
- no transition acts on unfinished Tasks (S02-Q19);
- completion only from active, and no reopening of a closed Project;
- the responsible member cannot be cleared while active or on hold;
- a start exception is recorded once and is not later closed in the product.

Excluded, and not presented as business fact:

- workflow stages, categories and templates;
- Contract or Offer links, and automatic activation after signature;
- verification of the declared items, the required-documents list (item 520), the kickoff checklist and the official start summary (items 524–525);
- closing a start exception when its items arrive, and its alerts until closure (item 523);
- reminders and notifications;
- `archived`, reopening, deletion and transfer between Companies;
- lifecycle effects on Tasks, Documents or Requests;
- approval delegated to anyone other than the Approver bundle holder.

**Delivery.** #406 delivers the statuses, the Approver bundle, activation, hold and resumption. #407 delivers completion, cancellation, the closed-Project rules and the list default.

## 24. Approved provisional creation from an illustrative Template (#634)

Dan approved this bounded example and dedicated opt-in authority on 2026-10-16.
His explicit authority answer was “Oui, des droits dédiés explicites”: Template
Version creation, Project creation from a model and stage advancement require
separately assigned dedicated rights, distinct from `project.update`; no existing
assignment expands automatically. Task assignment retains its existing authority.
This is a provisional MVP choice for later business validation, not evidence that
Iurie has approved an operational category, workflow or real mission start.

### Example and first observable outcome

The identified initial model is `CONSULTING_PREPARATION_ILLUSTRATIVE`, Version 1,
with the preserved business title “Préparation d’une mission de conseil”. It has
two ordered stages, with two required Tasks in each:

| Stage       | Required copied Tasks                         |
| ----------- | --------------------------------------------- |
| Cadrage     | Clarifier la demande; Confirmer le périmètre  |
| Préparation | Recueillir le questionnaire; Préparer le plan |

The initial Version is an immutable, code-defined illustrative configuration.
The interface labels it illustrative and states that it authorizes no real
operational work. It is not silently installed as a real Company's business
policy. The user explicitly chooses the exact Version and an existing active
Client related to the active Company, supplies the normal Project title, and
creates one preparatory Project (§15) and four independent Task copies atomically.
No existing Project receives a model, stage or Task retroactively.

Each copied Task starts `todo`, priority `normal`, unassigned and undated. Its
manager explicitly assigns and declares completion using §§18, 20 and 22.
Assignment never grants access, and completion is the existing manual declaration,
not verified questionnaire content or approval to start a mission. All existing
Task edit, eligibility, state, date, version, retry, history and closed-Project
rules remain unchanged. Editing a copied Task changes only that Task; the
preserved source title, stage and exact Template Version remain historical facts.

### Authority and read boundary

The new opt-in **Company Project Template User v1** contains exactly
`project.template.read` and `project.template.instantiate`. The existing
administrator with `company.assignment.manage` explicitly grants or revokes its
captured v1 for an active same-Workspace member and active Company. It confers no
Company context, Client read, Project create, Task read/manage, lifecycle,
Template Version publication or stage advancement authority. Existing bundles,
assignments, migration backfills, Workspace ownership and Project responsibility
grant nothing; null or unknown captured versions fail closed.

Source catalogue read requires the dedicated read plus current Company context
and Project read. Copied-plan read additionally requires current Task read and
the Project's original Client/read relationship boundary because it includes real
Task identifiers. Instantiation requires the dedicated instantiate authority plus
independent current Project creation and Task Manager authority, with the active
original Client and Company relationship. Access owns live captured-grant
validation and serializes successful creation against revocation or suspension.

The assignment lifecycle is
`company_project_template_user_assignment.granted` and
`company_project_template_user_assignment.revoked`, under the authorization PRD
§8's existing Company-scoped administration and minimal bundle-label convention.
The bundle is never configured or assigned implicitly to any real user.

### Preservation, retry and atomicity

Creation preserves the exact source key, Version, business title, ordered stage
and Task definitions, and stable mapping to the four copied Task identifiers.
This immutable snapshot is independent of later source configuration. Reopening
shows that original plan and the real independently editable Tasks; it never
substitutes current Template contents. No route edits or deletes copied
provenance. No source edit changes an existing Project's copies or history.

A stable actor/Workspace idempotency key covers the full normalized creation
intent: Company, original Client, Project title and exact source key/Version.
Identical concurrent retries create exactly one Project and four Tasks. Exact
committed replay rechecks current dedicated and independent prerequisites and
Project visibility before confirming the original Project identity; the normal
Project read supplies current display facts. A changed key reuse conflicts,
including reuse of a manually registered Project's creation key. Replay does not
repeat writes and may confirm the earlier creation after original Client
supersession or Project closure if current read authority remains valid.

Project creation, immutable provenance, four Tasks, durable creation identity,
one ordinary `project.created` event and four ordinary `task.created` events
commit together, using the existing original Client operational-use fence and
lock order. Failure records none. The original Project creation event and each
Task history retain server actor/time attribution. No new stage-completion event
is fabricated by merely creating a copied plan.

The browser preserves the exact uncertain command's title, Client, Template
Version and idempotency key for explicit retry. A changed intention uses a new
key. Authority/session/Company changes discard old drafts/replies under the
existing owner boundary. Loading, empty, validation, denied, missing, unavailable,
uncertain retry and conflicting-key recovery remain distinct. Interface controls
and accessible names use ro/ru/fr/en; switching locale preserves business source
text and entered work.

### Stage progress and deliberate advance (#687)

Dan approved the first stage gate in [owner decision6218705144](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/63#issuecomment-6218705144).
On 2026-10-18 he also approved the reopening rule recorded in #687: an ordinary
authorized reopening of a previously required Task preserves the stage reached,
its immutable transition and captured Task/version proof. Existing independent
Task, open-Project and active original-Client rules still govern that reopening;
there is no automatic stage rollback.

Every compatible preserved illustrative Version exposes Cadrage initially, revision zero,
without inventing a prior completion or writing an initialization event. Progress
reads use the copied-plan boundary above, independently of advance authority.
The gate uses the stable copied Task identities and their current execution states,
never editable titles, unrelated Tasks or today's source configuration. Only both
required Cadrage Tasks currently `done` satisfy it; cancellation is insufficient.
Task completion never advances a stage automatically.

The independently assigned Company Project Stage Advancer v1 grants only
`project.stage.advance` (authorization PRD §8). A deliberate command requires it
and the independent copied-plan reads, including Task **read**, not Task Manager
authority. Ordinary Task writes retain their existing independent `task.manage`
requirement. The command carries the observed source stage and stage revision and
an explicit target. Only Cadrage→Préparation exists; Préparation displays as the
last supported stage with its own preserved required Task mapping. There is no
backward, skip or final-completion command and no Project lifecycle mutation or
real mission-start authority.

A new transition requires an open Project and the active original Client and
Company relationship. It serializes with Task commands, Project closure, Client
operational-use fencing and successful authority revocation or suspension. If
reopening wins, the gate fails. If advance wins, an independently authorized
reopening remains allowed and leaves the stage and captured proof intact.

The actor/Workspace idempotency key covers the full normalized Company, original
Project, expected stage/revision and target. Changed intent conflicts. An identical
committed receipt is resolved after live dedicated authority and copied-plan
visibility, before the old expected revision, closed Project or superseded Client
can reject a new mutation. It confirms only the recorded result; a normal progress
read supplies current facts. A rejected or stale command changes no progress,
receipt, history, event or Client fence.

The resulting stage/revision, transition identity, server actor/time, preserved
source/target facts, required Task identities/versions, command receipt and original
Client fence commit atomically with one `project.stage.changed` event. Task proof
belongs to immutable Project transition evidence; the Activity projection contains
only revision and source/target identity (Activity PRD §7). Reading history does
not require advance authority. Additive migration preserves existing source copies,
Task histories, identifiers and captured grants, assigns no authority and gives no
ordinary Project a model or Tasks.

### Compatible immutable successor Versions (#695)

Dan renewed delegated provisional MVP delivery on 2026-10-18. The bounded
four-title successor contract is coordinator synthesis under that authorization,
not an operational workflow decision supplied by Iurie. Dan's subsequent explicit
approval ("Oui, retenir ces critères MVP provisoires"), normalized in
[tracker #290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290#approved-provisional-pj-4--ta-4-completion-criteria--2026-10-18)
and [#695 clarification](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/695#issuecomment-6249460126),
defines two separate illustrative MVP completion criteria:

- **PJ-4:** publish a successor model Version and create a Project from each
  Version while preserving existing copies.
- **TA-4:** copy and explicitly assign Tasks, require their completion before
  stage advance, and preserve history after model evolution or Task reopening.

These are new provisional criteria, not recovered historical Iurie evidence.
Complete delivery and evidence are required before either capability receives
credit; a child merge alone is insufficient. Nothing authorizes a real mission.

An independently authorized configuration user changes only the four required
Task titles. The model key and business title, stage titles, stable stage/Task
keys, order, two-stage/four-Task shape and required flags remain fixed. Titles use
§18's trimmed 1–200-character grammar; at least one normalized title must differ
from the observed head. Unchanged, malformed or overflowing input records nothing.
There is no structural or semantic editor.

One explicit create-and-publish command produces an immediately selectable,
immutable successor. The interface previews literal changed titles and explains
that existing Projects retain their copies. Corrections publish another successor;
there is no draft, approval, activation, update or delete lifecycle. Version 1
remains the unchanged code-defined illustrative source, never a fabricated Company
policy or backfilled publication.

Successor identity is Workspace + Company + model key + exact Version. Each
Company has one linear succession starting at the code-defined v1 baseline. Its
catalogue/history is bounded with explicit continuation. Other Companies receive
none of its successor titles, lineage, identifiers, counts, head or events. Older
supported Versions remain explicitly selectable; later publication never rebases a
captured Project-creation command. Exact-version instantiation retains every
independent authority, original Client fence, immutable complete source snapshot,
four independent initially normal-priority/todo/unassigned/undated copies, source
mapping, receipt and ordinary Project/Task event rule above.

Company Project Template Configuration v1 (authorization PRD §8) grants only
Version creation. Publication additionally requires current Company context,
Project read and Template read, independently of Client or Task authority because
configuration contains no real instances. The command names its exact source and
expected current head; the server assigns the canonical next Version. Different
commands from one head yield one committed successor and one definite stale
conflict requiring explicit reload, without implicit retry or rebase.

An actor/Workspace idempotency key fingerprints Company, source/head and all four
normalized titles. Identical retries converge; changed intention conflicts. Live
creation and catalogue-read authority are rechecked, then an identical committed
receipt is resolved before rejecting its now-old expected head. Publication
serializes against successful revocation or suspension. Immutable content/lineage,
head advance, durable receipt and one Company-scoped Version-creation event commit
together; any failure records none. Configuration advances no Client operational-use
fence. Activity PRD §7 owns the minimal authorized event projection.

Publication never rewrites Project snapshots, copied Task identities or current
contents, Task completion/reopening history, stage progress or transition evidence.
The same stable-mapping, done-only Cadrage→Préparation gate works for every compatible
successor copy. Ordinary old-stage Task reopening preserves the reached stage and
history under #687. Four-language real App journeys preserve literal drafts,
selected exact Version and uncertain command bytes/key across locale changes,
without locale-only requests; context/session/access changes suppress stale data
and late replies. Dedicated configuration denial preserves independent Project and
Task work. Additive migration preserves existing rows, IDs, grants and all receipts,
copies and histories, assigning no authority, successor or model retroactively.

### Remaining limits

The general workflow editor, real category catalogue, structural changes,
dependencies, automatic assignments/due dates, reminders, Document evidence,
Standards/Contract automation, lifecycle changes and real business readiness remain
excluded. The approved PJ-4/TA-4 criteria above are limited to the illustrative
model; they confer no wider configurable workflow or real mission-start authority.

### Public proof

Authenticated REST with disposable PostgreSQL proves exact copy/reopen, scope,
independent permission prerequisites, rejection/rollback, concurrent retries,
Task assignment/completion/reopening, historical original Clients and migration
preservation. Real App desktop 1440px and narrow 390px journeys prove selection,
creation, reload, independent Task outcome, unchanged retry, authority loss,
locale continuity and horizontal fit with screenshots from `testInfo.outputPath`.

## 25. Bounded My open Projects read

**Status: Approved bounded read convenience; runtime not delivered.**
The coordinating agent approved this normalization on 2026-10-21 after ordered
Standards and Spec agent reviews under Dan's delegated synthesis and maximum-
progress direction. It adds no first-tenant evidence, assignment, lifecycle rule
or historical MVP capability credit.

An authorized Project reader may choose **My open Projects** in the existing
directory. It selects Projects whose current stored responsible Workspace
Membership (§21) equals the server actor's current Membership, and whose current
lifecycle is `preparatory`, `active` or `on_hold` (§23). Creator, Task assignment,
display name and historical responsibility do not establish this selection.
Unassigned, other-responsible, completed and cancelled Projects are excluded.

This is a subset of the same currently readable active-Company directory, with
the same captured Project Access v1/v2, independent Company context and original
Client/read relationship requirements. Responsibility grants no access. Preserve
active or superseded original Client behavior, Company/Workspace isolation, row
shape and creation-time then identifier order. No eligibility lookup, directory
of people, new permission, grant, schema, count, Activity event, command receipt,
version, Client fence, automatic action or background polling is introduced.

The default remains **All Projects**, retaining its current API and callers.
Only the new optional `view=mine_open` selector changes the list predicate. Its
namespace accepts exactly one scalar `mine_open`; repeated, array/object and
unknown view values, or additional query keys accompanying that selector, are
invalid. Omitted `view` retains the existing legacy ignored-query behavior.
Workspace, Company and Membership authority are never supplied through a query.
The Project owner filters stored rows; the browser does not issue one
responsibility request per row or reinterpret cached detail as list authority.

The view intersects the existing text-or-exact-Client-dossier restriction rather
than replacing it. All retains its Include closed choice; Mine is always open-only
and does not offer a conflicting closed inclusion. A local view switch preserves
All's choice for return. Explicit **Home Open Projects** navigation selects All,
open-only and no Client restriction, preserving the count's existing destination.
An explicit Client-to-Projects directory navigation selects All, open-only and
that exact dossier; the user may then choose Mine within it. Existing external
navigation's handling of All's closed inclusion remains unchanged. A separately
requested readable Project or Task may open outside the current list subset,
without changing Mine or treating its absence from that subset as access denial.
The existing pending-registration and exact-target navigation safeguards remain.

A view read replaces only directory state. It cannot reset selected detail,
manual or Template registration drafts, Task/Document work, or an uncertain
command's exact payload and key. Do not use the existing destructive full reload
to change the view. Newer list reads retire older list replies; Company, session,
Membership, assignment and permission changes retain the existing broader
retirement. Client union/reversal re-reads the selected view under the current
identity revision before applying an exact dossier restriction.

Confirmed registrations keep their normal detail/command feedback. Their current
unassigned creation result does not prove membership in Mine and must not be
stitched into it. A current server Mine response determines directory membership.
A later read reflects assignment or lifecycle changes; changing responsibility
or closing an opened Project refreshes the Mine list without discarding its
still-authorized detail or drafts. Unrelated concurrent changes become visible
on explicit refresh; no continuous synchronization is promised.

New view changes withhold the previous view's rows until the selected read
settles. Loading, genuine empty, denied and unavailable with explicit same-view
Retry remain distinct. A failed Mine read presents no previous-view rows or false
zero. Existing All refresh behavior is preserved. The styled accessible view
control remains available when Mine is empty or unavailable. Locale changes
preserve view, literal search, exact dossier, detail, drafts and pending intent,
without I/O; copy and controls use ro/ru/fr/en and the violet/yellow visual system.

Public PostgreSQL REST proves the exact subset, current authority, strict new
selector, legacy compatibility, reassignment/closure and absence of writes.
Public App/HTTP tests prove view and navigation races, preserved drafts/command
identity, Client identity refresh and independent detail opening. Registered real
App/API/disposable-PostgreSQL desktop 1440px and narrow 390px journeys prove the
normal selection, exact opening, four locales, keyboard focus and horizontal fit
with inspected original screenshots. No new deadline, priority, assignment,
workflow, export, provider or all-Companies behavior belongs to this approved slice.

## 26. Approved Company unassigned preparation Task discovery

On 2026-10-21, coordinating root approved this bounded projection under Dan's
explicit maximum safe-Sarcina delivery and delegated agent product-review
instruction. It is a reversible product synthesis, not newly recovered Iurie
evidence. Sections 18–20 continue to own Task records, authority and mutations;
§23 owns Project lifecycle. This addition changes neither My Tasks nor the
personal attention/upcoming or Company overdue definitions.

An actor with the existing current Company Task-read prerequisites can discover
open preparation Tasks with a stored null assignee across all currently readable
Projects in that Company, then open the exact Task using the existing Project
navigation. The set includes `todo`, `in_progress` and `blocked`, without a
due-date restriction or additional Project-lifecycle filter. An assigned member's
later ineligibility does not clear their assignment: that Task remains excluded,
and its attribution/history is preserved. Original superseded Client labels and
read visibility are unchanged.

No permission or assignment expands. Reads require current Company/Workspace,
membership/session, `task.read`, Project read and original-Client read/relationship
authority. Workspace ownership, context selection and being the creator or
responsible member grant nothing. The list never requests eligible members.
Opening a row reuses fresh owning reads. `task.manage`, current Project/Client
mutability and live assignee eligibility remain independently required only by
the existing deliberate assignment command.

The narrow authenticated Company read accepts only a single nonnegative
safe-integer offset and returns Company, offset, fixed page size 25, next-page
presence and the permitted Task rows. Unsupported, repeated, array, fractional,
negative and unsafe inputs fail. Each read applies current authority and page
selection in one repeatable-read snapshot, with at most 25+1 matching Task rows
for the existence lookahead. Order is due date ascending with undated last,
then creation time and identifier. Rows show literal Task title, open state,
manual priority, date/No due date and the already readable Project/Client labels.
No dashboard metric, total count, badge, urgency classification or ranking is
added. Pagination does not promise a frozen snapshot across requests or mutations.

Previous, Next and Refresh are explicit; Refresh starts at zero. An out-of-range
page offers back/refresh, without automatic traversal. The read-only Company
view is available only through the existing Task-read entry predicate. Current
Company, identity/session/membership/authority changes and newer requests retire
old rows/replies. Loading, empty, out-of-range, unavailable/retry, denied and
malformed/foreign-response states are explicit. Interface locale changes preserve
the page, literal content, focus and request state without a business write.
Use the existing Prisme controls and inspected desktop 1440px/narrow 390px journeys.

The user opens the exact Task in its existing Project detail. A separately
authorized manager chooses a currently eligible member and explicitly saves
through the existing Task version/idempotency/uncertainty/conflict protocol.
Returning to this view reads fresh state: a committed assignment or closed Task
is absent; deliberate reopening or clearing an assignment may make it reappear.
The list creates no event, Task version/history, command outcome, Client fence
or assignment, and adds no alternate mutation or optimistic success path.

Readable open unassigned Tasks under completed/cancelled Projects, if present,
remain discoverable and open their existing read-only detail. The view does not
hide such records, reactivate a Project or relax the closure/write guards.
Superseded-original Client records likewise retain their existing read-only
mutation restriction. Existing assignment history and current ineligibility are
never rewritten to manufacture an unassigned Task.

Real App public composition proves the discover/open workflow without an
import/fixture/404-only RED; disposable PostgreSQL REST proves exact set,
25-row boundaries/order, unknown-input refusal, current authority and side-effect
absence. Registered real desktop/narrow journeys find an undated row beyond the
first page, open and deliberately assign that exact Task through the existing
form, reload its history and return to a fresh list. Readonly/no-manage,
historical/closed-Project, assigned-but-ineligible, revocation/late replies and
four-locale continuity cases remain required.

General team/all-Companies registers, member directories, bulk/automatic
assignment (the separate bounded manual grouping is owned by §31), reminders/notifications, generation/dependencies, completion evidence,
new states/lifecycle or Template changes, exports and new grants remain excluded.
The separate opt-in Company team workboard in §33 does not widen this section's
unassigned-only set, offset-only grammar or response.
This bounded discovery projection confers no real mission-start authority and
adds no whole historical MVP capability credit.

## 27. Approved exact mission Task results (#832)

**Authority and status:** Approved bounded product synthesis under Dan's explicit
D3 → D4 → D2 request of 2026-10-23, after D3 #827 / PR #831. This is not new
Iurie evidence, verification of performed work or certification authority.
[Document Registry §23](release-1-document-registry-prd.md#23-approved-bounded-mission-deliverable-pdfs-825)
owns the delivered mission family; §§18,20,23 retain ordinary Task and Project
semantics. Authorization §8 and Activity §7 retain their cross-cutting owners.
Runtime follows a separate implementation issue after this contract merges.

### Outcome and stories

A collaborator deliberately declares what one ordinary Project Task produced and
selects one exact readable frozen mission-deliverable Version. The declaration
can later be reopened and corrected without rewriting what was recorded. Existing
manually created Tasks suffice; neither a copied plan nor D2 blocks this outcome.

1. As a Task reader with Document/content authority, I reopen the current declared
   result and its exact Version/PDF, rather than a link that follows the latest.
2. As a separately authorized recorder, I select a named eligible Version from
   the Task's Project and record my result declaration without entering raw IDs.
3. As a recorder, I correct the current declaration or selected Version with an
   attributed reason, preserving the prior declaration and its exact PDF.
4. As a reader, I distinguish a superseded Document Version from the current
   official Version without treating either as approved or externally accepted work.
5. As a Task manager, I complete or reopen an ordinary Task without changing its
   recorded results or acquiring result authority merely through Task assignment.
6. As a reader whose Document access is withdrawn, I retain independently readable
   Task fields without receiving confidential result text, identities or PDF details.
7. As a recorder after a transport failure, I retry the exact uncertain command;
   a confirmed result followed by refresh failure remains confirmed.

### Result stream and exact reference

Each Task has its own initially empty result stream at revision zero. A first
record contains trimmed declaration text of 1–2000 characters and one exact
mission Document, frozen Version and preserved clean PDF identity. The server
derives the Task, Project, original Client, Company and Workspace, establishes
result identity, actor and time, and records revision one. No other Document
family, external URL, missing PDF or mutable draft qualifies.

Eligible Versions are `official` or `superseded` with their preserved clean PDF.
Selecting a historical frozen Version is deliberate and visibly historical; it
never selects a successor implicitly. The exact PDF identity remains fixed even
after a new official designation. The recorder selects the Document and Version;
Documents resolves and captures that frozen Version's current PDF, rather than
accepting an arbitrary upload identity. Read labels use the frozen Version's
title/number, not a later draft's mutable metadata. The new command additionally requires the
Document's current association to that Task's exact Project and identical original
Client, Workspace and Company. Canonical union identity never substitutes for the
original. Later unlinking or Document succession preserves recorded history and
does not itself grant or remove ordinary target-read authority.

A correction appends a successor declaration with the observed stream revision,
new text/reference and a trimmed reason of 1–500 characters, pointing to its
predecessor. It may change text, the selected eligible Version, or both. The latest
declaration is current; earlier declarations are immutable history. No in-place
edit, deletion, withdrawal, automatic retargeting or result approval is introduced.
A normalized unchanged text/reference correction is a no-op: after all current
authority/state/revision checks it confirms the existing result and may retain a
receipt, but adds no revision, declaration, Activity event or Client-fence advance.
A reason alone does not create a material correction.

New records/corrections require an open Task, open Project (§23), active exact
original Client and active Company relationship. Done/cancelled Tasks require
ordinary explicit reopening before a new result command. Existing results survive
completion, cancellation, reopening, Project closure and original Client
supersession as readable history under live authority. The result is a human
declaration, not Task completion, document designation, external delivery,
acceptance, verified evidence, obligation fulfillment or certification. Ordinary
Task completion remains permitted without a result; no stage/closure gate changes.

### Authority and confidentiality

The new independently captured **Company Task Result Recorder v1** contains
exactly `task.result.record`, under Authorization §8. It grants none of its read
prerequisites. New commands and exact committed replays additionally require
ordinary live Task manage/read, Project/original-Client read, Document metadata
read, Mission Deliverable Access and Document Content Reader in the same active
Company. They require no upload, Version-management, designation or Organizer
authority merely to select an already linked frozen Version. Existing assignments,
Workspace ownership, creator/responsible identity and migration grant nothing.

Result current/history and eligible-Version reads require live Task/Project/
original-Client read plus the Document metadata, mission-family and content-Reader
boundaries. Recorder authority is not required merely to read. Exact downloads
continue through Documents' existing live content boundary. Denied Document rights
make the result resource unavailable without disclosing whether it exists;
otherwise readable Task fields and ordinary history remain available. An authorized
empty stream is distinct from denied/unavailable result access.

Never project result IDs, declaration/reason text, Document/Version/PDF identities,
filenames or hidden counts into ordinary Task list/queue DTOs or Task history.
Result-specific history owns them under the combined read boundary. Its newest-first
pages contain at most 25 currently readable declarations, with stable revision
ordering and any next-page indication computed after privacy predicates. Current
and history reads share a coherent snapshot. An older readable declaration must
never be presented as current when the actual latest declaration is unreadable.
Unknown captured versions, wrong Company/Workspace and mismatched target IDs fail
closed. Assignment loss retires pending result UI and late replies.

### Commands, concurrency and history

Result commands carry the observed Task version, observed result revision and
stable actor/Workspace idempotency key in a dedicated result-command namespace.
The first record requires an empty stream; correction requires its exact current
revision. Conflicting key/body/Company/Task reuse and stale observations fail
without writes. Current authority and both recorded endpoints are checked before
returning an exact committed receipt, before rejecting its historical observations.
Replay may confirm earlier success after later Task completion, Client supersession
or Document unlinking; it never restores a prior declaration as current.

Serialize new result writes against ordinary Task edits/closure and competing
result commands. If Task completion commits first, a new result command fails;
if recording commits first, later ordinary completion remains valid. Competing
commands for one result revision have at most one material outcome. The result
revision is independent: recording does not change ordinary Task fields/status/
version, existing command fingerprints or ordinary Task event meanings. Revision
exhaustion is a safe refusal without wraparound or partial writes.

Use the existing Access write fences and Client-owned identity-before-relationship
lock ordering, then the Task/Document owning boundaries. Revalidate exact frozen
Version/PDF, current Project association and required live assignments through
commit. Result revision, immutable declaration/history, minimal Activity event,
receipt and original Client operational-use fence commit atomically; revocation,
invalidated related records, injected persistence failure and stale state leave
none of those partial effects. Reads, refusals, no-ops and replay advance no fence.
Migration preserves ordinary Tasks/receipts and existing Document bytes/history;
it creates no initial result or automatic assignment.

Activity §7 owns minimal internal `task.result.recorded` and
`task.result.corrected` records. This slice exposes result history through its
combined Task/Document boundary, not the ordinary Task or general Activity feed.
No separate verification/approval decision or broad Activity read is inferred.

### User journey and proof

Extend existing Task detail in Prisme/Classic, retaining ordinary Task controls.
Show an authorized empty stream, eligible named frozen Versions with status/number,
current declared result and exact PDF access, explicit correction and ordered
history. No eligible Version leaves ordinary Task work available and explains
that an associated frozen mission PDF is needed. Preserve keyboard operation,
localized copy and readable desktop/narrow layouts.

Loading, denied/revoked, unavailable, malformed, conflict/reload, historical
read-only and uncertain command states remain distinct. Preserve an uncertain
command's exact body, observations and key for explicit retry. A confirmed command
followed by failed refresh stays confirmed with a separate reload action; never
offer to resend it as a new intention. Actor, Company, Task or required captured
authority changes retire old drafts and late responses.

Start with failing public PostgreSQL REST proof: record against a linked frozen
mission Version, reload, create/designate a successor, reopen/download the original
bytes, correct, complete/reopen the Task and verify immutable declaration history.
Cover malformed/draft/empty/other-family and mismatched Client/Project/Company/
Workspace references; independent Task/record/metadata/family/content denials and
unknown versions; revocation/replay, stale observations, competing correction and
Task closure, exact/changed-key retry, no-op and injected atomic rollback. Prove
upgrade preservation and no backfill grants. Inspect every affected list/history/
Activity/selector for the same confidentiality pattern. Register the actual
App/PostgreSQL journey at desktop1440/narrow390 with synthetic data, exact historical
downloads, correction and negative authority. Deterministic provider fixtures are
not real Clerk or maintained-scanner proof.

### Exclusions and readiness

This bounded D4 contract is ready for one complete vertical implementation after
merge. D2 copied plans, D5 stage rules, D13 closure obligations, universal evidence
types, bulk assignment (separately bounded in §31), verification/acceptance/signature, operational certification,
real grants/data/providers, generation, OCR/AI, exports and deployment remain separate.

## 28. Approved bounded thirteen-activity pilot plan (#836)

### Authority, problem and first outcome

This is bounded agent product synthesis under Dan's explicit D3 → D4 → D2
authorization in [#820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820),
after D3 #827 / PR #831 and D4 #834 / PR #835. Ordered Standards then Spec
preparation under delegated documentation review approves this planning contract;
it is not a new Iurie answer, operational category approval or real mission start.

The existing §24 model copies four preparation Tasks. A user otherwise has to
re-enter the thirteen activities and intended results of the selected pilot.
D2 adds one explicitly selected, immutable source Version, one preparatory Project
and thirteen ordinary Task copies, then reopens their preserved planning context.
Existing manual registration and the two-stage/four-Task model remain usable.

The controlled [E06 annex](commercial-source-reconciliation-2026-10.md) and
[CT-AN01–CT-AN13 mapping](commercial-candidate-models-2026-10.md) supply the activity,
action and result cells. Originals and all Client identities, signatures, dates,
amounts, clauses and Standard editions remain outside this configuration. Source
line wrapping is normalized to spaces. The fixed model and copy mechanism below
are reversible coordinator choices, not evidence that the source prescribed
software workflow stages or mandatory completion rules.

### Identified Version and literal business content

The sole initial pilot source is `CONSULTING_MISSION_PILOT_ILLUSTRATIVE`, Version 1,
business title “Plan pilot pentru o misiune de consultanță SMI”, explicitly
illustrative. It is a code-defined, ordered **flat activity plan**, separate from
the legacy `CONSULTING_PREPARATION_ILLUSTRATIVE` source and its Company successors.
The user selects the identified model and exact Version; “current” or a bare
Version number cannot substitute another model. An unavailable source is not an
empty plan. Unknown keys, incompatible source shapes and unsupported Versions
are refused without partial creation or partially trusted rendering.

These Romanian business cells are preserved literally across interface locales.
Each row maps to one Task; its title is the copied Task's initial title. Action
and intended result remain source context, independently of later Task edits.

| Stable key | Initial Task title                          | Planned action                                                                        | Intended result                      |
| ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| `CT_AN01`  | Analiza organizației și audit diagnosticare | Analiza sistemului existent și determinarea gradului de conformare la standardele ISO | Plan de implementare (PDCA)          |
| `CT_AN02`  | Formarea structurii proiectului             | Stabilirea echipelor de lucru și a responsabililor                                    | Ordine interne, structură proiect    |
| `CT_AN03`  | Elaborarea hărții proceselor                | Identificarea proceselor și stabilirea proprietarilor                                 | Harta proceselor aprobată            |
| `CT_AN04`  | Stabilirea modelului de proces              | Definirea modelului de documentare și evaluare a riscurilor                           | Model proces și metodologie aprobată |
| `CT_AN05`  | Formarea echipelor pe procese               | Stabilirea responsabilităților și modului de lucru                                    | Structură echipe și responsabilități |
| `CT_AN06`  | Instruirea personalului                     | Instruirea în cerințele standardelor și documentare                                   | Personal instruit și testat          |
| `CT_AN07`  | Elaborarea documentației SMI                | Elaborarea procedurilor, regulamentelor și instrucțiunilor                            | Documentație SMI completă            |
| `CT_AN08`  | Aprobarea documentației                     | Analiza și aprobarea documentelor de către management                                 | Documente aprobate                   |
| `CT_AN09`  | Implementarea sistemului                    | Aplicarea documentației în activitatea curentă                                        | Sistem implementat                   |
| `CT_AN10`  | Instruirea auditorilor interni              | Instruire și testare auditori                                                         | Auditori certificați                 |
| `CT_AN11`  | Audit intern                                | Planificare, realizare și raportare audit                                             | Raport audit + NC                    |
| `CT_AN12`  | Acțiuni corective                           | Eliminarea neconformităților                                                          | Plan acțiuni implementat             |
| `CT_AN13`  | Suport certificare                          | Asistență la audit extern                                                             | Certificare obținută                 |

All result cells are **intended**, including “Auditori certificați” and
“Certificare obținută”. Copying, editing or completing a Task proves none of them.
The interface identifies the plan as illustrative and the results as expected;
§27 alone owns deliberate actual-result declarations, which still imply no
verification, approval or certification. No result declaration or Document link
is populated by copying this plan.

The thirteen source rows are not mapped to the Offer's eighteen stages or to
§24's two software stages. This source has no `required`/optional classification,
current workflow stage or stage-advance command. A stage-progress read reports
that no supported progression is configured; an attempted advance is refused
without a receipt, transition, event or fence. The existing legacy progression
and its required Task semantics remain unchanged. D5/D13 retain obligation,
exception, stage and consulting-completion decisions.

### Actors, explicit authority and compatibility

Authorization §8 owns the next immutable **Company Project Template User v2**.
Its exact permission set is v1's `project.template.read` and
`project.template.instantiate`, plus `project.template.pilot.read` and
`project.template.pilot.instantiate`. The two pilot permissions cover only the
identified pilot model and its copies. Existing captured v1 remains exactly its
two legacy permissions; null/unknown versions fail closed. Existing v1 holders
retain legacy catalogue, copy and instantiation behavior and receive no pilot
access automatically. An administrator with `company.assignment.manage`
deliberately revokes/regrants through the existing Company assignment commands
to capture v2. There is no separate assignment type or implicit migration,
bootstrap, responsibility or Workspace-owner grant.

| Operation                          | Live independent requirements                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Pilot catalogue/exact source       | Active Company context, Project read, Template read and pilot read                                                              |
| Pilot copied-plan read             | Above, Task read and the Project's original Client/Company read boundary                                                        |
| New pilot Project creation         | Above, Template instantiate and pilot instantiate, Project create, Task manage, active original Client and Company relationship |
| Edit/assign/complete a copied Task | Existing ordinary Task permissions and state rules; copying grants none                                                         |
| Declare/read an actual result      | Independent §27 authority; Template access grants none                                                                          |

All operations retain same-Workspace/Company constraints and captured-grant
validation, including suspension/revocation. Other Companies receive no copies,
Task identities, receipts, counts or history. The initial anonymous source itself
contains no Client or Company-specific policy. Copied-plan denial leaves ordinary
authorized Project/Task and Document work available.

Company Project Template Configuration v1 continues to publish only the four-title
legacy successors under §24. User v2 grants no publication, stage advancement,
lifecycle, assignment administration, Client, Project or Task authority. The pilot
Version has no editor, successor-publication API, withdrawal or approval lifecycle
in this slice. An approved future content change must introduce another immutable
Version, preserve Version 1 and all existing copies, and receive its own contract;
it cannot edit this Version in place.

### User stories and usable path

1. As a Template reader, I can choose the identified pilot model and exact Version
   and inspect all thirteen actions/intended results before using it.
2. As an independently authorized creator, I supply the ordinary Project title
   and active related Client and create the complete plan in one deliberate act.
3. As a Task reader, I reopen all thirteen source rows and their actual Task
   identities without deriving progress from editable titles.
4. As a Task manager, I deliberately assign, date, prioritize, edit, complete,
   cancel or reopen Tasks under their existing rules, preserving the source copy.
5. As a collaborator, I distinguish an intended result from an actual §27
   declaration and can use the ordinary Task detail independently.
6. As a historical reader, I retain the original plan after Task edits, ordinary
   Project closure, original Client supersession or later source evolution.
7. As an administrator, I explicitly activate v2 for a chosen same-Workspace
   member/Company while existing v1 and other independent grants stay unchanged.
8. As a creator with an uncertain response, I retry the exact intent/key, recover
   the one Project and avoid silently copying another model or newer Version.
9. As a user changing locale, I keep literal source text, entered work and the
   exact selected Version; changing identity/Company/required authority retires
   old source drafts and late replies.
10. As a legacy user, I keep manual Projects, four-Task copies, title successors,
    stage history and ordinary Tasks without being forced to adopt the pilot.

Each new Task starts `todo`, priority `normal`, unassigned and undated, just as
§24. The Project remains `preparatory`. An existing authorized user subsequently
chooses responsibility and dates; source activity order is not scheduling,
automatic assignment, a dependency graph or a completion obligation. Existing
§23 closure still rejects open Tasks; cancellation does not assert fulfillment
of an intended result. Closed Projects remain terminal. No new activation,
closure or reopening behavior follows from a plan copy.

### Preservation, command contract and atomicity

Creation preserves the model key, exact Version, literal title and every ordered
stable activity key/title/action/intended result, plus a one-to-one mapping to
all thirteen Task identifiers. Reads use that immutable source snapshot, not
today's catalogue or current Task titles. Ordinary extra Tasks do not become
source rows. No route edits/deletes the copy or changes its original Client,
Company or source identity. Existing Project and Task histories remain owners of
their ordinary changes; a copied plan is not an execution history.

The existing actor/Workspace stable idempotency key fingerprints the complete
normalized creation intent: Company, original Client, Project title and exact
model key/Version. Caller-provided activities, intended-result overrides, Task
assignments or stage rules are rejected. Identical retries/concurrent commands
resolve one Project, thirteen Tasks and the same mapping. Reusing a key for a
different model, Version, title, Client or Company conflicts, including reuse of
an ordinary manual Project key. An intentionally new key can create another
Project; same title is not deduplication.

Live dedicated and independent prerequisites plus original Project visibility
precede an exact committed receipt. Replay may confirm the preserved Project
after closure or original Client supersession when current read authority still
allows it; it does not require the old new-creation state or repeat writes.
New creation requires the active original Client relationship. No implicit
rebase, source substitution, duplicate creation or automatic retry follows a
definite conflict.

Project, thirteen ordinary Tasks, complete snapshot/mapping, durable creation
identity, one ordinary `project.created` event, thirteen ordinary `task.created`
events and the original Client operational-use fence commit atomically. One
failure records none. Reuse the existing Client barrier/lock order and
caller-owned transaction; no child read opens an independent owning transaction.
Creation serializes against revocation and suspension: if denial wins, no copy
is committed; if creation wins, the complete committed copy remains attributable.

### UI, privacy and upgrade proof

Model and Version controls have explicit localized names; source business text
is never translated by a locale switch. Loading, malformed, unavailable, denied,
missing source, uncertain receipt and definite intent conflict are distinct.
No partial thirteen-row plan is rendered as valid. Exact uncertain title/Client/
source/key/body remain frozen for explicit retry; an intentional change starts
a new intent. Locale changes issue no source-only reload. Identity, session,
Company and captured Template authority changes retire old source replies;
unrelated Task, Document and actual-result owners retain their independent state.
The model flow does not clear or block the ordinary manual-registration draft.

Use the existing presentation/Select and Project/Task detail owners. Copied rows
display their initial title, action and expected result and identify the linked
ordinary Task so the user can work with it. Desktop1440 and narrow390 must expose
all rows, keyboard selection and readable no-overflow content. The fixed count
needs no unbounded list or new search/export feature.

Additive migration preserves all old assignments, Projects, four-row copies,
source Versions, IDs, receipts, stage transitions and D4 declarations/bytes.
Existingv1 captures retain their exact permissions. New source positions and
immutable guards must not weaken legacy four-row bounds or allow pilot stage
progress, foreign links, duplicate mappings, source mutation or deletion.
There is no backfill model, Task, grant, declaration or source approval.

Prove the owning PostgreSQL REST seam first: exact thirteen rows/Task defaults,
model/Version qualification, malformed overrides, legacyv1 refusal and deliberate
v2 grant, all independent denials/unknown versions, foreign Company/Workspace,
revocation/suspension ordering, concurrent exact/changed-key retry, atomic fault
rollback, immutable mapping/source, genuine previous-schema upgrade and preserved
closed/superseded-Client history. Edit an ordinary copied Task and publish a
legacy successor without changing the preserved pilot copy. A pilot advance
must be refused while the old compatible stage journey remains usable.

Register the actual App/PostgreSQL journey at both viewports: explicitly grant
synthetic v2, select Version 1, create/reload all thirteen actions/intended results,
open/edit an ordinary Task and reopen the unchanged plan. Prove source/authority
denial and exact uncertain recovery through the public UI; inspect the same
source-context pattern in every affected selector/copy/history. Deterministic
provider fixtures are not real Clerk or scanner proof. Current-source review,
complete integration verification and guarded merge retain their usual owners.

### Exclusions and readiness

This contract is ready for one complete vertical runtime issue after merge.
Operational category/Template approval, pilot source editing/publication,
universal workflow/model editors, mandatory/optional obligations, D5 stage rules,
D13 fulfillment/closure exceptions, bulk assignment (separately bounded in §31), actual-result automation,
certification/training approval, real source import/grants/providers, commercial
content/prices/numbering/signatures and deployment remain separate. No unresolved
real numbering, legal or certification decision blocks this anonymous planning
mechanism; none is silently decided by it.

## 29. Mission readiness, attributable review and later governance

The [mission-obligation contract](release-1-mission-obligations-prd.md) owns the
delivered §13 read-only diagnostic outcome (#883 / PR #884) and the next approved
§14 attributable result review under #885. Review is a separate human judgment
against preserved intended results and identified evidence; an external/physical
reference creates no §27 PDF declaration. Raw diagnostic codes convey no review
adjudication or fulfillment predicate; the current UI must not label an actually
separately reviewed result as lacking any review.

Neither outcome adopts a completion policy, changes ordinary Task/lifecycle or
enables a pilot stage transition. Later guarded completion/applicability mutations
require complete bounded contracts. The same PRD's
[open-question register](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
retains unanswered `MISSION-CLOSE-01` across handoffs for Dan's single consolidated
email to Iurie. No certificate, waiver, actual grant or external message follows.

## 30. Company-configured mission plans

The [Company mission-plan contract](release-1-configurable-mission-plans-prd.md)
under #917 / #918 owns reusable Company flat plans, immutable Versions and exact
Project/Task copies. Its status controls product readiness; runtime follows a
separate issue after contract merge. Existing manual, four-Task illustrative and
thirteen-activity pilot journeys retain their source, grants, histories and rules.
Custom planning content does not expand the pilot-only readiness/review policy,
introduce stages or decide obligations, certification or closure. Native Project,
Task, Client and Document owners remain independent.
The same contract's [current-work overview §11](release-1-configurable-mission-plans-prd.md#11-current-work-for-a-configured-mission-plan),
under #939 and Approved, owns the separate complete source/current
Task/result read and exact native Task continuation. Its status controls readiness;
it adds no pilot diagnostic/review or completion policy.

## 31. Bounded grouped Task responsibility and due-date planning (#927)

### Authority, problem and outcome

**Status:** Approved bounded MVP contract — root's delegated product disposition
on 2026-10-28 after ordered independent Standards then Spec preparation
(zero blockers), under Dan's
requested continuation after #925 / PR #926 and the
[standing delegated review authority](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237).
The review disposition is recorded in #927; runtime delivery remains separate.
This is no new Iurie answer, actual assignment
or broader planning policy.

After creating a mission with its native Tasks, a manager currently opens every
Task separately to assign responsibility and dates. From one Project, the manager
selects open Tasks, reviews each Task's responsible member and due date, and saves
the selected planning changes together. Thirteen copied activities can therefore
be planned with one deliberate submission. This also serves manually created
Tasks; there is no special mission-only Task model.

The user stories are: select precisely the Tasks to plan; enter different people
and dates per Task or keep/clear an existing value; save everything or nothing;
recover the exact result after a lost reply; inspect individual native history;
and continue with the existing Task detail/My Tasks/attention journeys. Selection
never means all filtered or unseen Tasks and creates no automatic assignment.

### Scope, actors and inherited meaning

Use the existing live Company Task Manager v1 `task.read`/`task.manage`, Company
context, Project read and original Client/read relationship boundaries (§18).
No new permission or captured grant, implicit Owner/Director authority, real
assignment or eligibility exception is introduced. Access still owns the narrow
eligible-assignee query and live reassignment check. An unchanged historical
assignee may remain even if now ineligible; a newly selected non-null assignee
must be currently eligible. Clearing is permitted. Assignment grants no access.

The Project must be open under §23 and its exact original Client active for a new
command, including an all-no-op command. Only `todo`, `in_progress` and `blocked`
Tasks may be planned; current status, blockage declaration, title, priority,
completion, results/reviews, source/copy mapping and intended results are unchanged.
Done/cancelled Tasks cannot be changed or implicitly reopened. Responsibility and
dates retain §18 semantics: null is valid, exact YYYY-MM-DD years0001–9999 without
timezone conversion, valid past dates allowed, no inferred working days, duration,
sequence, capacity, reminders or legal deadline.

### Command, atomicity and historical recovery

One Task-owned public command addresses one Project and carries 1–50 distinct
Task rows. Each row contains only exact Task identity, observed Task version,
desired assignee membership or null and desired due date or null. Both desired
fields are explicit; omissions, duplicates, unknown fields, invalid dates/versions,
foreign/out-of-Project Tasks and oversized/empty batches fail without mutation.
Workspace, Company, original Client, actor, time and display attribution are
server-established. Input row order is preserved in the returned result and is
part of exact command identity. One actor/Workspace idempotency key uses the
existing Task-command namespace with an unambiguous grouped-command discriminator;
cross-command/Company/Project/payload reuse conflicts, never parses a different
receipt as this result. Existing single-Task fingerprints/receipts stay compatible.

The smallest native Task planning participant is reused by individual and grouped
edits inside one caller-owned transaction. No nested owning transaction, duplicate
Access/Client/Project policy, repeated external HTTP edits or frontend-only
partial-success loop qualifies. Retain native actor/assignee revocation and
suspension serialization, original Client identity-before-relationship barrier,
Project close guard and stale-version checks. Serialize overlapping Task writes
with stable lock ordering. A concurrent edit/closure/Client union/access change
either precedes the group and causes its normal refusal, or follows a completed
group; it must not produce unauthorized or partial results.

Each material Task change increments that Task version once and creates the
existing attributed `task.updated` history with exact before/after responsibility
and/or date. Use the native Client operational-use fence for material changes;
no-op Tasks add no version, history or fence advance. The single durable group
outcome contains all exact Task receipts, including no-ops. Tasks, native events,
fence and receipt commit together; any last-row/event/receipt failure rolls all
of them back. No new generic Activity event or visibility expansion is introduced.

Exact committed replay rechecks live actor manage/read and visibility of the
original Project and all selected Tasks before returning the historical complete
outcome. It precedes fresh expected-version, open-state, original-Client-active,
Project-open and changed-assignee eligibility checks, so a readable committed
result remains confirmable after later completion, closure, union or eligibility
loss. Current authority loss still denies without leaking receipt/Task details.
Replay, reads, refusals and all-no-op outcomes add no business history or fence.
Fresh reads, not replay receipts, authorize subsequent actions.

### Interface, lifetime, localization and compatibility

Offer a separate, explicitly opened grouped-planning region in native Project
Tasks when current manage authority and mutability permit it. Users choose rows
from the current complete authorized Task listing, by title and state, with an
explicit 50-row selection bound. Nothing starts selected. Each selected row shows
its title, observed state/version and existing or deliberately edited responsible
member/date. The existing shared Select and date semantics remain usable by
keyboard at1440px and390px without horizontal page overflow. Explicit selection
and one submit are sufficient human intent; add no separate approval workflow.

Distinguish loading, no open Tasks, no eligible member, read failure/retry,
validation, denied/missing, stale/closed/historical Client refusal, pending,
uncertain, confirmed and subsequent refresh failure. A lost/malformed response
preserves the exact path, normalized ordered body, versions and key for explicit
identical retry. Disable changes/submission while pending or uncertain. A conflict
offers explicit reload before a new intent; never auto-retry/rebase/partially
resubmit. Confirmation stays confirmed if refresh fails, with explicit fresh-read
recovery. Closing/reopening within the same context preserves drafts and saved
attempt; ordinary per-Task work is blocked during pending/uncertain group intent
and retains its independent draft otherwise. New Tasks are not added to a saved
selection implicitly, and later list reads never rewrite an uncertain command.

Use existing Company/session/grant-version owner lifetime: retirement permanently
discards that consumer and suppresses all late successes, denials, callbacks and
navigation even if cancellation is ignored or context changes A→B→A. Switching
interface locale preserves literal titles/dates, selection, node/focus state,
drafts and exact command identity without I/O. Central ro/ru/fr/en interface copy
uses the accepted Prisme controls and existing Task wording; no visual system is
added. No confidential target/member identifier is requested as manual input.

### Acceptance, verification and readiness

1. Real PostgreSQL REST plans different assignees/dates on several native Tasks
   together, including blocked/in-progress, clear values and mixed no-op/material
   rows; exact detail/history, My Tasks and date discovery reflect only those edits.
2. Strict malformed/empty/over50/duplicate/foreign/out-of-Project/closed Task,
   stale version, unavailable changed assignee, authority/scope loss, closed
   Project and superseded original Client refuse the whole group. No-op checks
   retain normal live authorization/version/state requirements.
3. Deterministic PostgreSQL ordering proves identical concurrent retry gives one
   outcome, changed intent conflicts, overlapping groups/individual edits cannot
   partially commit, actor/changed-assignee revoke or suspend races serialize,
   and final-row/event/receipt failure rolls back earlier writes/history/fence.
4. Exact historical replay after later edits/completion/Project closure/Client
   union returns the same complete outcome under live authority, without new
   events/fence; native individual receipts and command namespaces stay intact.
5. Registered real App/PostgreSQL desktop1440/narrow390 journey creates a synthetic
   thirteen-Task mission, selects and plans multiple Tasks by keyboard, saves,
   reloads each chosen native Task/history and My Tasks, and reopens the unchanged
   source copy. No user manual test is required.
6. Public UI protocol tests prove exact lost/malformed-reply retry, stale reload,
   confirmed-write/read-failure distinction, selection bound, readonly/empty/error
   states, four-locale continuity and retired A→B→A late200/403 suppression. Test
   the production parent wiring as well as the focused form.

After approval and documentation merge, one separate vertical implementation
issue may become ready with these public seams, fresh ownership/doctor/fit checks,
targeted tests and review before complete exact-integration verification. NestJS
and PostgreSQL remain authoritative; no external service or new dependency is
needed. Prefer existing receipt storage without migration when its invariants
support this distinct result; any required schema change needs a reviewed migration.
This section supplies no runtime delivery credit.

Excluded: bulk status/completion/priority/title editing, cross-Project or Company
planning, automatic date or member proposals, dependencies/Gantt/resource planning,
imports/exports, Calendar, notifications, new categories/mandatory obligations,
certification, legal/financial decisions, actual tenant grants/data/configuration,
deployment and whole-MVP approval. Mission Obligations §12 retains unanswered
`MISSION-CLOSE-01` for the single consolidated email; this planning mechanism
neither depends on nor decides that policy.

## 32. Bounded Company blocked-Task supervision (#931)

**Status: Approved bounded contract; runtime delivery tracked by #933.** Dan approved this
next feature on 2026-10-28 after grouped planning #929 / PR #930: see all recorded
Task blockages in the active Company with reason, responsible member and date,
then open the exact native Task to act. This is a bounded product synthesis,
not a new Iurie answer. Sections 18–20, 23 and 31 remain the mutation authorities;
this section owns only read-only discovery and continuation.

### Problem, outcome and user stories

Personal attention shows only the reader's own Tasks; Company overdue excludes
undated and future-dated Tasks; unassigned discovery excludes assigned Tasks.
A coordinator must otherwise open every Project to find the remaining recorded
blockages. This view makes all currently readable blocked Tasks discoverable in
bounded pages without inventing a Project blockage, obligation or automatic action.

1. As an authorized Company Task reader, I want all readable Tasks currently
   `blocked`, whoever is responsible, so that I can find the recorded obstacles.
2. As that reader, I want the exact current reason, declaring person and time,
   so that a recorded explanation is distinguishable from an inferred diagnosis.
3. As that reader, I want the recorded responsible member or unassigned state,
   exact due date or No due date, priority, Project and Client labels, so that I
   can identify the work and the person to contact.
4. As that reader, I want dated and undated blocks and complete bounded pages,
   so that future dates or a preview limit do not hide remaining work.
5. As that reader, I want explicit Previous, Next and Refresh, so that I control
   when current facts replace the page I am reading.
6. As that reader, I want failed, malformed, denied, empty and out-of-range reads
   distinguished, so that unavailable work is never presented as no blockages.
7. As that reader, I want to open the exact Task and its native history, so that
   I can examine its explanation without a second editable copy.
8. As a separately authorized Task manager, I want to resume or edit it through
   the existing native command, so that version, authority and retry rules apply.
9. As that reader, I want returning to the view to read fresh facts, so that a
   resumed or closed Task disappears and a newly declared blockage appears.
10. As that reader, I want historical-original Client and closed-Project Tasks
    to remain discoverable when readable, so that their facts are preserved
    without reopening the Project or enabling a forbidden mutation.
11. As a user changing Company, session or authority, I want old rows and replies
    permanently retired, so that another context cannot disclose or navigate them.
12. As a keyboard or narrow-screen user, I want usable controls and complete
    literal reasons, so that layout or locale never hides operational facts.

### Reader, records and authority

Use the exact current Task-read prerequisites of §18: active Workspace membership,
active authorized Company context, captured Company Task Manager v1 `task.read`,
Project read and original-Client read/active Company relationship. Access and the
native Project reader revalidate those requirements on every request. Ownership,
Company context, responsibility or a view entry never grants permission.

The set is exactly native Tasks whose stored state is `blocked`, in readable
Projects of that Workspace/Company. Include assigned-to-self, assigned-to-other
and unassigned Tasks, with past/current/future/null dates. Do not filter by
assignee eligibility, date, priority or Project lifecycle. Readable historical
original Clients keep their original labels; readable closed Projects keep their
existing read-only continuation. No canonical Client union detail or other Company
information is added. A Task not currently blocked is absent, even if its history
contains an earlier blockage.

Rows preserve the native Task identity/version and current blockage declaration
(reason, actor and server time), native recorded assignee or null, date, priority,
and the readable Project/Client labels. Historical recorded assignee labels are
facts, not proof of current eligibility. Render reasons as complete literal text,
including long/untrusted text, never HTML, a guessed summary or a generated cause.
Native detail/history remain the authoritative explanation and mutation owners.

### Bounded read, consistency and compatibility

One authenticated Task-owned Company read accepts only an optional single
nonnegative safe-integer offset, default zero. Unknown, repeated, array,
fractional, negative and unsafe query inputs refuse. Return Company, requested
offset, fixed page size 25, next-page presence and at most 25 complete Task rows;
use at most 25+1 matching-row lookahead. There is no total/count/urgency metric.
Order by exact due date ascending, null last, then creation time and identifier,
reusing the unassigned-discovery ordering rather than adding a priority ranking.

Establish current authority, readable Projects and page selection in one
repeatable-read snapshot. Cross-page reads need not share a frozen snapshot;
resumption, new blocks and other concurrent native changes may change later
pages. No Task/version/history/Activity event, command receipt or Client reversal
fence is written. No schema, dependency, provider or new permission is needed.
Existing My Tasks, personal attention, overdue, unassigned, grouped planning and
Task response/fingerprint/receipt contracts remain compatible and unchanged.

### Production interaction and failure states

Offer a separate Company-scoped **Blocked Tasks** view only under the existing
Task-read entry predicate, in both supported frames. Mount/read on deliberate
entry and refresh on return; do not poll or infer facts from another list. Use
the accepted Prisme controls and existing responsive layout.

Previous/Next read their explicit fixed page; Refresh starts at zero; Retry repeats
the failed page. An out-of-range page offers Back/Refresh without auto-traversal.
Loading or a new page withholds old rows. Genuine empty, out-of-range, network
unavailable, refused/retired authority and malformed/foreign response stay
separate; no unavailable read becomes a false empty result. Validate the complete
page and native Task/blockage/Project context before rendering or offering Open.
Preserve server order and accept additive HTTP metadata deliberately; unknown
or inconsistent required fields fail closed.

Open continues into the exact existing Task-in-Project journey and its fresh
owning reads/history. Preserve its protected pending/uncertain native commands,
independent drafts, conflict/reload and read-only state. The discovery list never
resumes, assigns, edits or marks success itself. After a separately authorized
native change, returning re-reads: a resumed/completed/cancelled Task is absent;
a new current blockage may appear. No update is inferred before that read.

Current Company, Internal User/membership, identity/session and captured authority
changes retire rows, pending reads and callbacks. Newer requests, unmount and
consumed A→B→A transitions permanently suppress late200/403 and stale navigation,
even if transport ignores abort. The existing native destination owns continuation
recovery; its lost authority cannot be bypassed by a cached list row.

Romanian, Russian, French and English copy follows the localization owner.
Changing locale preserves the exact page, literal reason/name/date data, focused
control and pending read without I/O. Keyboard controls, visible focus, complete
wrapped reasons and horizontal fit are required at desktop1440/narrow390.

### Acceptance and implementation readiness

1. Real PostgreSQL REST proves exact current blocked set, any/null assignee and
   all date cases, current reason/attribution, native Project/Client labels,
   fixed25 boundaries/lookahead/order, strict inputs and no duplicates/omissions
   on an unchanged data set. Unrelated native reads remain compatible.
2. Public negative cases prove current Company/Workspace/Task/Project/Client
   authority and live revocation/suspension, no scope leakage, readable
   closed/historical behavior and the absence of read side effects. Native
   resumption/closure removes a row; a new blockage shows only its new declaration.
3. Production App/HTTP tests prove the authorized entry and exact native
   continuation, protected native intent/drafts, failed reads/retry, malformed
   scope/state/declaration/page, empty/out-of-range and explicit paging/refresh.
   Verify Company/session/grant A→B→A retirement, late200/403 suppression and
   four-locale page/literal/focus continuity without extra I/O.
4. A registered actual App/disposable PostgreSQL journey at1440/390 creates
   synthetic dated and undated blocks across readable Projects and assignees,
   discovers an undated block beyond page one by keyboard, inspects its exact
   native explanation/history, deliberately resumes that Task through the existing
   command, reloads its history and returns to a fresh list. Other blockers and
   original source facts remain unchanged. Inspect original screenshots and
   assert horizontal fit; a fixture/import/404-only test is insufficient.

After ordered Standards then Spec preparation and approval/merge, a separate
vertical runtime child may become ready with these seams and no human manual test.
No Iurie answer or real tenant setup is required for this read projection.
MISSION-CLOSE-01 remains solely in Mission Obligations §12 for one consolidated
email; this view neither depends on nor decides that completion policy.

Excluded: automatic diagnosis/unblocking/escalation or assignment, notifications,
new states/reasons/vocabularies or metrics, all-Companies/member directory/general
team register, Task mutations on this view, obligation/evidence assessment,
financial/legal/certification/closure decisions, exports, actual data/grants,
external setup/deployment and whole-MVP approval.

The separate opt-in Company team workboard in §33 does not widen this section's
blocked-only set, offset-only grammar or response.

## 33. Bounded Company team Task workboard (#944)

**Status: Approved bounded contract after ordered independent Standards then
Spec preparation and root's [delegated approval](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/944#issuecomment-6473889873) on 2026-10-28.** This is a prospective
documentation contract, with no runtime delivery claim. Product Vision
[§2](product-vision-prd.md#2-problem-statement), [§4](product-vision-prd.md#4-desired-outcomes)
and [§7](product-vision-prd.md#7-actors) supply the shared-operations and
Company-manager oversight direction. [#944](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/944)
qualifies this bounded synthesis under [delegated product review](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237)
and [independent preparation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283696600).
Filter choices, bounds and interaction below are reasoned reversible product
synthesis, not new Iurie answers, real grants or evidence of tenant adoption.

### Problem, value and user stories

The current native My Tasks read is self-only. Unassigned (§26), blocked (§32)
and overdue discovery select special-purpose subsets; they omit assigned,
nonblocked work that is not overdue. The native Project Task list has local
filters but requires opening each Project. A Company coordinator therefore lacks
one complete team workboard across already-readable Projects. This addition has
value when a reader can find that omitted work, reach a matching row beyond the
first page, act through the exact native Task and return to current facts. These
are acceptance outcomes, not a new operational metric or a claimed real saving.

1. As an authorized Company Task reader, I want open work across readable
   Projects, including Tasks assigned to other members, so that personal or
   special-purpose lists do not hide team work.
2. As that reader, I want an explicit all-states or one-state choice, so that
   readable closed facts can be found without reopening anything.
3. As that reader, I want all responsibility, unassigned or literal recorded-name
   matching, so that I can narrow existing work without looking up personnel.
4. As that reader, I want an optional inclusive manual due-date interval and
   truthful No due date display, so that stored dates remain literal facts.
5. As that reader, I want deliberate Apply, bounded complete pages and fresh
   Refresh/Retry, so that draft edits do not send requests or mislabel old rows.
6. As that reader, I want exact native Task/history continuation and a fresh
   return with my criteria, draft and page retained.
7. As a separately authorized manager, I want the native editor and its protected
   intent preserved even when workboard filters, reads or access fail.
8. As a user changing context or authority, I want retired replies and navigation
   permanently suppressed, including after returning to an equal-looking context.
9. As a keyboard, narrow-screen or four-language user, I want complete literal
   facts, usable controls and stable focus without locale-only requests.

### Records, actors and exact authority

The set contains only native Project-linked Tasks of the selected active Company
in the established Workspace, intersected with the native readable Project set.
It includes manual and copied Tasks. There is no additional Project-lifecycle or
assignee-eligibility filter: readable completed/cancelled Projects, active or
superseded original Clients and recorded now-ineligible assignees retain their
native facts and labels; native closed/historical write guards still apply.
Neither a missing current eligibility record nor a homonymous name clears or
merges an assignment.

Every request re-establishes active Internal User, same-Workspace active
membership and active authorized Company context. Access must prove the live
known captured Company Task Manager **v1** `task.read`, independent live Company
Project Access **v1 or v2** `project.read`, and native original-Client read:
current Workspace `client.manage` or a live Company Director Client Access **v1
or v2** containing `client.read`, with the original active Client–Company
relationship. Captured assignment identity, Company, membership, revocation and
known version must agree; null/unknown captures fail closed. The native Access,
Project and Client owners evaluate these conditions, including the existing
Company-context alternatives; a copied permission string is insufficient.

The UI uses the existing Task-read entry predicate in both Prisme and supported
Classic frames. Entry is only an affordance; it confers no server authority.
Responsibility, creator, job title, Workspace ownership, Company selection and
Template/result/Document rights confer no substitute permission. The workboard
requests no eligible-member query, directory, email or unrelated member fact.
Name matching uses only recorded assignee labels on otherwise readable Tasks.
Historical Client labels stay original; canonical union and hidden Company
activity remain outside the projection. The ordinary Task/Project/Client owners
retain mutation/refusal, result, history and lifecycle rules in §§18–23,27,31.

### One public read and deliberate criteria

Add exactly one authenticated Task-owned `GET /team-tasks`, with Company selected
through the established Actor context, not a path/body/query scope override.
The only query keys are:

| Key                     | Accepted value and default                                                                                                                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`                 | Omitted means `open` (`todo`, `in_progress`, `blocked`); otherwise exactly `open`, `all`, `todo`, `in_progress`, `blocked`, `done` or `cancelled`. `all` includes all five native states.                                                                               |
| `responsibility`        | Omitted means `all`; otherwise exactly `all`, `unassigned` or `name`. Unassigned means stored null assignment, not loss of eligibility.                                                                                                                                 |
| `assigneeName`          | Required only for `responsibility=name`; forbidden otherwise, even empty. Trim outer whitespace using the native JavaScript trim convention; require 1–200 Unicode code points after trimming, valid Unicode scalar text and no U+0000. No membership identifier input. |
| `dueFrom`, `dueThrough` | Independently optional exact valid `YYYY-MM-DD`, years0001–9999, with `dueFrom <= dueThrough` when both exist. Empty, null-like, whitespace, timestamps and impossible dates refuse.                                                                                    |
| `offset`                | Omitted means zero; one ASCII decimal digit string representing a nonnegative safe integer, as in native discovery. Leading zeroes are accepted and echoed numerically; signs, whitespace, exponent and fractional forms refuse.                                        |

All supplied values must be single strings. Unknown keys, repeated keys even
with equal values, arrays/objects, malformed encoding, unsafe offset or invalid
combinations refuse without a partial response. Reject repetitions at the raw
HTTP boundary before any parser can silently keep one value. There is no page
size, sort, title/content query, priority, member ID, preset or Company selector.
Omitted date bounds mean no date restriction and include undated Tasks. Any
present bound excludes null dates; one bound is open-ended, two are inclusive.
Past dates and equal endpoints are valid. Use stored calendar text without time,
timezone, current-day sampling, inferred working days or urgency meaning. This
inherits the native date grammar preserved by #305 and §18, not a second date
model. There is no extra undated-only mode in this addition.

The recorded-name comparison follows native title filtering's NFC and Romanian
spelling precedent, with an explicitly bounded case mapping for this new server
predicate. Define `F(text)` as NFC, then these exact one-character lowercase
pairs, then Romanian folding: ASCII A–Z to a–z; Latin À–Ö and Ø–Þ to à–ö and ø–þ;
Œ→œ and Ÿ→ÿ; Romanian Ă/Â/Î/Ș/Ş/Ț/Ţ to ă/â/î/ș/ş/ț/ţ; Russian А–Я to а–я and
Ё→ё; finally `ă/â→a`, `î→i`, `ș/ş→s`, `ț/ţ→t`. Every other scalar remains
unchanged. Match when `F(recorded displayLabel)` contains `F(trimmed name)` as a
literal contiguous substring. Thus decomposed/composed Romanian names and cedilla
variants match; `й` and `и` remain distinct, as do accents outside the named
Romanian folds. Unknown-script case variants remain distinct. Do not substitute
locale-sensitive or generic JavaScript/SQL lowercase and claim all-Unicode
equivalence. Preserve submitted draft text and original displayed names; the
trimmed, case-preserving name is the applied literal and echo. Homonymous labels
may match several distinct memberships; this is no identity assertion.

This exact comparison must execute in the backend predicate before offset/limit.
PostgreSQL's built-in NFC normalization and finite literal character translation
can express it without an extension, persisted normalized column or new package;
qualify the chosen expression against actual PostgreSQL. Prefer literal substring
position. If LIKE is used, bind values and escape the escape character, `%` and
`_` before adding only the intended outer substring wildcards, with explicit
escape semantics; never regex, interpolate SQL, or treat caller wildcards as
operators. The frontend boundary must use the same exact finite comparison for
response validation. Prove supplementary characters, NFC, Romanian, Latin/Russian
case, preserved unknown-script distinctions, quotes, backslash, `%` and `_`.
Filtering a fetched page or fetching all Tasks into JavaScript does not qualify.

### Error order, snapshot and bounded response

Order is explicit: the authentication/Actor adapter first returns401 for missing
or invalid identity and403 for inadmissible Workspace/membership/Company context.
For an admitted Actor, strictly parse the full query next (400 on invalid input),
then in the read snapshot recheck live Task/Project/Client authority (403 on loss),
then establish readable Projects and apply every filter, order and page. Hidden
Projects/Clients contribute no row, lookahead or count. No readable Projects or
no matches is a genuine200 empty page after successful authority checks. This
collection has no item404 probe. Invalid stored facts/projection produce an
unavailable response without partial rows, never a fabricated empty page.

One Task-owned caller opens exactly one **read-only repeatable-read** transaction.
All live Actor/Task/Project/Client authority, original relationships and labels,
Task predicates and page selection use that same transaction connection and
snapshot. Use the native unlocked Access read and Client's existing read-only
authority participant; any needed narrow Project/Client participant must join the
caller and preserve its owner's policy. In particular, ordinary Project label
visibility or Actor payload strings alone do not prove the live Client grant.
No nested owning transaction or fresh pooled connection may silently escape the
snapshot. No row/advisory/command lock, Client identity/update barrier, lifecycle
write guard, reversal-fence advance, command receipt, Activity event or other
effect belongs to the read. Concurrent revocation or native change may fall
before or after snapshot establishment; each returned page must be coherent,
and every subsequent native read/command rechecks current authority.

Select at most **26 matching Task rows** for a fixed25-row page: every Workspace,
Company, readable-Project, state, responsibility/name and date predicate precedes
offset/limit. Order by stored due date ascending, null last, then full database
creation time and native identifier ascending. Return the first25 and set
`hasNextPage` only from the matching26th row. Do not count/fetch all matching
Tasks, page then redact/filter, or change order according to priority/name. Project
visibility may still materialize readable references; this bounds Task selection
and response, not globally constant work or memory for every Company size.
Each page is a fresh snapshot. Unchanged sets must traverse completely without
duplicates/omissions; intervening writes may shift offsets across requests.

The successful response has `companyId`, requested numeric `offset`, `pageSize:25`,
`hasNextPage`, `appliedFilters` and `tasks`. The complete filter echo always
contains `state`, `responsibility`, `assigneeName`, `dueFrom`, `dueThrough`:
defaults are explicit; unused name and absent date bounds are JSON null. Each
row is the **complete native Task view**, including exact IDs, original Client,
version, title, stored state, priority, recorded assignee/null, due date/null,
creator and timestamps, with the native state-dependent completion, blockage or
cancellation declaration, plus native readable Project labels `{id,title,
clientDisplayName}`. The Task's own `projectId` and `clientAccountId` retain exact
continuation identity; Project/Client labels come from their readers, not guesses.
No new result/evidence, eligibility, email or union field is added.

Validate the entire unknown response once before any row, count-like message or
Open control is exposed. Require expected Company, exact requested offset,
pageSize25, boolean lookahead, at most25 unique Task IDs and exactly25 rows when
lookahead is true. Require the complete normalized echo to equal the applied
request, including nulls/defaults; reject missing or inconsistent fields. Validate
every full native Task/state-dependent declaration and Project context, matching
Company/Project identity, valid native UUID Task/Project/original-Client and
actor/membership identifiers, versions/dates/timestamps/actors/labels, and
satisfaction of all applied state/responsibility/name/date predicates.
Reject a malformed later row rather than showing earlier rows. Check observable
due/null-last and creation order without resorting; rounded public timestamps
cannot prove a full-precision identifier tie, so do not reject valid database
order using a JavaScript timestamp-equality guess. Server REST tests prove the
full creation/id ordering. Deliberate additive HTTP metadata may be ignored;
unknown required native semantics fail closed. A malformed/foreign200 offers
same-attempt Retry and no navigation, never empty success.

### Interaction, native continuation and protected intent

Offer **Team Tasks** through the existing authorized Company Task-read entry in
both frames, retaining visible Company context and accepted Prisme controls.
Initial deliberate entry reads offset0 with open/all/no-date defaults. Keep a
local draft separate from applied criteria and the last requested page. Typing,
changing controls, clearing a draft or changing locale performs no I/O. Validate
drafts with associated errors, including a date control's rejected/bad-input
state; invalid or empty name and reversed dates neither issue a request nor
replace the existing applied page. Selecting all/unassigned hides the name
criterion without submitting it; a retained local name draft is not an applied
filter. Explicit valid **Apply** captures normalized criteria, resets offset0
and issues one new read; applied labels always describe that request, not a
later draft. Applying identical criteria is a deliberate fresh read.

Previous reads `max(0,offset-25)` under applied criteria; Next reads `offset+25`
only from a validated lookahead, with safe arithmetic. Disable Next when addition
would exceed the safe-integer bound. Refresh reads offset0 with the same applied
criteria and leaves the draft intact. Retry repeats the failed applied criteria
and offset exactly. Disable duplicate paging/Apply while a read is pending;
newer deliberate reads retire earlier requests. Withhold old rows while loading
or after failure; never relabel stale rows with new criteria. Distinguish loading,
genuine empty offset0, empty out-of-range later page, denied, network/unavailable
and malformed data. Out-of-range offers explicit Previous/Refresh, without
automatic traversal, clamping or a false total. Errors preserve draft/applied
criteria/page for deliberate recovery within the still-live scope.

Open carries the exact native `{projectId,taskId}` from a validated live row into
the existing Task-in-Project journey; never choose a same-title/first Task or use
row absence as denial. Native detail/history performs fresh owning reads and
remains the only editor/command owner. Its own historical/closed/current authority
determines read-only or editable behavior. No workboard write, optimistic state,
duplicate editor or auto-assignment is introduced. Returning explicitly to Team
Tasks retains its scoped applied criteria, literal local draft and offset, and
reads that page freshly. Changed Tasks move, disappear or appear only according
to the returned current predicates; page shrink yields the explicit out-of-range
state. Preserve the destination's pending exact Task-open intent until its own
fresh reads settle; workboard changes cannot substitute another target.

Production section panels can remain mounted while hidden. Integrate return and
refresh with that actual parent lifecycle; neither hidden-panel remount guesses
nor local fixture state proves a fresh return. Filters, Apply/paging/Refresh,
malformed reads, denied reads and return replace only workboard read state. They
must preserve independent native Task, result and Project drafts and pending,
uncertain or confirmed intent: exact target/path, payload, observed version,
idempotency key and recorded outcome. Never auto-resubmit, rebase, clear or mark
a native command successful because a row disappeared. A confirmed native write
stays confirmed when a subsequent workboard read fails. Losing a permission
consumed only by that command/result retires its own owner according to its
rules; workboard failure alone is no command-authority loss.

### Consumer lifetime, recovery and localization

Workboard rows, draft/applied criteria/page, requests, callbacks, navigation and
return token belong to one lifetime established through the actual App parent:
browser identity and session generation, active Internal User/Workspace/membership,
Company selection generation, and consumed Task/Project/Client authority. Capture
the relevant assignment identities, known versions and effective read permissions,
including the Workspace `client.manage` alternative and Client authority/identity
generation affecting native visibility. Retire permanently on consumed changes,
revocation/suspension, Company change, sign-out, parent removal or unmount.
Navigating within the retained native/workboard journey preserves its live scope;
a genuine retired scope never revives because Company IDs or permission strings
become equal again. A→B→A and revoke/fresh-grant require fresh consumer ownership.
Do not key the workboard indiscriminately on every unconsumed grant: unrelated
Document, result, commercial or configuration changes preserve its criteria,
draft, page and focus and trigger no workboard I/O when consumed authority is
unchanged. Native owners independently decide their own consumed changes.

Abort is advisory. Guard freshness before and after every await, before rendering,
focus/scroll, Open/return, session rejection, Company rejection, Actor acceptance,
Activity refresh or any shared callback. This guard must cover the **complete
Actor snapshot consumed by transitive recovery**, not just the visible Task-read
projection. A403 may start selected-Company `/access/current-actor`, Workspace
fallback and Actor revalidation; all belong to the original identity, session,
base Actor and read scope until that recovery completes. If any input consumed
by that full recovery changes, retire the old recovery before it can affect
shared state, while an independently valid workboard survives unrelated grants.
Held late200/403 or recovery200/403 cannot reject the current session/Company,
accept an obsolete Actor, navigate, refresh shared Activity or render after
retirement, even when transport ignores abort and A is selected again. Never
repair an old consumer by comparing only current equal-looking strings. Test
actual parent and administrative revalidation wiring as well as the child.

Use centralized ro/ru/fr/en interface copy, shared Select/date controls and
existing Task wording. Locale-only changes retain exact draft/applied literals,
page, mounted controls/focus, pending request and native command identity, with
no Task, workboard, eligible-member or Actor I/O. Dates retain canonical stored
values while labels format for locale. Render complete literal titles, names,
Project/Client labels and state declarations as text, never HTML or truncation
that hides facts. Require keyboard Apply/Previous/Next/Refresh/Retry/Open/return,
visible focus and associated errors, complete wrapping and no horizontal page
overflow at1440×900 and390×844. No new presentation system or manual identifier
entry is needed.

### Public proof, compatibility and readiness

1. Real PostgreSQL public REST must create more than25 matching native Tasks
   across several readable Projects, all states, self/other/null and retained
   ineligible assignees, past/current/future/null dates. Include assigned
   nonblocked work outside old subsets. Prove defaults/all/single states,
   responsibility and inclusive date intersections, complete echo, exact25/26
   boundaries and full unchanged-set traversal in native due/null/creation/id
   order. Put nonmatches and unreadable rows before/between matches so filtering
   after paging fails. Prove name comparison/escaping cases above on actual PG.
2. Through that REST seam, reject every strict grammar failure and prove the
   specified error order, live known-version/assignment/context/Task/Project/
   original-Client authority, suspended/revoked/foreign cases, historical labels
   and closed read-only facts. Deterministically hold concurrent native changes
   and authority changes between composition stages and trace the one read-only
   snapshot, including transitive Project/Client participants. Prove no command,
   row or advisory lock acquisition and no event, receipt, Task-version or
   Client-fence write effects. Fresh native edits, assignment changes, reopening
   and closure must affect later matching reads.
3. Actual App/HTTP tests must prove both authorized frames, separate drafts and
   Apply, exact paging/refresh/retry/out-of-range, whole-page/echo validation
   (including a malformed last row), exact native Task and fresh return at the
   retained criteria/page. Connect real pending/uncertain/confirmed native Task,
   result and Project intent to the journey; prove failure/filter changes preserve
   independent drafts and exact retry identity rather than merely seeding state.
4. Actual App parent/admin composition must hold late200/403 across consumed
   Company/identity/session/Task/Project/Client A→B→A and equal-string
   revoke/regrant. Start recovery first, hold its selected/Workspace Actor replies,
   change each consumed base Actor/read-scope input and release them; prove no
   stale render, navigation or shared rejection/Actor/Activity effect. Conversely
   unconsumed grants and each of four locale changes preserve live workboard and
   native state/focus with no extra I/O. Fixture-only child remounts do not prove
   the production retirement contract.
5. A registered **actual App/API/disposable PostgreSQL** journey at1440×900 and
   390×844 must deliberately apply name/state/date criteria over a synthetic
   cross-Project team set with more than25 matches, reach a later page by
   keyboard, open that exact native Task/history, edit/save it under existing
   authority and return to a fresh workboard with retained criteria/draft/page.
   Verify changed membership and independent native outcome, inspect original
   screenshots and assert complete wrapping/no overflow. A fixture, import or
   404-only substitute cannot establish this journey; no owner manual test is
   required.

The existing native `TaskService.discoveryPage` serves unassigned and blocked
reads only; its due/null/creation/id selection is the reuse seam. A third actual
consumer may justify one narrow Task-owned native page participant, with each
read retaining its own strict grammar, predicates and response. Do not introduce
a generic search/workflow engine or silently add filters/echo to old reads.
Preserve My Tasks, attention/upcoming/overdue, §§26/32, native Task DTOs,
fingerprints/receipts, grouped planning and command transaction/locking defaults.
Any read-only Project/Client composition change must be explicit and narrow;
existing command callers retain their original policy and defaults. No schema,
migration, extension, dependency, new captured grant or external service is needed.

Documentation readiness has no missing external input. Real tenant roles, grants,
usage and adoption remain unproved; this bounded read needs none of them to be
specified and synthetically tested. Independent Standards then Spec preparation,
root's actual delegated approval, canonical docs integration evidence and verified
guarded merge must precede a **separate fresh runtime child**, also waiting for
preceding #941 delivery. Do not create that issue/branch or claim runtime within
#944. Root alone owns publication and the final source-derived six-family docs
gate; its ten heavy families are `not_required`, never passed without execution.
An actual unresolved authority question must be reported rather than filled in.

Excluded: all-Companies/global or historical-content search, personnel directory,
new permission or relaxed write/eligibility, staffing/performance/urgency metrics,
inferred priority, automatic assignment/status/notifications, mutations in this
view, new business state/obligation/evidence/applicability/fulfillment/review/
certification/closure/legal/pricing policy, provider/infrastructure, real data or
grants, deployment and whole-MVP approval. [Mission Obligations §12](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
alone retains `MISSION-CLOSE-01` for the existing consolidated email; this
workboard neither depends on nor decides it.

## 34. Bounded ordinary Task description (#949)

### Authority, problem and outcome

**Status:** Approved — bounded contract under
[#949](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/949), within #63, after
ordered independent Standards then Spec preparation and
[root's delegated product approval](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/949#issuecomment-6478182578).
Approval is not runtime delivery; verified contract merge and the runtime
readiness gates below still apply.

The [consolidated decision record §9.4](consolidated-product-decision-record.md#94-tasks)
names description among essential Task fields; DEC-041 supplies Company scope.
Sections 18/20 deliberately bounded earlier manual Tasks without this field.
The current native create/edit grammar rejects `description`; current Task
fields, immutable initial/correction facts and production forms do not record it.
These are the qualification sources, not evidence of a delivered description.

A colleague needs to understand exactly what an ordinary Task asks beyond its
short title, reopen the literal instructions, and identify later corrections.
Extend the native Task's creation, detail, editor and immutable history with one
optional plain multiline `description`. A work journal would record later
observations/actions and is a different outcome; no journal or comments are added.
The measurable result is one create → reload → correct → clear → reopen-history
journey with exact current text and attributable prior values, without another
editor or loss of native intent.

The field bounds, normalization, response/legacy rules and proof below are
bounded reversible Product Owner synthesis under the
[delegated review instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237),
[independent preparation instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283696600)
and [continuation authority](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6465537888).
They are not new Iurie answers, a numbered DEC, Dan's personal review of this
proposal, actual grants or automatic business approval. This section owns only
the additive description contract; [Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy),
[UX §§5–7](ux-localization-configuration-prd.md#5-required-ui-states) and
[Platform §§4–9](platform-security-reliability-operations-prd.md#4-security-boundaries)
retain their cross-cutting authority. ADRs 0002/0003/0006 retain database,
business-decision and tenancy ownership; no new architecture decision is required.

### Actors, stories and scope

1. As an authorized Task manager, I optionally enter detailed instructions while
   creating a Task, so a colleague can understand the work without an external note.
2. As a Task reader, I reopen complete literal multiline instructions with the
   Task's Company, Project, original Client and state visible.
3. As a manager of an open Task, I correct or clear instructions and keep the
   old and new values, declaring actor, server time and Task version in history.
4. As a manager changing another field, I omit description and preserve its value.
5. As a reader of a closed Task/Project or superseded original Client, I retain
   truthful current instructions and history without acquiring mutation authority.
6. As a manager with an uncertain command, I deliberately retry the exact saved intent, without duplicating its correction or losing independent work.
7. As a reader of legacy history or receipts, I distinguish an unrecorded field
   from a recorded absence and from today's current value.
8. As a user in either production frame or any supported locale, I use the same
   native controls by keyboard and keep literal business text and drafts unchanged.
9. As a user whose consumed authority changes, I receive no retired Task data or
   late shared effects, even after a switch away and back to the same Company.
10. As a result/Document reader, I keep those independent confidentiality and
    frozen-content boundaries; instructions prove no produced or approved result.

The only owning record is an existing native Project Task, whether manually
created, copied from an illustrative Template or copied from a Company mission
plan. Workspace, Company, Project and exact original Client remain immutable and
server-established. This does not introduce standalone internal Company Tasks,
template-description configuration, source-plan rewriting or a second Task model.
Copied Tasks start with no description unless a later independently approved
source-copy contract explicitly supplies one; never infer narrative from an
activity title, intended result, frozen PDF or current source configuration.

### Field, normalization and exact requests

`description` is ordinary Company-confidential text, either `null` or a nonempty
normalized string of at most **2000 Unicode code points**. Validate the original
submitted string as Unicode scalar values: reject any unpaired surrogate and
U+0000 anywhere before normalization, including escaped JSON input. Reject
numbers, booleans, objects and arrays. A valid surrogate pair counts as one code
point; combining marks count separately. Do not count UTF-16 units or graphemes.

Trim only exterior ECMAScript WhiteSpace/LineTerminator code points:
U+0009–000D, U+0020, U+00A0, U+1680, U+2000–200A, U+2028, U+2029,
U+202F, U+205F, U+3000 and U+FEFF. Count the remaining code points after that
trim; an empty result becomes `null`. Preserve every interior code point,
indent, repeated space, tab and newline, including CR, LF and CRLF. Do not apply
Unicode composition, case folding, transliteration, newline conversion, Markdown
interpretation or HTML sanitization that changes stored text. The literal text
`<b>Check</b>` remains those characters and renders as text, never markup.

| Request field                                   | Create effect                 | Edit effect                        |
| ----------------------------------------------- | ----------------------------- | ---------------------------------- |
| Property omitted                                | Current description is `null` | Preserve the current value         |
| Explicit `null`                                 | Current description is `null` | Clear to `null`                    |
| Empty/exterior-blank text                       | Normalize to `null`           | Clear to `null`                    |
| Valid nonempty text                             | Store exact normalized text   | Replace with exact normalized text |
| Invalid scalar/NUL/type or over 2000 after trim | Reject                        | Reject the complete edit           |

Extend only `POST /projects/:projectId/tasks` and `PATCH /tasks/:taskId` with
this optional property. Keep their existing allowed fields and `Idempotency-Key`
header. The create body still requires `title` and permits `assigneeMembershipId`,
`dueDate` and `priority`; edit still requires `expectedVersion` and permits those
four ordinary fields. Unknown fields remain rejected; state/complete/reopen/cancel,
grouped planning, result commands and source configuration do not accept
`description`. Scope, actor, timestamps and attribution are never body inputs.

For example, create `{ "title": "Prepare visit", "description": "  Read the dossier.\n  Keep the received original.  " }`
stores `Read the dossier.\n  Keep the received original.`. An edit
`{ "expectedVersion": 1, "description": "Read the dossier.\n  Keep the received original." }`
is a no-op when that is the current text. Omitting the property while editing
`dueDate` preserves it; explicit `null` clears it. Canonically equivalent but
different Unicode sequences and CRLF versus LF remain different submitted
instructions and therefore different material intent after exterior trim.

### Read, write and state matrix

Every row inherits verified active Internal User/session, active Workspace
Membership, server-validated active Company context, live known captured Company
Task Manager v1 `task.read`, Project read and original Client read/active Company
relationship. The existing Workspace `client.manage` alternative remains valid;
membership, creator, responsible identity, Owner/Director title and Client
visibility alone grant nothing. Unknown/null captured versions fail closed.

| Operation/state                                                          | Additional authority or guard                                                                                        | Observable result                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Current Task/list/detail/history read                                    | Existing read prerequisites only                                                                                     | Truthful current text and native immutable history            |
| Read done/cancelled Task, closed Project or superseded original Client   | Same live read prerequisites; original identity retained                                                             | Readable, explicitly read-only, no canonical-union detail     |
| New create                                                               | `task.manage`; open Project; active exact original Client                                                            | Optional description on the new `todo` Task                   |
| New edit/clear/no-op                                                     | `task.manage`; observed Task version; `todo`, `in_progress` or `blocked`; open Project; active exact original Client | Material correction or unchanged receipt                      |
| New edit on done/cancelled Task                                          | No exception                                                                                                         | Conflict; explicit native reopening is separate               |
| New command on completed/cancelled Project or superseded original Client | No exception, including no-op                                                                                        | Existing closed/historical refusal                            |
| Exact committed replay                                                   | Live read/manage and original target visibility                                                                      | Historical recorded outcome before fresh state/version guards |
| Revoked/suspended/foreign/missing scope                                  | No fallback through assignment or another Company                                                                    | Existing denial/not-found without hidden text or receipt      |

Use existing eligibility only if an assignee is actually changed. Editing
description does not reassign an unchanged historical assignee, require the editor
to be that assignee, or relax eligibility for a newly selected assignee. The field
changes no Task/Project state, priority, date, blockage/cancellation declaration,
completion, stage gate, obligation, applicability, fulfillment or approval.

### Command identity, error order and transaction

Retain the existing actor-Membership/Workspace Task-command namespace and its
create/edit/action discriminator. An omitted description contributes **no key**
to normalized command identity: preserve every old fingerprint and property order
exactly, including existing omitted-priority compatibility. For supplied values,
append one normalized `description` property after the existing normalized input
properties; explicit null and normalized blank therefore share one clear intent,
but omission is distinct from explicit null even when both would create an empty
Task. Include target Company/Project/Task, action, expected version and every
other submitted normalized field under the existing command shape. A key reused
for another action, target, Company or normalized payload conflicts without writes.

Preserve native error precedence, without making hidden state an oracle:

1. The existing identity/Actor adapter establishes authentication and selected
   context; missing identity is 401 and invalid/inactive/unavailable authority
   is 403. Native path/body/key structural validation remains in its current
   boundary; malformed known input or an unknown field is 400, never persisted.
2. Inside the native transaction, revalidate live manage/read authority, take
   the existing command-key lock and establish original target visibility before
   disclosing a receipt or key conflict. A foreign/hidden Task remains the native
   404; Project/Client-read denials retain their native refusal. Do not resolve a
   conflicting key to reveal another target's data.
3. A valid matching committed receipt wins before its now-old expected version,
   new assignee eligibility, Task/Project-open or original-Client-active checks.
   Thus later closure, edit or Client supersession does not prevent confirmation
   under live read/manage authority. It does not make the receipt today's state.
4. A fresh command uses Access's revocation/suspension serialization, the Client
   identity-before-relationship mutation barrier, Project-open guard and Task
   row/version check. Wrong version or a closed Task conflicts before computing
   a correction. Changed-assignee validation remains in the existing edit path.
5. Compare normalized description with the locked current value together with
   all other edited fields. A no-op records the native unchanged outcome but
   changes no Task version, timestamps, history or Client operational-use fence.
   It must still pass every fresh authority/state/version guard above.
6. One material edit increments the existing Task version once, including a
   mixed description/title/date/assignee/priority edit, and appends one
   `task.updated`. At version 2147483647, refuse material change with 409 and no
   wraparound; a valid no-op and committed replay remain confirmable.

Task text/version/timestamps, immutable correction history, command outcome and
receipt, original Client operational-use fence and valid response construction
commit as one native transaction. Creation likewise includes `task.created` and
version 1. Reuse the Client fence; no separate description revision, event family,
lock framework or generic command engine is added. Reads, refusals, no-ops and
replays advance no business fence. Persistence/event/receipt/response failure
rolls back the complete unit. Competing ordinary/grouped/result edits, Project
closure, Client union/reversal and actor/changed-assignee revocation retain the
owning lock order and serialized outcome; no write may slip through a lost guard.

### Current, historical and legacy formats

Fresh native Task views contain `description: string | null`, alongside their
existing complete fields, versions, state and attribution. New command outcomes
that contain native Task views also record it, including no-op and grouped
planning outcomes. Existing response envelopes, status codes and other field
semantics are unchanged. New `task.created.metadata.initial` records the key
with its string or `null`, even when no description was supplied. A material edit
adds exactly `metadata.changes.description: { before: string | null, after: string | null }`
when changed; unrelated corrections omit it. Native history retains server actor,
time, target and version ordering and offers no mutation/deletion route.

| Format                                              | Description representation                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Current native Task view                            | Required `description`, normalized string or `null`                                                                          |
| New immutable Task outcome, including a nested Task | Recorded `description`, normalized string or `null`                                                                          |
| Legacy immutable Task outcome                       | Property absent, other validated historical fields preserved                                                                 |
| New creation `metadata.initial`                     | Required `description`, normalized string or `null`                                                                          |
| Legacy creation `metadata.initial`                  | Property absent, including pre-priority initial formats                                                                      |
| Description correction                              | `changes.description` contains exactly present `before` and `after`, each normalized string or `null`, with different values |
| Old or unrelated correction                         | No `changes.description`; never synthesize one                                                                               |

Reject malformed present description values, partial/unknown description-pair
fields and unrecognized changed-field names. Do not trim, repair or default
persisted or received description facts while decoding them. Other existing
historical formats retain their own validators and compatibility; a text-only
change cannot discard them.

Legacy stored receipt JSON, command strings, event meanings and initial history
remain immutable, including a pre-priority record's existing optional priority.
Absence of `description` in a legacy initial snapshot or command outcome means
**not recorded in that historical format**, never proof of an empty value then
and never a request to insert today's text. Preserve the absence when decoding
and returning a legacy committed outcome; do not rewrite its JSON or decorate its
replay with `description: null` or a current value. Existing pre-description
compatibility transformations for other fields remain unchanged. Old nested Task
outcomes in grouped/Project creation receipts have the same preservation rule.

The new current-reader contract requires present `description` and validates
null or exact normalized scalar text; missing/malformed current data is an
explicit unavailable/malformed response, not a silent empty description. A
separate compatible command/history reader accepts only the identified legacy
absence or a valid recorded value, retaining that distinction in its model.
Neither reader may silently discard a recognized description correction. Preserve
unknown-field tolerance of existing HTTP consumers for unrelated additive data;
strict publisher and command validation remain strict. An older client that
omits the edit field preserves current text; deploy the updated history consumers
with the new publisher because old strict changed-field readers cannot display
new corrections safely. Mixed-version operation that hides corrections is not
claimed supported. No generic optional-field bag or unchecked cast qualifies.

Audit every native Task consumer in the runtime slice: Project Task list/detail/
create/edit/history and exact Task-in-Project navigation; My Tasks; attention,
upcoming/due-soon and overdue/Home previews and complete pages; unassigned,
blocked and team workboard readers; Client mission/Task preview; grouped planning;
illustrative and configured-plan copied Task creation, current-work overview and
their preserved command outcomes. A full native Task-view DTO gains the validated
field under the same authority. A separately bounded summary/source/result/
Document DTO gains no text simply because a Task was opened. Queue membership,
ordering, title/name/date predicates, counts and preview presentation stay with
their existing owners: no description search, snippet, automatic export or new
result/Document disclosure. Queues open the exact native detail for instructions.

### Migration, privacy and source boundaries

The runtime needs one reviewed additive Drizzle migration for nullable native
Task text with matching scalar/NUL/length/storage constraints. Existing Task rows
read `null`; do not synthesize instructions or change IDs, state, timestamps,
versions, assignments, Client fences, copied-source mappings, results, events,
receipt JSON or grants. New copies without supplied instructions explicitly
record current `null` and initial `null` under the new format. Prove the upgrade
from the exact immediately preceding schema, including old single/group/nested
receipts; a fresh empty database is insufficient. Old writers that omit the new
column preserve/default its value appropriately. After new content exists,
rollback must retain it through a compatible application/forward repair; no
automatic column drop, history rewrite or destructive down migration is allowed.

Accountability's existing narrow Task recording boundary persists the native
initial/before/after description facts. They are Company-confidential history
under Task/Project/original-Client read, not diagnostic log prose. Keep new text
out of diagnostic logs, traces, exceptions, metrics, Home Activity and generic
Activity payloads/labels/search/export. The existing generic Task event projection
omits description from initial facts and mixed corrections; a description-only
correction remains in native history and is omitted from the generic feed.
Apply that projection before bounded selection so hiding it does not corrupt
existing pagination or reveal hidden counts. Existing safe event facts and
authorization retain their meanings; no permission, generic target/event family
or new Activity visibility is introduced.

Instructions do not replace declared results, required evidence, frozen PDFs,
source-plan intended results, human result review, verified work or governed
Document Versions. A description edit cannot overwrite any of them or grant their
independent read/record/designation authority. Store and display plain text only;
never execute HTML/Markdown, auto-link URLs, fetch content or send it to AI or an
external provider. No new network dependency, integration, retention period,
purge, notification or legal claim is implied. PostgreSQL/NestJS remain the
source of truth; bounded 2000-code-point storage is not a production latency SLA.

### Native interface, lifetime and recovery

Both Prisme and Classic extend the existing native create form and Task detail/
editor with one labelled optional multiline input, bound/help and associated
validation. Show complete literal current text with preserved visible line breaks
and wrapping, or a localized “No description”; native history distinguishes a
recorded empty value from “Description not recorded in this historical version”.
Show full old/new text for corrections and retained actor/time/version. An
untouched editor must not submit a replacement merely because a browser textarea
normalizes line endings; preserve omitted-field intent. Explicit edit and clear
use the one ordinary Task save, with observed version and no optimistic success,
automatic save, second editor, raw identifier entry or separate approval step.

Cover loading, genuine empty, validation, denied/revoked, missing, malformed/
unavailable, no eligible assignee, historical/closed read-only, stale/conflict,
pending, uncertain, confirmed and failed subsequent refresh. A lost/malformed
command reply retains exact target/path, normalized payload, observed version and
idempotency key; disable replacement/submission until explicit identical retry
or governed recovery. A conflict requires explicit fresh reload before a new
intent, never an automatic rebase. Confirmation remains confirmed when the fresh
detail/history/queue read fails. Reload must read today's state separately from
the immutable command result, particularly a legacy result with no field.

Preserve independent native Task, result and Project drafts, pending/uncertain/
confirmed outcomes and exact continuation through filters, section/frame
navigation, reopen and queue return while their consumed scope lives. A read
failure, filtered-out row or changed locale does not retire another owner's
command or rewrite its payload. Apply existing pending/uncertain grouped-planning
exclusion to ordinary Task writes; do not let a description save bypass it.

Permanent retirement follows actual App parent identity/session generation,
Internal User, Workspace/Membership, Company-selection generation and consumed
Task/Project/original-Client authority, assignment identities/known captured
versions and Client authority/identity generation. Sign-out, suspension,
revocation, consumed changes, parent removal or unmount retire that consumer
permanently, including A→B→A and equal-string revoke/regrant. Fresh authority
creates a new owner; abort alone is insufficient. Unconsumed Document/result/
configuration grants preserve independent Task description work; those owners
retire their own consumed state separately.

A canonical Client union or reversal alone leaves immutable native Project,
Task and original-Client targets stable. Revalidate current visibility and
mutability and retain independently authorized native work; dossier-scoped
reads and openings retire their consumed Client-identity generation, as in
[Shared Client §22.2](release-1-shared-client-prd.md#222-stories-membership-and-bounded-discovery).

Guard before and after every await and before render, focus, navigation, session/
Company rejection, Actor acceptance, Activity refresh or any shared callback.
403 recovery through selected-Company current-Actor, Workspace fallback and
revalidation must capture the **full Actor snapshot consumed transitively by
recovery**, in addition to local Task scope. A change consumed only by recovery
invalidates that recovery before shared effects without discarding independently
valid Task work. Held late 200/403 and recovery 200/403 cannot revive old content
or alter the current session/Company/Actor after retirement, even when transport
ignores abort. Prove production parent/admin wiring, not child remount fixtures.

Centralized ro/ru/fr/en copy covers labels, optionality/limit, clear, current-empty,
legacy-unrecorded, history and every failure/recovery state. Locale-only changes
preserve literal text/indentation, dirty state, control nodes/focus and exact
command identity without Task, eligible-member or Actor I/O. Reuse accepted
Prisme controls and native semantic textarea/button behavior: keyboard entry,
Tab/submit/clear/retry/history, visible focus, associated errors and no horizontal
page overflow at 1440×900 and 390×844, including long unbroken and multiline text.

### Public acceptance and readiness

1. Begin the runtime with meaningful failing **actual PostgreSQL public REST**
   proof at native create/edit/detail/history. Record multiline/diacritic/Cyrillic/
   non-BMP text, reload, correct, clear and reload; assert exact normalized current
   and initial/before/after text, attribution/version and unrelated fields. Prove
   omitted edit preservation, null/blank equivalence, no-op timestamps/version/
   history/fence, and material mixed edit exactly once. Include normalized 2000 and
   2001 code points, combining marks, CR/LF/CRLF/interior spaces, exterior trim set,
   NUL, lone high/low surrogates, valid pairs, wrong types and unknown fields.
2. Through that seam, prove exact new/legacy replay, preserved old fingerprints
   and receipt JSON, explicit-null versus omitted identity, changed-key/action/
   target/Company conflict, replay after subsequent edits/closure/Client union,
   native no-op guards, version exhaustion and no partial writes. A historical
   replay must not replace current description or fabricate old initial facts.
3. Prove actual foreign Workspace/Company/Project/Client targets, independent
   context/Task/Project/Client denial, unknown captured versions, creator/assignee/
   Owner without grants, revocation/suspension and historical/closed reads/writes.
   Hold competing native/grouped/result writes and Project lifecycle, Client
   union/reversal, actor/changed-assignee revoke/suspend operations in controlled
   orders on PG. Assert one serialized authorized outcome and inject row/history/
   receipt/response-construction failures to prove full rollback including fence.
4. Upgrade an exact pre-description schema containing open/closed/manual/copied
   Tasks and immutable single/group/nested receipts/history. Compare old rows,
   IDs/versions/timestamps, receipt JSON/fingerprints, events, source mappings,
   results/PDF hashes and grants before/after. Fresh reads are current-null;
   historical absence remains unrecorded. Prove constraints and no implicit grant.
5. Exercise every native consumer listed above through its public boundary.
   Reject malformed current and supplied historical descriptions; render old
   history and replay without invented values; preserve full corrections. Inspect
   generic Activity/Home/count/paging/diagnostics for description exclusion and
   Task/result/Document DTOs for forbidden cross-boundary disclosure. Existing
   title/name/date searches must not match a term found only in description.
6. Actual **App/HTTP/admin** tests create real native independent Task/result/
   Project draft and pending/uncertain/confirmed intents, then navigate/filter,
   fail reads, change all four locales, retry exact commands and confirm fresh
   current/history recovery. Hold late 200/403 and already-started selected/
   Workspace Actor recovery across every consumed retirement and A→B→A; include
   full-Actor recovery-only changes and unrelated-grant continuity. Assert no
   stale render/navigation/focus or shared session/Company/Actor/Activity effect.
7. Register an **actual App/API/disposable PostgreSQL** journey in both production
   frames at 1440×900 and 390×844: create instructions by keyboard, save, reload exact
   Task, edit with attributable old/new multiline history, clear, reload and reopen
   preserved history; include literal markup and a long unbroken value. Exercise
   an exact native queue continuation and independent intent recovery. Inspect
   original screenshots for complete content, localization, focus and no horizontal
   overflow. Intercepted contracts, imports, 404-only cases or manually seeded UI
   state alone do not prove this complete journey. No Dan/Iurie manual test is needed.

Documentation preparation has no missing external input. The choices are explicit
and reversible; actual named users, operational adoption and first-tenant role
configuration remain unproved and unnecessary for this synthetic bounded proof.
Root alone publishes this documentation, performs ordered independent Standards
then Spec preparation, records actual delegated product approval and runs the
canonical source-derived six-family docs gate; its ten heavy families are
`not_required`, never claimed passed. Verified canonical contract merge and
delivery of #946 and native-continuation fix #947 must precede a separate fresh
runtime child/branch with current ownership, doctor, fit and all readiness gates.
Do not infer readiness from this proposal or create implementation work in #949.
An actual unresolved authority must be reported explicitly instead of invented.

Excluded: journal/comments, rich text, HTML/Markdown execution, auto-links/files/
mentions/notifications/AI, Task dependencies/subtasks, new result/Document/evidence/
approval/applicability/fulfillment/certification/closure/legal/pricing meaning,
automatic staffing or assignment, real users/grants/data/providers, external
messaging, infrastructure, deployment and whole-MVP acceptance. [Mission
Obligations §12](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
alone retains `MISSION-CLOSE-01` for the existing consolidated email; this ordinary
text field neither depends on nor decides it.

## 35. Bounded explicit Project next action (#973)

### 35.1 Authority, value and one chosen interface

**Status:** Approved bounded contract under
[#973](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/973), parent #63, after
completed ordered independent Standards then Spec preparation and
[root’s actual delegated product approval](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/973#issuecomment-6484463391).
This section authorizes no runtime or grant.

In [Iurie's S02-Q13 answer](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5307108376),
he explicitly answered **yes** to a visible next required action per Project/audit.
His examples include waiting for Client documents, sending the report to the
certification body, following NC to its deadline and waiting for the certificate.
The same source's stronger “no active Project without a next action” statement is
the interview agent's interpretation, not an approved activation/closure guard.
Story 11 and §11 already name next actions. Mission Obligations §§3–9 are a
non-executable blueprint, not a stage graph or permission to enforce enrollment.

At preparation base `68bbf8fa2609cad8d448363ee12577b745dbbf40`, the native Project
schema, public Project read/create boundary and Project detail have no persisted
next-action record. `ClientMissionTasks`'s “Next Tasks” is pagination. The all-state
next-title ownership check found Opportunity work (#306/#312/#340/#760) and Task
deadlines (#721), rather than another operational Project owner. Opportunity next
action stays commercial and is neither copied nor reused here.

The observable benefit is that a colleague reopening an exact Project can read
the deliberately recorded next action and its attributable replacements without
guessing from Task dates, priority, done state or a copied flat plan. The bounded
success measure is one native Client → Project → set → reload → replace → clear →
reopen-history journey with exact text and no independent draft loss.

| Candidate                        | Fit to actual examples and native code                                                                                                                                                                                                                                  | Disposition                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Short Project-owned literal text | “Waiting for Client documents” and “Send the report to the body” can be recorded even with no Task or protected Document. Existing Project/original-Client reads suffice.                                                                                               | Chosen complete proposal below.                                        |
| Exact existing Task reference    | Requires an eligible existing Task and independent Task read; waiting or sending need not already be a Task. Mutable Task titles/state cannot conserve what the coordinator declared. Adding creation, eligibility or linked-data snapshots would broaden this outcome. | Deferred; no Task picker, identifier, inference or link is introduced. |

This is reversible agent Product Owner synthesis of interface, bounds, storage,
permissions and proof under the [delegated review instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237),
[independent preparation instruction](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283696600)
and [continuation authority](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6465537888).
It is not a new Iurie answer, Dan's personal review, a numbered DEC or actual
assignment. [Authorization §8](tenant-company-client-authorization-prd.md#8-initial-permission-families),
[Activity §7](activity-log-accountability-prd.md#7-authorization-and-privacy),
[UX §§5–7](ux-localization-configuration-prd.md#5-required-ui-states),
[Platform §§4–9](platform-security-reliability-operations-prd.md#4-security-boundaries)
and ADRs 0002/0003/0006 retain their existing cross-cutting ownership.

### 35.2 Actors, scope, stories and permission matrix

Every record, command, receipt and history fact belongs to one immutable exact
Workspace, responsible Company, existing Project and its **original** Client
Account. All are server-resolved from the Project; the body cannot select another
Client/Company or retarget history. Manual, illustrative and Company-plan Projects
use the same native record. No mission adoption, Task, result, Document, Contract
or Opportunity is required or created.

1. As a Project reader, I reopen its literal current next action or an explicit
   missing-recorded-action state, with Company, original Client and lifecycle visible.
2. As an explicitly authorized coordinator, I set the first action, replace or
   correct it, or deliberately clear it on an eligible open Project.
3. As a reader, I reopen immutable before/after text, revision, declaring actor
   and server time, including after clearing or ordinary Project closure.
4. As a coordinator after uncertainty, I confirm the exact saved intent/key;
   after a stale conflict I deliberately reload before making another intent.
5. As a user without coordination authority, I retain independent Project reads
   and Task/result/applicability work without gaining a next-action write.
6. As an administrator, I deliberately grant/revoke only the new captured bundle
   through existing administration, without receiving protected business text.
7. As a user changing locale/frame or navigating sections, I preserve literal
   inputs, focus and independent draft/pending/uncertain/confirmed owners.
8. As a user whose consumed scope is retired, I receive no late content or shared
   effects, including after A→B→A or revoke/regrant with identical permission strings.

Authorization §8 owns new **Company Project Next Action Coordinator v1**, code
`company_project_next_action_coordinator`, containing exactly
`project.next_action.update`. It supplies no read or administration prerequisite.
Existing Project Access v1/v2 and `project.update` responsible-member semantics
remain unchanged; no old capture expands.

All rows require verified active identity/session/Internal User, active Workspace
Membership and server-validated active Company context, live captured
`project.read`, and original Client read (`client.manage` or the current Company
`client.read` boundary) plus that original Client–Company relationship. Recognized
Project Access v1/v2 retain their current read meaning; unknown/null captures deny.

| Operation/state                                                                   | Additional prerequisite                                                                                                               | Result                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Current and native history read                                                   | Existing Project/original-Client reads only                                                                                           | Literal current text and bounded attributable history.                                  |
| Completed/cancelled Project or superseded original Client read                    | Same live reads; preserve original identity                                                                                           | Explicit read-only current/history; no canonical-union or other-Company detail.         |
| Fresh set/replace/correct/clear, including no-op                                  | Live Coordinator v1; observed next-action and lifecycle revisions; `preparatory`, `active` or `on_hold`; active exact original Client | One changed or unchanged recorded outcome.                                              |
| Fresh write on completed/cancelled Project or inactive/superseded original Client | No override, including for no-op                                                                                                      | Native closed/historical conflict.                                                      |
| Identical committed confirmation                                                  | Live same-target reads and Coordinator v1                                                                                             | Conserved outcome before fresh revision/open/Client-active guards.                      |
| Missing/foreign/hidden target or denied/revoked/suspended authority               | No fallback through responsibility, title or another Company                                                                          | Existing safe denial/not-found; no text, receipt, count or target-existence disclosure. |

Creator, responsible member, Workspace Owner/Director title or Company selection
alone grants no capability. Unlinked literal text consumes no Task, copied-plan,
result, Document/content, applicability or Activity read. A writer may mention an
artifact in literal text, but the application never resolves that mention, reveals
linked information or grants its authority. No mandatory two-person approval,
automatic grant, migration backfill grant or real Iurie assignment follows.

### 35.3 Literal value, revision and closed public grammar

The value `text` is `null` or an exact normalized nonempty string of at most
**500 Unicode code points**. Apply §34's scalar/NUL validation and explicitly
enumerated exterior ECMAScript whitespace trim, with this smaller bound. Reject
unpaired surrogates and U+0000 before normalization; reject wrong JSON types.
Empty/exterior-blank text normalizes to `null`. Preserve every interior scalar,
indent, repeated space, tab, CR, LF and CRLF; no Unicode composition, case folding,
translation, markup interpretation or newline conversion. Count scalar code
points after trim, including separate combining marks and one per valid pair.
Render `<b>Send</b>` literally, without HTML/Markdown execution, auto-links or fetches.

Use one separate native seam; do not extend old Project creation/update bodies:

- `GET /projects/:projectId/next-action`, with only optional `beforeRevision`.
- `POST /projects/:projectId/next-action`, with required `Idempotency-Key` and
  exactly `{ expectedRevision, expectedLifecycleRevision, text }`.

Both revisions are finite JSON integers in `0..2147483647`; missing, fractional,
string, boolean, negative or larger values are 400. `text` must be present: null
or normalized blank explicitly clears; omission is 400, never accidental clear.
Unknown fields are 400. UUID selection uses the native UUID validator; key uses
the existing nonblank, exterior-trimmed native idempotency-key contract. No new
global key grammar or changed old command fingerprints are introduced.

For example, revision 0 plus `"  Waiting for Client documents.  "` creates
revision 1 with `Waiting for Client documents.`. Replacing it with `Send the report
to the body.` creates revision 2. Explicit null creates revision 3, preserving
both prior declarations. Another null at revision 3 is unchanged. A canonically
equivalent but differently encoded string, or LF instead of CRLF, is a material
replacement if its normalized scalars differ.

Revision **0** means no material declaration has ever been recorded; its text
and last-change attribution are null. The first non-null set creates revision 1.
Virtual revision 0 is valid only when no head or material history exists; an
inconsistent missing head/history is unavailable, never silently defaulted empty.
Each material set/correction/replacement/clear increments this stream once,
retaining immutable before/after and predecessor `revision - 1`. There is at most
one current head per exact Project. Null after a later clear is recorded absence
at that revision; it does not erase history or become revision 0. A null value
means **no next action recorded**, never “no work required”.

A no-op must pass all fresh write guards and exact observed revisions. It records
one unchanged receipt but changes no head, version, timestamp, history, event or
Client fence. At 2147483647 a material change returns 409 without wrapping;
valid no-op and committed replay remain confirmable. This stream never changes
Project responsibility/lifecycle/stage revisions or old Project timestamps,
Task state/date/priority, result, applicability, source mappings or closure rules.
There is no fulfillment/complete action, automatic succession, Task-completion
inference, activation/completion guard or automatic enrollment/backfill.

### 35.4 Command identity, public order and atomic serialization

The new command namespace is Project-next-action only, unique by Workspace,
actor Workspace Membership and normalized key. Its deterministic fingerprint is
the closed, ordered normalized object
`{ format: "project-next-action-command-v1", companyId, projectId, expectedRevision, expectedLifecycleRevision, text }`.
Workspace/actor are the namespace, not caller inputs. Null and trimmed blank
share intent; old receipts/command strings in every other namespace stay byte-exact.
Changed target, Company, revision, lifecycle observation or normalized text under
the same key conflicts; never reveal the earlier target's receipt to explain it.

1. ActorContextAdapter retains native 401 for missing identity and 403 for invalid
   or inactive selected authority. Native path/body/key/query structural validation
   is 400. Validation never supplies authorization or reveals hidden business facts.
2. Inside the transaction, take the new command-key lock, then Access's live
   read/update and parent-suspension/revocation serialization through its public
   interface. Establish Company-scoped Project visibility and original-Client
   read/relationship before any receipt/key-conflict disclosure. Hidden/missing/
   foreign Project is 404; denied Company/Project/Client authority retains native 403. Do not query Access or Client tables independently from this owner.
3. A valid matching committed receipt returns HTTP 200 before its old revisions,
   current closed state or original Client supersession can reject confirmation.
   A changed fingerprint returns 409 without writes. Both still require current
   same-target read/update authority; a revoked writer cannot retrieve the receipt.
4. Fresh intent uses the existing **Access → original Client identity before
   relationship → Project** mutation barriers. Lock the exact original active
   Client through its public operational-reference seam before the Project row,
   then the next-action head (or serialize its absent-head creation under the
   Project lock). Recheck current Client visibility/active relationship, Project
   open status, exact lifecycle revision and exact next-action revision under
   those locks. A stale observation or closed/historical mutation is 409.
5. Compare normalized text under the locks. Valid no-op returns HTTP 200 unchanged;
   otherwise enforce exhaustion and append exactly one material revision.
6. Build and validate the complete public response **inside** the transaction
   before commit. Persistence, history, receipt, event, fence or response-construction
   failure rolls back every component. An interrupted reply after commit is an
   uncertain command, recoverable only by the same intent/key under live authority.

One transaction conserves scoped current head, immutable predecessor/before/after
history, normalized command/fingerprint, durable exact outcome, minimal internal
Activity event and original Client operational-use fence. A material change
advances that existing fence exactly once; reads, refusals, no-ops and replays do
not. Do not create a generic command/workflow framework or a second Client fence.

Prove both dangerous orders with held real PostgreSQL barriers: competing
same/different-key setters, Project lifecycle/closure, Client union/reversal or
relationship change, and consumed grant revoke/member/Company suspension. If
the competing guard change commits first, the waiting fresh command rechecks and
refuses rather than using its earlier read. If this command commits first, it is
one authorized declaration, after which the guard change governs later writes/
reads; Client use prevents an invalid reversal under its owning fence. Equal
revision setters serialize to one material winner and one stale conflict; same
key/intent serializes to one receipt/revision, while same-key changed intent
conflicts. Project lifecycle changes first invalidate its observed revision;
next-action first does not invent a new completion guard. Ordinary Task/result/
applicability work never mutates the action automatically. All owners retain the
existing common lock order, with no inverse Project-before-Client path.

### 35.5 Current, receipt, history and every consumer boundary

The current native record has exactly the owned format
`{ format: "project-next-action-v1", workspaceId, companyId, projectId, originalClientAccountId, revision, text, lastChange }`.
At revision 0, `text` and `lastChange` are null; otherwise `lastChange` is exactly
`{ internalUserId, workspaceMembershipId, displayName, occurredAt }`, captured from
the acting server-authorized member and server time. `occurredAt` is a valid UTC
ISO-8601 timestamp with millisecond precision (`YYYY-MM-DDTHH:mm:ss.sssZ`), not a
caller-supplied date; internal scope/actor identifiers use the native UUID form.
Display name is an immutable
attribution label, never membership authority or an email-directory lookup.
At positive revisions, text may be null only through an attributable clear.

GET returns HTTP 200 `{ current, history: { entries, hasMore, nextBeforeRevision } }`.
Each history entry has `{ revision, predecessorRevision, before, after, attribution }`,
where before/after are normalized text/null, differ, and attribution has the same
closed shape as lastChange. Revision 1's before is null and predecessor is 0;
later facts conserve their actual immediate predecessor. Return at most **25**
entries, newest revision first, using 26 for continuation. Optional `beforeRevision`
is one canonical ASCII decimal query value matching `[1-9][0-9]*`, at most
2147483647, and selects strictly lower revisions. Signs, leading zeroes, whitespace,
exponents, empty/repeated values and unknown query input are 400. `nextBeforeRevision`
is the oldest returned revision when more exist, otherwise null. It is a position,
not authority. No total, arbitrary limit, search or hidden row count is added.
Read current and the selected page in one read-only repeatable-read snapshot;
later pages are fresh reads, not a claimed frozen multi-request snapshot. An
empty page with positive current revision is not a new unrecorded action.

POST returns HTTP 200
`{ format: "project-next-action-command-v1", outcome: "changed" | "unchanged", record }`,
where record is the complete current format at that command's result revision.
Persist the exact validated response with the command. Identical replay returns
that historical outcome, not today's current record/history; the UI reads GET
separately after confirmation. Later edits, clears or closure cannot decorate or
retarget it. History, receipt, captured attribution and normalized strings are
immutable, with no ordinary update/delete route. Malformed stored facts fail
closed; never trim, repair, drop corrections or replace them with null/current text.

| Consumer                                                                                                       | Exact consequence                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New native Project next-action current/editor/history                                                          | Requires the new current/history format; keeps revision-0 missing, later cleared, malformed/unavailable, denied and unsupported responses distinct.         |
| New command/retry reader                                                                                       | Validates the closed command format and exact attributed record; separates historical confirmation from fresh current read.                                 |
| Existing Project directory, My open Projects and Client-Project cards/overview/navigation                      | Keep old DTOs, search, paging and selectors. Open the exact existing Project detail to read its action; no unconditional prose field/aggregate is appended. |
| Existing Project create/manual/Template/Company-plan receipts and responsibility/lifecycle/history             | Preserve old JSON, identifiers, revisions and historical absence. They never acquire this stream through a shared `select *` or replay decoration.          |
| Native Task/detail/history/queues, result and applicability/readiness/review consumers                         | Preserve independent formats, permission gates and intents; no action field, inferred fulfillment or new dependency.                                        |
| Frozen copied plan/source snapshots, Document Versions, PDF/bundle indexes and Project result/closure evidence | Preserve exact recorded content/hashes/meaning; no current-action lookup or silent extension.                                                               |
| Generic Activity/Home/search/count/export/diagnostics/AI                                                       | No prose, new target identifiers, counts, filters or unconditional stream selector; Activity §7 owns recording and exclusion before bounded selection.      |

The runtime audits the real consumers above, HTTP decoders, command persistence,
App parents and administration. Existing HTTP readers retain their unrelated
additive-field tolerance; publishers and persisted-format readers remain strict.
Legacy Project/Task receipt absence means “not recorded in that format”, never
known null then, never today's action. No old Project API is now required to
produce this new field. An explicit unknown format discriminator is **unsupported**;
missing fields or invalid values in the known format are malformed/unavailable.
An absent old-server seam or ambiguous 404 is unavailable until support is known,
never a successful empty action or proof that the target exists. Keep native
401/403 denial distinct; do not mask refusal/transport failure as unrecorded.

### 35.6 Native integrity, upgrade, privacy and operation

Runtime uses an additive reviewed Drizzle migration against the **genuine
immediately preceding schema**, with no migration number reserved here. The
Project-owned current/immutable history/command storage is separate from old
Project receipt representations. Existing Projects have virtual revision 0/null
until an explicit material declaration; reads perform no initialization writes.
New Project creation likewise creates no next-action declaration or event.

PostgreSQL independently enforces original Workspace/Company/Project/Client
composite references, actor membership/Internal User scope, one head per Project,
unique actor/Workspace command keys, unique positive Project revisions, valid
scalar text bounds/nulls, captured attribution completeness and same-scope
predecessor continuity. Enforce immutable history/receipts and coupled material
head/history/receipt/event conservation, rejecting missing or mismatched coupled
facts and forged cross-scope references through native constraints/transactional
guards. Application validation/locks remain mandatory alongside those constraints.

Upgrade a populated predecessor with open/closed/manual/copied Projects and old
Task/result/closure/union and single/group/nested command facts. Record predecessor
public baseline using its compatible application/SQL fixtures, close it, apply
the actual new migration, and validate with the matching new application. Do not
run an incompatible current ORM against a prior schema or use a fresh empty DB as
upgrade proof. Compare IDs, states, revisions, timestamps, receipt JSON/fingerprints,
source maps, results, exact PDF hashes, events, Client fences and all captures;
repeat upgrade and read/replay with unchanged results. No old fact/grant is
rewritten. After new text exists, recovery retains it through a compatible
application/forward repair; no destructive down migration/history rewrite.

Text is ordinary Company-confidential Project content and is deliberately visible
to its existing Project/original-Client readers. Native history stores the exact
before/after values in this protected owner. The internal Activity event contains
only its resulting revision. Prose/keys/fingerprints/attribution payloads stay out
of diagnostics, traces, exceptions, metrics, generic Activity/Home/export and AI
or provider calls. There is no Document fetch, auto-link, notification, reminder,
external integration, new dependency, retention/purge policy or legal assertion.
Bounded 500-code-point values and 25-entry pages constrain work; they establish
no production latency SLA. Platform recovery and privacy owners remain unchanged.

### 35.7 Native journey, lifetime, localization and recovery

Both Prisme and legacy Classic extend the existing selected Project detail,
reachable from the Client-Project journey, with its next-action current/history
and explicit coordinator editor. Keep the accepted Prisme presentation and
Classic compatibility route; add no public Classic switch or new screen. Use a
labelled short plain textarea, bound/help, Save/Replace and deliberate Clear with
associated validation. Show full wrapped literal text/line breaks, attribution
and revision; revision 0 says no action recorded, later null says cleared with
history available. Native history shows exact before/after and attribution with
explicit older-page continuation. Closed/historical reads retain it read-only.
No raw UUID entry, auto-save, optimistic success, automatic next-step engine,
responsible-member/date picker or new approval step is introduced.

An untouched textarea preserves its original intent even if the browser normalizes
line endings. Only an explicit submitted edit replaces text. Loading, missing,
cleared, unsupported, malformed/unavailable, denied/revoked, validation, pending,
conflict/stale, uncertain, confirmed, closed/historical and subsequent-refresh
failure remain distinct. A lost/malformed POST reply retains exact target/path,
normalized payload, both observed revisions and key. Disable replacement/clear
while pending/uncertain; offer explicit identical retry. Stale conflict needs an
explicit fresh reload/review before new intent; never auto-rebase. Confirmed
outcome remains confirmed if current/history/Activity refresh fails. Keep the
saved command result separate from the fresh current projection.

Native Project, Task, result and applicability owners retain independent drafts,
pending/uncertain/confirmed commands and exact continuation through section/frame
navigation and hide/reopen. An unrelated read failure or filtered-out Project
does not abandon another owner's intent. A next-action save cannot replace a
Task/result/applicability command or bypass their own pending-state exclusions;
they do not acquire an arbitrary mutual-exclusion workflow here.

Permanent retirement follows the **actual App and administration parent** session/
identity generation, Internal User, Workspace/Membership, Company-selection
generation, exact Project/original-Client target and consumed read/write assignment
identities/known captures/authority generation. Sign-out, suspension, revocation,
parent removal/unmount, consumed scope change and A→B→A retire that owner forever;
equal-string revoke/regrant creates a new owner. Coordinator-only loss retires
write draft/intent while a separately valid read owner may keep protected current/
history. Project/Client-read loss retires both. Unconsumed Task/result/Document/
applicability/configuration grants preserve next-action work, and next-action
Coordinator changes preserve those independently valid owners.

Original Project/Client identity remains stable across canonical union/reversal.
Revalidate current visibility/mutability, retaining authorized native work while
dossier-scoped openings retire their consumed Client-identity generation under
[Shared Client §22.2](release-1-shared-client-prd.md#222-stories-membership-and-bounded-discovery).
Fresh authorities create new consumers; abort or a reconstructed equal-string key
cannot revive a retired one. Wire narrow invalidation through the real App and
admin parents instead of only adding a child key that existing parent keys bypass.

Guard before/after **every await** and before render, focus, navigation, session/
Company rejection, Actor acceptance, Activity refresh and any shared callback.
Selected-Company current-Actor recovery, Workspace fallback and revalidation must
capture the **full Actor snapshot consumed transitively by recovery**, as well as
the local record scope. Recovery-only consumed changes invalidate recovery before
shared effects while independently valid local work survives. Held late 200/403,
selected recovery 200/403 and Workspace fallback 200/403 must not restore retired
content or alter the current Actor/session/Company/Activity, even if abort is ignored.
No cache redesign or takeover of other feature owners is authorized.

Centralized **ro/ru/fr/en** copy covers every label, bound, missing/cleared/history,
failure and recovery state. Locale/frame-only changes preserve literal business
text, dirty state, exact normalized command/key, control DOM identity and focus,
without Actor/source/record I/O caused solely by localization/presentation. At
1440×900 and 390×844, prove keyboard entry, Tab/Save/Clear/retry/history, visible
focus, associated errors and full long-unbroken/multiline wrapping with no page
horizontal overflow. Synthetic actual App acceptance needs no manual owner test.

### 35.8 Public proof, fit, exclusions and readiness

1. Start runtime with meaningful failing **actual public REST/PostgreSQL** proof:
   set on an existing Project, reload exact current text/history, replace, clear
   and reload. Record the actual RED, then GREEN; a missing seam prediction,
   import failure or 404 alone is not the business proof. Assert exact attribution,
   revision/predecessor and unchanged old Project/Task/result fields. Test 500/501
   code points, combining marks/non-BMP pairs/diacritics/Cyrillic, full exterior trim,
   interior spaces/CR/LF/CRLF, NUL/lone surrogates, wrong types/unknown fields and
   literal markup. Null/blank no-op conserves timestamps/history/event/fence.
2. Prove HTTP grammar/status/order, first set/replacement/correction/clear,
   25-entry history continuation, invalid/repeated/hidden query scopes, no totals,
   exact immutable receipt replay after later edits/closure/Client supersession,
   same-key changed input/target/Company conflicts and exhaustion. Distinguish
   current null, revision-0 unrecorded, legacy format absence, unsupported and
   malformed/denied outcomes through actual readers.
3. Through public REST, prove independent read/update/admin denial; actual
   foreign Workspace/Company/Project/original-Client scope; unknown/null captures;
   v1/v2 Project read compatibility; creator/responsible/Owner without new right;
   grant/revoke/regrant and membership/Company/session suspension. Synthetic admin
   grants only Coordinator v1; old captured bundles and repeated grants never expand.
4. Hold both competing orders named in §35.4 on real PostgreSQL, including same/
   different keys, head initialization, setters, lifecycle/closure, Client union/
   reversal/relationship and Access revocation. Inject current/history/event/
   receipt/fence/**response-construction** failures and assert full rollback,
   including zero orphan receipts/events and no Client fence advance. Exercise
   native SQL forged-scope/predecessor/missing-coupled/immutability constraints.
5. Prove genuine populated immediate-predecessor upgrade and repeat-upgrade,
   including old single/group/nested receipt JSON, captures, mappings, results/PDF
   hashes and fences. New virtual current is revision 0/null; no historical
   receipt acquires today's text. Restart twice and conserve new history/replay.
6. Audit every §35.5 consumer through its public boundary, including current/
   history/receipt decoders and actual App/admin wiring. Term found only in the
   action matches no existing title/name search. Generic Activity/Home/pagination/
   counts/export/diagnostics acquire no prose, target or count through an
   unconditional selector. Old result/closure/PDF/source snapshots stay exact.
7. Actual **App/HTTP/admin** positive controls create native Project/Task/result/
   applicability independent draft, pending, uncertain and confirmed intents;
   preserve them across authorized navigation/read failure/frame/locale changes,
   and confirm identical next-action retry separately from current/history refresh.
   Hold late 200/403 and already-started selected/Workspace recovery 200/403
   across each true consumed retirement, A→B→A/regrant and full-Actor recovery-only
   changes. Assert no stale render/focus/navigation or shared Actor/session/
   Company/Activity effect; unrelated-grant controls retain valid independent work.
8. Register an **actual App/API/disposable-PostgreSQL** keyboard acceptance in
   Prisme and Classic, at **1440×900 and 390×844**: open from Client, set/reload,
   replace/reload exact attributable history, clear/reload/reopen history and read
   a closed/historical Project. Include four locales, literal markup, multiline/
   long-unbroken text, uncertainty/retry and independent native continuation.
   Inspect original screenshots for full content/focus/no overflow. Intercepted
   fixtures or manually seeded UI alone do not prove this journey. No Clerk,
   external provider, named actual grant or Dan/Iurie manual step is required.

This complete journey is intended for one fresh runtime context. At fresh
readiness, inspect actual current owners, dependencies and test fit. If it does
not fit, re-scope the **whole observable journey** before creating its child;
never drop authority, integrity, lifetime, upgrade or actual acceptance proof.
Section 34 and Mission Obligations §15 remain independent neighboring contracts;
#950/#954's text-representation work is not proof of all Actor lifetimes, and
#972 still requires its complete existing guards. Do not take over those owners.

Documentation preparation has no missing external business input. Root approved
this explicit synthesis after completed ordered independent Standards then Spec
preparation and [actual delegated product disposition](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/973#issuecomment-6484463391);
actual users/grants, adoption and operational tenant configuration remain unproved
and unnecessary for synthetic proof. Root alone retains public actions and the
final current-base documentation gate after the #954 lease. The source-derived six required families and ten
`not_required` heavy families are not runtime evidence. Approved canonical merge
and a separate fresh readiness/ownership/doctor/fit check precede any runtime
child; neither this proposal nor approval alone makes it ready-for-agent.

Excluded: Task references/creation/planning, journal/comments, rich text/mentions/
files/links, stage graphs/dependencies/automatic next steps, due-date or staffing
policy, reminders/escalation, mission enrollment/adoption/completion guards,
fulfillment/NC/certification/auditor policy, Contract/Opportunity changes,
source-plan narrative editing, official numbering, financial/pricing/legal
meaning, real users/grants/model activation, provider/deployment and whole-MVP
acceptance. [Mission Obligations §12](release-1-mission-obligations-prd.md#12-open-business-questions-for-one-consolidated-email)
alone retains `MISSION-CLOSE-01`; this action neither decides it nor repeats a
business question or dossier request.
