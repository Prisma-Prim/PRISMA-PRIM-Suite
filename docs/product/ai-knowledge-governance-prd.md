# PRD — Knowledge Base, RAG, AI Evaluation and Tool Governance

**Status:** Draft — use-case evidence pending  
**Version:** 0.1  
**Owner:** Dan Popescu  
**Decisions:** DEC-004, DEC-155–DEC-174

## 1. Problem statement

Organizational knowledge is spread across procedures, interpretations, checklists, templates, Training material and Client files with different ownership, approval, version, confidentiality and license conditions. Uncontrolled retrieval or model use can expose data, cite obsolete material, invent authority or take actions beyond the user's permissions.

## 2. Solution

Build AI capabilities only on governed operational data and approved Knowledge Sources. Apply authorization before retrieval and generation, preserve exact version citations, distinguish support from uncertainty or contradiction, register every capability, trace material interactions safely and evaluate representative cases before increasing autonomy.

Begin with an assistive ISO Project Copilot after the operational core and governed Documents exist.

## 3. User stories

1. As a knowledge owner, I want to approve exact source versions, so that only governed material supports answers.
2. As a user, I want current approved sources by default, so that obsolete guidance is not presented as current.
3. As an authorized user, I want answers limited to sources I may access, so that AI does not bypass permissions.
4. As a user, I want exact citations and locators, so that I can inspect the evidence.
5. As a user, I want the assistant to state uncertainty, contradiction or absence, so that fluent prose is not mistaken for support.
6. As a Client or Company owner, I want confidential information isolated, so that another context cannot influence an answer.
7. As a user, I want useful missing-Document and contradiction detection, so that dossier review becomes faster.
8. As a professional, I want drafts and suggestions rather than automatic sensitive actions, so that I preserve judgment.
9. As a reviewer, I want to correct, reject and report poor output, so that quality can be measured.
10. As a product owner, I want each capability evaluated on representative Romanian, Russian and English cases.
11. As a security owner, I want provider data minimized and training on tenant data disabled by default.
12. As an administrator, I want every tool action re-authorized by the server, so that model intent does not create authority.

## 4. Domain model

- **Knowledge Source:** governed exact Document Version admitted for named uses.
- **Knowledge Projection:** derived chunks, embeddings, summaries and indexes.
- **AI Capability Registry Entry:** purpose, owner, permitted inputs/outputs, provider class, risk, human control and evaluation.
- **AI Interaction:** material request, references, provider/model/pipeline version, output, disposition, timing and safe usage metadata.
- **Evaluation Set:** representative cases, expected properties, prohibited outcomes and thresholds.
- **Tool Proposal/Action:** model-proposed operation executed only through server authorization and deterministic validation.

## 5. Invariants

1. A Knowledge Source identifies an exact governed version.
2. Admission respects ownership, license, confidentiality and permitted use.
3. Authorization precedes retrieval, snippets, generation and tool execution.
4. Current approved versions are default; history is deliberate.
5. Every material claim exposes exact supporting sources or an explicit insufficiency.
6. Chunks, embeddings and summaries are derived and rebuildable.
7. Retrieved content and model output are untrusted.
8. AI never approves prices, legal clauses, audit Findings, certification Decisions, credentials, financial confirmations or access.
9. Sensitive actions retain human approval.
10. Material provider or pipeline changes require requalification.

## 6. Capability lifecycle

Proposed → risk/evidence review → evaluation-ready → assistive pilot → approved for bounded use → suspended/retired.

Autonomy never increases from anecdotal satisfaction. Each step requires measured thresholds, failure review and explicit authorization.

## 7. Permissions and privacy

Capability use, Knowledge Source administration, evaluation review and tool-action approval are separate permissions. Company, Client, Project and Document authorization is preserved through retrieval and output.

Interaction traces avoid secrets and unnecessary source content. Data sent to providers is minimized, region and contractual conditions are reviewed, and tenant data is not permitted for provider training by default.

## 8. Prompt-injection and tool safety

- treat Documents, email and retrieved text as data, never authority;
- separate system instructions from untrusted content;
- validate structured output;
- allow only registered tools and typed arguments;
- re-establish actor and target authorization at execution time;
- preview sensitive actions and require human confirmation;
- make retries idempotent and observable.

## 9. Evaluation

Each capability defines:

- representative current, obsolete, contradictory and missing-source cases;
- Romanian, Russian and English behaviour;
- citation correctness and version correctness;
- authorization and leakage tests;
- serious versus tolerable error classes;
- human correction and rejection;
- time/quality value metric;
- thresholds for pilot, continued use and suspension.

## 10. UX

Users see capability purpose, source citations, uncertainty, limitations, current context and required approval. They can inspect sources, correct inputs, reject output and report harm. Provider names remain secondary to business purpose unless operationally relevant.

## 11. Provider and outage boundary

NestJS owns business orchestration and final validation. Providers are replaceable adapters. Core operational work remains available during AI outage. Long-running work is durable, retryable and visibly recoverable.

## 12. Testing decisions

- deterministic contract tests around capability inputs, validation and disposition;
- authorization tests before retrieval and tool execution;
- evaluation suites separate from ordinary unit pass/fail;
- adversarial untrusted-content and cross-tenant leakage cases;
- provider adapter tests without making external calls the core business seam;
- browser tests for citations, uncertainty, correction and approval.

## 13. Acceptance journey

An authorized user asks a dossier question. Retrieval selects only permitted current approved versions. The answer cites exact passages and states missing or contradictory evidence. A malicious instruction inside a source has no authority. A proposed sensitive action remains a preview until the authorized user confirms it; the server re-authorizes and records the outcome. The capability meets its multilingual evaluation threshold.

## 14. Evidence dependencies

- approved and obsolete source pairs;
- ownership, license and forbidden-use categories;
- 3–5 valuable dossier questions;
- useful missing-data, contradiction and deadline detection;
- drafts and required reviewers;
- serious-error scenarios and measurable value;
- languages per use case.

Question source: S09.

The [synthetic source and citation preparation kit](ai-knowledge-synthetic-kit/README.md)
under [#989](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/989) supplies
fictional versioned passages and authored expectations for manual or future
qualification. It does not satisfy representative evidence, actual source
admission/rights, observed human review or the readiness gates below, and is not
direct input to section 17's closed offline evaluation schemas.

## 15. Technical and legal dependencies

- provider contract, region, retention and training-use review;
- AI risk and applicable regulatory assessment per use case;
- retrieval/index technology after corpus inventory;
- threat model and evaluation harness;
- durable job and tool-execution architecture.

## 16. Readiness

The governance boundary is ready for downstream PRDs. No Release 7 implementation ticket is ready before the operational core, governed Documents, source inventory, representative evaluation cases and legal/security review exist. The separately selected offline mechanics in section 17 have their own bounded readiness gate; they do not authorize an AI capability or change that release sequence.

## 17. Bounded offline comparative pilot evaluation — #957

**Status:** Approved — bounded offline comparative evaluation with atomically owned single-file output

**Contract version:** 2.0

**Owner:** Dan Popescu; this PRD owns the bounded evaluation behavior

**Tracking:** [#976](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/976) owns this output-protocol revision, under [AI/Knowledge #57](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/57). [#957](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/957) preserves the original contract provenance; commercial pilot context remains [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290).

### 17.1 Authority, provenance and outcome

A reviewer needs to inspect the same declared cases, independent reference results and captured manual/assisted observations, then reproduce exactly which cases support a comparison. This section specifies one local file-to-report command that works before an AI provider exists. It measures declared observations; it neither runs the work nor instruments the application.

The owner's independent evaluation selection and delegation are recorded in [#51 comment 6478554347](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6478554347); [the #957 session claim](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/957#issuecomment-6478636722) assigns publication, ordered independent Standards then Spec, actual delegated product disposition and integration proof to the coordinator. Command shape, bounds and exact-match methodology below are reversible agent product synthesis within that selection. They are not new Iurie answers or an approved operational pilot policy. This section's status governs only this contract; the broader PRD remains Draft.

Current authority is [Product Vision](product-vision-prd.md), this PRD §§5–9 and the [decision record](consolidated-product-decision-record.md), especially DEC-002/004/008, DEC-105/106, DEC-159/160/163/170–174 and DEC-176. The [historical MVP](mvp-prd.md#dashboard-and-evaluation) is reconciled as follows:

| Historical requirement                                                                                                                                                              | Bounded consequence here                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story 52: pilot dashboard, cycle time, corrections and Quality Checks                                                                                                               | A local inspectable report only; no application dashboard, cycle instrumentation or Quality Check integration.                                                                                                                                                       |
| Story 53: expert references and manual/assisted timing                                                                                                                              | Explicit independently prepared reference identities/provenance and declared elapsed preparation observations. Neither a label nor an actor reference proves expert approval.                                                                                        |
| Story 54: extraction, pricing, correction, traceability and cited-answer measures                                                                                                   | Exact declared field/state comparisons, review changes and citation-reference matching only. No price recalculation, semantic answer judge, general traceability score or administrative-error classification.                                                       |
| Story 55: at least 20 comparable anonymized cases when real data exists                                                                                                             | The bounded format supports up to 200 cases. Synthetic count and observed count remain visibly separate; fixture count never satisfies real-case representativeness.                                                                                                 |
| Historical targets: ≥60% less preparation time, ≥90% principal-field extraction, ≥95% calculations, 100% critical traceability, ≥50% fewer administrative errors, satisfaction ≥4/5 | Historical evidence only, with no built-in pass criteria. This slice cannot measure several of these outcomes. Real targets, denominators, principal-field selection, sample design and acceptance require a later explicit capability decision and actual evidence. |

No score, certification, release promotion, whole-MVP completion credit, expert ground truth or representative real pilot follows from a successful command. Sections 6/9/16 still govern AI promotion and Release 7. This independent offline slice changes no other release's ordering.

The original directory-output runtime [#963 / PR #966](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/966) remains unmerged and not delivered. Its [accepted output-ownership finding](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/966#discussion_r4408914235) replaces the new directory after mkdir but before its first descriptor capture; both permissive and private replacements can become the ownership baseline. Node mkdir/mkdtemp return no atomically created directory handle. A green test run or a mode check does not establish that original identity. Under the current autonomous-delivery mandate, root selects this reversible single-file technical alternative for explicit canonical review in [#976](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/976). This is not a personal Dan/Iurie review, a hidden waiver of the old acceptance or an approved runtime. Version 2.0 replaces only the output transport, receipt and evaluator-version metadata described below; numeric methodology, closed input/result schemas and declared/unverified meaning remain unchanged.

### 17.2 Actors, scope and stories

The local operator selects two minimized input files and a new private output container file. The reference preparer declares expected results independently of the selected observations. The work operator performs the manual or assisted task; the recorder captures its observations; an optional human reviewer declares final field values. These references are attribution data, not authenticated application identities or grants. One person may perform several roles; the report must never infer independent expert review from this.

Each case set declares one opaque Workspace reference and one Company reference. Mixed scopes require separate evaluations. The operator must already have permission to possess and process the files under the existing [Authorization](tenant-company-client-authorization-prd.md) and [Platform](platform-security-reliability-operations-prd.md) owners. The tool grants no application access, reads no database, resolves no business IDs and fetches no source. It creates no business Activity Log event or governed Document. A local report is private analysis output, not a new Document Version or operational approval.

1. As an operator, I can validate a closed versioned case/reference file and two explicitly selected runs without a provider, service, account or interactive prompt.
2. As a reviewer, I can trace every included/excluded case to exact case, source-set, reference and run identities and inspect each metric's numerator and denominator.
3. As a reviewer, I can distinguish original field proposals, human final values, exact changes, absent measurements, failures and incompatible versions.
4. As a reviewer, I can reproduce literal synthetic results, including a slower assisted result and unusable pairs, without mistaking them for observations of real work.
5. As an operator, I can recover from invalid inputs or an occupied output path without losing prior input or output files.

### 17.3 Public command and bounded files — output protocol v2

The entire public runtime boundary is:

```bash
node scripts/pilot-evaluation.mjs --help
node scripts/pilot-evaluation.mjs --cases /tmp/pilot/cases.json --runs /tmp/pilot/runs.json --output /tmp/pilot/result-001.tar
```

Use the repository's supported Node runtime and built-in libraries. No TypeScript compilation, pnpm install, dependency, server, provider or network call is required by the command. The entry point may compose private helpers; no second public evaluation API, general archive service or framework is introduced. The only flags are `--help`, `--cases`, `--runs`, `--output`. `--help` alone exits 0 without file access and includes these examples, schemas, bounds, exit codes, output-completion rules and the synthetic/declared-observation limitation. The other three flags require exactly one nonempty value each; missing/duplicate/unknown flags, positionals or combining help with evaluation flags fail immediately. There is no interactive fallback, environment-variable configuration, stdin (`-`), URL, glob, recursive discovery, archive input, executable expression or overwrite option. Two named JSON file inputs keep byte provenance and input bounds explicit. `--output` selects one new regular USTAR file, not a directory. The example `.tar` suffix is illustrative; the format is always the one specified here, without extension-based guessing, extraction or compression.

Both inputs must be distinct existing regular files, with no observed symlink component in either resolved path. Read at most 1,048,576 bytes per file, including a one-byte overflow probe, and validate those captured bytes once. Reject non-UTF-8, BOM, malformed JSON, duplicate object keys, nesting deeper than 12 containers (root object depth 1, each nested object/array adds 1) and all unrecognized properties. Do not coerce types, ignore unknown versions, normalize strings, or silently truncate arrays. Input files are never changed.

#### Bounded container

Construct both complete §17.7 payloads in memory before output creation, bounded to 16,777,216 UTF-8 bytes each. The deterministic uncompressed POSIX USTAR container contains exactly two regular-file entries in this order: `result.json`, then `report.md`. These are fixed container-member names, never input-derived filesystem paths. There is no directory entry, symlink, hardlink, device, sparse member, PAX/extended header, additional member or captured source content.

Each entry has one 512-byte header with its fixed ASCII name, mode `0600`, numeric uid/gid/mtime `0`, empty uname/gname/linkname/prefix and zero device numbers. Use typeflag `0`, six-byte magic `ustar\0` and version `00`; unused bytes are zero. Mode/uid/gid/device fields contain seven zero-padded octal digits plus NUL; size/mtime contain eleven plus NUL. The checksum field contains six octal digits, NUL, space, summing the unsigned header bytes while treating that field's eight bytes as spaces. A header records its payload's exact UTF-8 byte length. Zero-pad each payload only to the next 512-byte boundary, then append exactly two 512-byte zero end blocks; append no further record padding. Neutral metadata carries no host owner, clock, absolute path or random identity.

For payload lengths A and B, the exact container size is `2048 + 512 × ceil(A / 512) + 512 × ceil(B / 512)`. The maximum is 33,556,480 bytes; two zero-length members occupy 2048 bytes. A first-over-limit payload or container fails before output creation; no truncated or partial report qualifies. Empty-member vectors qualify the container boundary only: ordinary valid evaluations, including empty case sets, still produce the complete §17.7 JSON/report payloads.

#### Exclusive file ownership and completion

The target must be a new direct child of an existing writable directory, outside this repository's worktree and outside either input path. Refuse an existing target of any kind, including an empty directory or dangling symlink, observed symlink components, non-directory parents and input/repository overlap. Capture the existing parent's identity and check observed path/parent identity before creation and before declaring completion. No newly created directory or later pathname occupant becomes the ownership baseline.

After input validation, complete report/container construction and output-safety checks, create the file exclusively with an operation that returns the actual created file descriptor and explicitly requests private `0600` POSIX permissions in that creation operation. A Node `open(path, 'wx+', 0o600)` call supplies that exclusive creation and permits verification through the same descriptor. Keep that owned descriptor through all writes and verification; do not reopen the output path and adopt its occupant. Before any content bytes, enforce private `0600` POSIX permissions through the owned descriptor, including a restrictive umask, and verify the owned regular-file identity. Never chmod a pathname.

Check the observed parent and target against their captured/created identities before content writes and after completion. Write only through the created descriptor, account for partial writes, and verify the complete expected bytes, length and private permissions through that descriptor. A changed target or parent, unlink/recreation, wrong type, truncation, partial/incomplete verification or file/path/close failure is not success. Require successful closure of the owned file and any captured parent descriptor before emitting a receipt. Attempt to close every known owned descriptor on failure without replacing the primary diagnostic with a raw cleanup error. Competing invocations at one target, without intervening external removal or replacement of that target, yield at most one successful exclusive creation. External namespace changes follow the observed-check limits below. A retry always uses a new path.

On creation/write/verification/close failure, emit no success receipt. Preserve the incomplete owned file and every replacement; perform no unlink, rmdir, rename or other namespace cleanup. The diagnostic says that incomplete output may remain and requires a fresh path, without claiming its current location or exposing a full path. Existence, an expected filename or a parseable partial file is never completion. Users preserve or inspect their private files outside this command; there is no automatic deletion or extraction.

#### Filesystem capability and observed limits

The selected filesystem must honor exclusive creation and stable opened-file identity; POSIX privacy additionally requires permission enforcement. [Node's filesystem-flag documentation](https://nodejs.org/docs/latest-v24.x/api/fs.html#file-system-flags) warns that exclusive creation may not work on network filesystems. This contract requires those filesystem capabilities and does not certify arbitrary local or network paths, introduce a filesystem audit, or infer a trusted private parent. An observed unsupported operation or identity/permission capability fails safely rather than falling back to nonexclusive creation.

Creation binds the new file to its returned descriptor atomically; content is visible progressively while it is written. The final checks establish the observed owned-file result, not atomic content publication, protection against arbitrary processes with the same UID, a snapshot of every path component under arbitrary mutation, permanent identity/content after the last check, or crash/power-loss durability. In particular, replacement after the last validation, including during a subsequent close, need not be observable. File existence alone never substitutes for the successful receipt.

#### Receipt, diagnostics and validation order

Success emits exactly one newline-terminated JSON receipt, with these keys/order:

```json
{
  "schema": "prisma-prim-pilot-receipt/v2",
  "dataKind": "synthetic",
  "measurementBasis": "declared_inputs_unverified",
  "format": "ustar",
  "entries": ["result.json", "report.md"]
}
```

Emit the receipt on one line, without indentation; dataKind copies the case file and the other values/order are fixed. Entries identify container members, not filesystem paths. A receipt attests neither measurement/reference verification nor later pathname identity. Diagnostics go only to stderr. Exit 0 means valid inputs and a complete verified/closed owned output, including empty/failed/unmeasured evaluations; it means nothing about pilot quality. Exit 2 means argument/schema/reference validation failure, exit 3 means file/path/output failure, exit 1 means an unexpected internal failure.

A failure emits one JSON diagnostic of at most 2048 UTF-8 bytes, with only `schema` (`prisma-prim-pilot-error/v1`), `code`, `input` (`arguments`, `cases`, `runs`, `output`, or `internal`), `location` (JSON Pointer or null), `message`, `example`. Report the first error in fixed validation order: arguments, cases file/schema/reference integrity, runs file/schema/reference integrity, output safety, write. Array validation follows input order and object validation follows the contract field order. Messages give a safe repair and the invocation above; they never echo values, source text, full paths, descriptors, stack traces, environment or raw OS errors. Codes remain `E_ARGUMENT`, `E_INPUT_FILE`, `E_INPUT_LIMIT`, `E_JSON`, `E_SCHEMA`, `E_DUPLICATE`, `E_REFERENCE`, `E_OUTPUT_PATH`, `E_OUTPUT_EXISTS`, `E_OUTPUT_LIMIT`, `E_OUTPUT_WRITE`, `E_INTERNAL`. E_INPUT_FILE maps to exit 3; E_INPUT_LIMIT (bytes/depth), E_JSON (UTF-8/BOM/syntax), E_SCHEMA, E_DUPLICATE (object keys/IDs/tuples) and E_REFERENCE map to exit 2; E_OUTPUT_PATH/EXISTS/LIMIT/WRITE map to exit 3; E_ARGUMENT maps to exit 2 and E_INTERNAL to exit 1. Output write/verification/close failures use E_OUTPUT_WRITE. For an unknown property, location names the containing validated object, never the untrusted key. For example, exit 2/`E_SCHEMA` at `/manual/observations/0/elapsedMs` says “Use null or an integer from 0 to 604800000 milliseconds.”

### 17.4 Closed case/reference input — v1

Tables specify the complete allowed keys. Every listed key is required, including nullable keys; only its value may be null where explicitly allowed. An ID matches `[A-Za-z][A-Za-z0-9._-]{0,63}`. A Version is an integer 1–1,000,000. A UTC timestamp is a real calendar instant in exact `YYYY-MM-DDTHH:mm:ss.sssZ` form. IDs are scoped to their declared caseSetId; a new set identity is distinct from a new Version of the same set. All strings contain valid Unicode with no control characters (U+0000–001F/U+007F), no lone surrogate, and at most 256 Unicode code points except `task` (1–1000). String equality is exact, including case, whitespace and Unicode composition. A non-null value/locator/evidence reference is nonempty. A SHA-256 is exactly 64 lowercase hex characters.

| Object           | Complete fields and bounds                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Case file        | `schema: "prisma-prim-pilot-cases/v1"`, `caseSetId: ID`, `caseSetVersion: Version`, `dataKind: "synthetic" \| "anonymized_declared"`, `scope: Scope`, `protocol: Protocol`, `cases: Case[0..200]`.                                                                       |
| Scope            | `workspaceRef: ID`, `companyRef: ID`; minimized references, never names or an access claim.                                                                                                                                                                              |
| Protocol         | `protocolId: ID`, `protocolVersion: Version`, `task: string`, `timingRule: "elapsed_preparation_including_review"`. The task defines the same source-reading start and reviewed-result finish for both runs. It must describe equivalent work and the capture procedure. |
| Case             | `caseId: ID`, `caseVersion: Version`, `language: "ro" \| "ru" \| "en" \| "other"`, `sourceSetId: ID`, `sourceSetVersion: Version`, `sources: Source[1..16]`, `reference: Reference`. Case, source-set and reference IDs are each unique across the set.                  |
| Source           | `sourceId: ID`, `sourceVersion: Version`, `sha256: SHA-256`, `locators: string[1..32]`. Source ID/Version pairs and locators within each Source are unique. Repeating the same source ID/Version across cases requires identical hash and locator set.                   |
| Reference        | `referenceId: ID`, `referenceVersion: Version`, `preparedBy: ID`, `preparedAt: UTC`, `preparationEvidenceRef: string`, `fields: ReferenceField[0..32]`, `citations: Citation[0..32] \| null`.                                                                            |
| ReferenceField   | `fieldId: ID`, `state: State`, `value: string \| null`. Field IDs are unique per reference.                                                                                                                                                                              |
| State/value pair | `state` is `confirmed`, `inferred`, `missing` or `contradictory`. Confirmed/inferred require a nonempty string value; missing/contradictory require null. These are declared expected/observed states, never AI-granted confirmation.                                    |
| Citation         | `sourceId: ID`, `sourceVersion: Version`, `locator: string`. Exact three-part tuple; duplicate tuples are invalid.                                                                                                                                                       |

Every reference citation must resolve to its case's declared Source ID, Version and one declared locator; otherwise fail `E_REFERENCE`. A source checksum identifies declared original bytes but the tool does not retrieve or verify those bytes, rights, authenticity, approval, actor competence or semantic support. Reference preparation evidence must identify the independent basis in controlled material; an operator must not derive expected answers from the selected run merely to improve its score. The command cannot enforce that independence externally, so the report calls these declared references, including for `anonymized_declared`.

`citations:null` means that citation-reference evaluation is unsupported for that case; an empty array means supported with no reference citation expected. Zero reference fields means field correctness and review-change rates are unavailable. An empty case list is valid and yields zero paired counts with unavailable rates.

`dataKind` applies to the entire set and both runs. Synthetic cases, references, attribution and timing must all be labelled synthetic. `anonymized_declared` describes the operator's claim of minimized actual work records, not a verification of anonymization or representativeness; fabricated values must not be submitted under that label. Mixing classes requires separate files/reports. Real or uncontrolled confidential data must never enter Git, ordinary logs or provider prompts. Only plainly synthetic fixtures may be committed.

### 17.5 Closed selected-runs input — v1

| Object        | Complete fields and bounds                                                                                                                                                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runs file     | `schema: "prisma-prim-pilot-runs/v1"`, `evaluationId: ID`, `caseSetId: ID`, `caseSetVersion: Version`, `protocolId: ID`, `protocolVersion: Version`, `manual: Run`, `assisted: Run`. Set/protocol identity must equal the case file or fail `E_REFERENCE`.                                                      |
| Run           | `runId: ID`, `mode: "manual" \| "assisted"`, `methodId: ID`, `methodVersion: Version`, `operatorRef: ID`, `recordedBy: ID`, `capturedAt: UTC`, `captureEvidenceRef: string`, `reviewerRef: ID \| null`, `reviewedAt: UTC \| null`, `observations: Observation[0..200]`.                                         |
| Observation   | `caseId: ID`, `caseVersion: Version`, `sourceSetId: ID`, `sourceSetVersion: Version`, `referenceId: ID`, `referenceVersion: Version`, `status: "completed" \| "failed" \| "not_run"`, `elapsedMs: integer[0..604800000] \| null`, `fields: ObservedField[0..32] \| null`, `citations: Citation[0..32] \| null`. |
| ObservedField | `fieldId: ID`, `initial: Value`, `final: Value \| null`. Value has only `state` and `value`, with the same State/value rules as §17.4. Field IDs are unique per observation; for a compatible observation they belong to the case's reference field IDs.                                                        |

The `manual` object's mode must be manual and `assisted` mode assisted; run IDs must differ. Each Run selects at most one observation per declared case. Unknown/duplicate case IDs fail `E_REFERENCE`/`E_DUPLICATE`; no “latest”, best-attempt selection or cross-product matching occurs. Omitted observations remain missing, not zero. Method ID/Version and capture evidence describe what actually produced the recorded output; assisted may be a manually captured use of an existing tool and requires no AI provider. Selecting two methods is not evidence that either ran.

Completed means the declared task finished, not that its result was correct. Failed requires `fields:null` and `citations:null`; its non-null elapsed time may describe a failed attempt but never enters successful paired-time measures. Not-run requires null time/fields/citations. Completed allows independently unmeasured null time/fields/citations. Numeric strings, negatives, fractional/non-finite times and values above the seven-day limit fail validation; 0 is a captured zero and remains excluded from time comparison on either side. There is no minute/second guessing, timestamp subtraction, duration estimation or extrapolation. The timing includes human review/correction and waiting within the declared equivalent task; capture evidence must explain any protocol breach. A protocol breach requires a separately identified corrected run, not silent removal of inconvenient elapsed time.

`fields:null` means not captured. `fields:[]` means captured with no proposed fields: each reference field is incorrect/absent. Within a captured array, omitted expected fields are likewise incorrect/absent. For a compatible observation, unknown fields are invalid input, not extra credit. An incompatible observation may retain historical field IDs absent from the current reference; validate their structure/uniqueness but perform no current-reference field join. `final:null` means not human-reviewed; otherwise retain the initial and declared final pair. If any final value exists, both reviewerRef and reviewedAt must be non-null; those two metadata fields are either both null or both non-null. They attribute the review, without authenticating it or claiming expert approval.

Observation identity differences in the five fields `caseVersion`, `sourceSetId`, `sourceSetVersion`, `referenceId`, `referenceVersion` are valid captured incompatibilities. Preserve the actual tuple, report the differing field names, and exclude that side from every reference-derived measure and all paired comparisons. Never reinterpret it against the current reference. Observed citation tuples may fail to resolve to the declared Source inventory: preserve them as unresolved and incorrect, rather than silently dropping an unsupported reference. This differs deliberately from invalid reference citations, which invalidate the reference input itself.

### 17.6 Pairing and metric definitions

One row is emitted for every declared case, ordered by ASCII caseId; no case disappears. A base pair requires both observations present, compatible with that case's complete identity, and completed. Each metric further declares its own paired set. Marginal observations may support a per-side result, but never a comparative aggregate for an absent/failed/incompatible partner.

| Metric                          | Per-side/per-case meaning                                                                                                                                                                                                                                                                                                       | Paired aggregate meaning                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Preparation time                | Preserve captured integer milliseconds, including 0/null; calculate a reduction only when both base-pair durations are non-null and strictly positive. `100 × (manualMs − assistedMs) / manualMs`; negative means slower assisted work.                                                                                         | On exactly those time-paired cases: sum manualMs, sum assistedMs, and `100 × (sumManualMs − sumAssistedMs) / sumManualMs`. Never average percentages or compare sums on different case sets.                                                                                               |
| Initial exact field correctness | When compatible/completed and fields captured: correct expected fields / all reference fields. A match requires equal state and value; missing observed fields are incorrect. Zero reference fields yields an unavailable rate.                                                                                                 | Include base pairs with non-null fields on both sides and ≥1 reference field. Sum correct fields on each side over the same sum of reference-field counts. This is a field-weighted exact-match rate, not semantic extraction accuracy.                                                    |
| Human review changes            | For captured fields with final values, count reviewed fields, final exact matches, and changed state/value pairs. A change includes inferred→confirmed even with identical text; it is not necessarily an error or a successful correction. Show reviewed coverage / expected fields.                                           | Include only base pairs where both sides contain every reference field with a final value and ≥1 reference field. Sum changed fields / the same sum of fully reviewed expected fields. A partial review never lowers a paired change rate by omission.                                     |
| Exact citation references       | When compatible/completed and reference/observed citations are non-null: intersect exact tuples. Precision = matched / observed count; recall = matched / expected count; exact = both sets equal. Unresolved observations count as unexpected. Empty expected/observed sets retain zero denominators; exact may still be true. | Include base pairs with supported references and captured citations on both sides, including empty arrays. Sum matched/observed counts for precision, matched/expected counts for recall, and exact cases / paired cases. No citation text, answer meaning or entailment judge is implied. |

Per-side final correctness is `finalCorrectCount/reviewedCount`; coverage always accompanies it, and it is never substituted for initial correctness. The first slice does not aggregate final correctness into an additional comparative measure. No metric infers error severity, administrative errors avoided, approved prices, missing-document detection, multilingual adequacy, access safety or user satisfaction from exact strings.

Every rate is `{numerator,denominator,value}` with nonnegative integer counts and a fixed-six-place decimal string for `value`, or null when denominator 0. Rates are fractions (e.g. `"0.666667"`); reductionPercent and percentage-point deltas use percentages (e.g. `"16.666667"`). Never emit NaN, Infinity, a zero placeholder or 100% for an undefined measure. Calculate from exact integer counts/rational fractions, round only at serialization to six places using half away from zero, and emit `"0.000000"` for rounded zero. Deltas are assisted-minus-manual percentage points calculated from unrounded rates; negative correctness/citation deltas and positive review-change deltas remain visible without an automatic good/bad verdict.

Each case's exclusion list is independently complete and in this order, using these exact codes: `missing_manual`, `missing_assisted`, `incompatible_manual`, `incompatible_assisted`, `failed_manual`, `failed_assisted`, `not_run_manual`, `not_run_assisted`; followed for time by `unmeasured_time_manual`, `unmeasured_time_assisted`, `zero_time_manual`, `zero_time_assisted`; for fields by `no_reference_fields`, `unmeasured_fields_manual`, `unmeasured_fields_assisted`; for changes by those field codes then `incomplete_review_manual`, `incomplete_review_assisted`; for citations by `unsupported_reference_citations`, `unmeasured_citations_manual`, `unmeasured_citations_assisted`. Additional metric-specific codes are evaluated only for sides of a base pair; reference-only `no_reference_fields`/`unsupported_reference_citations` apply regardless of base eligibility. A zero-time code requires a captured zero, while an unmeasured-time code requires null. An incomplete-review code applies only when that side has a non-null captured fields array, the reference has at least one field, and not every reference field has a final value; unmeasured fields do not additionally produce an incomplete-review code. When a base pair is absent, do not invent measurement/review exclusions for the unavailable side. Empty exclusions means included. Case counts are always based on case identities, never field or citation counts.

### 17.7 Closed report output — v1

`result.json` has only `schema` (`prisma-prim-pilot-result/v1`), `evaluatorVersion` (`"2.0.0"` for this output-protocol revision), `evaluationId`, `inputs`, `caseSet`, `runs`, `cases`, `aggregate`.

- `inputs` has only `casesSha256`, `runsSha256`: hashes of the complete captured input bytes. `caseSet` has only `caseSetId`, `caseSetVersion`, `dataKind`, `scope`, `protocol`, copied from the validated case file. `runs` has only `manual`, `assisted`, each containing its Run metadata from §17.5 with `observations` omitted.
- Each `cases` row has only `caseId`, `referenceIdentity`, `manual`, `assisted`, `pairs`. `referenceIdentity` has exactly the five identity fields listed in §17.5. Each side is null for an absent observation, otherwise has only `declaredIdentity` (those same five fields), `status`, `elapsedMs`, `identityMismatches` (the differing field names in their listed order), `fields`, `citations`.
- Side `fields` is null unless compatible/completed with captured fields. Otherwise it has only `expectedCount`, `initialCorrectCount`, `reviewedCount`, `finalCorrectCount`, `changedCount`, `details`. Each detail has only `fieldId`, `present`, `initialMatches`, `finalMatches`, `changed`. Emit every reference field in ASCII fieldId order; absent fields have false present/initialMatches and null finalMatches/changed. A present unreviewed field has null finalMatches/changed. Counts follow §17.6. No raw initial/final values are copied to outputs; inspect the hash-bound private input to resolve a mismatch.
- Side `citations` is null unless compatible/completed with both reference and captured citations non-null. Otherwise it has only `expected`, `observed`, `matched`, `missing`, `unexpected`, `unresolved`, each an array of Citation tuples. Missing = expected minus observed; unexpected = observed minus expected; unresolved = observed tuples absent from the Source inventory including locator. Unresolved is a subset of unexpected, not an extra denominator.
- `pairs` has only `time`, `fields`, `changes`, `citations`. Every entry has `exclusions`. Time additionally has `manualMs`, `assistedMs`, `reductionPercent`, all null if excluded. Fields/changes additionally have `manual`, `assisted` (Rate objects), `assistedMinusManualPp`; all three null if excluded. Citations additionally has `manual`, `assisted` (objects with only `precision: Rate`, `recall: Rate`, `exact: boolean`), `precisionDeltaPp`, `recallDeltaPp`, `exactDelta` (assisted minus manual, integer −1/0/1); all five null if excluded. Zero-denominator deltas are null.
- `aggregate` has only `declaredCasesCount`, `basePairCount`, `time`, `fields`, `changes`, `citations`. Each metric has `pairedCaseIds` and `excluded` (each excluded row has only `caseId`, `reasons`, copied from that case's exclusions). Together they partition every declared case exactly once. Time additionally has summed `manualMs`, `assistedMs`, `reductionPercent`; fields/changes additionally have `manual: Rate`, `assisted: Rate`, `assistedMinusManualPp`; citations additionally has `manual`, `assisted` (only `precision: Rate`, `recall: Rate`, `exact: Rate`), `precisionDeltaPp`, `recallDeltaPp`, `exactDeltaPp`. Empty paired sets have zero sums/counts and null rate values/reductions/deltas. No overall score, target/pass field or observation count outside this declared set exists.

UTF-8 artifacts use LF and one final newline. JSON uses the key order above and two-space indentation. Metadata subobjects follow input-contract field order. ID lists and rows use ASCII ID order; citation sets use sourceId, then numeric sourceVersion, then locator Unicode code-point order. Details/exclusions use the declared ordering above. `report.md` is a deterministic technical-English projection: the “SYNTHETIC — mechanics demonstration” or “DECLARED ANONYMIZED OBSERVATIONS — not independently verified” banner, evaluation/set/protocol/method/run and input-hash provenance, declared/base/metric-paired case counts, aggregate numerators/denominators with units, and every case's side statuses/mismatch fields, per-case comparisons, field/citation counts and exclusion reasons. Display null as “unavailable” with its reason. Escape Markdown metacharacters and render metadata as literal text, never active links or HTML. Every report explicitly states: “Timings, references and hashes are supplied declarations. This command performs no independent measurement, source-byte authenticity check or semantic-support verification.” It contains no source contents or field values and invents no collection time.

Same captured input bytes and evaluatorVersion produce byte-identical JSON/report member payloads and USTAR containers at different fresh output paths. Output protocol v2 advances evaluatorVersion to `"2.0.0"`; this explicit metadata change does not claim whole-payload byte identity with the unmerged v1 implementation. Numeric oracles, input/result schema identifiers, declared provenance and validation order remain unchanged. Absolute paths, current time, wall-clock tool runtime, host/environment details and random IDs never enter artifacts. Input-array permutations leave metrics/order unchanged but change input hashes; a report must not pretend byte provenance stayed identical. An evaluator fix changes evaluatorVersion; schema changes require a new schema identifier, never permissive v1 parsing.

### 17.8 Versions, corrections and confidentiality

Any case/reference/source/protocol content change also advances caseSetVersion; a published set Version is never replaced in place. Case/source/reference changes create new declared Versions; changed source bytes require a new Source Version and source-set/case Version, and changed expected answers require a new reference/case Version. Preserve old files privately. Recapturing observations or correcting a recording creates a new runId and evaluationId with a new captureEvidenceRef that identifies the predecessor and correction reason in controlled material. Human review finals captured for a run do not overwrite its initials. Reports are preserved as immutable analysis outputs; reevaluation always writes a fresh container file without changing an earlier container or its members.

The command validates consistency within one invocation using the closed v1 input schemas and binds exact captured input bytes by hash. It has no registry and cannot detect an operator reusing an ID against secretly changed external bytes or verify controlled evidence. These preservation obligations must not be represented as authenticated business audit, signatures or proof that an observation occurred. Failures/rejections do not create application success history.

Minimize reference values and use opaque source/actor/context locators. Inputs and reports retain their original confidentiality; redaction/anonymization claims are not automatically trusted. Local file access and private storage remain the operator's responsibility under Platform policy. No real Client datasets, production exports, licensed ISO content, secrets, binary evidence or observed pilot reports are committed or published by this slice. The command follows no citation, path or evidence-reference content and executes no captured text. No retention service, upload, telemetry, account, grant, new infrastructure or legal approval is introduced. The CLI/report is a technical interface; it adds no localized application screen or accessibility interaction. Unicode source languages are preserved as data, with no language-quality claim.

### 17.9 Literal synthetic example and demonstration set

The following complete minimal inputs are synthetic authored examples, including source hash, identities, dates and elapsed numbers. They are not executions or measured timings. The repeated `a` hash declares fictional source bytes and is not an assertion that a real file was checked.

`cases.json`:

```json
{
  "schema": "prisma-prim-pilot-cases/v1",
  "caseSetId": "DEMO-ONE",
  "caseSetVersion": 1,
  "dataKind": "synthetic",
  "scope": { "workspaceRef": "W-DEMO", "companyRef": "C-DEMO" },
  "protocol": {
    "protocolId": "P-DEMO",
    "protocolVersion": 1,
    "task": "Synthetic source-reading start through reviewed preparation finish; manually authored observations only.",
    "timingRule": "elapsed_preparation_including_review"
  },
  "cases": [
    {
      "caseId": "A",
      "caseVersion": 1,
      "language": "ro",
      "sourceSetId": "S-A",
      "sourceSetVersion": 1,
      "sources": [
        {
          "sourceId": "DOC-A",
          "sourceVersion": 1,
          "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "locators": ["p1"]
        }
      ],
      "reference": {
        "referenceId": "R-A",
        "referenceVersion": 1,
        "preparedBy": "SYNTHETIC-REF",
        "preparedAt": "2026-01-01T00:00:00.000Z",
        "preparationEvidenceRef": "SYNTHETIC-independent-authoring",
        "fields": [
          { "fieldId": "employees", "state": "confirmed", "value": "20" }
        ],
        "citations": [
          { "sourceId": "DOC-A", "sourceVersion": 1, "locator": "p1" }
        ]
      }
    }
  ]
}
```

`runs.json`:

```json
{
  "schema": "prisma-prim-pilot-runs/v1",
  "evaluationId": "DEMO-ONE",
  "caseSetId": "DEMO-ONE",
  "caseSetVersion": 1,
  "protocolId": "P-DEMO",
  "protocolVersion": 1,
  "manual": {
    "runId": "M-ONE",
    "mode": "manual",
    "methodId": "MANUAL-DEMO",
    "methodVersion": 1,
    "operatorRef": "SYNTHETIC-OP",
    "recordedBy": "SYNTHETIC-REC",
    "capturedAt": "2026-01-01T00:00:00.000Z",
    "captureEvidenceRef": "SYNTHETIC-authored-manual",
    "reviewerRef": "SYNTHETIC-REV",
    "reviewedAt": "2026-01-01T00:00:00.000Z",
    "observations": [
      {
        "caseId": "A",
        "caseVersion": 1,
        "sourceSetId": "S-A",
        "sourceSetVersion": 1,
        "referenceId": "R-A",
        "referenceVersion": 1,
        "status": "completed",
        "elapsedMs": 60000,
        "fields": [
          {
            "fieldId": "employees",
            "initial": { "state": "confirmed", "value": "22" },
            "final": { "state": "confirmed", "value": "20" }
          }
        ],
        "citations": [
          { "sourceId": "DOC-A", "sourceVersion": 1, "locator": "p1" }
        ]
      }
    ]
  },
  "assisted": {
    "runId": "A-ONE",
    "mode": "assisted",
    "methodId": "ASSISTED-DEMO",
    "methodVersion": 1,
    "operatorRef": "SYNTHETIC-OP",
    "recordedBy": "SYNTHETIC-REC",
    "capturedAt": "2026-01-01T00:00:00.000Z",
    "captureEvidenceRef": "SYNTHETIC-authored-assisted",
    "reviewerRef": "SYNTHETIC-REV",
    "reviewedAt": "2026-01-01T00:00:00.000Z",
    "observations": [
      {
        "caseId": "A",
        "caseVersion": 1,
        "sourceSetId": "S-A",
        "sourceSetVersion": 1,
        "referenceId": "R-A",
        "referenceVersion": 1,
        "status": "completed",
        "elapsedMs": 30000,
        "fields": [
          {
            "fieldId": "employees",
            "initial": { "state": "confirmed", "value": "20" },
            "final": { "state": "confirmed", "value": "20" }
          }
        ],
        "citations": [
          { "sourceId": "DOC-A", "sourceVersion": 1, "locator": "p1" }
        ]
      }
    ]
  }
}
```

Independent literal expectations for this one-case input: declared/base/all four metric paired counts 1; time 60000→30000 ms, reduction `"50.000000"`; initial field correctness 0/1→1/1, delta `"100.000000"` percentage points; changes 1/1→0/1, delta `"-100.000000"` percentage points; final correctness 1/1 for both; citation precision/recall/exact all 1/1 on both sides, all aggregate citation deltas `"0.000000"`. These literals must be authored separately from evaluator logic.

The runtime demonstration must additionally commit a fixed six-case **synthetic mechanics set** and independent literal expected metrics, using the same closed schemas and synthetic metadata above. Use caseSetId/evaluationId `DEMO-SIX`, run IDs `M-SIX`/`A-SIX` and set Version 1. All case/source-set/reference Versions start at 1, with unique IDs A–F/S-A–F/R-A–F; all unspecified observations are compatible/completed. Expected value for every field is confirmed `"20"`; wrong initials below are confirmed `"22"`; every provided final is confirmed `"20"`. Each case declares one fictional Source `DOC-<caseId>` Version 1 with the hash above and locators p1/p2; expected/observed citation names below are its tuples. B additionally declares Version 2 of its Source with the same fictional hash/locators, solely to exercise a valid-inventory but wrong-reference citation.

| Case | Reference fields/citations                 | Manual authored observation                                                    | Assisted authored observation                                              |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| A    | fields f1/f2; citations p1/p2 at Version 1 | 60000 ms; initials f1 correct/f2 wrong, both finals; citations p1 at Version 1 | 30000 ms; both initials correct, both finals; citations p1/p2 at Version 1 |
| B    | field f1; citation p1 at Version 1         | 30000 ms; correct initial/final; citation p1 at Version 1                      | 45000 ms; wrong initial, correct final; citation p1 at Version 2           |
| C    | field f1; citations null                   | 10000 ms; fields/citations null                                                | Observation omitted                                                        |
| D    | field f1; citations null                   | 10000 ms; fields/citations null                                                | failed, 5000 ms; fields/citations null                                     |
| E    | field f1; citations null                   | 10000 ms; fields/citations null                                                | completed, 1000 ms; referenceVersion 2, fields/citations null              |
| F    | field f1; citations null                   | 0 ms; fields/citations null                                                    | 1000 ms; fields/citations null                                             |

The literal six-case oracle is: declared 6, base pairs 3 (A/B/F), time pairs 2 (A/B), manual 90000 ms, assisted 75000 ms, reduction `"16.666667"`; per-case A reduction `"50.000000"`, B `"-50.000000"`. Field pairs A/B yield manual 2/3 and assisted 2/3 (`"0.666667"` each), delta `"0.000000"`. Change pairs A/B yield 1/3 on both sides (`"0.333333"`), delta `"0.000000"`. Citation pairs A/B yield manual precision 2/2 (`"1.000000"`), recall 2/3 (`"0.666667"`), exact 1/2 (`"0.500000"`); assisted precision 2/3, recall 2/3, exact 1/2, precision delta `"-33.333333"`, recall/exact deltas `"0.000000"`. B's assisted citation is unexpected, its expected Version 1 citation is missing, and unresolved is empty. C/D/E exclude every pair for missing_assisted/failed_assisted/incompatible_assisted respectively; E reports only referenceVersion in identityMismatches. F excludes time for zero_time_manual, fields/changes for both unmeasured_fields codes, and citations for unsupported_reference_citations plus both unmeasured_citations codes. Unsupported-reference exclusion also accompanies C/D/E citation exclusions. No part of this oracle is an observed gain or a 20-case real pilot. In every fixture, container-member names stay exactly result.json/report.md; case IDs never become paths. Input schema Versions and literal numeric expectations remain v1, while the produced evaluatorVersion is 2.0.0 and the completion receipt is v2.

Additional literal boundary oracles use separately named synthetic fixture variants: an empty case set and empty observation arrays yield declaredCasesCount/basePairCount 0, all pairedCaseIds/excluded arrays empty, time sums 0/0 with reductionPercent null, every Rate `{ "numerator": 0, "denominator": 0, "value": null }`, and all deltas null. For the complete one-case example with only manual elapsedMs changed to 0, basePairCount remains 1, time pairedCaseIds is empty, its excluded row is `{ "caseId": "A", "reasons": ["zero_time_manual"] }`, summed times remain 0/0 and reductionPercent is null; field/change/citation metrics stay unchanged. With only that elapsedMs changed to null, the same result uses `["unmeasured_time_manual"]`. A failed run’s observed 5000 ms and E’s incompatible 1000 ms never enter any time sum. The six-case time ledger has exactly C/missing_assisted, D/failed_assisted, E/incompatible_assisted and F/zero_time_manual in that case order.

### 17.10 Public verification and acceptance

The runtime child starts with failing subprocess tests through the real command, using temporary input files and fresh external output file paths. Expected literals above and negative fixtures must not be generated by importing evaluator code or copying the current output as truth. Private helpers may support implementation; their tests cannot substitute for public command evidence.

Acceptance requires all of the following through that seam:

1. Help works without files, supplies usable examples and exits 0; invalid arguments fail immediately without prompting. The complete one-case and six-case fixtures produce the stated literals, complete per-case ledgers and matching report values. Repeating exact input bytes with the same evaluatorVersion into a new path gives identical member payloads and container bytes.
2. Validate unknown/duplicate keys and versions, wrong types, malformed UTF-8/JSON, ID/array/depth/byte bounds, duplicate/unknown cases and fields, invalid reference citations and inconsistent repeated Source identities. Include just-at-limit and first-over-limit inputs. Validation creates no output.
3. Preserve slow/negative reductions, missing observations, failure/not-run, incompatible case/source-set/reference Versions, null/zero time on either side, invalid negative/fraction/string time, zero cases, zero reference fields, captured-empty fields/citations, unsupported citations and partial review. Assert exact per-metric coverage and zero-denominator nulls. Missing/bad data cannot manufacture improvement.
4. Preserve exact state/value differences, before/final values in input, changed versus incorrect meaning, review coverage, and citation Source ID/Version/locator integrity. Include wrong source/locator, missing/extra citations, unresolved observed tuples, and inferred→confirmed with equal text. No semantic normalization or reference repair occurs.
5. Refuse existing outputs of every kind, directory/symlink/device inputs, observed unsafe parents/components/overlap and concurrent same-path creation without overwriting. Through native public-command subprocess cases, replace the output before its first descriptor-stat and during writes, including unlink/recreation; change the captured parent and hold foreign sentinel files. Prove failure without adopting or deleting replacements, private permissions at creation before any descriptor chmod and verified final `0600` POSIX mode under ordinary/restrictive umasks, partial/truncated writes, close failure, known-descriptor closure and fresh-path recovery. Incomplete files remain untouched and the bounded diagnostic never claims their exact current location. Retain the explicit post-final-validation limitation; a replacement during a later close is not a universal detection claim. Input bytes are unchanged; error/console/report content remains bounded and escaped, without raw values or secret/environment echo.
6. Verify fixed header metadata/order/checksums, payload and total-byte limits before creation, zero padding/end blocks and deterministic whole-container bytes. An existing independent standard USTAR reader, used only in verification, must read exactly the two regular member names and their complete expected UTF-8 payloads, modes and neutral metadata. Qualify that reader in the fresh test harness; do not add a runtime parser, archive input, extraction action, package dependency or second public API. Container-only empty/boundary vectors do not replace the literal one-case/six-case comparison evidence.
7. Run with no provider credentials, database or server configuration and no external calls; no dependency/build acquisition is needed by the command. Test argv, exit code, stdout/stderr, member contents, container permissions and deterministic ordering, including an input permutation with changed byte hashes and unchanged metrics. No browser/PostgreSQL acceptance is relevant to this offline seam. Private primitive/container qualifications establish feasibility only, never runtime acceptance, a passing final gate or delivery.

### 17.11 Evidence dependencies and readiness

There is no missing first-tenant business fact for the explicitly synthetic mechanics. Bounds, IDs, pairing and counting retain their approved meaning. The output protocol is a reversible technical re-scope, not permission to weaken the old directory-ownership acceptance. No real case, provider, elapsed observation or first-tenant permission assignment is a prerequisite for this documentation revision.

The original contract received ordered independent Standards then Spec preparation and [coordinator approval under #957](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/957#issuecomment-6479172511) on 2026-10-28. That approval is historical provenance for v1, not approval or delivery of this v2 text. Root selected the qualified technical alternative through [#976](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/976) under delegated product authority. Following ordered independent Standards then Spec preparation and the bounded creation-mode correction, the coordinator [approved this v2 contract](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/976#issuecomment-6489604636) on 2026-10-29. Final current-base documentation verification and canonical merge remain required. A review PASS alone is not approval; neither approval nor documentation merge is runtime delivery.

[#963 / PR #966](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/966) remain blocked and unmerged under their original directory-output scope. Do not alter that scope in place to call it conformant or restart its bounded review rounds. After this complete v2 contract is reviewed, approved and actually merged, the coordinator updates the owning tracker and performs every [ticketing readiness gate](specification-and-ticketing-standard.md#8-ready-for-agent-gates), including supported filesystem capability, existing independent-reader availability, ownership and one-session fit. Only then explicitly close the old issue/PR as superseded and not delivered, retaining the diagnosis and successor link, and publish one context-free replacement runtime child. This documentation issue neither labels that future child ready nor begins its implementation.

The proposed replacement outcome remains “Produce an offline paired pilot-evaluation report from declared files.” One fresh runtime author implements all of §§17.3–17.10, including both synthetic fixture sets, independent literal metric expectations and the complete owned-container/failure journey through the sole public command. Prior metric material may inform the work; old source CI, private qualifications or an unmerged branch do not qualify the replacement's exact source/base/tree. Require the standard doctor, focused public command tests, format/lint/strict checks, complete current review policy and final integration evidence. Canonical v2 merge and fresh readiness are its blockers; #972 and Clerk #658 are independent, not artificial prerequisites. No product code or prototype starts from #976, and no new ADR is required for this reversible interface. ADRs 0001/0003/0005/0006 retain stack and business-authority ownership.

Real usefulness or AI promotion remains blocked on controlled representative current/obsolete/missing/contradictory and multilingual cases, lawful permitted sources, independently prepared reference evidence, actual equivalent-work manual/assisted captures with operator/review provenance, bias/order/failure review, and explicitly approved task-specific thresholds/sample design under §§9/14–16. Synthetic fixtures, this contract and an exit 0 do not close those dependencies. Pricing/calculation correctness, critical-action traceability, administrative-error rates, satisfaction, retrieval/answer semantics and safety/autonomy evaluation remain separately bounded later work. A general experiment platform, dashboards, live instrumentation, DB/API/storage services, permissions, provider adapters, automated decisions, real-data import/publication and process/tooling overhaul are excluded.

## 18. Offline knowledge-context and citation qualification

**Status:** Separately selected bounded offline engineering tool; the wider PRD
remains Draft and §16 still governs production AI readiness.

This tool prepares source contexts and qualifies separately supplied observations
against a finite synthetic oracle. It implements no model, application retrieval,
Knowledge Source admission, real role/permission grant, authenticated review,
production Analysis or Cited Answer. It invokes no provider, network, database,
tool action or business mutation. The selected runtime uses Node built-ins; the
existing §17 pilot command and its closed schemas/protocol remain unchanged.

### 18.1 Public command and file boundary

```bash
node scripts/knowledge-qualification.mjs --help
node scripts/knowledge-qualification.mjs prepare --help
node scripts/knowledge-qualification.mjs prepare --bundle /tmp/knowledge/bundle.json --out /tmp/knowledge/contexts-001.tar
node scripts/knowledge-qualification.mjs evaluate --help
node scripts/knowledge-qualification.mjs evaluate --bundle /tmp/knowledge/bundle.json --observations /tmp/knowledge/observations.json --out /tmp/knowledge/result-001.tar
```

The flags above are complete and each required flag has exactly one nonempty
local path. Help is alone at the root or after its one mode, exits0 and performs
no input/output file access. Reject missing/duplicate/unknown flags, positionals, mixed help,
stdin, URLs, globs, control-character paths and overwrite attempts; never prompt
or guess paths. Missing parent directories are not created.

Inputs are existing distinct regular files, each at most1,048,576 captured UTF-8
bytes including a one-byte overflow probe. Reject BOM, invalid UTF-8, malformed
JSON, duplicate object keys, nesting beyond12 containers, unknown properties,
unknown versions and symlink path components. Reuse §17.3's existing input and
exclusive USTAR output primitives without changing that command: the output is
one new direct child of an existing writable directory outside this worktree and
input paths, private0600 at exclusive creation and descriptor verification.
Exactly `result.json` then `report.md`, neutral headers/padding and end blocks,
each at most16,777,216 bytes, container at most33,556,480 bytes. Require complete
verified bytes and successful descriptor closure before receipt. Preserve inputs,
prior outputs, incomplete files and replacements; retry at a fresh path. §17.3's
filesystem capability and observed-path/race limitations apply unchanged: this is
not atomic content publication, arbitrary same-UID protection or crash durability.

### 18.2 Closed synthetic bundle

Every listed property is required unless explicitly optional; no other properties
are accepted. The wrapper is `schema: "prisma-prim-knowledge-bundle/v1"`, `content`
and `expectations`. It explicitly adopts the delivered kit's two literal JSON
blocks as nested synthetic inputs, rather than silently changing their former
illustrative formats or §17's incompatible input schemas.

| Object       | Complete properties                                                                                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content      | `format: "prisma-prim-synthetic-knowledge-content/v1"`, `corpusId`, `corpusVersion`, `dataKind: "synthetic"`, `profiles`, `sources`                                                           |
| Profile      | `profileId`, `workspaceRef`, `companyRef`, `purposes`, `permittedSources`                                                                                                                     |
| Source       | `sourceId`, `version`, `workspaceRef`, `companyRef`, `language`, `admission`, `status`, `title`, `passages`                                                                                   |
| Passage      | `locator`, `text`                                                                                                                                                                             |
| Reference    | `sourceId`, `version`                                                                                                                                                                         |
| Expectations | `format: "prisma-prim-synthetic-knowledge-expectations/v1"`, `corpusId`, `corpusVersion`, `expectationSetId`, `expectationSetVersion`, `dataKind: "synthetic"`, `cases`                       |
| Case         | `caseId`, `caseVersion`, `language`, `purpose`, `profileId`, `mode`, `question`, `candidateRefs`, `expected`; optional `selectedHistoricalRefs` and `humanDisposition` only as below          |
| Expected     | `outcome`, `retrievalRefs`, `citations`, `requiredProperties`, `prohibitedOutcomes`; optional `fields`, or the pair `initialFields`/`finalFields`, never both shapes                          |
| Citation     | `sourceId`, `version`, `locator`, `quote`                                                                                                                                                     |
| Field        | `fieldId`, `state`, `value`; optional `rationale` and `alternatives`                                                                                                                          |
| Human event  | `eventRef`, `actorRef`, `kind`, `fieldId`, `at`, `evidenceKind: "authored_fiction"`; accept requires `value`, correct requires `value`/`reason`, reject requires `reason` and forbids `value` |

IDs match `[A-Za-z][A-Za-z0-9._-]{0,63}`. Versions are integers1–1,000,000.
Strings are well-formed Unicode, preserve exact composition/case/whitespace, and
exclude C0 controls except tab/LF/CR and exclude DEL. All text is nonempty.
Titles/locators contain at most256 code points; passages/quotes16,000;
questions, rationales, reasons and qualitative notes2,000; field values and
alternatives1,000. A human event's time is a real UTC calendar instant in exact
`YYYY-MM-DDTHH:mm:ssZ` form. Language is `ro`, `ru`, `en` or `other`; purpose is
`cited-answer` or `analysis`. Admission is `synthetic-approved` or
`synthetic-not-approved`; status is `current` or `superseded`.

Bounds:1–32 profiles,0–128 source Versions,1–32 passages per source,0–128
permitted references per profile,0–200 cases,0–16 candidate/expected retrieval
references per case,0–32 citations/fields/qualitative notes. Purposes are unique,
at most2. Historical mode requires1–16 exact `selectedHistoricalRefs` drawn from
the case's candidates; current mode forbids that property. Source ID/Version,
profile, case, locator within a Version, citation source/Version/locator, field
within its array and event IDs are unique. A Source ID retains one Workspace/Company and at most one current Version.
All profile/candidate/history references resolve to this inventory; corpus IDs
and Versions agree between content and expectations.

Field state is `inferred`, `confirmed`, `missing` or `contradictory`.
Inferred/confirmed require a nonempty value; missing/contradictory require null.
Optional alternatives are2–16 unique strings and allowed only for contradictory
state. Qualitative rationale/notes are not mechanically judged. Initial expected
fields cannot be confirmed: this selected protocol supplies no prior authenticated
approval. A human event is allowed only for an Analysis case with separate initial
and final expected fields. Accept/correct supplies exactly one matching confirmed
final field; reject supplies no final fields. The event names an existing initial
field, and accept retains its proposed value. Those are authored fictional events,
not execution of a review action.

Outcome is one of `supported`, `supported_history`, `contradictory`,
`insufficient_evidence`, `insufficient_authorized_evidence`, `access_denied`,
`supported_with_untrusted_instruction`, `analysis_proposal`, `human_accepted`,
`human_corrected`, `human_rejected`, `insufficient_admitted_evidence`.
The human outcomes require the matching supplied event kind. Oracle retrieval
references must be eligible; oracle citations must match actual full passage text
and an oracle-retrieved source. An invalid oracle fails input validation.
The tool cannot establish immutability, authenticity or rights from declared IDs:
operators version changed bytes/preconditions and retain the original inputs.

### 18.3 Candidate-safe preparation

Eligibility is computed from the case's candidates and declared profile, never
from expected answers, expected retrieval references or qualitative notes.
A source must match the profile's Workspace/Company, be permitted by that
profile, be synthetically approved and satisfy its purpose. Current mode includes
only current sources; history includes only the explicitly selected Versions,
retaining each status. No purpose permission produces no source or fictional
review-event context. A derived `capability` marker is `simulated_allowed` or
`simulated_denied`, not an oracle answer or real application grant.

`result.json` is `prisma-prim-knowledge-contexts/v1`: `schema`,
`dataKind: "synthetic"`, `measurementBasis: "declared_inputs_unverified"`,
`corpus {id,version}`, `expectationSet {id,version}`, `contexts`.
Each context contains only `caseId`, `caseVersion`, `profileId`, `capability`, `purpose`, `mode`,
`language`, `question`, `scope {workspaceRef,companyRef}`, permitted `sources`
and the explicitly supplied `humanDisposition` or null. A supplied source exposes
only `sourceId`, `version`, `status`, `language`, `title`, `passages {locator,text}`.
Keep inventory order. Omit all inaccessible IDs/titles/content, full profiles,
candidates and oracle properties. An empty supplied-source array is generic
insufficiency, never a hidden-source count or permission explanation.
`report.md` lists only those contexts and supplied source identities/statuses.

Source passages and human events remain untrusted declared data. They cannot
change eligibility, invoke a tool or create authority. Preparing these exact
contexts proves this tool's output only; it does not prove what a later external
provider actually received or whether a candidate followed an embedded instruction.

### 18.4 Separate captured observations and mechanical evaluation

The closed observation file contains `schema:
"prisma-prim-knowledge-observations/v1"`, `dataKind: "synthetic"`, `corpusId`,
`corpusVersion`, `expectationSetId`, `expectationSetVersion`, `runId`, `runVersion`,
`methodId`, `methodVersion`, `evidenceKind` (`authored_fixture` or
`captured_declared`) and0–200 unique `observations`.

Each observation has `caseId`, `caseVersion`, `profileId`, `purpose`, `mode`,
`status`, `retrievalRefs`, `outcome`, `citations`, `initialFields`, `finalFields`,
`humanEventRef`, with optional `answer`. Corpus/expectation identities and every
case/profile/purpose/mode/Version must match the bundle exactly; reject unknown
cases or incompatible identities rather than joining them silently. Completed
observations supply arrays and an outcome from the enum; humanEventRef is an ID
or null and optional answer is nonempty text up to16,000 code points.
For `failed`/`not_run`, all six evidence fields are null and optional answer must
be null. An absent case observation is reported as missing, not a success.

Unknown/ineligible observed source references and bad quote/locator/Version are
mechanical findings rather than a false successful capture. Keep separately
captured observations separate from authored expectations: runtime must never
produce observations by copying the oracle. The bundled demonstration observations
are expressly labelled authored fixtures, not captured inference.

Evaluation result `prisma-prim-knowledge-result/v1` contains schema/dataKind/
measurementBasis, corpus/expectation identities, run `{id,version,methodId,
methodVersion,evidenceKind}`, captured input SHA-256 values, per-case records,
summary and explicit unavailable measures. Each record preserves case/profile/
purpose/mode/Version, declared status, finding code/index pairs, measurements,
initial/final observed fields, the separately supplied fictional event and captured
answer or null. Output never invents an event from a candidate's claimed event ID. Evaluation
results are operator-only; only prepare output is a candidate context.

| Measure                   | Exact numerator                                                                                             | Denominator                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| retrievalSetMatch         | 1 when declared retrieval references equal the oracle set and all are eligible, else0                       | 1 per completed observation                      |
| citationExactness         | Observed citations with eligible source, known locator, exact full quote and a declared retrieval reference | Observed citations                               |
| citationReferenceCoverage | Oracle citations reproduced exactly                                                                         | Oracle citations                                 |
| outcomeMatch              | 1 for literal declared-outcome equality, else0                                                              | 1 per completed observation                      |
| initialFieldMatch         | Expected initial fields matching ID/state/value/ordered alternatives                                        | Expected initial fields                          |
| finalFieldMatch           | Expected final fields matching ID/state/value/ordered alternatives                                          | Expected final fields                            |
| humanEventMatch           | 1 when the claimed event ID equals the supplied fictional event, else0                                      | 1 if an event is supplied or claimed; otherwise0 |

Retrieval/citation/field collections compare without order, except an individual
field's alternatives retain declared order. Rationale and free answer text receive
no semantic judgment. Extra, missing or changed entries produce findings even when
a reference-coverage numerator happens to equal its denominator. A confirmed
initial field, or confirmed final field without the matching separately supplied
accept/correct event/field/value, produces unsupported-confirmation findings.
A hidden retrieval is flagged even when final answer text appears harmless.

Each measure is `{numerator,denominator,value}`. The integer counts are
authoritative; value is the ratio rounded to six decimal places, or null for a
zero denominator. Failed/not-run/missing observations contribute0/0. Summary
includes case/completed/failed/notRun/missing counts, casesWithFindings and summed
measurements. Empty sets and absent fields/citations never manufacture a score.
Semantic support, language quality, representativeness, actual access enforcement,
authenticated human approval, serious-error thresholds and release/MVP completion
remain explicitly unavailable. There is no aggregate quality verdict or promotion.

### 18.5 Receipt, failure semantics and literal example

Success emits one newline-terminated JSON receipt with `schema:
"prisma-prim-knowledge-receipt/v1"`, `mode`, `dataKind: "synthetic"`,
`measurementBasis: "declared_inputs_unverified"`, `format: "ustar"`,
`entries: ["result.json","report.md"]`. No local output path or source content
is printed. Exit0 attests complete mechanical files even with findings; exit2
means arguments/JSON/schema/bounds/duplicate/reference failure, exit3 means
input-file/path/output failure, exit1 an unexpected internal failure.

Failure emits one safe JSON line to stderr, at most2,048 bytes, with
`schema: "prisma-prim-knowledge-error/v1"`, `code`, `input`, `location`,
`message`, `example`; stdout is empty. Input is arguments/bundle/observations/
output/internal and location is a known JSON Pointer or null. Codes remain
E_ARGUMENT, E_INPUT_FILE, E_INPUT_LIMIT, E_JSON, E_SCHEMA, E_DUPLICATE,
E_REFERENCE, E_OUTPUT_PATH, E_OUTPUT_EXISTS, E_OUTPUT_LIMIT, E_OUTPUT_WRITE,
E_INTERNAL. Do not echo untrusted values/keys, full paths, raw OS errors or secrets.
Validation order is arguments, bundle JSON/schema/references, observation JSON/
schema/references when selected, then output construction/safety/write.

The [literal fixtures](../../scripts/fixtures/knowledge-qualification/README.md)
transcribe all22 kit cases. K01's current citation is `S-RO-INVENTORY`, Version2,
locator `p1`, exact text “În atelierul fictiv Lumen sunt patru cutii de mostre.”
The literal correct observation contributes1/1 citationExactness; replacing
“patru” with “cinci” contributes0/1 and a quote-mismatch finding. Superseded
Version1's exact quote is still ineligible in current mode. K19 retains initial
inferred5 and the separately supplied fictional correction to confirmed4;
K20's rejection has no final value. The full separately authored fixture gives
14/14 exact citations,22/22 retrieval-set matches,7/7 initial fields,2/2 final
fields and3/3 event-reference matches. These are inspectable mechanics, never
observed model accuracy, real human approval or representative first-tenant work.

Run spawned public CLI tests for these vectors, wrong/unknown identities, hidden
retrieval despite harmless text, absent/failed observations, empty denominators,
Unicode/whitespace exactness, source-instruction data, malformed inputs and
exclusive/private output recovery. Source kit literals and the existing §17 pilot
command stay unchanged. Actual source inventory/rights/admission, real approvers
and grants, representative useful cases, registry/interactions and legal/security/
provider review/configuration remain production AI dependencies under §§9/14–16.

## 19. Read-only cited-evidence connection for Codex — bounded software contract

**Status:** Selected bounded application contract; production promotion is separate.

**Capability:** `knowledge.cited-evidence`, version `1`.

**Owner:** Knowledge; NestJS retains authorization, source admission and exact references.

The initial connection exposes PRISMA evidence through standard MCP to an
operator-configured Codex client. ChatGPT/Codex performs inference; this server
returns governed evidence, not a generated answer or a confirmed Analysis. It
uses no model API key and never reads Codex credentials, ChatGPT cookies or
subscription tokens. Sections 5–9/14–16 and their actual source, representative,
legal/security and production-promotion requirements remain in force. Synthetic
software tests satisfy none of those real-world inputs.

### 19.1 Source admission and literal curated projections

A Company Knowledge Source names an exact official or deliberately historical
Document Version and one preserved PDF representation. Creation verifies native
Document/content visibility, the actual preserved byte checksum and the Version
binding. Unverified external references and draft Document Versions are not
admissible. Official designation alone grants no knowledge eligibility.

The closed draft input contains `documentId`, `documentVersionId`,
`representationId`, `sourceSha256`, `language` (`ro`, `ru`, `en`),
`ownerReference` (1–200 characters), `provenance` and `rightsEvidenceReference`
(each 1–1000), `permittedPurpose: "cited-evidence"`, `effectiveFrom`,
`effectiveUntil` and `passages`. Effective instants use exact UTC
`YYYY-MM-DDTHH:mm:ss.sssZ`, with an end strictly after the start. Confidentiality
comes from the governed Document and grants no additional access.

There are 1–20 passages with distinct literal locators (1–120 characters,
excluding `.` and `..`) and literal text (1–16384 characters); their serialized
array is at most 48000 UTF-8 bytes. NUL, unsupported control characters and
unpaired surrogates are rejected. No whitespace, case or Unicode normalization
changes a passage. The projection checksum binds Version, representation,
source checksum and ordered locator/text pairs. Individual passage hashes bind
exact UTF-8 text. A projection is a human-curated transcription, not an OCR or
semantic-correspondence result verified by the server.

The lifecycle is `draft → admitted → revoked`, with `draft → revoked` also
available. There is no un-revoke, in-place content correction or deletion.
Changed source/projection content requires a new Source. Approval names the
expected revision and both source/projection hashes with the exact attestation
`exact-version-source-and-use-reviewed/v1`. The authenticated administrator
thereby records a review declaration for that exact content and use. A nonempty
rights reference or an attestation does not independently prove a license,
legal review, expert approval or a real business-source admission.

Commands require an Idempotency-Key and optimistic revision for transitions.
The key is scoped to Workspace and actor membership; Company, target, operation
and validated input are fingerprinted. An identical retry rechecks current
source-administration and native Document access, then returns the original
receipt. A changed/reused command conflicts. Receipts describe the original
command revision, not a promise of current admission. Projection, source state,
receipt and attributed history commit atomically. Database guards preserve
immutable content and append-only contiguous transition history.

### 19.2 Authority and private audit

Two new Company bundles start **unassigned**, each with immutable captured `v1`:

| Bundle                                 | Permission                | Boundary                                                |
| -------------------------------------- | ------------------------- | ------------------------------------------------------- |
| Company Knowledge Source Administrator | `knowledge.source.manage` | Draft, attest, revoke and inspect source administration |
| Company Knowledge Evidence Reader      | `knowledge.evidence.read` | Read admitted cited evidence                            |

Existing Workspace assignment management owns explicit grants/revokes. No old
bundle version expands, existing role/title implies neither new permission, and
neither bundle supplies native Document or content visibility. Every operation
also requires the current Company and its existing Document/content authority.
Captured assignment identity/version is checked against its live unrevoked row;
a replaced assignment cannot revive an old capture with equal permission strings.

Source administration can prepare an inventory before capability activation.
Its inspection/history additionally requires current native Document visibility.
The current Accountability owner appends restricted `knowledge_source_events`
inside the command transaction, with exact source/revision, action, actor
membership/Internal User/display snapshot, command fingerprint and server instant.
This follows its existing restricted-event pattern: there is no new generic
Activity/Home projection and no source text, rights evidence or token in event
metadata. Capability use alone cannot inspect drafts, rights or administration.

Successful evidence reads append minimal `knowledge_interactions` attribution:
operation, capability version, authenticated membership, Company, instant and
returned source/Version/projection references. They store no query, source body,
credential, generated answer or business decision. This is read attribution,
not an AI approval framework. Read operations otherwise conserve governed
Document Versions, business commands and source transition history.

### 19.3 Protected REST and current evidence

The [OpenAPI contract](../../apps/api/openapi.yaml) owns exact route schemas.
Source administration uses the ordinary PRISMA identity boundary:

- `POST /api/knowledge/sources` creates a draft;
- `POST /api/knowledge/sources/{sourceId}/admission` records the exact attestation;
- `POST /api/knowledge/sources/{sourceId}/revocation` withdraws admission;
- `GET /api/knowledge/sources/{sourceId}/administration` inspects private metadata,
  immutable passage content and attributed history;
- Company Knowledge assignments use `/api/knowledge/assignments/administrators`
  or `/readers`, with the existing Workspace assignment authority.

Evidence reads use a legitimate PRISMA Bearer token for the explicitly configured
`KNOWLEDGE_TOKEN_AUDIENCE`, verified through the existing Clerk identity adapter
with the existing authorized web party plus that resource audience. This does
not create an OAuth authorization server or widen ordinary web authentication.
The existing narrowly gated deterministic test/demo identity mode is reused only
in its allowed environment; it is not a production authentication fallback.

The server-side `KNOWLEDGE_EVIDENCE_ENABLED` switch defaults to disabled. An
explicit validated deployment configuration, actual sources/rights, explicit
assignments and required reviews precede real activation; tool arguments cannot
set configuration. Enabled software is operable with legitimately configured
credentials and admitted sources; it is not hardcoded to return no results.

The read surface is:

- `GET /api/knowledge/sources`: an authorized source page;
- `GET /api/knowledge/search?query=...`: exact case-sensitive literal matching,
  with no semantic model, embeddings, invented precedence or answer;
- `GET /api/knowledge/sources/{sourceId}/passages/{locator}`: an exact passage.

Current mode is default and returns only currently official Versions with
currently effective, admitted `cited-evidence` sources. Explicit historical mode
requires one exact `documentVersionId`; revoked/expired admission is never
restored by historical intent. Each call re-establishes current actor, Company,
Document/content access and admission before projection content is published.
An unauthorized source contributes no title, identifier, count or zero.

List/search pages contain at most 20 results. Query length is 1–200 characters,
cursors at most 2048, source IDs are UUIDs and passage locators 1–120 characters.
A non-null cursor resumes after the last authorized result; a final empty search
page may terminate an exactly full previous page. No total or hidden-source count
is emitted. Multiple conflicting sources stay separate and retain their exact
references; no source gets inferred authority over another.

Read authorization and source/Version locks follow existing transaction
linearization. Revocation committed before the live pre-projection gate prevents
publication; already-authorized bytes released before a later revocation cannot
be recalled over a network. A client disconnect retires its own pending bridge
work; one reply cannot be rebound to another request, actor or context.

The [bounded human application journey in section 20](#20-bounded-read-only-knowledge-evidence-journey-in-the-application) defines ordinary-web read adapters over these same service methods. The resource-audience routes and MCP bridge here retain their existing authentication and output contract.

### 19.4 MCP operator connection and honest proof

The maintained pinned TypeScript MCP SDK exposes exactly three tools:
`list_knowledge_sources`, `search_knowledge`, `get_knowledge_passage`.
Their closed input/output schemas enforce the same mode, exact history,
pagination and literal-reference bounds. They are read-only/non-destructive;
there is no write, approval, SQL, filesystem or arbitrary-fetch tool.

Build the API normally, then configure Codex to launch
`apps/api/dist/knowledge-mcp/stdio.main.js` with Node. The stdio bridge consumes
only operator-provided environment variables:

- `PRISMA_KNOWLEDGE_API_ORIGIN`: fixed PRISMA HTTPS origin; numeric-loopback HTTP
  is permitted for isolated local development;
- `PRISMA_KNOWLEDGE_WORKSPACE_ID`, `PRISMA_KNOWLEDGE_COMPANY_ID`: fixed selected
  scope, revalidated by the server;
- `PRISMA_KNOWLEDGE_BEARER_TOKEN`: legitimate PRISMA resource credential supplied
  by the operator, never discovered from a client account.

A Codex stdio configuration uses `command = "node"`, the absolute compiled entry
as its `args`, and these variable **names** in `env_vars`. No credential value
belongs in a committed example. HTTP redirects, model-provided origins/context,
userinfo, query/fragment-bearing origins and arbitrary credential headers are
rejected. Each upstream request has a 10-second deadline and a 2-MiB decoded
response limit. Returned citation text hashes and exact requested identities
are verified at the client boundary; extra upstream administration fields are
not passed to the model. Stdio stdout contains only MCP; failures are sanitized.

The initial deliverable is a Codex-compatible stdio connector, not a configured
user account. ChatGPT remote connection needs a reachable HTTPS MCP endpoint and
proper protected-resource/OAuth authorization-server configuration; this slice
does not invent those settings or reuse a ChatGPT subscription as a model API.
Codex's `auth = "chatgpt"` first-party mode is not authentication to PRISMA.

Software proof uses public governed Document/PDF commands, explicit fictional
new grants, actual Nest/PostgreSQL source transitions and an actual MCP SDK
client through the HTTP bridge. Only the external identity boundary is replaced
by declared fixtures in that native proof. Separate tests exercise the real Clerk
SDK with synthetic signed keys and forwarded audience/party constraints. Neither
is proof of a live Clerk tenant or a configured ChatGPT/Codex account. Independent
ro/ru/en PDF text and curated literal citations prove mechanical multilingual
preservation; there is no semantic-answer or representative-pilot score.

## 20. Bounded read-only Knowledge evidence journey in the application

**Status:** Approved — bounded read-only application evidence software contract.

**Disposition:** Following ordered independent Standards then Spec preparation on source `98db70aa8f4d45d384ee8b72d69bed2098428c78`, the coordinator [accepted this bounded contract](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1008#issuecomment-6549261566) on 2026-10-31 under delegated product authority. This records actual contract selection, not runtime delivery, broader PRD promotion, real rights/source/person approval or activation.

**Tracking:** [#1008](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1008), under [AI/Knowledge #57](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/57). The existing backend/MCP delivery is [PR #1004](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/1004); this section is a new human-reading contract, not runtime delivery evidence.

**Owner:** Knowledge; Access establishes the actor and captured assignments, Document owns native visibility and preserved bytes. This section owns only the application reading journey and its web read adapters. It does not approve or activate a real source, person or tenant, and does not change the broader PRD's readiness or Release 7 gates.

The existing [Authorization owner](tenant-company-client-authorization-prd.md), [Document owner](governed-documents-prd.md) and [Document Registry](release-1-document-registry-prd.md), [Activity Log owner](activity-log-accountability-prd.md), [UX owner](ux-localization-configuration-prd.md), [ADR 0006](../adr/0006-workspace-tenancy-and-company-scoped-authorization.md) and [ADR 0008](../adr/0008-bounded-document-content-storage.md) retain their authority. Section 19 owns source admission and the existing evidence/MCP service contract; this section adds only the bounded human read path.

### 20.1 Problem, outcome and scope

An Internal User who already has admitted-evidence and native source rights needs to inspect the same evidence in the application: discover eligible Sources, search their literal curated passages, reopen an exact citation, and download the exact preserved PDF supporting it. The journey must retain current versus deliberately historical meaning without treating a fluent answer, official Document designation, declared rights or source title as proof.

The outcome is one read-only Company-scoped application section. Existing §19 supplies the admitted sources, Reader v1, permission boundaries, service methods, literal semantics and attribution. The web adapters, minimal source reference, navigation and retirement behavior below are this section's bounded synthesis. No new business authority is introduced.

1. As an authorized Internal User, I can list eligible current Sources for the active Company without learning hidden titles, IDs or counts.
2. I can submit an exact literal search and see separate supported passages with their exact Source, Document Version, language and locator.
3. I can reopen a selected passage through a fresh read, rather than assume a cached result remains currently eligible.
4. I can download its exact admitted preserved PDF under native content authority and verify byte identity.
5. From a citation I have already been authorized to inspect, I can deliberately reopen that exact cited Version and see its returned native status without restoring withdrawn admission or substituting current content.
6. I can understand loading, no eligible results, validation, denial, unavailable evidence, malformed response and stale/retired work, with recovery that preserves the current actor and context.

This journey generates no answer, Analysis or human approval. It never calls a model, sends evidence to a provider or controls Codex. It creates no Document Version, source transition, business command, new grant or generic Activity/Home projection.

### 20.2 Actor and authority

The scope is one active Workspace and selected active Company, resolved by existing Access. Workspace/Company IDs supplied by the client remain selection hints. There is no All Companies or Client Legal Entity operation.

| Action                                            | Required authority                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offer Knowledge evidence navigation               | A valid represented Company Knowledge Evidence Reader v1 capture plus represented native Document metadata/content/Client prerequisites in the current actor. The UI proves no live server authority.                         |
| List/search/reopen evidence                       | The exact existing §19 Reader v1, live captured assignment and native Document/content/original-Client/family visibility, effective admitted source, exact Version and feature-enable checks through existing service owners. |
| Download an admitted source PDF from this journey | Fresh successful exact-passage preflight through Knowledge, followed by native exact-Representation download under its own current authority; exact tuple and source-hash validation in the client.                           |
| Admit/revoke/edit Sources or administer grants    | Outside this section; existing backend/MCP-adjacent source administration and Workspace assignment owners remain unchanged.                                                                                                   |

Source Administrator v1 alone supplies no Reader permission. Document/content read, Workspace ownership, a title, authorship, Project/Task role or a successful earlier read cannot replace Reader v1. The Reader grant supplies no native Document/content/family/Client visibility. Real assignments are explicit under their existing owner; this contract assigns no real person.

Native family denial removes that Source before any evidence result is returned. The navigation does not require every family gate because an actor may legitimately read only questionnaire evidence. No new client-side eligibility or source-existence probe may be introduced.

The browser current-actor representation preserves `knowledgeGrants` as an optional opaque feature-owned field. The Knowledge boundary accepts exactly one matching `company_knowledge_evidence_reader` capture with a valid assignment UUID and captured `v1`. Missing, malformed, duplicate or unknown-version Reader captures confer no navigation or dispatch. Unrelated administrator captures never confer read; unknown data is not asserted into authority.

### 20.3 Web read adapters and unchanged MCP boundary

The application uses ordinary verified PRISMA web identity through `ActorContextAdapter` at exactly these adapters:

- `GET /api/knowledge/evidence/sources` delegates to `KnowledgeService.list`;
- `GET /api/knowledge/evidence/search` delegates to `KnowledgeService.search`;
- `GET /api/knowledge/evidence/sources/{sourceId}/passages/{locator}` delegates to `KnowledgeService.getPassage`.

These adapters expose the existing service read contract to the trusted human application. They add no independent database query, eligibility calculation, permission fallback or administrator call. The same owning service enforces the server capability switch, live Reader/native grants, Company/membership/source/Version/content checks and successful-read attribution transaction. Invalid and denied requests cannot reach an alternate projection path. Responses and browser requests use private/no-store behavior; no service worker or persistent cache retains evidence.

This is additional authenticated web exposure requiring the section's explicit security-sensitive review/disposition. It is not a token-conversion mechanism. Existing evidence resource routes remain under `KnowledgeActorGuard` with the configured resource-audience Bearer credential. Ordinary web identity does not become a resource-audience credential, and those existing routes gain no ordinary-cookie fallback. The existing MCP bridge calls its existing fixed resource routes, with the same operator-supplied credentials, request/response bounds, closed tool outputs and three tools. It gains no browser session access, new origin, extra tool, remote endpoint or changed remote-MCP authorization acceptance.

No provider, JWT-template, OAuth server, secret or deployment configuration is created here. `KNOWLEDGE_EVIDENCE_ENABLED` remains server-owned and disabled by default. The application cannot enable it or promise actual sources. A deterministic test identity is accepted only in the existing allowed test/demo environment and is never a production fallback.

### 20.4 Reader-safe exact source reference

Extend the existing authorized Source summary by exactly `representationId`, the UUID of the immutable preserved PDF already bound to the admitted Source. Its other fields remain Source ID, Document ID, Document Version ID, source/projection hashes, frozen title, language and native official/superseded status. Search and passage replies include the same extended summary.

This new protected identifier is published only after the existing evidence-eligibility gate. It supplies neither a location/public URL nor native read authority. It reveals no rights reference, owner/provenance administration, effective dates, command receipt, transition history or denied source. It does not authorize reading an inaccessible PDF. Do not obtain it through the source administration endpoint or a broad Document upload-history scan.

The model-facing MCP result retains its current known-field reconstruction and closed schema: it does not forward the new upstream field or administrator extras. The three existing MCP tools and their contract remain unchanged.

The client treats every reply as `unknown` until it validates the consumed schema and request binding. It checks UUIDs, source/projection/passage hash formats, supported language/status, limits, unique item identities, exact current/history Version constraints, bounded cursor and exact Source/locator on passage responses. Passage SHA-256 must equal the full received literal text bytes. Invalid envelopes, foreign identities, wrong status/Version, duplicate results, malformed timestamps or hash mismatch publish no evidence and expose no raw payload.

### 20.5 Current inventory, literal search and exact passage

Current mode is default. On deliberate section entry, list only currently eligible admitted Sources and their exact frozen Version/status; do not label all native Documents admitted. The list is an inventory. Its rows need not open every passage or enumerate locators. The selected search journey supplies exact citation locators without a new API.

Search requires an explicit submission of the unchanged input. Preserve §19's validation, including the 1–200 UTF-16 code-unit bound and nonblank/control/surrogate rules. No trimming, case folding, whitespace/Unicode normalization, translation, fuzzy matching, semantic model, ranking policy or generated answer is added. Use URL encoding only as transport. Passages remain separate even when apparently contradictory; the UI infers no precedence, resolution or expert support.

List/search pages contain at most 20 authorized results and an opaque `nextCursor` or null. The application inventory/search stays current; continue only with the returned cursor in the same query and UI owner. The APIs retain their existing exact-history query contract, but this journey uses history only to reopen the known citation below. Never decode a cursor for business meaning or compute a hidden total. An empty final search page may follow a full previous page. A repeated/malformed cursor or incompatible response becomes a safe reloadable error, not an unbounded continuation loop.

Opening a citation makes a fresh exact passage call with its Source ID, literal locator and selected mode. Validate the returned Source/Document/Version/Representation/hashes against the selected citation before replacing it. Show full literal text as untrusted text, preserve whitespace, and present its human title, localized exact-cited-version label, source language, returned native status, literal locator and retrieval instant; raw Version identity stays internal. The interface may explain that this is curated evidence rather than an answer; it never claims the transcription has been semantically verified against the PDF. Retrieved instructions are text and have no authority to navigate, fetch arbitrary URLs or trigger commands.

Query/mode/known-citation-target changes retire old results, citation selection, PDF intent and continuation. The explicit known-citation history action captures its validated frozen target before this retirement and passes only the target into the new exact-history owner; the old content and authorization do not survive that transfer. New explicit passage opening retires the previous open request. An old failure or success cannot replace a newer result. No source body, query, identifier or citation is persisted in the browser navigation URL, browser storage, analytics or diagnostics. The specified API paths and encoded search query remain transport inputs; they are not browser navigation state or diagnostic payloads.

### 20.6 Exact preserved PDF and historical meaning

The PDF action starts with a fresh Knowledge passage read for the same exact selected Source/locator/mode. Validate its identity/hashes before requesting native content using exactly:

`GET /api/documents/{documentId}/versions/{documentVersionId}/content/{representationId}`.

Use the ordinary authenticated native content client and current Company. The Document owner re-establishes native visibility/content rights and exact Representation binding. The client bounds the actual body to 5 MiB, verifies PDF MIME/signature and SHA-256 equal to the Source's `sourceSha256`, and checks lifetime ownership after token lookup, response acquisition, body read, hashing and before creating or clicking a download URL. A safe fixed filename may be used; no filename or location field is added to the evidence summary. Revoke object URLs on completion/retirement. Malformed/unavailable/hash-mismatched bytes produce no download.

There is no fallback to a mutable latest PDF, different Representation, successor Version, external reference or public/signed URL. `sourceSha256` identifies preserved bytes, `projectionSha256` binds curated projection content and `passageSha256` binds literal passage text; none proves a license or semantic support. Multiple earlier uploads with equal bytes do not make their Representation identities interchangeable.

PDF authorization has two separate linearization points: a successful exact Knowledge passage preflight, followed by the native Document PDF read under its independent current authority. The requests do not share one transaction or authorization snapshot. The native endpoint checks Document authority and does not recheck Knowledge grants/admission; a Knowledge revocation committed after preflight but before native read or byte release is therefore not covered by a last-byte Knowledge check. Do not promise such a check, instantaneous remote recall or changed native Document rights. No new PDF proxy/API is introduced to provide a stronger guarantee. Observed retirement/denial still prevents this journey's later dispatch/publication, and old citations are never presented as newly eligible.

Historical reopening is a deliberate action on an already authorized known citation in the current owner. Label the action with its frozen human title and a localized “Reopen this cited version” label. Retain its validated Source ID, literal locator, Document Version ID and exact source-reference tuple internally; do not expose a raw UUID form, identifiers in the browser navigation URL, generated candidate IDs or a free-standing history entry. The current public summary supplies no numeric Version label, so use the localized “Exact cited version” label and actual returned status rather than invent a version number.

When selected, capture that exact immutable target before retiring the old current results/citation/PDF owner. A fresh history owner calls the existing passage operation with the same Source/locator and `mode=historical&documentVersionId=` set internally to the frozen exact Version. Validate the returned tuple and hashes afresh, then show the exact passage and its native official/superseded status with an explicit historical label; the PDF action keeps the same exact-target preflight and native read sequence. This section adds no history listing/search discovery, native Document cross-screen integration, successor lookup or source administration. If no already authorized citation target is known, there is no historical route to offer.

A known target is a selector, never proof of continuing authority. A generic 404 clears the selected evidence/PDF intent and says only that evidence is unavailable; it does not infer supersession, revocation or another cause and never generates an automatic history fallback. Explicit history may return a currently official Version, so its label records the user's intent rather than fabricating a superseded status. Revoked/expired or currently inaccessible Sources remain excluded. Returning to current retires historical evidence, target and PDF intent and starts a fresh current inventory/search owner; old operations cannot revive either mode.

### 20.7 Required states, navigation and retirement

Use one application `knowledge-evidence` entry offered only under §20.2's represented authority. A fragment chooses an already-authorized section and supplies no grant. In Prisme and legacy Classic, the evidence owner mounts only on deliberate selection, retires on leaving, and reads fresh on return. No hidden background request or retained result owner survives section navigation. Use the existing accepted controls/tokens, supported interface locales and accessibility/focus rules; do not redesign the shell.

| State                                                      | Observable behavior                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checking/loading                                           | Label the active scope, show accessible pending status, and prevent duplicate submit/download dispatch.                                                                                                                                   |
| No active Company or represented authority                 | No evidence requests, source rows/counts or guessed reason. A direct fragment cannot bypass this.                                                                                                                                         |
| Capability disabled or generic 503/integrity outage        | Generic evidence-unavailable state with deliberate retry; do not claim which condition occurred. No activation button or stale successful evidence as current.                                                                            |
| Authorized empty current inventory/search                  | Generic no eligible evidence/no matching passage, without hidden-source counts, inaccessible IDs or guessed rights explanations. With no known citation, offer no history route.                                                          |
| Invalid query or malformed internal Version/locator/cursor | Local query validation where possible; preserve unchanged valid input. Internal reference/schema failures withhold the action. Server 400 remains a safe validation state without rendering raw response text or offering a raw-ID field. |
| Current 401/403                                            | Retire evidence immediately and invoke the existing scoped session/Company/current-actor recovery; no old result may reject a newer session or publish an older whole Actor.                                                              |
| Current 404 or eligibility lost between list/open          | Generic evidence no longer available; clear selected citation/PDF intent. It proves neither source existence nor supersession/revocation or another cause, and creates no history fallback.                                               |
| Malformed/identity/hash-incompatible response              | Withhold the result/download, clear affected stale display and offer explicit fresh retry. Never render unparsed payload.                                                                                                                 |
| Network failure                                            | Scoped safe retry, preserving the user's valid input while withholding a fresh-success claim.                                                                                                                                             |
| Superseded historical Version                              | Exact selected Version/status and historical label remain visible; no implicit current replacement.                                                                                                                                       |
| Retirement                                                 | Old token/transport/parser/hash/recovery/focus/Blob callbacks are inert and cannot dispatch or publish.                                                                                                                                   |

The owner consumes identity/session generation, Workspace/membership/Internal User, Company, Reader assignment identity/version, native Registrar/content-reader captures and represented permissions, existing Client authority generation/read prerequisites and family captures that can affect the global inventory. Do not require every family grant to enter; conservatively refresh the inventory if one changes. A replacement required capture retires work even when permission strings are equal. An unrelated source-administrator assignment alone does not replace the read owner.

Retirement is irreversible for each operation. An A→B→A return creates a fresh owner and never revives requests started under the earlier A. Query/mode/known-citation-target/open/PDF intents also have latest-operation ownership inside that scope. Transfer an explicitly selected exact known target to the new history owner before clearing the old selection; this preserves the user's action without preserving old evidence or authority. Abort transport where possible and test freshness after every await before dispatch, parsing publication, recovery, focus and file release. Shared access recovery outlives the retired child reads only within its own still-current actor/context lifetime; an older complete Actor snapshot cannot overwrite a newer one.

Changing only interface language preserves entered query and literal source bytes; changing only presentation frame preserves business meaning and does not duplicate a read while still visible. A deliberate section departure still retires work. Keyboard focus moves only for a current explicit navigation/open intent, never a late response or hidden panel. All ro/ru/fr/en interface copy remains localization-ready; source language remains ro/ru/en under §19. Desktop and narrow-screen text/long identifiers remain readable without horizontal page overflow.

### 20.8 Attribution, compatibility, acceptance and readiness

Every successful web list/search/passage call appends the same minimal `knowledge_interactions` record through the existing service transaction, including empty successful reads. It stores no query/body, source administration data, credential, generated answer or business decision. Failed reads create no success attribution. Native PDF reads retain the native owner's existing behavior, with the preceding Knowledge preflight attributed as an ordinary passage read. No generic Activity Log/Home event, new interaction viewer or analysis approval framework is added.

No business schema or migration, source/projection change, new permission, existing bundle expansion or real grant is required. The additive authorized summary field and opaque current-actor field preserve existing consumers; the MCP reconstruction/output schema stays unchanged. OpenAPI owns exact adapter/summary schemas when implemented. The actual post-#1006 source and central ownership must be rechecked before runtime work.

Acceptance must exercise public boundaries:

1. Use native governed Document/PDF commands and explicit fictional grants to admit current and superseded Sources, then the real App completes inventory → literal search → fresh exact passage → exact PDF bytes under actual Nest/PostgreSQL service behavior.
2. Prove case/whitespace/Unicode literal preservation and exact ro/ru/en source passages independently of ro/ru/fr/en interface localization. No generated answer or semantic quality score is asserted.
3. Load an authorized current citation, designate a successor through native commands, then deliberately reopen that known citation's exact earlier Version through the explicit history action. Preserve its internal target across mode retirement and display the returned native status. Prove that no raw-ID field, browser navigation URL identifier, unknown-citation history route, history-discovery query or native Document cross-screen dependency exists. A generic 404 infers no cause and creates no historical fallback. Revocation, expiry, native family/Client invisibility and lost Reader/native grants cannot be restored by history.
4. Verify the exact admitted earlier PDF Representation, including two uploads with equal hashes, so no latest selection or checksum-based identity guess can pass as exact binding. Wrong tuple/hash/MIME/oversize content produces no file. Prove the actual two-step Knowledge-preflight/native-Document-read sequence and observed-retirement fencing without asserting a last-byte Knowledge check that neither existing native PDF operation supplies.
5. Prove Reader absence, admin-only authority, complete native-only rights, Owner/title-only access and malformed/duplicate/unknown Reader captures cause no unauthorized source request/disclosure.
6. Show that every new web adapter uses the same service gates and read attribution: disabled, malformed, unauthorized, source-ineligible, empty and successful calls have their specified outcomes without query/body leakage.
7. Prove ordinary web authentication is accepted only through its intended adapter and has not become a valid fallback at existing resource-protected routes; test both identity boundaries with synthetic configured keys/parties/audiences where appropriate. Preserve the native MCP HTTP bridge, three tool schemas and known-field output reconstruction with the additive upstream Representation field.
8. Verify no hidden title/ID/count in denied/empty responses, bounded continuation including an empty final search page, safe malformed response handling and no admin/rights metadata in reader output.
9. Cover deferred token lookup, HTTP response, PDF hashing, actor recovery, focus and download under navigation-away, session/Company/member/capture replacement, source loss and A→B→A. No retired callback can publish, dispatch, sign out a newer session or trigger file release.
10. Inspect real desktop/narrow browser behavior, both frames' navigation visibility, keyboard and focus behavior and each supported interface locale. No test result is a claim of representative real corpus, actual legal review, live identity tenant, configured Codex account or production activation.

Actual source inventory/rights, admission declarations, real-person assignments, required legal/security/production review and validated operator-controlled activation remain with §19 and §§14–16. Synthetic software proof satisfies none of those real-world conditions. This bounded human read path supplies no model provider or AI capability promotion.

Before a runtime ticket is marked ready, the canonical section must be reviewed/disposed and merged, the twelve standard gates must pass on the actual source head, and one exclusive Knowledge evidence owner must hold its feature and narrow central interfaces after #1006 or explicit root coordination. If completion requires changing native permissions, source eligibility, resource authentication architecture or production configuration, stop and re-scope rather than silently extend this contract.

### 20.9 Runtime readiness assessment

The [twelve standard gates](specification-and-ticketing-standard.md#8-ready-for-agent-gates) apply to the future runtime ticket. The ordered preparation and actual bounded product disposition are recorded above. Canonical merge, runtime examples, central ownership and actual-head readiness still require verification in the future ticket.

| Gate                          | Bounded assessment and required closure                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Observable outcome         | Sections 20.1/20.5–20.7 define inventory → literal search → fresh exact citation → exact PDF, with deliberate known-citation history.                                                                                                                             |
| 2. Scope                      | One active Workspace/Company; existing original-Client and family visibility. No legal-entity operation or All Companies view.                                                                                                                                    |
| 3. Actors and authority       | Existing Reader v1 and independent native grants only. The ordinary-web exposure has the bounded review/disposition recorded above; no real assignment is inferred.                                                                                               |
| 4. Lifecycle and history      | Section 19 retains immutable Source transitions, expiry and revocation. Sections 20.5–20.7 define exact Version history, current default and irreversible operation retirement.                                                                                   |
| 5. Source of truth            | Existing Access, Knowledge and Document owners; no model, provider, storage or activation change.                                                                                                                                                                 |
| 6. Examples                   | Existing fictional public Document/Knowledge seams and the source-language cases in 20.8 support synthetic software qualification. The runtime ticket must name its concrete native/browser fixtures. These are not representative real-corpus or pilot evidence. |
| 7. Exceptional states         | Section 20.7 specifies loading, empty, invalid, denied, unavailable, malformed, stale and retired behavior without hidden-source inference.                                                                                                                       |
| 8. Security and attribution   | Same service-owned authorization/attribution, protected exact Representation reference and two distinct PDF read gates. Ordered independent Standards then Spec preparation and actual delegated product disposition have completed for this bounded contract.    |
| 9. Dependencies and migration | Merge this reviewed/disposed contract and recheck the actual post-#1006 source plus explicit central-interface ownership. No business migration is expected; an actual need to change owning permissions or authentication architecture requires re-scoping.      |
| 10. Public proof              | Section 20.8 requires native HTTP/PostgreSQL, actual App/browser and unchanged resource-guard/MCP regression seams, rather than private-helper-only assertions.                                                                                                   |
| 11. Fresh-session fit         | One feature owner may cover the three forwarding adapters, one protected summary field, capture/navigation integration and the complete read-only journey. Reassess against the actual head before assigning the runtime issue.                                   |
| 12. Blockers closed           | Not yet established by this documentation: canonical merge, runtime examples/current-head fit and central ownership must be verified in the future ticket. Keep that ticket draft until each is closed.                                                           |

Actual sources, rights, admission declarations, people, operational configuration and production reviews remain separate dependencies under section 19. This assessment authorizes none of them and does not promote the broader Draft PRD.
