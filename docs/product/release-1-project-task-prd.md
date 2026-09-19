# PRD — Release 1 Project and Task

**Status:** Preparatory registration approved by #238; remaining capability Draft  
**Version:** 0.4  
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

The preparatory registration slice is ready independently. The separate [Document Registry association contract](release-1-document-registry-prd.md#18-approved-working-project-associations-245) permits attaching and removing working references in a preparatory Project without changing its identity or lifecycle. Broader ticket decomposition remains blocked on real Project categories, stage meanings, required Tasks and acceptance examples. The current coverage audit narrows the evidence boundary; those broader workflows remain unapproved. This capability follows Company/RBAC and Shared Client.

## 17. Evidence authority boundary

Issue #81 preserves raw business evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes lifecycle transitions, automation, permissions or start gates by itself. Any implementation issue must cite this PRD after the relevant evidence has been normalized here.
