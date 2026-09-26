# PRD — Release 1 Project and Task

**Status:** Preparatory registration, manual preparation Tasks, My Tasks, the Project responsible member and manual Task priority approved by #238, #246, #347, #367 and #375; remaining capability Draft  
**Version:** 0.7  
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

Project lifecycle initially distinguishes planned/preparatory, active, suspended, completed, cancelled and archived meanings. Exact labels and permitted transitions are finalized from business evidence.

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

Still blocking broader workflow/Task ticket decomposition:

- bounded first-release Project categories and one representative anonymized case per category;
- representative Project Templates and exact required Tasks;
- observable distinction between lifecycle status and category-specific workflow stage;
- exact meaning/use of Stage 1, Stage 2, S1 and S2 in each relevant workflow;
- actors, dates, dependencies and required completion evidence;
- lifecycle exceptions, suspension/cancellation behaviour and unfinished-Task treatment;
- exact start-dossier evidence sets and permitted exceptions;
- pre-Contract arbitration consistent with DEC-026;
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

- The user supplies a trimmed title (1–200 characters) and an existing active Client related to the selected active Company. Workspace, Company, identifier, creator and timestamp are server-established. Status is always `preparatory`; creator is attribution, not operational responsibility.
- Explicit Company Project Access v1 grants `project.read` and `project.create` through the existing Company-assignment administrator. Grants capture v1 and attributable grant/revoke history. Existing users and assignments receive no automatic grant, including Workspace Owner, Company Context Access and Company Director Client Access.
- Project access additionally requires current Client read authority (`client.manage` for the delivered minimal owner flow or Company `client.read`) and the selected Client–Company relationship. Project authority never follows from Client visibility alone. Read/list/create revalidate active access; immutable Company/Client links cannot be edited.
- An authenticated REST create/list/detail seam and production page let the user create, reload and reopen a Project with its Company, Client and preparation warning. No Task, template, category, Standard, owner, deadline, activation, Contract or external integration is created.
- Exactly one `project.created` event targets each successful Project. Server actor/time and Company scope are appended atomically with the Project, with empty metadata. Event visibility requires Project read and the same Client relationship/read boundary; Workspace ownership alone does not expose it.
- A stable idempotency key is scoped to actor and Workspace. An identical normalized retry revalidates authority and returns the original Project; a different input or Company conflicts. No duplicate Project or history is created.
- Original Company and Client references survive union/reversal. Reads retain the original Client identity (including a superseded identity) and its original Company relationship, without revealing canonical union detail or other-Company activity. New registration uses an active Client, locks its identity before relationship checks and increments its version in the same transaction, so new post-union activity invalidates the existing reversal fence.
- Real PostgreSQL REST tests own isolation, idempotency, atomic history and union/reversal races. Component and desktop/narrow browser journeys own create/reload/reopen, empty and denied states. No new test harness is required.

## 16. Remaining readiness

The preparatory registration slice and manual preparation Tasks in section 18 are independently bounded approvals. The separate [Document Registry association contract](release-1-document-registry-prd.md#18-approved-working-project-associations-245) permits attaching and removing working references in a preparatory Project without changing its identity or lifecycle. Broader ticket decomposition remains blocked on real Project categories, stage meanings, required Tasks and acceptance examples. The current coverage audit narrows the evidence boundary; those broader workflows remain unapproved. This capability follows Company/RBAC and Shared Client.

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

The Project remains `preparatory`. Neither a Task assignment nor completion grants
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

Automatic priorities (§22 adds a manual priority), descriptions, dependencies, structured blocker details, reason vocabularies, dashboard counts and queues (Operational Dashboard PRD §17), and Project lifecycle effects remain separate decisions.

## 21. Approved Project responsible member (#367)

Iurie confirmed that each simultaneous Project needs its own responsible person, status, deadlines and Documents (S02-Q07). Later answers route Project work to the Project's responsible person, whom the business must be able to change. Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section is the bounded delegated synthesis. It is not a complete role matrix.

A preparatory Project has zero or one responsible Workspace Membership, initially none. A manager holding `project.update` sets, replaces or clears it. Only an eligible member may be newly set: an active Internal User with an active same-Workspace membership and effective Company context, Project read and Client read for the Project's original Client–Company relationship. Access owns that evaluation and a narrow Project-scoped query that reveals only membership identifiers and display labels. Being responsible grants no access, approves nothing, assigns no Task and triggers no reminder. Later loss of eligibility preserves the assignment and its label without retaining access, and a manager may replace or clear it.

Every Project reader sees the responsible member, or none, with the attribution of the last change. The responsibility has its own revision starting at zero. A command carries the observed revision and a stable actor/Workspace idempotency key. Stale revisions conflict, and concurrent commands allow one material outcome. A normalized no-op records an unchanged receipt without revision, event or fence advance. Exact replays recheck live authority and visibility before returning the recorded outcome; changed key reuse conflicts. A material change atomically updates the responsibility and its revision, its receipt, one `project.responsible.changed` event and the original active Client's operational-use fence. A superseded original Client keeps the responsibility readable and refuses changes without exposing union detail.

The Project remains `preparatory`. These remain separate decisions:

- title correction;
- lifecycle, activation and start dossier;
- categories;
- Contract and commercial links;
- multiple or role-specific responsibles;
- substitution;
- responsibility-based notifications.

## 22. Approved manual Task priority (#375)

Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section normalizes the Task priority that Iurie confirmed in Session 13 (_normal / important / critic_) and that the consolidated decision record §9.4 lists as an essential field. The three levels are sourced; their manual handling below is a delegated product choice, not newly collected Iurie evidence.

Every Task has exactly one priority: `normal`, `important` or `critical`. A manager with `task.manage` and the §18 prerequisites chooses it at creation or changes it through the §18 edit while the Task is editable under its owning execution rule (§18, refined independently by §20); a Task created without a choice, and every Task that existed before this section, is `normal`. A closed Task keeps its priority read-only. A priority change is a corrected field of `task.updated`, under the §18 rules for version, idempotency, replay, historical Clients, the reversal fence and normalized no-ops.

Priority is a manual declaration. It grants no access, satisfies no gate, changes no Task or Project state, and triggers no reminder, escalation, notification or automatic assignment. It does not reorder the Project Task list or My Tasks and adds no filter, count, badge, queue or urgency rule.

Automatic priority rules, priority-based ordering or filtering, and escalation or notification of important or critical Tasks remain separate decisions.
