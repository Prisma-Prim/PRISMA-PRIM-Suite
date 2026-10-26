# PRD — Release 3B Confirmed-Cost Profitability Estimate

- **Status:** Approved — bounded first-journey contract; delivery tracked in #498
- **Version:** 1.0
- **Owner:** Dan Popescu
- **Release:** 3, bounded R3B slice
- **Parent authority:** [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md)
- **Current pricing authority:** [Release 3B Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md)
- **Originating issue:** [#488](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/488)
- **Authorization direction:** Dan, 2026-09-30 — designated collaborators may read and create; the Director retains the final decision
- **Contract finalization:** [#497](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/497), 2026-10-01 — coordinating root product review under Dan's delegated authority
- **Downstream consumer:** [#498](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/498), one vertical implementation journey; readiness follows section 12

## 1. Authority, status and boundary

This approved contract defines one internal, Company-owned economic estimate for one Opportunity. It combines human-confirmed cost amounts with one proposed commercial price and shows total cost, profit and estimated profitability. Approval resolves the bounded product contract; it does not claim runtime delivery, approved fiscal practice or authority to generate an Offer.

The [Commercial Workflow PRD](release-3-commercial-workflow-prd.md) continues to own the Request → Opportunity → pricing → Offer → Contract → Project journey. The [Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md) continues to own every existing Service Definition, Company Service Offering, Tariff Version, Pricing Rule Version and Pricing Snapshot. This contract does not amend, retag, reprice, migrate or reinterpret any of those records.

The [Tenant, Company, Client and Authorization PRD](tenant-company-client-authorization-prd.md) owns permissions and assignments. The [Activity Log PRD](activity-log-accountability-prd.md) owns event recording and visibility. The [UX, Localization and Configuration PRD](ux-localization-configuration-prd.md) owns accessibility, localization and configuration presentation. This contract states only the estimate-specific consequences.

Every rule below is labelled as one of:

- **Source-backed rule:** supported by the controlled source and compatible with current product authorities.
- **Product Owner decision:** decided by Dan and normalized into the owning product authorities.
- **Approved product convention — 2026-10-01:** a reversible first-journey choice reviewed by the coordinating root under Dan's delegation in #497, including the existing Draft arithmetic and immutable-decision choices. It is not a claim that Iurie supplied that policy.

Section 11 records the approval provenance. Approval applies only to this bounded journey; deferred real fiscal and commercial policies remain undecided.

## 2. Problem and desired outcome

The current illustrative pricing slices prove catalogue, versioning, exact arithmetic and immutable Snapshot mechanics. They deliberately do not model real project cost, target profitability, minimum price or real fiscal practice.

The first useful extension is smaller than the complete pricing method. An authorized internal user should be able to:

1. enter the cost amounts already confirmed for one Opportunity, including an explicit allocated-overhead amount, in one currency;
2. enter one proposed commercial price and one target profitability;
3. see total cost, profit, estimated profitability and the difference from the target;
4. retain an immutable, reproducible estimate version; and
5. obtain mandatory final Director validation of that exact version.

This outcome gives the business a reviewable cost/price/profit record without inventing tax bases, automatic overhead allocation, coefficient selection or a universal pricing formula.

## 3. Controlled-source provenance and handling

The controlled source remains outside Git.

| Source                                                                           | SHA-256                                                            | Sections used | Safe contribution to this contract                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `Specificatie_functionala_Modul_Calcul_Pret_Rentabilitate_PRISMA_PRIM_v1.0.docx` | `4017D068401A40AB7112C86A0A55FD29ADB21ABD13776A172B87B69703499F63` | 1–5           | Price/profit distinctions, target profitability, cost families, executor types and explicit overhead       |
| Same controlled source                                                           | Same hash                                                          | 6–13          | Complexity, integrated systems, urgency, travel, profitability bands, strategic price and Director control |
| Same controlled source                                                           | Same hash                                                          | 14            | Confidential calibration cases used as evidence only and intentionally omitted from Git                    |
| Same controlled source                                                           | Same hash                                                          | 15–19         | Proposed screen, configurable parameters, flow, acceptance themes and auditability                         |

Only generic business rules and clearly synthetic examples may enter the repository. Real Client names, case amounts, overhead accounts, accounting details and email contents are excluded from this PRD, issues, fixtures, screenshots and tests.

The October [controlled-source reconciliation](commercial-source-reconciliation-2026-10.md) identifies the same specification bytes (E08); no rediscovery or second pricing contract is needed. E01 states that the primary historical dossier had no standardized price workbook and its price preceded the formal method. The dossier cannot establish historical cost, effort, overhead or margin, and is not a calibration target. Unknown costs remain unknown; the proposed estimate still requires newly human-confirmed costs for its proposed price. Receipt of E08 alone did not approve the Draft. Section 11 records the subsequent bounded product approval; excluded minimum-price/tax/overhead automation remains excluded.

## 4. Source-backed rules

The controlled source supports these rules:

1. Technical calculated price, proposed commercial price, intentionally strategic price and profitability are distinct facts.
2. Profit is proposed revenue minus total project cost. Estimated profitability is profit divided by proposed revenue.
3. The source gives 30% as the initial target profitability and requires it to remain configurable. This is source evidence, not an approved universal benchmark or hard-coded production default.
4. Total project cost may contain executor remuneration, fiscal cost, patent cost where applicable, travel, subcontractors, translations, materials or consumables, allocated overhead and other project-specific direct cost.
5. The executor type is one of patent consultant, civil-contract freelancer or individual, director or employee, and external subcontractor.
6. Overhead belongs in total cost, but no automatic allocation formula is approved. The first journey may use only an explicitly entered project allocation.
7. Fiscal percentages, patent treatment, consultant remuneration, complexity, integrated-system, food-safety, urgency, travel and profitability-band values are configurable business inputs. A range does not authorize the product to choose a midpoint or any other coefficient.
8. Potential future revenue is not current profit.
9. A strategic price and its reason stay distinct from ordinary pricing and must not become an automatic benchmark.
10. Final Director validation remains mandatory. The source names `APPROVE`, `MODIFY` and `REJECT`; no threshold creates autonomous approval below the Director.
11. Completed estimate history must remain reproducible as configuration changes.

The source does not supply legally verified tax rules, exact fiscal bases, a final rounding policy, an automatic overhead formula, an approved coefficient-selection rule or complete permission assignments.

## 5. Approved first journey

Section 4 owns source-backed facts. The remaining choices in this section are **approved product conventions — 2026-10-01**.

The canonical **Profitability Estimate** is the Company-owned internal economic record for one Opportunity. A **Profitability Estimate Version** is one immutable set of confirmed inputs and computed results, to which at most one separate append-only Director decision may be attached. [CONTEXT.md](../../CONTEXT.md) owns these terms. Existing Pricing Calculation and Pricing Snapshot meanings do not change.

### User stories

1. As an administrator, I explicitly grant or revoke preparation and Director authority independently, so that existing assignments do not expand.
2. As a Contributor, I enter and confirm all costs, price and target for a readable Opportunity, so that a complete estimate can be reviewed.
3. As an authorized reader, I reload exact inputs, results, authors and decisions for every version, so that later corrections do not rewrite history.
4. As a Contributor, I append a corrected version with fresh cost confirmation, so that price-dependent costs are reconsidered.
5. As a Director, I approve, return for modification or reject one exact version, so that validation cannot move to another version.
6. As a user facing failure or uncertainty, I safely retry without creating duplicate versions or decisions.
7. As an unauthorized user, I receive no hidden estimate, count, amount, reason or event disclosure.

### 5.1 Scope and actor entry

The estimate belongs to the active Company and one Company-owned Opportunity that the actor may already read. It does not create or change a Client, Client Request, Opportunity, Offer, Contract or Project.

The entry point appears only after the authorization owner grants the required captured permissions defined in section 6. No existing bundle or assignment gains new authority automatically.

### 5.2 Human-confirmed inputs

| Input                     | Approved boundary                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Currency                  | One required ISO currency for the whole estimate; no conversion                           |
| Executor type             | One required value from the four source-backed types; it selects no formula in this slice |
| Executor cost             | Explicit zero-or-positive decimal amount confirmed by a human                             |
| Fiscal cost               | Explicit zero-or-positive decimal amount; the product calculates no tax or contribution   |
| Direct-cost lines         | Zero or more lines with a submission key, category, short label and positive amount       |
| Allocated overhead        | One explicit zero-or-positive decimal amount; no allocation formula or equal split        |
| Target profitability      | Required explicit decimal percentage; no default, range or approval threshold is imposed  |
| Proposed commercial price | Required positive decimal amount in the estimate currency                                 |
| Pricing intent            | Required choice between ordinary and strategic pricing; it selects no formula             |
| Strategic-price reason    | Required only when the author marks the proposed price as strategic                       |

Direct-cost categories are limited to patent cost, travel, subcontractor, translation/material/consumable and other project-specific direct cost. A category describes the entered amount; it does not trigger an automatic calculation.

Every amount is visible before commit. A submission key is a caller-selected stable line identifier, unique within the submitted version; it distinguishes lines for validation and replay, not an accounting identity across versions. Labels and a required strategic reason contain a non-whitespace character and are stored exactly as submitted. Ordinary pricing supplies no strategic reason.

The author explicitly confirms the submitted cost bundle is complete for this estimate and no cost has knowingly been included twice. Absence or false confirmation refuses submission. Equal amounts under different keys remain separate; the product never guesses or merges a semantic duplicate. Every new version requires a complete input bundle and fresh confirmation, including after changing a price-dependent cost; the product cannot certify that a manually entered amount is economically correct.

### 5.3 Deterministic outputs

For the submitted version only:

- `total cost = executor cost + fiscal cost + allocated overhead + sum(direct-cost lines)`;
- `profit = proposed commercial price - total cost`;
- `estimated profitability = (profit / proposed commercial price) × 100%`; and
- `target difference = estimated profitability - target profitability`.

**Approved product convention — 2026-10-01:** monetary input strings have exactly two fractional digits in plain base-10 notation, with no exponent or locale separator. Reject overprecision (including monetary `1.005`) rather than rounding a submitted amount. Costs may be zero except direct-cost lines, which must be positive; proposed price must be greater than zero. One estimate currency applies to every amount; a mismatched line currency refuses the entire command. Monetary sums and subtraction stay exact at scale 2. Negative profit is retained without clamping.

Target profitability is an explicit signed plain base-10 decimal percentage, preserved exactly; no target value, business range or default is inferred. Reject missing, malformed or non-finite values. For calculation-rule version 1, compute the exact rational percentage `r = 100 × profit / price`. Store estimated profitability as `HALF_UP(r, 2)` and target difference as `HALF_UP(r - target, 2)` independently. Do not subtract the already-rounded displayed profitability. `HALF_UP` resolves a half away from zero, including negative values; target difference is in percentage points. Binary floating point is prohibited for parsing, calculation, storage and serialization.

The version stores the calculation-rule identity and version with its scale/rounding convention. This reproducibility convention reuses the existing Draft proposal and illustrative pricing precedent; it is not a fiscal rule or proof of first-tenant rounding practice. A later approved convention uses a new rule version and never changes history.

The calculation produces no minimum price, recommended price, tax, fiscal amount, overhead allocation, coefficient, future revenue, benchmark or automatic commercial decision. In particular, it never applies `total cost / (1 - target profitability)` when any cost could depend on the proposed price.

If the proposed price changes, the author creates a new estimate version and reconfirms every cost that could depend on that price. An earlier version is never recalculated.

### 5.4 Immutable version and Director validation

One Opportunity has at most one Profitability Estimate identity in this journey. First submission creates that identity and version 1. Each deliberate correction or recalculation appends the next monotonically increasing version to the same identity; it supplies the displayed latest version as its expected base. The latest submitted version is the head for append concurrency only. It is not an aggregate approval state.

A committed version freezes:

- server-established Workspace, Company, Opportunity and originating Client Request references;
- every submitted input, cost-completeness confirmation and explicit reason;
- every computed result and calculation-rule identity/version;
- any configuration identity/version actually used, with the effective value captured; and
- creating membership, server time, version number and predecessor reference (none for version 1).

Target is entered manually in this journey; no target configuration administration, threshold setting or fiscal configuration is introduced. A version does not embed a mutable decision or status field. Its displayed decision state is derived from the absence or presence of a separate append-only decision record: awaiting, `APPROVE`, `MODIFY` or `REJECT`.

A live Director records at most one decision against an exact version identifier and number, expecting no existing decision:

- `APPROVE` provides mandatory final validation of that exact version;
- `MODIFY` returns that version for correction; a Contributor must separately submit a new complete version; and
- `REJECT` rejects that version without deleting it.

The decision freezes the code, exact version reference, Director membership and server time. This journey introduces no additional decision-reason field or evidence requirement. An undecided version may remain awaiting indefinitely; there is no automatic decision. Corrections may follow any decision state. An older undecided version may still receive its own decision after a newer submission. No later version or decision inherits, revokes or invalidates an earlier approval; history shows each approval only on its exact version. No command edits, retags, deletes, backfills or re-points a frozen version or decision. No state confers Offer authority.

### 5.4.1 Commands, retries and atomicity

The narrow public business boundary submits a complete first or subsequent version, records an exact-version Director decision, and reads one Opportunity's estimate history or an exact version. NestJS establishes actor, scope, references, rule version, number and timestamps; callers cannot supply those facts or an arbitrary resulting state.

Every mutation requires a request key scoped to the server-resolved actor membership, active Company and command kind. Its fingerprint includes every submitted field exactly, including target identifiers, expected base/decision absence, line order, decimal strings, labels, reason and confirmation. Changed payload under the same scoped key returns a safe conflict. Exact concurrent retries converge on one committed receipt and result.

The transaction sequence is:

1. authenticate and resolve the actor and active Company;
2. revalidate current membership, Company context and required captured assignments under protection that serializes against revocation; revalidate the target Opportunity through its owning public read boundary;
3. lock the scoped request key and inspect its durable receipt; after current authority and readability pass, an exact replay returns its recorded result before evaluating stale expectations; a fingerprint mismatch conflicts;
4. validate all inputs, take the estimate/Opportunity creation lock or existing estimate head lock and check the expected base for a submission; for a decision, protect that exact version's absent decision;
5. build the authorized success representation inside the transaction and persist the immutable record, head advance where applicable, durable receipt and required Activity event together; and
6. return success only after the database acknowledges commit.

The receipt retains the authorized command result; it is not constructed or cached after commit through a second unprotected read. Exact replay returns that historical command result, not a newly recomputed version or current head/decision state. Fresh reads provide the current derived decision and head. Replay never bypasses live authorization and never evaluates a new head, rule version or rounding convention. No version, decision, receipt or success event persists after a failed validation, denial, stale expectation, response-construction failure or rolled-back write. A failed transaction leaves the key reusable for a fresh attempt.

First submission expects no estimate (`null` head). Two independent first submissions on that Opportunity yield one version 1; the other receives a stale-head conflict. Append requires the exact current head number as base, so two independent submissions from the same base yield one successor and one conflict. Even identical deliberate submissions with different keys create a new version when their expected base is current; they are not silent no-ops. Different keys deciding one version yield one immutable decision and one already-decided conflict, including when the codes match. Exact retries with the original key yield the original decision.

A decision and a successor submission may both commit: they concern the frozen targeted version and the append head separately. Reads show coherent committed head, versions and attached decisions, never an intermediate transaction. Unrelated Opportunities and Companies need no shared business serialization. Revocation or loss of Opportunity readability ordered before the command's protected authorization check denies; if the command holds that protection first, revocation waits until it ends. Any related-record invalidation before that check returns the same safe unavailable outcome as an inaccessible target; the estimate never creates its own alternate Opportunity/Client authorization path.

If the acknowledgement is lost or commit status is unknown, show an uncertain state, retaining the exact payload, key and expectation. Retry them unchanged: return the receipt if committed, otherwise execute afresh and possibly encounter a stale or authorization conflict. Never claim rollback without observing it or compensate by deleting committed history.

### 5.5 Synthetic example

This example is invented for verification and is unrelated to any real Client or source amount.

| Input or output           | Synthetic value     |
| ------------------------- | ------------------- |
| Executor cost             | EUR 60.00           |
| Fiscal cost               | EUR 10.00           |
| Direct costs              | EUR 20.00           |
| Allocated overhead        | EUR 10.00           |
| Target profitability      | 20%                 |
| Proposed commercial price | EUR 125.00          |
| Total cost                | EUR 100.00          |
| Profit                    | EUR 25.00           |
| Estimated profitability   | 20%                 |
| Target difference         | 0 percentage points |

The example proves only the four arithmetic relationships above. It defines no real price, currency policy, cost mix or target.

## 6. Company scope, permissions and approval

**Source-backed rule:** final Director validation is mandatory.

**Product Owner decision — Dan, 2026-09-30:** designated collaborators may read and create estimates. The final `APPROVE`, `MODIFY` or `REJECT` decision remains Director-only.

The [Tenant, Company, Client and Authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families) owns two separate captured, Company-scoped opt-in bundles:

| Bundle                                   | Captured permissions                                                                 | Capability                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Company Profitability Contributor v1** | `commercial.profitability_estimate.read`, `commercial.profitability_estimate.create` | Read and create estimates for Opportunities the holder may already read             |
| **Company Profitability Director v1**    | `commercial.profitability_estimate.read`, `commercial.profitability_estimate.decide` | Read estimates and record `APPROVE`, `MODIFY` or `REJECT` against one exact version |

An active administrator with `company.assignment.manage` explicitly grants or revokes each bundle for an active same-Workspace membership and active Company through existing Company assignment administration. No existing assignment, bundle, Workspace ownership, migration backfill, job title, person name or Director label confers either bundle. Null or unknown captured versions fail closed.

Additional rules:

- the estimate is Company-owned and follows the Opportunity's existing Workspace and responsible Company;
- read requires live Contributor v1 or Director v1 plus current Opportunity readability and active Company context;
- create requires live Contributor v1 plus the same Opportunity and Company prerequisites;
- a Director decision requires live Director v1, current Opportunity readability and active Company context;
- Contributor v1 never permits a Director decision;
- Director v1 grants estimate read and Director decision, but no create authority;
- a Director who must enter an estimate receives Contributor v1 through the same explicit grant path;
- business status as Director grants nothing without the captured assignments;
- every command and idempotent replay revalidates current authority before returning a result; and
- no estimate amount, count, reason or existence crosses a Company boundary.

Grant and revoke events follow the existing Company assignment-administration convention: one attributed event per actual state change, bundle-label-only metadata, and no event for repeated state, denial, failure or exact replay. The bundle assignment is the explicit Company-scoped designation for this capability; runtime authorization never checks a free-form role name or hard-coded identity.

## 7. History, configuration and compatibility

Each estimate version keeps the rule identity/version and any configuration identity/version actually used. The first journey uses an entered target and versioned scale/rounding rule; it introduces no target/threshold configuration. A later configuration change affects only a new estimate version. Reads of history return stored inputs and outputs; they never recompute against current configuration.

Existing `ILLUSTRATIVE` Service Offerings, Tariff Versions, Pricing Rule Versions, Pricing Snapshots and adjustments remain unchanged. No record receives new provenance. This estimate's first journey changes no Offer behaviour, including the O1 rule that an illustrative Offer references its immutable Pricing Snapshot without repricing it.

The separate [approved internal Offer preparation contract, Commercial Workflow §26](release-3-commercial-26-estimate-offer-preparation.md), now owns the bounded handoff from one exact Director-approved Estimate Version. It preserves the amount/currency and source approval without creating a Pricing Snapshot, exposing costs or determining net/gross/tax meaning. It does not expand estimate permissions or change an economic Version or decision. Operational price, external representation and Contract compatibility remain deferred.

## 8. Activity, privacy and interface consequences

The [Activity Log owner](activity-log-accountability-prd.md#7-authorization-and-privacy) defines the two internal creation and Director-decision events, their atomic recording and identifier/version/decision-only metadata. Failed, denied, conflicted and replayed commands create no success event. No amount, percentage, label, reason or Client-confidential content enters events or diagnostics.

No Activity read surface projects these events in this journey. Neither profitability bundle grants Activity Log access, and existing commercial Activity permissions/allowlists do not expand.

The interface shows the active Company, Opportunity, currency, every cost line, proposed price, target and computed result together. It shows whether the exact version awaits a Director decision or was approved, returned for modification or rejected. It preserves entered values after correctable errors and exposes empty, invalid, denied, stale, uncertain and success states. The history view labels each immutable version and its own decision; it never labels the whole estimate approved. After a conflict it asks the user to reload the head or decision before a deliberate resubmission with a new key. Loss of permission closes protected content without exposing cached history. Accessibility, keyboard operation, localized numbers/copy and narrow-width behaviour inherit the UX authority; locale formatting never changes canonical submitted decimals. There is no external integration or provider dependency; manual entry and PostgreSQL are the source of truth.

## 9. Explicitly deferred behaviour

These items do not block the first confirmed-cost journey and must not be smuggled into it:

- automatic tax or fiscal calculation, including the bases and interaction of percentages;
- automatic consultant, freelancer, employee, patent or subcontractor cost calculation;
- any minimum-price formula while a cost can depend on proposed price;
- automatic overhead allocation or equal allocation across projects;
- automatic complexity, integrated-system, food-safety, urgency or travel coefficients;
- automatic midpoint or endpoint selection from any range;
- minimum price, recommended price and profitability-band classification;
- currency conversion or exchange-rate selection;
- potential future revenue in current profit;
- estimated-versus-actual comparison;
- automatic benchmarking or import of calibration cases;
- Offer or Contract creation, templates, numbering, sending, Client acceptance or signature;
- Project actual-cost capture; and
- AI-selected costs, coefficients, prices or decisions.

Missing Offer or Contract templates, numbering and full commercial-dossier evidence therefore do not block this internal estimate.

## 10. Acceptance and test matrix

The full journey is: explicitly grant Contributor and Director independently; submit the synthetic bundle; reload its exact frozen version; record `MODIFY`; append a fresh confirmed correction; record `APPROVE` against that exact new version; reload both versions and decisions. Revocation then prevents reading, creation, decision and replay according to the command's current prerequisites. The following cases are approved expectations, not claims of existing tests or runtime delivery.

| Case                                               | Expected outcome                                                                                                                                                   | Status   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Positive same-currency estimate                    | Exact total cost, profit, profitability and target difference are stored and reload unchanged                                                                      | Approved |
| Proposed price is missing or malformed             | Refuse the field; commit nothing                                                                                                                                   | Approved |
| Proposed price is zero                             | Refuse because profitability has a zero denominator; commit nothing                                                                                                | Approved |
| Proposed price is negative                         | Refuse; commit nothing                                                                                                                                             | Approved |
| Negative cost amount                               | Refuse the field; commit nothing                                                                                                                                   | Approved |
| Zero-valued direct-cost line                       | Refuse the line and allow its omission; do not create meaningless lines                                                                                            | Approved |
| No direct-cost lines                               | Accept when required executor, fiscal and overhead inputs and explicit completeness confirmation are present                                                       | Approved |
| Mixed currency                                     | Refuse the whole command; never convert or partially total                                                                                                         | Approved |
| Exact retry                                        | Return the same immutable version and create no second event                                                                                                       | Approved |
| Same idempotency key, changed payload              | Return a conflict and preserve the original version                                                                                                                | Approved |
| Repeated direct-cost submission key                | Refuse the payload; equal amounts under different keys remain separate and visible                                                                                 | Approved |
| Suspected semantic double count                    | Show every line and require human bundle confirmation plus final Director validation; do not guess or merge                                                        | Approved |
| Monetary input `1.005`                             | Reject overprecision, commit nothing; never round the submitted amount                                                                                             | Approved |
| Exact intermediate profitability `1.005%`          | Price `200.00`, total cost `197.99`, profit `2.01`: profitability `1.01%`; target `1.00%` gives independently rounded difference `0.01` points                     | Approved |
| Independent percentage rounding                    | Same inputs, target `1.01%`: exact difference `-0.005` gives `-0.01` points, not displayed-profitability subtraction `0.00`                                        | Approved |
| Negative profit and half boundary                  | Price `200.00`, cost `202.01`: profit `-2.01`, profitability `-1.01%`; target `0` gives difference `-1.01` points                                                  | Approved |
| Configuration changes after commit                 | Old version and decision stay byte-for-byte reproducible; a new calculation names any new rule/configuration version actually used                                 | Approved |
| Proposed price changes with a price-dependent cost | Require a new version and reconfirm the dependent cost; calculate no fixed-cost minimum price                                                                      | Approved |
| Reader lacks both Contributor v1 and Director v1   | Safe denial with no record, amount, count or event disclosed                                                                                                       | Approved |
| Creator lacks Contributor v1                       | Safe denial; no estimate or event is created                                                                                                                       | Approved |
| Contributor attempts a Director decision           | Safe denial; the exact version remains awaiting a Director decision                                                                                                | Approved |
| Director v1 holder lacks Contributor v1            | May read and decide an authorized estimate but cannot create one                                                                                                   | Approved |
| Director holds both explicit bundles               | May create through Contributor v1 and separately decide the exact version through Director v1                                                                      | Approved |
| Actor has only a Director job label                | Safe denial; a label or person identity grants no read, create or decision authority                                                                               | Approved |
| Actor holds bundles in another Company             | Safe denial without revealing the estimate or Opportunity                                                                                                          | Approved |
| Authority revoked before replay                    | Safe denial before returning the recorded result                                                                                                                   | Approved |
| Concurrent Director decisions on one version       | One exact version gains one decision; a distinct competing key conflicts without writes; earlier frozen versions and decisions are never invalidated retroactively | Approved |
| Earlier illustrative Snapshot and Offer            | No mutation, retagging, repricing or changed Offer result                                                                                                          | Approved |

Additional proofs cover omitted/false confirmation, empty/invalid labels and strategic reason, every executor/category choice without formula selection, target with no hidden default or business range, unknown captured permission versions, independent assignment grant/revoke and unchanged legacy assignments. Submission races cover absent/current head and exact retries. Decision races cover different codes and different keys with the same code; decision-versus-append preserves both facts. Failure injection at each version/head/decision/receipt/event write and response construction proves all-or-none persistence. Authority and target loss before replay refuse the recorded result; a successful replay precedes stale-head evaluation.

The highest stable test seam is the public REST command/read interface against PostgreSQL, with restart proof, deterministic concurrency barriers instead of sleeps, current-authorization negative cases and inspection through the existing public Accountability recording seam. Browser proof covers explicit assignment administration, first-use empty history, complete Contributor submission, Director disposition, correction and reload at desktop and narrow width. A bounded newest-version-first history uses a stable cursor, default 25 and maximum 50 items, with no Company-wide estimate list or hidden count. Exact-version reads retain all stored values; authorized reads alone disclose history.

## 11. Decision provenance and implementation boundary

| Decision                                                                                                                                                                                     | Authority and date                                                                                | Bounded consequence                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Final Director validation and cost/price/profit distinctions                                                                                                                                 | Controlled specification §§1–19; source-backed                                                    | Manual confirmed costs, explicit overhead, no automated policy inference                          |
| Separate Contributor and Director captured v1 assignments                                                                                                                                    | Dan, 2026-09-30, #488/#489                                                                        | Existing assignments stay unchanged; preparation and decision authority remain independent        |
| Existing Draft price positivity, scale-2 monetary inputs, versioned `HALF_UP` outputs, at-most-one decision and correction by new version                                                    | Coordinating root product review, 2026-10-01, #497, under Dan's delegation to complete priority 4 | Approved for this first journey; no business target bound, default, tax or overhead formula       |
| One identity per Opportunity, expected-head append, exact-version decisions including older undecided versions, independently rounded rational outputs, protected receipts and atomic events | Same delegated root review, 2026-10-01, #497                                                      | Makes the approved bounded journey executable without an aggregate approval or historical rewrite |

No further Iurie evidence is required inside this manual-input journey. Fiscal bases, price-dependent executor formulas, patent allocation, overhead automation, modifier order, coefficient values, thresholds beyond mandatory final validation, actual-cost comparison, Offer compatibility, templates and numbering remain deferred decisions. The source's 30% example is never a hidden production target.

Implementation stays inside existing NestJS, PostgreSQL/Drizzle, authorization, commercial and Accountability public boundaries. An additive reviewed migration introduces empty estimate/version/decision/receipt storage with same-Workspace/Company references and unique constraints for Opportunity identity, version number and one decision per version. No data or assignment is backfilled into profitability authority. Precision/storage must preserve every accepted decimal and computed result or reject unsupported representation before any write; no silent truncation or overflow is allowed. No new dependency, provider, infrastructure or durable architectural change is required; ordinary internal storage and endpoint choices belong to the single implementing issue.

## 12. Readiness and delivery state

The bounded product contract is **Approved** under the dated review above. Its first runtime journey is tracked by the completed vertical child [#498](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/498), including assignment administration, immutable economic Versions and exact Director decisions. The live tracker owns delivery evidence; this document's approval is not itself runtime proof. The separate §26 Offer compatibility amendment does not reopen or broaden that completed estimate issue.

The separate [Commercial §28 generation contract](release-3-commercial-28-model-offer-generation.md)
reuses the same exact approved commercial projection and independent cost-read
boundary. The preparer explicitly declares net use and a separate sales-tax
amount on a new Offer Version; no fiscal-cost input, source decision or existing
estimate is reinterpreted or changed. This adds no tax engine or historical costs.

Readiness requires the published canonical contract and amendments, the reviewed context-free child issue and closed dependencies. No additional Client case, tariff, fiscal opinion, Offer Template or Contract Template blocks this first journey. Broader pricing/fiscal policy, configuration administration, actual-cost tracking, integrations and Offer compatibility need separate approved slices.

## 13. Approved Company queue awaiting Director decision (#889)

**Authority and state.** Approved bounded product contract under Dan's
2026-10-26 instruction to implement the independently testable pending-estimate
queue. This is reversible product synthesis, not a new Iurie answer. Sections
5–6 own versions, decisions and permissions; this section only adds discovery
and exact navigation. Runtime delivery belongs to its separate child issue.
No additional business answer or manual user acceptance blocks synthetic delivery.

### Outcome and user stories

An existing Director finds the Company's readable estimate Versions that have
no decision, opens the exact Version and uses the existing decision journey.

1. As a Director, I discover pending Versions across readable Opportunities.
2. As a Director, I distinguish an earlier pending Version from the latest one.
3. As a Director, I reach every pending Version beyond the first page.
4. As a Director, I open the exact selected Version and inspect all frozen inputs,
   results and current exact-version decision before acting.
5. As a Director, I approve, request modification or reject using the existing
   exact-version command, concurrency expectations and uncertain-retry protocol.
6. As a Director, I refresh after a decision and see that Version leave the queue;
   another pending Version of the same estimate remains independently visible.
7. As a user losing authority or changing identity/Company, I retain no old queue,
   exact detail, prepared decision or late protected response.
8. As a reader, I distinguish empty, loading, failed and denied reads and can retry.
9. As a desktop or narrow-screen user, I complete the same accessible journey.

### Membership, authority and page contract

A pending item is one immutable submitted Version with **no** separate decision.
Include older undecided Versions, even if a successor exists or another Version
was approved. Never invent an aggregate approval state, exclude an Opportunity
because it is closed, or infer withdrawal/urgency from age. Sections 5–6 remain
unchanged, including decisions on older Versions and all three decision codes.

The active Company must pass live captured Director v1 decision authority **and**
existing commercial Opportunity read authority, with the same Workspace/Company
scope as ordinary estimate reads. Contributor-only, assignment administrators,
ownership labels and unknown captures confer no queue access. No assignment,
backfill, new permission or cross-Company view is introduced. Recheck the current
scope/captures on every read, continuation, exact open, decision and replay.
An empty authorized queue is not a substitute for a refused read. Client labels
are omitted: this discovery grants no additional Client dossier read.

GET `/profitability-estimate-decision-queue` accepts only an optional opaque
`cursor`. It returns at most 25 items and an optional `nextCursor`. Each item
contains the exact scoped Version/estimate/Opportunity/Request identities,
Version number, latest Version number, submission timestamp and Opportunity
title. Return no costs, totals, reasons, actor roster, hidden counts or Client
labels. Membership, head marker, page boundary and labels share one coherent
transactional read; existing authorization owners supply readable scope. Reads
write no records, receipts, Activity events or Client reference-use fences.

Order by submission time ascending, then Version ID ascending. This is stable
chronological discovery, not business priority or an SLA. Cursor binds the
Workspace/Company, timestamp and Version ID, is representation-validated and
adds no authority. Reject malformed, extra, repeated or foreign-scope inputs
with a safe 400. Every page independently reflects current data and access;
new earlier rows require an explicit refresh from the beginning. There is no
whole count, maximum-total cap, saved filter or synthesized business deadline.

### User interface and navigation

Expose an independent, clearly named pending-estimates region on the existing
operational home only for the current eligible Director. Preserve ordinary home,
Task, commercial editor and presentation lifetimes. Use existing Prisme controls
and centralized four-locale copy. Next/Previous navigate bounded pages; Refresh
returns to the beginning. Announce page/loading/error state and keep keyboard
focus useful; narrow layout must not require horizontal page scrolling.

A row opens its exact target in the existing estimate detail/decision owner.
The target remains fixed after new submissions or decisions; never substitute
latest or another pending Version. Revalidate through the ordinary exact read:
a concurrent decision displays its actual state, and existing one-decision and
replay rules handle races. Return to the list and explicitly refresh after work.
Queue navigation adds no second decision form, endpoint or command implementation.
Identity/session/Workspace/Company or consumed Director/intake capture change
retires protected queue/detail/command owners and held replies. A command/read
401/403/404 retires protected state before asynchronous access recovery; permitted
existing estimate history elsewhere remains independently governed.

### Proof and exclusions

Use existing public REST/PostgreSQL and actual App/Playwright seams under Dan's
autonomous-testing instruction. Prove empty and populated reads, older pending
Versions, every decision code, exact historical open, two Directors racing,
identical uncertain retry, pagination beyond25 with tied dates, malformed and
foreign cursors, unsupported captures, current grant loss, Company/Workspace
isolation, held responses and no write/event/fence side effects. Real desktop
1440x900 and narrow390x844 App cases prepare synthetic records through public
commands, open from Home, decide the selected Version, refresh and reopen history.
Component fixtures separately prove asynchronous/privacy/locale edge cases.
Run appropriate doctor, formatting, lint, strict types, affected PG/browser and
broader sensitive development checks, bounded review, then exact-current-base
integration verification before guarded merge. No manual user testing is required.

No pricing/fiscal changes, estimate submission/decision semantics, real assignment,
external transmission, reminders, ranking, bulk decisions, Offer/Contract queues,
mission closure/certification, deployment/provider configuration or whole-MVP credit.
Pending `MISSION-CLOSE-01` stays owned by the mission PRD§12 for one consolidated
email and does not block this independent discovery feature.
