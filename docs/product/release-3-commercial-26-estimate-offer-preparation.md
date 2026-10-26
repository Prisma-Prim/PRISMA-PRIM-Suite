# PRD — Release 3 Commercial Workflow, section 26: approved-estimate internal Offer preparation (#840)

Part of the [Commercial Workflow PRD](release-3-commercial-workflow-prd.md).

## 26. Bounded approved-estimate internal Offer preparation

**Status:** Approved provisional product contract; runtime delivered through [#842](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/842).\
**Owner:** Dan Popescu.  
**Origin:** [#840](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/840), D6 under the [source-backed consulting pilot #820](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/820).

Dan's 2026-10-24 direction authorizes continuing with D6: deliberately prepare an internal Offer draft from one exact Director-approved Profitability Estimate Version. The bounded conventions below normalize that direction under the standing provisional MVP delegation in [Commercial Workflow §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose). They are product conventions for this internal journey, not new Iurie evidence, fiscal policy, approval of operational legal content or authority to send an Offer.

The [Profitability Estimate PRD](release-3-confirmed-cost-profitability-estimate-prd.md) owns the source amounts, exact arithmetic, immutable Versions and separate Director decisions. [Offer §18](release-3-commercial-18-offers.md) owns Offer identity, recipient, ordinary versioning and the existing illustrative Snapshot route. This section owns their new compatibility only. Authorization, Activity Log, Client, UX and Platform owners retain their independent boundaries.

### 26.1 Problem and complete outcome

An approved internal Profitability Estimate currently cannot supply an Offer: the estimate has no handoff, and existing Offers require an illustrative Pricing Snapshot. Retyping the amount loses its exact approval provenance. Substituting a fabricated illustrative Snapshot would misrepresent the source.

The authorized preparer selects an exact approved Version, reviews its proposed commercial amount and currency, deliberately creates the Offer's first internal draft or an explicit successor Version, and reloads its frozen content and source. A later estimate, Director decision or permission change never rewrites that Offer Version. The draft remains internally identifiable and readable through the existing Offer owner.

This delivery does not interpret the proposed commercial amount as tax-exclusive net or tax-inclusive gross. Its tax treatment is explicitly **unspecified**. It neither treats an internal fiscal-cost input as sales tax nor introduces a zero-tax assumption. A later approved compatibility slice must resolve price/tax meaning and operational content before this source can support external execution.

### 26.2 User stories

1. As a Company assignment administrator, I explicitly enable or revoke this handoff without widening earlier captured grants.
2. As an authorized preparer, I select one exact approved Estimate Version and review its amount, currency and source identity before creating a draft.
3. As a preparer holding only ordinary Offer authority, I retain the existing illustrative Snapshot journey without gaining estimate access.
4. As a Contributor or Director without Offer preparation authority, I retain my economic work without gaining an Offer command.
5. As a preparer, I may deliberately select an older approved Version even after a later submission; the interface makes the selected Version explicit.
6. As a preparer, I name the readable Client Legal Entity and enter the ordinary draft terms while the server establishes scope and source facts.
7. As an Offer reader without economic read authority, I see the frozen commercial amount and its source stamp without costs, margin, target or strategic rationale.
8. As an independent approver, I can reject the internal draft under the ordinary attributed rejection rule; source approval never becomes Offer approval.
9. As a preparer, I create an explicit successor with its own source and expected Offer revision, preserving every earlier Version.
10. As a user facing an uncertain response, I retry the exact command without duplicate Offer, Version, event or reference allocation.
11. As a user who loses access or changes Company/session, I receive no stale protected source or replay result.
12. As a legacy Offer or Contract user, I reopen and continue earlier illustrative history unchanged.

### 26.3 Identity, source and commercial content

Use the existing Offer identity and Offer Version lineage. There remains at most one Offer per Opportunity, one Company-owned non-official reference and the existing optimistic revision. This is not a second draft entity or a parallel Offer store. The reference remains internal/provisional and never becomes an official number.

An Offer Version has exactly one closed price-source variant:

- **Existing illustrative Pricing Snapshot:** the unchanged §18 Snapshot, Template, Quality Check, representation and simulated lifecycle contracts.
- **Approved-estimate internal draft:** the source stamp and price projection below, with no Pricing Snapshot, illustrative Template binding, Quality Check rule-set binding or generated representation.

Never use a fake Snapshot, zero tax, empty line list or fabricated Template/rule version to make the second variant resemble the first. Unknown price-source kinds or incompatible stored shapes fail closed. An internal draft is explicitly provisional and externally ineligible; it does not claim that its human-confirmed source amount was illustrative.

The server freezes the selected estimate identity, exact Version id and number, exact `APPROVE` decision id and instant, proposed commercial amount and currency. These facts must agree with that immutable same-Workspace/Company/Opportunity source and its decision. No caller-supplied amount, approval code, provenance or actor overrides them. Amounts retain the source's exact scale-2 decimal value; there is no recalculation, conversion, discount or price adjustment. Tax treatment is the closed value `UNSPECIFIED`; net, tax and gross totals are absent rather than zero or inferred.

Only that commercial projection enters Offer content. Executor and fiscal costs, direct-cost lines, overhead, profit, profitability, target, pricing intent and strategic reason remain solely in the economic owner. Full source details require a separate current authorized exact-version read; the Offer grants none.

The ordinary recorded recipient copy, issuing Company label, validity fields, scope note and commercial conditions follow §18.2–18.3, including original Client history and the current Client owner's resolution. An estimate approves an amount for its Opportunity; it does not certify a Client identity or recipient that it never captured.

### 26.4 Independent current authority

The [authorization owner §8](tenant-company-client-authorization-prd.md#8-initial-permission-families) defines **Company Offer Preparer v2**: the four v1 permissions plus exactly `commercial.offer.estimate.prepare`. A new assignment captures v2. Existing active v1, repeated grants and receipts retain v1; upgrading requires explicit revocation followed by a new grant. Unknown/null captured versions fail closed. No assignment or record is backfilled.

Creating an approved-estimate draft or successor requires all of:

1. current active Workspace membership and active Company context;
2. live captured Offer Preparer v2, including ordinary Offer read/preparation and the new handoff permission;
3. independent live estimate read through Contributor v1 or Director v1;
4. current readability of the same Opportunity through its owner; and
5. the ordinary corresponding Offer command's Client, recipient and state prerequisites.

Neither profitability bundle, a Director title, Workspace ownership, Offer Approver v1 nor ordinary Preparer v1 substitutes for those conjunctive prerequisites. v2 grants no estimate read/create/decision, Client or Opportunity visibility, Offer approval, Contract or external authority. A Director who prepares this draft needs the same explicit additional permissions.

Ordinary Offer read remains sufficient to read this Version's commercial projection, subject to its current Opportunity boundary. It does not require or confer cost read. Consequently, revoking estimate read prevents new handoffs and their mutation replays while an otherwise authorized Offer reader can still reopen the already frozen Offer content. Source links perform a separate live authorized read and disclose no hidden cost/history on refusal.

Reject uses only the ordinary Offer Approver and current target prerequisites. Assignment events retain their existing labels and administration visibility. No real tenant assignment is part of implementation or verification.

### 26.5 Commands, states and corrections

The public Offer boundary accepts deliberate first-draft creation from an exact Estimate Version and explicit successor creation with `expectedOfferRevision`. The payload names the source Version id and displayed number, the ordinary recipient and content fields, and the request key. It never selects an implicit latest/approved head or automatically creates a successor when an Offer already exists.

A new handoff requires the exact source's recorded decision to be `APPROVE`. Awaiting, `MODIFY`, `REJECT`, missing or incoherent decisions refuse the command. Later estimate submissions do not revoke an older approval: [Estimate §5.4](release-3-confirmed-cost-profitability-estimate-prd.md#54-immutable-version-and-director-validation) continues to govern each exact Version independently. A mismatched displayed Version number refuses selection rather than choosing another record.

First creation requires the ordinary readable `OPEN` Opportunity, readable active related Client and available recipient. Successor creation follows §18.4 and §18.9, including the original Client fence, expected revision, head lineage and prohibition after any accepted Version. A cross-Company/Workspace or unreadable source is uniformly unavailable before its existence or approval state is disclosed.

The new internal Version starts `PENDING`, `NOT_TRANSMITTED`, Client response `NONE`, with no decision or quality run. Director estimate approval is only its source approval. The following rules are exhaustive:

| Operation on an internal draft                                                                                         | Result                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Read exact Version/history                                                                                             | Frozen commercial content and source stamp, ordinary current Offer/Opportunity read                                      |
| Reject pending head                                                                                                    | Existing independent approver, reason, revision and event rules; the source decision stays unchanged                     |
| Create successor                                                                                                       | Explicit complete ordinary Offer Version command with its own supported source and live authority; no inherited approval |
| Run Quality Checks or approve                                                                                          | Safe `OFFER_INTERNAL_DRAFT_ONLY` refusal; no run, decision, receipt or success event                                     |
| Record transmission or Client response                                                                                 | Same refusal; no simulated or real evidence                                                                              |
| Generate/expose a commercial representation, prepare an accepted-Offer Contract or use pending-Offer early preparation | Ineligible; no fabricated representation or downstream record                                                            |

The ineligibility rule is enforced by the backend even when a caller supplies forged states or bypasses the interface. Existing superseded-head and authorization refusals remain in force. Internal rejection creates no Director `MODIFY`/`REJECT` and does not change the estimate.

Correction never edits content or re-points a source. The preparer creates a new complete Version with a deliberately chosen supported price source. Switching from an illustrative Version to an internal one, or later explicitly back to a newly selected illustrative Snapshot, preserves both exact histories and confers only the new Version's own source semantics. An illustrative successor does not inherit an estimate approval/provenance or turn its predecessor into an eligible Contract source. Old accepted Offers refuse any successor as before.

### 26.6 Atomicity, retries and concurrency

Inherit §18.11's actor/Workspace/Company command receipts, full exact-intent fingerprint, optimistic revision, original Client operational-use fence and server-authoritative attribution. The fingerprint additionally distinguishes the price-source kind and every exact source identifier/number. Changed source, recipient, content, expected revision or command kind under one key conflicts; an attempted caller-supplied amount is invalid. The server never silently normalizes a new intent into an old receipt.

Use one caller-owned transaction for current authorization, the economic owner's approved commercial projection, Client/Opportunity resolution, Offer/reference/Version/lineage writes, durable receipt and minimal events. Serialize access with revocation, suspension and relevant Client changes through existing owners, with a consistent lock order. Do not perform a nested source-read transaction while holding locks it needs. No provider call or background task establishes success.

Current authority and all original target/source readability prerequisites precede receipt disclosure. An exact replay returns the original committed result before stale revision/head checks and creates no second event, reference or fence advance, including after later Offer Versions or source submissions. An access loss still denies it. A Client union uses the same current canonical/original relationship rules as ordinary Offer history; no historical reference is rewritten.

Concurrent first creations yield one Offer; concurrent same-key requests converge on one result. Concurrent successor commands at one revision yield one new Version. Deterministic revocation/suspension/Client-change orderings either commit while the protected prerequisites hold or refuse without partial effects. A failure at the final write rolls back the complete creation, reference allocation effects, lineage, receipt, fence and events. An uncertain UI outcome retains the literal payload/key for an explicit identical retry; a deliberately changed intent requires a new command.

### 26.7 Activity, storage and compatibility

Reuse `offer.created`, `offer_version.created` and, when applicable, ordinary rejection events; no new economic decision event is invented. Handoff creation events may record the closed price-source kind, exact Estimate Version id/number and approval decision id instead of a Snapshot id. These are source provenance already visible in the Offer; no amount, currency, cost, margin, target, reason, recipient copy or commercial text enters Activity metadata or diagnostics. No success event follows denial, conflict, rollback or replay.

Existing commercial Activity read additionally requires its ordinary current Offer/Opportunity visibility and returns only §25's existing target/version fields. The source stamp remains Offer content; no Estimate identity or decision detail is added to an Activity response. Profitability creation/decision events remain unprojected, and neither handoff nor source approval grants Activity access.

A reviewed additive migration permits exactly the two valid price-source shapes, retains scoped source/decision references and protects immutable content. It creates no new draft authority or history backfill. Genuine upgrade proof must preserve old unadjusted and adjusted Snapshots, Offer bindings/bytes/checks, decisions/transmissions/responses and linked ordinary or early-preparation Contracts. Existing constraints must continue rejecting unknown modes, invalid scope/source combinations and mutations of frozen content. Do not weaken the legacy Snapshot/Template/rule invariants globally to admit the new variant.

The Offer owner exposes the new closed record variant through create/read/history and every affected consumer. Contract, Activity, rendering, browser decoders and source eligibility must explicitly handle it or refuse its unsupported operation safely. No optional-field bag may admit a half-Snapshot/half-estimate record. The economic owner exposes only the narrow protected commercial projection needed inside the caller's transaction; its existing cost-read boundary remains independently guarded.

### 26.8 Interface and acceptance proof

Use the existing Opportunity/Request detail, estimate Version history, Offer preparation and Offer Version/history owners. The user explicitly selects the source Version and sees amount/currency, exact approval stamp, recipient and the internal-only/tax-unspecified notice before committing. A historical approved Version stays selectable by explicit identity without an unbounded Company-wide source list. Existing Snapshot preparation remains available to its original actors.

The reopened draft clearly labels the source, amount and unspecified tax treatment. It contains no tax total, invented HT/TTC label, operational document or cost fields. A current source reader may separately open the exact estimate; a price-only Offer reader sees no hidden economic response or cached cost detail. The ordinary rejection and successor actions reflect current rights; all unsupported execution actions are absent or visibly ineligible.

Provide empty/no-approved-source, malformed, unavailable, denied, stale, uncertain and success states. Retain independent content drafts on correctable errors and the exact uncertain command. Session/Company replacement or live authority loss retires protected source choices and late replies. Follow existing localized copy/number formatting, keyboard/focus behavior, accessible status and desktop1440/narrow390 layout; canonical decimals, source identities and user-entered content never change with locale.

The primary proof is the public Offer REST command/read interface against real PostgreSQL, using synthetic data, a source decision through the existing economic REST owner, deterministic barriers, exact persistence/restart and actual owning App journeys. Test the external behavior rather than private helper calls.

| Acceptance case                                                                                     | Required observable result                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic approved EUR125.00 source                                                                 | Create/reload PENDING internal Version with exact amount/currency, source Version and APPROVE stamp, tax unspecified and no cost/margin fields                          |
| New estimate EUR150.00, later approval/other decisions                                              | Earlier Offer remains EUR125.00; explicit successor selects EUR150.00 and exact earlier history remains readable                                                        |
| Older approved Version selected after a newer submission                                            | Its exact approval remains eligible; no implicit source substitution                                                                                                    |
| Awaiting/MODIFY/REJECT, wrong displayed number, foreign or unreadable source                        | Refuse without Offer/receipt/event/source disclosure or partial reference allocation                                                                                    |
| Every independent assignment/prerequisite absent; captured v1/unknown/null                          | Existing route stays available where authorized; handoff refuses; only explicit revoke/regrant captures v2                                                              |
| Estimate read revoked after creation                                                                | Mutation replay/new handoff denied; otherwise authorized Offer reader retains frozen price-only history and no hidden source response                                   |
| Forged source amount, tax mode, approval/provenance or malformed response                           | No false success, fabricated tax/decision, lost literal draft or partially accepted record                                                                              |
| Exact, changed-intent and concurrent retries; successor race                                        | One identity/Version/result; changed intent conflicts; stale expectations do not defeat an authorized exact replay                                                      |
| Revoke/suspend and relevant Client change in both orders                                            | Deterministic protected commit or clean refusal; no hidden count/identifier/event or lock inversion                                                                     |
| Final-write failure                                                                                 | Entire transaction, lineage, events, fence, receipt and allocation effects roll back                                                                                    |
| Cost-free Offer read/history/Activity/diagnostics                                                   | Offer price/source projection only; existing minimal Activity fields and no logged amounts; no costs, profit, target or strategic rationale across any affected surface |
| Execution/representation/Contract attempts on internal Version                                      | Explicit ineligibility, no quality run, approval, transmission, response, representation or downstream record                                                           |
| Deliberate supported source switches and internal rejection                                         | Ordinary version/history/rejection semantics, no inherited estimate or Offer approval                                                                                   |
| Genuine migration and unchanged illustrative journey                                                | Scoped/immutable constraints and all existing unadjusted/adjusted Offer/Contract behavior preserved                                                                     |
| Actual App desktop/narrow: explicit source, uncertain retry, reload/history, authority/session loss | Correct source/price and protected state; readable feedback, no stale leak or duplicate success                                                                         |

### 26.9 Readiness and deferred work

This contract requires no new Iurie dossier, fiscal opinion, tariff, cost reconstruction, operational Template, numbering policy or external-provider configuration for the bounded internal draft. No real customer amount or document enters Git or tests. It does not claim a source price is operationally sufficient.

After this canonical amendment is merged and ordinary readiness gates pass, one vertical implementation issue must deliver the scoped migration, independent administration, protected source handoff, Offer/UI/history variants, safe downstream refusal and complete proofs together. Root owns its verification/review monitoring; no new review round follows a main advance alone. Documentation approval is not runtime delivery.

Deferred: fiscal/net/gross determination; operational price/Template approval; official numbering; external representation, sending or acceptance; Contract consumption of this source; automatic pricing, target/overhead/fiscal/FX calculations; strategic-price disclosure; actual costs; and generalized price-source configuration. These require their own approved contracts and do not silently widen this handoff.

The separate [§28 generation contract](release-3-commercial-28-model-offer-generation.md)
now defines a new complete Offer variant with an approved Company model and
explicit human net/tax declaration. It never upgrades these existing internal
drafts or interprets their unspecified tax in place. Its runtime remains separate;
fiscal policy, official numbering and real external effects are not approved here.
