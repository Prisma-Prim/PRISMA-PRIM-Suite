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

[Section 19](#19-bounded-webapi-liveness-monitor) owns the approved bounded
operator liveness monitor; it does not satisfy production alert delivery or
incident-response ownership.

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

The [bounded synthetic recovery exercise](#18-bounded-synthetic-recovery-exercise) can establish technical evidence independently. Its contract alone supplies no executed recovery or whole MP-2 credit and does not close the production policy/evidence dependencies above.

## 17. Approved provisional demonstration data (#409)

Under Dan's delegation of reversible provisional MVP choices (2026-09-20, renewed 2026-09-24), this section decides how synthetic demonstration data enters a non-production environment, so that Iurie can walk a business file and validate the provisional choices (Commercial Workflow PRD section 15). It is not Iurie evidence.

**Purpose-limited target.** A demonstration seed runs only against a dedicated demonstration Workspace: the configured bootstrap Workspace, whose name contains `DEMO`, in a database that holds no other Workspace. The operator explicitly confirms that Workspace's identifier on every run. No option seeds any other Workspace, and production seeding does not exist. The demonstration environment is non-production (DEC-175) and never receives real Client data (DEC-176).

**One architecture.** The seed creates data only through the public commands of the owning modules, with their authorization, validation, idempotency, versions and Activity events (decision record 14.16). It never writes, migrates, corrects, resets or deletes storage directly. It adds no route, permission, response, identity mode or provider call to the served application. Illustrative configuration keeps the provenance that its owning PRD fixes.

**Identity and attribution.** Inside its own short-lived process, the seed presents only two kinds of principal: the configured Workspace owner, for Company registration, grants and the Client–Company relationship that only Workspace Client management may establish, and synthetic persona principals of a dedicated provider, for every other step. Events are attributed either to the operator who ran the seed or to a persona whose name marks it as synthetic. Running the seed requires the target's database credential and confers nothing beyond it. No production build or runtime accepts deterministic identity.

**Synthetic content.** Every displayed text that the scenario supplies contains `DEMO`. Contact data and links use reserved example domains, and identifiers use a `DEMO-` prefix. The scenario uses no telephone number, bank account, real identifier or real Client name. Provider Company display names are first-tenant configuration (Product Vision section 15).

**Replay and preservation.** Each scenario step has a stable key. A repeated run creates no record, version, receipt or event, and an interrupted run converges when repeated. The seed never overwrites a user's change, re-grants revoked authority or supersedes configuration that an operator published. It stops at the first refused step and reports it. Released steps are immutable, and a later scenario version only appends steps.

**Provisional choices.** Iurie validates the following against the demonstration: the persona set and its role profiles, the example records and dates, and the `DEMO` marker rules. They are indexed, with every other MVP stand-in, in the [first-tenant substitution register](first-tenant-substitution-register.md).

Excluded: grants to real members, invitations, hosting and deployment, reset or removal of demonstration data, and any real price, template, clause or Client fact.

### 17.1 Reproducible illustrative pricing catch-up — CF-1 (#615)

Under Dan's 2026-10-16 direction, `demo-v2` appends to all 79 immutable `demo-v1` steps and retains their `demo-v1:<step-key>` idempotency namespace and persona definitions. It explicitly grants the existing Company Pricing User bundle to Ana DEMO in PRISMA-PRIM and Maria DEMO in BIC. This synthetic assignment changes no real role, bundle content or served application authorization.

For each of the five existing offerings, the scenario publishes a first illustrative Tariff Version only when no head exists: PRISMA-PRIM uses `DEMO unit`, MDL 100.00 and illustrative 20% tax; BIC uses `DEMO unit`, EUR 150.00 and illustrative 0% tax. Tax labels explicitly contain `DEMO`. ECG remains without an offering or tariff. These values illustrate arithmetic and are not prices or fiscal decisions.

The seed keeps its publication instant fixed despite transit or lock delays. At the transition from publication to calculation, its own process advances that clock once to the next whole second, the same start used by its new versions. It never advances to match arbitrary operator configuration, backdates a version or changes the served application clock. Validity is evaluated at that normal calculation instant. A declared version still in the future at that instant, or otherwise incompatible, causes the ordinary named refusal without a new Snapshot.

Ana calculates quantity `2` for the existing GRUP DEMO ISO14001 Opportunity; Maria calculates quantity `2` for the existing DEMO Construct ISO45001 Opportunity. Each released calculation explicitly selects Pricing Rule Version 1 and Tariff Version 1, then reopens its exact immutable Snapshot through the normal authorized public read. Fresh-scenario totals are MDL 240.00 (net 200.00, tax 40.00) and EUR 300.00 (net 300.00, tax 0.00). No seed client computes or assigns a total. Existing operator configuration is preserved; the manifest reports the exact declared Version 1 identity even after a successor is published. It is never replaced to force these example totals.

Repeated runs retain stable calculation payloads so normal replay recovers the original Snapshot after interruption, response loss, expiry or successor publication. They never select a newer price silently. Existing target guards, production refusal, synthetic-principal limits, provider isolation, revocation checks, user-change preservation and substitution links continue to apply. The manifest identifies the Tariff and Snapshot steps for later public reads. Section 17.2 owns the separate commercial role catch-up.

### 17.2 Reproducible commercial role catch-up — CF-3 (#620)

Under Dan's 2026-10-16 direction, `demo-v3` appends to all 88 immutable `demo-v2` steps. Existing personas, profile labels and the `demo-v1:<step-key>` namespace stay unchanged. The additional synthetic assignments apply only in PRISMA-PRIM: Ana DEMO receives Company Offer Preparer v1 and Company Contract Preparer v1; Ion DEMO receives the current Company Commercial Intake prerequisite, Company Offer Approver v1 and Company Contract Approver v1. These are explicit existing bundles, not new real job roles or broader bundle contents. Maria DEMO remains scoped to BIC and Victor DEMO remains restricted to ECG.

Using the existing GRUP DEMO ISO14001 Opportunity and exact CF-1 Snapshot, Ana prepares one Offer Version 1 and one direct-origin Contract Version 1, with `DEMO` scope and conditions. She explicitly runs their normal Quality Checks. Ion separately approves both exact versions. The Offer acknowledges no warnings; the direct Contract acknowledges only `DIRECT_ORIGIN_REVIEWED`. This illustrates the already delivered direct origin without inventing Client acceptance or legal wording. No transmission, Client response, signature or Project is created by these steps. All records retain illustrative provenance and provisional representations; no real-use approval or Iurie acceptance is claimed.

Every new command has a released stable key and complete payload. Approval keeps expected revision 1 and its declared warning codes even when creation replay returns a later root revision. The seed never harvests new warnings or a latest Quality Check run to change a retry. Ordinary owning-module receipts and current authority checks recover exact committed results after interruption, response loss, expiry or later operator versions; a conflicting unfinished step is refused by the normal API. Revoked grants remain revoked, operator corrections are never overwritten and malformed consumed identity, provenance, compatibility or decision state stops the run before its next write.

Each commercial step reopens its exact public result. Offer Quality Checks expose no per-run read, so an identical public command replay reopens the recorded explicit run through its normal receipt; Contract runs use their exact public read. Neither substitutes a latest run. The manifest preparation entries name Version identifiers, quality entries name the explicit run identifiers and approval entries name decision identifiers. Their `confirmed` outcome means the public command acknowledged a commit or identical replay and its result was reopened; it makes no unsupported claim that this run created a record. Existing `created`, `replayed` and `present` meanings remain unchanged. Substitution rows SUB-RO-02/SUB-RO-03 index the fixture profiles and approval examples; real first-tenant authority remains a separate configuration decision.

## 18. Bounded synthetic recovery exercise

Under Dan's [delegation of routine PRD review](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237), agents define this bounded non-production operator contract in [#732](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/732). [ADR-0009](../adr/0009-isolated-synthetic-database-recovery.md) owns its archive, authentication, compatibility, transport and atomic restoration decisions. Sections 4–6 and 12–16 continue to govern protection and production acceptance; section 17 owns seeding. The whole PRD remains **Draft — operational evidence pending**.

**Admission and inputs.** The caller supplies an already populated dedicated synthetic application database, explicitly confirms its configured Workspace identifier and exact name containing `DEMO`, and attests its exclusively non-production synthetic purpose. The complete consistent dumped snapshot must contain that one Workspace and the supported migration state. Section 17's empty-first-seed allowance does not admit a recovery source. Refuse unknown, shared or production sources. Naming and attestation do not prove arbitrary rows contain no personal data; no invented content/secret scanner is an admission substitute.

The restore destination is a separate fresh empty isolated database under the caller's exclusive exercise control, including the admission-to-restore interval. Refuse nonempty/shared targets and an alias of a populated source. The caller supplies external technical configuration and secrets separately, including the archive key. No real data, real member grant, provider call/purchase or live deployment is authorized.

**Operator journey.** Back up the actual complete supplied database into an independently retained authenticated encrypted artifact, then restore it in a later invocation with source access unavailable. Preserve application schemas/migrations, business/configuration records and exact immutable history, local identities, memberships, Role Assignments, receipts, attribution, Activity Log and all current/historical PDF bytes. Runtime/provider secrets and cluster prerequisites are reconstructed externally under the ADR. Never migrate, reseed, repair data or create fresh grants to make a restored result pass. A failed restore preserves the source and retained artifact and cleans only owned temporary material; it never overwrites an existing workload.

**Public acceptance.** Record expected exact identities and literal value fingerprints through public reads before backup; retain this synthetic verification evidence independently of the source. Prepare representative configuration Versions, business/history/receipt evidence, permitted and revoked/restricted principals, separate Company boundaries, and current/historical Document Versions and PDF Representations through ordinary public commands before the snapshot. Include an additional arbitrary synthetic record and PDF beyond released seed fixtures: the tool must restore supplied data, not recreate a known scenario.

After restoration, start the ordinary compiled application against only the restored destination and externally supplied compatible settings. Keep the source database/application unavailable throughout verification. Present exact persisted synthetic principals at the existing isolated identity-verification boundary; do not add a served identity mode, recover a provider or bypass normal NestJS authorization. Reopen the recorded exact records, configuration Versions, receipt-backed result identities and immutable Activity history, Document Versions and current/historical PDF identities and original bytes using normal authorized public reads/downloads. Compare literal values and byte hashes to the independently retained expected evidence, rather than only counts or self-derived destination summaries. Permitted access succeeds; already revoked/restricted and other-Company access remains denied. A separate later source write is absent from the restored snapshot. No migration, bootstrap creation, seed repair or fresh grant may supply missing evidence.

**Measured outcome.** Before the recovery invocation, the caller supplies a reference instant, a finite nonnegative maximum recency/loss interval and a finite positive maximum recovery duration, without numerical or operator defaults. Validate the bounds and time inputs before decryption or reconstruction. Report the conservative snapshot cutoff separately from archive completion. Require cutoff ≤ archive completion ≤ supplied reference instant and compare reference minus cutoff with the supplied maximum recency/loss interval; do not substitute dump completion for the cutoff or infer actual lost business work.

Measure elapsed recovery monotonically from immediately before decryption, external settings reconstruction and restoration until all public acceptance checks pass. Include authentication, application startup and verification in that duration. Missing, invalid, contradictory or exceeded bounds prevent overall exercise success; a successful restore may still fail the exercise's measured bound. Artifact creation or authentication alone reports no recovery success. Report the bounds, timestamps, measured duration, verification outcomes and owned cleanup result without keys, database credentials or raw dumps. Cleanup failure prevents overall success.

**Readiness and exclusions.** This contract is not implementation or executed recovery evidence. A later implementation issue becomes ready only after the canonical PRD/ADR are published and fresh seam, ownership, dependency and one-session fit checks pass. No runtime issue is created here. Full MP-2 and production acceptance still require their own exercised evidence and approved operational scope.

Real/production operation, in-place recovery, external-provider recovery/probes, schedules, retention/offsite promises, support access and production operator/incident assignment remain excluded. A revocation after the snapshot is not preserved by an older backup. Production loss/downtime tolerances, key custody, revocation reconciliation and incident authority remain explicit policy/evidence dependencies; no RPO24h/RTO60min or named operator is inferred.

## 19. Bounded web/API liveness monitor

Under Dan's delegated reversible technical choices and independent-progress
instruction, [#738](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/738)
approves one local operator CLI observing explicitly supplied web and API origins.
The whole Platform PRD remains Draft. This section decides local mechanics; the
issue and its merged evidence own implementation state. There is no business
permission, served endpoint, provider, dependency or deployment change.

The monitor requests only the web's existing `/health` and API's `/api/health`.
Web health requires successful status and literal `ok`; API health requires
successful status and bounded valid JSON with service `prisma-prim-api` and status
`ok`. HTML/login fallbacks, malformed or oversized bodies, redirects, non-success
status, timeout and connection failure never establish health. Response bodies
are limited to 1,024 bytes and requests/body reads share one deadline; redirects
are refused. HTTP targets are literal loopback only for
local use; future deployed targets require HTTPS. Origins cannot contain embedded
credentials, query, fragment or a non-origin path. Targets are caller-selected,
not a served arbitrary-URL or discovery interface.

Each service maintains its own observation state. Technical defaults are a
30-second pause between completed probe rounds, a 5-second request timeout,
three consecutive failures before one alert and
two consecutive successes before recovery. Healthy samples break a pre-alert
failure streak; failures break a pending recovery streak. Continued failure or a
changed failure category emits no duplicate alert. Initial health and meaningful
alert/recovery transitions produce structured output without per-poll flooding.
Explicit positive decimal-integer overrides permit short deterministic local
exercises: interval 1–3,600,000 ms, request timeout 1–300,000 ms, and either
consecutive-observation threshold 1–1,000. These are reversible technical bounds
and debounce choices, not an availability SLA or on-call commitment.

Output contains schema version, fixed safe service label, UTC time, bounded code
and count, transition/disposition and a fixed
[response-guide reference](../agents/railway-activation.md#verification-budget-backups-and-rollback).
It excludes supplied origins, response content/headers, credentials, raw errors,
stacks, environment contents and business records. No disk-retention feature,
provider notification or business Activity event is introduced. SIGINT/SIGTERM
cancel requests and timers and yield a bounded, stable stop disposition; invalid
configuration fails closed without echoing input. Cleanup affects owned monitor
resources only.

Acceptance exercises the public CLI against two actual owned local HTTP servers:
healthy observations, independent failure/alert episodes, measured subsequent
success/recovery, safe malformed/oversized/stalled/redirect responses and bounded
signal shutdown. Deterministic clock/transport-boundary tests cover streak
orderings without mocking monitor state. No runtime fixture substitutes for an
observed endpoint, and no external target is probed by this implementation proof.

The monitor performs no restart, rollback, deployment, revocation, incident
communication or acknowledgment-based health change. Liveness establishes neither
database readiness nor Clerk, latency, security, job or optional-provider health.
Hosted supervision, real alert recipient/channel and delivery proof, incident
ownership/escalation, protected diagnostic access/retention and response rehearsal
remain activation requirements. This bounded delivery alone earns no whole MP-3 or
production-operations acceptance credit.
