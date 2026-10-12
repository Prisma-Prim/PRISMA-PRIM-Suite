# PRD — Release 3 Commercial Workflow, section 17: Approved provisional Company commercial Activity read (#306)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 17. Approved provisional Company commercial Activity read (#306)

This section normalizes a second reversible MVP execution choice under the same provisional authority. It makes already-recorded commercial history readable without widening any commercial mutation.

### 17.1 Observable outcome

A user who holds the separate opt-in commercial Activity bundle in a server-validated active Company sees that Company's commercial intake events in the existing Activity Log page, newest first, inside its existing dated bounded page. A user without that bundle sees no commercial event, count, label or target reference, and the commercial capability itself gains no new reader.

### 17.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Activity Reader v1**, containing exactly `commercial.activity.read`. It is an independent opt-in bundle: it is neither added to Company Commercial Intake v1, v2 or v3 nor granted by any existing bundle, assignment or migration backfill, and unknown captured versions fail closed. Holding it grants no Request, Opportunity, Client, pricing, Offer, Contract, administration or mutation authority, and no Workspace-wide or cross-Company history.

Its grant and revocation are attributable through the assignment-lifecycle events the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) names and constrains, under the existing Company assignment administration visibility. This section adds no commercial event, target or metadata for that administration, and those assignment events are never projected as commercial history.

### 17.3 Projection rule and returned content

A commercial event is projected only when the actor has an active membership, the server-validated active Company equals the event's responsible Company, that Company scope holds `commercial.activity.read`, and the actor can currently read the event's commercial target: `commercial.request.read` for a Request target, `commercial.opportunity.read` for an Opportunity target, the Company's Sales Stage list read of section 24 for a stage target, and, for the Offer and Contract actions, the complete predicates of [section 25.1](release-3-commercial-25-offer-contract-history.md#251-projected-actions-and-authority), including current Opportunity read and, for a Contract–Project link, current Project read. Partial authority fails closed. Without an active Company, commercial events are omitted rather than widened to Workspace scope.

Only the known actions `client_request.created`, `opportunity.created`, `opportunity.next_action.updated`, `opportunity.responsible.changed` and, once their sections are delivered, `opportunity.outcome.changed` (section 23), `opportunity.stage.changed` and `sales_stage.configured` (section 24), and the Offer and Contract actions of section 25.1, are eligible; `client_request.client_associated` becomes eligible only when its owning implementation is delivered. Unknown actions and malformed metadata fail closed. Each action still requires its current target read authority; adding a future action requires its owning contract and explicit validated projection. Event visibility is never broader than target visibility. The reader slice itself adds no producer or lifecycle for any action.

A projected event returns its canonical action, the responsible Company, the actor label already used by the Activity Log, the server-authoritative time and a readable target reference. It returns no original request text, source label, subject, next-action text, Opportunity scope or Client-confidential content, and it offers a target link only where the actor may already read that target. For `opportunity.responsible.changed` the projection additionally returns the previous and new responsible actor as membership identifier and captured display label, not the version. For `opportunity.outcome.changed` it returns the previous and new status and the loss reason code when present, not the version. For `opportunity.stage.changed` it returns the previous and new stage labels captured at the change, not the version or identifiers. For `sales_stage.configured`, whose target is the Company's Sales Stage list and requires Commercial Intake read, it returns the operation, the labels and the positions section 24.5 names, not the revision. Any other metadata shape fails closed.

### 17.4 Error, empty and permission states

Missing verified identity returns `401`. An actor without the bundle receives the existing Activity Log response with no commercial event and no indication that commercial events exist. An empty authorized Company shows the existing empty state. No count, filter, ordering value or target label discloses another Company's commercial work, and no route creates, modifies or deletes an event.

### 17.5 Testing, exclusions and unresolved ambiguity

REST tests against PostgreSQL prove the opt-in grant, the target-visibility requirement, Company and Workspace isolation, ordering inside the existing page and the absence of sensitive metadata; the existing browser journey proves the readable history and its permission and empty states. The authorization PRD owns the acceptance proof for the bundle's grant and revocation events, which the same slice demonstrates.

This section excludes commercial filters, search, export, retention rules, Opportunity-level history views, Workspace-wide commercial consolidation and any event family outside this PRD.

Unresolved and deliberately not presented as business fact: whether ordinary Company commercial users should eventually read commercial history without a separate grant, and which commercial actions Iurie will consider dispute-critical. The Activity Log PRD owns the still-open retention and export policy.

### 17.6 Relationship to section 16

Sections 16 and 17 are independently implementable in either order against the delivered R3A1 behaviour. Section 16 owns recording its update event; section 17 owns authorizing projection of commercial events already recorded. Neither depends on the other to be complete, and whichever merges second inherits the other's behaviour through the rules above rather than through a new contract.
