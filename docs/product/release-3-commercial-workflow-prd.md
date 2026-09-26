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

| Actor                             | Capability consequence                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Authorized commercial intake user | Creates and reads Company-owned Requests and their initial Opportunities.                                                               |
| Opportunity responsible actor     | Owns the next action; R3A1 sets it to the creating membership and section 19 lets an authorized manager reassign it within the Company. |
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

This PRD decides the complete R3A1 contract below. Later R3A changes and R3B–R3D retain the inherited boundaries above. Before a later vertical issue is marked ready, its observable fields, permissions, transitions and acceptance cases are normalized into this PRD; the issue then links to that authority instead of becoming a second specification. [Section 18](#18-r3c-provisional-offer-execution-contract-394) normalizes the provisional R3C Offer contract and its ordered slices; R3D is not yet normalized.

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
- NestJS owns commands, validation, authorization and transitions. Clients never set ownership, actor, approval or arbitrary status fields. The only change of responsible actor is the section 19 command, whose requested member NestJS revalidates against Company eligibility and current authority.

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

The server assigns Request id, Opportunity id, Workspace, Company, capture time, creating actor membership, responsible actor membership, Opportunity status `OPEN` and version fields. The initial responsible actor is the creator; choosing another responsible actor at capture remains deferred, and section 19 decides reassignment within the Company.

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

R3C consumes one immutable Pricing Snapshot and exact Template/condition versions. Quality-check errors block progression; warnings require an attributable acknowledgement or approved exception. Negotiation creates a new Offer Version. Provisional artifacts may complete the same internal workflow with visibly simulated transmission and acceptance evidence; only real transmission and real Client acceptance require approved configuration and configured governed evidence. [Section 18](#18-r3c-provisional-offer-execution-contract-394) owns the provisional R3C execution contract.

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

R3B–R3D later add deterministic pricing, provenance propagation, version immutability, approval and Project-linking tests at their public seams. Section 18.14 owns the R3C acceptance cases.

## 14. Exclusions

R3A1 excludes file uploads, provider ingestion, AI Analysis, Client creation or relationship attachment, Workspace triage, editing, status transitions, configurable stages, reassignment, advanced search, bulk actions, pricing, Offers, Contracts, Project creation, dashboards and external messages.

Sections 16, 17 and 19 decide separate later R3A increments. They do not widen the delivered R3A1 boundary above, and each remains excluded from R3A1 itself.

Release 3 excludes mass marketing automation, a universal CRM or CPQ engine, AI-determined prices or approvals, an internal qualified-signature service and a Client portal.

## 15. Evidence dependencies and readiness

R3A1 is an authorized provisional MVP execution scope. Its implementation issue may be published after this PRD is merged and the normal technical readiness gates pass; it does not wait for real Tariffs, Templates or Iurie's later business validation. Agents implement the bounded contract above, preserve provenance and keep the provisional choices replaceable.

Iurie validates the demonstrated workflow and first-tenant configuration once the MVP is usable. That future review may confirm or correct fields, limits, role allocation and later commercial configuration. Until then, implementation proves the reusable behavior and safety boundaries, not business approval.

Later slices name only the evidence they consume. Illustrative, versioned inputs may support a decided reversible implementation slice and its complete internal workflow when provenance remains visible at every step, simulated evidence is explicit and no real external or operational authority is produced. Real business evidence remains required before affected Tariffs, calculations, Templates, clauses, approval thresholds, numbering or generated artifacts can be approved or used operationally.

No statement here claims that Dan approved the exact provisional rules, or that Iurie supplied the missing materials or approved illustrative values. Live GitHub trackers own current ticket readiness and delivery status.

## 16. Approved provisional Opportunity next-action update (#306)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides the next-action mutation after R3A1; section 19 decides reassignment, and every other edit and transition stays excluded.

### 16.1 Observable outcome

An authorized user working in a server-validated active Company opens a Company-owned Request detail, replaces the next action of its Opportunity and receives the stored new text with an incremented Opportunity version. The Request detail and the bounded active-Company list show the new next action after reload and after a process restart. Nothing else about the Request, the Opportunity or the Client association changes.

### 16.2 Explicit permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Commercial Intake v2**, whose permission set is v1 plus `commercial.opportunity.next_action.update`. Existing v1 assignments never expand in place; only an explicit revocation followed by a fresh grant captures v2, and null or unknown captured versions fail closed.

Authority to update is not ownership. Any holder of the captured v2 bundle in the responsible Company may update the next action whether or not they are the responsible actor, and the command never transfers responsibility, changes the durable status, assigns a sales stage, reassigns the Opportunity or grants Client, pricing, Offer, Contract, administration or Activity Log authority. The R3A1 rule that the creator is the initial responsible actor is preserved; only section 19 changes the responsible actor.

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

This section excludes Opportunity title, scope, Client-association and status editing, reassignment, sales stages, deletion, bulk edits, scheduling, reminders and any external effect. Reassignment is owned by section 19.

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

Only the known actions `client_request.created`, `opportunity.created`, `opportunity.next_action.updated` and `opportunity.responsible.changed` are eligible. Unknown actions and malformed metadata fail closed. Each action still requires its current target read authority; adding a future action requires its owning contract and explicit validated projection. Event visibility is never broader than target visibility. The reader slice can ship before the update event exists; it adds no producer or lifecycle for that event.

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

| Field                     | Rule                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version number            | Server-allocated, monotone per Offer, starting at 1.                                                                                                                                                     |
| Pricing Snapshot          | Exactly one Snapshot of the same Opportunity and Company, referenced by id (Decided, section 9). Its lines, currency and totals are the version's price; they are referenced, never copied or re-priced. |
| Named Client Legal Entity | The primary entity or one additional entity of the Offer's Client Account (section 18.3), plus a copy of its legal name, IDNO/tax code and legal address at creation (Decided, DR §14.7).                |
| Issuing Company label     | Copy of the responsible Company's display name at creation, so the representation stays reproducible.                                                                                                    |
| Validity                  | `validityDays`, 1–365, default 30. The server stores `validUntil` = creation instant + `validityDays` × 24 hours (P5).                                                                                   |
| Scope note                | Optional, at most 2,000 characters, stored exactly as submitted (P6).                                                                                                                                    |
| Commercial conditions     | Optional, at most 4,000 characters, stored exactly as submitted; no clause library (P6).                                                                                                                 |
| Template Version          | Server-fixed illustrative Offer Template Version (section 18.7).                                                                                                                                         |
| Provenance                | Server-fixed `ILLUSTRATIVE`; every read returns `provisional: true` (Decided, section 3).                                                                                                                |
| Created by, at            | Server-assigned membership and instant; the predecessor version from version 2 onward.                                                                                                                   |
| Lineage metadata          | `supersededByVersionId` and `supersededAt`, written once when a successor is created. They are never content (Decided, DEC-115).                                                                         |

Referenced Documents (DR §14.7) are excluded until the Document capability delivers formal Versions.

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

| Command                | Permission (18.6)                        | Preconditions                                                                                                                                                                | Result                                         | Named refusals                                                                                                                       |
| ---------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Create Offer           | `commercial.offer.prepare`               | Opportunity readable and `OPEN`; a Client association the actor can read; a readable Snapshot of that Opportunity; an available entity                                       | Offer and version 1, `PENDING`                 | `OFFER_ALREADY_EXISTS`, `OPPORTUNITY_NOT_OPEN`, `OFFER_CLIENT_REQUIRED`, `PRICING_SNAPSHOT_NOT_FOR_OPPORTUNITY`, uniform unavailable |
| Create Offer Version   | `commercial.offer.prepare`               | No version is `ACCEPTED`; Snapshot and entity rules as above                                                                                                                 | New head `PENDING`; lineage on the predecessor | `OFFER_ACCEPTED`, `STALE_OFFER_REVISION`, uniform unavailable                                                                        |
| Run Quality Checks     | `commercial.offer.prepare` or `.approve` | Head version                                                                                                                                                                 | One stored immutable run                       | `OFFER_VERSION_SUPERSEDED`                                                                                                           |
| Approve                | `commercial.offer.approve`               | `PENDING`; checks at the decision instant have no ERROR; acknowledged codes equal the current WARNING set                                                                    | `APPROVED`                                     | `QUALITY_CHECK_ERRORS`, `QUALITY_CHECK_WARNINGS_UNACKNOWLEDGED`, `OFFER_VERSION_ALREADY_DECIDED`                                     |
| Reject                 | `commercial.offer.approve`               | `PENDING`; reason of 1–500 characters                                                                                                                                        | `REJECTED`, terminal for that version          | `OFFER_VERSION_ALREADY_DECIDED`                                                                                                      |
| Record transmission    | `commercial.offer.transmission.record`   | `APPROVED` and `NOT_TRANSMITTED`; no ERROR; acknowledged codes equal the current WARNING codes not acknowledged at approval; representation checksum equals the approved one | `TRANSMITTED`; response becomes `PENDING`      | `OFFER_VERSION_NOT_APPROVED`, `OFFER_VERSION_ALREADY_TRANSMITTED`, both Quality Check refusals, `REPRESENTATION_MISMATCH`            |
| Record Client response | `commercial.offer.response.record`       | `TRANSMITTED` with response `PENDING`; outcome rules in section 18.8                                                                                                         | `ACCEPTED`, `REJECTED` or `EXPIRED`            | `OFFER_VERSION_NOT_TRANSMITTED`, `CLIENT_RESPONSE_ALREADY_RECORDED`, `OFFER_VALIDITY_ELAPSED`, `OFFER_VALIDITY_NOT_ELAPSED`          |

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

A run evaluates every rule at one server instant and records, per rule, `PASS` or its failing severity, together with the rule set version, actor and instant. A run is immutable and never recomputed; changing a rule creates rule set version 2, and earlier runs keep their version. The explicit run command stores a run for review. Approve and Record transmission each evaluate the rule set at their own decision instant and store that run with the decision only if the decision commits. The deciding actor acknowledges warnings by submitting exactly the current WARNING codes, and the acknowledgement is recorded with the decision; at transmission, only codes not already acknowledged at approval need acknowledgement. Approved exceptions and overrides are excluded.

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

**Approver (P10).** First-tenant configuration grants Company Offer Approver v1 to Iurie's membership in each Company (S04-Q11). This is an assignment, not a product role, name check or hard-coded identity. One approval per version suffices. The MVP has no value or discount threshold and no second approval (OQ1). A member holding both bundles may approve a version they prepared, and both acts stay attributed. An internal rejection requires a reason of 1–500 characters.

### 18.7 Illustrative representation

Decided: Offer files inherit the Governed Documents model (section 10). The Offer is the durable identity, the Offer Version is the formal immutable version, a rendering is a Representation of that exact version, and generation records the exact Template Version and inputs. Illustrative output carries a visible provisional label in stored metadata and in the output itself (sections 3 and 10). Sarcina M08-R103 and M08-R105 (page 44) add that a Template must be approved and that a generated result stays a draft until approval.

The MVP representation (P11) works as follows:

- **Template Version.** One illustrative Offer Template Version, `OFFER_ILLUSTRATIVE` v1, is defined with the application code instead of editable configuration, and it is not approved. It is immutable: a layout or label change becomes v2 for new Offer Versions only, and every recorded version keeps rendering with its own Template Version.
- **Content model, in order.** A provisional banner stating that the document is illustrative, cannot be accepted, has no legal effect and has no official number. Then the issuing Company label; the illustrative Offer reference and version number; the recipient identity copy; the creation instant and `validUntil`; one row per Snapshot line with service name, quantity, unit, unit amount, line net, tax label and line tax; subtotal, tax total, total and currency; the scope note; the commercial conditions; and a footer naming the Template Version, Snapshot id and provenance.
- **Deterministic rendering.** HTML is rendered from immutable inputs only: amounts as their stored decimal strings with the currency code, instants in UTC ISO 8601, and English labels fixed by the Template Version. One version always renders byte-identical output; its SHA-256 checksum is shown and is recorded at approval and at transmission.
- **Viewer state.** The viewer shows the decision, transmission and response states outside the rendered bytes, including "Draft — not approved" until approval.
- **No stored file.** No file, Document Registry entry, Location or provider is created. Those arrive with governed formal Versions and Release 2 generation.

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

| #   | Question                                                                                                                                         | Silent source                                                                                                                                         | MVP default meanwhile                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| OQ1 | Which value, discount, margin or exception thresholds let someone other than Iurie approve an Offer, or require a second approval? Which values? | DR §14.8 names threshold dimensions without values; S04-Q14 Partial gives no values; S04-Q20 Partial names no second approver                         | One approval per version by a Company Offer Approver holder, provisionally Iurie; no threshold; no second approval (P10) |
| OQ2 | When is the official Offer number assigned (creation, approval or transmission), what is its format per Company, and does it restart each year?  | [DR §14.14](consolidated-product-decision-record.md#1414-numbering-and-concurrency); S03-Q11 and S03-Q12 Partial; S04-Q22 not mapped; S04-Q33 Partial | No official number; an illustrative per-Company reference allocated at creation (P3)                                     |
| OQ3 | Which evidence establishes Client acceptance, and who confirms that it suffices?                                                                 | DEC-116 lists evidence forms only; S04-Q26 not mapped                                                                                                 | Simulated evidence confirmed by a Company Offer Approver holder (P13)                                                    |

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

### 18.15 Delivery sequence and exclusions

Ordered vertical slices O1–O7, tracked under [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290). Their implementation issues are created separately once their blockers close.

| Slice | Observable outcome                                                                                                   | Introduces                                                                                                                                  | Blocked by                                                                                                                            | Proofs (18.14)              |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| O1    | Create an Offer and its first complete version from one Snapshot for a named entity; read it from the Request detail | Company Offer Preparer v1 and its grant events; primary-entity projection; illustrative reference; `offer.created`, `offer_version.created` | Pricing Snapshot slice R3B3 ([Pricing PRD §15](release-3-illustrative-pricing-prd.md#15-delivery-boundary)); #393 additional entities | 2–4, 10–16 for its commands |
| O2    | Render the illustrative representation of an exact version                                                           | Template Version v1 and checksum                                                                                                            | O1                                                                                                                                    | 7, except checksum matching |
| O3    | Run and review Quality Checks                                                                                        | Rule set v1                                                                                                                                 | O1                                                                                                                                    | 5                           |
| O4    | Approve or reject an exact version                                                                                   | Company Offer Approver v1 and its grant events; `offer_version.approved`, `offer_version.rejected`                                          | O2, O3                                                                                                                                | 6                           |
| O5    | Record a simulated transmission                                                                                      | `offer_version.transmission_recorded`                                                                                                       | O4                                                                                                                                    | 7, 8                        |
| O6    | Record a simulated Client response                                                                                   | `offer_version.client_response_recorded`                                                                                                    | O5                                                                                                                                    | 1, 8                        |
| O7    | Negotiate through a new version with visible differences                                                             | Create Offer Version and the differences view                                                                                               | O1; its after-approval and after-transmission cases need O4 and O5                                                                    | 9                           |

O7 may follow O1 in parallel with O2–O6; whichever lands later inherits the other's rules, as in section 17.6. Requests captured with a Client already satisfy O1; associating a Client after capture is an optional R3A path, not a blocker.

Excluded from R3C here: Contracts (R3D), real Templates, clauses and variants, real prices, discounts and adjustments ([Pricing PRD §14](release-3-illustrative-pricing-prd.md#14-exclusions)), approval thresholds, approved exceptions and overrides, official numbering, real transmission channels, delivery receipts, recipient Contacts, e-signature, real acceptance evidence, withdrawal, validity extension, Offer-level next steps, deadlines and reminders (S04-Q08 and S04-Q09 Partial; the Opportunity next action remains the follow-up record), Opportunity outcome changes, referenced Documents, stored files and Document Registry entries, Company-wide Offer lists and dashboards, Activity projection of Offer events, export, deletion and AI assistance.

## 19. Approved provisional Opportunity reassignment (#399)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides how an Opportunity's responsible actor changes inside its responsible Company; transfer between Companies stays excluded (S04-Q06 is not mapped).

### 19.1 Outcome and permission

A holder of captured **Company Opportunity Manager v1** ([authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families)) working in the server-validated active Company replaces the responsible actor of a Company-owned Opportunity with an eligible member of the same Company. Detail and list show the new responsible actor after reload and restart. `commercial.opportunity.assign` is effective only while the same actor also holds live captured Commercial Intake read (`commercial.request.read`, `commercial.opportunity.read`) and Company context in that Company; partial authority returns the safe denial. Authority is not ownership: holding the bundle does not make its holder responsible, and being responsible grants no permission.

### 19.2 Eligibility

An eligible member is an active Internal User with an active same-Workspace membership, effective Company context and live captured Commercial Intake read in the Opportunity's Company. Access owns this rule and a narrow query returning only membership identifiers and display labels, never email, unrelated members, counts or exclusion reasons; an empty result is valid. A new responsible actor is revalidated inside the command, including a directly submitted identifier, serialized with suspension and revocation of the actor and the target. Every rejected target returns one uniform unavailable response. A responsible actor who later loses eligibility stays recorded and displayed, gains nothing and may be replaced.

### 19.3 Command, version and receipt

The command carries the Opportunity identifier, the observed Opportunity version, an idempotency key and exactly one business field, the new responsible membership. An Opportunity always has exactly one responsible actor; the command cannot clear it. It shares the Opportunity version with section 16 and applies the section 16.4 expected-version, durable receipt, replay-before-staleness, revocation, changed-payload and concurrency rules in its own key space. Submitting the current responsible actor is a no-op that still passes authority, visibility and expected-version checks and stores an unchanged receipt. A material change commits the new responsible actor, the incremented version, the last-mutation attribution, the receipt and one event atomically. Next action, status, title, scope, Request, Client association and Company never change through it.

### 19.4 Activity

One material change records one `opportunity.responsible.changed` event attributed to the acting membership, scoped to the responsible Company and targeting the Opportunity. Its metadata is exactly the resulting Opportunity version and the previous and new responsible actor, each as a membership identifier and the display label captured at the change; it contains no email, next-action or request content. Rejected commands, safe denials, no-ops and exact replays record none. Section 17.3 owns its projection.

### 19.5 Interface, exclusions and unresolved ambiguity

The Request detail offers the change only with the permission and its prerequisites, lists eligible members and applies the section 16.6 editor states, with at most one Opportunity editor open at a time. Excluded: transfer between Companies, choosing a responsible actor other than the creator at capture, multiple or role-specific responsible actors, acceptance by the new responsible actor, notifications, reminders, bulk reassignment and any effect on Tasks, pricing, Offers or Contracts. Unresolved and not presented as business fact: who should decide a reassignment (S04-Q06; default: whoever the administrator grants the bundle, provisionally Iurie's memberships), and whether a handover should force the next action to be revisited (default: no).
