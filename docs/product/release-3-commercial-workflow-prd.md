# PRD — Release 3 Commercial Workflow

**Status:** Provisional MVP execution scope — business validation pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Release:** 3  
**Decisions:** DEC-100–DEC-123  
**Owner direction:** [Dan, 2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981)  
**Deferred business validation:** [Iurie, after a demonstrable MVP](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/288#issuecomment-5749968989)

## 1. Authority and purpose

This PRD is the canonical observable-behaviour authority for the reusable commercial journey:

> Client Request → Opportunity → deterministic pricing → versioned Offer → Contract → Project

It inherits the [Product Vision](product-vision-prd.md), [consolidated decision record](consolidated-product-decision-record.md) sections 14.1–14.15 and DEC-100–DEC-122, [Tenant/Company/Client Authorization](tenant-company-client-authorization-prd.md), [Activity Log](activity-log-accountability-prd.md), [Governed Documents](governed-documents-prd.md), [Platform Operations](platform-security-reliability-operations-prd.md), [UX/Configuration](ux-localization-configuration-prd.md) and [AI Governance](ai-knowledge-governance-prd.md). This PRD states only the commercial consequences.

The [historical MVP PRD](mvp-prd.md) remains source material. Where it assumes one Workspace with equal user authority or makes the commercial pilot the whole product, this PRD and the current cross-cutting authorities prevail.

This provisional contract is the technical and product execution authority for agents to build the MVP. It does not claim that Dan or Iurie approved its exact first-tenant fields, limits, permission bundle or workflow details as business policy. Iurie will validate or correct those choices against a usable demonstration; later corrections preserve already-recorded evidence and use explicit versions or focused follow-up issues.

## 2. Problem and outcomes

Real requests currently become prices, Offers, Contracts and Projects through repeated manual work whose source, responsible Company, configuration version and approvals are difficult to reconstruct. Real tariffs, calculation examples and Offer/Contract templates are not yet available, but waiting for every input would also delay the bounded product structure that can safely receive them later.

Release 3 must:

1. preserve real manually entered requests without labelling them synthetic;
2. make Company ownership, permission and responsible actor explicit;
3. reproduce every price and governed document from exact versioned inputs;
4. keep approval, transmission, Client response and signature as separate human-controlled facts;
5. allow replaceable illustrative configuration to prove a decided slice without presenting it or derived artifacts as approved for real use;
6. connect accepted commercial work to an existing or new authorized Project without duplicating the operational record.

## 3. Product principles and provenance

- There is one commercial architecture. Illustrative inputs do not create a parallel demo mode, database path or permission model.
- A real Client Request or Opportunity remains real business data even when a later Pricing Rule, Tariff, Template or clause is illustrative.
- Every configurable commercial input has an immutable version and explicit provenance. Until real business evidence and approval exist, supplied examples use `ILLUSTRATIVE` provenance.
- Every Pricing Snapshot, Offer Version, generated representation and Contract Version retains the provenance and exact versions of all inputs used. If any input is illustrative, the derived artifact is visibly provisional. The same workflow may exercise its internal human approval, acceptance and signature-recording steps end to end with explicitly simulated evidence, but those states remain paired with provisional provenance, trigger no real external side effect and confer no authorization for real use.
- Replacing illustrative configuration creates a new version. It never silently upgrades the provenance or status of an earlier artifact.
- AI may propose structure or wording, but it never chooses the responsible Company, authoritative price, legal clause, approval or acceptance.

## 4. Actors and scope

| Actor                             | Capability consequence                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized commercial intake user | Creates and reads Company-owned Requests and their initial Opportunities.                                                             |
| Opportunity responsible actor     | Owns the next action; R3A1 fixes this to the creating membership.                                                                     |
| Pricing user                      | Runs deterministic calculation with separately authorized Company configuration.                                                      |
| Commercial approver               | Decides against an exact immutable Offer or Contract version under a later approved threshold matrix.                                 |
| Configuration owner               | Versions Company offerings, Tariffs, Pricing Rules, Templates and clauses; illustrative provenance does not grant approval authority. |
| Client Contact                    | Supplies requests or responses but has no internal product access in Release 3.                                                       |
| AI capability                     | Produces proposals only through the AI Governance boundary.                                                                           |

Workspace is the hard isolation boundary. Commercial records have one responsible Company whenever they become Company activity. R3A1 creates both the Request and Opportunity inside the server-validated active Company. A future Workspace triage queue for an unassigned request remains deferred and grants no implied visibility today.

A shared Client Account may be associated when the actor can already read it through the active Company's relationship. The association does not expose another Company's Request, Opportunity, pricing, Offer, Contract or Activity.

## 5. User stories

1. As an intake user, I want to record original request text and its source context, so that later work remains traceable.
2. As an intake user, I want to create the first Opportunity in the same action, so that a real request has an owner and next action immediately.
3. As an intake user, I want to associate an already authorized Client when known and continue without one when unknown.
4. As a Company user, I want another Company's commercial work hidden, including its existence, counts and Activity.
5. As a pricing user, I want calculations to use confirmed typed values and exact Company configuration versions.
6. As a reviewer, I want illustrative inputs and derived artifacts unmistakably provisional.
7. As an approver, I want Offer and Contract decisions attached to exact immutable versions.
8. As an operational user, I want accepted work linked to an authorized Project without blind duplicate creation.

## 6. Release boundary

- **R3A — Intake and Opportunity:** Request evidence, Client association, Company ownership, assessment, responsibility and next actions.
- **R3B — Catalogue and deterministic pricing:** shared Service definitions, Company offerings, versioned Tariffs and rules, calculations, adjustments and immutable snapshots. Its first slices — the shared Service Definition and Company Service Offering, the effective-dated Tariff and Pricing Rule Versions, and the immutable Pricing Snapshot that references them exactly — are owned by the [Release 3B Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md).
- **R3C — Offers:** complete versions, generated artifacts, deterministic checks, approval, transmission, response evidence and negotiation history.
- **R3D — Contracts:** controlled origins, versions, legal content, signature evidence, post-signature instruments and Project creation or linking.

This PRD decides the complete R3A1 contract below. Later R3A changes and R3B–R3D retain the inherited boundaries above. Before a later vertical issue is marked ready, its observable fields, permissions, transitions and acceptance cases are normalized into this PRD; the issue then links to that authority instead of becoming a second specification.

## 7. Core lifecycle and invariants

- Client Request and Opportunity are distinct. One Request may yield no Opportunity or several Opportunities; every Opportunity has one responsible Company.
- R3A1 creates exactly one Company-owned Request and one same-Company initial Opportunity atomically.
- Opportunity durable status and configurable sales stage remain separate. R3A1 creates status `OPEN` and no sales stage.
- Original Request text and source metadata are immutable. Interpretation, assessment and correction are later attributed facts.
- Pricing is deterministic and produces an immutable Pricing Snapshot.
- Offer identity is durable; each Offer Version is complete and immutable once approved or transmitted.
- Internal approval, transmission and Client outcome remain separate.
- Contract drafts are versions; an executed agreement is immutable and later legal changes are separate instruments.
- Approved or signed commercial records are never hard-deleted.
- NestJS owns commands, validation, authorization and transitions. Clients never set ownership, actor, approval or arbitrary status fields.

## 8. R3A1 — manual Request with initial Opportunity

The field limits, captured bundle, creator-as-initial-responsible rule and bounded list below are reversible provisional MVP choices. They make the first useful slice executable and testable before business validation; they do not become approved first-tenant policy by being implemented.

### 8.1 Observable outcome

An authorized user in an active Company enters a real request and immediately receives a reloadable Request detail with one initial Opportunity. The command succeeds without a Client association. When an existing Client is selected, the server revalidates current Client visibility and the active Company relationship before committing.

### 8.2 Explicit permission

R3A1 introduces captured **Company Commercial Intake v1** with exactly:

- `commercial.request.read`;
- `commercial.request.create`;
- `commercial.opportunity.read`;
- `commercial.opportunity.create`.

An active administrator with `company.assignment.manage` explicitly grants or revokes the captured v1 bundle for an active same-Workspace membership and active Company through the existing Company assignment administration. Existing bundles and assignments receive no new permission. Null or unknown captured versions fail closed.

The bundle grants no Client read, Company context, assignment administration, pricing, Offer, Contract, approval, Activity Log read or cross-Company authority. Client association additionally requires current Client read authority and an active relationship between that Client and the server-validated Company.

### 8.3 Input and server-owned fields

| Field                     | Rule                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Original request text     | Required, contains a non-whitespace character, at most 20,000 characters and stored exactly as submitted. |
| Source kind               | Server-fixed to `MANUAL_TEXT` for R3A1.                                                                   |
| Source label              | Optional user description, at most 120 characters; never interpreted as provider authority.               |
| Reported received time    | Optional valid timestamp; the server separately records capture time.                                     |
| Subject                   | Optional, at most 200 characters.                                                                         |
| Existing Client selection | Optional Client id from an authorized Client search result.                                               |
| Opportunity title         | Required, 1–160 non-whitespace characters.                                                                |
| Opportunity scope         | Optional, at most 2,000 characters.                                                                       |
| Next action               | Required, 1–500 non-whitespace characters.                                                                |

The server assigns Request id, Opportunity id, Workspace, Company, capture time, creating actor membership, responsible actor membership, Opportunity status `OPEN` and version fields. The initial responsible actor is the creator; arbitrary assignment and reassignment are deferred.

### 8.4 Create, read, reload and concurrency

The create command commits the Request, initial Opportunity, idempotency result and required Activity events in one transaction. A failed validation, authorization check, stale Client selection or persistence conflict commits none of them.

The command requires an idempotency key. An exact retry by the same actor and Company revalidates the current membership, Company context, captured bundle and target visibility before returning the original successful result. Revoked authority returns the normal safe denial and no new event. The fingerprint includes the original request text exactly as submitted plus every other command field; no trimming or normalization silently changes it. Reusing the key with any different input returns a conflict. Concurrent exact retries converge on the same result.

The create response and Request detail return only the stored Request, its one initial Opportunity and the optional Client reference that remains visible. Reload after a process restart returns the same server-owned ownership, actor, timestamps and versions. A bounded active-Company list returns the newest authorized Requests first, with their initial Opportunity title, responsible actor label and next action. It uses a stable cursor, defaults to 25 items and allows at most 50; it returns no cross-Company count or hidden Client metadata.

Client association is resolved and locked through the Client module's existing public authorization and operational-reference fence. The commercial contract adds no Client version field, lookup path, duplicate rule or union logic. Unknown, inaccessible, inactive, cross-Company, superseded or concurrently invalidated Client references all return the same safe unavailable response, create nothing and ask the user to refresh Client search before retrying. A harmless concurrent correction that leaves the authorized association valid need not block. A successful commit records the original/current Client reference through the Client owner so a later union or reversal cannot silently strand commercial use.

### 8.5 Activity and history

One committed create records exactly one `client_request.created` event and one `opportunity.created` event, attributed to the creating membership and scoped to the responsible Company. Metadata contains identifiers and resulting versions only; it contains no original text, subject, next action or Client-confidential content.

Failed commands, safe denials and exact retries create no success event. Activity projection additionally requires the existing Activity Log read boundary and current visibility of the commercial target. It never broadens Request or Opportunity access.

### 8.6 Error and permission states

- missing verified identity returns `401`;
- inactive membership, missing bundle or invalid active Company returns safe `403` without hidden metadata;
- unknown or inaccessible Request detail uses the same safe not-found response;
- every rejected Client reference uses one uniform safe unavailable response whether the identifier is unknown, inaccessible, inactive, cross-Company, superseded or invalidated concurrently;
- invalid fields return field-specific validation without persistence;
- a changed idempotency payload returns a safe conflict;
- another Company cannot infer a Request, Opportunity, Client association, event, count or label by direct identifier.

The form keeps the active Company visible, identifies immutable source fields before submission, preserves entered values after correctable validation errors and exposes a clear reload/retry path. Desktop, keyboard and narrow-screen behavior inherit the UX PRD.

## 9. Later commercial capabilities

R3B consumes confirmed typed assessment values and versioned Company configuration. An illustrative Tariff or Pricing Rule may prove calculation mechanics, but every snapshot inherits its provenance and remains ineligible for real-use approval. The [Release 3B Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md) owns the complete observable behaviour of the first such slices, including the shared-definition versus Company-offering boundary, the effective-dated Tariff and Pricing Rule Versions, permissions, expected-version and idempotency rules, the calculation trace, currency handling, events and acceptance. Later R3B capabilities remain within the boundaries stated here until they are normalized into that PRD.

R3C consumes one immutable Pricing Snapshot and exact Template/condition versions. Quality-check errors block progression; warnings require an attributable acknowledgement or approved exception. Negotiation creates a new Offer Version. Provisional artifacts may complete the same internal workflow with visibly simulated transmission and acceptance evidence; only real transmission and real Client acceptance require approved configuration and configured governed evidence.

R3D supports accepted-Offer, governed direct, import and renewal origins. A provisional Contract may exercise approval and signature-recording with clearly simulated evidence through the same states, while remaining ineligible for real execution or operational authority. Real Contract approval, execution and later instruments require approved legal content, configured evidence and authority. Project linking searches authorized existing Projects and requires explicit confirmation; it never creates a duplicate blindly.

Exact Tariffs, formulas, taxes, currencies, discount thresholds, numbering policies, approval thresholds, templates, clauses, signature practices and Contract–Project cardinalities remain configuration or evidence dependencies for the affected slice. Their absence does not block unrelated R3A work or the underlying version/provenance architecture.

## 10. Documents, integrations and AI

Offer and Contract files inherit the Governed Documents model: durable identity, immutable formal version, exact Template Version, Representation and evidence. Generated illustrative artifacts carry a visible provisional label in both stored metadata and user-visible output.

Manual entry is the source of truth in R3A1. Email ingestion, Google providers, file Request Sources, external signature providers and outbound messages are deferred. Provider failure must never erase PostgreSQL business identity or history.

AI is optional. Human entry completes the entire commercial journey. Any later analysis preserves its provider/pipeline provenance and produces proposals that an authorized human must explicitly apply.

## 11. Migration and compatibility

R3A1 is additive. It does not rewrite existing Clients, Projects, Documents, assignments or Activity. Existing assignments do not inherit Company Commercial Intake v1. No Company, Client or responsible actor is inferred from names, email domains or historical free text.

Future Request ingestion and triage must preserve the R3A1 original source and attribution contract. Future Client union or correction keeps the commercial record's original reference and uses the Client owner's authorized current projection; it does not rewrite historical source evidence.

## 12. Security, reliability and observability

- enforce Workspace and Company isolation in authorization-aware queries and database relationships;
- validate all direct identifiers server-side and return non-leaking denials;
- keep sensitive request content out of Activity metadata and diagnostic logs;
- make create and event recording atomic and idempotent;
- preserve server-authoritative actor and capture time;
- record safe correlation identifiers for failures without logging request content;
- keep R3A1 usable during AI and external-provider outages.

No production retention period, legal effect, price, clause, signature validity or approval authority is inferred by this PRD.

## 13. Testing and acceptance

The highest stable seam is the public REST interface against PostgreSQL, followed by one browser journey for the real form and reload behavior.

The first vertical issue proves:

1. authorized creation without a Client and with an authorized existing Client;
2. exact persisted fields, server ownership, creator responsibility and reload after restart;
3. bounded Company list and detail reload after restart, without cross-Company count or metadata leakage;
4. one Request, one Opportunity and exactly two attributed Activity events;
5. exact retry convergence after current-authority revalidation, exact-text fingerprinting and changed-payload conflict;
6. atomic rollback on validation, denial, unavailable Client and persistence conflict;
7. direct-id denial and no list/count/event leakage across Company and Workspace boundaries;
8. no implicit permission from an existing bundle or assignment;
9. Client union, reversal or relationship races that invalidate the association are rejected by the Client owner's operational-reference fence rather than commercial duplicate logic, while harmless current-state corrections may proceed;
10. usable empty list, validation, success, unavailable-reference and permission states at desktop and narrow width.

R3B–R3D later add deterministic pricing, provenance propagation, version immutability, approval and Project-linking tests at their public seams.

## 14. Exclusions

R3A1 excludes file uploads, provider ingestion, AI Analysis, Client creation or relationship attachment, Workspace triage, editing, status transitions, configurable stages, reassignment, advanced search, bulk actions, pricing, Offers, Contracts, Project creation, dashboards and external messages.

Sections 16 and 17 decide two separate later R3A increments. They do not widen the delivered R3A1 boundary above, and each remains excluded from R3A1 itself.

Release 3 excludes mass marketing automation, a universal CRM or CPQ engine, AI-determined prices or approvals, an internal qualified-signature service and a Client portal.

## 15. Evidence dependencies and readiness

R3A1 is an authorized provisional MVP execution scope. Its implementation issue may be published after this PRD is merged and the normal technical readiness gates pass; it does not wait for real Tariffs, Templates or Iurie's later business validation. Agents implement the bounded contract above, preserve provenance and keep the provisional choices replaceable.

Iurie validates the demonstrated workflow and first-tenant configuration once the MVP is usable. That future review may confirm or correct fields, limits, role allocation and later commercial configuration. Until then, implementation proves the reusable behavior and safety boundaries, not business approval.

Later slices name only the evidence they consume. Illustrative, versioned inputs may support a decided reversible implementation slice and its complete internal workflow when provenance remains visible at every step, simulated evidence is explicit and no real external or operational authority is produced. Real business evidence remains required before affected Tariffs, calculations, Templates, clauses, approval thresholds, numbering or generated artifacts can be approved or used operationally.

No statement here claims that Dan approved the exact provisional rules, or that Iurie supplied the missing materials or approved illustrative values. Live GitHub trackers own current ticket readiness and delivery status.

## 16. Approved provisional Opportunity next-action update (#306)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides the only Opportunity mutation permitted after R3A1; every other edit, transition and reassignment stays excluded.

### 16.1 Observable outcome

An authorized user working in a server-validated active Company opens a Company-owned Request detail, replaces the next action of its Opportunity and receives the stored new text with an incremented Opportunity version. The Request detail and the bounded active-Company list show the new next action after reload and after a process restart. Nothing else about the Request, the Opportunity or the Client association changes.

### 16.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v2**, whose permission set is v1 plus `commercial.opportunity.next_action.update`. Existing v1 assignments never expand in place; only an explicit revocation followed by a fresh grant captures v2, and null or unknown captured versions fail closed.

Authority to update is not ownership. Any holder of the captured v2 bundle in the responsible Company may update the next action whether or not they are the responsible actor, and the command never transfers responsibility, changes the durable status, assigns a sales stage, reassigns the Opportunity or grants Client, pricing, Offer, Contract, administration or Activity Log authority. The R3A1 rule that the creator remains the responsible actor is preserved unchanged.

### 16.3 Input, immutability and server-owned fields

The command accepts exactly one business field, the next action, under the R3A1 rule: required, 1–500 characters, at least one non-whitespace character, stored exactly as submitted without trimming or normalization. The command carries the Opportunity identifier, the observed Opportunity version and an idempotency key.

Original request text, source kind, source label, reported received time, subject, Opportunity title, scope, status, responsible actor, Client association, Company, Workspace and capture time remain immutable through this command. The server owns the resulting version, the updating actor membership and the update time; a client never submits them.

The Request detail read returns the current Opportunity version so an authorized user can supply it; the Opportunity version stops being a fixed value while the Request version stays fixed. No separate Opportunity read route is introduced.

### 16.4 Expected version, idempotent receipt and concurrency

A material update commits the new next action, the incremented Opportunity version, the durable command receipt and the required Activity event in one transaction. A failed validation, safe denial, stale version or persistence conflict commits none of them.

The observed version must equal the current Opportunity version. A mismatch returns a safe conflict, changes nothing and requires an explicit reload before retrying. Concurrent updates on the same observed version allow at most one material outcome.

The idempotency key is scoped to the Workspace, Company and acting membership. Its fingerprint covers the target Opportunity, the observed version and the next-action text exactly as submitted. An exact retry revalidates the current membership, Company context, captured bundle version and target visibility before returning the original receipt without repeating any write; revoked authority returns the normal safe denial and no new event. The exact retry is resolved before its now-stale observed version is rejected. Reusing the key with any different input returns a safe conflict.

A submitted next action byte-identical to the stored value is a no-op. It must still pass current authorization, target visibility and expected-version checks. It stores an unchanged durable receipt at the same version without an Activity event. Exact no-op replay returns that receipt after current-authority revalidation even if another command has since changed the Opportunity; changed reuse of its key conflicts. A receipt confirms a past command result, not the current state, which is refreshed separately.

Authorization is serialized with relevant membership suspension and assignment revocation through the existing Access boundary. This command does not mutate or newly bind the Client association and requires no additional Client read grant; all responses retain the existing permission-filtered optional Client projection.

### 16.5 Activity and history

One committed material update records exactly one `opportunity.next_action.updated` event, attributed to the acting membership and scoped to the responsible Company. Its metadata contains the resulting Opportunity version only; it contains no previous or new next-action text, request text, subject or Client-confidential content. Failed commands, safe denials, no-ops and exact retries create no event. The [Activity Log PRD](activity-log-accountability-prd.md#7-authorization-and-privacy) owns the recording boundary and section 17 owns any authorized projection of that event.

### 16.6 Error, permission and UX states

- missing verified identity returns `401`;
- inactive membership, a missing or legacy-version captured bundle, or an invalid active Company returns a safe `403` without hidden metadata;
- an unknown, cross-Company or cross-Workspace Opportunity uses the same safe not-found response as Request detail, and no list, count, label or event discloses it;
- an invalid next action returns field-specific validation without persistence;
- a stale observed version and a changed idempotency payload each return a safe conflict.

The form edits the next action from the Request detail, keeps the active Company and immutable source fields visible, preserves the entered value after a correctable validation error, preserves the original payload, observed version and key for an explicit retry after an uncertain outcome, and requires an explicit reload after a conflict. Loss of update authority clears the edit draft and any pending command; read-only detail remains only if current read authority is still valid. Broader Company, Workspace, membership or session invalidation clears scoped content and rejects late responses. Loading, denied, missing, conflict and narrow-screen states are explicit and inherit the UX PRD.

### 16.7 Testing and acceptance

The highest stable seam is the public REST interface against PostgreSQL, followed by the existing browser journey for the real edit and reload. The vertical issue proves authorized update and exact persistence; preserved immutable Request, source, title, scope, status and responsible actor; version increment and reload after restart; exactly one attributed event with version-only metadata; stale-version conflict, changed-payload conflict, exact-retry convergence after current-authority revalidation, and no-op behaviour; atomic rollback; cross-Company and cross-Workspace denial without leakage; and no implicit update authority from a legacy v1 assignment.

### 16.8 Exclusions and unresolved ambiguity

This section excludes Opportunity title, scope, Client-association and status editing, reassignment, sales stages, deletion, bulk edits, scheduling, reminders and any external effect.

Unresolved and deliberately not presented as business fact: whether a commercial next action should remain free text or later become a structured, dated commitment owned by the Task capability; whether a future business rule should restrict updates to the responsible actor or a commercial manager; and whether the Opportunity should later expose its own next-action history outside the Activity Log. Iurie's validation under section 15 may correct any of these.

## 17. Approved provisional Company commercial Activity read (#306)

This section normalizes a second reversible MVP execution choice under the same provisional authority. It makes already-recorded commercial history readable without widening any commercial mutation.

### 17.1 Observable outcome

A user who holds the separate opt-in commercial Activity bundle in a server-validated active Company sees that Company's commercial intake events in the existing Activity Log page, newest first, inside its existing dated bounded page. A user without that bundle sees no commercial event, count, label or target reference, and the commercial capability itself gains no new reader.

### 17.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Activity Reader v1**, containing exactly `commercial.activity.read`. It is an independent opt-in bundle: it is neither added to Company Commercial Intake v1 or v2 nor granted by any existing bundle, assignment or migration backfill, and unknown captured versions fail closed. Holding it grants no Request, Opportunity, Client, pricing, Offer, Contract, administration or mutation authority, and no Workspace-wide or cross-Company history.

Its grant and revocation are attributable through the assignment-lifecycle events the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) names and constrains, under the existing Company assignment administration visibility. This section adds no commercial event, target or metadata for that administration, and those assignment events are never projected as commercial history.

### 17.3 Projection rule and returned content

A commercial event is projected only when the actor has an active membership, the server-validated active Company equals the event's responsible Company, that Company scope holds `commercial.activity.read`, and the actor can currently read the event's commercial target: `commercial.request.read` for a Request target and `commercial.opportunity.read` for an Opportunity target. Partial authority fails closed. Without an active Company, commercial events are omitted rather than widened to Workspace scope.

Only the known actions client_request.created, opportunity.created and, when implemented, opportunity.next_action.updated are eligible. Unknown actions and malformed metadata fail closed. Each action still requires its current target read authority; adding a future action requires its owning contract and explicit validated projection. Event visibility is never broader than target visibility. The reader slice can ship before the update event exists; it adds no producer or lifecycle for that event.

A projected event returns its canonical action, the responsible Company, the actor label already used by the Activity Log, the server-authoritative time and a readable target reference. It returns no original request text, source label, subject, next-action text, Opportunity scope or Client-confidential content, and it offers a target link only where the actor may already read that target.

### 17.4 Error, empty and permission states

Missing verified identity returns `401`. An actor without the bundle receives the existing Activity Log response with no commercial event and no indication that commercial events exist. An empty authorized Company shows the existing empty state. No count, filter, ordering value or target label discloses another Company's commercial work, and no route creates, modifies or deletes an event.

### 17.5 Testing, exclusions and unresolved ambiguity

REST tests against PostgreSQL prove the opt-in grant, the target-visibility requirement, Company and Workspace isolation, ordering inside the existing page and the absence of sensitive metadata; the existing browser journey proves the readable history and its permission and empty states. The authorization PRD owns the acceptance proof for the bundle's grant and revocation events, which the same slice demonstrates.

This section excludes commercial filters, search, export, retention rules, Opportunity-level history views, Workspace-wide commercial consolidation and any event family outside this PRD.

Unresolved and deliberately not presented as business fact: whether ordinary Company commercial users should eventually read commercial history without a separate grant, and which commercial actions Iurie will consider dispute-critical. The Activity Log PRD owns the still-open retention and export policy.

### 17.6 Relationship to section 16

Sections 16 and 17 are independently implementable in either order against the delivered R3A1 behaviour. Section 16 owns recording its update event; section 17 owns authorizing projection of commercial events already recorded. Neither depends on the other to be complete, and whichever merges second inherits the other's behaviour through the rules above rather than through a new contract.
