# PRD — Release 1 Project and Task

**Status:** Preparatory registration, manual preparation Tasks, My Tasks, the Project responsible member and manual Task priority approved by #238, #246, #347, #367 and #375, and the provisional Project lifecycle (§23) delivered by #406 and #407, and the provisional illustrative Template creation journey (§24) approved by #634; remaining capability Draft\
**Version:** 0.9\
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

Automatic priorities (§22 adds a manual priority), descriptions, dependencies, structured blocker details and reason vocabularies remain separate decisions. Dashboard counts and queues are governed by Operational Dashboard PRD §17. Section 23 decides that no Project lifecycle transition changes a Task.

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
