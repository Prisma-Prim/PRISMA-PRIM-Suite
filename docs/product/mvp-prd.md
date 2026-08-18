# PRISMA-PRIM Suite MVP Product Requirements

**Status:** Superseded — historical commercial-pilot specification  
**Successor navigation:** [Product Requirements Index](./prd-index.md)

This document remains a historical commercial capability source. It is not an implementation-ready roadmap. Current product scope and observable behaviour are owned by the [Product Vision PRD](./product-vision-prd.md) and applicable owning PRDs; the Product Requirements Index and ticketing standard route agents to the applicable gates, while current readiness and work status are owned by live GitHub trackers.

**Version:** 0.2  
**Date:** 2026-08-07  
**Pilot:** HACCP and ISO 22000 services for a food-industry Client

## Problem Statement

PRISMA-PRIM and BIC currently turn heterogeneous Client Requests into commercial and contractual documents through manual reading, repeated data entry, spreadsheet or document calculations, individual checks, and manual searching across organizational files. The process is slow, difficult to reproduce, and vulnerable to omitted information, inconsistent versions, calculation mistakes, unsupported wording, and weak traceability.

The organization needs AI assistance without delegating prices, legal facts, approvals, or certification decisions to a model. Internal Users must be able to see what came from a source, what was inferred, what is missing or contradictory, and who confirmed every critical value.

## Solution

Build an invitation-only internal application that supports one complete workflow:

> Client Request → assisted Analysis → human confirmation → deterministic pricing → checked Offer → human Approval → Accepted Offer → checked Contract → Approved Document search with citations.

The MVP proves this workflow on the HACCP and ISO 22000 pilot. AI produces structured, sourced proposals. Deterministic modules calculate prices and enforce workflow rules. Internal Users confirm critical facts and approve immutable document versions. Search answers use only Approved Documents and expose their sources.

The product must work with clearly marked demonstration configuration before real Tariffs, templates, clauses, and historical cases are supplied. Missing business configuration remains visible and replaceable; it never becomes an implicit rule.

## Actors

- **Internal User:** an invited PRISMA-PRIM or BIC collaborator. All invited users have the same application permissions in the MVP.
- **Business Owner:** the Internal User who validates real Tariffs, templates, clauses, evaluation cases, and pilot results.
- **Client:** the legal organization requesting or receiving services. A Client does not access the MVP directly.

## User Stories

### Access and accountability

1. As an Internal User, I want to sign in through an invitation-only identity flow, so that business data is not publicly accessible.
2. As an Internal User, I want my identity linked to my business actions, so that approvals and critical changes are attributable.
3. As a Business Owner, I want all MVP data isolated in one Workspace, so that the pilot remains simple without losing organizational ownership.
4. As an Internal User, I want critical actions recorded in an Activity Log, so that I can reconstruct who changed or approved what and when.

### Clients and requests

5. As an Internal User, I want to create and update a Client and its Contacts, so that later work reuses approved organizational information.
6. As an Internal User, I want to find a Client and review its Requests, Offers, Contracts, Projects, and Documents, so that I have one operational history.
7. As an Internal User, I want to create a Client Request from pasted text, so that an email or conversation can enter the workflow without an email integration.
8. As an Internal User, I want to attach PDF, DOCX, and XLSX Request Sources, so that existing business documents can be analyzed.
9. As an Internal User, I want every Request Source preserved unchanged with its author and import date, so that analysis remains traceable to original evidence.
10. As an Internal User, I want unsafe file types, oversized files, and invalid content rejected clearly, so that imports do not compromise the system.
11. As an Internal User, I want to associate a Client Request with an existing Client or create one during intake, so that duplicate entry is minimized.

### Assisted analysis and confirmation

12. As an Internal User, I want the language of a Client Request detected, so that Romanian, Russian, and English sources can enter one workflow.
13. As an Internal User, I want an Analysis to propose structured values rather than only prose, so that results can be reviewed and used safely.
14. As an Internal User, I want an Analysis to identify Client identity, contact details, sector, intent, Standards, Services, employees, sites, requested timing, and communication language, so that the pilot captures the information needed downstream.
15. As an Internal User, I want every Extracted Field to show its source and short rationale, so that I can verify the proposal quickly.
16. As an Internal User, I want Extracted Fields separated into Confirmed, Inferred, Missing, and Contradictory states, so that uncertainty cannot be mistaken for fact.
17. As an Internal User, I want suggested Services displayed as recommendations rather than decisions, so that the system does not overstate its authority.
18. As an Internal User, I want to confirm, correct, reject, or supply an Extracted Field, so that the business record reflects human judgment.
19. As an Internal User, I want corrections to retain the proposed value, source, actor, and date, so that evaluation can distinguish model output from human intervention.
20. As an Internal User, I want to rerun Analysis without deleting earlier results, so that prompt or source changes remain comparable.
21. As an Internal User, I want pricing blocked until the selected Pricing Rule's Critical Fields are Confirmed, so that unsupported inputs cannot become prices.
22. As an Internal User, I want Analysis failures and retries visible without corrupting the Client Request, so that external AI failures are recoverable.

### Services, tariffs, and deterministic pricing

23. As a Business Owner, I want to manage versioned Standards, Services, Tariffs, and Pricing Rules, so that commercial configuration changes are explicit.
24. As a Business Owner, I want a Tariff to carry its unit, amount, currency, tax, validity period, status, and required inputs, so that its applicability is reproducible.
25. As a Business Owner, I want demonstration Tariffs and rules visibly marked as non-production data, so that nobody mistakes fixtures for real commercial policy.
26. As an Internal User, I want a Pricing Calculation to use only Confirmed inputs and active applicable configuration, so that the result is deterministic.
27. As an Internal User, I want every quantity, unit rate, subtotal, adjustment, tax, rounding step, and total explained, so that I can verify the result.
28. As an Internal User, I want a Pricing Snapshot to preserve the exact input and configuration versions, so that recalculation never rewrites history.
29. As an Internal User, I want a change to a relevant input, Tariff, quantity, tax, or discount to create a new Pricing Calculation, so that previous totals remain auditable.
30. As an Internal User, I want excessive discounts flagged and finalization blocked until explicit Approval, so that exceptional commercial decisions remain controlled.
31. As a Business Owner, I want currency, tax, rounding, numbering, and discount thresholds configurable, so that absent real values do not become hard-coded assumptions.

### Offer construction and approval

32. As an Internal User, I want to create an Offer from a confirmed Client Request and Pricing Snapshot, so that approved information is reused without re-entry.
33. As an Internal User, I want each Offer Version to have a unique number, validity period, Client, Contact, Services, Standards, totals, template version, and provenance, so that it can stand as a complete commercial record.
34. As an Internal User, I want Quality Checks to verify required fields, Confirmed critical data, pricing totals, currency, tax, discounts, configuration validity, template variables, legal-data provenance, Standards, dates, and numbering, so that predictable errors are caught before Approval.
35. As an Internal User, I want Quality Check errors to block Approval and warnings to require explicit acknowledgement, so that risk is visible and enforceable.
36. As an Internal User, I want to preview the Offer Version with its sources, corrections, Pricing Snapshot, and Quality Checks, so that I can make an informed Approval decision.
37. As an Internal User, I want to approve or reject a specific Offer Version with an attributable decision, so that authorization is unambiguous.
38. As an Internal User, I want an approved Offer Version locked, so that later edits cannot alter what was authorized.
39. As an Internal User, I want an edit after Approval to create a new draft Offer Version, so that approved history remains immutable.
40. As an Internal User, I want an approved Offer Version exported to DOCX and PDF from an approved template, so that it can be used in the existing business process.
41. As an Internal User, I want the `sent`, `accepted`, `rejected`, and `expired` states recorded manually, so that the MVP tracks outcomes without premature email automation.

### Contract and project

42. As an Internal User, I want an Accepted Offer to generate a Contract without re-entering confirmed Client, Service, Standard, pricing, and condition data, so that transcription errors are reduced.
43. As an Internal User, I want Contract clauses selected from configured approved content rather than generated legal invention, so that legal language remains controlled.
44. As an Internal User, I want each Contract Version to have independent numbering, Quality Checks, Approval, locking, and exports, so that contractual governance matches the Offer workflow.
45. As an Internal User, I want Contract creation to create a minimal linked Project, so that the accepted commercial work has an operational record.

### Approved knowledge search

46. As an Internal User, I want an Approved Document to be eligible for knowledge indexing, so that trusted organizational material can be searched.
47. As a Business Owner, I want draft, rejected, archived, or superseded versions excluded by default, so that obsolete or unapproved content does not support answers.
48. As an Internal User, I want each Knowledge Chunk linked to its exact Document Version and location, so that evidence can be inspected.
49. As an Internal User, I want a Cited Answer to display supporting fragments, document titles, versions, locations, and relevance, so that I can verify it.
50. As an Internal User, I want the system to warn or refuse when approved sources are insufficient, so that fluent unsupported answers are not presented as knowledge.
51. As a Business Owner, I want Tariffs and legal facts excluded from free-form RAG authority, so that governed data remains sourced from configuration or Confirmed records.

### Dashboard and evaluation

52. As an Internal User, I want a small dashboard of Requests, Offer states, generated Contracts, cycle time, corrections, and Quality Check results, so that I can see pilot activity.
53. As a Business Owner, I want evaluation cases to store expert reference results and manual-versus-assisted timing, so that usefulness is measured against real work.
54. As a Business Owner, I want field-level extraction, pricing, correction, traceability, and cited-answer measures, so that model quality is not judged by impression.
55. As a Business Owner, I want at least 20 comparable anonymized cases supported when real data is available, so that the MVP can be evaluated consistently.

## Implementation Decisions

### Product invariants

- AI output is a proposal. It cannot approve documents, set governed prices, invent legal facts, or make certification decisions.
- Pricing is deterministic, versioned, reproducible, and independent of the language model.
- A Critical Field must be Confirmed before a dependent Pricing Calculation can start.
- An approved Offer Version or Contract Version is immutable. A change creates a new draft version.
- Quality Check errors block Approval. Warnings require an explicit acknowledgement attached to the decision.
- Only Approved Documents are indexed by default. Every Cited Answer exposes supporting Knowledge Chunks and their exact Document Versions.
- Every critical transition is enforced by the business API and recorded in the Activity Log.
- Missing real business values are explicit configuration gaps or clearly marked demonstration data.

### Workflow states

- Client Request: `draft → analyzing → needs_confirmation → ready_for_pricing → processed → archived`.
- Analysis: `pending → running → completed | failed → superseded`.
- Tariff: `draft → active → archived`.
- Offer: `draft → qa_failed | pending_approval → approved → sent → accepted | rejected | expired`, with replaced versions marked `superseded`.
- Contract: `draft → qa_failed | pending_approval → approved → sent → signed | rejected`, with replaced versions marked `superseded`.
- Document: `draft → pending_approval → approved | rejected → archived | superseded`.
- Backend commands own transitions; clients request actions rather than setting arbitrary status values.

### Application shape

- React, Vite, and TypeScript provide the internal web application.
- NestJS owns the REST API, business rules, workflow transitions, permissions, auditability, and orchestration.
- PostgreSQL is the system of record; Drizzle defines schemas and reviewed migrations.
- Clerk provides invitation-only identity. A local user record connects the external identity to business actions.
- The MVP uses one Workspace while preserving ownership fields where they prevent a costly future data migration.
- NestJS may call a configurable external model provider for initial structured Analysis. Provider outputs are validated before persistence.
- A separately deployable Python worker is added only when a concrete parsing, specialized NLP, embedding, reranking, local-model, or long-running workload justifies it.
- REST contracts are documented with OpenAPI.
- File storage, background job infrastructure, model provider, embedding provider, DOCX generation, and PDF conversion are selected by the ticket that first needs them, using the smallest option compatible with this specification.

### Data and versioning

- Preserve original Request Sources and successive Analyses.
- Preserve both proposed and human-corrected Extracted Field values with provenance.
- Preserve Pricing Snapshots and document versions rather than updating approved history in place.
- Guarantee Offer and Contract number uniqueness in the database while keeping the numbering convention configurable.
- Record AI task type, provider, model, prompt or pipeline version, input references, structured output, duration, errors, and available usage estimates.
- Avoid creating entities for deferred certification-body, training, finance, scheduling, or commercial multi-tenant modules.

### Initial screens

- Sign-in and invitation acceptance.
- Dashboard.
- Client list and detail.
- Client Request list, creation, sources, and Analysis review.
- Standard, Service, Tariff, and Pricing Rule library.
- Offer construction, Pricing Snapshot explanation, Quality Checks, preview, and Approval.
- Contract list, detail, checks, preview, and Approval.
- Document library and versions.
- Approved knowledge search with citations.
- Minimal Activity Log.

### User experience quality and evolving Atlas Blue baseline

- The production interface must follow one coherent visual and interaction system rather than allowing each implementation ticket to invent its own page patterns.
- Atlas Blue, preserved in `/ui-baseline`, is the preferred visual and interaction starting point. It is an evolving baseline rather than a frozen or formally approved final design.
- Production capabilities may now be delivered as narrow vertical slices. Each UI slice extends or deliberately changes Atlas Blue only as needed for its acceptance criteria and records consequential visual decisions.
- `/ui-baseline` remains a recoverable snapshot of the mockup while production components and real behavior evolve separately from it.
- Rejected historical directions remain available only through Git history and must not be treated as current implementation guidance.

## Testing Decisions

### Primary seam

The primary test seam is an observable business behaviour through the public REST API against a real test PostgreSQL database. A tracer-bullet ticket should prove its complete API behaviour at this seam and add a user-interface test when the ticket exposes an interactive journey.

Tests should assert business outcomes, persisted state, allowed transitions, and visible error semantics. They should not mirror private NestJS method structure or component implementation.

### Specialized seams

- Pricing Rules and totals receive exhaustive deterministic tests across quantities, tax, discounts, validity, rounding, missing Critical Fields, and configuration versions.
- Workflow state machines receive transition tests for allowed actions, forbidden actions, Approval gates, and immutability.
- AI provider integration uses a fake adapter with representative structured fixtures; automated tests never require a paid model call.
- File parsing uses small synthetic fixtures for every supported format, invalid type, size limit, and partial failure.
- Generated DOCX and PDF outputs are inspected structurally for resolved variables, correct version metadata, and stable business content rather than pixel-perfect snapshots alone.
- Knowledge retrieval tests verify approval/version filters and citation provenance. Cited Answer evaluation uses a small deterministic demonstration corpus before real cases are available.
- Authentication tests verify protected API behaviour and attribution while external identity-network behaviour remains the provider's responsibility.
- Critical pilot journeys receive browser-level tests only after their underlying API slice is stable.
- UI slices provide deterministic browser captures at the approved reference viewports and check the relevant empty, loading, error, success, and responsive states. Visual review complements behavioural tests; it does not replace them.

### Required feedback loop

Each implementation ticket begins with a failing test at its agreed seam, reaches green with the smallest complete behaviour, then refactors while staying green. Repository-wide foundational or milestone changes run lint, type checking, tests, production builds, and formatting checks.

## MVP Acceptance

The MVP is acceptable when an invited Internal User can complete the HACCP and ISO 22000 pilot from Client Request through an Approved Offer, Accepted Offer, approved Contract, and Cited Answer; every critical value, calculation, version, check, and Approval remains traceable. The production interface must evolve coherently from the Atlas Blue baseline across the core desktop and mobile journeys.

When real evaluation data is available, the pilot supports comparison across at least 20 anonymized cases with these target measures:

- at least 60% reduction in preparation time;
- at least 90% correct extraction of principal fields;
- at least 95% correct deterministic calculations;
- 100% traceability of critical versions and actions;
- at least 50% reduction in administrative errors;
- average Internal User satisfaction of at least 4/5.

Targets guide evaluation; failed targets produce evidence and follow-up issues rather than hidden adjustments to the measurement method.

## Out of Scope

- Client portal or public registration.
- Full commercial multi-tenancy, granular role administration, SSO, or advanced MFA policy.
- SaaS subscriptions, billing, payments, or full accounting.
- Auditor scheduling and complete certification-body duration calculations.
- Audit reports, non-conformities, certification decisions, certificates, or accreditation workflows.
- Training delivery and participant management.
- Automated email, calendar, electronic signature, mobile application, or voice agent.
- Complete Consultant, Certification Body, and Enterprise editions.
- Fine-tuning, self-hosted language models, or definitive production infrastructure.
- Business-owner replacement: the application assists and records human decisions.

## Further Notes

Real Tariffs, quantity rules, tax and currency combinations, discount thresholds, numbering conventions, DOCX templates, clauses, approved knowledge corpus, and historical cases are still to be supplied. Their absence does not block implementation when the relevant behaviour uses explicit replaceable configuration and clearly marked synthetic fixtures.

Ticket decomposition must use vertical tracer bullets sized for one fresh Codex context. Tickets declare blocking edges, explicit exclusions, acceptance criteria, test seams, and relevant glossary or ADR pointers. Horizontal schema-only, API-only, and UI-only tickets are avoided unless an unavoidable wide mechanical change requires an expand-contract sequence.

Current work proceeds one bounded vertical feature issue at a time from the evolving Atlas Blue baseline.
