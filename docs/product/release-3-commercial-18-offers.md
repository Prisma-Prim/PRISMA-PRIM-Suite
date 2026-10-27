# PRD — Release 3 Commercial Workflow, section 18: R3C provisional Offer execution contract (#394)

Part of the [Release 3 Commercial Workflow PRD](release-3-commercial-workflow-prd.md). Section and subsection numbers are unchanged; cross-references such as “section 16.4” point to the numbered section in its own file, listed in the [core PRD index](release-3-commercial-workflow-prd.md#sections-by-capability).

## 18. R3C provisional Offer execution contract (#394)

This section normalizes the R3C contract that section 6 requires before any Offer implementation issue is ready. It applies decisions already recorded and Dan's standing delegation of reversible provisional MVP choices ([2026-09-20](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-5749633981), renewed on 2026-09-24 as recorded in [#394](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/394)). It is not new Iurie evidence; Iurie validates or corrects the provisional choices against a demonstration (section 15). Nothing here authorizes a real price, official number, sending, signature, acceptance or legal effect.

Statements are marked as one of three kinds:

- **Decided** — already approved; the cited source owns it and it is not renegotiated here.
- **P1–P16** — a reversible provisional MVP choice, listed with its replacement trigger in [section 18.12](#1812-provisional-mvp-choices). Where [Sarcina v1.0](sarcina-v1-traceability.csv) supports a choice, its `source_id` is cited; Sarcina is a candidate non-canonical source ([reconciliation](sarcina-v1-reconciliation.md)) that canonical PRDs and the decision record override wherever they decide.
- **OQ1–OQ3** — an open product question in [section 18.13](#1813-open-product-questions), with its exact silent source and the default this MVP uses meanwhile.

IDs such as S04-Q11 cite Iurie's answers in the [coverage matrix](iurie-business-answer-coverage.md). A Partial answer is confirmed but incomplete input; this section applies it only through a cited provisional choice.

### 18.1 Outcome and inherited boundary

This section owns the original illustrative Pricing Snapshot variant. The separate [approved-estimate internal preparation contract in section 26](release-3-commercial-26-estimate-offer-preparation.md) adds one closed price-source variant under the same Offer identity and Version history. Its explicit internal-only eligibility, authority and missing tax meaning override this section only for that variant; the existing Snapshot, representation, Quality Check and simulated execution contracts below remain unchanged.

The separate [approved-model generation contract in section 28](release-3-commercial-28-model-offer-generation.md)
adds a third closed Version variant: an exact approved economic source, selected
approved Company model, explicit human net/tax facts and frozen Romanian
representation. Its independent opt-in grants, checks and non-official simulated
eligibility apply only to that variant. It does not promote legacy internal
drafts, widen old captures or enable a new Contract source.

An authorized user of the Company responsible for an Opportunity turns one of its Pricing Snapshots into an Offer whose first complete Offer Version names one Client Legal Entity. Deterministic Quality Checks run against that exact version, and an approver approves or rejects it. A preparer records a simulated transmission of the approved version, and an approver records the Client's simulated response. A later change creates a new version and leaves earlier versions unchanged. Every Offer artifact is visibly provisional.

Inherited and not restated (Decided):

- sections 3, 7, 9 and 10 of this PRD;
- decision record [§14.7](consolidated-product-decision-record.md#147-offer-identity-and-immutable-versions), [§14.8](consolidated-product-decision-record.md#148-deterministic-quality-checks-and-approval), [§14.9](consolidated-product-decision-record.md#149-client-response-and-acceptance-evidence) and [§14.15](consolidated-product-decision-record.md#1415-permissions-auditability-and-dashboard-semantics), DEC-112–DEC-116;
- the immutable [Pricing Snapshot](release-3-illustrative-pricing-prd.md#66-pricing-snapshot-decision-record-146) and its [Client context](release-3-illustrative-pricing-prd.md#9-client-context);
- the captured-bundle convention of the [authorization PRD](tenant-company-client-authorization-prd.md#8-initial-permission-families), the [Activity Log event contract](activity-log-accountability-prd.md#4-event-contract), the [Governed Documents model](governed-documents-prd.md#4-domain-model) and the UX PRD;
- `CONTEXT.md` for Offer, Offer Version, Quality Check, Approval, Accepted Offer and Client Legal Entity.

### 18.2 Offer and Offer Version

The **Offer** is the durable identity (Decided, DR §14.7).

| Field                          | Rule                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity                       | Server-assigned id. Workspace and responsible Company come from the Opportunity, which belongs to the server-validated active Company (Decided, DR §14.3).                                                                                                                                                      |
| Opportunity and Client Request | The target Opportunity and its Client Request; immutable. At most one Offer per Opportunity (P1).                                                                                                                                                                                                               |
| Client Account                 | The Client Request's current authorized Client association, resolved and fenced through the Client owner as in [section 8.4](release-3-commercial-workflow-prd.md#84-create-read-reload-and-concurrency). The Offer keeps that original reference and follows the Client owner's current projection of it (P2). |
| Illustrative reference         | Positive integer allocated atomically per Company at Offer creation and never reused. It is labelled illustrative and is never an official number (P3, OQ2).                                                                                                                                                    |
| Revision                       | Server-owned integer starting at 1, incremented by every committed Offer command except a Quality Check run; it is the optimistic-concurrency token.                                                                                                                                                            |
| Created by, at                 | Server-assigned membership and instant.                                                                                                                                                                                                                                                                         |

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

**Adjustment compatibility gate.** O8 ([#559](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/559)) is delivered. Create Offer and Create Offer Version accept an immutable adjusted Snapshot under the same Snapshot rules as an unadjusted one. The server fixes the version's Template Version and Quality Check rule set at creation from the referenced Snapshot and never accepts them as input: any adjusted line binds `OFFER_ILLUSTRATIVE` v2 and `OFFER_QUALITY_ILLUSTRATIVE` v2; any other Snapshot binds v1 and v1 (sections 18.5 and 18.7). Before O8, these commands refused an adjusted Snapshot with `PRICING_SNAPSHOT_ADJUSTMENT_UNSUPPORTED` and committed nothing; that refusal no longer exists. O8 neither migrated nor automatically rechecked or rerendered existing Snapshots or Offer Versions; their existing explicit workflows remain available.

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

`OPPORTUNITY_NOT_OPEN` applies to every status other than `OPEN` that section 23 defines. After an internal rejection, the preparer continues by creating a new version.

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

Rule set version 1 continues to evaluate unadjusted Snapshots. O8 delivered `OFFER_QUALITY_ILLUSTRATIVE` version 2, bound to every new Offer Version whose Snapshot has an adjusted line (section 18.2). Version 2 keeps version 1's eight codes and failing severities (P8). Only `PRICING_SNAPSHOT_COHERENT` differs: it also checks the bounded adjustment trace of [Pricing PRD §§8.1–8.2](release-3-illustrative-pricing-prd.md#82-deterministic-trace) (type, reduction bound, reason, adjusted amounts, reductions, applying actor and instant, and adjusted final totals), and an incoherent trace gives `ERROR`. Recomputing the adjusted amounts in memory from the stored strings is checking, not repricing (P8): version 2 never applies, changes or re-prices the adjustment and writes nothing to the Snapshot. Existing Offer Versions and stored version-1 runs remain unchanged.

A run evaluates every rule at one server instant and records, per rule, `PASS` or its failing severity, together with the rule set version, actor and instant. A run is immutable and never recomputed; changing a rule creates a new rule set version, and earlier runs keep their version. The explicit run command stores a run for review. Approve and Record transmission each evaluate the version's bound rule set at their own decision instant and store that run with the decision only if the decision commits. The deciding actor acknowledges warnings by submitting exactly the current WARNING codes, and the acknowledgement is recorded with the decision; at transmission, only codes not already acknowledged at approval need acknowledgement. Approved exceptions and overrides are excluded.

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

Template Version v1 and every Offer Version that uses it remain byte-identical and continue to render unadjusted Snapshots. O8 delivered `OFFER_ILLUSTRATIVE` v2, bound to every new Offer Version whose Snapshot has an adjusted line (section 18.2). For each adjusted service line, v2 renders the original net and tax, then an adjacent fixed-discount row with the escaped stored reason, net reduction and tax reduction, followed by the adjusted net and tax. Unadjusted lines render as in v1, and the footer names `OFFER_ILLUSTRATIVE v2` (P11). It uses only the immutable Snapshot strings and final totals; it never calculates a discount, derives a new tax value or changes an existing Offer Version. The internal Offer view may also show the applying actor from the Snapshot trace, outside the rendered bytes, while event metadata and diagnostic logs remain free of amount and reason.

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

Section 25 projects these events in the commercial Activity Log under the section 17.3 rule and `commercial.offer.read`. Offer readers also see the recorded decision, transmission and response facts on the Offer itself.

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

| #   | Provisional choice                                                                                                                                                                                                                  | Replaced by                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| P1  | At most one Offer per Opportunity; alternatives are versions                                                                                                                                                                        | Real practice of parallel alternative Offers                        |
| P2  | An Offer requires the Client Request's current authorized Client association and an `OPEN` Opportunity, and keeps that one Client reference                                                                                         | Confirmed practice for Offers before Client identification          |
| P3  | A per-Company illustrative reference allocated at Offer creation; no official number                                                                                                                                                | OQ2 and an approved numbering configuration (DR §14.14)             |
| P4  | Version content is immutable from creation; every change, including before approval, creates a new version                                                                                                                          | Owner preference if draft editing is needed                         |
| P5  | Validity defaults to 30 days, ranges 1–365 days and is stored as an instant; no extension                                                                                                                                           | Iurie's answer to S04-Q24 (not mapped)                              |
| P6  | Scope note and commercial conditions as optional free text; no clauses or referenced Documents                                                                                                                                      | Governed Templates, clauses and formal Document Versions            |
| P7  | The primary entity is projected from the dossier identity, not materialized                                                                                                                                                         | A later materialization that maps `PRIMARY` references              |
| P8  | Rule set `OFFER_QUALITY_ILLUSTRATIVE` v1, and v2 for adjusted Snapshots with v1's codes and severities and an in-memory trace check, evaluated at each decision; warnings acknowledged by the deciding actor; no approved exception | Iurie's blocking errors and warnings (S04-Q19, S04-Q21, not mapped) |
| P9  | Company Offer Preparer v1 and Company Offer Approver v1 with the permission names in section 18.6                                                                                                                                   | The approved commercial role matrix                                 |
| P10 | Approver bundle granted to Iurie's memberships; one approval; no threshold or second approval; self-approval attributed; rejection reason required                                                                                  | OQ1                                                                 |
| P11 | A code-defined, unapproved Template Version v1, and v2 with fixed-discount rows for adjusted Snapshots, rendered as deterministic English HTML; no stored file                                                                      | Governed Templates, variants (S03-Q10) and Release 2 generation     |
| P12 | One simulated transmission per version; no recipient Contact                                                                                                                                                                        | Real channels and transmission evidence                             |
| P13 | Responses `ACCEPTED`, `REJECTED` and `EXPIRED` with simulated evidence; rejection reason; acceptance within validity; manual expiry; no withdrawal                                                                                  | OQ3, S04-Q24 and S04-Q27                                            |
| P14 | A superseded version accepts no further decision, transmission or response                                                                                                                                                          | Real negotiation practice                                           |
| P15 | Offer events projected under section 25                                                                                                                                                                                             | Iurie's validation of the section 25 action set                     |
| P16 | Pricing PRD §11-style guarantees with an Offer-level revision token                                                                                                                                                                 | Owner preference once real volumes exist                            |

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
14. exactly the events of section 18.10 with minimal metadata, none for runs, failures or replays; their projection is accepted under section 25;
15. the provisional marker on every read and rendering, and rejection of any other provenance, channel or evidence value by the API and the database;
16. empty, validation, denied, stale, uncertain, check-error, warning and success states at desktop and narrow width.
17. an Offer Version can reference an adjusted Snapshot, version-2 Quality Checks reproduce its final totals from the immutable trace, and Template Version v2 renders the same ordered adjustment rows and totals without repricing; an older unadjusted Snapshot, Offer Version, rule-set run and v1 rendering remain unchanged.

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

O1 remains the priority Offer slice and depends on delivered R3B3 plus its existing Client Legal Entity dependency only. None of #454, R3B4 and O8 blocks O1. O8 was delivered as an additive slice through its own approved issue, [#559](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/559), after R3B4.

Excluded from R3C here: creating, changing, approving or deleting pricing adjustments; percentage discounts, real Templates, clauses and variants, real prices, margin and discount thresholds, approved exceptions and overrides, Contracts (R3D), official numbering, real transmission channels, delivery receipts, recipient Contacts, e-signature, real acceptance evidence, withdrawal, validity extension, Offer-level next steps, deadlines and reminders (S04-Q08 and S04-Q09 Partial; the Opportunity next action remains the follow-up record), Opportunity outcome changes, referenced Documents, stored files and Document Registry entries, general Company-wide Offer lists and dashboards (the separate bounded [pending-decision discovery §32](release-3-commercial-32-pending-decisions.md) is an explicit exception), Activity projection of Offer events (now owned by section 25), export, deletion and AI assistance. R3C only reads the exact immutable R3B4 adjustment trace (O8).
