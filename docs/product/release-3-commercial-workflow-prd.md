# PRD — Release 3 Commercial Workflow

**Status:** Provisional MVP execution scope — business validation pending  
**Version:** 0.2\
**Owner:** Dan Popescu  
**Release:** 3  
**Decisions:** DEC-023–DEC-026, DEC-100–DEC-123, DEC-125, DEC-128–DEC-129, DEC-132–DEC-134 and DEC-140\
**Owner direction:** [Dan, 2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981)  
**Illustrative fixed-discount amendment:** [Agent normalization under Dan's standing MVP direction, 2026-09-27, #454](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/454)\
**Deferred business validation:** [Iurie, after a demonstrable MVP](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/288#issuecomment-5749968989)

## 1. Authority and purpose

This PRD is the canonical observable-behaviour authority for the reusable commercial journey:

> Client Request → Opportunity → deterministic pricing → versioned Offer → Contract → Project

It inherits the [Product Vision](product-vision-prd.md), [consolidated decision record](consolidated-product-decision-record.md) sections 7.4, 7.6–7.7, 14.1–14.16 and 15.1 plus DEC-023–DEC-026, DEC-100–DEC-123, DEC-125, DEC-128–DEC-129, DEC-132–DEC-134 and DEC-140, [Tenant/Company/Client Authorization](tenant-company-client-authorization-prd.md), [Activity Log](activity-log-accountability-prd.md), [Governed Documents](governed-documents-prd.md), [Platform Operations](platform-security-reliability-operations-prd.md), [UX/Configuration](ux-localization-configuration-prd.md) and [AI Governance](ai-knowledge-governance-prd.md). This PRD states only the commercial consequences.

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

| Actor                             | Capability consequence                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized commercial intake user | Creates and reads Company-owned Requests and their initial Opportunities.                                                               |
| Opportunity responsible actor     | Owns the next action; R3A1 sets it to the creating membership and section 21 lets an authorized manager reassign it within the Company. |
| Pricing user                      | Runs deterministic calculation with separately authorized Company configuration.                                                        |
| Commercial approver               | Decides against an exact immutable Offer or Contract version under a later approved threshold matrix.                                   |
| Configuration owner               | Versions Company offerings, Tariffs, Pricing Rules, Templates and clauses; illustrative provenance does not grant approval authority.   |
| Client Contact                    | Supplies requests or responses but has no internal product access in Release 3.                                                         |
| AI capability                     | Produces proposals only through the AI Governance boundary.                                                                             |

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

This PRD decides the complete R3A1 contract below. Later R3A changes and R3B–R3D retain the inherited boundaries above. Before a later vertical issue is marked ready, its observable fields, permissions, transitions and acceptance cases are normalized into this PRD; the issue then links to that authority instead of becoming a second specification. [Section 18](#18-r3c-provisional-offer-execution-contract-394) normalizes the provisional R3C Offer contract and its ordered slices. [Section 19](#19-r3d-provisional-contract-execution-contract-403) normalizes the provisional R3D Contract contract and its ordered slices. [Section 20](#20-approved-provisional-one-time-client-association-after-request-capture-450) normalizes the one-time association of an existing authorized Client Account after Request capture.

## 7. Core lifecycle and invariants

- Client Request and Opportunity are distinct. One Request may yield no Opportunity or several Opportunities; every Opportunity has one responsible Company.
- R3A1 creates exactly one Company-owned Request and one same-Company initial Opportunity atomically.
- A captured Request starts at version 1 whether it has an original Client reference or not. Only a version 1 Request whose stored original Client reference is absent may make the one-time transition in section 20 to version 2 with a Client reference.
- Opportunity durable status and configurable sales stage remain separate. R3A1 creates status `OPEN` and no sales stage.
- Original Request text and source metadata are immutable. Interpretation, assessment and correction are later attributed facts.
- Pricing is deterministic and produces an immutable Pricing Snapshot.
- Offer identity is durable; each Offer Version is complete and immutable once approved or transmitted.
- Internal approval, transmission and Client outcome remain separate.
- Contract drafts are versions; an executed agreement is immutable and later legal changes are separate instruments.
- Approved or signed commercial records are never hard-deleted.
- NestJS owns commands, validation, authorization and transitions. Clients never set ownership, actor, approval or arbitrary status fields. The only change of responsible actor is the section 21 command, whose requested member NestJS revalidates against Company eligibility and current authority.

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

The server assigns Request id, Opportunity id, Workspace, Company, capture time, creating actor membership, responsible actor membership, Opportunity status `OPEN` and version fields. The initial responsible actor is the creator; choosing another responsible actor at capture remains deferred, and section 21 decides reassignment within the Company.

### 8.4 Create, read, reload and concurrency

The create command commits the Request, initial Opportunity, idempotency result and required Activity events in one transaction. A failed validation, authorization check, stale Client selection or persistence conflict commits none of them.

The command requires an idempotency key. An exact retry by the same actor and Company revalidates the current membership, Company context, captured bundle and target visibility before returning the original successful result. Revoked authority returns the normal safe denial and no new event. The fingerprint includes the original request text exactly as submitted plus every other command field; no trimming or normalization silently changes it. Reusing the key with any different input returns a conflict. Concurrent exact retries converge on the same result.

The create response and Request detail return only the stored Request, its one initial Opportunity and the optional Client reference that remains visible. Request detail exposes Request version `1 | 2`. Version 1 is the capture contract and may have a stored original Client reference or none; a null permission-filtered Client projection never proves that the stored reference is absent. Reload after a process restart returns the same server-owned ownership, actor, timestamps and versions. A bounded active-Company list returns the newest authorized Requests first, with their initial Opportunity title, responsible actor label and next action. It uses a stable cursor, defaults to 25 items and allows at most 50; it returns no cross-Company count or hidden Client metadata.

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

R3C consumes one immutable Pricing Snapshot and exact Template/condition versions. Quality-check errors block progression; warnings require an attributable acknowledgement or approved exception. Negotiation creates a new Offer Version. Provisional artifacts may complete the same internal workflow with visibly simulated transmission and acceptance evidence; only real transmission and real Client acceptance require approved configuration and configured governed evidence. [Section 18](#18-r3c-provisional-offer-execution-contract-394) owns the provisional R3C execution contract.

R3D supports accepted-Offer, governed direct, import and renewal origins. A provisional Contract may exercise approval and signature-recording with clearly simulated evidence through the same states, while remaining ineligible for real execution or operational authority. Real Contract approval, execution and later instruments require approved legal content, configured evidence and authority. Project linking searches authorized existing Projects and requires explicit confirmation; it never creates a duplicate blindly.

[Section 19](#19-r3d-provisional-contract-execution-contract-403) owns the provisional R3D execution contract, including the Precontract, the Addendum and the first Contract–Project link rule.

Exact Tariffs, formulas, taxes, currencies, discount thresholds, numbering policies, approval thresholds, templates, clauses, signature practices and Contract–Project cardinalities remain configuration or evidence dependencies for the affected slice. Their absence does not block unrelated R3A work or the underlying version/provenance architecture.

## 10. Documents, integrations and AI

Offer and Contract files inherit the Governed Documents model: durable identity, immutable formal version, exact Template Version, Representation and evidence. Generated illustrative artifacts carry a visible provisional label in both stored metadata and user-visible output.

Manual entry is the source of truth in R3A1. Email ingestion, Google providers, file Request Sources, external signature providers and outbound messages are deferred. Provider failure must never erase PostgreSQL business identity or history.

AI is optional. Human entry completes the entire commercial journey. Any later analysis preserves its provider/pipeline provenance and produces proposals that an authorized human must explicitly apply.

## 11. Migration and compatibility

R3A1 is additive. It does not rewrite existing Clients, Projects, Documents, assignments or Activity. Existing assignments do not inherit Company Commercial Intake v1. No Company, Client or responsible actor is inferred from names, email domains or historical free text.

Existing Requests remain version 1 whether they were captured with a Client or without one. Section 20 adds no backfill: a version 1 Request that already stores a Client reference stays version 1 and is never eligible for reassociation, while only a successful first association of a stored-unassociated version 1 Request creates version 2.

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

R3B–R3D later add deterministic pricing, provenance propagation, version immutability, approval and Project-linking tests at their public seams. Section 18.14 owns the R3C acceptance cases. Section 19.16 owns the R3D acceptance cases. Section 20.9 owns the post-capture Client-association acceptance cases.

## 14. Exclusions

R3A1 excludes file uploads, provider ingestion, AI Analysis, Client creation or relationship attachment, Workspace triage, editing, status transitions, configurable stages, reassignment, advanced search, bulk actions, pricing, Offers, Contracts, Project creation, dashboards and external messages.

Sections 16, 17, 20 and 21 decide separate later R3A increments. They do not widen the delivered R3A1 boundary above, and each remains excluded from R3A1 itself. Section 20 permits only the first association of an existing Client Account; replacement, correction and removal remain excluded.

Release 3 excludes mass marketing automation, a universal CRM or CPQ engine, AI-determined prices or approvals, an internal qualified-signature service and a Client portal.

## 15. Evidence dependencies and readiness

R3A1 is an authorized provisional MVP execution scope. Its implementation issue may be published after this PRD is merged and the normal technical readiness gates pass; it does not wait for real Tariffs, Templates or Iurie's later business validation. Agents implement the bounded contract above, preserve provenance and keep the provisional choices replaceable.

Iurie validates the demonstrated workflow and first-tenant configuration once the MVP is usable. That future review may confirm or correct fields, limits, role allocation and later commercial configuration. Until then, implementation proves the reusable behavior and safety boundaries, not business approval.

Later slices name only the evidence they consume. Illustrative, versioned inputs may support a decided reversible implementation slice and its complete internal workflow when provenance remains visible at every step, simulated evidence is explicit and no real external or operational authority is produced. Real business evidence remains required before affected Tariffs, calculations, Templates, clauses, approval thresholds, numbering or generated artifacts can be approved or used operationally.

No statement here claims that Dan approved the exact provisional rules, or that Iurie supplied the missing materials or approved illustrative values. Live GitHub trackers own current ticket readiness and delivery status.

## 16. Approved provisional Opportunity next-action update (#306)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides the next-action mutation after R3A1; section 21 decides reassignment, and every other edit and transition stays excluded.

### 16.1 Observable outcome

An authorized user working in a server-validated active Company opens a Company-owned Request detail, replaces the next action of its Opportunity and receives the stored new text with an incremented Opportunity version. The Request detail and the bounded active-Company list show the new next action after reload and after a process restart. Nothing else about the Request, the Opportunity or the Client association changes.

### 16.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v2**, whose permission set is v1 plus `commercial.opportunity.next_action.update`. Existing v1 assignments never expand in place; only an explicit revocation followed by a fresh grant captures v2, and null or unknown captured versions fail closed.

Authority to update is not ownership. Any holder of the captured v2 bundle in the responsible Company may update the next action whether or not they are the responsible actor, and the command never transfers responsibility, changes the durable status, assigns a sales stage, reassigns the Opportunity or grants Client, pricing, Offer, Contract, administration or Activity Log authority. The R3A1 rule that the creator is the initial responsible actor is preserved; only section 21 changes the responsible actor.

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

This section excludes Opportunity title, scope, Client-association and status editing, reassignment, sales stages, deletion, bulk edits, scheduling, reminders and any external effect. Reassignment is owned by section 21.

Unresolved and deliberately not presented as business fact: whether a commercial next action should remain free text or later become a structured, dated commitment owned by the Task capability; whether a future business rule should restrict updates to the responsible actor or a commercial manager; and whether the Opportunity should later expose its own next-action history outside the Activity Log. Iurie's validation under section 15 may correct any of these.

## 17. Approved provisional Company commercial Activity read (#306)

This section normalizes a second reversible MVP execution choice under the same provisional authority. It makes already-recorded commercial history readable without widening any commercial mutation.

### 17.1 Observable outcome

A user who holds the separate opt-in commercial Activity bundle in a server-validated active Company sees that Company's commercial intake events in the existing Activity Log page, newest first, inside its existing dated bounded page. A user without that bundle sees no commercial event, count, label or target reference, and the commercial capability itself gains no new reader.

### 17.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Activity Reader v1**, containing exactly `commercial.activity.read`. It is an independent opt-in bundle: it is neither added to Company Commercial Intake v1, v2 or v3 nor granted by any existing bundle, assignment or migration backfill, and unknown captured versions fail closed. Holding it grants no Request, Opportunity, Client, pricing, Offer, Contract, administration or mutation authority, and no Workspace-wide or cross-Company history.

Its grant and revocation are attributable through the assignment-lifecycle events the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) names and constrains, under the existing Company assignment administration visibility. This section adds no commercial event, target or metadata for that administration, and those assignment events are never projected as commercial history.

### 17.3 Projection rule and returned content

A commercial event is projected only when the actor has an active membership, the server-validated active Company equals the event's responsible Company, that Company scope holds `commercial.activity.read`, and the actor can currently read the event's commercial target: `commercial.request.read` for a Request target and `commercial.opportunity.read` for an Opportunity target. Partial authority fails closed. Without an active Company, commercial events are omitted rather than widened to Workspace scope.

Only the known actions `client_request.created`, `opportunity.created`, `opportunity.next_action.updated` and `opportunity.responsible.changed` are eligible; `client_request.client_associated` becomes eligible only when its owning implementation is delivered. Unknown actions and malformed metadata fail closed. Each action still requires its current target read authority; adding a future action requires its owning contract and explicit validated projection. Event visibility is never broader than target visibility. The reader slice itself adds no producer or lifecycle for any action.

A projected event returns its canonical action, the responsible Company, the actor label already used by the Activity Log, the server-authoritative time and a readable target reference. It returns no original request text, source label, subject, next-action text, Opportunity scope or Client-confidential content, and it offers a target link only where the actor may already read that target. For `opportunity.responsible.changed` the projection additionally returns the previous and new responsible actor as membership identifier and captured display label, not the version; any other metadata shape fails closed.

### 17.4 Error, empty and permission states

Missing verified identity returns `401`. An actor without the bundle receives the existing Activity Log response with no commercial event and no indication that commercial events exist. An empty authorized Company shows the existing empty state. No count, filter, ordering value or target label discloses another Company's commercial work, and no route creates, modifies or deletes an event.

### 17.5 Testing, exclusions and unresolved ambiguity

REST tests against PostgreSQL prove the opt-in grant, the target-visibility requirement, Company and Workspace isolation, ordering inside the existing page and the absence of sensitive metadata; the existing browser journey proves the readable history and its permission and empty states. The authorization PRD owns the acceptance proof for the bundle's grant and revocation events, which the same slice demonstrates.

This section excludes commercial filters, search, export, retention rules, Opportunity-level history views, Workspace-wide commercial consolidation and any event family outside this PRD.

Unresolved and deliberately not presented as business fact: whether ordinary Company commercial users should eventually read commercial history without a separate grant, and which commercial actions Iurie will consider dispute-critical. The Activity Log PRD owns the still-open retention and export policy.

### 17.6 Relationship to section 16

Sections 16 and 17 are independently implementable in either order against the delivered R3A1 behaviour. Section 16 owns recording its update event; section 17 owns authorizing projection of commercial events already recorded. Neither depends on the other to be complete, and whichever merges second inherits the other's behaviour through the rules above rather than through a new contract.

## 18. R3C provisional Offer execution contract (#394)

This section normalizes the R3C contract that section 6 requires before any Offer implementation issue is ready. It applies decisions already recorded and Dan's standing delegation of reversible provisional MVP choices ([2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981), renewed on 2026-09-24 as recorded in [#394](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/394)). It is not new Iurie evidence; Iurie validates or corrects the provisional choices against a demonstration (section 15). Nothing here authorizes a real price, official number, sending, signature, acceptance or legal effect.

Statements are marked as one of three kinds:

- **Decided** — already approved; the cited source owns it and it is not renegotiated here.
- **P1–P16** — a reversible provisional MVP choice, listed with its replacement trigger in [section 18.12](#1812-provisional-mvp-choices). Where [Sarcina v1.0](sarcina-v1-traceability.csv) supports a choice, its `source_id` is cited; Sarcina is a candidate non-canonical source ([reconciliation](sarcina-v1-reconciliation.md)) that canonical PRDs and the decision record override wherever they decide.
- **OQ1–OQ3** — an open product question in [section 18.13](#1813-open-product-questions), with its exact silent source and the default this MVP uses meanwhile.

IDs such as S04-Q11 cite Iurie's answers in the [coverage matrix](iurie-business-answer-coverage.md). A Partial answer is confirmed but incomplete input; this section applies it only through a cited provisional choice.

### 18.1 Outcome and inherited boundary

An authorized user of the Company responsible for an Opportunity turns one of its Pricing Snapshots into an Offer whose first complete Offer Version names one Client Legal Entity. Deterministic Quality Checks run against that exact version, and an approver approves or rejects it. A preparer records a simulated transmission of the approved version, and an approver records the Client's simulated response. A later change creates a new version and leaves earlier versions unchanged. Every Offer artifact is visibly provisional.

Inherited and not restated (Decided):

- sections 3, 7, 9 and 10 of this PRD;
- decision record [§14.7](consolidated-product-decision-record.md#147-offer-identity-and-immutable-versions), [§14.8](consolidated-product-decision-record.md#148-deterministic-quality-checks-and-approval), [§14.9](consolidated-product-decision-record.md#149-client-response-and-acceptance-evidence) and [§14.15](consolidated-product-decision-record.md#1415-permissions-auditability-and-dashboard-semantics), DEC-112–DEC-116;
- the immutable [Pricing Snapshot](release-3-illustrative-pricing-prd.md#66-pricing-snapshot-decision-record-146) and its [Client context](release-3-illustrative-pricing-prd.md#9-client-context);
- the captured-bundle convention of the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families), the [Activity Log event contract](activity-log-accountability-prd.md#4-event-contract), the [Governed Documents model](governed-documents-prd.md#4-domain-model) and the UX PRD;
- `CONTEXT.md` for Offer, Offer Version, Quality Check, Approval, Accepted Offer and Client Legal Entity.

### 18.2 Offer and Offer Version

The **Offer** is the durable identity (Decided, DR §14.7).

| Field                          | Rule                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                       | Server-assigned id. Workspace and responsible Company come from the Opportunity, which belongs to the server-validated active Company (Decided, DR §14.3).                                                                                                                  |
| Opportunity and Client Request | The target Opportunity and its Client Request; immutable. At most one Offer per Opportunity (P1).                                                                                                                                                                           |
| Client Account                 | The Client Request's current authorized Client association, resolved and fenced through the Client owner as in [section 8.4](#84-create-read-reload-and-concurrency). The Offer keeps that original reference and follows the Client owner's current projection of it (P2). |
| Illustrative reference         | Positive integer allocated atomically per Company at Offer creation and never reused. It is labelled illustrative and is never an official number (P3, OQ2).                                                                                                                |
| Revision                       | Server-owned integer starting at 1, incremented by every committed Offer command except a Quality Check run; it is the optimistic-concurrency token.                                                                                                                        |
| Created by, at                 | Server-assigned membership and instant.                                                                                                                                                                                                                                     |

Each **Offer Version** is one complete revision whose content is immutable from creation (Decided, DR §14.7, DEC-112; P4).

| Field                     | Rule                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Version number            | Server-allocated, monotone per Offer, starting at 1.                                                                                                                                                                           |
| Pricing Snapshot          | Exactly one Snapshot of the same Opportunity and Company, referenced by id (Decided, section 9). Its lines, optional adjustments, currency and totals are the version's price; they are referenced, never copied or re-priced. |
| Named Client Legal Entity | The primary entity or one additional entity of the Offer's Client Account (section 18.3), plus a copy of its legal name, IDNO/tax code and legal address at creation (Decided, DR §14.7).                                      |
| Issuing Company label     | Copy of the responsible Company's display name at creation, so the representation stays reproducible.                                                                                                                          |
| Validity                  | `validityDays`, 1–365, default 30. The server stores `validUntil` = creation instant + `validityDays` × 24 hours (P5).                                                                                                         |
| Scope note                | Optional, at most 2,000 characters, stored exactly as submitted (P6).                                                                                                                                                          |
| Commercial conditions     | Optional, at most 4,000 characters, stored exactly as submitted; no clause library (P6).                                                                                                                                       |
| Template Version          | Server-fixed illustrative Offer Template Version (section 18.7).                                                                                                                                                               |
| Provenance                | Server-fixed `ILLUSTRATIVE`; every read returns `provisional: true` (Decided, section 3).                                                                                                                                      |
| Created by, at            | Server-assigned membership and instant; the predecessor version from version 2 onward.                                                                                                                                         |
| Lineage metadata          | `supersededByVersionId` and `supersededAt`, written once when a successor is created. They are never content (Decided, DEC-115).                                                                                               |

Referenced Documents (DR §14.7) are excluded until the Document capability delivers formal Versions.

**Adjustment compatibility gate.** O1 and its existing consumers continue to accept the unadjusted R3B3 Snapshot shape. R3B4 must preserve that boundary when it first exposes adjusted Snapshots: until O8 is delivered, Create Offer and Create Offer Version return `PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED` for an adjusted Snapshot and commit nothing. After O8 is delivered, new Offer Versions may reference that immutable adjusted Snapshot and use the version-2 checks and representation below. Delivery of this compatibility change neither migrates nor automatically rechecks or rerenders existing Snapshots or Offer Versions; their existing explicit workflows remain available.

Each version records three dimensions separately (Decided, DR §14.7, DEC-114). No field combines them, and the Offer read derives its summary from the head version only.

| Dimension         | States                                                                       | Recorded facts                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Internal decision | `PENDING` → `APPROVED` or `REJECTED`                                         | Deciding membership and instant, the Quality Check run, acknowledged warnings, representation checksum; rejection reason |
| Transmission      | `NOT_TRANSMITTED` → `TRANSMITTED`                                            | Channel `SIMULATED`, membership, instant, Quality Check run, representation checksum, optional note                      |
| Client response   | `NONE`; `PENDING` once transmitted; then `ACCEPTED`, `REJECTED` or `EXPIRED` | Evidence kind `SIMULATED`, confirming membership, instant, reported received time, reason or note                        |

### 18.3 Naming the Client Legal Entity

Decided: an Offer is made to a named Client Legal Entity associated with a Client Account (`CONTEXT.md`), which is distinct from the dossier (DEC-023), and each commercial record has one provider Company (DR §14.3; DEC-024 for Contracts).

**Primary Client Legal Entity (P7).** [#393](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/393) defers the DEC-023 materialization to its first consumer, which is this contract. The MVP does not materialize it. Instead, the Client module exposes one read-only primary entity per Client Account, projected from the shared dossier identity ([Shared Client PRD section 7](release-1-shared-client-prd.md#7-minimal-data)): legal name is the Client name, and IDNO/tax code and address are as recorded, possibly absent. It has no row, backfill, Client version change, event or capacity effect, and it does not trigger #393's union guard. The reason is that a stored primary entity would need a Client backfill and would block union for every Client with an Offer.

An Offer Version names either `PRIMARY` or one additional entity of the same Client Account, as delivered by #393. Naming requires current Client read authority in the active Company and an active Client–Company relationship. Unknown, inaccessible, another Client's, superseded and concurrently invalidated references all return the uniform safe unavailable response of section 8.4 and create nothing. The copy recorded on the version never changes after a later dossier or entity correction; such a correction appears as a Quality Check warning instead. A later capability that materializes the stored primary entity maps `PRIMARY` references to it without rewriting any recorded copy.

### 18.4 Commands and transitions

Each command runs in the server-validated active Company, acts on the Offer's head version and follows section 18.11. Every command except Run Quality Checks carries `expectedOfferRevision`. A command on a superseded version returns `OFFER_VERSION_SUPERSEDED`.

| Command                | Permission (18.6)                        | Preconditions                                                                                                                                                                | Result                                         | Named refusals                                                                                                                                                                  |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create Offer           | `commercial.offer.prepare`               | Opportunity readable and `OPEN`; a Client association the actor can read; a readable Snapshot of that Opportunity; an available entity                                       | Offer and version 1, `PENDING`                 | `OFFER_ALREADY_EXISTS`, `OPPORTUNITY_NOT_OPEN`, `OFFER_CLIENT_REQUIRED`, `PRICING_SNAPSHOT_NOT_FOR_OPPORTUNITY`, `PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED`, uniform unavailable |
| Create Offer Version   | `commercial.offer.prepare`               | No version is `ACCEPTED`; Snapshot and entity rules as above                                                                                                                 | New head `PENDING`; lineage on the predecessor | `OFFER_ACCEPTED`, `STALE_OFFER_REVISION`, `PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED`, uniform unavailable                                                                        |
| Run Quality Checks     | `commercial.offer.prepare` or `.approve` | Head version                                                                                                                                                                 | One stored immutable run                       | `OFFER_VERSION_SUPERSEDED`                                                                                                                                                      |
| Approve                | `commercial.offer.approve`               | `PENDING`; checks at the decision instant have no ERROR; acknowledged codes equal the current WARNING set                                                                    | `APPROVED`                                     | `QUALITY_CHECK_ERRORS`, `QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED`, `OFFER_VERSION_ALREADY_DECIDED`                                                                                |
| Reject                 | `commercial.offer.approve`               | `PENDING`; reason of 1–500 characters                                                                                                                                        | `REJECTED`, terminal for that version          | `OFFER_VERSION_ALREADY_DECIDED`                                                                                                                                                 |
| Record transmission    | `commercial.offer.transmission.record`   | `APPROVED` and `NOT_TRANSMITTED`; no ERROR; acknowledged codes equal the current WARNING codes not acknowledged at approval; representation checksum equals the approved one | `TRANSMITTED`; response becomes `PENDING`      | `OFFER_VERSION_NOT_APPROVED`, `OFFER_VERSION_ALREADY_TRANSMITTED`, both Quality Check refusals, `REPRESENTATION_MISMATCH`                                                       |
| Record Client response | `commercial.offer.response.record`       | `TRANSMITTED` with response `PENDING`; outcome rules in section 18.8                                                                                                         | `ACCEPTED`, `REJECTED` or `EXPIRED`            | `OFFER_VERSION_NOT_TRANSMITTED`, `CLIENT_RESPONSE_ALREADY_RECORDED`, `OFFER_VALIDITY_ELAPSED`, `OFFER_VALIDITY_NOT_ELAPSED`                                                     |

`OPPORTUNITY_NOT_OPEN` is forward-compatible: every Opportunity is `OPEN` until an outcome slice exists. After an internal rejection, the preparer continues by creating a new version.

### 18.5 Quality Checks

Decided: Quality Checks are versioned deterministic rules whose `PASS`, `WARNING` or `ERROR` results are stored against the exact version. Errors block approval and transmission; warnings require an attributed acknowledgement or an approved exception; AI never decides a result (DR §14.8, DEC-113, section 9). Sarcina M03-R104 (page 19) likewise asks the system to prevent finalization while mandatory data or evidence is missing.

The first rule set is `OFFER_QUALITY_ILLUSTRATIVE` version 1 (P8):

| Code                              | Failing severity | Rule                                                                                                                                                          |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PRICING_SNAPSHOT_COHERENT`       | ERROR            | The Snapshot exists, belongs to the Offer's Company and Opportunity, has one currency across its lines and totals, and its stored trace reproduces its total. |
| `CURRENCY_UNCHANGED`              | WARNING          | The Snapshot currency equals that of the latest earlier transmitted version of the Offer, when one exists.                                                    |
| `VALIDITY_OPEN`                   | ERROR            | `validUntil` is later than the evaluation instant.                                                                                                            |
| `RECIPIENT_AVAILABLE`             | ERROR            | The Offer's Client, as the Client owner currently resolves it, is active and actively related to the Offer's Company, and the named entity belongs to it.     |
| `RECIPIENT_IDENTITY_CURRENT`      | WARNING          | The recorded legal name, IDNO/tax code and address equal the named entity's current values.                                                                   |
| `RECIPIENT_TAX_ID_RECORDED`       | WARNING          | The recorded recipient has an IDNO/tax code.                                                                                                                  |
| `PRICING_CLIENT_CONTEXT_COHERENT` | WARNING          | The Snapshot's recorded Client reference resolves to the Offer's Client Account.                                                                              |
| `PROVISIONAL_MARKER_PRESENT`      | ERROR            | Because an input is illustrative, the version's provenance is `ILLUSTRATIVE` and every read flags it provisional.                                             |

Rule set version 1 continues to evaluate the unadjusted R3B3 Snapshot shape used by O1. After R3B4 is delivered, a future additive compatibility slice introduces rule set version 2 for new Offer Versions that reference an adjusted Snapshot. Version 2 checks the bounded adjustment trace defined by the Pricing PRD, including original and adjusted amounts and final totals, but never applies, changes or re-prices the adjustment. Existing Offer Versions and stored version-1 runs remain unchanged.

A run evaluates every rule at one server instant and records, per rule, `PASS` or its failing severity, together with the rule set version, actor and instant. A run is immutable and never recomputed; changing a rule creates a new rule set version, and earlier runs keep their version. The explicit run command stores a run for review. Approve and Record transmission each evaluate the rule set at their own decision instant and store that run with the decision only if the decision commits. The deciding actor acknowledges warnings by submitting exactly the current WARNING codes, and the acknowledgement is recorded with the decision; at transmission, only codes not already acknowledged at approval need acknowledgement. Approved exceptions and overrides are excluded.

### 18.6 Permissions and approval

Decided: Approval is an attributed human decision on an exact immutable version and is distinct from sending (DR §14.8, DEC-114, `CONTEXT.md`). Commercial permissions are Company-scoped and separate preparation, approval, transmission and Client-response confirmation (DR §14.15). Iurie's answers S04-Q11 and S04-Q20 (both Partial) require his validation before an Offer becomes final or transmitted; P10 applies them.

Two captured Company bundles are introduced (P9) under the authorization PRD §8 convention:

- an active administrator with `company.assignment.manage` explicitly grants or revokes the captured v1 for an active same-Workspace membership and active Company;
- no existing bundle or assignment gains any permission, no bundle implies another, runtime evaluates the captured version, and null or unknown versions fail closed;
- grants and revocations record `company_offer_preparer_assignment.granted` / `.revoked` and `company_offer_approver_assignment.granted` / `.revoked` under the existing administration visibility, exactly like the Company Commercial Activity Reader lifecycle.

| Bundle                     | Version | Permissions                                                                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Company Offer Preparer** | v1      | `commercial.offer.read`, `commercial.offer.prepare`, `commercial.offer.transmission.record`, `commercial.pricing.snapshot.read` |
| **Company Offer Approver** | v1      | `commercial.offer.read`, `commercial.offer.approve`, `commercial.offer.response.record`                                         |

Additional rules:

- every Offer read and command also requires current `commercial.opportunity.read` on the Offer's Opportunity. Offer authority never substitutes for Opportunity visibility, and Opportunity visibility never implies Offer authority;
- naming an entity additionally requires current Client read authority (section 18.3);
- an Offer reader sees the referenced Snapshot's lines and totals as version content, but gains no other Snapshot;
- the recorded recipient copy is Offer content; the live Client projection follows Pricing PRD §9 and appears only to current Client readers;
- neither bundle grants intake, calculation, Client, Activity Log, administration, Contract or cross-Company authority.

Company Offer Preparer v1 already has only `commercial.pricing.snapshot.read` for the exact referenced price. It gains no `commercial.pricing.calculate` or `commercial.pricing.adjustment.apply` permission from #454. Preparing an Offer from an adjusted Snapshot reads its immutable trace; it does not authorize creating or changing that trace.

**Approver (P10).** First-tenant configuration grants Company Offer Approver v1 to Iurie's membership in each Company (S04-Q11). This is an assignment, not a product role, name check or hard-coded identity. One approval per version suffices. The MVP has no value or discount threshold and no second approval (OQ1). A member holding both bundles may approve a version they prepared, and both acts stay attributed. An internal rejection requires a reason of 1–500 characters.

### 18.7 Illustrative representation

Decided: Offer files inherit the Governed Documents model (section 10). The Offer is the durable identity, the Offer Version is the formal immutable version, a rendering is a Representation of that exact version, and generation records the exact Template Version and inputs. Illustrative output carries a visible provisional label in stored metadata and in the output itself (sections 3 and 10). Sarcina M08-R103 and M08-R105 (page 44) add that a Template must be approved and that a generated result stays a draft until approval.

The MVP representation (P11) works as follows:

- **Template Version.** One illustrative Offer Template Version, `OFFER_ILLUSTRATIVE` v1, is defined with the application code instead of editable configuration, and it is not approved. It is immutable: a layout or label change becomes v2 for new Offer Versions only, and every recorded version keeps rendering with its own Template Version.
- **Content model, in order.** A provisional banner stating that the document is illustrative, cannot be accepted, has no legal effect and has no official number. Then the issuing Company label; the illustrative Offer reference and version number; the recipient identity copy; the creation instant and `validUntil`; one row per Snapshot line with service name, quantity, unit, unit amount, line net, tax label and line tax; subtotal, tax total, total and currency; the scope note; the commercial conditions; and a footer naming the Template Version, Snapshot id and provenance.
- **Deterministic rendering.** HTML is rendered from immutable inputs only: amounts as their stored decimal strings with the currency code, instants in UTC ISO 8601, and English labels fixed by the Template Version. One version always renders byte-identical output; its SHA-256 checksum is shown and is recorded at approval and at transmission.
- **Viewer state.** The viewer shows the decision, transmission and response states outside the rendered bytes, including "Draft — not approved" until approval.
- **No stored file.** No file, Document Registry entry, Location or provider is created. Those arrive with governed formal Versions and Release 2 generation.

Template Version v1 and every Offer Version that uses it remain byte-identical and continue to render unadjusted R3B3 lines. After R3B4 is delivered, the future compatibility slice creates `OFFER_ILLUSTRATIVE` v2 for new Offer Versions that reference adjusted Snapshots. For each adjusted service line, v2 renders the original net and tax, then an adjacent fixed-discount row with the stored reason, net reduction and tax reduction, followed by the adjusted net and tax. It uses only the immutable Snapshot strings and final totals; it never calculates a discount, derives a new tax value or changes an existing Offer Version. The internal Offer view may also show the applying actor from the Snapshot trace, while event metadata and diagnostic logs remain free of amount and reason.

### 18.8 Simulated transmission and Client response

Decided: transmission and Client response are separate recorded facts. Acceptance requires evidence confirmed by an authorized human against the exact version, and technical receipt alone never establishes it. The accepted version is immutable and is the version a Contract later uses (DR §14.9, DEC-116, section 9). Iurie's answers ask for version-specific tracking of sending (S04-Q23, Partial) and for refused and unanswered outcomes to be recorded (S04-Q27, Partial); P12 and P13 apply them.

**Transmission (P12).** A version has at most one transmission record. Its channel is server-fixed `SIMULATED`, it takes an optional note of at most 500 characters, and the server records the actor and instant. No message, email, file or provider call exists. Linking a recipient Contact stays excluded, as in [Shared Client PRD section 18](release-1-shared-client-prd.md#18-approved-provisional-contact-position-and-decision-roles-366).

**Client response (P13).** A holder of `commercial.offer.response.record` records the response as the attributed human confirmation; the evidence kind is server-fixed `SIMULATED`.

- `ACCEPTED` requires a reported received time from the transmission instant to the decision instant, and before `validUntil`; otherwise `OFFER_VALIDITY_ELAPSED` or field validation applies.
- `REJECTED` requires a reported received time in the same range and a reason of 1–500 characters, since Sarcina M03-R105 (page 19) keeps the confirmed reason of a refusal. No reason vocabulary exists yet (S04-Q07 not mapped).
- `EXPIRED` is allowed only at or after `validUntil`, otherwise `OFFER_VALIDITY_NOT_ELAPSED`, and takes no received time. Nothing expires automatically; reads derive "validity elapsed, response pending" from time.
- Withdrawal and validity extension are excluded; a changed validity is a new version.

Acceptance makes the Offer an Accepted Offer (`CONTEXT.md`). The accepted version is final, no further version may be created (`OFFER_ACCEPTED`), and R3D consumes that version. This contract changes no Opportunity status and creates no Contract or Project link. The API and database accept no channel, evidence kind or provenance value other than the simulated and illustrative ones above.

### 18.9 Negotiation

Decided: a change after approval or transmission creates a new Offer Version and preserves prior versions and their evidence (DR §14.7, DEC-115). Iurie's answer S04-Q25 (Partial) also asks that the approved version stay locked and that a modification show the differences and require revalidation; the rules below apply it.

Create Offer Version is allowed while no version is `ACCEPTED`, whatever the head's state, and writes only lineage metadata on the predecessor. A superseded version accepts no further decision, transmission or response, and a pending response on it stays `PENDING` as history (P14). The new version starts `PENDING`, so revalidation is a fresh approval with its own checks. The version detail lists the field-level differences from its predecessor: named entity and recorded identity, Snapshot with its currency and total, validity, scope note and commercial conditions.

### 18.10 Activity

Decided: approval, rejection and acceptance evidence are attributed critical events (DR §14.8 and §14.15; [Activity Log PRD §6](activity-log-accountability-prd.md#6-critical-event-families)).

Each committed command records exactly the events below in its own transaction, attributed to the acting membership and scoped to the responsible Company:

| Command                | Events                                               |
| ---------------------- | ---------------------------------------------------- |
| Create Offer           | `offer.created`, `offer_version.created`             |
| Create Offer Version   | `offer_version.created`                              |
| Approve or Reject      | `offer_version.approved` or `offer_version.rejected` |
| Record transmission    | `offer_version.transmission_recorded`                |
| Record Client response | `offer_version.client_response_recorded`             |

Metadata is limited to Offer and version identifiers and numbers, the predecessor version number, the Snapshot id, the recipient kind, the rule set version, acknowledged warning codes, the channel or evidence kind, the outcome and the provenance. It contains no amount, text, reason, note or recipient identity value. Quality Check runs, failures, denials, conflicts and exact replays record no event.

These events are recorded but not projected (P15); the [section 17](#17-approved-provisional-company-commercial-activity-read-306) allowlist stays exact. Offer readers see the recorded decision, transmission and response facts on the Offer itself.

### 18.11 Command guarantees, errors and interface states

The guarantees of [Pricing PRD §11](release-3-illustrative-pricing-prd.md#11-commands-replay-and-concurrency) apply to Offers in this form (P16):

1. **Order.** Authenticate. Revalidate authority with a row lock serialized against revocation. Revalidate current readability of the Opportunity and, when an entity is named, of the Client. Resolve the idempotency key. Validate. Lock the Offer row, or the Opportunity for creation, compare `expectedOfferRevision`, sample one decision instant, and evaluate state rules and Quality Checks. Commit.
2. **Idempotency.** Every command requires a key scoped to the Workspace, Company and acting membership, and its fingerprint covers every field exactly as submitted. An exact replay is resolved only after current authority and target readability pass, so a revoked actor receives the normal denial and no result. It then returns the recorded result without re-running checks or re-sampling an instant, even after later state changes. Reuse with different input returns `IDEMPOTENCY_CONFLICT`. No command is a no-op: a Quality Check run with a new key creates a new run.
3. **Atomicity.** A command commits its records, lineage metadata, Quality Check run, durable receipt and events together, or nothing. Success is reported only after the commit is acknowledged. An uncertain outcome keeps the payload, expected revision and key for an explicit identical retry.
4. **Concurrency.** Commands on one Offer serialize on its row. Among concurrent commands with the same observed revision, at most one commits and the others return `STALE_OFFER_REVISION`. Concurrent creations for one Opportunity yield one Offer. Illustrative reference allocation is atomic per Company.
5. **Related records.** The Client association and the named entity are resolved and fenced through the Client owner as in section 8.4. The Snapshot is immutable and is read without pricing scope protection.
6. **Immutability.** No endpoint edits version content; deletes an Offer, version, run or decision; changes provenance, channel or evidence kind; or converts an illustrative record into a real one.
7. **Diagnostics.** Failures carry safe correlation identifiers; logs never contain Offer text, amounts or recipient identity values (section 12).

Errors: missing verified identity returns `401`. An inactive membership, a missing or unknown-version bundle, missing Opportunity read authority or an invalid active Company returns a safe `403` without hidden metadata. An unknown, cross-Company, cross-Workspace or unreadable Offer, version, Opportunity or Snapshot returns the same safe not-found. Validity, texts, reasons, received times and warning-code lists receive field-specific validation. The named `409` refusals of sections 18.4 and 18.5 disclose nothing beyond state the actor may already read. No list, count, reference or event reveals another Company's Offers.

Interface: the Request detail shows the Opportunity's Offer, or the creation entry point for a preparer. The Offer view lists versions newest first with a stable cursor, default 25 and maximum 50. Each version shows its three dimensions, latest Quality Check run, representation with checksum and provisional banner, and differences from its predecessor. Approve, reject, transmission and response actions appear only with their permission. Empty, validation, denied, stale, uncertain, check-error, warning-acknowledgement and success states are explicit; entered values survive correctable errors; desktop, keyboard and narrow-width behaviour inherit the UX PRD.

### 18.12 Provisional MVP choices

Each choice is reversible, is not approved business policy and is replaced through a new version or a focused follow-up without rewriting recorded history.

| #   | Provisional choice                                                                                                                                 | Replaced by                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1  | At most one Offer per Opportunity; alternatives are versions                                                                                       | Real practice of parallel alternative Offers                        |
| P2  | An Offer requires the Client Request's current authorized Client association and an `OPEN` Opportunity, and keeps that one Client reference        | Confirmed practice for Offers before Client identification          |
| P3  | A per-Company illustrative reference allocated at Offer creation; no official number                                                               | OQ2 and an approved numbering configuration (DR §14.14)             |
| P4  | Version content is immutable from creation; every change, including before approval, creates a new version                                         | Owner preference if draft editing is needed                         |
| P5  | Validity defaults to 30 days, ranges 1–365 days and is stored as an instant; no extension                                                          | Iurie's answer to S04-Q24 (not mapped)                              |
| P6  | Scope note and commercial conditions as optional free text; no clauses or referenced Documents                                                     | Governed Templates, clauses and formal Document Versions            |
| P7  | The primary entity is projected from the dossier identity, not materialized                                                                        | A later materialization that maps `PRIMARY` references              |
| P8  | Rule set `OFFER_QUALITY_ILLUSTRATIVE` v1, evaluated at each decision; warnings acknowledged by the deciding actor; no approved exception           | Iurie's blocking errors and warnings (S04-Q19, S04-Q21, not mapped) |
| P9  | Company Offer Preparer v1 and Company Offer Approver v1 with the permission names in section 18.6                                                  | The approved commercial role matrix                                 |
| P10 | Approver bundle granted to Iurie's memberships; one approval; no threshold or second approval; self-approval attributed; rejection reason required | OQ1                                                                 |
| P11 | A code-defined, unapproved Template Version v1 rendered as deterministic English HTML; no stored file                                              | Governed Templates, variants (S03-Q10) and Release 2 generation     |
| P12 | One simulated transmission per version; no recipient Contact                                                                                       | Real channels and transmission evidence                             |
| P13 | Responses `ACCEPTED`, `REJECTED` and `EXPIRED` with simulated evidence; rejection reason; acceptance within validity; manual expiry; no withdrawal | OQ3, S04-Q24 and S04-Q27                                            |
| P14 | A superseded version accepts no further decision, transmission or response                                                                         | Real negotiation practice                                           |
| P15 | Offer events recorded but not projected                                                                                                            | A separately normalized commercial Activity projection              |
| P16 | Pricing PRD §11-style guarantees with an Offer-level revision token                                                                                | Owner preference once real volumes exist                            |

### 18.13 Open product questions

None of these blocks the illustrative MVP; each blocks only real use of the affected rule.

| #   | Question                                                                                                                                         | Silent source                                                                                                                                                                                                         | MVP default meanwhile                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| OQ1 | Which value, discount, margin or exception thresholds let someone other than Iurie approve an Offer, or require a second approval? Which values? | DR §14.8 names threshold dimensions without values; S04-Q14 Partial gives no values; S04-Q20 Partial names no second approver                                                                                         | One approval per version by a Company Offer Approver holder, provisionally Iurie; no threshold; no second approval (P10) |
| OQ2 | When is the official Offer number assigned (creation, approval or transmission), what is its format per Company, and does it restart each year?  | [DR §14.14](consolidated-product-decision-record.md#1414-numbering-and-concurrency); S03-Q11 and S03-Q12 Partial; S04-Q22 not mapped; S04-Q33 Partial; E02 numbering clarification: section 22.2 (final rule pending) | No official number; an illustrative per-Company reference allocated at creation (P3)                                     |
| OQ3 | Which evidence establishes Client acceptance, and who confirms that it suffices?                                                                 | DEC-116 lists evidence forms only; S04-Q26 not mapped; E02 case-specific sequence: section 22.1 (general policy pending)                                                                                              | Simulated evidence confirmed by a Company Offer Approver holder (P13)                                                    |

### 18.14 Acceptance

**Demonstration.** Use synthetic data only: a Client related to PRISMA-PRIM whose dossier has no IDNO; an illustrative offering, Tariff Version and Pricing Rule Version; a preparer holding Company Context Access, Company Commercial Intake v1, Company Pricing User v1, Company Offer Preparer v1 and Company Director Client Access; an approver holding Company Context Access, Company Commercial Intake v1 and Company Offer Approver v1, provisionally Iurie's membership; and a BIC member holding every bundle in BIC only.

1. The preparer captures a Request with that Client and its Opportunity (section 8), then calculates a Pricing Snapshot (Pricing PRD).
2. The preparer creates the Offer for the `PRIMARY` entity with the default validity. Version 1 is `PENDING`, has illustrative reference 1, and its representation shows the provisional banner and "Draft — not approved".
3. The preparer runs Quality Checks. Every rule passes except the `RECIPIENT_TAX_ID_RECORDED` warning.
4. The approver's approval without acknowledgement is refused. The approval that acknowledges the warning commits with its run, acknowledgement and checksum.
5. The preparer records the simulated transmission with no new acknowledgement, because the only warning was acknowledged at approval. Its checksum equals the approved one, and the response becomes `PENDING`.
6. The approver records `ACCEPTED` with simulated evidence received within validity. The Offer becomes an Accepted Offer, and a further version is refused with `OFFER_ACCEPTED`.
7. The BIC member sees no Offer, count, reference or event.

Negotiation variant: after step 5, the preparer creates version 2 with changed conditions. Version 1 is frozen with its response `PENDING`, the differences are listed, and version 2 needs its own checks and approval before transmission and acceptance.

**Required proofs.** REST against PostgreSQL, plus one browser journey per slice at desktop and narrow width:

1. the demonstration and its negotiation variant;
2. creation commits the Offer, version 1, receipt and two events atomically; one Offer per Opportunity under concurrency; references stay unique and independent per Company;
3. creation refusals: no readable Client, a Snapshot of another Opportunity, cross-Company Snapshot not-found, and unavailable entities (unknown, another Client's, superseded, relationship archived, concurrently invalidated);
4. immutable content: no endpoint changes it; a dossier correction leaves the `PRIMARY` copy unchanged and raises `RECIPIENT_IDENTITY_CURRENT`;
5. every Quality Check rule passing and failing at fixed instants, including `VALIDITY_OPEN` failing exactly at `validUntil`; runs are immutable and carry their rule set version;
6. approval blocked by any ERROR, warning-set equality, recorded run, acknowledgement and checksum; reject requires a reason; a second decision is refused;
7. a golden fixture renders byte-identical output and checksum with the banner present; approval and transmission checksums match; a forced mismatch returns `REPRESENTATION_MISMATCH`;
8. transmission and response ordering, received-time and validity rules; `EXPIRED` only at or after `validUntil`; acceptance is final;
9. negotiation before approval, after approval and after transmission: lineage metadata only, a frozen predecessor and listed differences;
10. exact replay convergence, changed-payload conflict, denial of a replay after revocation, a recorded result after later state changes, and the uncertain-outcome retry in the interface;
11. one commit among concurrent approve and new-version, approve and reject, transmission and new-version, and response and new-version commands, and none on authority revoked concurrently;
12. every permission enforced independently in both directions, the Opportunity and Client read prerequisites, and no implicit grant from any existing bundle or assignment;
13. cross-Company and cross-Workspace not-found without count, reference or event leakage;
14. exactly the events of section 18.10 with minimal metadata, none for runs, failures or replays, and none projected;
15. the provisional marker on every read and rendering, and rejection of any other provenance, channel or evidence value by the API and the database;
16. empty, validation, denied, stale, uncertain, check-error, warning and success states at desktop and narrow width.
17. after R3B4 and the future compatibility slice are delivered, an Offer Version can reference an adjusted Snapshot, version-2 Quality Checks reproduce its final totals from the immutable trace, and Template Version v2 renders the same ordered adjustment rows and totals without repricing; an older unadjusted Snapshot, Offer Version, rule-set run and v1 rendering remain unchanged.

### 18.15 Delivery sequence and exclusions

Ordered vertical slices O1–O8, tracked under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290). Their implementation issues are created separately once their blockers close.

| Slice | Observable outcome                                                                                                   | Introduces                                                                                                                                  | Blocked by                                                                                                                            | Proofs (18.14)              |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| O1    | Create an Offer and its first complete version from one Snapshot for a named entity; read it from the Request detail | Company Offer Preparer v1 and its grant events; primary-entity projection; illustrative reference; `offer.created`, `offer_version.created` | Pricing Snapshot slice R3B3 ([Pricing PRD §15](release-3-illustrative-pricing-prd.md#15-delivery-boundary)); #393 additional entities | 2–4, 10–16 for its commands |
| O2    | Render the illustrative representation of an exact version                                                           | Template Version v1 and checksum                                                                                                            | O1                                                                                                                                    | 7, except checksum matching |
| O3    | Run and review Quality Checks                                                                                        | Rule set v1                                                                                                                                 | O1                                                                                                                                    | 5                           |
| O4    | Approve or reject an exact version                                                                                   | Company Offer Approver v1 and its grant events; `offer_version.approved`, `offer_version.rejected`                                          | O2, O3                                                                                                                                | 6                           |
| O5    | Record a simulated transmission                                                                                      | `offer_version.transmission_recorded`                                                                                                       | O4                                                                                                                                    | 7, 8                        |
| O6    | Record a simulated Client response                                                                                   | `offer_version.client_response_recorded`                                                                                                    | O5                                                                                                                                    | 1, 8                        |
| O7    | Negotiate through a new version with visible differences                                                             | Create Offer Version and the differences view                                                                                               | O1; its after-approval and after-transmission cases need O4 and O5                                                                    | 9                           |
| O8    | Consume, check and render an adjusted Snapshot without repricing it                                                  | Rule set version 2 and illustrative Template Version v2                                                                                     | Delivered R3B4; O1 for preparation, O2 for rendering and O3 for checks                                                                | 17                          |

O7 may follow O1 in parallel with O2–O6; whichever lands later inherits the other's rules, as in section 17.6. Requests captured with a Client already satisfy O1; associating a Client after capture is an optional R3A path, not a blocker.

O1 remains the priority Offer slice and depends on delivered R3B3 plus its existing Client Legal Entity dependency only. Neither #454 nor future R3B4/O8 blocks O1. O8 is an additive future slice, published only through its own approved issue after R3B4 is delivered; this documentation amendment does not make it implementation-ready by itself.

Excluded from R3C here: creating, changing, approving or deleting pricing adjustments; percentage discounts, real Templates, clauses and variants, real prices, margin and discount thresholds, approved exceptions and overrides, Contracts (R3D), official numbering, real transmission channels, delivery receipts, recipient Contacts, e-signature, real acceptance evidence, withdrawal, validity extension, Offer-level next steps, deadlines and reminders (S04-Q08 and S04-Q09 Partial; the Opportunity next action remains the follow-up record), Opportunity outcome changes, referenced Documents, stored files and Document Registry entries, Company-wide Offer lists and dashboards, Activity projection of Offer events, export, deletion and AI assistance. R3C only reads the exact immutable R3B4 adjustment trace after O8 is delivered.

## 19. R3D provisional Contract execution contract (#403)

This section normalizes the R3D contract that section 6 requires before any Contract implementation issue is ready. It builds on the Offer contract of [section 18](#18-r3c-provisional-offer-execution-contract-394) and applies decisions already recorded plus Dan's standing delegation of reversible provisional MVP choices ([2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981), renewed on 2026-09-24 as recorded in [#394](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/394) and #403). It is not new Iurie evidence; Iurie validates or corrects the provisional choices against a demonstration (section 15). Nothing here authorizes a real price, clause, official number, signature, execution, legal effect or operational authority.

Statements use the three kinds of section 18, with their own identifiers:

- **Decided** — already approved; the cited source owns it.
- **PC1–PC19** — a reversible provisional MVP choice, listed with its replacement trigger in [section 19.14](#1914-provisional-mvp-choices). Sarcina rows are cited by `source_id` as candidate non-canonical support.
- **OQC1–OQC6** — an open product question in [section 19.15](#1915-open-product-questions), with its silent source and the MVP default.

Iurie interview items are cited from [#81](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81) by session and item, and answers by coverage ID. "MASTER" is the requirements document of [decision record §1](consolidated-product-decision-record.md), kept outside the repository.

### 19.1 Outcome and inherited boundary

An authorized user of the Company responsible for an Accepted Offer turns it into a Contract, and optionally first into a Precontract, whose complete Contract Versions take the accepted content without re-entry. Deterministic Quality Checks verify concordance with the accepted Offer Version. An approver approves or rejects an exact version and records simulated signature evidence, which makes that version the executed, immutable agreement. A later change to an executed agreement is a separate Addendum. After execution, the user links the agreement to an existing authorized Project, or creates one after reviewing every candidate, never blindly. Every Contract artifact is visibly provisional.

Inherited and not restated (Decided):

- sections 3, 7, 9, 10 and 18 of this PRD, in particular the Accepted Offer of section 18.8;
- decision record [§14.9–§14.15](consolidated-product-decision-record.md#149-client-response-and-acceptance-evidence) and [§15.1](consolidated-product-decision-record.md#151-migration-is-a-governed-business-process), DEC-024, DEC-026, DEC-117–DEC-122, DEC-125, DEC-128–DEC-129, DEC-132–DEC-134 and DEC-140;
- the [Governed Documents model](governed-documents-prd.md#4-domain-model), the [Activity Log event contract](activity-log-accountability-prd.md#4-event-contract), the captured-bundle convention of the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families), the preparatory Project of the [Project/Task PRD section 15](release-1-project-task-prd.md#15-approved-preparatory-registration-slice-238) and the UX PRD;
- `CONTEXT.md` for Accepted Offer, Contract, Contract Version, Precontract, Addendum, Quality Check, Approval, Client Legal Entity and Project.

### 19.2 Contract, kinds and Contract Version

The **Contract** is the durable identity of one agreement between one provider Company and one named Client Legal Entity (Decided, DEC-024, `CONTEXT.md`). A Contract has one immutable **kind** (PC1):

- `CONTRACT` — the main agreement;
- `PRECONTRACT` — the preliminary agreement that Iurie requires when work starts before the Contract ([#81 session 20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5307259971); session 102 item 515);
- `ADDENDUM` — a later change to an executed `CONTRACT` or `PRECONTRACT` (section 19.10).

A Precontract is a separate Contract, not a draft stage of the main Contract: it has its own bounded content and is executed as its own agreement, while an executed version can never be rewritten into a later one (DEC-118). Session 20 lists the precontract modelling among questions for Dan, so the kind is a provisional product choice, not an Iurie question. Its legal relationship to the later Contract stays open (OQC3). Recording a Precontract never gates Project existence (DEC-026); whether Project activation requires one belongs to the [Project/Task PRD pre-Contract arbitration](release-1-project-task-prd.md#13-business-evidence-at-the-current-audited-boundary).

| Field                          | Rule                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                       | Server-assigned id. Workspace and responsible Company come from the source, which belongs to the server-validated active Company (Decided, DEC-024).                                                                                                                                                                    |
| Kind                           | `CONTRACT`, `PRECONTRACT` or `ADDENDUM`; immutable (PC1).                                                                                                                                                                                                                                                               |
| Origin                         | `ACCEPTED_OFFER` or `DIRECT` for a Contract or Precontract; an Addendum records its parent instead (section 19.3).                                                                                                                                                                                                      |
| Source                         | Offer origin: the Offer and its accepted Offer Version (Decided, DR §14.9). Direct origin: the Opportunity and a reason of 1–500 characters. Addendum: the executed parent Contract. Immutable.                                                                                                                         |
| Opportunity and Client Request | Always recorded from the source, so that Request → Offer → Precontract → Contract → Project stays one linked dossier (session 102 item 515).                                                                                                                                                                            |
| Client Account                 | The source's Client reference, resolved and fenced through the Client owner as in [section 8.4](#84-create-read-reload-and-concurrency); the original reference is kept and the current projection followed, as in section 18.2.                                                                                        |
| Named Client Legal Entity      | `PRIMARY` or one additional entity of that Client Account ([section 18.3](#183-naming-the-client-legal-entity)). Offer origin: the accepted Offer Version's entity. Addendum: the parent's entity. Direct origin: chosen at creation. Fixed for the Contract (Decided one entity, DEC-024; fixed across versions, PC7). |
| Precontract reference          | A `CONTRACT` created for an Opportunity whose Precontract exists records that Precontract, server-set (PC2).                                                                                                                                                                                                            |
| Addendum ordinal               | For an Addendum, 1, 2, … per parent, allocated atomically.                                                                                                                                                                                                                                                              |
| Illustrative reference         | Positive integer allocated atomically per Company and kind at creation, never reused, labelled illustrative and never an official number (PC6, OQC5).                                                                                                                                                                   |
| Revision                       | Server-owned integer starting at 1, incremented by every committed command on the Contract except a Quality Check run; it is the optimistic-concurrency token.                                                                                                                                                          |
| Created by, at                 | Server-assigned membership and instant.                                                                                                                                                                                                                                                                                 |

At most one `CONTRACT` and one `PRECONTRACT` exist per Opportunity, whatever their origin. A Precontract may be created only while no `CONTRACT` exists for that Opportunity (PC2). Creating a Contract writes nothing on the Offer.

Each **Contract Version** is one complete revision whose content is immutable from creation (Decided, DR §14.11, DEC-118; PC5).

| Field                        | Rule                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version number               | Server-allocated, monotone per Contract, starting at 1.                                                                                                                                                                                                                                              |
| Recorded party identity      | Copy of the named entity's legal name, IDNO/tax code and legal address, taken from the Client owner's current values at version creation (PC7).                                                                                                                                                      |
| Issuing Company label        | Copy of the responsible Company's display name at creation.                                                                                                                                                                                                                                          |
| Pricing Snapshot             | Offer origin: the accepted Offer Version's Snapshot, server-fixed. Direct origin: one Snapshot of the same Opportunity and Company, selected per version. Addendum: optionally one Snapshot of the parent's Opportunity. Referenced by id, never copied or re-priced (section 18.2).                 |
| Accepted Offer content       | Offer origin: the accepted Offer Version's scope note and commercial conditions, copied by the server and never an input (session 102 item 513; MASTER §8). Direct origin: scope note required (1–2,000 characters) and commercial conditions optional (at most 4,000), stored exactly as submitted. |
| Term                         | `termStartsOn` and `termEndsOn`, optional calendar dates with end on or after start; `termEndsOn` is required for a Precontract. An Addendum may state a new `termEndsOn`. They are content only and confer no legal effect (PC4).                                                                   |
| Special conditions           | Contract or Precontract: optional, at most 4,000 characters, stored exactly as submitted.                                                                                                                                                                                                            |
| Preliminary work             | Precontract only, from session 20: preliminary work scope, preliminary financial conditions and limits until the Contract, each required, 1–2,000 characters, stored exactly as submitted.                                                                                                           |
| Change summary               | Addendum only: required, 1–4,000 characters, stored exactly as submitted.                                                                                                                                                                                                                            |
| Template and Clause Versions | Server-fixed by kind (section 19.7).                                                                                                                                                                                                                                                                 |
| Provenance                   | Server-fixed `ILLUSTRATIVE`; every read returns `provisional: true` (Decided, section 3).                                                                                                                                                                                                            |
| Created by, at               | Server-assigned membership and instant; the predecessor version from version 2 onward.                                                                                                                                                                                                               |
| Lineage metadata             | `supersededByVersionId` and `supersededAt`, written once when a successor is created; never content.                                                                                                                                                                                                 |

Each version records its dimensions separately (Decided, DR §14.11, DEC-129). MASTER §13 merges them into one status list; DEC-129 prevails.

| Dimension                       | States                               | Recorded facts                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal decision               | `PENDING` → `APPROVED` or `REJECTED` | Deciding membership and instant, Quality Check run, acknowledged warnings, representation checksum; rejection reason                                                                                  |
| Execution                       | `NOT_EXECUTED` → `EXECUTED`          | Evidence kind `SIMULATED`, recording membership and instant, Quality Check run, acknowledged warnings, representation checksum, both signatory labels and signing dates, optional note (section 19.8) |
| Legal and operational lifecycle | Not recorded in the MVP              | No effective, suspended, terminated or expired state is derived or stored (PC14, OQC1)                                                                                                                |

### 19.3 Origins

Decided: a Contract may originate from an accepted Offer, governed direct creation, import or renewal; direct creation requires explicit scope, parties, commercial terms, provenance and any additional review demanded by policy (DR §14.10, DEC-117). Sarcina M04-R102 (page 24) says the Contract starts from the approved Offer; it conflicts with DEC-117, which prevails.

The MVP delivers two origins (PC3):

- **Accepted Offer.** The normal path. The Contract or Precontract takes the Accepted Offer's Company, Client, named entity, Snapshot, scope note and commercial conditions without re-entry (session 102 item 513).
- **Governed direct.** For exceptional work without an Offer, kind `CONTRACT` only (PC3). It requires a readable Opportunity with an authorized Client association and no Accepted Offer, one Snapshot of that Opportunity, a named entity under section 18.3 rules, an explicit scope note and a reason. Refusing this origin once an Accepted Offer exists is a provisional precedence rule, not a decided business rule. The additional review is the approver's acknowledgement of the `DIRECT_ORIGIN_REVIEWED` warning (section 19.5), since no policy defines another review. Prices therefore remain deterministic snapshots, never manual amounts.

Not in the MVP: **import** of historical agreements belongs to governed migration through an import batch (Decided, [DR §15.1](consolidated-product-decision-record.md#151-migration-is-a-governed-business-process), DEC-140), and **renewal** waits for real renewal practice (S04-Q37 not mapped). The API and database reject `IMPORTED` and `RENEWAL`.

### 19.4 Commands and transitions

Each command runs in the server-validated active Company and follows section 19.13. Every command on an existing Contract except Run Quality Checks carries `expectedContractRevision`, and a command on a superseded version returns `CONTRACT_VERSION_SUPERSEDED`.

| Command                    | Permission (19.6)                                              | Preconditions                                                                                                                                                                   | Result                                         | Named refusals                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create from Accepted Offer | `commercial.contract.prepare`                                  | Offer readable and accepted; no Contract of that kind for the Opportunity; for a Precontract, no `CONTRACT` yet; entity available                                               | Contract and version 1, `PENDING`              | `OFFER_NOT_ACCEPTED`, `CONTRACT_ALREADY_EXISTS`, `PRECONTRACT_AFTER_CONTRACT`, uniform unavailable                                                          |
| Create direct Contract     | `commercial.contract.prepare`                                  | Section 19.3 direct rules                                                                                                                                                       | Contract and version 1, `PENDING`              | `ACCEPTED_OFFER_EXISTS`, `CONTRACT_ALREADY_EXISTS`, `CONTRACT_CLIENT_REQUIRED`, `PRICING_SNAPSHOT_NOT_FOR_OPPORTUNITY`, uniform unavailable                 |
| Create Addendum            | `commercial.contract.prepare`                                  | Parent is an executed `CONTRACT` or `PRECONTRACT`                                                                                                                               | Addendum and version 1, `PENDING`              | `CONTRACT_NOT_EXECUTED`, `ADDENDUM_PARENT_INVALID`, uniform unavailable                                                                                     |
| Create Contract Version    | `commercial.contract.prepare`                                  | No version is `EXECUTED`                                                                                                                                                        | New head `PENDING`; lineage on the predecessor | `CONTRACT_EXECUTED`, `STALE_CONTRACT_REVISION`, uniform unavailable                                                                                         |
| Run Quality Checks         | `commercial.contract.prepare` or `commercial.contract.approve` | Head version                                                                                                                                                                    | One stored immutable run                       | `CONTRACT_VERSION_SUPERSEDED`                                                                                                                               |
| Approve                    | `commercial.contract.approve`                                  | `PENDING`; no ERROR at the decision instant; acknowledged codes equal the current WARNING set                                                                                   | `APPROVED`                                     | `QUALITY_CHECK_ERRORS`, `QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED`, `CONTRACT_VERSION_ALREADY_DECIDED`                                                         |
| Reject                     | `commercial.contract.approve`                                  | `PENDING`; reason of 1–500 characters                                                                                                                                           | `REJECTED`, terminal for that version          | `CONTRACT_VERSION_ALREADY_DECIDED`                                                                                                                          |
| Record signature           | `commercial.contract.signature.record`                         | `APPROVED` and `NOT_EXECUTED`; no ERROR; acknowledged codes equal the current WARNING codes not acknowledged at approval; checksum equals the approved one; section 19.8 fields | `EXECUTED`; the Contract is executed           | `CONTRACT_VERSION_NOT_APPROVED`, `CONTRACT_VERSION_ALREADY_EXECUTED`, both Quality Check refusals, `REPRESENTATION_MISMATCH`                                |
| Link Project               | `commercial.contract.project.link`                             | Section 19.11                                                                                                                                                                   | Link recorded                                  | `CONTRACT_NOT_EXECUTED`, `CONTRACT_KIND_NOT_LINKABLE`, `PROJECT_NOT_ELIGIBLE`, `CONTRACT_PROJECT_ALREADY_LINKED`, `CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED` |
| Create and link Project    | `commercial.contract.project.link`                             | Section 19.11                                                                                                                                                                   | Preparatory Project and link                   | Link refusals, `PROJECT_CANDIDATES_CHANGED`, `PROJECT_CANDIDATE_LIMIT`                                                                                      |

A Create Contract Version takes the kind-specific entered fields again, re-copies the inherited content from the unchanged source and refreshes the recorded party identity. After an internal rejection, the preparer continues with a new version. Opportunity status is neither checked nor changed, except that a direct creation is refused with `OPPORTUNITY_CLOSED` once a later outcome slice defines lost, disqualified or archived Opportunities.

### 19.5 Quality Checks and Offer concordance

Decided: Quality Checks produce `PASS`, `WARNING` or `ERROR` before a Contract Version can be approved (`CONTEXT.md`), with the semantics of DR §14.8 and DEC-113 that section 18.5 applies. Iurie requires the Contract to be verified against the approved Offer for at least client, issuing Company, services, value, VAT/tax regime, terms, payment conditions and commercial exceptions, with unconfirmed differences blocking (session 102 item 514; S04-Q30 and S04-Q31, Partial). MASTER §13 and Sarcina M08-R104 (page 44) add mandatory identity data and prevent finalization while it is missing.

In this MVP, the approved representation is the generated agreement, so "generation blocked" means approval blocked: every draft renders "Draft — not approved" (Sarcina M08-R105, page 44). A confirmed difference is a WARNING the approver acknowledges. The first rule set is `CONTRACT_QUALITY_ILLUSTRATIVE` version 1 (PC8):

| Code                              | Severity | Applies to                 | Rule                                                                                                                                                 |
| --------------------------------- | -------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_COMPANY_MATCHES`          | ERROR    | All                        | The Contract's Company equals that of the accepted Offer, the Opportunity or the parent.                                                             |
| `PARTY_AVAILABLE`                 | ERROR    | All                        | The Client, as the Client owner currently resolves it, is active and actively related to the Contract's Company, and the named entity belongs to it. |
| `PARTY_MATCHES_SOURCE`            | ERROR    | Offer origin, Addendum     | The named entity equals the accepted Offer Version's or the parent's.                                                                                |
| `PARTY_IDENTITY_MATCHES_SOURCE`   | WARNING  | Offer origin, Addendum     | The recorded identity equals the copy on the accepted Offer Version, or on the parent's executed version.                                            |
| `PARTY_IDENTITY_CURRENT`          | WARNING  | All                        | The recorded identity equals the named entity's current values.                                                                                      |
| `PARTY_TAX_ID_RECORDED`           | ERROR    | All                        | The recorded identity has an IDNO/tax code.                                                                                                          |
| `PRICE_MATCHES_ACCEPTED_OFFER`    | ERROR    | Offer origin               | The referenced Snapshot is the accepted Offer Version's, so services, value, tax and adjustments are identical.                                      |
| `PRICING_SNAPSHOT_COHERENT`       | ERROR    | Any referenced Snapshot    | The rule of section 18.5 of the same name.                                                                                                           |
| `CONDITIONS_MATCH_ACCEPTED_OFFER` | ERROR    | Offer origin               | The copied scope note and commercial conditions equal the accepted Offer Version's.                                                                  |
| `ADDED_CONDITIONS_CONFIRMED`      | WARNING  | Offer origin               | The version adds content absent from the accepted Offer: structured term dates, special conditions, or a Precontract's preliminary work.             |
| `DIRECT_ORIGIN_REVIEWED`          | WARNING  | Direct origin              | No Accepted Offer backs this version.                                                                                                                |
| `PARENT_EXECUTED`                 | ERROR    | Addendum                   | The parent is an executed `CONTRACT` or `PRECONTRACT`.                                                                                               |
| `CURRENCY_MATCHES_PARENT`         | WARNING  | Addendum with a Snapshot   | The Snapshot currency equals that of the parent's executed version.                                                                                  |
| `TERM_END_NOT_PASSED`             | WARNING  | Versions with `termEndsOn` | `termEndsOn` is not before the evaluation instant's UTC date.                                                                                        |
| `PROVISIONAL_MARKER_PRESENT`      | ERROR    | All                        | The version's provenance is `ILLUSTRATIVE` and every read flags it provisional.                                                                      |

Rules whose inputs the server sets by construction still run, so the mandatory concordance is a stored, reproducible result. Runs, decision-instant evaluation, rule set versioning and acknowledgement follow section 18.5 exactly, with Record signature in the place of Record transmission. Approved exceptions and overrides are excluded.

### 19.6 Permissions and approval

Decided: approval is an attributed human decision on an exact immutable version (DR §14.8, `CONTEXT.md`); Contract preparation and signature confirmation are distinct Company-scoped capabilities (DR §14.15, DEC-122); contracts, prices and sensitive documents stay separated per Company (Shared Client PRD §14).

Two captured Company bundles are introduced (PC9), with exactly the grant, fail-closed and lifecycle rules of section 18.6. Their events are `company_contract_preparer_assignment.granted` / `.revoked` and `company_contract_approver_assignment.granted` / `.revoked`.

| Bundle                        | Version | Permissions                                                                                       |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| **Company Contract Preparer** | v1      | `commercial.contract.read`, `commercial.contract.prepare`, `commercial.contract.project.link`     |
| **Company Contract Approver** | v1      | `commercial.contract.read`, `commercial.contract.approve`, `commercial.contract.signature.record` |

Additional rules:

- every Contract read and command also requires current `commercial.opportunity.read` on the Contract's Opportunity;
- creating from an Offer also requires current `commercial.offer.read` on that Offer; later Contract reads do not;
- creating any version, which copies the entity's current identity, and naming an entity for a direct Contract require current Client read authority and an active Client–Company relationship (section 18.3);
- referencing a Snapshot chosen by the preparer (direct origin, Addendum) requires `commercial.pricing.snapshot.read`;
- linking requires `project.read`, and creating a Project also requires `project.create`, through Company Project Access v1 or v2 and the Project's Client read boundary (Project/Task PRD section 15);
- a Contract reader sees the copied Offer content and the referenced Snapshot's lines and totals as version content, but gains no other Offer or Snapshot; the live Client projection appears only to current Client readers;
- neither bundle grants intake, pricing, Offer, Client, Project, Activity Log, administration or cross-Company authority.

**Approver (PC10).** First-tenant configuration grants Company Contract Approver v1 to Iurie's membership in each Company: Iurie is the principal approver and lists the Contract among his approvals (S00-Q09, Partial), and MASTER §24 keeps Contract approval human. This is an assignment, not a product role or hard-coded identity. One approval per version, no threshold, no second approval (OQC4). A member holding both bundles may approve a version they prepared; both acts stay attributed. Recording the signature uses a distinct permission, so a later split into its own bundle needs no data change.

### 19.7 Illustrative Templates, Clause Versions and representation

Decided: Contract files inherit the Governed Documents model (section 10); generated Contracts retain the exact Template and clause versions used, and AI never invents authoritative legal text (DR §14.12, DEC-119, DEC-132). Iurie approves important Templates and critical clause changes, which others prepare technically (S03-Q09 Full, S04-Q32 Partial). Sarcina M08-R103 (page 44) requires an approved Template.

The MVP representation (PC11) applies section 18.7 with these differences:

- **Template Versions.** One code-defined, unapproved Template Version per kind: `CONTRACT_ILLUSTRATIVE` v1, `PRECONTRACT_ILLUSTRATIVE` v1 and `ADDENDUM_ILLUSTRATIVE` v1. Each fixes an ordered list of Clause Versions. A change creates a new version used by new Contract Versions only.
- **Clause Versions.** Code-defined and immutable, identified by code and version: `CL_SUBJECT`, `CL_PRICE`, `CL_TERM`, `CL_CONDITIONS`, `CL_PRELIMINARY_WORK` (Precontract), `CL_CHANGE` (Addendum) and `CL_GENERAL`, each v1. Each renders a heading, a fixed English placeholder stating that no approved legal wording exists, and the version data bound to it. No clause is selectable or editable, and none contains invented legal wording.
- **Content model, in order.** The provisional banner of section 18.7, adding "not a signed agreement" and "clauses are placeholders". The kind title, with the parent and ordinal for an Addendum. The issuing Company label and recorded party identity. The illustrative reference, version number and creation instant. The source: accepted Offer reference and version, "direct origin", or the parent; and the Precontract reference for a main Contract. The clauses in Template order. A footer naming the Template Version, every Clause Version, the Snapshot id and the provenance. The direct-origin reason is internal and never rendered.
- **Deterministic rendering.** As section 18.7: byte-identical HTML from immutable inputs, SHA-256 checksum shown and recorded at approval and at signature recording. Signature evidence appears outside the rendered bytes, so execution never changes the checksum.
- **Governed-Document mapping.** The Contract is the durable Document identity, each Contract Version a formal Version, the rendering a Representation and the signature record Signature Evidence on that exact version (DEC-125, DEC-133, DEC-134). Execution freezes the Contract Version under DEC-128; it does not make it an official Document Registry Version. A later slice may register the executed agreement under the official-version contract tracked by [#400](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/400). As in section 18.7, no file, Document Registry entry, Location or provider is created, so #400 is not a prerequisite. Real Templates and Clause Versions will become usable only once an owning PRD designates them approved.

### 19.8 Simulated signature evidence and conservation

Decided: the product records external signature evidence rather than acting as a signature authority; qualified signatures and MSign stay conditional (DR §14.13, DEC-120). The signed agreement is immutable evidence (DR §14.11). Iurie asks for who, when and which version signed (S03-Q07, Partial); Sarcina M04-R103 (page 24) locks the signed version. E-signature is a later phase (MASTER §34).

**Signature record (PC12, PC13).** A holder of `commercial.contract.signature.record` records one signature record per version, which is the attributed human confirmation of execution:

- evidence kind server-fixed `SIMULATED`, with no file, provider or channel;
- a provider signatory label and a Client signatory label, each 1–200 characters, stored exactly as submitted and shown as declared and unverified (OQC2);
- a provider signing date and a Client signing date, each from the approval instant's UTC date to the recording instant's UTC date;
- an optional note of at most 500 characters.

Both parties are recorded together; partial signature states are excluded. There is no Contract transmission record: sending a draft for signature happens outside the product in the MVP.

**Conservation (PC14).** The executed version becomes final: no further version (`CONTRACT_EXECUTED`) and no second record. Approved and signed records are never hard-deleted (Decided, DR §14.15; S03-Q08, S03-Q15 and S03-Q16), and the MVP deletes or changes no Contract, version, run, decision, signature record or link at all. It stays readable with its reproducible representation, checksum, decision and evidence. Its later changes are Addenda. The MVP records no effect, suspension, termination or expiry (OQC1).

### 19.9 Revisions before execution

Decided: Contract drafts are versions and earlier versions are preserved (DR §14.11, DEC-118).

Create Contract Version is allowed while no version is `EXECUTED`, whatever the head's decision state, and writes only lineage metadata on the predecessor. A superseded version accepts no further decision or signature, and the new version starts `PENDING`, so revalidation is a fresh approval with its own checks (PC5, as section 18.9). The version detail lists the field-level differences from its predecessor: recorded party identity, Snapshot with its currency and total, term, special conditions, preliminary work, change summary and, for a direct Contract, scope note and commercial conditions.

### 19.10 Post-signature Addendum

Decided: later legal changes are separate governed instruments, never silent edits of the signed version (DR §14.11, DEC-118); Sarcina M04-R105 (page 24) says addenda do not overwrite history.

The MVP's only post-signature instrument is the Addendum (PC15). It is a Contract of kind `ADDENDUM` whose parent is an executed `CONTRACT` or `PRECONTRACT` of the same Company. It names the parent's entity, states a change summary, and may state a new term end and reference a new Snapshot of the parent's Opportunity. It follows sections 19.4–19.9 unchanged: versions, checks, approval, simulated signature and conservation. An executed Addendum changes nothing on its parent. The parent's view lists its Addenda in ordinal order with their states; no consolidated current terms are computed. Addenda to Addenda, termination, suspension, renewal and correction instruments are excluded (OQC6).

### 19.11 Project creation or linking

Decided: activation of a Contract either creates a Project or links an existing authorized Project, after the system searches and presents possible matches; it never creates a duplicate blindly. Contract and Project stay distinct, and one Contract need not equal one Project (DR §14.10, DEC-117). A Project may precede a Contract (DEC-026) and a linked Contract uses the Project's Company (Project/Task PRD section 7). Iurie asks that the Project start from the signed Contract with its data taken over ([#81 session 103](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5313726306) item 516; MASTER §8) and that the start dossier include the Contract or Precontract ([#81 session 104](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/81#issuecomment-5313749302) item 521).

**When (PC16).** Linking and creation require an executed `CONTRACT` or `PRECONTRACT`. An Addendum is never linked (`CONTRACT_KIND_NOT_LINKABLE`); its parent's links apply.

**Candidates.** A candidate is a Project of the Contract's Company whose original Client, as the Client owner currently resolves it, is the Contract's Client Account, and that the actor can read. Projects that the Project/Task PRD later marks completed or cancelled are not candidates. The candidate read returns at most 50, newest first, each with its title, status, creation instant, whether it is already linked to this Contract, and the other Contracts linked to it that the actor can read, so a Project started under the Precontract appears first for the main Contract.

**Link.** The actor links one eligible candidate. A readable Project that is not a candidate returns `PROJECT_NOT_ELIGIBLE`; an unreadable one returns the Project read's safe not-found.

**Create and link.** The actor submits a Project title (Project/Task PRD section 15 rules; the form prefills the Opportunity title, so nothing is re-entered) and `acknowledgedCandidateProjectIds`, which must equal the complete current candidate set, empty included. A different set returns `PROJECT_CANDIDATES_CHANGED`, and more than 50 candidates returns `PROJECT_CANDIDATE_LIMIT`, so the actor links instead. One transaction creates a `preparatory` Project through the Project module's public interface, for the Contract's Company and Client, together with its own `project.created` event and Client fence advance (section 15 of that PRD), and records the link. Nothing is activated, and no Task, responsible member, Drive folder or Calendar entry is created (MASTER §23 automation and item 516 activation stay with the Project PRD).

**Cardinality (PC17).** A link is its own attributed record, unique per Contract and Project. A Contract may link several Projects, at most 50, and a Project may be linked from several Contracts, such as its Precontract and its main Contract. Links are append-only in the MVP; unlinking is excluded. Real framework and multi-Project practice stays open (OQC6).

**Visibility.** The Contract view lists only the linked Projects the actor can currently read. Project detail lists linked Contracts only to actors who hold `commercial.contract.read` and Opportunity read for each; others see no Contract, count or reference.

### 19.12 Activity

Decided: approval, rejection, Contract execution and post-signature instruments are attributed critical events (DR §14.15; [Activity Log PRD §6](activity-log-accountability-prd.md#6-critical-event-families)).

Each committed command records exactly the events below in its own transaction, attributed to the acting membership and scoped to the responsible Company:

| Command                                    | Events                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| Create a Contract, Precontract or Addendum | `contract.created`, `contract_version.created`                  |
| Create Contract Version                    | `contract_version.created`                                      |
| Approve or Reject                          | `contract_version.approved` or `contract_version.rejected`      |
| Record signature                           | `contract_version.signature_recorded`                           |
| Link Project                               | `contract_project.linked`                                       |
| Create and link Project                    | `project.created` (Project owner) and `contract_project.linked` |

Metadata is limited to Contract and version identifiers and numbers, the kind, origin, parent and ordinal, the predecessor version number, the Offer Version and Snapshot ids, the rule set version, acknowledged warning codes, the evidence kind, the provenance, and the Project id with whether it was created. It contains no amount, text, reason, note, signatory label, date entered by the user or party identity value. Quality Check runs, candidate reads, failures, denials, conflicts and exact replays record no event.

These events are recorded but not projected (PC18), as in section 18.10; the section 17 allowlist stays exact.

### 19.13 Command guarantees, errors and interface states

Section 18.11 applies to Contracts with these substitutions (PC19): `expectedContractRevision`, the Contract row lock and `STALE_CONTRACT_REVISION`. Creation locks the Opportunity, so concurrent creations yield at most one Contract of each kind; an Addendum locks its parent to allocate its ordinal; reference allocation is atomic per Company and kind. Create and link Project also takes the Client owner's fence for the Project's Client, and an exact replay returns the same Project and link. The database accepts no provenance other than `ILLUSTRATIVE` and no evidence kind other than `SIMULATED`. A `CONTRACT` or `PRECONTRACT` accepts only `ACCEPTED_OFFER` or `DIRECT` origin; an `ADDENDUM` accepts a parent and no origin. No endpoint edits version content, deletes any Contract record or link, or converts an illustrative record into a real one. Logs never contain Contract text, amounts, signatory labels or party identity values.

Errors follow section 18.11: `401` without verified identity; safe `403` for an inactive membership, missing or unknown-version bundle, missing Opportunity read or invalid active Company; one safe not-found for any unknown, cross-Company, cross-Workspace or unreadable Contract, version, Offer, Opportunity, Snapshot or Project; field-specific validation; and the named `409` refusals of sections 19.4, 19.5 and 19.11, which disclose nothing beyond state the actor may already read. No list, count, reference or event reveals another Company's Contracts.

Interface: an Accepted Offer's view and the Request detail show the Opportunity's Contracts to Contract readers, and the creation entry points to a preparer. The Contract view lists versions newest first with a stable cursor, default 25 and maximum 50. Each version shows its dimensions, latest Quality Check run, representation with checksum and banner, and differences from its predecessor. The executed agreement shows its signature record, Addenda and the create-or-link panel with the complete candidate list. Actions appear only with their permission. Empty, validation, denied, stale, uncertain, check-error, warning-acknowledgement, candidates-changed and success states are explicit; entered values survive correctable errors; desktop, keyboard and narrow-width behaviour inherit the UX PRD.

### 19.14 Provisional MVP choices

Each choice is reversible, is not approved business policy and is replaced through a new version or a focused follow-up without rewriting recorded history.

| #    | Provisional choice                                                                                                                                                                                                     | Replaced by                                                                                                                    |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| PC1  | Three immutable kinds, `CONTRACT`, `PRECONTRACT` and `ADDENDUM`, sharing one Contract and Contract Version model; a Precontract is a separate Contract, not a draft stage                                              | OQC3 and real precontract practice                                                                                             |
| PC2  | At most one `CONTRACT` and one `PRECONTRACT` per Opportunity; a Precontract only before the `CONTRACT`; the `CONTRACT` references the Precontract                                                                      | Real practice of several agreements per Opportunity                                                                            |
| PC3  | Origins limited to accepted Offer and governed direct; direct is kind `CONTRACT` only, requires a Snapshot, reason and acknowledged warning, and is refused once an Accepted Offer exists; import and renewal deferred | S04-Q29, real precedence and exception practice, and a governed migration slice                                                |
| PC4  | Content fields: inherited Offer content, optional term dates (end required for a Precontract), special conditions, session 20 preliminary work fields, Addendum change summary; all text free, no clause library       | Real Templates and clauses (S04-Q32)                                                                                           |
| PC5  | Version content immutable from creation; every change is a new version; none after execution                                                                                                                           | Owner preference if draft editing is needed                                                                                    |
| PC6  | Illustrative reference per Company and kind at creation; no official number                                                                                                                                            | OQC5 and approved numbering configuration                                                                                      |
| PC7  | Named entity fixed per Contract; its identity copied fresh at each version                                                                                                                                             | A governed entity-change instrument                                                                                            |
| PC8  | Rule set `CONTRACT_QUALITY_ILLUSTRATIVE` v1; party, Company, price and copied-condition mismatches are ERRORs; identity changes and added terms or conditions are WARNINGs; missing IDNO is an ERROR                   | OQC4; Iurie's per-service rules (session 102)                                                                                  |
| PC9  | Company Contract Preparer v1 and Company Contract Approver v1 with the permissions of section 19.6                                                                                                                     | The approved commercial role matrix (S04-Q40)                                                                                  |
| PC10 | Approver bundle granted to Iurie's memberships; one approval; no threshold or second approval; self-approval attributed; rejection reason required                                                                     | OQC4 and S04-Q31                                                                                                               |
| PC11 | Code-defined, unapproved Template Versions per kind with fixed placeholder Clause Versions, rendered as deterministic English HTML; no stored file or Document Registry entry                                          | Approved Templates and clauses under an owning generation contract; #400 plus a later mapping for an official Document Version |
| PC12 | No Contract transmission record                                                                                                                                                                                        | Real sending practice for Contracts                                                                                            |
| PC13 | One simulated signature record per version covering both parties, with declared signatory labels and dates, recorded by a Contract Approver holder                                                                     | OQC1 and OQC2                                                                                                                  |
| PC14 | The executed version is final and conserved; no legal or operational lifecycle state                                                                                                                                   | OQC1                                                                                                                           |
| PC15 | The Addendum is the only post-signature instrument; it never changes its parent; no consolidated terms                                                                                                                 | OQC6 (S04-Q37)                                                                                                                 |
| PC16 | Create-or-link only after execution, with acknowledgement of the complete candidate set; a created Project is `preparatory`                                                                                            | Project activation rules (Project/Task PRD)                                                                                    |
| PC17 | Contract–Project links many-to-many, append-only, at most 50 per Contract; Addenda not linkable                                                                                                                        | OQC6 (S04-Q39)                                                                                                                 |
| PC18 | Contract events recorded but not projected                                                                                                                                                                             | A separately normalized commercial Activity projection                                                                         |
| PC19 | Section 18.11 guarantees with a Contract-level revision token                                                                                                                                                          | Owner preference once real volumes exist                                                                                       |

### 19.15 Open product questions

None of these blocks the illustrative MVP; each blocks only real use of the affected rule.

| #    | Question                                                                                                                                    | Silent source                                                                                                                                                | MVP default meanwhile                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| OQC1 | Which evidence establishes that a Contract is fully signed, who confirms it, and when does it produce effects? Is a signature service used? | DR §14.13 and DEC-120 list evidence forms only; S04-Q34, S04-Q35 and S04-Q36 not mapped; E02/E07 case evidence: section 22.1 (signing/effect policy pending) | Simulated evidence recorded by a Contract Approver holder, provisionally Iurie; no effect state (PC13, PC14) |
| OQC2 | Who signs for the provider Company and for the Client, on what mandate, and which data identify the signing party?                          | S00-Q05 Partial (Iurie chooses the Company, not the signatory); S04-Q30 Partial; S02-Q04 not mapped; #393 excludes signatory authority                       | Declared, unverified signatory labels; the named entity's recorded identity (PC13)                           |
| OQC3 | Does the executed Contract replace, absorb or coexist with the Precontract, and must preliminary work always have one?                      | Session 20 and S04-Q38 Partial conflict with DEC-026 (Project/Task PRD §13 arbitration); no legal rule recorded                                              | Both stay executed records; the Contract references the Precontract; no Project gate (PC1, PC2)              |
| OQC4 | Which Offer–Contract differences are legitimate per service and Company, and who approves them or needs a second approval?                  | Session 102 "remaining clarifications"; S04-Q31 Partial (authorizer not asked); DR §14.8 thresholds without values                                           | Rule set of section 19.5; one approval by a Contract Approver holder (PC8, PC10)                             |
| OQC5 | When is the official Contract number assigned, in which format per Company and kind, and does it restart yearly?                            | DR §14.14, DEC-121; S04-Q33, S03-Q11 and S03-Q12 Partial; E02 separate configuration: section 22.2 (final rule pending)                                      | Illustrative per-Company-and-kind reference at creation (PC6)                                                |
| OQC6 | Which post-signature instruments besides addenda occur, and how many Projects may one agreement govern (framework agreements)?              | DR §14.10–§14.11; S04-Q37 and S04-Q39 not mapped                                                                                                             | Addendum only; many-to-many explicit links (PC15, PC17)                                                      |

### 19.16 Acceptance

**Demonstration.** Continue the section 18.14 demonstration after step 6 with synthetic data only. The preparer additionally holds Company Offer Preparer v1 (for Offer read), Company Contract Preparer v1, Company Director Client Access and Company Project Access v1. The approver additionally holds Company Contract Approver v1, provisionally Iurie's membership. The BIC member holds every bundle in BIC only.

1. The preparer, as Company director, records the Client's IDNO in the dossier.
2. The preparer creates the Precontract from the Accepted Offer with preliminary work, financial conditions, limits and a term end. Version 1 is `PENDING` with illustrative Precontract reference 1; its representation shows the banner, the placeholder clauses and "Draft — not approved".
3. Checks pass except the `PARTY_IDENTITY_MATCHES_SOURCE` warning (IDNO added since the Offer) and the `ADDED_CONDITIONS_CONFIRMED` warning.
4. Approval without both acknowledgements is refused; approval with them commits. The approver records the simulated signature; the Precontract is executed and a further version is refused with `CONTRACT_EXECUTED`.
5. The preparer opens create-or-link, sees no candidate and creates a `preparatory` Project with the empty candidate set acknowledged. It is linked to the Precontract.
6. The preparer creates the main Contract from the same Accepted Offer. It references the Precontract, and its checks raise only the identity warning. It is approved and executed.
7. The candidate list shows the Project, marked as linked to the Precontract. Creating a Project with an empty acknowledgement returns `PROJECT_CANDIDATES_CHANGED`; the preparer links the existing Project, which is now linked from both agreements.
8. The preparer creates Addendum 1 with a change summary and a new term end; it is approved and executed; the main Contract is unchanged and lists it.
9. The BIC member sees no Contract, Project link, count, reference or event.

Revision variant: before approving the main Contract, the preparer creates version 2 with special conditions. Version 1 is superseded, the differences are listed, and version 2 needs its own checks, including `ADDED_CONDITIONS_CONFIRMED`, and approval.

**Required proofs.** REST against PostgreSQL, plus one browser journey per slice at desktop and narrow width:

1. the demonstration and its revision variant;
2. creation commits the Contract, version 1, receipt and two events atomically; at most one Contract of each kind per Opportunity under concurrency; no Precontract after the Contract; references unique and independent per Company and kind;
3. creation refusals: an Offer not accepted, no Offer read, no Client read, unavailable entities (unknown, superseded, relationship archived, concurrently invalidated) and cross-Company not-found;
4. no re-entry: the copied Offer content and Snapshot equal the accepted Offer Version's, and no endpoint accepts them as input; content stays immutable after a dossier correction, which raises `PARTY_IDENTITY_CURRENT`;
5. every Quality Check rule passing and failing at fixed instants and per applicability, including structured term dates producing `ADDED_CONDITIONS_CONFIRMED` and `TERM_END_NOT_PASSED` exactly at the date boundary; construction-guaranteed rules fail only through a constructed evaluation input; runs are immutable and versioned;
6. approval blocked by any ERROR, warning-set equality, recorded run, acknowledgement and checksum; reject requires a reason; a second decision is refused;
7. golden fixtures per kind render byte-identical output and checksum with the banner, placeholder clauses and every Template and Clause Version named; approval and signature checksums match; a forced mismatch returns `REPRESENTATION_MISMATCH`;
8. signature rules: approved head only, signing-date range, one record, `CONTRACT_EXECUTED` afterwards, and conservation (no change or delete endpoint; the database rejects other provenance, origin and evidence values);
9. revisions before approval, after approval and after rejection: lineage metadata only, a frozen predecessor and listed differences;
10. the Addendum lifecycle, its parent rules, ordinal allocation under concurrency and an unchanged parent;
11. the governed direct origin with its reason, Snapshot, entity and acknowledged warning, and its refusal when an Accepted Offer exists;
12. link and create-and-link: execution required, eligibility, candidate completeness, `PROJECT_CANDIDATES_CHANGED` when a Project appears concurrently, duplicate link refused, capacity, atomic Project creation with its own event, Addenda not linkable, and permission-filtered visibility both ways;
13. exact replay convergence (including the same created Project), changed-payload conflict, denial of a replay after revocation, and the uncertain-outcome retry in the interface;
14. one commit among concurrent approve and new-version, approve and reject, signature and new-version, and link and create commands, and none on authority revoked concurrently;
15. every permission enforced independently in both directions, the Opportunity, Offer, Client, Snapshot and Project prerequisites, and no implicit grant from any existing bundle or assignment;
16. cross-Company and cross-Workspace not-found without leakage; exactly the events of section 19.12 with minimal metadata, none for runs, reads, failures or replays, and none projected;
17. empty, validation, denied, stale, uncertain, check-error, warning, candidates-changed and success states at desktop and narrow width.

### 19.17 Delivery sequence and exclusions

Ordered vertical slices, tracked under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290). Their implementation issues are created separately once their blockers close.

| Slice | Observable outcome                                                                                             | Introduces                                                                                                                                | Blocked by                                                                              | Proofs (19.16)              |
| ----- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| C1    | Create a `CONTRACT` and its first version from an Accepted Offer without re-entry; read it from the Offer view | Contract model, Company Contract Preparer v1 and its grant events, illustrative reference, `contract.created`, `contract_version.created` | O6 (section 18.15), which already carries O1's #393 dependency                          | 2–4, 13–17 for its commands |
| C2    | Render the illustrative representation of an exact version                                                     | `CONTRACT_ILLUSTRATIVE` v1, Clause Versions v1, checksum                                                                                  | C1                                                                                      | 7, except checksum matching |
| C3    | Run and review Contract Quality Checks, including Offer concordance                                            | Rule set v1                                                                                                                               | C1                                                                                      | 5                           |
| C4    | Approve or reject an exact version                                                                             | Company Contract Approver v1 and its grant events, `contract_version.approved`, `contract_version.rejected`                               | C2, C3                                                                                  | 6                           |
| C5    | Record simulated signature evidence; the executed version is conserved                                         | `contract_version.signature_recorded`                                                                                                     | C4                                                                                      | 7, 8                        |
| C6    | Revise before execution through a new version with visible differences                                         | Create Contract Version and the differences view                                                                                          | C1; its after-approval case needs C4                                                    | 9                           |
| C7    | Prepare and execute a Precontract before the Contract                                                          | Kind `PRECONTRACT`, its fields and `PRECONTRACT_ILLUSTRATIVE` v1                                                                          | C2, C3; its approval and signature need C4 and C5                                       | 1, 2, 5, 7 for the kind     |
| C8    | Change an executed agreement through an Addendum                                                               | Kind `ADDENDUM` and `ADDENDUM_ILLUSTRATIVE` v1                                                                                            | C5                                                                                      | 10                          |
| C9    | Create a Contract through the governed direct origin                                                           | Direct origin and `DIRECT_ORIGIN_REVIEWED`                                                                                                | C3, C4; Pricing Snapshot slice R3B3; #393 and O1's primary-entity projection for naming | 11                          |
| CP1   | Search the candidates and link an existing authorized Project to an executed agreement                         | Candidate read, link record, `contract_project.linked`, Contract links on Project detail                                                  | C5                                                                                      | 12 (link cases)             |
| CP2   | Create a Project from an executed agreement after acknowledging every candidate                                | Create and link Project                                                                                                                   | CP1                                                                                     | 12 (creation cases)         |

C6 may follow C1 in parallel with C2–C5, and C7 and C8 may proceed in parallel once their blockers close; whichever lands later inherits the other's rules, as in section 17.6. [#400](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/400) blocks no slice: C5 may reuse its frozen-row guard precedent after it merges, and registering executed agreements as official Documents with a signed scan is a follow-up after #400 and its future signed-scan slice.

Excluded from R3D here: imported and renewal origins, multi-party agreements (DEC-024), real Templates, clauses, variants and legal review, clause selection or editing, official numbering, Contract transmission, real or partial signature evidence, e-signature and MSign, legal or operational lifecycle states, instruments other than Addenda, consolidated terms, obligations and due dates (Sarcina M04-R104), invoices and tranches, Contract Documents, stored files and signed scans, unlinking, automatic Project creation or activation, Project Tasks, Drive and Calendar automation (MASTER §23), a Project's own legal-entity field, Opportunity status changes, Company-wide Contract lists and dashboards, Activity projection, export, deletion and AI assistance.

## 20. Approved provisional one-time Client association after Request capture (#450)

This section normalizes one bounded, reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not new Iurie evidence or approved first-tenant business policy. It removes the dead end for a Request captured before its Client is known without changing capture-time evidence, Opportunity meaning, Pricing history, Offer policy or Client ownership.

### 20.1 Observable outcome and boundary

An authorized user in a server-validated active Company opens a Company-owned Request whose stored original Client reference is absent, selects one existing active Client Account from the authorized Client search and confirms the association. The Request detail and list then expose the existing Client-owned current projection and dossier navigation when the reader retains Client visibility. Reload and process restart preserve the association.

The association names a Client Account, not a Client Legal Entity. It does not create or change a Client, a Client–Company Relationship, a Client Legal Entity, the responsible Company, original Request evidence, capture fields, subject, Opportunity, next action, responsible actor, status or stage.

### 20.2 Request versions and one-time lifecycle

Version 1 remains the complete capture contract and has two valid historical forms: a Request may already store an original Client reference, or it may store none. Only the second form may transition once to version 2. Version 2 requires a stored original Client reference and has no transition back to version 1.

The eligibility decision uses the stored original reference. A null or omitted current permission-filtered Client projection does not mean that the reference is absent and never makes an already-associated version 1 Request eligible. A Request with any existing stored association, visible or hidden, cannot be re-pointed.

### 20.3 Explicit permission and prerequisites

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v3**, whose permissions are v2 plus `commercial.request.client.associate`. Existing v1 and v2 assignments never expand in place. An administrator must revoke the old assignment and issue a fresh grant that captures v3; null or unknown versions fail closed.

Execution and exact replay require all of the following at that time:

- a verified identity, active Workspace Membership and server-validated active Company;
- a live captured Company Commercial Intake v3 assignment in that Company;
- current Request read authority for the target;
- current Client read authority for the selected Client Account and an active Client–Company Relationship in that Company.

The new permission grants none of those independent prerequisites and adds no Client, pricing, Offer, Contract, Activity read, administration or cross-Company authority.

### 20.4 Public command and atomic result

`POST /commercial-intake/requests/{requestId}/client-association` requires `Idempotency-Key` and accepts exactly `{ expectedVersion, clientAccountId }`. A valid material success returns `200 { receipt: { requestId, version: 2, outcome: "associated" }, request }`, where `request` is the current permission-filtered Request detail and the receipt is the immutable command result.

One successful transaction commits all of the following or none:

1. the Request's original Client Account reference through the Client owner's public operational-reference boundary and its existing Client, relationship, union and reversal fence;
2. the Request transition from version 1 to version 2;
3. one durable command receipt;
4. exactly one `client_request.client_associated` event with metadata `{ "requestVersion": 2 }`.

The Commercial Intake module does not copy Client lookup, relationship, union, reversal or legal-entity rules. The server establishes the actor, Company, resulting version and event time.

### 20.5 Validation, replay and safe refusals

Unknown fields, malformed identifiers and an invalid version are field-specific `400` responses. Missing verified identity returns `401`. Missing, revoked, inactive, null, unknown, v1 or v2 association authority returns the existing safe `403`.

An unknown, cross-Workspace, cross-Company or unreadable Request uses the existing Request-detail not-found response. A stale Request version returns `409 STALE_VERSION`. Any stored association, visible or hidden, returns `409 CLIENT_ALREADY_ASSOCIATED` without a Client identifier or label. An unknown, inaccessible, inactive, unrelated, superseded or concurrently invalidated Client returns `CLIENT_REFERENCE_UNAVAILABLE`, matching capture. Reusing a key with changed input returns `409 IDEMPOTENCY_CONFLICT`. Every refusal writes no Request change, receipt or event.

The key is scoped to Workspace, Company and acting Membership. Its fingerprint covers the Request id, observed Request version and Client Account id. Current authority, Request visibility and selected-Client availability are revalidated before replay. An exact replay is resolved before rejecting its now-stale observed Request version and returns the original receipt without another write or event. Concurrent exact retries converge on that receipt. An uncertain response preserves the exact payload, observed version and key for an explicit unchanged retry.

### 20.6 Concurrency and Client ownership

The Request row owns association ordering. Two associations submitted against version 1 commit at most one. A next-action update remains independent because it changes the Opportunity row and Opportunity version rather than the Request row.

Client union, reversal, relationship archive and Client mutation retain the Client owner's existing lock order, authorization and outcomes through its public operational-reference fence. A race cannot strand a Client reference, bypass a relationship, copy a Client rule into Commercial Intake or change any Client Legal Entity. A harmless Client correction that preserves the authorized relationship may proceed under that existing owner contract.

### 20.7 Pricing ordering and immutable history

Pricing calculation and association use a compatible lock on the Request row when reading or changing its nullable stored Client reference. When calculation races with the first association of a previously unassociated Request, obtaining the lock first means its immutable Snapshot stores no Client reference and association may commit afterwards. If association commits first, the new Snapshot stores the original Client reference. A race never produces a partly associated Snapshot or a stranded Client reference.

No existing Pricing Snapshot is rewritten, backfilled or re-pointed. After association, a fresh calculation creates a new Snapshot that stores the reference and later reads return the Client owner's current visible projection. Losing Client read authority hides only that projection; it does not erase the stored association or make the Request eligible again.

### 20.8 Activity, reads and interface states

The association event targets the Request in its responsible Company, attributes the acting Membership at server time and contains only `requestVersion`. Failed, denied and replayed commands create no event. Its projection is allowed only through section 17's existing Company Commercial Activity Reader plus current `commercial.request.read`; it never reveals a Client identifier, label or relationship.

Prisme and Classic Request detail show “No Client associated” only when the stored association is absent. “Associate a Client” appears only with effective v3 association permission and current Client read authority, and reuses the capture form's authorized Client search. Empty selection, unavailable Client, stale or already-associated state, denial, uncertain outcome and success are explicit. Authority, identity or Company changes clear the draft and late responses never render. Success refreshes detail and any loaded list row and exposes the existing dossier action when the current projection is visible. The flow is usable by keyboard at 1440 px and 390 px.

### 20.9 Migration and acceptance

The implementation is additive. Existing Requests and assignments are unchanged: associated version 1, unassociated version 1 and newly associated version 2 are all valid, while version 2 without a stored Client reference is invalid. Migration proof covers both existing version 1 forms and proves that neither is rewritten.

The highest stable seam is the public REST interface against PostgreSQL, followed by the real browser journey. Acceptance proves:

1. success, restart persistence, version 2, one receipt and one minimal event;
2. permission, Company, Workspace, Request and Client isolation, including revocation and hidden-projection cases without metadata leakage;
3. exact replay, changed-payload conflict, two-association convergence and atomic rollback;
4. deterministic races with Pricing calculation and the Client owner's union, reversal, relationship and correction fences;
5. unchanged Request evidence, Company, Opportunity, responsible actor, Client identity, Client relationship and every Client Legal Entity;
6. detail and list projection, then capture without a Client → associate → calculate a fresh Snapshot → reload → reopen → Client dossier at desktop and narrow width.

Every existing Request-create and read prerequisite accepts v3 because it contains the v1 permissions, and next-action update accepts v2 or v3 because both contain its permission. No contained-permission check treats the bundle's newest version as the only valid version.

### 20.10 Exclusions and unresolved question

Excluded: replacing, correcting or removing an association; creating a Client or Client–Company Relationship from the Request; selecting or changing a Client Legal Entity; rewriting or backfilling any Pricing Snapshot; Opportunity reassignment, status, stage or additional Opportunities; pricing formulas; Offer or Contract behaviour; external messages; CSS redesign; and any permission beyond Intake v3's one association permission.

The approved sources do not decide whether an Offer may reuse a Pricing Snapshot created while the Request still had no Client after a later association. This section neither permits nor forbids that reuse. Its complete demonstration calculates a fresh Snapshot after association, preserving a usable Request → Pricing → Offer path without inventing Offer policy or rewriting history.

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

## 22. Controlled commercial evidence October 2026 (#493)

**Status:** Source reconciliation only; no change to the provisional execution contracts of sections 18–20.

The [controlled-source matrix](commercial-source-reconciliation-2026-10.md) preserves provenance for the newly received primary dossier and comparison material. Received examples now support preparation of questionnaire, Offer, Contract and annex models. They do not approve reusable Templates, legal clauses, operational prices, thresholds, acceptance evidence, signatures or transmission. Existing `ILLUSTRATIVE` records and O1–O8/C1–CP2 dependencies remain unchanged.

### 22.1 Case-specific acceptance and the C1 prerequisite

Evidence E02 describes one real case: after transmission of the Offer, the Client supplied details for the Contract, then signed the Contract and paid. Iurie considers acceptance confirmed by explicit progression to the Contract and its signature. E07 p. 5 visibly contains both parties' signature areas. These statements do not establish a universal policy, verified payment, signatory mandate, cryptographic validity or a distinct pre-signature Client acceptance record.

The current illustrative route records a simulated acceptance in O6 before C1 creates a Contract from an Accepted Offer (sections 18.15 and 19.17). Applying E02 automatically would create a circular prerequisite: the signature that confirms acceptance would belong to a Contract that cannot yet be created. The real-use path therefore needs a separate explicit product decision; E02 does not silently waive C1's gate.

| Unapproved option                                                        | Consequence                                                                                                                            | Decision/evidence still needed                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retain separate acceptance before Contract creation                      | Preserve O6 → C1; capture an explicit Client acceptance before preparation                                                             | Which pre-signature evidence suffices and who confirms it; legal details alone are not established acceptance                                          |
| Allow governed Contract preparation while Offer response remains pending | Distinguish preparation intent from acceptance; later signature may support a separately recorded acceptance of an exact Offer Version | Eligible states, exact version/concordance rules, actors, evidence and atomic/retry behavior; resolve unsigned, changed, rejected and cancelled drafts |

Neither option is selected. The future decision must distinguish internal approval, intention to proceed, Client acceptance, Contract preparation, signature and execution. No retroactive automatic acceptance, new permission or runtime state is introduced. Section 19.3's governed direct origin is an existing exceptional route; it is not an automatic workaround for an Offer awaiting acceptance and does not turn received historical files into imported Contracts.

OQ3 in section 18.13 now has case-specific evidence, but the general rule and confirmation authority remain open. OQC1/OQC2 in section 19.15 still require complete signing, mandate and effect policy. The remaining request is targeted policy/evidence for these gaps, not repetition of E02's already-described sequence.

### 22.2 Numbering direction without an invented final rule

E02 explicitly requests separate configurable rules for Offers and Contracts: assignment moment, annual restart and cancelled-number handling. It also states that the final internal rules are not sufficiently formalized yet. This confirms configuration direction compatible with the Governed Documents PRD §8; it supplies no operational default.

OQ2 and OQC5 remain open for the final format and policy by issuing Company and applicable Contract kind. A number visible in a received file proves neither an assignment moment nor a counter/reset rule. The existing illustrative references P3/PC6 stay non-official. Existing decided preservation of cancelled numbers is retained; unresolved handling details are not filled by reusing or deleting a number.

### 22.3 Template and field evidence

E04 supplies candidate qualification fields for activity, staffing, locations, existing documentation, risk, objectives and requested timeframe. E05 supplies an Offer section/layout example; E06/E07 supply parties, scope, term, financial conditions, signature areas and an activity/result annex. These are received examples, not approved mandatory fields, clauses, Project Tasks or completion facts. Governed Documents §14 owns Template validation; the substitution register owns the reduced input requests.

The Offer filename/content year, Contract/annex date and Standard edition disagreements are explicit contradictions in the source matrix. Preserve the originals and validate a correcting reusable model with its responsible owner. No source is rewritten, no legal precedence is inferred, and no generic Standard edition is silently selected.
