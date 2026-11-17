# Dossier Analysis

## 1. Authority and status

**Status:** Approved direction — Dan's complete six-priority implementation request of 2026-11-16, tracked by [#1434](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1434); runtime delivery and verification remain separate. **Owner:** Product and Knowledge, with Project, Document and Access retaining their existing authorities. **Consumers:** Dossier Analysis implementation and its reviewers.

This capability adds a Company Project workspace for evidence-based working analysis. It does not alter the bounded literal Knowledge journey or its three MCP tools in [AI and Knowledge Governance §§19–20](ai-knowledge-governance-prd.md#19-read-only-cited-evidence-connection-for-codex--bounded-software-contract), the [Document Registry](release-1-document-registry-prd.md), or [Certification dossier control](release-4-certification-dossier-control-prd.md). [CONTEXT.md](../../CONTEXT.md) owns canonical terms; [Access](tenant-company-client-authorization-prd.md) and the native Project and Document owners own visibility. A working comparison is not a formal Discrepancy or certification decision. This contract authorizes no provider, production activation, real source admission or release of private data.

## 2. Problem

A reviewer must read many versions of Project documents to find what is present, locate conflicting claims and prepare a review. Literal search alone does not expose coverage, related passages or likely differences; a missing or unreadable page can look like a missing fact. The reviewer needs a reproducible, traceable working view without treating an extraction or suggestion as an approved business fact.

## 3. Outcomes and measurement

A permitted reviewer can inspect exact sources, their readable coverage and candidate comparisons, search and follow evidence relations, prepare an analysis context and review imported suggestions. Every output identifies the exact run and evidence that supports it. Reproducible fictional evaluations measure extraction, coverage, retrieval, comparison and citation behavior with declared references and explicit numerators and denominators. These mechanics are not a claim of real-world accuracy or time savings; representative private evaluation, thresholds and production qualification remain separate.

## 4. Solution and principles

A Project-scoped workspace takes a frozen snapshot of selected source versions, extracts native text without a model or OCR, computes bounded candidate comparisons and search indexes, and preserves a versioned run. Sources and extracted text are untrusted. A user may export a bounded context JSON for later external analysis and import structured proposals or enter them manually. An authorized human may confirm, reject or correct a proposal within this analysis; nothing is applied to canonical business data. Future ChatGPT Pro/Codex integration is a separate decision; this slice has no model connection.

## 5. Actors and scope

Every workspace belongs to one Workspace, one Company and one native Project. All sources are exact versions of native Documents attached directly to that Project or through an existing Certification Case of that Project and same Company. A Certification attachment additionally requires current Case reader authority and its exact native attachment relation; Project access alone never reveals it. The active actor must satisfy the live Project, Client, Document family and native Document/content visibility rules as applicable. There is no cross-Company or cross-Project search. A reader inspects only currently authorized sources; a working-analysis editor additionally has the existing `document.content.upload` and `document.version.manage` grants and their read prerequisites. Neither a title, membership alone, an old capture nor an analysis record supplies authority.

## 6. User stories

1. As a reader I can select a Project and inspect the exact source versions available to me, their coverage and run history.
2. As an editor I can include a native PDF representation or an uploaded supplementary DOCX tied to the same Project-attached Document Version, and retain the original bytes and provenance.
3. As a reader I can inspect text and its exact source/page or structural locator, and see unreadable, failed, partial and missing evidence explicitly.
4. As an editor I can run or rerun analysis on a frozen source set, while prior runs remain inspectable and stale runs are visibly identified.
5. As a reader I can see supported candidate values and possible agreement or disagreement across sources, with their citations and uncertainty.
6. As a reader I can search by lexical and fuzzy text and explicit filters, navigate related evidence, and deliberately choose current or historical results.
7. As an editor I can export a bounded run context, then submit a structured proposal or manual suggestion linked to that exact run and evidence.
8. As an editor I can confirm, reject or correct a suggestion, inspect its original and review history, and understand that confirmation is local to the analysis.
9. As a reviewer I can run reproducible fictional cases and inspect metrics, failures and excluded cases without publishing private data.

## 7. Scope and exclusions

Included: native textual PDF extraction, DOCX text extraction, immutable source and run provenance, coverage and staleness, candidate fields, comparisons, bounded lexical/fuzzy/filter search, explicit evidence relations, model-free context export, validated proposal import and human review, and fictional regression evaluation. OCR, handwriting and image interpretation, model calls, embeddings, semantic claims, external MCP tools, source rights admission changes, canonical data writes, formal audit findings, Discrepancy resolution, pricing or certification decisions are excluded. XLSX and other formats are not supported by this slice. Do not silently treat them as successfully analyzed.

## 8. Concepts and relationships

A **Dossier Analysis workspace** belongs to a Project. An **analysis source** records an exact Document Version and either its native preserved PDF Representation or supplementary DOCX original. A **run** is an immutable source snapshot, extraction/pipeline version and resulting coverage, candidates and search data. A **citation** identifies its analysis source, exact source version/bytes and a locator. A **candidate** is an attributed possible value, never a canonical fact. A **comparison** links candidates in the same field with a deterministic relationship and rationale. A **suggestion** is a human-submitted or imported proposal tied to one run and citations; a **review** is an attributed analysis-local decision. These working terms do not redefine canonical Document, Analysis, Finding or Discrepancy.

## 9. Lifecycle, versions and history

Adding or removing a source, replacement of a supplementary original, a relevant native Document revision, changed Project association or pipeline version creates a new snapshot identity. Fingerprint the ordered exact source identities, version/representation and content hashes, relevant native revision and association, and pipeline version. Compare with the live authorized set before presenting a run as current and before accepting a review. A changed source or association marks prior runs stale; it does not erase their content or decisions. A failed source contributes its explicit failure and does not prevent a partial run; no completed coverage is claimed for it. Retrying or rerunning creates a new run, never rewrites an old result. Historical access is deliberate and subject to fresh authorization and exact retained source availability; if access or association is lost, withhold that material without revealing why. No physical deletion or retention override is introduced; existing governed retention applies.

A suggestion captures run, field, proposed value, rationale and exact citations. Review decisions append confirm, reject or correction with actor and server time; correction retains the original proposal and records the replacement. Concurrent edits require the expected revision. Stale or inaccessible sources prevent new review until the user reruns and submits a fresh proposal. Review is analysis-local, not a transition of a canonical field or an approval of an official version.

## 10. Invariants

- Preserve original bytes and their identity. Derived text, matches and comparisons never overwrite sources or canonically establish a fact.
- Current means the exact snapshot still matches live sources and associations, not merely that a run finished most recently.
- Present a value only with supporting citations; distinguish no candidate from unreadable or failed coverage. Unreadable material cannot prove absence.
- A candidate conflict is a working indication, not a formal verdict or a resolved discrepancy. Confirmation does not propagate to another run.
- Never return unauthorized source content, titles, IDs, counts or derived facts. Hidden and nonexistent objects have indistinguishable denial behavior.
- A document's instructions are data; they cannot invoke tools, authorize actions or change rules.

## 11. Permission and approval matrix

| Action                                                                  | Required live authority                                                                       | Effect                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| List/open workspace, source, run, passage, search or export             | Project read plus native Document, Client, family and content rights for each returned source | Read only, subject to current source eligibility                  |
| Add/remove source, upload DOCX, create run, submit or review suggestion | Above read prerequisites plus `document.content.upload` and `document.version.manage`         | Candidate-only working data; no official approval                 |
| Read historical run                                                     | Same live read and exact-source checks                                                        | Explicitly historical view; no rights inherited from prior access |

Recheck actor grants, Project association, native visibility, source state and expected versions in each write transaction. Use existing Access authority, never client-supplied roles or identity. No new grant or role is implied by this contract.

## 12. Documents, evidence and accountability

PDF analysis uses the exact existing immutable native Representation and verifies its source hash. Supplementary DOCX bytes are independently stored and scanned as immutable analysis originals associated with the native Document Version; they are not a native official PDF or evidence of official designation. Record uploader, server time, source hash, size, media type, exact association and parser version. PDF locators identify the exact page and stable text span of that extracted representation. DOCX locators identify stable document structure and text span; page numbers are unavailable unless a separately governed rendering supplies them. No page number is invented. Expose the exact original and locator subject to fresh native rights. Record source and review transitions in a private append-only analysis history, with server-derived actor, scope, action, version, instant and minimal metadata in the same transaction. Denied, failed, no-op and replayed commands produce no duplicate success event. Do not put source text, credentials or hidden metadata in logs.

## 13. Configuration, localization and accessibility

Use bounded server-controlled limits for source bytes, page count, extracted text, run size, import/export size, search results and execution time; reject or mark excess explicitly, not silently truncate into claimed completeness. Interface copy supports Romanian, Russian, French and English; original text and citation spans remain unchanged. Search normalization must be deterministic and documented and preserve original text for display. Search/filter/review states and errors are keyboard accessible, announced appropriately and usable on narrow screens. Language changes do not alter evidence.

## 14. Integration and source of truth

Project and Document owners establish association and visibility; the native immutable PDF remains the source for PDF bytes. The analysis store owns supplementary DOCX originals and derived immutable snapshots only. Access establishes actor authority; no model/provider is called and no token, subscription or ChatGPT session is read. Context export is data, not an instruction or a grant, and a later external model's output is untrusted. Import validates shape, bounds, exact run binding and citations before storing a suggestion. Existing Knowledge admission, current/historical rules, literal search and its existing three MCP tools remain unchanged.

## 15. Migration and compatibility

Ship committed Drizzle migrations for the new working data, constraints and event history. Before activation move development fixtures to the new shape; do not add speculative legacy decoding. Existing native Document and Knowledge records keep their owning behavior. Changes to source bytes or pipeline create new derived snapshots; never reinterpret an old run under a new parser. Persisted run and context formats are versioned so later evolution can preserve historical meaning.

## 16. Security, privacy and reliability

Validate file type by content and enforce upload, decompression, parser, page, memory and time bounds; reject corrupt, encrypted or unsupported files safely. Scan uploaded originals according to existing controls before analysis. A scanned or image-only PDF page is unreadable without OCR, including in a partially readable file; extraction failure is different from empty text or a missing candidate. Parse untrusted inputs in a bounded execution boundary and do not fetch external resources. Recheck authorization and source identity when releasing results, including each page of search and each context export. Cursors are opaque, bounded and bound to actor scope, snapshot, query, filters and ordering; reject stale or mismatched cursors. Avoid source content, queries and sensitive identifiers in diagnostics and telemetry. Execute expensive work outside business transactions and recheck before finalization; retries must not duplicate committed effects.

## 17. User states and errors

Show no-source, pending, completed, partial, unreadable, failed and stale states separately. For each source display readable units and unreadable or failed units when determinable. A malformed or invalid proposal is rejected with a safe actionable error and no mutation. On revoked rights, changed association or an unavailable exact original, withhold affected data and show a generic unavailable state without hidden counts or an automatic fallback to another version. During concurrent modification, report a conflict and require a fresh read. Preserve prior successful history on extraction, export or import failure; do not claim success from partial output.

## 18. Durable implementation decisions

The workspace is Project-scoped and separate from Knowledge and Certification. Sources are exact same-Company Project-attached Document Versions, with native PDF Representations or immutable supplementary DOCX originals. The parser is deterministic and model-free; OCR is excluded. Generate field candidates for identity, tax ID, address, Standard, audit type, dates, duration, references and scope only where evidence supports them. Normalize only for comparison, retain original values and citations, and label exact/normalized matches and potential differences without asserting semantic equivalence. Search supports explicit literal/lexical and fuzzy modes, filters for source, field, status and language, and stable deterministic result ordering; current is default and history is explicit. Evidence relations link exact cited passages and their candidate comparison, not inferred authority. Any heuristic false positive or absence remains reviewable.

## 19. Testing decisions

Test through authenticated public HTTP/PostgreSQL and actual browser seams for association, permission, transaction and presentation behavior; use focused deterministic engine tests for extraction, comparison and search. Fixtures include real generated textual PDFs with known pages, image-only and mixed PDFs, DOCX with stable structural locations, corrupt/encrypted inputs, long and non-Latin text, contradictory and absent values. Exercise native and supplementary originals, malformed imports, size limits, invalid citations, replays, competing revisions, source and grant changes, inaccessible sources, cross-Company access, stale runs, partial failure and history. Test RO/RU/FR search independently of interface language and verify exact literal display after normalization. Assert no candidate or review modifies canonical records, no unauthorized metadata leaks and existing Knowledge/MCP behavior is unchanged.

The reproducible model-free check is `pnpm --filter @prisma-prim/api evaluate:dossier`. It builds the current engine and prints the fixture observations, precision/recall numerators and denominators, citation scores and named scenario outcomes as JSON. A failing scenario exits nonzero. These synthetic fixtures check software behavior; they do not estimate accuracy on real Client files or a future model.

## 20. Acceptance journey

A permitted editor selects a Project, associates an exact native PDF and a supplementary DOCX, and runs analysis. The result identifies readable pages and structural passages, names an unreadable scan, shows candidate tax IDs with cited agreement or possible conflict, and reports unsupported fields without treating the scan as proof of absence. A reader searches Romanian, Russian and French terms using text and filters, opens a related exact passage and original, and sees the original locator. The editor exports a bounded context, imports a cited structured suggestion, corrects it and sees both the original and attributed decision. Replacing a source marks that run stale; a new run leaves its predecessor intact. A revoked reader cannot retrieve the old context, a hidden title or count. The fictional evaluation reports actual numerator/denominator results and failures with no claim of production accuracy.

## 21. Business evidence

Real source inventory, rights, permitted purposes, actual roles, representative document samples, independent reference annotations and human usefulness evaluation remain to be established with the business owner. No real Client document, identifying example or private source is committed to the public repository. The absence of real evidence does not turn synthetic tests into proof of business quality.

## 22. Technical research and dependencies

Qualify the chosen PDF and DOCX libraries against bounded, malformed and adversarial fixtures, exact locator stability and deployed runtime constraints before production use. Establish extraction limits and operational monitoring using [Processing Efficiency](processing-efficiency-prd.md); validate native association, rights and immutable representation APIs against actual implementation. Decide any future OCR, model provider, ChatGPT Pro/MCP integration, provider data handling or external exchange in a separately reviewed contract. Evaluation references and run identities follow the reproducibility and confidentiality principles of [AI and Knowledge Governance §17](ai-knowledge-governance-prd.md#17-bounded-offline-comparative-pilot-evaluation--957).

## 23. Readiness and blockers

This contract specifies the user-authorized runtime scope; integration and verification are tracked separately by #1434. Implementation must resolve exact native seams, bounded parser behavior, source scanning and safe storage before claiming the corresponding acceptance criteria. Fictional software verification does not establish source rights, real representative quality, legal/security readiness or production activation. Existing cross-cutting authority and production promotion gates remain in force.

## 25. Subscription-backed document harness — owner extension 2026-11-17

Dan explicitly authorized implementation after selecting a harness used inside PRISMA and funded primarily by the user's ChatGPT subscription. This section supersedes this PRD's earlier no-model/subscription-login exclusion only for this extension. OCR remains future work; Russian and Romanian are the priority languages. No merge or deployment is authorized.

### Observable outcome

An authorized Project source editor connects an eligible ChatGPT account, selects an account-available model and Romanian or Russian output, deliberately starts a cited dossier review, inspects progress and limitations, pauses/resumes work, and imports the resulting proposals through the existing deterministic validator and attributed human review. No automatic canonical fact, certification, pricing or approval change occurs.

### Execution and privacy contract

- Use the official public Responses API with a specifically granted ChatGPT-plan OAuth scope, never ChatGPT browser endpoints, copied cookies, another app's client identity or an automatic API-key/payment fallback. A valid identity token alone grants no inference permission.
- Hosted sign-in requires an actually provisioned client and exact HTTPS callback. Local development may use loopback. Missing configuration is visibly unavailable; non-commercial status or a public repository does not establish eligibility. This delivery does not change the repository license, submit an external interest form or activate a real account.
- Preserve PRISMA identity and Access authority independently. Bind one-use state, nonce and S256 PKCE to the authenticated actor, Workspace, Company and Project; expire unfinished authorizations. Verify OpenAI issuer/JWKS signature, audience, expiry, nonce and granted scopes. Encrypt server-side credentials with a required operator-owned key; never send tokens to the browser, model, logs or repository. Serialize rotating-token refresh and stop use after disconnect.
- Deliberate start discloses external processing. Bind jobs to their initiating actor, Company, Project, exact immutable run/snapshot, connection and model. Recheck live native source permissions and freshness before each external disclosure and before accepting any result. Hidden and missing resources have the same denial.
- Divide text into bounded cited batches without destroying passage identity or offsets; retain coverage of every batch, unreadable material and any explicit omission. Derived caches remain inside the same actor/Company/Project/account/model/pipeline scope and are reused only after current authorization and matching exact inputs.
- Persist queue/progress/checkpoints. The active authorized browser drives one bounded step at a time; closing it preserves the checkpoint and does not claim detached background execution. Serialize competing steps with a lease. An expired lease is an uncertain external attempt requiring deliberate recovery, never proof that no provider work occurred.
- Stop on quota, expired grant, invalid output, interruption or stale source. Resume deliberately; never buy credits, switch accounts/models or fall back to paid API keys automatically. Preserve completed checkpoints and display exact analyzed/remaining coverage.
- Validate every proposed citation against the supplied batch and exact frozen source; accept only terminal completed provider responses, not a streamed fragment. Empty valid results mean no proposal, not completeness or conformity. Import is a separate explicit idempotent command through existing suggestion ownership; reviews retain attribution.

### Acceptance criteria for the extension

H1. Eligible hosted OAuth flow and encrypted token lifecycle; rejected/replayed/mismatched/expired callbacks and missing inference grant fail closed.
H2. Real PostgreSQL job lifecycle and scoped resumability, competing step exclusion, source/access change denial, account isolation and exact-input cache reuse.
H3. Public streaming protocol: bounded input/output/time, completed-only acceptance, malformed/failed/interrupted stream and quota handling; no automatic charged fallback.
H4. Exact parser/run provenance through cited proposal validation and deliberate native import/review; complete batch accounting and honest partial/unreadable states.
H5. Accessible ro/ru/fr/en Project UI, account/configuration/limit errors, progress, exact retries, current-actor fencing, desktop/narrow native journey and inspected captures.
H6. Format/lint/types, relevant native tests, independent Standards/Spec review, publication CI, execution proof and cost record. Protocol fixtures do not establish actual account eligibility, model quality or private-corpus capacity.

Official references checked 2026-11-17: [Sign in with ChatGPT](https://developers.openai.com/siwc/quickstart), [hosted website flow](https://developers.openai.com/siwc/website), [plan scopes and registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [runtime limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), and [credential lifecycle](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions). Actual hosted-client entitlement/configuration must match its provisioned contract; the open dynamic-registration loopback flow is not repurposed as hosted approval.
