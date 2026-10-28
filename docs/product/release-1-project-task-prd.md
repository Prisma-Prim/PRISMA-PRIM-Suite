# PRD — Release 1 Project and Task

**Status:** Preparatory registration, manual preparation Tasks, My Tasks, the Project responsible member and manual Task priority approved by #238, #246, #347, #367 and #375, and the provisional Project lifecycle (§23) delivered by #406 and #407, and the provisional illustrative Template creation journey (§24) approved by #634, and the bounded My open Projects read (§25) approved through delegated agent review, and Company unassigned preparation Task discovery (§26) approved under delegated 2026-10-21 synthesis, exact mission Task results (§27) approved by #832, the bounded thirteen-activity pilot plan (§28) approved by #836 and grouped Task planning (§31) approved by #927 and Company blocked-Task supervision (§32) approved by #931; remaining capability Draft\
**Version:** 0.13\
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
