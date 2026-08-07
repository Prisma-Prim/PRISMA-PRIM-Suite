# PRISMA-PRIM Suite

PRISMA-PRIM Suite supports the internal path from an incoming consulting request to an approved offer, contract, and cited search over approved organizational knowledge.

## Parties and intake

**Internal User**:
A PRISMA-PRIM or BIC collaborator invited to use the application.
_Avoid_: Admin, employee, operator

**Workspace**:
The single organizational data boundary used by the MVP.
_Avoid_: Tenant, organization account

**Client**:
The legal organization receiving consulting or related services.
_Avoid_: Customer, account, company record

**Contact**:
A person associated with a Client who participates in a Client Request, Offer, or Contract.
_Avoid_: Client user, lead

**Client Request**:
The original expression of a Client's need, preserved with its sources and analysis history.
_Avoid_: Lead, inquiry, intake case

**Request Source**:
An original text or file submitted as evidence for a Client Request.
_Avoid_: Attachment, upload

## Assisted analysis

**Analysis**:
A versioned AI proposal that identifies structured facts and uncertainties from one or more Request Sources.
_Avoid_: AI decision, extraction result

**Extracted Field**:
A proposed business value with a status, confidence, source, rationale, and optional human correction.
_Avoid_: Entity, prediction

**Confirmed**:
An Extracted Field accepted by an Internal User or matched to an already approved value.

**Inferred**:
An Extracted Field proposed from available evidence but still requiring human confirmation.
_Avoid_: Assumed, confirmed by AI

**Missing**:
A required Extracted Field for which no supported value is available.
_Avoid_: Empty, unknown when not required

**Contradictory**:
An Extracted Field for which the Request Sources provide incompatible values.
_Avoid_: Invalid, low confidence

**Critical Field**:
An Extracted Field that a selected Pricing Rule requires to be Confirmed before pricing can begin.
_Avoid_: Mandatory field

## Services and pricing

**Standard**:
An ISO standard, food-safety scheme, or other named framework relevant to a Client Request.
_Avoid_: Certification when the framework itself is meant

**Service**:
A deliverable that PRISMA-PRIM or BIC may provide to a Client, optionally related to one or more Standards.
_Avoid_: Product, package

**Tariff**:
A versioned monetary rate, unit, currency, tax configuration, and validity period used by pricing.
_Avoid_: Price when the versioned configuration is meant

**Pricing Rule**:
A versioned deterministic rule that maps Confirmed inputs and Tariffs to quantities and pricing lines.
_Avoid_: AI pricing, formula prompt

**Pricing Calculation**:
One immutable execution of the applicable Pricing Rules for a Client Request.
_Avoid_: Quote, estimate

**Pricing Snapshot**:
The immutable inputs, rule and Tariff versions, lines, adjustments, tax, rounding, and totals produced by a Pricing Calculation.
_Avoid_: Current price

## Commercial documents

**Offer**:
The commercial proposal made to a Client from a confirmed Client Request and a Pricing Snapshot.
_Avoid_: Quotation, quote, proposal

**Offer Version**:
An immutable revision of an Offer with its own content, checks, approval state, and generated files.
_Avoid_: Edited offer

**Quality Check**:
A deterministic check that produces a pass, warning, or error before an Offer Version or Contract Version can be approved.
_Avoid_: AI review, validation when the recorded check is meant

**Approval**:
The recorded human decision to accept or reject a specific immutable document version.
_Avoid_: Confirmation, acceptance

**Accepted Offer**:
An approved Offer that the Client has accepted and that may be converted into a Contract.
_Avoid_: Approved offer when client acceptance has not occurred

**Contract**:
The agreement generated from an Accepted Offer without re-entering approved business data.
_Avoid_: Agreement draft when no Contract entity exists

**Contract Version**:
An immutable revision of a Contract with its own checks, approval state, and generated files.

**Project**:
The minimal operational record created from an Accepted Offer and linked Contract.
_Avoid_: Client Request, engagement when no operational record exists

## Knowledge and traceability

**Document**:
A managed business artifact whose original file, ownership, status, and version history are preserved.
_Avoid_: File when lifecycle and governance are meant

**Approved Document**:
A specific Document Version authorized for operational use and eligible for knowledge indexing.
_Avoid_: Uploaded document, trusted by default

**Knowledge Chunk**:
A located fragment of an Approved Document retained with its document version and indexing metadata.
_Avoid_: Embedding, source

**Cited Answer**:
A knowledge-search response supported by displayed Knowledge Chunks and their exact Document Versions.
_Avoid_: Chat answer, generated answer

**Activity Log**:
The append-only record of actors, actions, affected versions, and metadata needed to trace critical operations.
_Avoid_: Application log, debug log
