# PRD — Release 3B Illustrative Deterministic Pricing

**Status:** Provisional MVP execution scope — business validation pending  
**Version:** 0.2  
**Owner:** Dan Popescu  
**Release:** 3, slice R3B  
**Parent authority:** [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md)  
**Decision sources:** consolidated record sections 12.4–12.6, 14.5–14.6, 14.15–14.16  
**Owner direction:** [Dan, 2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981)  
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

1. let an authorized user define a shared Service Definition once and record that a specific Company offers it, without claiming the Company can actually perform it;
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
- Immutable source content is distinct from operational selection metadata. Content and declared validity never change after commit; only the selection status changes, and only once.
- Money is decimal and never floating-point; unlike currencies are never combined (decision record 12.4).
- Smallest coherent mechanism. One rule shape is implemented and one declared version is used per input; no resolution engine searches for a substitute version, and no pricing language is introduced.
- NestJS owns calculation, authorization, version allocation and selection. Clients never submit computed amounts, totals, provenance, version numbers, status or actor identity.

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
3. As a catalogue user, I want an offering to state availability only, so that nobody reads it as proof that the Company may actually perform the service.
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

### 6.1 Immutable content versus operational selection metadata

Every versioned record separates two groups of columns, and tests prove the separation:

- **Immutable source content:** the business values and the declared validity period. They are set once at insert and have no update path in any endpoint.
- **Operational selection metadata:** `status` (`ACTIVE` or `SUPERSEDED`), `supersededAt` and `supersededByVersionId`. A row moves `ACTIVE → SUPERSEDED` exactly once and never back. Superseding never alters content, declared validity or provenance.

An effective-date window states what the business declared. `ACTIVE`/`SUPERSEDED` states which row the product currently selects. A snapshot records both the referenced version id and its number, so a later supersession cannot reinterpret it.

### 6.2 Service Definition — Workspace level (decision record 14.5)

| Field          | Rule                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Identity       | Server-assigned id; Workspace assigned from the actor's Workspace. Never Company-scoped.                 |
| Code           | Required, 1–40 characters, `A-Z`, `0-9`, `_`, `-`; unique per Workspace; immutable.                      |
| Name           | Required, 1–160 non-whitespace characters. Immutable content in this slice.                              |
| Description    | Optional, at most 2,000 characters. Immutable content in this slice.                                     |
| Provenance     | Server-fixed `ILLUSTRATIVE`.                                                                             |
| Created by, at | Server-assigned creating membership, its Company at creation time for attribution only, and commit time. |

A Service Definition carries no money, no unit, no Company and no authority. It is shared vocabulary; creating one grants nothing to anybody, including its creator's Company.

### 6.3 Company Service Offering — Company level (decision record 14.5)

| Field              | Rule                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Identity           | Server-assigned id; Workspace and Company from the validated active Company context.             |
| Service Definition | Required reference to a Service Definition in the same Workspace, immutable after commit.        |
| Commercial label   | Optional Company-specific display text, at most 160 characters; never overrides the shared name. |
| Availability       | Server-fixed `AVAILABLE` at creation. Withdrawal is deferred; see section 14.                    |
| Provenance         | Server-fixed `ILLUSTRATIVE`.                                                                     |
| Uniqueness         | At most one offering per (Company, Service Definition).                                          |
| Created by, at     | Server-assigned creating membership and commit time.                                             |

**Ability-to-perform boundary.** An offering records only that this Company's catalogue lists the service. It asserts nothing about accreditation, scheme scope, competence, authorization to perform, or the right to quote or contract, and no later feature may treat it as such evidence (decision record 13.3). The illustrative provenance makes this explicit in every read.

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
| Created by, at   | Server-assigned creating membership and commit time.                                 |

Operational selection metadata as in section 6.1. At most one `ACTIVE` Tariff Version per offering, enforced by a partial unique database index.

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
| Created by, at     | Server-assigned creating membership and commit time.                                                                     |

Operational selection metadata as in section 6.1. At most one `ACTIVE` Pricing Rule Version per Company, enforced by a partial unique database index. Rounding and shape are server-fixed values recorded on the version, not user input: the version exists so that a later change is a new version rather than a reinterpretation of old snapshots.

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
| Calculated by, at              | Server-assigned membership and commit time.                                                                                     |
| Version                        | Fixed at `1`. A snapshot is never versioned, edited, superseded, re-pointed or hard-deleted.                                    |

A snapshot has no status, no approval field, no Offer link and no transmission state in these slices.

## 7. Selection, effective dates and expected versions

Selection is declarative, never inferred. A calculation names the Pricing Rule Version number it displayed and, for each line, the offering and the Tariff Version number it displayed.

The server then verifies, for every declared version:

1. the version belongs to the active Company (and, for a tariff, to the named offering);
2. its `status` is `ACTIVE`;
3. the calculation time falls inside its declared effective window, meaning `effectiveFrom <= now` and either no `effectiveTo` or `now < effectiveTo`.

Any failure is an explicit, named error that commits nothing. The server never searches for another version, never falls back to a neighbouring window and never prices a line with an unnamed version. This keeps the effective-date boundary real while adding no resolution engine.

`ACTIVE` rows used by a calculation are locked `FOR SHARE` for the transaction; a publication that would supersede them takes `FOR UPDATE` on the same rows. A calculation therefore never commits against a version superseded concurrently, and a publication never races an in-flight calculation to an inconsistent result.

## 8. Calculation contract

### 8.1 Value grammars and exact arithmetic

Every monetary, quantity and rate value crosses the API as a string in a closed grammar. Anything else — `+`, leading zeros, exponents, whitespace, thousands separators, non-ASCII digits, `Infinity`, `NaN`, empty string — is a validation error, never a coerced value.

```text
unit amount       ^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$          0.0001 .. 9999999.9999, greater than zero
quantity          ^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$          0.001 .. 999999999.999, greater than zero
tax rate percent  ^(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)$  0 .. 100
```

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
3. **Take the idempotency lock** for the (actor, Company, key) and read any existing receipt. A fingerprint mismatch returns a conflict. A match returns the recorded result.
4. **Validate** the payload shape and grammars.
5. **Evaluate expected versions, effective windows and staleness**, locking the rows involved.
6. **Commit** the durable receipt together with any record and event.

Authority revalidation therefore always precedes replay, and replay always precedes stale-version evaluation. A replayed command never re-runs step 5 and never fails because the world moved on; a revoked actor always gets the normal safe denial and no result.

### 11.2 Durable idempotency receipts, including no-ops

Every command requires an idempotency key and writes a durable receipt row containing the key, the actor, the Company, the fingerprint, the outcome and the reference to the resulting record — **including when the outcome is `UNCHANGED` and no version and no event were created**. A no-op is therefore replayable and convergent exactly like a creation.

The fingerprint covers the Company and every command field exactly as submitted, including item order and decimal strings. Reusing a key with any different payload returns a safe conflict. Concurrent exact retries converge on one result.

### 11.3 Publication and the no-op policy

Publishing a Tariff Version or Pricing Rule Version carries `expectedActiveVersionNumber`: `null` when the caller believes none is active, otherwise the exact number it displayed. A mismatch returns a stale-version conflict naming the current number and commits nothing.

When the submitted immutable content is identical to the current `ACTIVE` version of the same scope — comparing every content field and the declared effective window, with decimals compared by numeric value — the command allocates no version, records no event, writes the durable `UNCHANGED` receipt and returns the current `ACTIVE` version. Otherwise it allocates the next number, moves the previous `ACTIVE` row to `SUPERSEDED` with its `supersededAt` and `supersededByVersionId`, and returns `PUBLISHED`.

Creating a Service Definition or an offering behaves the same way: identical content returns `UNCHANGED` with a durable receipt; a different name or description under an existing Workspace code returns a named conflict rather than a silent second definition.

### 11.4 Calculation

Calculating is never a no-op: a deliberate recalculation with a new idempotency key creates a second independent snapshot, because a calculation is a historical fact rather than a current value. Both remain readable.

A replayed calculation returns the original snapshot unchanged **even when the Tariff or Pricing Rule Versions it used have since been superseded or have left their effective window**. Replay reproduces a recorded fact; it does not re-select or re-validate configuration. Only current authority is revalidated, per section 11.1.

### 11.5 Reads

Bounded lists — Workspace Service Definitions, the active Company's offerings, and one Opportunity's snapshots — return newest first with a stable cursor, default 25 items and maximum 50, with no cross-Company count, amount or metadata. Configuration reads return the `ACTIVE` version of an offering or Company and any version by id, including superseded ones, so a snapshot's source stays reachable. Reload after a process restart returns identical ownership, actor, timestamps, versions, lines and totals.

## 12. Activity, errors and interface states

### 12.1 Activity

One committed publication, definition, offering or calculation records exactly one attributed event scoped to the responsible Company: `service_definition.created`, `company_service_offering.created`, `tariff_version.published`, `pricing_rule_version.published`, `pricing_snapshot.created`. Metadata contains identifiers, version numbers, provenance, currency and counts only — no amount, quantity, rate or label text. No event is recorded for a no-op, a failed validation, a safe denial, a stale-version conflict or a replay.

**These events are recorded but not projected.** No Activity read surface returns them in these slices. The commercial Activity projection allowlist owned by [#313](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/313) contains exactly `client_request.created`, `opportunity.created` and `opportunity.next_action.updated`; it is an explicit allowlist, not a pattern that admits future event types. Projecting any pricing event is a separate decision in the owning Activity slice and must not be assumed by these tickets.

### 12.2 Errors

- missing verified identity returns `401`;
- inactive membership, missing bundle, unknown captured version, revoked authority or invalid active Company returns a safe `403` with no hidden metadata;
- an unknown or inaccessible Service Definition, offering, version, Opportunity or snapshot returns the same safe not-found response, whether the identifier is unknown, cross-Company, cross-Workspace or merely unreadable;
- field-specific validation without persistence for: grammar and range violations, empty or oversized lists, duplicate or malformed codes, duplicate offering in one calculation, unknown offering, effective window inverted, oversized label;
- named conflicts that commit nothing: `IDEMPOTENCY_CONFLICT`, `STALE_ACTIVE_VERSION`, `STALE_TARIFF_VERSION`, `STALE_PRICING_RULE_VERSION`, `TARIFF_NOT_EFFECTIVE`, `PRICING_RULE_NOT_EFFECTIVE`, `MIXED_CURRENCY`, `SERVICE_CODE_CONFLICT`. A stale conflict names the current version number and nothing else about the other actor;
- no Company can infer another Company's offering, configuration, snapshot, count, label, amount or event by direct identifier.

### 12.3 Interface states

The catalogue screen lists Workspace Service Definitions and the active Company's offerings with a permanent illustrative label, and states plainly that an offering is not evidence of ability to perform. The configuration screen shows the active Tariff Version per offering and the active Pricing Rule Version with their validity windows, and offers publication only to a configuration owner. The pricing panel on an Opportunity shows the declared versions, accepts a quantity per selected offering, renders the resulting snapshot line by line with subtotal, tax and total, and lists earlier snapshots newest first.

Empty, denied, stale, not-effective, validation and success states are reachable and legible. Every rendered amount or total carries a visible provisional marker in the same view; a total never appears without one. Entered values survive a correctable validation error. Desktop, keyboard and narrow-screen behaviour inherit the UX PRD.

## 13. Provisional execution decisions

Every item is a reversible MVP choice taken by this PRD, not approved business policy, and none of them weakens a durable identity from decision record 14.5–14.6.

| #   | Provisional decision                                                                                                              | Replaced by                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Service Definition content is immutable with no edit path in this slice                                                           | A governed definition-correction slice                           |
| 2   | Service Definitions are created through a Company-scoped captured bundle, since no Workspace-permission delegation surface exists | A Workspace catalogue steward role in the authorization PRD      |
| 3   | Offerings are `AVAILABLE` at creation; withdrawal and re-offering are deferred                                                    | Real catalogue lifecycle evidence                                |
| 4   | Exactly one rule shape, `UNIT_PRICE_TIMES_QUANTITY`, with server-fixed `HALF_UP` scale 2 and per-line tax                         | Real recurring rule shapes and rounding practice per service     |
| 5   | One `ACTIVE` Tariff Version per offering and one `ACTIVE` Pricing Rule Version per Company                                        | Real parallel price lists, segments or contract-specific tariffs |
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
- Serialize authority revalidation against revocation, and `ACTIVE` version selection against publication, with database locks rather than application ordering alone.
- Validate every direct identifier server-side and return non-leaking denials.
- Keep labels, amounts, rates and quantities out of event metadata and diagnostic logs; record safe correlation identifiers instead.
- Make version allocation, supersession, snapshot creation, receipt writing and event recording atomic, with `ACTIVE` uniqueness enforced in the database.
- Keep every slice usable with no AI and no external provider available.

No retention period, legal effect, fiscal validity, real price, ability to perform or approval authority is inferred by this PRD.

## 18. Testing and acceptance

The highest stable seam is the public REST interface against PostgreSQL, followed by one browser journey per slice. Tests never depend on private calculation internals.

Across the three slices, delivery proves:

1. a shared Service Definition is created once, is visible to another Company of the same Workspace, and grants that Company nothing;
2. an offering exists per (Company, Service Definition), is rejected as a duplicate, and is never readable by another Company;
3. identical-content creation or republication returns `UNCHANGED`, writes a durable receipt, allocates no version and records no event; a conflicting definition code returns `SERVICE_CODE_CONFLICT`;
4. a published Tariff Version and Pricing Rule Version carry immutable content and declared windows; supersession changes only status, `supersededAt` and `supersededByVersionId`, and no endpoint updates content;
5. stale `expectedActiveVersionNumber` conflicts; concurrent publications leave exactly one `ACTIVE` version per scope;
6. a calculation prices only declared versions: superseded, not-yet-effective, expired, cross-Company and unknown versions each return their named error and commit nothing, with no fallback selection;
7. amounts match hand-computed decimal expectations, including a case where per-line `HALF_UP` differs from rounding an untruncated sum, and a maximum-magnitude case at 20 lines with 9-digit quantities and 4-decimal amounts that proves no overflow and no `Number` coercion;
8. mixed-currency selection returns `MIXED_CURRENCY`;
9. the stored trace alone reproduces the total, and recomputation from the referenced versions gives the same result;
10. replay returns the original snapshot after the used versions are superseded and after their window closes, while a revoked actor's replay returns a safe denial and no result;
11. authority revalidation precedes replay, and replay precedes stale evaluation, proven by a revoked-authority retry and a stale-configuration retry;
12. a calculation cannot commit against a version superseded by a concurrent publication, and vice versa;
13. the snapshot's Client projection matches the existing commercial projection, is omitted for a reader who may not see the Client, is absent when no association exists, and the original association is never modified;
14. exactly one attributed event per committed command, with no amount, rate, quantity or label in metadata, and no pricing event visible through any Activity read surface;
15. every authority pair is enforced independently in both directions, and no existing bundle or assignment grants any new bundle implicitly;
16. direct-identifier denial and no list, count, amount or event leakage across Company and Workspace boundaries;
17. snapshot immutability: no endpoint edits, approves, deletes or re-points a stored snapshot, and none changes any provenance;
18. usable empty, validation, stale, not-effective, denial and success states at desktop and narrow width, with the provisional marker present wherever an amount is rendered.

## 19. Evidence dependencies and readiness

These slices are authorized provisional MVP execution scope under Commercial Workflow PRD sections 1 and 15. Their implementation children may be published after this PRD is merged and the normal readiness gates pass; they do not wait for real tariffs, templates or Iurie's validation, because nothing here may be used for a real price or presented as ability to perform.

No new ADR is required. The slices stay inside the durable technical decisions in `AGENTS.md` and ADR [0002](../adr/0002-postgresql-with-drizzle.md), [0003](../adr/0003-nestjs-owns-business-decisions.md) and [0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md). Exact arithmetic uses scaled `BigInt` values and adds no dependency; that choice is recorded in the implementing pull request.

Real business evidence remains required before any of this becomes operational: the real service catalogue and units, real rates, currencies and tax treatment per service and Company, real validity and rounding practice, discount and approval rules, the ability-to-perform evidence a real offering must carry, and the real split between catalogue, configuration and pricing roles. Iurie validates these against the demonstration; that review may confirm or correct any decision in section 13 through new versions or focused follow-up issues, without rewriting recorded history.

No statement in this document claims that Dan approved the exact provisional rules, or that Iurie supplied or approved any example value. Live GitHub trackers own current ticket readiness and delivery status.
