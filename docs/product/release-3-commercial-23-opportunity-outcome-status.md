# PRD — Release 3 Commercial Workflow, section 23: Approved provisional Opportunity outcome status (SO-2)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 23. Approved provisional Opportunity outcome status (SO-2)

This section normalizes one reversible MVP execution choice under the provisional authority of sections 1 and 15. It is not confirmed Iurie business policy. It decides how an authorized user changes the durable outcome status of an Opportunity, finds it again and consults its history. Configurable Sales Stages are a separate contract and are not decided here (DEC-104).

Sources:

- decision record §14.3 and DEC-104: the six stable statuses, separate from the configurable stage; §14.15: dashboards derive meaning from durable status and dates;
- section 7: R3A1 creates `OPEN`; sections 16 and 21 keep status immutable through their commands;
- section 18.4: Create Offer already refuses a non-`OPEN` Opportunity with `OPPORTUNITY_NOT_OPEN`; section 18.8: Client acceptance changes no Opportunity status; section 19.4: a direct Contract creation is refused with `OPPORTUNITY_CLOSED` once this slice defines lost, disqualified and archived Opportunities;
- Sarcina M03-R105 (a refusal keeps its confirmed reason; correction adds history) and M03-R106 (actor, time and before/after values are kept);
- issue #81 session 8 (S04-Q27, Partial): postponed (“amânată”) is distinct from refused; loss reasons “Preț, Termen, Concurent, Lipsă buget, Amânare, Renunțare, Alt motiv”; the reason may be unknown and the final list may become configurable;
- issue #81 sessions 1, 40 and 101 (S04-Q40): Iurie decides commercial offering questions; where he named no authority, his approval is the conservative default (Project/Task PRD §23 precedent).

The meanings, transitions, permission name, reason rules and downstream refusals below are delegated provisional choices. Iurie validates them against a demonstration.

### 23.1 Statuses and meanings

An Opportunity has exactly one outcome status:

| Status         | Provisional meaning                                                                                 | Open or closed |
| -------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| `OPEN`         | The Company is pursuing the case.                                                                   | Open           |
| `ON_HOLD`      | Postponed by the Client or the Company; expected to resume.                                         | Open           |
| `WON`          | A person with authority declares that the Client committed to the work.                             | Closed         |
| `LOST`         | The Client did not proceed (refused, chose a competitor, no budget, gave up, or unknown).           | Closed         |
| `DISQUALIFIED` | The Company decided not to pursue the case (out of scope, not serviceable, not a genuine request).  | Closed         |
| `ARCHIVED`     | Closed without a commercial result worth reporting (duplicate, entered by mistake, never answered). | Closed         |

`WON` is a declaration, not a computed fact. An Accepted Offer or an executed Contract never changes the status automatically, and neither is required to declare `WON`, because a governed direct Contract (section 19.3) has no Offer. A status is not a Sales Stage and never selects one.

### 23.2 Transitions

No other transition exists. The server derives the transition from the current status and the requested status.

| Transition | From → to                                            | Required input                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------ |
| Hold       | `OPEN` → `ON_HOLD`                                   | A reason                                         |
| Resume     | `ON_HOLD` → `OPEN`                                   | —                                                |
| Win        | `OPEN` or `ON_HOLD` → `WON`                          | —                                                |
| Lose       | `OPEN` or `ON_HOLD` → `LOST`                         | A loss reason code; a note, required for `OTHER` |
| Disqualify | `OPEN` or `ON_HOLD` → `DISQUALIFIED`                 | A reason                                         |
| Archive    | `OPEN` or `ON_HOLD` → `ARCHIVED`                     | A reason                                         |
| Reopen     | `WON`, `LOST`, `DISQUALIFIED` or `ARCHIVED` → `OPEN` | A reason                                         |

Reopen exists so that a mistaken closure or a returning Client is corrected by new history instead of rewriting the old one (M03-R105). Requesting the current status, or any pair outside the table, returns `409 OUTCOME_TRANSITION_NOT_ALLOWED` and changes nothing.

**Loss reason codes**, from session 8: `PRICE`, `DEADLINE`, `COMPETITOR`, `NO_BUDGET`, `POSTPONED`, `CLIENT_WITHDREW`, `OTHER`, `UNKNOWN`. The list is fixed in this slice; making it configurable is deferred. `OTHER` requires a note that states the actual reason, so a known reason is never reduced to a generic code; `UNKNOWN` needs none.

**Reasons and notes** follow the section 16.3 text rule: 1–500 characters with at least one non-whitespace character, stored exactly as submitted. A field that the transition does not accept must be absent; supplying it returns field validation.

**Dates.** The server records the transition time. The Opportunity exposes its current status and the time it entered that status. A user-entered effective date is deferred. Every existing Opportunity has been `OPEN` since its creation because no earlier command could change its status, so the migration sets its status-entered time to its capture time; no other historical value is derived and no history entry is created for that initial state.

### 23.3 Permission

The [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns captured **Company Opportunity Manager v2**, whose permission set is v1 plus `commercial.opportunity.outcome.change`. Existing v1 assignments never expand in place; only an explicit revocation followed by a fresh grant captures v2, and null or unknown captured versions fail closed. As in section 21.1, the permission is effective only while the same actor also holds live captured Commercial Intake read (`commercial.request.read`, `commercial.opportunity.read`) and Company context in that Company; partial authority returns the safe denial.

First-tenant configuration grants the bundle only to Iurie's memberships. Authority is not ownership: the responsible actor gains nothing from being responsible. Reading the status, the time it was entered and the outcome history requires only Commercial Intake read in the responsible Company.

### 23.4 Command, version and receipt

The command carries the Opportunity identifier, the observed Opportunity version, an idempotency key, the requested status and the transition's reason fields. It shares the Opportunity version with sections 16 and 21 and applies the section 16.4 expected-version, durable receipt, replay-before-staleness, revocation, changed-payload and concurrency rules in its own key space. Because requesting the current status is refused, the command has no no-op outcome.

A committed transition atomically updates the status, the time it was entered, the incremented version and the last-mutation attribution, and records one history entry, the receipt and one event. Title, scope, Request, Client association, next action, responsible actor and Company never change through it.

The Opportunity row lock already taken by Offer creation (section 18.4) and direct Contract creation serializes them with this command, so a closing transition and a concurrent creation commit in one consistent order.

### 23.5 Effects on other commands

| Command                                                                         | Effect of the outcome status                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Create Offer (section 18.4)                                                     | Unchanged: any status other than `OPEN` returns `409 OPPORTUNITY_NOT_OPEN`.                                      |
| Create a governed direct Contract (section 19.3)                                | `LOST`, `DISQUALIFIED` or `ARCHIVED` returns `409 OPPORTUNITY_CLOSED`. `OPEN`, `ON_HOLD` and `WON` are accepted. |
| Next action (section 16) and reassignment (section 21)                          | Unchanged in every status.                                                                                       |
| Every other Offer, Contract, Precontract, Addendum, Project and pricing command | Status is neither checked nor changed.                                                                           |

An exact replay of a direct Contract creation committed before the closure returns its recorded receipt after current-authority revalidation; only a new creation is refused. Existing Offers and Contracts keep their states when the Opportunity closes; closing never withdraws, cancels or expires them.

### 23.6 History and Activity

Each committed transition records one durable history entry: previous and new status, loss reason code, reason or note text, resulting version, acting membership with its display label captured at the change, and server time. The Request detail returns the 50 most recent entries newest first, with an opaque cursor; an outcome-history read returns each older page of at most 50 entries from that cursor, so every entry and its text stays consultable. Both reads require only Commercial Intake read in the responsible Company and apply the same safe not-found. Entries are never edited or deleted.

One committed transition records one `opportunity.outcome.changed` event attributed to the acting membership, scoped to the responsible Company and targeting the Opportunity. Its metadata is exactly the resulting version, the previous and new status and the loss reason code when present; it contains no reason or note text. Section 17.3 projects it under the same rules as the other Opportunity actions, returning the previous and new status and the loss reason code. Rejected commands, safe denials and exact replays record nothing.

### 23.7 Interface, errors and acceptance

The Request detail shows the current status and the time it was entered, and the Request list shows the status of each row. Holders of the permission see a change control that offers only the transitions permitted from the current status and asks for exactly the required fields. It applies the section 16.6 editor states and shares the one-open-editor rule with the next-action, reassignment and Client-association editors. The outcome history is visible below the status. Desktop and narrow layouts inherit the UX PRD.

Errors: missing identity `401`; missing or legacy bundle, missing prerequisite or invalid Company `403`; unknown, cross-Company or cross-Workspace Opportunity returns the section 16.6 safe not-found; invalid or missing fields return field validation; `STALE_VERSION`, `IDEMPOTENCY_CONFLICT` and `OUTCOME_TRANSITION_NOT_ALLOWED` are safe conflicts.

The highest stable seam is the public REST interface against PostgreSQL, then the browser journey. Acceptance proves each transition and its required fields, refused pairs, persistence after reload and restart, the history entry and event with their exact metadata and no free text, the projection, stale-version and changed-payload conflicts, exact-replay convergence after revalidation, revocation and v1-only denial, Company and Workspace isolation, atomic rollback, the unchanged Offer gate in every non-`OPEN` status and the `OPPORTUNITY_CLOSED` direct Contract refusal, plus desktop and narrow views.

### 23.8 Provisional choices, exclusions and open questions

Provisional choices for Iurie's validation:

- only Iurie holds Company Opportunity Manager v2;
- the meanings of `DISQUALIFIED` versus `ARCHIVED`, and archiving only open cases;
- `WON` declared without requiring an Accepted Offer or a Contract;
- the fixed loss reason list, with `UNKNOWN` and `OTHER`;
- reopening any closed status with a reason;
- no effect on existing Offers or Contracts, and no restriction of next action or reassignment.

Excluded: Sales Stages; automatic status changes from Offers, Contracts or Projects; user-entered effective dates; reminders for held Opportunities; configurable reason lists; list filters by status beyond the single fixed current-self open-case view in [section 8.4](release-3-commercial-workflow-prd.md#84-create-read-reload-and-concurrency); dashboards, conversion reports and forecasting; bulk changes; deletion; transfer between Companies.

Open and not presented as business fact: whether `WON` should later require an Accepted Offer or a signed Contract; whether closing should withdraw open Offers; who besides Iurie may close or reopen an Opportunity; and which disqualification reasons Iurie uses (S04-Q07 was never asked).
