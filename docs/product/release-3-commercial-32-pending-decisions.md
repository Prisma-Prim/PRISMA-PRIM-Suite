# PRD — Commercial Workflow §32: pending Offer and Contract decisions

**Status:** Approved bounded MVP contract — agent Standards then Spec/Product review and root delegated approval, 2026-10-27, under [#908](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/908), normalized by [#909](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/909). Product approval and runtime delivery are separate. Approval uses [Dan’s standing delegation](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237), not a personal owner review.

**Owner:** Dan Popescu. Inherits [Commercial Workflow §1](release-3-commercial-workflow-prd.md#1-authority-and-purpose)
and its cross-cutting authorization, Activity, Document, UX and Platform authorities.

## 32.1 Problem and outcome

An authorized Company approver can already decide exact commercial Versions but
must find each Opportunity first. From Home, the actor discovers complete bounded
pages of current Offer and Contract Versions without an internal decision, opens
the exact selected Version in its existing owner, performs its existing checks or
decision, then returns to a refreshed list. Pending means **no internal decision**;
it promises neither successful fresh checks nor Client acceptance or signature.

This is a read/navigation extension of [Offers §18](release-3-commercial-18-offers.md),
[Contracts §19](release-3-commercial-19-contracts.md), [model Offers §28](release-3-commercial-28-model-offer-generation.md)
and [model Contracts §30](release-3-commercial-30-model-contract-generation.md).
Those owners alone define commands, quality, receipts, revision, immutable history
and provenance. [Dashboard §22](release-1-operational-dashboard-acceptance-prd.md#22-pending-commercial-decision-discovery)
owns Home composition. The existing estimate queue remains independent.

User stories:

1. As a Company approver, I find current Versions awaiting my internal decision
   from Home without searching every Opportunity.
2. I inspect complete bounded pages, with explicit Company and Version meaning.
3. I open the exact selected Version in its native owner and perform its existing
   checks/decision, keeping literal intent for an uncertain-result retry.
4. I return safely and refresh to see changes, while denied or changed access
   discloses no hidden commercial metadata.

## 32.2 Actors and current authority

Each family has an independent Company region. Every page revalidates verified
identity, active Workspace/Internal User/membership, active Company context and
its live captured grants through existing authorization owners. Iurie is a
first-tenant persona, never a name check, hard-coded identity or new role.

| Pending family                    | Required existing authority                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer                             | Ordinary Offer read and approve, plus native Request/Opportunity read                                                                                                 |
| Model Offer                       | The preceding rights plus `commercial.offer.model_based.approve` (Approver v2)                                                                                        |
| Contract, Precontract or Addendum | Ordinary Contract read and approve, plus native Request/Opportunity read                                                                                              |
| Model Contract                    | The preceding Contract rights plus `commercial.contract.model_based.approve` (Approver v2) and independent current Offer read, as required for its existing decisions |

Absent ordinary family/Intake rights denies the entire family, including empty
reads. Missing additional model rights excludes that variant without hiding
otherwise authorized legacy Versions. In particular, Offer read is **not** a
prerequisite for legacy Contract decisions or frozen Contract reads. Ordinary v1
captures remain useful and gain no model authority. Null/unknown captures fail
closed. No Owner/Director title substitutes for an explicit grant. Company and
Workspace isolation applies before selection, pagination or metadata disclosure.

Queue metadata needs no Client, pricing, cost, model-configuration, Project,
Document or Activity read. It grants none. Opening an existing owner retains all
its independent current command/source/recipient prerequisites. Optional source
read refusal never erases independently readable frozen commercial content.

## 32.3 Exact matching set

An Offer row is its unsuperseded current head Version, with no recorded internal
decision, from supported `ILLUSTRATIVE` or `COMPANY_MODEL_ESTIMATE` content under
§32.2. The internal-only `APPROVED_ESTIMATE_INTERNAL_DRAFT` variant of [§26](release-3-commercial-26-estimate-offer-preparation.md)
is excluded: this discovery slice does not promote it into a supported quality/
approval journey, although its native rejection contract remains unchanged.

A Contract row is its unsuperseded current head Version with `PENDING` decision,
of supported `ILLUSTRATIVE` or `COMPANY_MODEL_OFFER` provenance under §32.2.
Include ordinary Contract, Precontract and Addendum, clearly labelled. Direct,
accepted-Offer and early-preparation legacy origins retain their existing meaning.
Unknown variants/kinds fail closed. Superseded, approved and rejected Versions
are absent. Internal decision, transmission, Client response and execution remain
separate dimensions. Do not invent an Opportunity-OPEN, expiry, live Client,
source-acceptance or fresh-check filter: an undecided Version can still require
correction or allow rejection in its existing owner.

## 32.4 Complete bounded read

Each owning family exposes a separate read-only queue with only an optional
opaque cursor. Fixed page size25, one-row lookahead, no total or whole-set cap.
Sort by exact Version creation instant ascending, then Version id ascending.
The cursor retains PostgreSQL timestamp precision and binds Workspace, Company
and family. Reject malformed, foreign, repeated, array or unsupported query
parameters with safe400 after relevant authorization. No arbitrary sort, page
size, search or filters are introduced.

Authorization and matching rows share a coherent read snapshot. Each page
reflects current state, not a frozen cross-request snapshot. Refresh restarts
from the beginning. A later page emptied by concurrent decisions offers Previous
and Refresh. Changes can move the matching set between reads; no false total or
exhaustiveness guarantee across different snapshots is shown.

Return only explicit Company/Workspace scope, record and exact Version ids,
displayed reference/version number, creation instant, Opportunity/Request ids
and readable Opportunity title, plus supported kind/provenance needed for honest
labels. No live Client identity lookup, price/cost/margin, terms, document body,
reason, signature, quality detail or source catalogue is included. No query,
page, refresh or navigation writes a business record, receipt, fence or event.

Preserve401, safe403 and existing uniform unavailable boundaries. Never disclose
foreign rows, references, cursors, counts or labels. The interface validates
unparsed responses before displaying or opening them: scope, supported variants,
required fields, duplicate ids and exact continuation identity. Malformed or
foreign responses are unavailable, with no partial data or navigation effects.

## 32.5 Home and exact continuation

Offer and Contract regions sit beside the independent estimate region. Only
authorized family entry points appear; every server read remains authoritative.
Show active Company, the internal pending meaning and each record's provisional/
non-official nature. Use existing Prisme controls and shared Romanian, Russian,
French and English copy. Distinguish loading, empty, later-page empty, denied,
unavailable/retry and success. Accessible Previous, Next and Refresh controls
support complete iteration; no background polling or automatic decision exists.

Selection opens the exact Opportunity/record/Version in the existing OfferPanel
or ContractPanel owner within that region. No decision form or mutation protocol
is duplicated. The exact identity must match the response. A concurrent decision,
successor or revocation uses the native current state/refusal; never silently
retarget to a newer head. Back refreshes from the beginning after the owner allows
leaving. No internal identifiers enter browser URL/history.

Each family captures only consumed identity/Company/session/grant context and
retires old pages/selection when that context changes. Abort or ignore late
responses, including late403, before data, navigation or shared-authority effects.
Sibling regions remain independent. Existing selected owners keep their native
authority retirement and immutable command behavior.

While the selected owner reports pending or uncertain protected work, the new
region's Back/refresh/reselection controls cannot unmount or replace it. A narrow
boolean report may expose this lifetime without exposing command payloads or
keys. Explicit identical retry retains literal intent/key under native owners;
no automatic retry or new intent is inferred. Locale-only changes preserve page,
selection, literal content, focus and protected work without new I/O. Global App
navigation retains its existing contract; no general router/unload policy is added.
Keyboard use and no horizontal overflow at1440px and390px are required.

## 32.6 Acceptance and delivery

Public REST against disposable PostgreSQL proves each family's empty/complete
multi-page result, timestamp/id ties, all supported variants/kinds, current-head
and decided exclusions, internal-draft exclusion, ordinary v1 and model v2,
independent/partial rights, live revocation, cross-Company/Workspace and strict
query/privacy boundaries. Reads leave business records/events unchanged.

App tests prove malformed/foreign/late responses, exact target and changed-head
behavior, explicit refresh after decision, denied/error recovery, all four
locales, and protection during pending/uncertain commands with identical retries.
The actual registered PostgreSQL App journey reaches a later page, opens the
exact native owner, runs its existing checks/decision and observes its removal
after return/refresh at desktop and narrow width, with inspected original
synthetic screenshots. Preserve existing assertion strength and scenario budgets.

Ordered delivery: merge this contract after Standards then Spec/Product review
and delegated approval; deliver one complete Offer runtime slice; then one complete
Contract runtime slice after a fresh readiness check. Each owns API/UI/real tests,
review, final integration proof and guarded merge. Tracker [#908](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/908)
owns readiness/receipts, not duplicated behavior. No schema migration, actual
grant, provider setup or manual user test is required by this contract.

Excluded: a generic approval engine, bulk decisions, urgency/ranking, deadlines,
All Companies, new thresholds or business policy, real pricing/tax, official
numbering, sending, acceptance/signature evidence, deployment and whole-MVP
credit. Mission-plan configuration is later work. MISSION-CLOSE-01 remains solely
in the Mission Obligations PRD§12 for one consolidated email; no new question here.
