# PRD — Release 1 Project and Task

**Status:** Draft — interview evidence received; workflow examples pending
**Version:** 0.2  
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
- critical Activity Log events.

## 5. Out of scope

- universal BPM/workflow builder;
- cross-Company Project ownership;
- complex dependency graph or resource planning;
- time tracking and payroll;
- Google Calendar synchronization;
- assurance-specific audit execution;
- commercial Project creation automation.

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

Record Project creation, responsible-scope changes if ever allowed through governance, lifecycle transitions, significant stage transitions, assignment of sensitive Tasks, required Task completion/reopening and closure/cancellation.

## 11. Testing decisions

- PostgreSQL REST tests for scope, transitions, copied templates and concurrency;
- browser journey from Client to Project, Task and next action;
- state-transition tests at the public module interface;
- negative Company/permission tests;
- historical-template tests.

## 12. Acceptance journey

An authorized Company user opens a shared Client, creates a pre-contract Project from a real category, selects Standard Editions and receives copied Tasks. Assigned users complete required Tasks with evidence. A blocked stage transition explains the missing requirement. A later template change does not alter the active Project. Closure preserves attributable history.

## 13. Business evidence

- first-release Project categories;
- meaning of Stage 1, Stage 2, S1 and S2;
- lifecycle transitions and exceptions;
- required Tasks, actors, dates and completion evidence;
- representative pre-contract and multi-Standard Projects;
- suspension/cancellation behaviour.

Question source: S02.

## 14. Technical dependencies

- Company/RBAC and shared Client capabilities;
- canonical Project/Stage/Task vocabulary;
- state-machine and template-version decisions;
- highest stable Project acceptance seam.

## 15. Readiness

Ticket decomposition is blocked on real Project categories, stage meanings, required Tasks and acceptance examples. It follows Company/RBAC and Shared Client.

## 16. Interview evidence reconciliation (2026-08-16)

**Confirmed evidence**

- A Project may exist before a signed Contract.
- Iurie identified C as certification, S1/S2 as surveillance audits and R as recertification; this does not by itself define the general Project lifecycle/stage model.
- Required Tasks, responsibility, dates, reminders, completion evidence and attributable changes are desired operational capabilities.
- Project Template changes create new versions and do not rewrite existing Projects or copied Tasks.
- Session 104 records Iurie's preference that activation without the configured start evidence require his approval; neither that authority nor the exact category-specific evidence set is normalized as a product rule yet.
- A controlled kickoff is desired, and an initial Project summary should be generated after kickoff; the received evidence does not place kickoff before or after activation.

**Still blocking**

- The first Release 1 Project categories, representative templates and the observable distinction between lifecycle status and current workflow stage are not approved.
- Permitted pre-contract actions, lifecycle exceptions, exact required Tasks and evidence gates remain incomplete.
- Later agent-authored automation proposals do not independently approve every transition or escalation rule.
- Sessions 103–104 do not select the first Release 1 categories, their exact start-evidence sets, or their required Task templates.

Provenance: [issue #81](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81), sessions 3–5, 13–14, 20, [103](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5313726306) and [104](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5313749302); [coverage matrix](iurie-business-answer-coverage.md). No new implementation child is ready solely from this evidence.
