# Draft PRD — Release 3B Confirmed-Cost Profitability Estimate

- **Status:** Draft — evidence pending
- **Version:** 0.1
- **Owner:** Dan Popescu
- **Release:** 3, proposed R3B slice
- **Parent authority:** [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md)
- **Current pricing authority:** [Release 3B Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md)
- **Originating issue:** [#488](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/488)
- **Downstream consumers:** none until this Draft is approved and a separate implementation issue passes every readiness gate

## 1. Authority, status and boundary

This Draft proposes one internal, Company-owned economic estimate for one Opportunity. It combines human-confirmed cost amounts with one proposed commercial price and shows total cost, profit and estimated profitability. It does not authorize implementation or operational pricing while its open decisions remain unresolved.

The [Commercial Workflow PRD](release-3-commercial-workflow-prd.md) continues to own the Request → Opportunity → pricing → Offer → Contract → Project journey. The [Illustrative Deterministic Pricing PRD](release-3-illustrative-pricing-prd.md) continues to own every existing Service Definition, Company Service Offering, Tariff Version, Pricing Rule Version and Pricing Snapshot. This Draft does not amend, retag, reprice, migrate or reinterpret any of those records.

The [Tenant, Company, Client and Authorization PRD](tenant-company-client-authorization-prd.md) owns permissions and assignments. The [Activity Log PRD](activity-log-accountability-prd.md) owns event visibility. The [UX, Localization and Configuration PRD](ux-localization-configuration-prd.md) owns accessibility, localization and configuration presentation. This Draft states only the estimate-specific consequences.

Every rule below is labelled as one of:

- **Source-backed rule:** supported by the controlled source and compatible with current product authorities.
- **Draft proposal:** a reversible, testable product choice that still requires product review.
- **Open decision:** missing policy that prevents an implementation issue from becoming `ready-for-agent`.

No Draft proposal becomes approved business policy merely by appearing here.

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

| Source                                                                           | SHA-256                                                            | Sections used | Safe contribution to this Draft                                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `Specificatie_functionala_Modul_Calcul_Pret_Rentabilitate_PRISMA_PRIM_v1.0.docx` | `4017D068401A40AB7112C86A0A55FD29ADB21ABD13776A172B87B69703499F63` | 1–5           | Price/profit distinctions, target profitability, cost families, executor types and explicit overhead       |
| Same controlled source                                                           | Same hash                                                          | 6–13          | Complexity, integrated systems, urgency, travel, profitability bands, strategic price and Director control |
| Same controlled source                                                           | Same hash                                                          | 14            | Confidential calibration cases used as evidence only and intentionally omitted from Git                    |
| Same controlled source                                                           | Same hash                                                          | 15–19         | Proposed screen, configurable parameters, flow, acceptance themes and auditability                         |

Only generic business rules and clearly synthetic examples may enter the repository. Real Client names, case amounts, overhead accounts, accounting details and email contents are excluded from this PRD, issues, fixtures, screenshots and tests.

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

## 5. Draft first journey

Everything in this section is a **Draft proposal** unless section 4 already identifies it as source-backed.

The proposed local term **Profitability Estimate** means the Company-owned internal economic record for one Opportunity. A **Profitability Estimate Version** is one immutable set of confirmed inputs, computed results and one Director decision. These terms remain local to this Draft until product approval; `CONTEXT.md` and the existing Pricing Calculation and Pricing Snapshot meanings do not change.

### 5.1 Scope and actor entry

The estimate belongs to the active Company and one Company-owned Opportunity that the actor may already read. It does not create or change a Client, Client Request, Opportunity, Offer, Contract or Project.

The entry point appears only after the authorization owner defines and grants the required captured permissions. No existing bundle or assignment gains new authority automatically.

### 5.2 Human-confirmed inputs

| Input                     | Draft boundary                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Currency                  | One required ISO currency for the whole estimate; no conversion                                       |
| Executor type             | One required value from the four source-backed types; it selects no formula in this slice             |
| Executor cost             | Explicit zero-or-positive decimal amount confirmed by a human                                         |
| Fiscal cost               | Explicit zero-or-positive decimal amount; the product calculates no tax or contribution               |
| Direct-cost lines         | Zero or more lines with a submission key, category, short label and positive amount                   |
| Allocated overhead        | One explicit zero-or-positive decimal amount; no allocation formula or equal split                    |
| Target profitability      | Required decimal percentage; 30% is the source's configurable initial target, never a hidden constant |
| Proposed commercial price | Required decimal amount in the estimate currency                                                      |
| Pricing intent            | Required choice between ordinary and strategic pricing; it selects no formula                         |
| Strategic-price reason    | Required only when the author marks the proposed price as strategic                                   |

Direct-cost categories are limited to patent cost, travel, subcontractor, translation/material/consumable and other project-specific direct cost. A category describes the entered amount; it does not trigger an automatic calculation.

Every amount is visible before commit. The author confirms that the submitted cost bundle is complete for this estimate and that a cost has not knowingly been included twice. Equal amounts do not prove duplication and are never merged automatically.

### 5.3 Deterministic outputs

For the submitted version only:

- `total cost = executor cost + fiscal cost + allocated overhead + sum(direct-cost lines)`;
- `profit = proposed commercial price - total cost`;
- `estimated profitability = (profit / proposed commercial price) × 100%`; and
- `target difference = estimated profitability - target profitability`.

As a **Draft technical convention**, monetary inputs and outputs use exact scale 2, estimated profitability and target difference use percentage scale 2, and every displayed division result rounds `HALF_UP`. The estimate stores this rule and its version. This reuses the current illustrative pricing convention for reproducibility; it is not a fiscal rule or proof of first-tenant rounding practice. A later approved convention creates a new rule version and never changes old estimates. Binary floating point is prohibited.

The calculation produces no minimum price, recommended price, tax, fiscal amount, overhead allocation, coefficient, future revenue, benchmark or automatic commercial decision. In particular, it never applies `total cost / (1 - target profitability)` when any cost could depend on the proposed price.

If the proposed price changes, the author creates a new estimate version and reconfirms every cost that could depend on that price. An earlier version is never recalculated.

### 5.4 Immutable version and Director validation

Creating the estimate commits one immutable version awaiting a Director decision and containing:

- the Workspace, Company, Opportunity and Client Request references;
- every submitted input and explicit reason;
- every computed result;
- the calculation and configuration-rule versions;
- the creating membership and server time; and
- the Director-decision state.

The Director records exactly one source-backed decision against that exact version:

- `APPROVE` is the mandatory final validation of that version;
- `MODIFY` returns the work for a new corrected version and never edits the decided version; and
- `REJECT` rejects that version without deleting it.

The decision stores the Director membership and server time. A correction or recalculation creates a new version awaiting its own decision. No command edits, retags, deletes, backfills or re-points a prior version or its Director decision. Only `APPROVE` may make that exact version appear Director-validated; `MODIFY`, `REJECT` and an absent decision confer no approval and no Offer authority.

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

**Draft proposals:**

- the estimate is Company-owned and follows the Opportunity's existing Workspace and responsible Company;
- create, read and Director-validation authority are checked independently at command time and before returning an idempotent result;
- Opportunity readability remains an independent prerequisite;
- a user who can create an estimate cannot validate it merely because they created it; and
- no estimate amount, count, reason or existence crosses a Company boundary.

**Open decision:** the [Tenant, Company, Client and Authorization PRD](tenant-company-client-authorization-prd.md) must name the captured permissions, bundles and eligible Director validator. Existing Company Pricing User, Pricing Adjustment, Offer Preparer and Offer Approver assignments do not expand in place. “Director” is a business responsibility configured through the authorization owner, not a hard-coded person or identity.

## 7. History, configuration and compatibility

Each estimate version keeps the configuration identity and version used for any target, threshold, scale or rounding rule. A later configuration change affects only a new estimate version. Reads of history return stored inputs and outputs; they never recompute against current configuration.

Existing `ILLUSTRATIVE` Service Offerings, Tariff Versions, Pricing Rule Versions, Pricing Snapshots and adjustments remain unchanged. No record receives new provenance. No current Offer behaviour changes, including the O1 rule that an Offer references its immutable Pricing Snapshot without repricing it.

This Draft defines no handoff from a profitability estimate to an Offer. A later approved compatibility slice must decide whether and how an Offer may reference both records without replacing or mutating either one.

## 8. Activity, privacy and interface consequences

**Draft proposal:** one committed estimate version records one attributed creation event, and one committed `APPROVE`, `MODIFY` or `REJECT` records one attributed Director-decision event. Event metadata contains identifiers, version numbers and the decision code only. It contains no amount, percentage, cost label, strategic reason or Client-confidential text. Failed, denied and replayed commands record no success event.

Event projection remains outside this slice until the Activity Log authority explicitly allows it.

The interface shows the active Company, Opportunity, currency, every cost line, proposed price, target and computed result together. It shows whether the exact version awaits a Director decision or was approved, returned for modification or rejected. It preserves entered values after correctable errors and exposes empty, invalid, denied, stale, uncertain and success states. Accessibility, localization and narrow-width behaviour inherit the UX authority.

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

## 10. Proposed acceptance and test matrix

The expected outcomes below are **Draft proposals**. Authorization rows remain open until the owning authorization PRD names their permissions and eligible actors.

| Case                                               | Proposed expected outcome                                                                                                                                                                 | Status             |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Positive same-currency estimate                    | Exact total cost, profit, profitability and target difference are stored and reload unchanged                                                                                             | Proposed           |
| Proposed price is missing or malformed             | Refuse the field; commit nothing                                                                                                                                                          | Proposed           |
| Proposed price is zero                             | Refuse because profitability has a zero denominator; commit nothing                                                                                                                       | Proposed           |
| Proposed price is negative                         | Refuse; commit nothing                                                                                                                                                                    | Proposed           |
| Negative cost amount                               | Refuse the field; commit nothing                                                                                                                                                          | Proposed           |
| Zero-valued direct-cost line                       | Refuse the line and allow its omission; do not create meaningless lines                                                                                                                   | Proposed           |
| No direct-cost lines                               | Accept when required executor, fiscal and overhead inputs are present                                                                                                                     | Proposed           |
| Mixed currency                                     | Refuse the whole command; never convert or partially total                                                                                                                                | Proposed           |
| Exact retry                                        | Return the same immutable version and create no second event                                                                                                                              | Proposed           |
| Same idempotency key, changed payload              | Return a conflict and preserve the original version                                                                                                                                       | Proposed           |
| Repeated direct-cost submission key                | Refuse the payload; equal amounts under different keys remain separate and visible                                                                                                        | Proposed           |
| Suspected semantic double count                    | Show every line and require human bundle confirmation plus final Director validation; do not guess or merge                                                                               | Proposed           |
| Rounding boundary such as `1.005`                  | Apply the stored scale-2 `HALF_UP` Draft convention reproducibly                                                                                                                          | Proposed           |
| Configuration changes after commit                 | Old version and decision stay byte-for-byte reproducible; a new calculation names the new configuration version                                                                           | Proposed           |
| Proposed price changes with a price-dependent cost | Require a new version and reconfirm the dependent cost; calculate no fixed-cost minimum price                                                                                             | Proposed           |
| Creator lacks estimate authority                   | Safe denial with no record, amount, count or event disclosed                                                                                                                              | Authorization open |
| Validator lacks Director authority                 | Safe denial; version remains awaiting a Director decision                                                                                                                                 | Authorization open |
| Authority revoked before replay                    | Safe denial before returning the recorded result                                                                                                                                          | Proposed           |
| Concurrent Director decisions on one version       | The decision names the expected version; one result commits and a stale competitor commits nothing; prior versions and decisions remain immutable and are never invalidated retroactively | Proposed           |
| Earlier illustrative Snapshot and Offer            | No mutation, retagging, repricing or changed Offer result                                                                                                                                 | Proposed           |

The highest stable future test seam is the public business command and read interface, with persistence/restart proof for immutable history and negative cross-Company cases. This Draft names no endpoint or storage shape.

## 11. Remaining decision and reversible technical choices

One genuine product decision remains for the first implementation issue: the [Tenant, Company, Client and Authorization PRD](tenant-company-client-authorization-prd.md) must name the captured create, read and Director-decision permissions, their bundles and the memberships eligible to act as Director. Existing assignments cannot answer that question or expand silently.

The following are concrete **Draft proposals**, not requests for more external business evidence:

- proposed price must be greater than zero for this first percentage-based journey;
- monetary and percentage outputs use the versioned scale-2 `HALF_UP` convention in section 5.3;
- each immutable version receives at most one `APPROVE`, `MODIFY` or `REJECT` decision; and
- `MODIFY` produces a new version rather than changing the decided one.

Product approval may accept or change these reversible boundaries directly in this contract. No additional Client example, tariff, fiscal opinion, Offer Template or Contract Template is needed to decide them.

The following real policies are intentionally later and do not block the first journey: fiscal bases, price-dependent executor formulas, patent allocation, automatic overhead allocation, modifier order, coefficient values, approval thresholds beyond mandatory final validation, actual-cost comparison, Offer compatibility, templates and numbering.

## 12. Draft readiness assessment

This document is **Draft — evidence pending** and complete enough for owner review, not implementation. It has a bounded outcome, source provenance, proposed observable behaviour, explicit exclusions and a test matrix. Its reversible technical boundaries still need product approval, and its authorization owner has not yet named the required permissions and eligible Director membership.

A later implementation issue may become `ready-for-agent` only after:

1. this product contract, including the Draft proposals in section 11, is approved;
2. the authorization decision in section 11 is normalized in its owning PRD;
3. the issue names the public command/read seam and exact acceptance cases; and
4. every ordinary repository readiness gate passes.

This documentation issue changes no runtime behaviour and delivers no MVP coverage increase.
