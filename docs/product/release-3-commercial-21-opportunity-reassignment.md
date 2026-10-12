# PRD — Release 3 Commercial Workflow, section 21: Approved provisional Opportunity reassignment (#399)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 21. Approved provisional Opportunity reassignment (#399)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides how an Opportunity's responsible actor changes inside its responsible Company; transfer between Companies stays excluded (S04-Q06 is not mapped).

### 21.1 Outcome and permission

A holder of captured **Company Opportunity Manager v1** ([authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families)) working in the server-validated active Company replaces the responsible actor of a Company-owned Opportunity with an eligible member of the same Company. Detail and list show the new responsible actor after reload and restart. `commercial.opportunity.assign` is effective only while the same actor also holds live captured Commercial Intake read (`commercial.request.read`, `commercial.opportunity.read`) and Company context in that Company; partial authority returns the safe denial. Authority is not ownership: holding the bundle does not make its holder responsible, and being responsible grants no permission.

### 21.2 Eligibility

An eligible member is an active Internal User with an active same-Workspace membership, effective Company context and live captured Commercial Intake read in the Opportunity's Company. Access owns this rule and a narrow query returning only membership identifiers and display labels, never email, unrelated members, counts or exclusion reasons; an empty result is valid. A new responsible actor is revalidated inside the command, including a directly submitted identifier, serialized with suspension and revocation of the actor and the target. Every rejected target returns one uniform unavailable response. A responsible actor who later loses eligibility stays recorded and displayed, gains nothing and may be replaced.

### 21.3 Command, version and receipt

The command carries the Opportunity identifier, the observed Opportunity version, an idempotency key and exactly one business field, the new responsible membership. An Opportunity always has exactly one responsible actor; the command cannot clear it. It shares the Opportunity version with section 16 and applies the section 16.4 expected-version, durable receipt, replay-before-staleness, revocation, changed-payload and concurrency rules in its own key space. Submitting the current responsible actor is a no-op that still passes authority, visibility and expected-version checks and stores an unchanged receipt. A material change commits the new responsible actor, the incremented version, the last-mutation attribution, the receipt and one event atomically. Next action, status, title, scope, Request, Client association and Company never change through it.

### 21.4 Activity

One material change records one `opportunity.responsible.changed` event attributed to the acting membership, scoped to the responsible Company and targeting the Opportunity. Its metadata is exactly the resulting Opportunity version and the previous and new responsible actor, each as a membership identifier and the display label captured at the change; it contains no email, next-action or request content. Rejected commands, safe denials, no-ops and exact replays record none. Section 17.3 owns its projection.

### 21.5 Interface, exclusions and unresolved ambiguity

The Request detail offers the change only with the permission and its prerequisites, lists eligible members and applies the section 16.6 editor states, with at most one Opportunity editor open at a time. Excluded: transfer between Companies, choosing a responsible actor other than the creator at capture, multiple or role-specific responsible actors, acceptance by the new responsible actor, notifications, reminders, bulk reassignment and any effect on Tasks, pricing, Offers or Contracts. Unresolved and not presented as business fact: who should decide a reassignment (S04-Q06; default: whoever the administrator grants the bundle, provisionally Iurie's memberships), and whether a handover should force the next action to be revisited (default: no).
