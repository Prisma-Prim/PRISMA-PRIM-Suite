# PRD — Release 3 Commercial Workflow

**Status:** Provisional MVP execution scope — business validation pending  
**Version:** 0.2\
**Owner:** Dan Popescu  
**Release:** 3  
**Decisions:** DEC-023–DEC-026, DEC-100–DEC-123, DEC-125, DEC-128–DEC-129, DEC-132–DEC-134 and DEC-140\
**Owner direction:** [Dan, 2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981)  
**Illustrative fixed-discount amendment:** [Agent normalization under Dan's standing MVP direction, 2026-09-27, #454](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/454)\
**Deferred business validation:** [Iurie, after a demonstrable MVP](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/288#issuecomment-5749968989)

## Sections by capability

Sections 1–15 are below. Each later section is its own file, with its original numbering:

- [Section 16. Approved provisional Opportunity next-action update (#306)](release-3-commercial-16-opportunity-next-action.md)
- [Section 17. Approved provisional Company commercial Activity read (#306)](release-3-commercial-17-commercial-activity-read.md)
- [Section 18. R3C provisional Offer execution contract (#394)](release-3-commercial-18-offers.md)
- [Section 19. R3D provisional Contract execution contract (#403)](release-3-commercial-19-contracts.md)
- [Section 20. Approved provisional one-time Client association after Request capture (#450)](release-3-commercial-20-client-association.md)
- [Section 21. Approved provisional Opportunity reassignment (#399)](release-3-commercial-21-opportunity-reassignment.md)
- [Section 22. Controlled commercial evidence October 2026 (#493)](release-3-commercial-22-controlled-evidence-2026-10.md)
- [Section 23. Approved provisional Opportunity outcome status (SO-2)](release-3-commercial-23-opportunity-outcome-status.md)
- [Section 24. Approved provisional configurable Sales Stage (SO-2)](release-3-commercial-24-sales-stages.md)
- [Section 25. Approved provisional Offer and Contract history in the commercial Activity Log (HI-4)](release-3-commercial-25-offer-contract-history.md)
- [Section 26. Approved-estimate internal Offer preparation (#840)](release-3-commercial-26-estimate-offer-preparation.md)
- [Section 27. Company consulting Offer model (#845)](release-3-commercial-27-company-offer-model.md)

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
9. As a commercial manager, I want to record that an Opportunity is on hold, won, lost, disqualified or archived, with its reason, and to reopen it, so that the Company knows which cases are still pursued and why the others ended; every change stays in a consultable history (section 23).
10. As a commercial manager, I want to define my Company's own Sales Stages, and as a commercial user I want to place an Opportunity on one of them, so that the team sees where each case stands in our practice without changing its outcome status; renamed or retired stages stay intelligible in the history (section 24).
11. As a commercial manager, I want to read in the Activity Log who prepared, approved, sent, accepted and signed each Offer and Contract, and open the exact version concerned, so that a commercial case can be followed and proven without opening every record (section 25).

## 6. Release boundary

- **R3A — Intake and Opportunity:** Request evidence, Client association, Company ownership, assessment, responsibility and next actions.
- **R3B — Catalogue and deterministic pricing:** shared Service definitions, Company offerings, versioned Tariffs and rules, calculations, adjustments and immutable snapshots. Its first slices — the shared Service Definition and Company Service Offering, the effective-dated Tariff and Pricing Rule Versions, and the immutable Pricing Snapshot that references them exactly — are owned by the [Release 3B Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md).
- **R3C — Offers:** complete versions, generated artifacts, deterministic checks, approval, transmission, response evidence and negotiation history.
- **R3D — Contracts:** controlled origins, versions, legal content, signature evidence, post-signature instruments and Project creation or linking.

This PRD decides the complete R3A1 contract below. Later R3A changes and R3B–R3D retain the inherited boundaries above. Before a later vertical issue is marked ready, its observable fields, permissions, transitions and acceptance cases are normalized into this PRD; the issue then links to that authority instead of becoming a second specification. [Section 18](release-3-commercial-18-offers.md#18-r3c-provisional-offer-execution-contract-394) normalizes the provisional R3C Offer contract and its ordered slices. [Section 19](release-3-commercial-19-contracts.md#19-r3d-provisional-contract-execution-contract-403) normalizes the provisional R3D Contract contract and its ordered slices. [Section 20](release-3-commercial-20-client-association.md#20-approved-provisional-one-time-client-association-after-request-capture-450) normalizes the one-time association of an existing authorized Client Account after Request capture.

## 7. Core lifecycle and invariants

- Client Request and Opportunity are distinct. One Request may yield no Opportunity or several Opportunities; every Opportunity has one responsible Company.
- R3A1 creates exactly one Company-owned Request and one same-Company initial Opportunity atomically.
- A captured Request starts at version 1 whether it has an original Client reference or not. Only a version 1 Request whose stored original Client reference is absent may make the one-time transition in section 20 to version 2 with a Client reference.
- Opportunity durable status and configurable sales stage remain separate. R3A1 creates status `OPEN` and no sales stage. Section 23 owns outcome status changes, and section 24 owns configurable Sales Stages.
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

**Provisional My open cases view.** On 2026-10-21 coordinating root approved one
bounded read extension under Dan's delegated safe-Sarcina scope. All Requests
remains the default. The only optional view value is `view=mine_open`; omission
retains the current all view. Invalid, empty, repeated or non-scalar view values
fail. The server compares the initial Opportunity entity's current
`responsibleWorkspaceMembershipId` with the current authorized actor's
`workspaceMembershipId`, and selects only current `OPEN`/`ON_HOLD` statuses
(section 23.1), inside the existing Workspace, active-Company and captured
Commercial Intake read boundary. It does not use capture creator, historical
snapshot, label, email or a caller-selected member. Reassignment (section 21)
changes inclusion on a fresh read; responsibility grants no authority.

Apply that fixed predicate before the unchanged capture-time/Request-ID order,
positional cursor and limit. Default 25/max 50, limit+1 continuation, response
fields, limit/cursor validation and permission-filtered Client projection remain
unchanged. Cursors still encode the exact UTC capture timestamp with six
fractional digits and UUID Request ID; they are positional boundaries, not
view/Company/actor credentials. The view adds no count, metadata, ranking or
generic status/actor query. Subsequent pages are current reads, not a frozen
snapshot across reassignment or other mutations.

Changing view retires list/older-page replies and resets loaded pages/cursors,
while preserving the selected detail, existing create/edit drafts, one-open-editor
rule and uncertain commands' exact payload/version/key. Existing Client-dossier
restriction and loaded-text-filter meanings remain unchanged. A detail that
leaves this list remains readable under its current owning authority; this view
is never a detail or command authorization rule. Company/session/membership or
permission invalidation retains its existing scoped-state and late-reply rules.

The user opens the exact existing Request detail, deliberately saves its next
action through section 16 when separately authorized, and reloads the stored
result. Intake-v1 readers gain no update authority; existing v2/v3/v4 permission
evaluation is unchanged. Reads create no event/version/receipt/Client fence.
No date, Task, reminder, automatic transition, reassignment or wider dashboard
is introduced. Four-locale copy/state, accessible Prisme controls and actual
desktop/narrow proof remain required. Public REST proves the exact current-self
open set and complete pagination; real App/PostgreSQL browser proof covers
save/reload, read-only v1, uncertain retries and retired list replies.

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

The separate [Confirmed-Cost Profitability Estimate PRD](release-3-confirmed-cost-profitability-estimate-prd.md) owns the approved bounded manual-cost extension under #497: an internal Opportunity estimate with immutable versions and exact Director decisions. It introduces no Offer handoff, pricing-policy automation or change to existing illustrative Snapshots. Product approval is separate from runtime delivery.

R3C consumes one immutable Pricing Snapshot and exact Template/condition versions. Quality-check errors block progression; warnings require an attributable acknowledgement or approved exception. Negotiation creates a new Offer Version. Provisional artifacts may complete the same internal workflow with visibly simulated transmission and acceptance evidence; only real transmission and real Client acceptance require approved configuration and configured governed evidence. [Section 18](release-3-commercial-18-offers.md#18-r3c-provisional-offer-execution-contract-394) owns the provisional R3C execution contract.

R3D supports accepted-Offer, governed direct, import and renewal origins. A provisional Contract may exercise approval and signature-recording with clearly simulated evidence through the same states, while remaining ineligible for real execution or operational authority. Real Contract approval, execution and later instruments require approved legal content, configured evidence and authority. Project linking searches authorized existing Projects and requires explicit confirmation; it never creates a duplicate blindly.

[Section 19](release-3-commercial-19-contracts.md#19-r3d-provisional-contract-execution-contract-403) owns the provisional R3D execution contract, including the Precontract, the Addendum and the first Contract–Project link rule.

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
