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

## 15. Technical and legal dependencies

- provider contract, region, retention and training-use review;
- AI risk and applicable regulatory assessment per use case;
- retrieval/index technology after corpus inventory;
- threat model and evaluation harness;
- durable job and tool-execution architecture.

## 16. Readiness

The governance boundary is ready for downstream PRDs. No Release 7 implementation ticket is ready before the operational core, governed Documents, source inventory, representative evaluation cases and legal/security review exist. The separately selected offline mechanics in section 17 have their own bounded readiness gate; they do not authorize an AI capability or change that release sequence.

## 17. Bounded offline comparative pilot evaluation — #957

**Status:** Approved — bounded offline comparative evaluation

**Contract version:** 1.0

**Owner:** Dan Popescu; this PRD owns the bounded evaluation behavior

**Tracking:** [#957](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/957), under [AI/Knowledge #57](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/57); commercial pilot context remains [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290)

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

### 17.2 Actors, scope and stories

The local operator selects two minimized files and a new private output directory. The reference preparer declares expected results independently of the selected observations. The work operator performs the manual or assisted task; the recorder captures its observations; an optional human reviewer declares final field values. These references are attribution data, not authenticated application identities or grants. One person may perform several roles; the report must never infer independent expert review from this.

Each case set declares one opaque Workspace reference and one Company reference. Mixed scopes require separate evaluations. The operator must already have permission to possess and process the files under the existing [Authorization](tenant-company-client-authorization-prd.md) and [Platform](platform-security-reliability-operations-prd.md) owners. The tool grants no application access, reads no database, resolves no business IDs and fetches no source. It creates no business Activity Log event or governed Document. A local report is private analysis output, not a new Document Version or operational approval.

1. As an operator, I can validate a closed versioned case/reference file and two explicitly selected runs without a provider, service, account or interactive prompt.
2. As a reviewer, I can trace every included/excluded case to exact case, source-set, reference and run identities and inspect each metric's numerator and denominator.
3. As a reviewer, I can distinguish original field proposals, human final values, exact changes, absent measurements, failures and incompatible versions.
4. As a reviewer, I can reproduce literal synthetic results, including a slower assisted result and unusable pairs, without mistaking them for observations of real work.
5. As an operator, I can recover from invalid inputs or an occupied output path without losing prior input or output files.

### 17.3 Public command and bounded files

The entire public runtime boundary is proposed as:

```bash
node scripts/pilot-evaluation.mjs --help
node scripts/pilot-evaluation.mjs --cases /tmp/pilot/cases.json --runs /tmp/pilot/runs.json --output /tmp/pilot/result-001
```

Use the repository's supported Node runtime and built-in libraries. No TypeScript compilation, pnpm install, dependency, server, provider or network call is required by the command. The entry point may compose private helpers; no second public evaluation API or framework is required. The only flags are `--help`, `--cases`, `--runs`, `--output`. `--help` alone exits 0 without file access and includes these examples, schemas, bounds, exit codes and the synthetic/declared-observation limitation. The other three flags require exactly one nonempty value each; missing/duplicate/unknown flags, positionals or combining help with evaluation flags fail immediately. There is no interactive fallback, environment-variable configuration, stdin (`-`), URL, glob, recursive discovery, archive, executable expression or overwrite option in v1. Two named file inputs keep byte provenance and input bounds explicit.

Both inputs must be distinct existing regular files, with no symlink component in either resolved path. Read at most 1,048,576 bytes per file, including a one-byte overflow probe, and validate those captured bytes once. Reject non-UTF-8, BOM, malformed JSON, duplicate object keys, nesting deeper than 12 containers (root object depth 1, each nested object/array adds 1) and all unrecognized properties. Do not coerce types, ignore unknown versions, normalize strings, or silently truncate arrays. Input files are never changed.

The output must be a new direct child of an existing writable directory, outside this repository’s worktree and outside either input path. Reject symlink components, an existing target (including an empty directory or dangling symlink), non-directory parents and overlap with inputs. Bound construction of each artifact to 16,777,216 UTF-8 bytes; an overflow fails before output creation. Claim the new directory exclusively only after input validation and in-memory report construction succeed; never reuse another invocation's directory. Create only `result.json` and `report.md`, with exclusive file creation and private permissions (directory 0700, files 0600 on POSIX). On write failure, return failure and remove only files/the directory created by this invocation when safe; if cleanup fails, identify the incomplete output and require a new path. An incomplete output is never a successful report. Concurrent attempts at one target yield at most one success. A retry uses a new path and cannot overwrite a prior result.

Success emits exactly one newline-terminated JSON receipt on stdout, with keys `schema`, `dataKind`, `measurementBasis`, `result`, `report`: `{"schema":"prisma-prim-pilot-receipt/v1","dataKind":"synthetic","measurementBasis":"declared_inputs_unverified","result":"result.json","report":"report.md"}`. dataKind copies the case file and measurementBasis is always the literal shown; a receipt never attests measurement or reference verification. Diagnostics go only to stderr. Exit 0 means valid inputs and complete artifacts, including empty/failed/unmeasured evaluations; it means nothing about pilot quality. Exit 2 means argument/schema/reference validation failure, exit 3 means file/path/output failure, exit 1 means an unexpected internal failure.

A failure emits one JSON diagnostic of at most 2048 UTF-8 bytes, with only `schema` (`prisma-prim-pilot-error/v1`), `code`, `input` (`arguments`, `cases`, `runs`, `output`, or `internal`), `location` (JSON Pointer or null), `message`, `example`. Report the first error in fixed validation order: arguments, cases file/schema/reference integrity, runs file/schema/reference integrity, output safety, write. Array validation follows input order and object validation follows the contract field order. Messages give a safe repair and the invocation above; they never echo values, source text, full paths, stack traces, environment or raw OS errors. Codes are `E_ARGUMENT`, `E_INPUT_FILE`, `E_INPUT_LIMIT`, `E_JSON`, `E_SCHEMA`, `E_DUPLICATE`, `E_REFERENCE`, `E_OUTPUT_PATH`, `E_OUTPUT_EXISTS`, `E_OUTPUT_LIMIT`, `E_OUTPUT_WRITE`, `E_INTERNAL`. E_INPUT_FILE maps to exit 3; E_INPUT_LIMIT (bytes/depth), E_JSON (UTF-8/BOM/syntax), E_SCHEMA, E_DUPLICATE (object keys/IDs/tuples) and E_REFERENCE map to exit 2; E_OUTPUT_PATH/EXISTS/LIMIT/WRITE map to exit 3; E_ARGUMENT maps to exit 2 and E_INTERNAL to exit 1. For an unknown property, location names the containing validated object, never the untrusted key. For example, exit 2/`E_SCHEMA` at `/manual/observations/0/elapsedMs` says “Use null or an integer from 0 to 604800000 milliseconds.”

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

Every reference citation must resolve to its case's declared Source ID, Version and one declared locator; otherwise fail `E_REFERENCE`. A source checksum identifies declared original bytes but the tool does not retrieve or verify those bytes, rights, authenticity, approval, actor competence or semantic support. Reference preparation evidence must identify the independent basis in controlled material; an operator must not derive expected answers from the selected run merely to improve its score. V1 cannot enforce that independence externally, so the report calls these declared references, including for `anonymized_declared`.

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

`result.json` has only `schema` (`prisma-prim-pilot-result/v1`), `evaluatorVersion` (`"1.0.0"` for the initial implementation), `evaluationId`, `inputs`, `caseSet`, `runs`, `cases`, `aggregate`.

- `inputs` has only `casesSha256`, `runsSha256`: hashes of the complete captured input bytes. `caseSet` has only `caseSetId`, `caseSetVersion`, `dataKind`, `scope`, `protocol`, copied from the validated case file. `runs` has only `manual`, `assisted`, each containing its Run metadata from §17.5 with `observations` omitted.
- Each `cases` row has only `caseId`, `referenceIdentity`, `manual`, `assisted`, `pairs`. `referenceIdentity` has exactly the five identity fields listed in §17.5. Each side is null for an absent observation, otherwise has only `declaredIdentity` (those same five fields), `status`, `elapsedMs`, `identityMismatches` (the differing field names in their listed order), `fields`, `citations`.
- Side `fields` is null unless compatible/completed with captured fields. Otherwise it has only `expectedCount`, `initialCorrectCount`, `reviewedCount`, `finalCorrectCount`, `changedCount`, `details`. Each detail has only `fieldId`, `present`, `initialMatches`, `finalMatches`, `changed`. Emit every reference field in ASCII fieldId order; absent fields have false present/initialMatches and null finalMatches/changed. A present unreviewed field has null finalMatches/changed. Counts follow §17.6. No raw initial/final values are copied to outputs; inspect the hash-bound private input to resolve a mismatch.
- Side `citations` is null unless compatible/completed with both reference and captured citations non-null. Otherwise it has only `expected`, `observed`, `matched`, `missing`, `unexpected`, `unresolved`, each an array of Citation tuples. Missing = expected minus observed; unexpected = observed minus expected; unresolved = observed tuples absent from the Source inventory including locator. Unresolved is a subset of unexpected, not an extra denominator.
- `pairs` has only `time`, `fields`, `changes`, `citations`. Every entry has `exclusions`. Time additionally has `manualMs`, `assistedMs`, `reductionPercent`, all null if excluded. Fields/changes additionally have `manual`, `assisted` (Rate objects), `assistedMinusManualPp`; all three null if excluded. Citations additionally has `manual`, `assisted` (objects with only `precision: Rate`, `recall: Rate`, `exact: boolean`), `precisionDeltaPp`, `recallDeltaPp`, `exactDelta` (assisted minus manual, integer −1/0/1); all five null if excluded. Zero-denominator deltas are null.
- `aggregate` has only `declaredCasesCount`, `basePairCount`, `time`, `fields`, `changes`, `citations`. Each metric has `pairedCaseIds` and `excluded` (each excluded row has only `caseId`, `reasons`, copied from that case's exclusions). Together they partition every declared case exactly once. Time additionally has summed `manualMs`, `assistedMs`, `reductionPercent`; fields/changes additionally have `manual: Rate`, `assisted: Rate`, `assistedMinusManualPp`; citations additionally has `manual`, `assisted` (only `precision: Rate`, `recall: Rate`, `exact: Rate`), `precisionDeltaPp`, `recallDeltaPp`, `exactDeltaPp`. Empty paired sets have zero sums/counts and null rate values/reductions/deltas. No overall score, target/pass field or observation count outside this declared set exists.

UTF-8 artifacts use LF and one final newline. JSON uses the key order above and two-space indentation. Metadata subobjects follow input-contract field order. ID lists and rows use ASCII ID order; citation sets use sourceId, then numeric sourceVersion, then locator Unicode code-point order. Details/exclusions use the declared ordering above. `report.md` is a deterministic technical-English projection: the “SYNTHETIC — mechanics demonstration” or “DECLARED ANONYMIZED OBSERVATIONS — not independently verified” banner, evaluation/set/protocol/method/run and input-hash provenance, declared/base/metric-paired case counts, aggregate numerators/denominators with units, and every case's side statuses/mismatch fields, per-case comparisons, field/citation counts and exclusion reasons. Display null as “unavailable” with its reason. Escape Markdown metacharacters and render metadata as literal text, never active links or HTML. Every report explicitly states: “Timings, references and hashes are supplied declarations. This command performs no independent measurement, source-byte authenticity check or semantic-support verification.” It contains no source contents or field values and invents no collection time.

Same captured input bytes and evaluatorVersion produce byte-identical JSON/report artifacts at different fresh output paths. Absolute paths, current time, wall-clock tool runtime, host/environment details and random IDs never enter artifacts. Input-array permutations leave metrics/order unchanged but change input hashes; a report must not pretend byte provenance stayed identical. An evaluator fix changes evaluatorVersion; schema changes require a new schema identifier, never permissive v1 parsing.

### 17.8 Versions, corrections and confidentiality

Any case/reference/source/protocol content change also advances caseSetVersion; a published set Version is never replaced in place. Case/source/reference changes create new declared Versions; changed source bytes require a new Source Version and source-set/case Version, and changed expected answers require a new reference/case Version. Preserve old files privately. Recapturing observations or correcting a recording creates a new runId and evaluationId with a new captureEvidenceRef that identifies the predecessor and correction reason in controlled material. Human review finals captured for a run do not overwrite its initials. Reports remain immutable files; reevaluation always writes to a fresh directory.

V1 validates consistency within one invocation and binds exact bytes by hash. It has no registry and cannot detect an operator reusing an ID against secretly changed external bytes or verify controlled evidence. These preservation obligations must not be represented as authenticated business audit, signatures or proof that an observation occurred. Failures/rejections do not create application success history.

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

The literal six-case oracle is: declared 6, base pairs 3 (A/B/F), time pairs 2 (A/B), manual 90000 ms, assisted 75000 ms, reduction `"16.666667"`; per-case A reduction `"50.000000"`, B `"-50.000000"`. Field pairs A/B yield manual 2/3 and assisted 2/3 (`"0.666667"` each), delta `"0.000000"`. Change pairs A/B yield 1/3 on both sides (`"0.333333"`), delta `"0.000000"`. Citation pairs A/B yield manual precision 2/2 (`"1.000000"`), recall 2/3 (`"0.666667"`), exact 1/2 (`"0.500000"`); assisted precision 2/3, recall 2/3, exact 1/2, precision delta `"-33.333333"`, recall/exact deltas `"0.000000"`. B's assisted citation is unexpected, its expected Version 1 citation is missing, and unresolved is empty. C/D/E exclude every pair for missing_assisted/failed_assisted/incompatible_assisted respectively; E reports only referenceVersion in identityMismatches. F excludes time for zero_time_manual, fields/changes for both unmeasured_fields codes, and citations for unsupported_reference_citations plus both unmeasured_citations codes. Unsupported-reference exclusion also accompanies C/D/E citation exclusions. No part of this oracle is an observed gain or a 20-case real pilot. In every fixture, filenames stay exactly result.json/report.md; case IDs never become paths.

Additional literal boundary oracles use separately named synthetic fixture variants: an empty case set and empty observation arrays yield declaredCasesCount/basePairCount 0, all pairedCaseIds/excluded arrays empty, time sums 0/0 with reductionPercent null, every Rate `{ "numerator": 0, "denominator": 0, "value": null }`, and all deltas null. For the complete one-case example with only manual elapsedMs changed to 0, basePairCount remains 1, time pairedCaseIds is empty, its excluded row is `{ "caseId": "A", "reasons": ["zero_time_manual"] }`, summed times remain 0/0 and reductionPercent is null; field/change/citation metrics stay unchanged. With only that elapsedMs changed to null, the same result uses `["unmeasured_time_manual"]`. A failed run’s observed 5000 ms and E’s incompatible 1000 ms never enter any time sum. The six-case time ledger has exactly C/missing_assisted, D/failed_assisted, E/incompatible_assisted and F/zero_time_manual in that case order.

### 17.10 Public verification and acceptance

The runtime child starts with failing subprocess tests through the real command, using temporary input files and fresh external output directories. Expected literals above and negative fixtures must not be generated by importing evaluator code or copying the current output as truth. Private helpers may support implementation; their tests cannot substitute for public command evidence.

Acceptance requires all of the following through that seam:

1. Help works without files, supplies usable examples and exits 0; invalid arguments fail immediately without prompting. The complete one-case and six-case fixtures produce the stated literals, complete per-case ledgers and matching report values. Repeating exact bytes into a new path gives identical artifacts.
2. Validate unknown/duplicate keys and versions, wrong types, malformed UTF-8/JSON, ID/array/depth/byte bounds, duplicate/unknown cases and fields, invalid reference citations and inconsistent repeated Source identities. Include just-at-limit and first-over-limit inputs. Validation creates no output.
3. Preserve slow/negative reductions, missing observations, failure/not-run, incompatible case/source-set/reference Versions, null/zero time on either side, invalid negative/fraction/string time, zero cases, zero reference fields, captured-empty fields/citations, unsupported citations and partial review. Assert exact per-metric coverage and zero-denominator nulls. Missing/bad data cannot manufacture improvement.
4. Preserve exact state/value differences, before/final values in input, changed versus incorrect meaning, review coverage, and citation Source ID/Version/locator integrity. Include wrong source/locator, missing/extra citations, unresolved observed tuples, and inferred→confirmed with equal text. No semantic normalization or reference repair occurs.
5. Refuse existing outputs, directory/symlink/device inputs, unsafe parents/overlap and concurrent same-path writes without overwriting. Simulate a write failure and prove non-success, safe cleanup/incomplete diagnostic and successful recovery to a new target. Input bytes are unchanged; error/console/report content is bounded and escaped, without raw values or secret/environment echo.
6. Run with no provider credentials, database or server configuration and no external calls; no dependency/build acquisition is needed. Test argv, exit code, stdout/stderr, artifact contents/permissions and deterministic ordering, including an input permutation with changed byte hashes and unchanged metrics. No browser/PostgreSQL acceptance is relevant to this offline seam.

### 17.11 Evidence dependencies and readiness

There is no unresolved product ambiguity for the explicitly synthetic mechanics. Bounds, IDs, pairing, counting and file recovery are reversible design choices presented for product review. No real cases, provider, elapsed observations or first-tenant permission assignment is a prerequisite for this offline implementation.

Ordered independent Standards then Spec preparation passed with zero findings. The coordinator [approved this bounded contract](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/957#issuecomment-6479172511) on 2026-10-28 under delegated product authority. A review PASS alone is not approval. Contract approval proves no runtime delivery. The coordinator first merges the approved canonical contract, updates the owning tracker with links/status, and performs the [ticketing readiness gates](specification-and-ticketing-standard.md#8-ready-for-agent-gates) before opening a separate context-free runtime child. A fresh runtime author owns only that child; no runtime work/publication starts from this documentation issue.

A proposed runtime tracer bullet is “Produce an offline paired pilot-evaluation report from declared files.” It implements exactly §§17.3–17.10, delivers the two synthetic fixture sets and independent literal expectations through the public command, and requires standard doctor, focused command tests, format/lint/strict checks and the issue-execution final integration gate. It is blocked by approved/merged #957; it needs no AI provider or actual business observations. No new ADR is required for this reversible local interface; ADRs 0001/0003/0005/0006 retain stack and business-authority ownership.

Real usefulness or AI promotion remains blocked on controlled representative current/obsolete/missing/contradictory and multilingual cases, lawful permitted sources, independently prepared reference evidence, actual equivalent-work manual/assisted captures with operator/review provenance, bias/order/failure review, and explicitly approved task-specific thresholds/sample design under §§9/14–16. Synthetic fixtures, this contract and an exit 0 do not close those dependencies. Pricing/calculation correctness, critical-action traceability, administrative-error rates, satisfaction, retrieval/answer semantics and safety/autonomy evaluation remain separately bounded later work. A general experiment platform, dashboards, live instrumentation, DB/API/storage services, permissions, provider adapters, automated decisions, real-data import/publication and process/tooling overhaul are excluded.
