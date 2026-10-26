# PRD — Release 1 Operational Dashboard and Acceptance

**Status:** Operational home approved by #398 (section 17), latest dated Activity preview approved by #720 (section 18), personal upcoming deadlines approved by #721 (section 19), complete My attention drill-down agent-approved under delegated delivery authority (section 20); remaining capability Draft — other role journeys and metrics pending  
**Version:** 0.6  
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

## 13. Business evidence at the current audited boundary

The current audited evidence supports these directions:

- Iurie wants Company-specific and authorized consolidated views;
- the consolidated view should surface active Projects, overdue Tasks, money to collect, upcoming audits/trainings and urgent problems with Company attribution;
- the daily operational view should emphasize actionable work and changes/near-term attention rather than vanity metrics;
- mobile access and quick approvals are desired directions;
- generic dedicated queues for matters requiring Iurie's decision, overdue risks and commercial exceptions are supported.

Section 17 decides the operational home: its first metrics with formulas, time basis, Company scope and drill-downs, the overdue (delayed-work) definition, and the attention rules, bound and ordering.

Still blocking ticket decomposition:

- home actions for roles beyond section 17;
- exact approval queue contents;
- metrics beyond section 17 and the names used in practice;
- urgency thresholds beyond section 17;
- complete reminder catalogue by Project type and any external reminder channels;
- Romanian/Russian/English language matrix and organization-specific terminology;
- representative empty/error states tied to real roles;
- bulk actions, if any, that are genuinely needed in Release 1;
- readiness of all upstream Release 1 capabilities.

The coverage matrix's P0/P1 follow-up protocol applies: do not ask every partial dashboard question mechanically. Only material queue/action/metric gaps required for a concrete Release 1 decision should return to Iurie.

Question sources: S00, S02 and S11. Provenance owner: `docs/product/iurie-business-answer-coverage.md`.

## 14. Technical dependencies

- all other Release 1 capability PRDs and their public query interfaces;
- Company-context mechanism and permission-safe composition boundary;
- agreed telemetry/privacy boundary;
- supported viewport and accessibility baseline;
- deterministic end-to-end acceptance fixture.

## 15. Readiness

Ticket decomposition remains blocked on initial role journeys, approved next-action rules, metric definitions and the readiness of the underlying Release 1 capabilities. The current coverage audit narrows the evidence boundary but does not make this final integrated acceptance slice ready. Section 17 approves the bounded operational home slices. The integrated section 12 acceptance journey remains blocked as stated.

## 16. Evidence authority boundary

Issue #81 preserves raw interview evidence. The coverage matrix owns its semantic coverage classifications and blocker deltas. Neither artifact authorizes metric formulas, ranking, automatic prioritization or dashboard permissions by itself. Future implementation issues must cite this PRD after the relevant product evidence has been normalized here.

## 17. Approved operational home (#398)

Dan approved reusable provisional MVP choices for later business validation on 2026-09-24. This section normalizes the first operational home from these sources:

- the first dashboard of the MASTER v1.1 requirements document (decision record §1): active Clients, active Projects and overdue Tasks;
- Iurie's daily-view answers: S00-Q11, and issue #81 session 28, which asks for an immediate-attention list of 3–10 items and a next-7-days view and delegates the prioritization formula to Dan;
- issue #81 session 13 (normal, important and critical priority);
- DEC-196 and DEC-209.

The definitions, time basis, thresholds, ordering and bounds below are delegated product choices, not newly collected Iurie evidence. Iurie validates them against a demonstration.

### 17.1 Scope and time basis

The operational home belongs to the active Company of one Workspace. It composes the public reads of the Client, Project and Task capabilities and stores nothing. No dashboard permission exists. Each block appears only when the reader holds, in the active Company, the read that owns its records; otherwise it is omitted without a zero, placeholder or explanation. A reader holding none of those reads has no operational home.

**Today** is the calendar date in `Europe/Chisinau` at the server instant sampled once for a read. Every rule and count in that read uses that date, and the read returns it. Due dates remain exact `YYYY-MM-DD` values compared without conversion (Project/Task PRD §18). `Europe/Chisinau` is the provisional Workspace default (decision record §18.4); configurable Workspace or Company time zones are deferred.

**Shared behaviour:**

- Reads record no Activity Log event, command outcome, version or fence change, and send no notification.
- A failed read shows as unavailable with a retry, never as zero.
- Every read revalidates current authority.
- Switching Company replaces every block, and a reply belonging to a previous Company, session or authority is discarded.
- Desktop and narrow widths use the same reads and authorization.

### 17.2 Company summaries

| Summary            | Counts                                                                                                                                                                                                                                             | Shown with                                                                      | Opens                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Active Clients** | Active Client Accounts whose relationship with the active Company is active: exactly the Company Client directory. Superseded Clients, archived relationships and other Companies' relationships are excluded.                                     | The Client directory read (Company `client.read`, or Workspace `client.manage`) | The Client directory                                          |
| **Open Projects**  | Projects of the active Company in the reader's Project list whose lifecycle status is open. Every delivered Project is `preparatory`, which is open. A lifecycle slice that adds statuses classifies each one; completed and cancelled are closed. | Project read (Project/Task PRD §15)                                             | The Project list in its default view, without a Client filter |
| **Overdue Tasks**  | Open Tasks (`todo`, `in_progress`, `blocked`) in Projects of the reader's Project list, whatever their responsible member and including unassigned Tasks, whose due date is before today. Undated Tasks and Tasks due today are not overdue.       | Task read (Project/Task PRD §18)                                                | The Company overdue-Task list                                 |

Each summary is a whole count:

- no currency;
- no confidentiality beyond the owning read;
- freshness equal to the read instant;
- it equals the number of records its drill-down lists for the same reader and state.

A label never broadens its definition. In particular, "Open Projects" is not "active Projects" until a Project lifecycle distinguishes them.

The **Company overdue-Task list** shows the counted Tasks in the My Tasks row shape (Project/Task PRD §19), each with its responsible member or Unassigned and its whole days overdue. It is ordered by due date (oldest first), then creation time, then identifier. It returns fixed pages of at most 25 rows with the whole authorized total, the requested offset and page size; each row opens that exact Task in its Project. The optional nonnegative safe-integer offset is the only query input. The UI moves by 25, offers Previous/Next and explicit refresh from the beginning, and can reach the complete set without a total cap (#745). Each page's count and rows share the current repeatable-read snapshot and one server-sampled operational date; separate page reads may reflect changed Tasks or access. A now-empty later page with a positive total offers an explicit return to the beginning, while a zero total retains the genuine empty state. A failed page clears old rows/counts and Retry preserves its requested offset under current authority.

### 17.3 My attention

My attention lists the reader's own open Tasks (the My Tasks set of Project/Task PRD §19) that match at least one rule:

| Rule     | Condition                                        |
| -------- | ------------------------------------------------ |
| Overdue  | due date before today                            |
| Critical | priority `critical` (manual Task priority, #375) |
| Blocked  | state `blocked`                                  |
| Due soon | due date from today to today + 7 days, inclusive |

**Labels.** A row names every rule it matches, with day-precise wording such as "Overdue by 3 days", "Due today" or "Due in 2 days".

**Ordering.** The first matching rule, in table order, places a row. Within one rule, rows follow:

1. due date ascending, with undated Tasks last;
2. then priority: critical, important, normal;
3. then creation time;
4. then identifier.

**Bound and links.** The block shows at most 10 rows and states how many Tasks match. It links to My Tasks, and each row opens its Task in its Project (#377).

My Tasks keeps its own order and presentation. This deterministic ordering is the formula that session 28 delegates; it is not the AI-generated prioritization excluded by section 5. This issue delivers this block.

### 17.4 Excluded

- elapsed-time "What changed since yesterday" filters (session 28); the bounded latest-dated Activity preview is separately approved in section 18;
- money, invoices, payments, audits, trainings, nonconformities, certificates and general approval queues; the separately approved [pending-estimate discovery](release-3-confirmed-cost-profitability-estimate-prd.md#13-approved-company-queue-awaiting-director-decision-889) reuses existing Director decisions and does not expand these summaries;
- Workspace-wide or "All Companies" views, which will reuse these definitions;
- commercial dashboards and Opportunity next actions;
- configurable widgets, personalization, saved views, thresholds and time zones;
- reminders, escalation and notification channels;
- telemetry, exports and AI recommendations.

## 18. Approved latest dated Activity preview (#720)

Dan approved this addition on 2026-10-19 as the first of two small Home extensions. Five is a reversible display default selected under delegated product/technical authority, not newly collected Iurie evidence. This section approves only the bounded behavior below; the remaining Draft tracker, role journeys and metrics are unchanged.

### 18.1 Reader and context

Inside the existing operational Home availability gate (a selected Company and at least one current Client, Project or Task summary read), show **Recent changes** from the same currently guarded Activity page used by full Activity. An Activity-readable actor without any summary read retains full Activity but receives no new Home access.

The context is the reader's current authorized Activity context. It may include already-authorized Workspace events as well as active-Company projections. Do not label all events Company-owned, introduce a Company-only or event-family filter, infer authority from an event, or add a separate permission, read, cache or stored dashboard model.

### 18.2 Meaning and bound

Preserve the server's newest-first order and take the first five records whose public projection contains `occurredAt`. The current source provides a globally ordered dated prefix of up to 100 records, followed by undated redacted projections; its first five dated records therefore supply this complete preview. Show fewer when fewer dated records exist, without a total count.

“Recent” means latest publicly dated events, not an elapsed-time promise. No browser-clock cutoff, rolling 24-hour window or “since yesterday” calculation applies. A quiet context may display old events with their truthful localized dates.

A redacted union projection has no public time. Exclude it solely because that public field is absent; never inspect or infer hidden time, assign a date or apply a temporal filter to it. Do not announce the existence or number of omitted projections. Full Activity retains them unchanged.

### 18.3 Narration and navigation

Reuse Activity's canonical action descriptions, actor and target displays, literal business labels/identifiers and locale-aware date formatter. Reuse its existing open intent only while App currently offers Request navigation, the event belongs to the selected Company and its existing projection supplies the required target. Request/Opportunity actions open the existing Request; Offer and Contract actions open the exact existing version. This preview grants no new target or restricted-detail navigation. Other targets remain nonclickable. An explicit **Open full Activity Log** action is always the existing full-history destination.

The two presentations may coexist while section panels remain mounted. Their target description IDs must be distinct so each action remains associated with exactly its own description.

### 18.4 State, refresh and retirement

Loading, unavailable/error with explicit retry, and no dated events are distinct. A genuinely empty page and an undated-only page have the same no-dated wording. A failed, malformed or denied read never leaves an old successful preview or renders a false zero.

Explicit refresh/retry calls the existing Activity refresh owner. Add no automatic polling or additional initial or locale-only HTTP read. Existing Company, session, identity, Membership, assignment, permission and captured-version retirement removes stale rows and target actions; delayed replies from retired contexts cannot restore them. The summary read remains independent, and full Activity retains its existing behavior.

Own new feature strings centrally in Romanian, Russian, French and English, with Romanian default/fallback and required-key coverage. Switching locale preserves the currently mounted rows, focus, business values and current state without navigation, action or refresh. Late feedback follows the current locale.

### 18.5 Acceptance and exclusions

The public App seam with real locale/provider composition and HTTP-boundary doubles proves the exact five-record order, fewer/old events, empty versus undated-only, loading/error/retry and malformed refusal, current Home availability, existing target actions, stale Company/authority/session replies and locale-only zero I/O. The registered real-PostgreSQL operational-foundation browser journey proves the preview against its actual authorized returned page and full Activity navigation after genuine business mutations, at desktop 1440px and narrow 390px. Keyboard operation, no horizontal overflow and inspected original screenshots are required. Existing history, isolation, assertion and case budgets remain intact.

No Activity recording/projection/parser, API/schema/authorization, event-family, export, count, elapsed-time query, notification, polling, new Home access or next-seven-days implementation is added. The separate next-seven-days view is outside #720; its later approved scope is section 19.

## 19. Approved personal upcoming deadlines (#721)

Dan approved this bounded Home addition on 2026-10-19, after the latest dated
Activity preview. It lifts only the former exclusion of a separate next-seven-days
view; wider Draft dashboard scope remains unapproved.

The view is the exact **My Tasks** set (Project/Task PRD §§18–20), intersected with
§17.3's **Due soon** rule: the reader's own open, readable Tasks in the active
Company, due from server today through today + 7 inclusive. It spans eight calendar
dates. The one server instant and `Europe/Chisinau` owner remain §17.1; browser
midnight and elapsed-hour windows do not apply. Project closure does not additionally
filter this set. Original superseded Client labels and their current relationship
visibility remain governed by My Tasks.

`GET /api/due-soon-tasks` returns Company, exact today/through-date, full total,
offset, fixed page size 25 and Task rows. The only query input is one nonnegative
safe-integer offset; repeated, array, fractional, negative, unsafe and unsupported
parameters are rejected. Current authority, count and rows share one repeatable-read
snapshot. Pages use My Tasks order: due date, creation time, identifier. There is no
silent total cap. Each request reflects current state; pagination does not claim a
frozen snapshot across requests. Refresh restarts at zero; an out-of-range page
offers back/refresh. A changed server date retires the old range and restarts zero.

A Home-local accessible panel shows Company, range, total, Task title, state,
manual priority, date and existing Project/Client labels. Previous, Next, Refresh,
Close and exact Task opening use the existing Project navigation, without record
identifiers in URL/history. Closing restores the opening action's focus. Loading,
empty, out-of-range, forbidden and unavailable/retry remain distinct. Malformed or
foreign responses expose no rows/counts; newer requests, close and App's existing
Company/identity/session/membership/authority key retire older replies. Four-locale
changes preserve the current page, business content, focus and request lifecycle.

These reads create no event, command outcome, Task history/version, Client fence
change, notification or background transition. My Tasks, My attention and Company
overdue Tasks remain unchanged. Team/all-Companies views, configurable windows or
time zones, calendars, reminders, exports and new permissions remain excluded.

Public PostgreSQL REST and real App HTTP-boundary tests own set, date, authority,
pagination, response refusal and stale-reply proof. Desktop 1440px/narrow 390px
browser journeys cover the four locales and both frames; the registered disposable
PostgreSQL acceptance journey proves exact Task opening and completion/reload.

## 20. Approved complete My attention drill-down — 2026-10-21

This bounded read-only extension is approved by the coordinator under Dan's
standing request to implement the safely derivable remaining Sarcina journeys
and his delegated agent product-review authority. It supplies the complete set
behind §17.3's preview; it is not new Iurie evidence or an urgency-policy change.
The rest of this capability's Draft boundary remains unchanged.

### 20.1 Set, explanation and authority

The set, all matching-rule labels and complete deterministic ordering are
exactly §17.3. Use the reader's own open, currently readable Tasks under the
Project/Task PRD §19 boundary; assignment alone grants no access. Preserve
critical or blocked Tasks with no date or with dates beyond the due-soon range,
and the existing Project/Client visibility rules. Do not additionally filter
closed Projects. A row shows every rule it matches, not only its first ordering rule. Ordinary My Tasks and the ten-row Home preview stay unchanged.

A clearly named action opens all matching Tasks from Home. Preserve a separately
labelled route to ordinary My Tasks; do not label that unfiltered destination
as the complete attention set. No additional permission, Company scope, Task
mutation, metric definition, ranking, notification or automatic action exists.

### 20.2 Complete bounded read

The Task owner supplies a separate complete attention read; the existing
operational Home no-query contract and one-snapshot preview remain unchanged.
`GET /api/attention-tasks` returns active Company, server today, complete total,
offset, fixed page size 25 and Task rows with every matching rule code and exact
nullable due-in-days value; the interface owns localized day wording.
Accept only one nonnegative safe-integer offset, default zero; reject repeated,
array, fractional, negative, unsafe and unsupported parameters. Authorization,
count and rows share one repeatable-read snapshot. Apply the authorized matching
set and ordering before pagination; impose no silent whole-set cap.

Today uses §17.1's single server instant in Europe/Chisinau. Each page reflects
current state; there is no frozen snapshot across requests. Refresh restarts at
zero. A changed server date retires the previous page and restarts at zero;
out-of-range pages offer previous/refresh without hiding the complete total.
Queries write no Activity event, history, command receipt or Client fence change.

### 20.3 Public interaction and lifecycle

A Home-local accessible panel presents Company, today, total, the Task/Project/
Client labels and every matched rule using existing styled controls. Previous,
Next, Refresh, Close and exact Task opening use existing Project navigation
without identifiers in URL/history. Closing restores the opening action's focus.
Loading, true empty, out-of-range, denied and unavailable/retry states differ.
Malformed or foreign responses reveal no rows/counts. Closing, newer reads and
the existing Company/identity/session/Membership/authority retirement discard
older replies, including transports that ignore abort. Recheck current authority
on every page and on exact Task navigation. No background polling is introduced.

Romanian, Russian, French and English use the existing shared copy and violet/
yellow visual system. Locale-only changes preserve page, literal business text,
focus and pending requests without new I/O or navigation. Keyboard controls, readable
labels and no horizontal overflow are required at desktop 1440px and narrow390px.

### 20.4 Acceptance and delivery boundary

Public PostgreSQL REST and real App HTTP-boundary tests prove more than25 matching
Tasks, multiple rules, all ordering ties, undated critical/blocked Tasks, every
page, date change, completion/reassignment, authority loss, foreign/malformed
responses and stale replies. Count and full pages agree for unchanged state.
Prove exact Task opening plus completion/reload through the registered disposable
PostgreSQL acceptance journey at both widths, with all four locales and inspected
original screenshots. Preserve existing assertions and scenario/expect budgets.

No schema, new grant, team/all-Companies view, configurable window/ranking,
calendar, export, reminder or external provider is included. The canonical
normalization may travel in its one implementation issue after ordered agent
Standards/Spec approval; local work may start before publication under Dan's
standing delivery authorization. The applicable verification/review and
exact-source/base/tree merge gates remain in force. Approval proves neither
implementation nor MVP/Sarcina delivery.

## 21. Pending profitability estimate discovery

The [Profitability Estimate PRD§13](release-3-confirmed-cost-profitability-estimate-prd.md#13-approved-company-queue-awaiting-director-decision-889) solely owns the approved bounded Company queue, its independent Director/intake gates, complete chronological pagination and exact-Version continuation into existing decisions. Home composes that region without changing §17 summaries, attention ranking, Task lifetimes or the remaining Draft dashboard scope. Its child issue owns runtime delivery; this link is no runtime claim.
