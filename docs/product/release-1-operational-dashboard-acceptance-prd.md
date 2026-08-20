# PRD — Release 1 Operational Dashboard and Acceptance

**Status:** Draft — audited interview evidence received; role and metric definitions pending  
**Version:** 0.3  
**Owner:** Dan Popescu  
**Parent authorities:** Product Vision; UX PRD; Tenant/Company/Authorization PRD; Activity Log PRD

## 1. Problem statement

Release 1 is not useful merely because its records exist. A user must be able to enter the application, understand the active Company context, find a Client, see work that needs attention and complete one coherent operating journey. A generic dashboard with invented metrics would hide unresolved workflow rather than validate it.

## 2. Release 1 outcome

Each initial role receives a permission-safe operational entry point with a small set of evidence-backed next actions and summaries. The Client overview connects Company/RBAC, shared Client, Project/Task and Document Registry capabilities into one testable Release 1 acceptance journey on desktop and mobile.

## 3. User stories

1. As a user, I want to know which Workspace and Company context I am operating in.
2. As a user, I want an entry point matched to my permissions rather than a misleading universal dashboard.
3. As a user, I want a short queue of actions that genuinely require my attention.
4. As a user, I want each action to explain its subject, urgency and destination.
5. As a manager, I want a bounded summary whose metric definitions are explicit.
6. As a user, I want to open a Client and see its visible Projects, Tasks and governed Documents.
7. As a user, I want to drill from a count or action to the underlying records.
8. As a user, I want empty states to explain what I can do next.
9. As a user, I want stale, partial or failed data called out instead of displayed as trustworthy.
10. As a user without access, I want restricted records omitted without leaking their existence through counts.
11. As a mobile user, I want the primary acceptance journey usable without desktop-only interaction.
12. As an acceptance reviewer, I want Release 1 demonstrated through observable business behaviour rather than isolated screens.

## 4. In scope

- authenticated Workspace and active Company context;
- role/permission-based home entry point;
- evidence-backed next-action queue;
- small, defined operational summaries where business meaning is approved;
- Client list, search entry and Client overview navigation;
- links to visible Projects, Tasks and Documents;
- permission-safe empty, loading, partial and error states;
- desktop and mobile Release 1 acceptance journey;
- event instrumentation needed to verify journey completion and failures.

## 5. Out of scope

- broad business-intelligence dashboard;
- custom widgets or report builder;
- cross-Workspace aggregation;
- forecasting, recommendations or AI-generated prioritization;
- assurance conclusions or commercial metrics not delivered in Release 1;
- arbitrary saved searches;
- notification delivery channels;
- invented vanity metrics without a named decision or action.

## 6. Operational definitions

A **next action** is an authorized, explainable action derived from an owned Release 1 record and an approved rule. It is not an opaque ranking. A **summary** has a stable definition, Company scope, time basis and drill-down set. A **Client overview** is a contextual composition of capabilities; it does not create a second source of truth for their state.

The dashboard consumes public capability interfaces. Project lifecycle, Task completion, Document status and Client identity remain owned by their respective modules and PRDs.

## 7. Invariants

1. Every count, action and linked record is filtered by Workspace, Company and user permission.
2. Restricted record existence is not leaked through aggregate counts or empty-state wording.
3. Every next action links to an independently verifiable underlying record and rule.
4. Metric labels never imply a meaning broader than their documented definition.
5. Partial or stale data is distinguishable from a true zero.
6. The dashboard does not mutate capability state through a separate business path.
7. Desktop and mobile use the same authorization decisions.

## 8. Permissions

Dashboard visibility is derived from underlying capability permissions plus any approved managerial aggregate permission. The product must not use one global `can_view_dashboard` grant to bypass record-level rules. Switching Company context changes all actions, counts and Client visibility atomically from the user's perspective.

## 9. UX and failure states

- first login with no assigned Company or role;
- valid role with no next actions;
- Company with no Clients or Projects;
- partial capability failure;
- slow or stale summary response;
- action resolved in another session;
- permission revoked between summary and drill-down;
- long names, Romanian text and narrow mobile viewport;
- keyboard and screen-reader navigation;
- safe Company-context switch with unsaved-work warning where relevant.

## 10. Activity and observability

Do not create compliance Activity Log events merely for viewing the dashboard. Record business mutations in the owning capability. Operational telemetry should capture home-load success/failure, next-action drill-down, permission-safe error class and completion of the Release 1 acceptance journey without placing sensitive business content in logs.

## 11. Testing decisions

- browser acceptance tests at desktop and mobile viewports;
- PostgreSQL REST tests for permission-safe query composition and Company switching;
- contract tests between the dashboard composition layer and public capability interfaces;
- negative tests for count and action leakage;
- accessibility checks for the primary journey;
- deterministic fixtures representing each initial role and important empty/error state.

## 12. Acceptance journey

An administrator creates the initial Company and role membership. An authorized user registers a shared Client, creates a pre-contract Project from an approved category, receives copied Tasks, completes a required Task with evidence, registers a governed Document and promotes its first Version as official. A manager enters through the operational home, sees an evidence-backed next action, drills into the Client overview and verifies the Project, Task and Document history. A restricted user sees neither the confidential Representation nor a leaking count. The journey remains usable at the supported mobile viewport and every mutation is attributable in the owning capability.

## 13. Business evidence after PR #111

The final audited evidence supports these directions:

- Iurie wants Company-specific and authorized consolidated views;
- the consolidated view should surface active Projects, overdue Tasks, money to collect, upcoming audits/trainings and urgent problems with Company attribution;
- the daily operational view should emphasize actionable work and changes/near-term attention rather than vanity metrics;
- mobile access and quick approvals are desired directions;
- generic dedicated queues for matters requiring Iurie's decision, overdue risks and commercial exceptions are supported.

Still blocking ticket decomposition:

- first useful home actions for every initial role;
- exact approval queue contents and delayed-work queue contents;
- metric names actually used in practice, formulas, time basis, Company scope and drill-down definitions;
- urgency thresholds and ordering rules;
- complete reminder catalogue by Project type and any external reminder channels;
- Romanian/Russian/English language matrix and organization-specific terminology;
- representative empty/error states tied to real roles;
- bulk actions, if any, that are genuinely needed in Release 1;
- readiness of all upstream Release 1 capabilities.

The coverage matrix's P0/P1 follow-up protocol applies: do not ask every partial dashboard question mechanically. Only material queue/action/metric gaps required for a concrete Release 1 decision should return to Iurie after any recovered 526–765 evidence is reconciled.

Question sources: S00, S02 and S11. Provenance owner: `docs/product/iurie-business-answer-coverage.md`.

## 14. Technical dependencies

- all other Release 1 capability PRDs and their public query interfaces;
- Company-context mechanism and permission-safe composition boundary;
- agreed telemetry/privacy boundary;
- supported viewport and accessibility baseline;
- deterministic end-to-end acceptance fixture.

## 15. Readiness

Ticket decomposition remains blocked on initial role journeys, approved next-action rules, metric definitions and the readiness of the underlying Release 1 capabilities. PR #111 narrows the evidence boundary but does not make this final integrated acceptance slice ready.

## 16. Evidence authority boundary

Issue #81 and the coverage matrix preserve evidence and semantic coverage only. They do not authorize metric formulas, ranking, automatic prioritization or dashboard permissions by themselves. Future implementation issues must cite this PRD after the relevant product evidence has been normalized here.
