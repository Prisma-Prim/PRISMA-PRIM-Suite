# PRD — Release 3B Illustrative Deterministic Pricing

**Status:** Provisional MVP execution scope — business validation pending  
**Version:** 0.4  
**Owner:** Dan Popescu  
**Release:** 3, slice R3B  
**Parent authority:** [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md)  
**Decision sources:** consolidated record sections 12.4–12.6, 14.5–14.6, 14.15–14.16  
**Owner direction:** [Dan, 2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981)  
**Publication-instant amendment:** [Dan, 2026-09-25, #387](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/387)  
**Deferred business validation:** [Iurie, after a demonstrable MVP](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/288#issuecomment-5749968989)

## 1. Authority, purpose and boundary

This PRD is the canonical observable-behaviour authority for the first R3B slices: the shared **Service Definition**, the **Company Service Offering**, the effective-dated **Tariff Version** and **Pricing Rule Version**, and the immutable **Pricing Snapshot** that records the exact versions it used.

It inherits the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md) and, through it, [Tenant/Company/Client Authorization](tenant-company-client-authorization-prd.md), [Activity Log](activity-log-accountability-prd.md), [UX/Configuration](ux-localization-configuration-prd.md), [Platform Operations](platform-security-reliability-operations-prd.md) and [AI Governance](ai-knowledge-governance-prd.md). It states only the pricing consequences and does not restate inherited rules.

It owns no other commercial behaviour. Request and Opportunity intake, next-action updates, commercial Activity projection, Offers, Contracts and Projects remain owned by the Commercial Workflow PRD and its other slices.

The durable domain identities of decision record 14.5 and 14.6 are preserved exactly: a Workspace-level Service Definition is distinct from a Company Service Offering, and Tariffs and Pricing Rules are separately versioned, effective-dated, Company-scoped records that a Pricing Snapshot references by exact version. Illustrative values may fill those records. They may not replace, merge or flatten them.

Two classes of statement appear below and are never mixed:

- **Source decisions** are already approved in the decision record, the Commercial Workflow PRD or `CONTEXT.md`. They are cited inline and are not negotiable here.
- **Provisional execution decisions** are reversible MVP choices taken under Commercial Workflow PRD sections 1 and 15 so the slices are executable before Iurie's demonstration. Section 13 lists them exhaustively. They are not claimed to be approved by Dan or Iurie as business policy, and no example rate, unit or tax value anywhere in this document, its tests or its fixtures is a real PRISMA-PRIM or BIC price.

## 2. Problem and outcomes

Deterministic pricing is the hinge between a qualified Opportunity and any later Offer, but real catalogues, tariffs, formulas, taxes and approval matrices do not exist yet. Waiting for them leaves the reusable mechanics — shared versus Company-owned catalogue identity, version and effective-date boundaries, exact provenance, decimal arithmetic, reproducibility and immutability — unbuilt and untested.

These slices must:

1. let an authorized user define a shared Service Definition once and record a Company Service Offering for it, while the illustrative instance created here claims no authorization to perform;
2. let an authorized configuration owner publish effective-dated, immutable Tariff Versions per offering and Pricing Rule Versions per Company;
3. let an authorized pricing user calculate from exactly the versions they declared, over typed values a human confirmed;
4. store an immutable Pricing Snapshot that names every source identity and version it used and reproduces its own total;
5. keep illustrative provenance visible on every record and rendering;
6. make it impossible for these slices to approve, transmit, generate, authorize performance or produce any real external effect.

## 3. Product principles

- One architecture, not a demo mode (decision record 14.16). Illustrative records use the same tables, identities, permissions and API that real configuration will use.
- Shared definition and Company offering stay separate (decision record 14.5). A Company offering never becomes the definition, and a definition never implies that any Company may sell or perform the service.
- Tariffs and Pricing Rules are Company-scoped, versioned and effective-dated (decision record 14.6). Their versions are referenced, never copied in place of a reference.
- A Pricing Snapshot retains the exact versions and values it used (decision record 14.6), reproduces its own total, and is never recomputed, corrected in place or re-pointed.
- Immutable source content is distinct from operational selection metadata. Content and declared validity never change after commit; only the takeover metadata is written, once, when a successor is published.
- Money is decimal and never floating-point; unlike currencies are never combined (decision record 12.4).
- Smallest coherent mechanism. One rule shape is implemented and one declared version is used per input; no resolution engine searches for a substitute version, and no pricing language is introduced.
- NestJS owns calculation, authorization, version allocation and selection. Clients never assign computed amounts, totals, provenance, selection state, record version numbers or actor identity. A client may reference a server-issued version number it displayed, to declare which version it selected and to carry optimistic concurrency; referencing an existing version never creates or renumbers one.

## 4. Actors and scope

| Actor                         | Capability in these slices                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Catalogue user                | Defines shared Service Definitions and records Company Service Offerings. Holds no tariff, pricing or approval authority. |
| Configuration owner           | Publishes and reads Tariff Versions and Pricing Rule Versions for the active Company. Cannot calculate.                   |
| Pricing user                  | Reads configuration and calculates snapshots on Opportunities they can already read. Cannot publish configuration.        |
| Company administrator         | Grants or revokes the captured bundles through existing Company assignment administration.                                |
| Opportunity responsible actor | Gains no implicit catalogue, configuration or pricing authority from responsibility alone.                                |
| AI capability                 | None. No analysis, proposal or suggestion participates in these slices.                                                   |

Workspace is the hard isolation boundary. A Service Definition is Workspace-shared vocabulary. Every Company Service Offering, Tariff Version, Pricing Rule Version and Pricing Snapshot has exactly one responsible Company resolved server-side from the active Company context (decision record 14.3, 14.15). No Company observes another Company's offerings, tariffs, rules, snapshots, counts, amounts or events.

## 5. User stories

1. As a catalogue user, I want to define a shared Service Definition once, so that several Companies can refer to the same service without copying it.
2. As a catalogue user, I want to record that my Company offers that service, so that pricing has a Company-owned subject.
3. As a catalogue user, I want my illustrative offering to be visibly non-operational, so that nobody reads it as proof that the Company may actually perform the service, while the durable offering record keeps its full meaning for a later governed real instance.
4. As a configuration owner, I want to publish an illustrative Tariff Version with its unit, amount, currency, tax and validity period, so that a price has an exact, dated, citable source.
5. As a configuration owner, I want to publish a Pricing Rule Version separately from tariffs, so that rounding and calculation shape change without rewriting rates.
6. As a configuration owner, I want republishing identical content to change nothing while my retry still returns the same answer.
7. As a configuration owner, I want a competing concurrent publication rejected rather than silently overwriting mine.
8. As a pricing user, I want to price only against versions I actually saw, so that no snapshot silently mixes versions or windows.
9. As a pricing user, I want a calculation refused when a declared version is superseded or not yet effective, rather than quietly substituted.
10. As a pricing user, I want a repeated submission not to create a second snapshot, even if configuration changed in between.
11. As any reader, I want a stored snapshot to reopen unchanged with its service, offering, tariff and rule versions, actor, time and, when I may already see it, its Client context.
12. As any reader, I want illustrative provenance visible on every record and every rendered amount.
13. As a reviewer, I want catalogue, configuration and pricing authority separated, so that no one of them implies another.

## 6. Domain records

Canonical vocabulary is owned by `CONTEXT.md`. Every record below carries `provenance` fixed to `ILLUSTRATIVE` in these slices, enforced by a database check constraint, and every read returns `provisional: true`.

**Recorded times are server-recorded logical instants.** Every time these records store — creation times, `supersededAt`, `calculatedAt` and `committedAt` — is an instant the server recorded in the same transaction as the fact it describes. It states when the server decided or wrote that fact. It is not the physical instant at which the transaction became durable or visible, which cannot be known before the commit completes and is never stored. Field names stay unchanged, including `committedAt`, whose meaning section 6.6 defines. Only the calculation instant of section 7 and the publication instant of section 11.3 decide validity.

### 6.1 Immutable content versus operational selection metadata

Every versioned record separates two groups of columns, and tests prove the separation:

- **Immutable source content:** the business values and the declared validity period. They are set once at insert and have no update path in any endpoint.
- **Operational selection metadata:** `supersededByVersionId`, `supersededAt` (the successor's publication instant, section 11.3) and `supersededFrom` (the instant from which the successor takes over, equal to the successor's `effectiveFrom`). Each is written once, when a successor is published, and never rewritten or cleared. Superseding never alters content, declared validity or provenance.

An effective-date window states what the business declared. The selection metadata states from when another row takes over. A snapshot records both the referenced version id and its number, so neither a later supersession nor a later window can reinterpret it.

**Derived selection state.** Reads expose a state computed at read time from timestamps, never a separately stored flag that could drift:

- `SCHEDULED` — `effectiveFrom` is in the future;
- `CURRENT` — `effectiveFrom <= now`, `now` is before `effectiveTo` when one is declared, and `supersededFrom` is absent or still in the future;
- `SUPERSEDED` — `supersededFrom` has passed, or the declared `effectiveTo` has passed.

Every state is evaluated against one explicit instant `now`: a read uses its own read instant, sampled once after it holds the scope protection of section 11.6, and a calculation uses the single calculation instant of section 7. At most one version per scope is `CURRENT` at any instant. A scope may have none: before the first version's `effectiveFrom` arrives, and after the head's declared `effectiveTo` has passed with no successor. Neither situation is an error state of the configuration; a calculation at such an instant is refused with the named not-effective error of section 7, and no other version is selected in its place. The head of a scope — the one version with no successor — is the only version a publication may supersede, and it may itself be `SCHEDULED`, so a scope may hold several scheduled versions in a chain, each taken over by the next from that successor's `effectiveFrom`.

### 6.2 Service Definition — Workspace level (decision record 14.5)

| Field          | Rule                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Identity       | Server-assigned id; Workspace assigned from the actor's Workspace. Never Company-scoped.                 |
| Code           | Required, 1–40 characters, `A-Z`, `0-9`, `_`, `-`; unique per Workspace; immutable.                      |
| Name           | Required, 1–160 non-whitespace characters. Immutable content in this slice.                              |
| Description    | Optional, at most 2,000 characters. Immutable content in this slice.                                     |
| Provenance     | Server-fixed `ILLUSTRATIVE`.                                                                             |
| Created by, at | Server-assigned creating membership, its Company at creation for attribution only, and creation instant. |

A Service Definition carries no money, no unit, no Company and no authority. It is shared vocabulary; creating one grants nothing to anybody, including its creator's Company.

### 6.3 Company Service Offering — Company level (decision record 14.5)

| Field              | Rule                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Identity           | Server-assigned id; Workspace and Company from the validated active Company context.             |
| Service Definition | Required reference to a Service Definition in the same Workspace, immutable after commit.        |
| Commercial label   | Optional Company-specific display text, at most 160 characters; never overrides the shared name. |
| Availability       | Server-fixed `AVAILABLE` at creation. Withdrawal is deferred; see section 14.                    |
| Provenance         | Server-fixed `ILLUSTRATIVE` in these slices.                                                     |
| Uniqueness         | At most one offering per (Company, Service Definition, provenance).                              |
| Created by, at     | Server-assigned creating membership and the server-recorded creation instant.                    |

**Durable meaning is preserved.** A Company Service Offering is the durable record that a Company declares it may sell or perform a shared Service Definition, under its own availability, authorization, commercial text, templates and pricing configuration (decision record 14.5, DEC-107). This PRD does not redefine that entity and does not reduce it to a catalogue listing.

**Only the illustrative instance is non-operational.** An offering created by these slices carries `ILLUSTRATIVE` provenance, and that instance alone asserts nothing about accreditation, scheme scope, competence, authorization to perform, or the right to quote or contract; no feature may treat it as such evidence (decision record 13.3). Its illustrative provenance is visible in every read.

**A real offering is a separate, governed record.** Because uniqueness is scoped by provenance, the same Company and Service Definition can later carry a real offering alongside the illustrative one. No illustrative record ever becomes real automatically, by edit, by backfill or by changing a provenance value. Activating a real offering, or migrating an illustrative one, requires a separately reviewed governed transition with its own approved authorization, evidence and acceptance. That transition is deliberately not designed here, and nothing in these slices may be read as its workflow.

### 6.4 Tariff Version — Company level, versioned and effective-dated (decision record 14.6)

Immutable source content:

| Field            | Rule                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| Identity         | Server-assigned id; Workspace and Company from the validated active Company context. |
| Offering         | Required reference to a Company Service Offering of the same Company; immutable.     |
| Version number   | Server-allocated positive integer, unique and monotone per offering, starting at 1.  |
| Unit             | Required, 1–24 characters, such as `day`, `audit`, `person`.                         |
| Unit amount      | Required decimal string matching section 8.1, in the version currency.               |
| Currency         | Required ISO 4217 code from the closed set `MDL`, `EUR`, `RON`, `USD`.               |
| Tax rate percent | Required decimal string matching section 8.1, `0` to `100`.                          |
| Tax label        | Required, 1–60 characters, recorded verbatim in the trace.                           |
| Effective from   | Required timestamp. Declared start of validity.                                      |
| Effective to     | Optional timestamp, strictly after effective from. Absent means open-ended.          |
| Provenance       | Server-fixed `ILLUSTRATIVE`.                                                         |
| Created by, at   | Server-assigned creating membership and the publication instant of section 11.3.     |

Operational selection metadata as in section 6.1. At most one head Tariff Version per offering — one row with no successor — enforced by a partial unique database index on the offering where `supersededByVersionId` is null. At most one version per offering is `CURRENT` at any instant, which follows from that head rule plus the publication rules in section 11.3.

### 6.5 Pricing Rule Version — Company level, versioned and effective-dated (decision record 14.6)

Immutable source content:

| Field              | Rule                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Identity           | Server-assigned id; Workspace and Company from the validated active Company context.                                     |
| Version number     | Server-allocated positive integer, unique and monotone per Company, starting at 1.                                       |
| Rule shape         | Server-fixed `UNIT_PRICE_TIMES_QUANTITY`. Stored explicitly so a second shape can be added without migration of meaning. |
| Rounding mode      | Server-fixed `HALF_UP`.                                                                                                  |
| Rounding scale     | Server-fixed `2`.                                                                                                        |
| Tax application    | Server-fixed `PER_LINE`: each line's tax uses its own Tariff Version rate.                                               |
| Label              | Required, 1–120 non-whitespace characters.                                                                               |
| Effective from, to | As in section 6.4.                                                                                                       |
| Provenance         | Server-fixed `ILLUSTRATIVE`.                                                                                             |
| Created by, at     | Server-assigned creating membership and the publication instant of section 11.3.                                         |

Operational selection metadata as in section 6.1. At most one head Pricing Rule Version per Company, enforced by the same partial unique index rule as section 6.4, and at most one `CURRENT` version per Company at any instant. Rounding and shape are server-fixed values recorded on the version, not user input: the version exists so that a later change is a new version rather than a reinterpretation of old snapshots.

### 6.6 Pricing Snapshot (decision record 14.6)

| Field                          | Rule                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Identity                       | Server-assigned id; Workspace and Company from the validated active Company context and the target Opportunity.                 |
| Opportunity and Client Request | The target Opportunity id and its Client Request id.                                                                            |
| Client context                 | The existing authorized optional Client projection of that Client Request; see section 9.                                       |
| Pricing Rule Version           | Referenced id **and** version number, plus copied shape, rounding mode, rounding scale and tax application.                     |
| Currency                       | The single currency shared by every referenced Tariff Version.                                                                  |
| Lines                          | One per input line; see section 8.2. Each line references its Service Definition, offering and Tariff Version by id and number. |
| Subtotal, tax total, total     | Decimals at rounding scale in the snapshot currency.                                                                            |
| Calculated by, at              | Server-assigned membership and the single calculation instant of section 7, which every validity check used; immutable.         |
| Committed at                   | Server-recorded logical instant of the snapshot write, sampled from the server clock after every validity check; see below.     |
| Version                        | Fixed at `1`. A snapshot is never versioned, edited, superseded, re-pointed or hard-deleted.                                    |

`committedAt` keeps its name but is audit information only: the server never uses it for validation, never substitutes it for the calculation instant, and does not claim it is the physical instant at which the transaction became durable (section 6).

A snapshot has no status, no approval field, no Offer link and no transmission state in these slices. Publishing, superseding or expiring configuration never changes a stored snapshot, and so never reaches a later artifact built from one; a later calculation creates a new snapshot instead (section 11.4).

## 7. Selection, effective dates and expected versions

Selection is declarative, never inferred. A calculation names the Pricing Rule Version number it displayed and, for each line, the offering and the Tariff Version number it displayed.

**One calculation instant.** The server samples the calculation instant exactly once per calculation, after authorization, after it holds the shared scope protection of section 11.6 for the Company's Pricing Rule scope and every named offering's Tariff scope, and before the first validity check. Every validity comparison below uses it, and it is recorded unchanged as the snapshot's `calculatedAt`. `committedAt` is a separate recorded instant (section 6.6) that is never used for validation and never written into `calculatedAt`. The calculation instant is also distinct from every publication instant; neither is reused for or substituted by the other. If an effective-window boundary, an expiry or a takeover instant passes between the calculation instant and the durable commit, the checks are not re-run and the trace is not recomputed: the recorded instant and the recorded versions stay consistent with each other by construction, and the scope protection keeps a concurrent publication from taking over a checked version before the calculation's transaction ends. A client never supplies the calculation instant.

The server then verifies, for every declared version, with `now` being the calculation instant:

1. the version belongs to the active Company (and, for a tariff, to the named offering);
2. the calculation instant falls inside its declared effective window, meaning `effectiveFrom <= now` and either no `effectiveTo` or `now < effectiveTo`;
3. the version has not yet been taken over, meaning `supersededFrom` is absent or still in the future, that is `now < supersededFrom`.

Together these mean the declared version is `CURRENT` at the calculation instant, by the derived rule in section 6.1. When no version of a scope is `CURRENT` at that instant — before the first version starts or after the head's `effectiveTo` — the declared version fails check 2, the calculation returns `TARIFF_NOT_EFFECTIVE` or `PRICING_RULE_NOT_EFFECTIVE`, and nothing is selected instead.

**Decision table.** The following fixed instants pin the boundary semantics that implementation tests assert. One offering holds three Tariff Versions published in order; v1 and v2 each received `supersededFrom` equal to the successor's `effectiveFrom` when that successor was published.

| Version | `effectiveFrom`        | `effectiveTo`          | `supersededFrom`       |
| ------- | ---------------------- | ---------------------- | ---------------------- |
| v1      | `2026-01-01T00:00:00Z` | absent                 | `2026-03-01T00:00:00Z` |
| v2      | `2026-03-01T00:00:00Z` | `2026-06-01T00:00:00Z` | `2026-04-01T00:00:00Z` |
| v3      | `2026-04-01T00:00:00Z` | `2026-05-01T00:00:00Z` | absent                 |

| Calculation instant    | Case                           | `CURRENT` | Declared v1 | Declared v2 | Declared v3 |
| ---------------------- | ------------------------------ | --------- | ----------- | ----------- | ----------- |
| `2025-12-31T23:59:59Z` | before the first start         | none      | refused     | refused     | refused     |
| `2026-01-01T00:00:00Z` | exactly at the first start     | v1        | priced      | refused     | refused     |
| `2026-02-15T12:00:00Z` | inside v1, v2 and v3 scheduled | v1        | priced      | refused     | refused     |
| `2026-03-01T00:00:00Z` | exactly at the first takeover  | v2        | refused     | priced      | refused     |
| `2026-04-01T00:00:00Z` | exactly at the second takeover | v3        | refused     | refused     | priced      |
| `2026-04-30T23:59:59Z` | last second of v3              | v3        | refused     | refused     | priced      |
| `2026-05-01T00:00:00Z` | exactly at the head's expiry   | none      | refused     | refused     | refused     |
| `2026-07-01T00:00:00Z` | after expiry, no successor     | none      | refused     | refused     | refused     |

"Refused" is the named not-effective error of section 12.2, or `STALE_TARIFF_VERSION` when the declared version has already been taken over at the calculation instant; both commit nothing. A version that is still `CURRENT` remains priceable even when a scheduled successor is the publication head. The boundaries are inclusive at `effectiveFrom` and exclusive at `effectiveTo` and `supersededFrom`, so no instant yields two `CURRENT` versions and the illustrated chain has no gap between its versions. At `2026-02-15T12:00:00Z` the scope's head is v3, so `expectedActiveVersionNumber` for a further publication is `3` while the priceable version is v1; the two numbers answer different questions and are exposed separately by the reads in section 11.5. Selection is therefore a comparison of stored timestamps, not a stored flag and not a scheduled job: **a version published today with a future `effectiveFrom` does not interrupt pricing, because the version it will replace stays `CURRENT` until that instant arrives.** Nothing runs at the changeover; the same comparison simply yields the successor from then on.

Any failure is an explicit, named error that commits nothing. The server never searches for another version, never falls back to a neighbouring window and never prices a line with an unnamed version. This keeps the effective-date boundary real while adding no resolution engine and no scheduler.

A calculation reads the declared rows only while it holds the shared scope protection, and a publication holds the same scope's protection exclusively (section 11.6). A calculation that acquires it first completes against the state before the publication, whose instant is sampled afterwards; a calculation that arrives during a publication waits, then samples its instant and reads that publication's outcome. A calculation therefore never commits against a version taken over concurrently, and a publication never races an in-flight calculation to an inconsistent result.

## 8. Calculation contract

### 8.1 Value grammars and exact arithmetic

Every monetary, quantity and rate value crosses the API as a string in a closed grammar. Anything else — `+`, leading zeros, exponents, whitespace, thousands separators, non-ASCII digits, `Infinity`, `NaN`, empty string — is a validation error, never a coerced value.

```text
unit amount       ^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$          0.0001 .. 9999999.9999, greater than zero
quantity          ^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$          0.001 .. 999999999.999, greater than zero
tax rate percent  ^(100(\.0{1,2})?|(0|[1-9][0-9]?)(\.[0-9]{1,2})?)$  0 .. 100
```

The leading-zero rule holds in all three grammars: `00`, `01` and `00.50` are rejected as a tax rate exactly as they are as an amount or a quantity. `0`, `0.50` and `100.00` remain valid.

Arithmetic uses scaled integer values held as JavaScript `BigInt`: amounts scaled by 10^4, quantities by 10^3, rates by 10^2, raw line results by 10^7. No decimal, math or currency dependency is added; `Number` never touches a monetary or quantity path, including serialization and test assertions.

Storage precision is sized for the declared maxima of 20 lines, 9-digit quantities and 4-decimal amounts, with headroom so no committed value can overflow:

| Column                                   | Type            | Worst case                        |
| ---------------------------------------- | --------------- | --------------------------------- |
| Quantity                                 | `numeric(12,3)` | `999999999.999`                   |
| Unit amount, tariff                      | `numeric(11,4)` | `9999999.9999`                    |
| Tax rate percent                         | `numeric(5,2)`  | `100.00`                          |
| Raw line amount, before rounding         | `numeric(28,7)` | ≈ `9.99e15`, 16 integer digits    |
| Line net, line tax, subtotal, tax, total | `numeric(24,2)` | ≈ `2.0e17` over 20 lines plus tax |

### 8.2 Deterministic trace

For each input line, in submitted order, the snapshot records:

1. `serviceDefinitionId`, `serviceCode` and `serviceName`, copied from the definition;
2. `offeringId` and the Company-specific label when present;
3. `tariffVersionId`, `tariffVersionNumber`, `unit`, `unitAmount`, `currency`, `taxRatePercent` and `taxLabel`, copied from the Tariff Version;
4. `quantity`, exactly as submitted;
5. `ruleShape`, copied from the Pricing Rule Version;
6. `rawLineAmount` = `unitAmount × quantity`, exact at scale 7;
7. `lineNet` = `rawLineAmount` rounded `HALF_UP` to the rule's rounding scale;
8. `rawLineTax` = `lineNet × taxRatePercent ÷ 100`, exact before rounding;
9. `lineTax` = `rawLineTax` rounded `HALF_UP` to the rule's rounding scale.

Then `subtotal` = sum of `lineNet`, `taxTotal` = sum of `lineTax`, `total` = `subtotal + taxTotal`, each exact at the rounding scale.

The stored trace reproduces `total` without reading any configuration record; recomputing from the referenced versions must give the same result, and both are tested.

### 8.3 Inputs and currencies

Inputs are typed by a human and confirmed by the act of submitting the calculation, attributed to the submitting membership. A structured `RequestAssessment` and AI-proposed values are deferred and will feed this same input contract.

A calculation carries 1–20 input lines, each naming a distinct offering of the active Company, its expected Tariff Version number, and a quantity. Duplicate offerings in one calculation are rejected. Quantity strings are stored exactly as submitted; no trimming, padding or normalization silently changes a stored input or an idempotency fingerprint.

Every referenced Tariff Version must share one currency. A mixed-currency selection is rejected with a named error; unlike currencies are never added, converted or aggregated, and no exchange rate, conversion record or consolidated total exists in these slices (decision record 12.4).

## 9. Client context

A Pricing Snapshot preserves the Client context that its Client Request already has, through the Client module's existing authorized projection and operational-reference fence. It adds no Client permission, no lookup path, no union logic and no new Client field, and it never modifies the original association (Commercial Workflow PRD section 8.4).

The snapshot stores the original Client reference of its Client Request, if any. Every read returns the same optional projection the commercial read already returns — the original reference plus the current visible projection — and omits it entirely when the reader may not currently see that Client. An omitted projection is never replaced by a placeholder, an identifier or a count. A Client Request with no association prices normally.

Calculation reads the Request's nullable stored original Client reference while holding a compatible lock on the Request row shared with the [one-time post-capture association contract](release-3-commercial-workflow-prd.md#20-approved-provisional-one-time-client-association-after-request-capture-450). When calculation races with the first association of a previously unassociated Request, obtaining that lock first means the immutable Snapshot stores no Client reference and association may commit afterwards. If association commits first, the new Snapshot stores the original Client reference. Neither ordering produces a partial association, strands a Client reference or rewrites an earlier Snapshot. A fresh calculation after association is the defined path to a Snapshot that carries the new association.

## 10. Permissions

Three captured Company bundles are introduced. All use the existing captured-bundle mechanism: an active administrator with `company.assignment.manage` explicitly grants or revokes a named bundle and permission-set version for an active same-Workspace membership and active Company. Null or unknown captured versions fail closed. No existing bundle, assignment or role receives any new permission, and no bundle implies another.

| Bundle                            | Version | Permissions                                                                                                                             |
| --------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Company Service Catalogue**     | v1      | `service.definition.read`, `service.definition.create`, `commercial.offering.read`, `commercial.offering.manage`                        |
| **Company Pricing Configuration** | v1      | `commercial.offering.read`, `commercial.pricing.configuration.read`, `commercial.pricing.configuration.manage`                          |
| **Company Pricing User**          | v1      | `commercial.offering.read`, `commercial.pricing.configuration.read`, `commercial.pricing.calculate`, `commercial.pricing.snapshot.read` |

Additional rules:

- publishing a Tariff Version requires `commercial.pricing.configuration.manage` **and** readability of the target offering;
- calculating requires `commercial.pricing.calculate` **and** current readability of the target Opportunity through its existing commercial read boundary. Pricing authority never substitutes for Opportunity visibility, and Opportunity visibility never implies pricing authority;
- reading a snapshot requires `commercial.pricing.snapshot.read` and the same current Opportunity readability;
- no bundle grants intake, next-action update, Client read, Activity Log read, assignment administration, approval, Offer, Contract or cross-Company authority.

A Service Definition is Workspace-shared but is created through a Company-scoped captured bundle, because commercial permissions are Company-scoped unless a clearly approved Workspace-level responsibility exists (decision record 14.15) and no Workspace-permission delegation surface exists today; the Workspace permission grant path is bootstrap-only. Creating shared vocabulary confers nothing on the creating Company. Section 13 records this as provisional, with a Workspace catalogue steward role as its replacement.

## 11. Commands, replay and concurrency

The public seam is the REST interface. NestJS validates authority, allocates version numbers, selects versions, computes amounts and commits each command with its event in one transaction. A failed validation, denial, stale expectation or persistence conflict commits none of it.

### 11.1 Mandatory command sequence

Every command follows this order, and tests assert the order itself:

1. **Authenticate**, then resolve the actor and active Company.
2. **Revalidate current authority**, reading the membership, Company context and captured bundle assignment with a row lock that serializes against concurrent revocation, so a command can never commit on authority revoked in a concurrent transaction.
3. **Revalidate current readability of the command's target** through the boundary that owns it — the Opportunity through the commercial read boundary for a calculation or snapshot read, the offering for a tariff publication, the Service Definition for an offering. A target the actor may no longer read returns the same safe not-found or `403` response as a first attempt.
4. **Take the idempotency lock** for the (actor, Company, key) and read any existing receipt. A fingerprint mismatch returns a conflict. A match returns the recorded result.
5. **Validate** the payload shape and grammars.
6. **Evaluate expected versions, effective windows and staleness**, locking the rows involved. A publication or calculation first takes the scope protection of section 11.6 and only then samples its single decision instant: the publication instant of section 11.3 or the calculation instant of section 7.
7. **Commit** the durable receipt together with any record and event, and report the result only after the database acknowledges the commit (section 11.6).

Authority and target-visibility revalidation therefore always precede replay, and replay always precedes stale-version evaluation. A replayed command never re-runs step 6, never samples a new decision instant and never fails because configuration or time moved on; an actor who lost the bundle or lost read access to the target always gets the normal safe denial and no result, so a receipt never becomes a channel for disclosing a target the actor can no longer read.

### 11.2 Durable idempotency receipts, including no-ops

Every command requires an idempotency key and writes a durable receipt row containing the key, the actor, the Company, the fingerprint, the outcome and the reference to the resulting record — **including when the outcome is `UNCHANGED` and no version and no event were created**. A no-op is therefore replayable and convergent exactly like a creation.

The fingerprint covers the Company and every command field exactly as submitted, including item order and decimal strings. Reusing a key with any different payload returns a safe conflict. Concurrent exact retries converge on one result.

### 11.3 Publication and the no-op policy

Publishing a Tariff Version or Pricing Rule Version carries `expectedActiveVersionNumber`: the number of the scope's current head as the caller displayed it, or `null` when the caller believes the scope has no version yet. A mismatch returns `STALE_ACTIVE_VERSION` naming the current head number and commits nothing. The field keeps its name; "active" here means the head, which is the only version a successor may follow.

When the submitted immutable content is identical to the head — comparing every content field and the declared effective window, with decimals compared by numeric value — the command allocates no version, records no event, writes the durable `UNCHANGED` receipt and returns the head. Otherwise it allocates the next number and returns `PUBLISHED`. The publication-time rules below apply only to such a material publication; a no-op applies none of them.

**One publication instant.** A publication that reaches step 6 of section 11.1 samples the server clock exactly once: after authority, target visibility, replay and payload validation (steps 2–5), after it holds the scope's exclusive protection (section 11.6) and has locked the head `FOR UPDATE`, and before the first publication-time rule. That value is the publication instant. Every rule below compares against it, and it is recorded unchanged as the new version's creation time and as the predecessor's `supersededAt`. A client never supplies it, and no second sample, database clock, observed commit time or safety margin takes part in a publication decision.

**A delayed commit does not invalidate a valid publication.** Validity is decided once, at the publication instant. If the successor's `effectiveFrom`, the head's `effectiveTo` or any other boundary passes between that instant and the durable commit, no rule is re-run, the publication is neither rejected nor re-dated, and the stored history stands: the successor takes over at its `effectiveFrom`. No read or calculation can observe the scope between the publication instant and the commit (section 11.6), so no observation contradicts that history. The durable commit instant is neither known when the publication is decided nor stored (section 6).

A publication never interrupts pricing. It writes `supersededByVersionId`, `supersededAt` and `supersededFrom` on the predecessor, where `supersededFrom` equals the successor's `effectiveFrom`. When the predecessor has not already expired at the publication instant, it stays `CURRENT` until `supersededFrom` and the successor takes over without a gap or scheduled job. An already expired head follows the explicit resumption rule below. Publication validates, and rejects with a named error:

- `effectiveFrom` earlier than the publication instant — back-dating a version is deferred, not silently accepted. An `effectiveFrom` equal to the publication instant is accepted and takes effect at once;
- `effectiveFrom` not later than the predecessor's `effectiveFrom`, which would make the order of two versions ambiguous;
- `EFFECTIVE_WINDOW_GAP` when the predecessor has not already expired at the publication instant (its `effectiveTo` is later than that instant) and its declared `effectiveTo` is earlier than the successor's `effectiveFrom`. This rejects a newly introduced future interruption. An absent `effectiveTo` cannot create this gap.

If the head's declared `effectiveTo` is at or before the publication instant, the scope has already stopped being priceable. The gap rejection above does not apply: a successor may resume the scope with `effectiveFrom` not earlier than the publication instant and strictly later than the predecessor's `effectiveFrom`. The elapsed unpriced interval remains unchanged; nothing is back-dated, no previous calculation becomes eligible, and calculation continues to refuse until the successor starts. This is a provisional resumption policy, not confirmed business policy.

Publication boundary examples for a head expiring at `2026-05-01T00:00:00Z` (all other validations satisfied):

| Publication instant    | Successor `effectiveFrom` | Outcome                                                                  |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------ |
| `2026-04-30T12:00:00Z` | `2026-04-30T12:00:00Z`    | Allowed; the successor takes over at once, at the publication instant.   |
| `2026-04-30T12:00:00Z` | `2026-05-01T00:00:00Z`    | Allowed; continuous takeover at expiry.                                  |
| `2026-04-30T12:00:00Z` | `2026-05-02T00:00:00Z`    | `EFFECTIVE_WINDOW_GAP`; a future interruption would be introduced.       |
| `2026-04-30T23:59:59Z` | `2026-05-01T00:00:00Z`    | Allowed; takeover at expiry even if the durable commit ends later.       |
| `2026-05-01T00:00:00Z` | `2026-05-02T00:00:00Z`    | Allowed resumption; no version is priceable before the successor starts. |
| `2026-05-02T00:00:00Z` | `2026-05-03T00:00:00Z`    | Allowed resumption; the already elapsed gap is not changed.              |
| `2026-05-02T00:00:00Z` | `2026-05-01T00:00:00Z`    | Rejected back-dating; expiry never permits retroactive activation.       |

Creating a Service Definition or an offering follows the same no-op rule with its own conflict:

- identical content returns `UNCHANGED` with a durable receipt and creates nothing — for a definition, the same code with the same name and description; for an offering, the same (Company, Service Definition, provenance) with the same commercial label;
- different content on the same identity returns a safe `409` with a named error and commits nothing: `SERVICE_CODE_CONFLICT` for a Workspace code that exists with another name or description, and `OFFERING_CONFLICT` for an existing offering of the same (Company, Service Definition, provenance) submitted with a different commercial label.

Neither conflict discloses anything beyond the fact that the identity is taken in a scope the actor may already read.

### 11.4 Calculation

Calculating is never a no-op: a deliberate recalculation with a new idempotency key creates a second independent snapshot, because a calculation is a historical fact rather than a current value. Both remain readable.

A replayed calculation returns the original snapshot unchanged **even when the Tariff or Pricing Rule Versions it used have since been superseded or have left their effective window**. Replay reproduces a recorded fact; it does not re-select or re-validate configuration.

Replay does, however, re-check who is asking and what they may see: current authority and current readability of the target Opportunity are revalidated first, per section 11.1. An actor whose pricing bundle remains but whose Opportunity read access was revoked receives the safe denial, not the recorded snapshot. The same rule governs reading a stored snapshot.

### 11.5 Reads

Bounded lists — Workspace Service Definitions, the active Company's offerings, and one Opportunity's snapshots — return newest first with a stable cursor, default 25 items and maximum 50, with no cross-Company count, amount or metadata. Configuration reads are Company-authorized and expose three things. A scope read returns, for one offering's tariffs or for the Company's pricing rules, the `CURRENT` version or `null` when none is `CURRENT` at its read instant (section 11.6), plus `headVersionNumber` — the number of the one version with no successor, which is the value `expectedActiveVersionNumber` must carry — so the priceable version and the optimistic-concurrency head are both explicit even when they differ. A scope version list returns every version of that scope, `SCHEDULED`, `CURRENT` and `SUPERSEDED` alike, newest first by version number with the same stable cursor, default 25 and maximum 50, each carrying its derived state, declared window and takeover metadata; no scheduled version between the `CURRENT` one and the head is omitted. Any version remains readable by id, including taken-over ones, so a snapshot's source stays reachable and every advance change stays visible before it starts. Reload after a process restart returns identical ownership, actor, timestamps, versions, lines and totals.

### 11.6 Publication atomicity, acknowledgement and coherent observation

**Atomicity.** A material publication writes the predecessor's selection metadata, the new immutable version, its durable receipt and its one event in one transaction: all four persist or none does. A failure at any of those writes, or a lost database connection before commit, leaves the scope, its receipts and its events exactly as they were.

**Acknowledgement.** Every command reports a committed result only after the database acknowledges the commit. When the server cannot tell whether a commit succeeded, it returns a safe server error that claims neither success nor that nothing was written. The caller then holds an explicit uncertain state (section 12.3) and retries with the same payload, expected version and idempotency key. That exact retry returns the recorded result if the first attempt committed (section 11.2); otherwise it runs as a new command with its own decision instant, so it may meet a back-dating, stale-head or other named rejection like any command. No committed publication is rolled back, deleted, re-dated or overwritten to compensate for a late or lost acknowledgement, and no rollback is reported that was not observed.

**Scope protection.** Each scope — one offering's Tariff Versions, or one Company's Pricing Rule Versions — has a transaction-scoped database lock that exists even while the scope has no version. A publication holds it exclusively from before its publication instant until its transaction ends. A scope read, a version list, a by-id read of a version, a publication replay that returns a version's derived state, and a calculation using the scope each hold it shared until their transaction ends, and each samples its read or calculation instant only after acquiring it. A by-id read may first resolve the version's immutable scope; it reads selection metadata only while holding the protection. A calculation replay or stored-snapshot read returns recorded facts, derives no configuration state and takes no scope protection.

**What waits, and how it is released.** Reads, replays and calculations of a scope wait while a publication of that scope is in flight; a publication waits for in-flight reads, replays and calculations of its scope; a second publication of the same scope waits and then meets the expected-head rule. This scope protection does not make shared observers block one another or serialize unrelated scopes or Companies. Existing authority, idempotency and other database locks may still make operations wait; this is a consistency guarantee, not a promise of zero waiting. A wait ends when the holding transaction ends — by commit, by rollback after any failure, or by the database's abort after a lost connection — and the protection is released only once that outcome is visible. No job or manual step is needed to release it.

**What observers see.** An operation that acquires the protection before a publication does completes on the earlier state, and the publication samples its instant only afterwards. An operation that arrives during a publication samples its instant after that publication has ended and sees exactly its outcome: the committed successor together with the predecessor's new metadata or, after a failure, the unchanged earlier state. No observation mixes rows from before and after a publication, and none made after a publication has sampled its instant reports the predecessor `CURRENT`, or the scope empty, at or after a start that publication accepted. At one and the same instant, serialization order decides: an operation ordered before the publication was decided on the earlier state, and a later supersession never reinterprets it (section 6.1). These guarantees are stated against the server clock and assume that it does not run backwards between serialized operations of one scope.

**Unchanged.** Authorization and revocation, Company and Workspace isolation, the expected-head conflict, replay and changed-payload rules, no-op ordering, named errors, immutable content and attribution are unchanged. Nothing here adds a permission, price, rounding rule, legal effect, external action, scheduler, queue or infrastructure.

## 12. Activity, errors and interface states

### 12.1 Activity

One committed publication, definition, offering or calculation records exactly one attributed event scoped to the responsible Company: `service_definition.created`, `company_service_offering.created`, `tariff_version.published`, `pricing_rule_version.published`, `pricing_snapshot.created`. Metadata contains identifiers, version numbers, provenance, currency and counts only — no amount, quantity, rate or label text. No event is recorded for a no-op, a failed validation, a safe denial, a stale-version conflict or a replay.

**These events are recorded but not projected.** No Activity read surface returns them in these slices. The commercial Activity projection allowlist is owned by the [commercial PRD section 17.3](release-3-commercial-workflow-prd.md#173-projection-rule-and-returned-content); it is an explicit allowlist, not a pattern that admits future event types. Projecting any pricing event is a separate decision in the owning Activity slice and must not be assumed by these tickets.

### 12.2 Errors

- missing verified identity returns `401`;
- inactive membership, missing bundle, unknown captured version, revoked authority or invalid active Company returns a safe `403` with no hidden metadata;
- an unknown or inaccessible Service Definition, offering, version, Opportunity or snapshot returns the same safe not-found response, whether the identifier is unknown, cross-Company, cross-Workspace or merely unreadable;
- field-specific validation without persistence for: grammar and range violations, empty or oversized lists, duplicate or malformed codes, duplicate offering in one calculation, unknown offering, effective window inverted, oversized label;
- named conflicts that return a safe `409` and commit nothing: `IDEMPOTENCY_CONFLICT`, `STALE_ACTIVE_VERSION`, `STALE_TARIFF_VERSION`, `STALE_PRICING_RULE_VERSION`, `TARIFF_NOT_EFFECTIVE`, `PRICING_RULE_NOT_EFFECTIVE`, `MIXED_CURRENCY`, `SERVICE_CODE_CONFLICT`, `OFFERING_CONFLICT`, `EFFECTIVE_WINDOW_GAP`. A stale conflict names the current head version number and nothing else about the other actor;
- no Company can infer another Company's offering, configuration, snapshot, count, label, amount or event by direct identifier.

### 12.3 Interface states

The catalogue screen lists Workspace Service Definitions and the active Company's offerings with a permanent illustrative label, and states plainly that this illustrative offering is not evidence of ability to perform. The configuration screen shows the `CURRENT` Tariff Version per offering and the `CURRENT` Pricing Rule Version with their validity windows, or an explicit "no current version" state when none is effective, lists every scheduled successor in order with the instant each takes over, identifies the head, and offers publication only to a configuration owner. The pricing panel on an Opportunity shows the declared versions, accepts a quantity per selected offering, renders the resulting snapshot line by line with subtotal, tax and total, and lists earlier snapshots newest first.

Empty, denied, stale, not-effective, validation, uncertain and success states are reachable and legible. An uncertain publication outcome keeps its payload, expected head and idempotency key for an explicit retry, and never shows success or that nothing was saved. Every rendered amount or total carries a visible provisional marker in the same view; a total never appears without one. Entered values survive a correctable validation error. Desktop, keyboard and narrow-screen behaviour inherit the UX PRD.

## 13. Provisional execution decisions

Every item is a reversible MVP choice taken by this PRD, not approved business policy, and none of them weakens a durable identity from decision record 14.5–14.6.

| #   | Provisional decision                                                                                                              | Replaced by                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Service Definition content is immutable with no edit path in this slice                                                           | A governed definition-correction slice                           |
| 2   | Service Definitions are created through a Company-scoped captured bundle, since no Workspace-permission delegation surface exists | A Workspace catalogue steward role in the authorization PRD      |
| 3   | Offerings are `AVAILABLE` at creation; withdrawal and re-offering are deferred                                                    | Real catalogue lifecycle evidence                                |
| 4   | Exactly one rule shape, `UNIT_PRICE_TIMES_QUANTITY`, with server-fixed `HALF_UP` scale 2 and per-line tax                         | Real recurring rule shapes and rounding practice per service     |
| 5   | At most one `CURRENT` Tariff Version per offering and Pricing Rule Version per Company at any instant, possibly none              | Real parallel price lists, segments or contract-specific tariffs |
| 6   | Declared expected versions with no fallback resolution                                                                            | A reviewed selection policy if real practice needs one           |
| 7   | Value grammars, ranges and storage precision in section 8.1                                                                       | Real tariff precision, quantities and invoicing practice         |
| 8   | Currency allowlist `MDL`, `EUR`, `RON`, `USD`, one per calculation                                                                | Confirmed trading currencies                                     |
| 9   | One tax rate and label per Tariff Version, with no fiscal authority claim (decision record 12.5)                                  | The approved tax capability                                      |
| 10  | Limits: 20 input lines per calculation, list default 25 and maximum 50                                                            | Observed real list sizes                                         |
| 11  | Three captured bundles and the permission names in section 10                                                                     | The approved commercial role matrix                              |
| 12  | Identical content republication is an `UNCHANGED` no-op with a durable receipt                                                    | Owner preference once configuration is edited routinely          |
| 13  | Recalculation with a new key creates a new snapshot rather than replacing one                                                     | Offer-driven snapshot selection rules in R3C                     |
| 14  | Snapshots attach to an Opportunity and carry its existing Client projection                                                       | Confirmed practice if pricing must precede qualification         |
| 15  | Human confirmation is the submitting act; no structured assessment record                                                         | The RequestAssessment slice                                      |
| 16  | Service Definition field policy: code 1–40 characters in the `A-Z`/`0-9`/`_`/`-` grammar, name 1–160, description at most 2,000   | Real catalogue naming and coding practice                        |
| 17  | Company Service Offering commercial label at most 160 characters and optional                                                     | Real Company commercial text practice                            |
| 18  | Tariff Version unit 1–24 characters as free text, tax label 1–60 characters                                                       | The real unit vocabulary and tax naming                          |
| 19  | Pricing Rule Version label 1–120 characters                                                                                       | Real configuration naming practice                               |
| 20  | Supersession takes effect from the successor's `effectiveFrom`, with back-dating and declared gaps rejected                       | Real advance-scheduling and correction practice                  |
| 21  | Uniqueness of an offering is scoped by provenance, so a governed real offering may later coexist with the illustrative one        | The approved governed activation or migration transition         |
| 22  | One server publication instant decides back-dating, gaps and resumption; reads and calculations serialize with it (section 11.6)  | Real configuration-change practice or another owner decision     |

None of rows 16–19 is a business-approved limit. They are drafting choices that make the slices testable; every one of them is an observable policy an implementation would otherwise invent, and Iurie has approved none of them. No length, code grammar or optionality here is evidence of first-tenant policy.

Row 22 is the one row the owner approved as an MVP rule ([#387](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/387)). It replaces the earlier requirement to validate against the physical commit time, which is not known when a publication must be decided; a later durable commit neither invalidates nor re-dates a valid publication (section 11.3). It is not Iurie-validated business policy and is replaced like any other row.

## 14. Exclusions

Excluded here: discounts, overrides, adjustments, margins, minimum fees, tiered or volume rules, package pricing, per-line currency conversion, definition or offering editing, offering withdrawal, catalogue import, version deletion, snapshot editing or approval, Offers, quality checks, approval thresholds, transmission, numbering, document generation, Contracts, Projects, dashboards, exports, AI proposals and structured assessments.

Owned elsewhere and untouched: Request and Opportunity intake, next-action updates, commercial Activity projection and its allowlist, Client authority and union behaviour, and every existing permission bundle.

## 15. Delivery boundary

Three vertical slices, in order. Each is independently testable; the later two are honestly blocked rather than flattened into one aggregate.

1. **R3B1 — shared Service catalogue and Company offering.** The first complete usable slice: define a shared service, record that the active Company offers it, read both. Delivers the Company Service Catalogue bundle.
2. **R3B2 — effective-dated Tariff and Pricing Rule Versions.** Publication, supersession, validity windows and the immutable-content boundary. Blocked by R3B1 because a tariff has no subject without an offering.
3. **R3B3 — immutable Pricing Snapshot.** Declared-version selection, the decimal trace, Client context and reopening. Blocked by R3B2 because there is nothing exact to reference before versions exist.

R3B2 and R3B3 are blocked by their predecessor's records and grants, not by real business evidence. Nothing in any of the three may be used for a real price.

## 16. Migration and compatibility

Additive. No existing Client Request, Opportunity, Client, Project, Document, assignment, permission bundle or Activity behaviour changes. Every schema change ships as a reviewed Drizzle migration.

Later real configuration replaces illustrative configuration by publishing new versions under a then-approved provenance value. It never rewrites, relabels or revalidates an existing illustrative record, and it never converts an illustrative offering into evidence of ability to perform. Adding a rule shape, adjustments or a selection policy extends the recorded version content rather than reinterpreting stored snapshots.

## 17. Security, reliability and observability

- Enforce Workspace and Company isolation in authorization-aware queries and database relationships, including the Opportunity and offering targets.
- Serialize authority and target-visibility revalidation against revocation, and reads, replays and version selection against publication (section 11.6), with database locks rather than application ordering alone.
- Report success only after the database acknowledges the commit. How durable an acknowledged commit is, and how closely host clocks agree, are properties of the deployed database and hosts that these slices neither change nor verify.
- Validate every direct identifier server-side and return non-leaking denials.
- Keep labels, amounts, rates and quantities out of event metadata and diagnostic logs; record safe correlation identifiers instead.
- Make version allocation, supersession, snapshot creation, receipt writing and event recording atomic, with head uniqueness per scope enforced in the database and the `CURRENT` state derived from stored timestamps rather than a mutable flag.
- Keep every slice usable with no AI and no external provider available.

No retention period, legal effect, fiscal validity, real price, ability to perform or approval authority is inferred by this PRD.

## 18. Testing and acceptance

The highest stable seam is the public REST interface against PostgreSQL, followed by one browser journey per slice. Tests never depend on private calculation internals.

Across the three slices, delivery proves:

1. a shared Service Definition is created once, is visible to another Company of the same Workspace, and grants that Company nothing;
2. an offering exists per (Company, Service Definition, provenance), is never readable by another Company, and its illustrative instance is marked non-operational while the record keeps its durable meaning;
3. identical-content creation or republication returns `UNCHANGED`, writes a durable receipt, allocates no version and records no event; a definition code that exists with another name or description returns `SERVICE_CODE_CONFLICT`, and an existing offering resubmitted with a different commercial label returns `OFFERING_CONFLICT`, both as safe `409` responses that commit nothing;
4. a published Tariff Version and Pricing Rule Version carry immutable content and declared windows; supersession writes only `supersededByVersionId`, `supersededAt` and `supersededFrom`, and no endpoint updates content;
5. stale `expectedActiveVersionNumber` conflicts; concurrent publications leave exactly one head per scope; back-dating before the publication instant and newly introduced future gaps are rejected, the latter as `EFFECTIVE_WINDOW_GAP`, while a start equal to the publication instant is accepted; resumption after an already expired head follows the explicit section 11.3 exception;
6. publishing a successor with a future `effectiveFrom` leaves the predecessor `CURRENT` and priceable until that instant, after which the same read yields the successor with no job, no manual step and no newly introduced interruption while the predecessor has not expired; with two scheduled successors, the scope read exposes the `CURRENT` version and the head number separately and the scope version list shows all three, including the intermediate scheduled one, through the bounded 25/50 cursor;
7. a calculation prices only declared versions: taken-over, not-yet-effective, expired, cross-Company and unknown versions each return their named error and commit nothing, with no fallback selection; every row of the section 7 decision table holds at its fixed instant, including a scope with no `CURRENT` version before the first start and at or after the head's expiry, where calculation refuses safely and a scope read returns `null` with the head number;
8. a snapshot's `calculatedAt` equals the one server-owned instant that every validity check used, `committedAt` is recorded separately as a logical write instant that no check uses, and a calculation whose used version reaches its `effectiveTo` or `supersededFrom` between that instant and the durable commit still records the checked versions and instant without recomputation or contradiction;
9. amounts match hand-computed decimal expectations, including a case where per-line `HALF_UP` differs from rounding an untruncated sum, and a maximum-magnitude case at 20 lines with 9-digit quantities and 4-decimal amounts that proves no overflow and no `Number` coercion;
10. every grammar rejects leading zeros identically, proven for `00`, `01` and `00.50` as a tax rate as well as an amount and a quantity, while `0`, `0.50` and `100.00` remain valid;
11. mixed-currency selection returns `MIXED_CURRENCY`;
12. the stored trace alone reproduces the total, and recomputation from the referenced versions gives the same result;
13. replay returns the original snapshot after the used versions are taken over and after their window closes, while a revoked actor's replay returns a safe denial and no result;
14. a replay and a stored-snapshot read by an actor who kept the pricing bundle but lost read access to the target Opportunity return the safe denial, not the recorded snapshot;
15. authority and target-visibility revalidation precede replay, and replay precedes stale evaluation, proven by a revoked-authority retry, a revoked-target-visibility retry and a stale-configuration retry;
16. a calculation cannot commit against a version taken over by a concurrent publication, and vice versa, through the scope protection of section 11.6;
17. the snapshot's Client projection matches the existing commercial projection, is omitted for a reader who may not see the Client, is absent when no association exists, and the original association is never modified; a deterministic race with post-capture association follows section 9's Request-row ordering and leaves every older Snapshot unchanged;
18. exactly one attributed event per committed command, with no amount, rate, quantity or label in metadata, and no pricing event visible through any Activity read surface;
19. every authority pair is enforced independently in both directions, and no existing bundle or assignment grants any new bundle implicitly;
20. direct-identifier denial and no list, count, amount or event leakage across Company and Workspace boundaries;
21. snapshot immutability: no endpoint edits, approves, deletes or re-points a stored snapshot, and none changes any provenance;
22. no endpoint converts an illustrative record into a real one, and no provenance value is editable;
23. usable empty, validation, stale, not-effective, denial and success states at desktop and narrow width, with the provisional marker present wherever an amount is rendered;
24. every case of the publication-guarantee matrix below holds in the slice it names.

**Publication-guarantee matrix.** These cases are required proofs, not a record of existing tests; a case counts as proven only when its test exists at the named seam and passes in CI. The Pricing Rule half of R3B2 ([#360](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/360)) must prove cases 1–10 for the Company rule scope, and the Tariff half must prove them once more for an offering scope. Cases 11–12 and the snapshot variants need Pricing Snapshots and are proven in R3B3. Fixed clocks set every instant. A barrier holds a database lock that the paused operation's next step needs and is released only after the test has observed the operation waiting on it; observers are counted as answered or waiting, never timed. No case uses sleeps, and further permutations of a proven case add no proof.

| #   | Case                                       | Deterministic setup                                                                                                                                                                                                                                                                                                             | Expected outcome                                                                                                                                                                                                                                                                                                                                                                                   | Seam and proving slice                                                       |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Start versus publication instant           | Fixed publication instant `P`; a first publication and a successor with `effectiveFrom` at `P + 1 ms`, `P` and `P − 1 ms`; identical head content resubmitted after its start and after its expiry                                                                                                                              | Later: `PUBLISHED`, successor `SCHEDULED`, predecessor `CURRENT` until the start. Equal: `PUBLISHED`, successor `CURRENT` at `P`. Earlier: back-dating rejection, nothing written. Identical: `UNCHANGED` receipt, no version, no event, no time rule. Creation time and `supersededAt` equal `P`                                                                                                  | REST/PostgreSQL; rules (#360), then tariffs                                  |
| 2   | Delayed commit crossing the start          | `P = 12:00:00.000`, `effectiveFrom = 12:00:00.001`; barrier after `P` and before commit; clock moved past the start; barrier released                                                                                                                                                                                           | `PUBLISHED` exactly as without the delay: no re-validation, recorded times equal `P`, `supersededFrom` equals `effectiveFrom`                                                                                                                                                                                                                                                                      | REST/PostgreSQL; rules (#360), then tariffs                                  |
| 3   | Expiry, gap and resumption                 | Every section 11.3 boundary row at its fixed instant; a head's `effectiveTo` passing while a publication is held after `P`                                                                                                                                                                                                      | Each row's outcome; rejections write nothing; an elapsed interval stays unpriceable; the held publication keeps the outcome decided at `P`                                                                                                                                                                                                                                                         | REST/PostgreSQL; rules (#360), then tariffs                                  |
| 4   | Concurrent publishers and stale head       | Two publications of one scope with the same expectation on separate connections, including two first publications with `null`; the first held after taking the exclusive protection                                                                                                                                             | One `PUBLISHED`; the other waits, then returns `STALE_ACTIVE_VERSION` naming only the new head and writes nothing; one head per scope                                                                                                                                                                                                                                                              | REST/PostgreSQL; rules (#360), then tariffs                                  |
| 5   | Readers during a publication               | A publication held after `P` with the clock moved onto its start; another authorized member's scope read, version list, predecessor by id and replay of an earlier publication; barrier released. Separately, a read held after taking the shared protection at instant `P` while a publication with `effectiveFrom = P` starts | Held observers answer only after the publication ends, all showing the successor `CURRENT`, the predecessor `SUPERSEDED` with its stored metadata, and one consistent head and count. The earlier read returns the previous state, the publication waits for it, and later reads show the successor at `P`                                                                                         | REST/PostgreSQL; rules (#360), then tariffs                                  |
| 6   | Rollback at each write                     | A database failure injected by a test fixture, never by mocking the module, at the predecessor-metadata write, the version insert, the receipt and the event in turn, with a read waiting on the protection                                                                                                                     | No success reported; none of the four writes persists; the waiting read is released and sees the unchanged state                                                                                                                                                                                                                                                                                   | REST/PostgreSQL; rules (#360), then tariffs; snapshot writes in R3B3         |
| 7   | Lost response and retry                    | A committed publication's response is discarded; the clock passes its start and another publication moves the head; retries with the same key and payload, with one field changed, and twice concurrently; an exact retry after a rolled-back attempt from case 6                                                               | Exact: the recorded result with the same id, number and times, without stale or time rejection; one version, receipt and event. Changed: `IDEMPOTENCY_CONFLICT`, nothing written. Concurrent: one result. After rollback: evaluated afresh at its own publication instant, never re-dated                                                                                                          | REST/PostgreSQL; rules (#360), then tariffs; calculation replay in R3B3      |
| 8   | Uncertain acknowledgement in the interface | The HTTP boundary answers a publication with a network failure, a timeout or a server error                                                                                                                                                                                                                                     | Explicit uncertain state; payload, expected head and key kept; the explicit retry resends them unchanged; neither success nor "nothing saved" is shown                                                                                                                                                                                                                                             | Component test; rules (#360), then tariffs                                   |
| 9   | Revocation and tenancy                     | A revocation committed on a separate connection while a publication waits on authority; the revoked member retries a committed publication and reads; members of another Company and Workspace use known ids                                                                                                                    | No commit on revoked authority; safe `403` and no recorded result; the same safe not-found across tenants, with no count, head number or event disclosed                                                                                                                                                                                                                                           | REST/PostgreSQL; rules (#360), then tariffs; Opportunity readability in R3B3 |
| 10  | Invalid instants and daylight saving       | Malformed or impossible instants and an `effectiveTo` not after `effectiveFrom`; in the interface, a local time in a daylight-saving gap or fold                                                                                                                                                                                | Field validation and nothing written, never normalized to a neighbouring instant; comparisons use absolute instants; the interface asks for a correction and keeps entered values instead of shifting the time                                                                                                                                                                                     | REST/PostgreSQL and component test; rules (#360), then tariffs               |
| 11  | Calculation against a publication          | A calculation held after its instant while a publication of a used scope starts; separately, a publication held before commit while a calculation of that scope arrives, with the clock moved past the successor's start                                                                                                        | First: the publication waits, the snapshot prices the checked versions, and the publication samples its instant after the calculation ends. Second: the calculation waits, samples its instant after the publication ends, and a declared predecessor already taken over is refused as stale with nothing written. `calculatedAt` is the checking instant and `committedAt` is recorded separately | REST/PostgreSQL; R3B3                                                        |
| 12  | Existing snapshots unchanged               | A stored snapshot; successors of each used version published with an immediate start, a scheduled start and after expiry; the clock moved past their starts; the snapshot reread and replayed                                                                                                                                   | Identical versions, lines, totals, `calculatedAt` and `committedAt`; recomputation equals the stored total; no snapshot row changed                                                                                                                                                                                                                                                                | REST/PostgreSQL; R3B3                                                        |

## 19. Evidence dependencies and readiness

These slices are authorized provisional MVP execution scope under Commercial Workflow PRD sections 1 and 15. Their implementation children may be published after this PRD is merged and the normal readiness gates pass; they do not wait for real tariffs, templates or Iurie's validation, because nothing here may be used for a real price or presented as ability to perform.

No new ADR is required. The slices stay inside the durable technical decisions in `AGENTS.md` and ADR [0002](../adr/0002-postgresql-with-drizzle.md), [0003](../adr/0003-nestjs-owns-business-decisions.md) and [0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md). Exact arithmetic uses scaled `BigInt` values and adds no dependency; that choice is recorded in the implementing pull request.

Real business evidence remains required before any of this becomes operational: the real service catalogue and units, real rates, currencies and tax treatment per service and Company, real validity and rounding practice, discount and approval rules, the ability-to-perform evidence a real offering must carry, and the real split between catalogue, configuration and pricing roles. Iurie validates these against the demonstration; that review may confirm or correct any decision in section 13 through new versions or focused follow-up issues, without rewriting recorded history.

Apart from row 22 of section 13, which Dan approved as an MVP rule on 2026-09-25 (#387), no statement in this document claims that Dan approved the exact provisional rules, or that Iurie supplied or approved any example value. Live GitHub trackers own current ticket readiness and delivery status.
