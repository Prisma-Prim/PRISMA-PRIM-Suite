# PRD — Release 3 Commercial Workflow, section 24: Approved provisional configurable Sales Stage (SO-2)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 24. Approved provisional configurable Sales Stage (SO-2)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides how an authorized user configures a Company's Sales Stages and how an authorized user assigns one to an Opportunity. It is independent of the outcome-status contract (section 23): the outcome status and the stage never change each other, and either contract may be delivered first.

Sources:

- decision record §14.3 and DEC-104: tenant-specific commercial steps are configurable stage definitions, separate from the stable status; the example labels (qualification, technical review, pricing, offer preparation, negotiation) are examples, not mandatory stages;
- decision record §18.1 and §18.4, DEC-037 precedent and the [UX/Configuration PRD](ux-localization-configuration-prd.md#8-configuration) §8: typed, bounded configuration with stable identifiers, preview of high-impact changes, Activity attribution and new versions instead of silent rewriting; a changed label never changes stored meaning;
- section 7: R3A1 creates no sales stage; sections 16 and 21 never change it, and neither does the outcome-status command;
- issue #81 session 92 (S04-Q08, Partial): example follow-up steps “apel client, clarificare, negociere, așteptare răspuns, pregătire contract”; session 11: probability may vary by commercial stage, which is excluded here;
- MASTER §9: stages are configurable and may differ by service type (stated for Projects; service-type variation is deferred here).

The scope, permissions, operations, limits and history rules below are delegated provisional choices. Iurie validates them against a demonstration.

### 24.1 Sales Stage definition

A Sales Stage belongs to exactly one Company. It has:

- a stable server-generated identifier, which carries the stage's meaning;
- a label: 1–80 characters with at least one non-whitespace character, stored exactly as submitted; unique within the Company ignoring case, including retired stages;
- a position in the Company's ordered list;
- a state, `ACTIVE` or `RETIRED`.

A Company starts with no stage. No default, seed or migration creates one, and an Opportunity without a stage is valid. A Company holds at most 30 stages. Workspace-wide defaults, per-service-type stage lists and probabilities are deferred.

**Labels and localization.** A stage label is tenant terminology, which decision record §18.1 distinguishes from product copy: the Company writes it in its own working language and every interface locale displays it as entered, like a Client or Project name. The surrounding product copy (headings, states, errors, the retired marker) is localized in the four interface locales. Per-locale variants of one tenant label are deferred; adding them later attaches translations to the same identifier and changes no stored meaning.

### 24.2 Configuration operations

| Operation | Effect                                                                                     | Constraint                                   |
| --------- | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Create    | Adds an `ACTIVE` stage at the end of the list.                                             | Label rules; at most 30 stages               |
| Rename    | Corrects the wording of the same step; the identifier and every assignment stay unchanged. | Label rules; a different label; impact shown |
| Move      | Places the stage at a new position; the others keep their relative order.                  | A position inside the list; a different one  |
| Retire    | `ACTIVE` → `RETIRED`: the stage can no longer be newly assigned.                           | Impact shown                                 |
| Restore   | `RETIRED` → `ACTIVE`.                                                                      | —                                            |

**Rename keeps meaning.** Rename exists only to correct how the same step is worded (a typo, a clearer term). The stage's meaning is its identifier, and every assigned Opportunity stays on that step. A different step is a new stage: create it, move the Opportunities that belong there, and retire the old one; each moved Opportunity then records its own stage change. Because the current assignment displays the current label, Rename is a high-impact change: before committing, the interface shows the old and new label and the number of Opportunities currently assigned to the stage, and the user confirms. The configuration event records both labels, and Opportunity history keeps the label captured at each assignment (section 24.5).

**Retire keeps assignments.** A stage is never deleted. Retiring leaves every current assignment in place; such an Opportunity shows the stage with a retired marker until someone assigns another stage or clears it. Before committing, the interface shows the number of Opportunities currently assigned to the stage, and the user confirms.

**Revision and guarantees.** The Company's stage list has one configuration revision: 0 before any operation, incremented by every committed operation. The stage-list read returns the current revision with the stages, including revision 0 and an empty list for a Company without stages. Each operation carries the observed revision and an idempotency key, and applies the section 16.4 expected-version, durable receipt, replay-before-staleness, revocation, changed-payload and concurrency rules in its own key space. A stale revision returns `STALE_CONFIGURATION`; the client reloads the list and its revision before an explicit retry. A rename to the same label, a move to the same position, retiring a retired stage or restoring an active one returns `409 SALES_STAGE_UNCHANGED` and commits nothing; a duplicate label returns field validation `SALES_STAGE_LABEL_TAKEN`; a 31st stage returns `409 SALES_STAGE_LIMIT`. The impact count shown before Rename or Retire is informative; the command itself is guarded by the revision.

### 24.3 Permissions

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns two captured additions. Both are effective only while the same actor also holds live captured Commercial Intake read (`commercial.request.read`, `commercial.opportunity.read`) and Company context in that Company; partial authority returns the safe denial. Null or unknown captured versions fail closed, and existing assignments never expand in place.

- **Company Sales Stage Configuration v1**, exactly `commercial.sales_stage.configure`: an independent opt-in bundle for the section 24.2 operations, granted and revoked through the existing Company assignment administration. Its assignment lifecycle is exactly `company_sales_stage_configuration_assignment.granted` and `company_sales_stage_configuration_assignment.revoked`, under the same convention, bundle-label-only metadata, one-event-per-actual-state-change rule and administration visibility as the other opt-in bundles. First-tenant configuration grants it only to Iurie's memberships.
- **Company Commercial Intake v4**: v3 plus `commercial.opportunity.stage.set`. Every check that accepts v3 also accepts v4, so a fresh v4 grant keeps every v1–v3 permission. Assigning a stage is routine commercial follow-up, like the next action (section 16.2), so any holder of the captured v4 bundle in the responsible Company may assign or clear a stage. Only revocation followed by a fresh grant captures v4.

Reading the stage list with its revision, an Opportunity's current stage and its stage history requires only Commercial Intake read in the responsible Company.

### 24.4 Assigning a stage to an Opportunity

The command carries the Opportunity identifier, the observed Opportunity version, an idempotency key and exactly one business field: an `ACTIVE` stage identifier of the Opportunity's Company, or null to clear the stage. It shares the Opportunity version with sections 16, 21 and 23 and applies the section 16.4 rules in its own key space. Submitting the current stage, or null when no stage is assigned, is a no-op that still passes authority, visibility and expected-version checks and stores an unchanged receipt without an event.

A retired, unknown or other-Company stage returns one uniform `409 SALES_STAGE_UNAVAILABLE`. The stage's state is read under a lock that serializes assignment with retirement, so no assignment commits to a stage retired in the same instant.

A material change atomically updates the stage, the incremented version and the last-mutation attribution, and records the history entry, the receipt and one event. Status, title, scope, Request, Client association, next action, responsible actor and Company never change through it. The command is accepted in every outcome status. No Offer, Contract, pricing or Project command reads or changes the stage.

### 24.5 History and Activity

Each material assignment records one durable history entry: previous and new stage identifiers with the labels captured at the change, the resulting Opportunity version, the acting membership with its captured display label, and server time. The Request detail returns the 50 most recent entries newest first, with an opaque cursor; a stage-history read returns each older page of at most 50 entries from that cursor. Both reads require only Commercial Intake read in the responsible Company and apply the same safe not-found.

Events, each attributed to the acting membership and scoped to the Company:

- `opportunity.stage.changed`, targeting the Opportunity, with metadata exactly the resulting version and the previous and new stage, each as identifier and captured label or null;
- `sales_stage.configured`, targeting the stage, with metadata exactly the operation (`CREATED`, `RENAMED`, `MOVED`, `RETIRED`, `RESTORED`), the resulting configuration revision, the label after the operation, the previous label for `RENAMED`, and the previous and resulting position for `MOVED`.

Section 17.3 projects both events under its rules. `opportunity.stage.changed` follows the other Opportunity actions and returns the previous and new stage labels. `sales_stage.configured` is projected to an actor who holds `commercial.activity.read` and Commercial Intake read in that Company; it returns the operation, the labels and the positions it carries, not the revision, and its target is the Company's stage settings view. Rejected commands, safe denials, no-ops and exact replays record nothing.

### 24.6 Interface, errors and acceptance

A Sales Stage settings view in the active Company lists the stages in order with their state, using the revision returned by the list read. Holders of the configuration bundle create, rename, move, retire and restore stages there, with the impact confirmation of section 24.2 for Rename and Retire; other Commercial Intake readers see the list read-only. The Request detail shows the current stage, with a retired marker when applicable, and its history; the Request list shows the stage of each row. Holders of `commercial.opportunity.stage.set` choose among `ACTIVE` stages in order, or clear the stage, through an editor that applies the section 16.6 states and the one-open-editor rule. With no stage configured, the editor explains that a configuration holder must create one first.

Errors: missing identity `401`; missing or legacy bundle, missing prerequisite or invalid Company `403`; unknown, cross-Company or cross-Workspace Opportunity or stage returns the section 16.6 safe not-found or `SALES_STAGE_UNAVAILABLE`; the conflicts named above.

The highest stable seam is the public REST interface against PostgreSQL, then the browser journey. Each delivered slice proves its own operations:

- **First slice (Create and assignment).** From an empty Company at revision 0: create two stages, assign one to an Opportunity, reload, change it, clear it, and consult the stage history and the projected events. Also prove a stale revision, an unknown or other-Company stage, authority and revocation, v3-only denial with the full v1–v3 behaviour of a v4 holder, the configuration bundle lifecycle events, Company and Workspace isolation, replay behaviour, and desktop and narrow views.
- **Each later operation (Rename, Move, Retire, Restore).** Prove the operation, its impact confirmation where required, its event metadata, that existing assignments and captured history are preserved, and, for Retire, that the retired stage stays displayed with its marker and can no longer be assigned.

### 24.7 Delivery order, provisional choices and exclusions

A first complete slice may deliver Create, assignment, clearing, history, the reads and the configuration bundle. Rename, Move, Retire and Restore may follow as separate complete outcomes because, until they exist, no operation can make an assignment unintelligible. Each later operation must preserve every rule above.

Provisional choices for Iurie's validation:

- stages are configured per Company, with no default list;
- only Iurie configures stages, while every Commercial Intake v4 holder assigns them;
- labels are tenant terminology shown as entered, unique, at most 30 stages, and no deletion;
- Rename corrects wording only, with impact confirmation; a different step is a new stage;
- a retired stage stays on its current Opportunities;
- assignment is independent of the outcome status.

Excluded: default or seeded stages; Workspace-wide or per-service-type lists; per-locale variants of a stage label; probabilities, weighting, forecasting and pipeline reports; automatic stage movement from Offers, Contracts or the outcome status; required stages before a status change; reminders; bulk assignment; deletion.

Open and not presented as business fact: Iurie's actual stage vocabulary (S04-Q08 is Partial); whether stages differ by service type; whether closing an Opportunity should clear or freeze its stage.
