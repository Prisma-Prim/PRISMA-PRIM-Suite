# PRD — Platform Security, Privacy, Reliability and Operations

**Status:** Draft — operational evidence pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-005–DEC-006, DEC-175–DEC-192

## 1. Problem statement

The platform will hold confidential Client, commercial, assurance, credential, personal and financial information across tenants and provider integrations. A functional happy path is insufficient if lower environments expose production data, provider outages block core work, uploads are unsafe, backups are untested or support access bypasses authorization.

## 2. Solution

Establish secure-by-design operating boundaries across identity, tenant isolation, data and file protection, development supply chain, observability, incident response, backup recovery, provider degradation, change governance, privacy lifecycle and portability.

Security controls support business evidence and risk management without claiming automatic legal, privacy or accreditation compliance.

## 3. User stories

1. As a tenant owner, I want my data isolated in storage, queries, search, logs and backups.
2. As an administrator, I want strong identity and least privilege, so that account compromise has limited impact.
3. As a user, I want uploaded files validated before use, so that ordinary Document work is safer.
4. As a business owner, I want critical work to continue when Google, Synology or an AI provider fails.
5. As an operator, I want actionable tenant-safe monitoring, so that failures are detected without leaking data.
6. As an incident owner, I want a defined response path, so that containment, evidence and communication are not improvised.
7. As a tenant owner, I want backups restored and tested against agreed outcomes.
8. As a developer, I want isolated development, test and production environments without default production-data copying.
9. As a privacy owner, I want governed retention, export and deletion, so that data lifecycle is intentional.
10. As platform support, I want exceptional access explicitly authorized and attributable.
11. As a tenant, I want provider exit and standard export, so that the product does not trap business information.

## 4. Security boundaries

- verified external identity and application-owned authorization;
- Workspace and Company defense in depth;
- secrets outside code, records and diagnostic output;
- encrypted transport and protected storage;
- selected sensitive-field protection where the threat model justifies it;
- upload quarantine, type/size validation and malware controls;
- dependency, build and migration governance;
- business Activity Log separate from diagnostic telemetry.

## 5. Environment and data rules

Development, test and production are distinct. Production secrets and data are not copied into lower environments by default. Test fixtures are synthetic or anonymized and purpose-limited. Synthetic demonstration data follows section 17.

Schema and deployment changes use reviewed migrations, compatible rollout plans and rollback/recovery thinking. Production never uses uncontrolled schema push.

## 6. Reliability model

- core business records remain operable during optional-provider outages;
- synchronization and long-running work is durable, idempotent and retryable;
- provider failure is visible and recoverable;
- degraded modes preserve user intent without claiming external success;
- backup scope includes databases, required file content, configuration and restoration knowledge;
- recovery objectives are business-defined and tested.

## 7. Observability

Metrics, logs and traces are tenant-safe, structured and actionable. They expose system health, latency, queue/provider failures, security-relevant anomalies and recovery progress without duplicating sensitive business content.

Business Activity Log remains the authority for user-visible critical actions.

## 8. Incident response

Before production, identify:

- incident owner and contacts;
- severity and escalation;
- containment and credential revocation;
- evidence preservation;
- tenant/client communication decision ownership;
- recovery and verification;
- post-incident corrective actions.

Sensitive incident detail is restricted by role.

## 9. Privacy and lifecycle

Capabilities classify personal, confidential, Client, accreditation and financial data. Collection and provider transfer are minimized. Retention, archive, legal hold, correction, export and purge are explicit.

The product supplies controls and evidence; legal obligations require market- and use-case-specific review.

## 10. Synology and provider topology

Synology may become an archival/storage adapter after inventory and recovery verification. It is not the production database host or required runtime. Remote operation from France and on-site support in Moldova must be part of the topology decision.

Google and AI providers remain replaceable integrations, not core authorities.

## 11. Performance and availability

Capability PRDs define measured performance budgets from real workflows and data volume. Security and authorization apply before optimization. Caches and indexes preserve tenant scope and revocation semantics.

## 12. Testing decisions

- negative tenant and Company isolation tests;
- authentication, deactivation and permission-revocation tests;
- upload abuse and unsafe-file tests;
- secret and sensitive-log review;
- dependency and migration checks;
- provider-outage, retry and idempotency tests;
- backup restoration exercises against agreed recovery outcomes;
- incident tabletop before production;
- export and provider-exit verification.

## 13. Acceptance journey

An authorized user performs core Client/Project/Document work while an optional provider is unavailable. The failure is visible and recoverable without data loss or false success. A revoked user loses access. Cross-tenant attempts reveal nothing. An operator detects the failure through tenant-safe telemetry. A tested restore and governed export meet the approved first-tenant outcomes.

## 14. Evidence dependencies

- account and infrastructure administrators;
- business-critical periods and manual fallback;
- acceptable recent work re-entry and restoration time;
- most harmful disclosure categories;
- personal/shared/mobile-device practice;
- leaver and lost-device response;
- actual backup restoration evidence;
- exceptional support-access authority;
- required provider-exit exports;
- Synology model, DSM, topology and support owner.

Question source: S10.

## 15. Technical dependencies

- threat model and data classification;
- tenancy/isolation ADR;
- production topology and environment plan;
- secrets, encryption and file-safety choices;
- observability and incident runbooks;
- measured RPO/RTO architecture and restore procedure;
- provider exit formats.

## 16. Readiness

This PRD governs all releases. Release 1 tickets require a minimum threat model, tenant-isolation design, environment boundary and provisional recovery assumptions. Production release remains blocked until recovery and incident controls are tested.

## 17. Approved provisional demonstration data (#409)

Under Dan's delegation of reversible provisional MVP choices (2026-09-20, renewed 2026-09-24), this section decides how synthetic demonstration data enters a non-production environment, so that Iurie can walk a business file and validate the provisional choices (Commercial Workflow PRD section 15). It is not Iurie evidence.

**Purpose-limited target.** A demonstration seed runs only against a dedicated demonstration Workspace: the configured bootstrap Workspace, whose name contains `DEMO`, in a database that holds no other Workspace. The operator explicitly confirms that Workspace's identifier on every run. No option seeds any other Workspace, and production seeding does not exist. The demonstration environment is non-production (DEC-175) and never receives real Client data (DEC-176).

**One architecture.** The seed creates data only through the public commands of the owning modules, with their authorization, validation, idempotency, versions and Activity events (decision record 14.16). It never writes, migrates, corrects, resets or deletes storage directly. It adds no route, permission, response, identity mode or provider call to the served application. Illustrative configuration keeps the provenance that its owning PRD fixes.

**Identity and attribution.** Inside its own short-lived process, the seed presents only two kinds of principal: the configured Workspace owner, for Company registration, grants and the Client–Company relationship that only Workspace Client management may establish, and synthetic persona principals of a dedicated provider, for every other step. Events are attributed either to the operator who ran the seed or to a persona whose name marks it as synthetic. Running the seed requires the target's database credential and confers nothing beyond it. No production build or runtime accepts deterministic identity.

**Synthetic content.** Every displayed text that the scenario supplies contains `DEMO`. Contact data and links use reserved example domains, and identifiers use a `DEMO-` prefix. The scenario uses no telephone number, bank account, real identifier or real Client name. Provider Company display names are first-tenant configuration (Product Vision section 15).

**Replay and preservation.** Each scenario step has a stable key. A repeated run creates no record, version, receipt or event, and an interrupted run converges when repeated. The seed never overwrites a user's change, re-grants revoked authority or supersedes configuration that an operator published. It stops at the first refused step and reports it. Released steps are immutable, and a later scenario version only appends steps.

**Provisional choices.** Iurie validates the following against the demonstration: the persona set and its role profiles, the example records and dates, and the `DEMO` marker rules. They are indexed, with every other MVP stand-in, in the [first-tenant substitution register](first-tenant-substitution-register.md).

Excluded: grants to real members, invitations, hosting and deployment, reset or removal of demonstration data, and any real price, template, clause or Client fact.
