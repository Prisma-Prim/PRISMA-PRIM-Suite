# PRD — Processing Efficiency and Resource-Bounded Workloads

**Status:** Draft — representative workload and implementation evidence pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Tracker:** [#788](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/788)  
**Consumers:** existing operational reads, Document processing, generated exports and later approved AI capabilities

## 1. Authority and purpose

Dan requested this targeted PRD on 2026-10-22 after a local stack assessment,
including replayable evidence for future coding agents. This authorizes the PRD
and synthetic qualification recipes. It does not implement the optimizations or
approve every proposed future processing capability.

This PRD owns efficiency qualification and the proposed resource contract for
heavy processing. It consumes, rather than replaces:

- [Authorization](tenant-company-client-authorization-prd.md) for Workspace,
  Company, Internal User and captured Role Assignment authority;
- [Governed Documents](governed-documents-prd.md) and
  [Document Registry](release-1-document-registry-prd.md) for exact Versions,
  Representations, originals, permissions and correction history;
- [Platform Operations](platform-security-reliability-operations-prd.md) for
  security, diagnostic privacy, recovery and operational activation;
- [AI Governance](ai-knowledge-governance-prd.md) for permitted source use,
  evaluation, citations, model/tool authority and human approval;
- [Historical Search and Export](historical-migration-search-export-prd.md) for
  Release 6 readiness, authorized results and export semantics;
- [Operational Dashboard](release-1-operational-dashboard-acceptance-prd.md) for
  existing metric definitions and readable sets;
- [UX and Configuration](ux-localization-configuration-prd.md) for localized,
  accessible states and configuration ownership.

The [decision record](consolidated-product-decision-record.md), particularly
DEC-132–135, DEC-146–172 and DEC-175–192, retains its rationale authority. No new
numbered decision, permission or release-order change is introduced here.

## 2. Problem and desired outcomes

A commercial Workspace may contain dozens of Internal Users, while several dozen
customer Workspaces may use the platform. Dan's planning examples include batches
around 1,000 pages and possible future source files of hundreds of megabytes.
These are capacity-research inputs, not measured demand, a committed upload limit
or an availability/latency promise. They are not new first-tenant evidence from Iurie.

Users need responsive ordinary work while authorized heavy processing completes
reliably. The owner needs a defensible resource cost per successful useful result,
and future agents need to distinguish a reproducible improvement from an obsolete
prototype or an unjustified language rewrite.

Success means equivalent authorized outcomes with less avoidable work, bounded
memory and concurrency, visible failures and independently repeatable evidence.

## 3. Solution and existing decisions

Retain [TypeScript](../adr/0001-typescript-business-platform.md),
[PostgreSQL/Drizzle](../adr/0002-postgresql-with-drizzle.md),
[NestJS business ownership](../adr/0003-nestjs-owns-business-decisions.md) and the
[simple monorepo](../adr/0005-simple-pnpm-monorepo.md). Measure SQL work, transfer,
allocation, pipeline duplication and concurrency before selecting another runtime.

[ADR-0008](../adr/0008-bounded-document-content-storage.md) continues to govern the
existing bounded PDF journey. This PRD neither raises its 5 MiB limit nor replaces
transactional byte storage. Large-file storage requires its own scoped successor
decision, reconciliation contract and recovery proof.

Proposed heavy processing uses independently bounded workers. Python is an option
for a concrete specialized workload with a useful native library. Rust is an
option for a measured residual compute/allocation hotspot with a stable contract.
Neither is a prerequisite for SQL aggregation, streaming or frontend splitting.
No additional paid service or hosted platform is selected or required.

## 4. Actors, scope and permissions

| Actor               | Observable need                                        | Authority consequence                                                 |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| Internal User       | Ordinary reads and approved processing remain usable   | Existing target permissions apply; a faster path grants nothing       |
| Authorized reviewer | Inspect exact inputs, proposed results and failures    | Existing Document/AI approval rules remain authoritative              |
| Operator            | Inspect resource use and recover technical work        | No new business-data or support access is implied                     |
| Product owner       | Compare equivalent workload cost and decide investment | Infrastructure budget and commercial limits remain explicit decisions |
| Coding agent        | Replay evidence and propose a bounded change           | Must inspect current code, own an approved issue and pass its gates   |

Workspace isolation remains mandatory in storage, processing, derived artifacts,
metrics and retrieval. Company and exact Document Version scope travel with a
job/reference and are re-authorized at the relevant existing public interface.
Background execution is never a substitute for user or object authority.

## 5. User stories

1. As an Internal User, I want an existing dashboard count to preserve its exact readable set while avoiding transfer of every counted record.
2. As an Internal User, I want large directories to remain bounded and navigable without losing records or changing their approved order.
3. As an Internal User, I want heavy processing to preserve the responsiveness of ordinary work.
4. As an authorized Document reader, I want exact original bytes and Version provenance preserved through optimized storage and processing.
5. As an authorized reviewer, I want derived extraction and AI results distinguishable from approved business facts.
6. As an Internal User, I want interruption, refusal, cancellation and retry to be visible without claiming partial work succeeded.
7. As a Workspace owner, I want another Workspace's batch to have bounded impact on shared resources.
8. As an operator, I want resource limits to prevent an unexpectedly complex small file from exhausting the interactive process.
9. As an operator, I want retries to preserve one accepted logical result despite repeated physical execution.
10. As an operator, I want completed and abandoned artifacts reconciled without deleting governed history.
11. As the product owner, I want cost reported per equivalent successful workload with its quality and completeness.
12. As the product owner, I want a runtime/library change justified by measured benefit, maintenance cost and licensing fit.
13. As a coding agent, I want exact source, fixture, configuration and correctness checks so that I can reproduce or invalidate a historical finding.
14. As a coding agent, I want failed, noisy and inapplicable experiments distinguished from successful product qualification.
15. As a user of an approved AI capability, I want repeated processing avoided while current authorization and exact citations remain valid.
16. As an Internal User, I want deferred frontend loading to preserve accessible localized navigation, forms and error recovery.

## 6. Candidate outcomes and scope

| Candidate                           | Required observable equivalence                                      | Qualification scope                                                                          |
| ----------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| SQL aggregate for an existing count | Same permitted set, number, snapshot/date semantics and refusals     | Current public dashboard/read plus existing authorization tests                              |
| Bounded directory read              | Complete traversal, stable approved ordering, no hidden metadata     | Separately approved pagination contract; existing full-list contracts cannot change silently |
| Streamed generation/compression     | Same required bytes or explicitly approved semantic equivalence      | Size sweep, output verification, peak memory, CPU and event-loop response                    |
| Deferred frontend sections          | Same journeys, access states, locale and keyboard behavior           | Actual initial dependency graph, cold navigation and desktop/narrow browser journeys         |
| Less redundant identity work        | Same current identity, admission and immediate revocation behavior   | Existing public access/admission/race tests plus write/lock measurements                     |
| Specialized document worker         | Same required extraction/validation quality and provenance           | Real representative workload, cold/warm process controls and failure recovery                |
| Larger-file adapter                 | Exact historical bytes and current independent content authority     | Approved formats/limits, immutable-object reconciliation and restore proof                   |
| Incremental AI pipeline             | Same approved source eligibility, coverage and evaluation thresholds | Existing AI readiness and purpose restrictions plus content/pipeline-version keys            |

The linked [evidence and replay guide](../agents/processing-efficiency-evidence.md)
owns historical numbers, recipes and measurement limitations. Those measurements
are not acceptance thresholds for unrelated workloads.

## 7. Proposed processing lifecycle and history

Future implementation must define a durable technical lifecycle with observable
acceptance, waiting, leased execution, successful finalization, retryable failure,
terminal refusal/failure and cancellation. Exact names, limits and UI exposure
belong to its bounded implementation contract; no lifecycle is delivered here.

Required properties are:

- Accept a logical work identity with exact input Version/hash and pipeline version.
- Reserve work through a short transaction; perform scanning, extraction, generation
  and external/model calls outside an open business transaction.
- Bound the execution lease, heartbeat, attempts, runtime, bytes, decoded content
  and concurrent work; recover expired work according to explicit policy.
- Expect at-least-once execution. Make accepted results and permitted business
  effects idempotent; do not claim exactly-once physical execution.
- Recheck current authority and applicable Version/object state before releasing
  confidential results or applying a business command. A queued reference is not a grant.
- Record stage-specific progress only when its meaning is defined. Do not present
  unknown work as a reliable percentage or expose another scope's counts.
- Preserve received originals and historical approved Versions. Corrections or
  pipeline changes create traceable derived artifacts; they do not rewrite originals.
- Resolve staging/orphan artifacts and interrupted finalization using an explicit
  consistency/recovery contract that respects retention and preservation holds.

## 8. Resource, cost and fairness contract

Each proposed slice records its workload envelope before qualification: input
bytes, pages/objects/pixels, textual versus scanned content, languages, layout,
output bytes, simultaneous users/jobs, hardware and deployment limits. File size
alone is insufficient to bound decoded work.

Define finite budgets for API work, worker memory, active jobs, queue backlog,
database connections, thread pools, retries and model calls/tokens where applicable.
The slice states the disposition at each limit: bounded wait, resumable refusal,
retry or terminal failure. Concrete customer quotas, deadlines and SLAs remain
undecided until their business owner approves them.

Measure elapsed and CPU time, peak resident memory with its scope, throughput,
p50/p95 from retained samples, event-loop lag, query/lock/pool work, bytes
transferred, artifact storage and AI usage as relevant. Record cold and warm work
separately. More parallelism is useful only when the throughput/latency benefit
justifies memory, contention and actual consumed or reserved resource cost.

Cost comparisons include API, workers, database, file/derived storage, backups,
transfer and model use. Identify measured quantities, owner-supplied unit prices
and assumptions separately. Report both useful completed work and failures;
latency improvement alone does not prove a proportional monthly bill reduction.

Noisy results, different quality/completeness, unequal hardware or partial success
cannot establish a saving. Declare the materiality/variance rule before the final
comparison and retain all measured passes rather than selecting the fastest.

## 9. AI, runtime and coding-agent qualification

Extraction/indexing, inference/orchestration and model training are separate
workloads. Large Documents do not by themselves authorize training or local GPU
hosting. AI use remains gated by the owning PRD, approved source rights and exact
Version eligibility.

Avoid repeated extraction and embedding when exact source/pipeline versions permit
reuse. Cache/deduplication keys and access checks must not reveal cross-Workspace
content existence. Revalidate source eligibility and output authority on reuse.
Targeted retrieval and exhaustive dossier analysis require different completeness
proofs; context reduction cannot silently omit required evidence.

For Python/Rust/native-library candidates, compare the same operation, required
quality, output completeness, concurrency, compilation/startup mode and packaging.
Account for native thread pools, process lifetime, copies across the interface,
failure isolation, licenses and operational maintenance. Prefer an existing suitable
native library to a new language boundary justified only by a microbenchmark.

Claims about coding-agent productivity require the same agent/model, comparable
tasks, context and budget, and retained correctness/review evidence. Measure time
to accepted behavior, retries, tokens and maintenance impact; language verbosity
alone is not a ranking. No such comparative agent study exists in the local baseline.

## 10. Evidence, Activity Log and user states

Technical observations are diagnostic evidence, not business Activity Log events.
Existing auditable actions retain their owning event contract. A future capability
requiring new events must update that owner within its approved slice.

Diagnostics retain safe technical identifiers, input/pipeline hashes, stage,
resource measurements and bounded outcome codes. Exclude secrets, credentials,
raw prompts, source content and unnecessary personal data. Synthetic benchmarks
must never use production credentials or real Client Documents.

Existing empty, forbidden, stale, revoked and provider-failure behavior remains
unchanged during an optimization. A future processing UI needs localized accessible
waiting/running/completed/error/cancelled states, useful retry semantics and no
inaccessible-content disclosure. Configuration and labels do not alter business meaning.

## 11. Migration, integrations and failure boundaries

This documentation introduces no schema, provider integration, runtime dependency,
deployment or data migration. Future migrations use reviewed Drizzle migrations.
Any adapter change must prove exact-byte history, live download authority, partial
commit recovery, backups/restoration and compatibility with retained application versions.

A durable storage location must actually survive the selected deployment lifecycle.
An API-local directory is not durable merely because a streaming experiment uses
temporary files. Signed URLs or storage paths do not replace the current content
authorization contract. Provider outages preserve visible intent and follow the
existing operations owner; no automatic destructive cleanup or production recovery is approved.

## 12. Testing decisions and acceptance

Use the highest stable existing public read/command/CLI/browser interface. Native
or algorithm experiments can establish a mechanism, but do not replace end-to-end
permission, history, race, failure and browser proof for a product change.

A future change is qualified only when:

1. The current implementation still exhibits the proposed cost; an already-fixed
   condition is recorded and the historical workaround is not reapplied.
2. Reference and candidate name exact commits, clean/dirty state, fixtures and
   resource/configuration inputs; stale harness assumptions fail visibly.
3. Correctness, approved ordering/snapshot semantics, permissions, exact bytes or
   declared quality equivalence pass before a performance conclusion.
4. Repeated equivalent-work measurements satisfy the predeclared benefit/variance
   rule, include failures and demonstrate no material guardrail regression.
5. Scope-relevant empty/invalid/foreign/revoked/stale/concurrent/retry cases pass;
   interrupted heavy work does not become a false successful or duplicate effect.
6. The result includes resource/cost consequences, remaining uncertainty and
   rollback/compatibility limits, with replay commands and safe retained outputs.
7. The originating issue, repository Standards/Spec review and complete applicable
   verification gate pass before publication/merge as their owner requires.

The qualification journey is: reproduce the current public behavior; identify the
cost; propose one bounded candidate; implement under its own ready issue; rerun the
same workload and correctness contracts; adopt, reject or defer on the evidence.

## 13. Readiness and next bounded decisions

| Work                                      | Current disposition                             | Evidence/decision still required                                                      |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Preserve/replay synthetic evidence        | Authorized by #788                              | Qualify the documented recipes on the current checkout                                |
| Existing dashboard count optimization     | Measured candidate, not implemented by this PRD | Current public permission/snapshot proof and a focused issue                          |
| Directory pagination or deferred sections | Candidate, no automatic contract change         | Owning journey/ordering decision and complete traversal/browser proof                 |
| Streaming production export               | Mechanism demonstrated synthetically            | One approved real export format, bytes/quality contract and workload envelope         |
| Large-file storage and durable workers    | Proposed architecture                           | Representative formats, limits, retention, lifecycle/authority and recovery decisions |
| Specialized Python workload               | Permitted option under ADR-0003                 | Concrete corpus, operation, library/license fit and same-quality benchmark            |
| Rust hotspot                              | Deferred option                                 | Residual profile, stable interface and material end-to-end benefit                    |
| AI indexing/inference/training            | Owning Release 7 gates retained                 | Approved uses/corpus/evaluation, provider or hosting inputs and resource budget       |

Iurie supplies representative business Documents, languages, scanned/textual mix,
actual user journeys and acceptable user-visible failure/recovery needs when those
affect a capability. Dan and agents own technical profiling, libraries, interfaces,
storage/job options and budget modeling. Do not ask Iurie to select runtimes or SQL indexes.

This PRD is Draft because those broader workload and capability inputs remain open.
It creates no ready implementation tickets, grants, product runtime, committed
cloud budget or release-order change. Each independently useful optimization can
proceed through its own bounded readiness decision without waiting for unrelated AI work.
