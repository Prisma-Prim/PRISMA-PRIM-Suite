# TypeScript quality and API contract pilot

Status: owner-qualified for guarded incorporation in PR #829 / issue #828, pending final evidence publication and merge. All sixteen verification families succeeded across explicitly identified runs; the owner authorized bounded reuse for exact sourcebdcface/base12ba34/treef62 only. This is not a canonical complete current-head pass. Original failed/interrupted manifests remain unchanged.

The owner requested critical examination of existing AI-authored requirements and anti-slop, followed by a tested first improvement. The existing policy was not treated as evidence of technical merit. This report distinguishes measured behavior, static observations and future recommendations.

## Scope and decision

Original qualification baseline: `3277c478f8d164ccc0c995627dc3112d1c2b64e3`. Original reviewed/experiment commit: `28c31ee8048a210524e6a269b62616e597708eb1` (tree `e2bf8c32a209c78369a9108f0caa811e45235008`). Branch: `codex/client-boundary-quality-pilot`. Upstream anti-slop assessment revision: `13909c9e07590f5a85d93c62712259fe14a883f7`.

Current published source: `bdcface0696cd47003e4750a0f906da9d0197557`; current base: `12ba34bacc4f9067831729f11ff27b25b8cb7f0c`; integration tree: `f62e7021e0623d4afca40b1964463b79b8a53d50`. The latest mechanical merge incorporates docs-only #841 (CONTEXT.md plus nine product Markdown files),171insertions/8deletions. Every non-documentation tracked byte and mode is unchanged from source820ff40. The declared future Offer/estimate product contract does not change this pilot runtime or acceptance scope. Non-conflicting base merges incorporate mission PDFs #831, Task-result declarations #833, Task-result implementation #835, pilot-plan declarations #837 and pilot-plan implementation #839. The original seven product/policy pilot files and reviewed diff remain unchanged (SHA-256 `3a7f3b7cf763abba44af771824312788290527e991b26878b160e08a110beff3`). Correction commit `b2cda4c1dd0a521f565eea465b3038daf8b05a4b` adds one readiness wait in an existing dossier browser test; the complete change now has eight files. Root Standards/Spec inspected that non-sensitive test-only correction under the existing bounded review policy, without a new review/confirmation round.

Anti-slop counts, module sizes, option benchmarks and original browser qualification below remain bound to their original qualification snapshot; they are not a new scan of the enlarged base. The pilot reader SHA-256 is unchanged (`1449e9ac640d8c63a776ab7f1db08d1118f4649f412c3d8a277608969c4b5af2`).

The first change validates the Client directory's list, search, registration and attachment responses before consumption or success effects. A small frontend-owned reader proves the three consumed fields and supplies the inferred `ClientAccountView` type. No runtime dependency, generator, backend endpoint, migration or permission was changed.

Four separate public-UI regressions failed before their respective corrections:

| Operation | Observed before correction | Corrected behavior |
| --- | --- | --- |
| List | A row with the string `false` as its relationship was rendered as available | Reject the entire malformed response; show the existing error |
| Registration | Missing response identifier still cleared the draft and announced success | Preserve the literal draft and retry command/key; publish no success/activity/refresh |
| Search | A malformed result and valid result appeared together | Reject the complete result; preserve the query for retry |
| Attachment | A response without a display name replaced a row and claimed availability | Enter the existing error state, settle pending controls and publish no success effects |

The reader proves string/string/boolean representation, not UUID syntax, nonblank text or business identity. Empty/whitespace strings are not silently normalized. Additive HTTP fields are accepted and projected away. The closed OpenAPI producer schema is unchanged. Persisted receipts and historical snapshots retain their separate exact/evolution rules.

The generic HTTP transport still supports unchecked caller-selected types for unrelated consumers. This pilot removes that dependency in the four named operations; it is not a repository-wide response migration. The frontend contract is consolidated, while backend declarations and OpenAPI remain separate owners.

## Critical decisions on the previous policy

| Previous prescription | Decision and technical reason |
| --- | --- |
| All external values become `unknown` | Replace with evidence-based boundaries. Environment values already have string-or-absent representation. Enforced platform/driver/schema guarantees should be retained; arbitrary JSON still needs structural proof. ORM `$type<T>()` alone validates nothing. |
| Validate exactly once | Replace with ownership of each invariant. Structural decoding, domain rules, current authorization, versions and transactional state are distinct checks. Repeating an unchanged proof is wasteful; rechecking mutable state can be essential. |
| Assertions require new runtime validation at the same boundary | Broaden the admissible evidence to control flow and enforced library/lifecycle contracts that still hold at use. A cast or comment remains insufficient proof. Do not add redundant parsers merely to justify interop. |
| Make every illegal state unrepresentable | Retain for relevant closed variants where practical. Cross-row constraints and concurrent state still require runtime/database enforcement. Partial consumers and open protocols need deliberate compatibility fallbacks. |
| Prefer schema-derived types | Prefer one owner for an executable contract and its type. Parser inference is sufficient for the pilot. Library adoption must demonstrate maintenance benefit and address API/OpenAPI ownership. |
| Object arguments for every repeated primitive type | Apply where call-site ambiguity is material; preserve familiar simple calls and framework injection contracts. |
| Always use the highest public seam; forbid internal doubles categorically | Choose the smallest stable seam proving the contract. Keep real integration proof for transactions/wiring/browser behavior. Do not replace the behavior under test or introduce wrappers solely to appease a mocking syntax rule. |

The canonical `docs/agents/typescript-discipline.md` is revised accordingly. Its governance test checks discoverability and consistency; it does not certify the technical merit of prose.

## Executable option comparison

The isolated experiment uses Node 24.19.0, TypeScript 5.9.3 and exactly Zod 4.1.12. It imports the actual new summary reader and the actual existing nested legal-entity reader. It does not install Zod into the product.

Final comparison: **114/114 checks passed**, plus strict type checks and inferred-type compatibility checks:

- 54 simple-summary checks across the actual reader and Zod;
- 49 nested-response checks across the existing reader and equivalent Zod schema;
- 11 controls against the real persisted Contact validator, including historical optional-field compatibility and rejection of unknown stored fields.

Both runtime approaches accepted/rejected the intended fixtures and returned equal successful values. The nested schema intentionally preserves existing date parsing, safe-integer version bounds and required nullable fields. Adding `.uuid()`, stricter date validation, trimming or optionality would change behavior and was excluded. Exceptions differ: generic reader errors versus structured Zod errors; error text was not treated as equivalent.

| Approach | Established benefit | Cost/limit | Pilot decision |
| --- | --- | --- | --- |
| Small owned handwritten reader with inferred type | Actual malformed-response regressions fixed; 29 source lines; no new production dependency | More complex nested contracts can become repetitive; API/OpenAPI ownership still separate | Use for the three-field summary |
| Runtime schema with inferred type | Equivalent tested behavior for both simple and nested shapes; concise executable declarations | New dependency and browser integration; migrations must preserve error/normalization/compatibility semantics | Tested candidate for richer future contracts |
| OpenAPI-generated contracts | Potential alignment with published wire schema | Type generation alone does not validate JSON; generator/runtime pipeline and drift enforcement are additional work | Architecture comparison only; not implemented or benchmarked |

Median milliseconds per valid in-memory list, seven warmed alternating samples:

| Shape | Rows | Actual existing reader | Zod 4.1.12 |
| --- | ---: | ---: | ---: |
| Summary | 20 | 0.00044 | 0.00141 |
| Summary | 1,000 | 0.01513 | 0.04998 |
| Nested legal entities | 20 | 0.00440 | 0.01233 |
| Nested legal entities | 1,000 | 0.22158 | 0.63098 |

These are microbenchmarks, not application latency or browser measurements. They exclude JSON parsing, network, rendering, cold startup and invalid-input errors. The 1,000-row list is a stress input, not a statement of current API capacity. Both candidates are sub-millisecond here; ratios do not decide architecture. Source-line counts do not measure maintenance time. No Zod production bundle-size claim is made.

## Disposition of anti-slop rules

These are policy/enforcement recommendations, not a claim that the rules have been installed. Upstream uses lexical AST/scope analysis, not TypeScript's checker. No global preset or autofix is applied.

An isolated warning-only run with Oxlint/plugins 1.78.0 examined all 865 TS/TSX files under API/web src (including 317 tests and the recoverable UI baseline). The immutable snapshot was subsequently verified path-for-path and byte-for-byte against the proposed commit. It emitted 30,277 warnings across 751 files in 5.157 seconds wall time, one thread, with a 30-second cap; default correctness rules were disabled. 26,808 warnings (88.5%) concern spacing. No CPU stall reproduced on this input. Counts below are policy candidates, not confirmed defect counts; no per-rule CPU share or application improvement was measured.

| Rule | Warnings | Decision | Evidence and cost |
| --- | ---: | --- | --- |
| `no-array-filter-map` | 9 | Advisory for measured hot paths | Readable navigation chains exist in ApplicationShell; no bottleneck established. Rewrites must preserve callback/index/sparse-array semantics and runtime support. |
| `no-reduce-accumulator-copy` | 0 | Retain performance review principle | Growing copies can be quadratic; no such defect was confirmed in the initial inspected reductions. Mutation requires ownership proof. |
| `no-chained-type-assertions` | 3 | Retain with localized interop review | Three test expressions fabricate full Drizzle databases. Review supported seams rather than create production abstractions solely to remove syntax. |
| `no-conditional-empty-object-spread` | 325 | Reject blanket ban | Task validation/response code intentionally preserves omission in historical receipts and fingerprints. Assigning undefined is not a mechanically safe replacement. |
| `no-known-value-widening` | 162 | Adapt to static versus open records | Useful for registries; dynamic headers and test route maps deliberately add keys. `satisfies` is not a drop-in replacement for a mutable dictionary annotation. |
| `no-module-mocking` | 7 | Adapt to test responsibility | Seven direct mocks observed initially model Clerk, pg or database harness boundaries. A blanket ban can add infrastructure or wrappers without stronger proof. |
| `no-object-parameters` | 2 | Adapt to domain interfaces | This bans the TypeScript annotation `object`, not named object arguments. Prefer a command contract when it catches caller mistakes; opaque serialization need not know the entire domain. |
| `no-reflect-apply` | 0 | Retain, low priority | Typed calls generally preserve signatures. No occurrence found in the initial scan; permit justified interop. |
| `no-reflect-get` | 0 | Retain, low priority | Prefer typed access; dynamic boundary inspection can be legitimate. No occurrence found initially. |
| `no-runtime-typeof` | 1135 | Reject blanket ban | Owned Task parsers and storage predicates use it to establish representation. Replacing correct parsers is a migration, not an automatic quality gain. |
| `no-shape-in-symbol-names` | 28 | Reject | `PRICING_RULE_SHAPE` and `ruleShape` are actual domain/schema terms. Renaming does not establish stronger validation. |
| `no-unknown-parameters` | 1245 | Reject default; scope to domain interiors | HTTP bodies and parsers honestly accept unknown. Require proof before business use, not a cosmetic replacement of the boundary signature. |
| `no-unknown-returns` | 87 | Adapt | Raw JSON/storage transports may legitimately return unknown. A domain operation discarding its own known result deserves review. |
| `no-unknown-type-aliases` | 0 | Retain narrowly, low priority | A pure alias to unknown can obscure evidence; do not confuse conditional-type or boundary uses with a defect. None found initially. |
| `no-unsafe-dictionary-type` | 414 | Adapt to decoder internals | `Record<string, unknown>` is useful during field proof. Avoid transporting it into a domain that already has a precise contract. |
| `no-widen-then-assert` | 0 | Retain | Losing evidence then asserting it back is worth detecting. Local lexical analysis does not prove cross-file absence or correctness. |
| `require-readable-spacing` | 26808 | Optional formatting decision | Editorial benefit; blanket rewriting creates churn. Upstream issue #54 reports CPU spikes; use measured qualification rather than assuming native Oxlint speed applies to JS plugins. |
| `require-safety-comment-for-type-assertion` | 51 | Adapt | Require a specific invariant for necessary assertions. A marker cannot prove correctness; avoid generated explanations that merely silence lint. |
| Native `oxc/no-accumulating-spread` companion | 1 | Advisory/retain with performance checks | Complements non-spread detection but does not prove every reduction linear. |

All five Effect rules remain inapplicable while the product has no Effect dependency: `no-manual-effect-error-tag`, `no-manual-tag-comparison`, `no-manual-tagged-construction`, `no-service-constructor-imports`, `prefer-effect-match`. They impose Effect-specific APIs and architecture rather than universal TypeScript guarantees.

Existing ESLint already provides no-explicit-any. Nested-assertion syntax can be controlled locally with existing infrastructure. Typed unnecessary-assertion and exhaustive-switch checks are available but require typed lint configuration and performance/false-positive qualification. No second mandatory lint stack is justified solely by the pilot.

## Verification and publication

Original-source focused qualification before independent review:11new public-UI regressions with four separate RED-before-GREEN cases;99existing frontend tests;97existing storage/receipt API tests;10registered real-App/synthetic-HTTP browser cases across desktop1440/narrow390;114actual-reader/schema comparisons and strict inferred types. These remain bound to source28c31ee and do not replace current-base qualification.

The original complete gate6 (source820ff40/base634d1b4/tree7e37116) passed its first15families:

| Family | Actual result |
| --- | --- |
| Doctor, format, lint and strict types | Passed |
| Script checks | 483passed |
| Documentation checks | 83passed |
| API parallel plus serial | 2782+102=2884passed;1optional real-ClamAV case skipped without TEST_CLAMAV_HOST/PORT |
| Web unit | 2993passed in175files, including11new response-contract regressions |
| Registered browser | 707passed;1intentionaldesktopskip for narrow-only navigation |
| Real API/PostgreSQL acceptance | 90/90passed across both projects |
| Mandatory deliberate failure-evidence verifier | Passed; exactcontext,PNG,trace and sanitizedtimeline retained |
| Build, Railway types and Railway tests | Passed;1Railwaytestpassed |
| Packaging | FAILED/exit1: web4318portabsent |

That complete run remains failed. A focused unchanged prerequisite image reproduced immediateexit2: `/bin/sh: can't open '/usr/local/bin/prisma-web-start': Permission denied`. Ambient hostumask0077 had made the two root-owned public webdeploymentfiles mode600; the runtime nginx user could not read them. Root restored only local read modes for web-start.sh and nginx.conf.template to644. File bytes, Git executable bits, clean status, Dockerfiles, image user, assertions and timeouts are unchanged. The unchanged canonical packaging command then passed/exit0, proving actualimage startup,hostingports,health,directSPAnavigation,productionidentityrejection and repeatablemigrations. Its selectedresult/hash/line transformation is separately labeled; it never changes the historical failed family.

[Latest failed6 original report](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d05cb42a25e57785e002c2860047269910672ee3/report.md), [original manifest](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d05cb42a25e57785e002c2860047269910672ee3/manifest.json), [selected evidence/index](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d05cb42a25e57785e002c2860047269910672ee3/INDEX.json), [root content review](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d05cb42a25e57785e002c2860047269910672ee3/ROOT-REVIEW.md), and [separate later packaging success](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d05cb42a25e57785e002c2860047269910672ee3/later-diagnosis/packaging-targeted-result-820ff40.json) are published. All45blobs(3,891,931bytes) were retrieved with exactSHA256/size and remote parentlessref/tree verification. No raw product/test logs or Dockercredential/certificate/environment contents are selected. Six journeyPNG, the four mandatory synthetic probe artifacts and exact hash-bound reviews are included. The raw probe trace intentionally retains publicfakecanaries and is NOT sanitized; the separate timeline excludes them.

Fresh complete gate7 ran2026-10-24T07:42:33Z–08:07:13Z on the current source/base/tree. Doctor,format,lint,types,483scripts and83documentationtests passed. Seven API files/622cases additionally passed before interruption; that APIfamily did not complete. The owner explicitly answered **“Autoriser cette réutilisation limitée (recommandé)”** to a question stating the first15passedfamilies, separately corrected packaging, identical applicationcode/docs-onlycomposition, currentdocumentationchecks and no-new-failure condition.

After checking no new actual failure, root sentSIGINT only to the exact run7 verifier; it cleaned the APIchild withSIGTERM. Its original canonical manifest remains**failed**, with APIfamily**interrupted** and nine laterfamilies**unexecuted**. This is controlled operator cancellation after an approved process exception, not a newly failing product case. Neither report is rewritten or accepted by the canonical complete-pass validator.

The exception applies only to exactsource`bdcface0696cd47003e4750a0f906da9d0197557`,base`12ba34bacc4f9067831729f11ff27b25b8cb7f0c`,tree`f62e7021e0623d4afca40b1964463b79b8a53d50`. [OWNER-QUALIFICATION.json](OWNER-QUALIFICATION.json) maps all16families: currentrun7's six successful light/documentationfamilies, unchanged-code run6's nine successful runtimefamilies, and separately corrected canonical packaging. It records the explicit ownerdecision, all1462currenttrackedinput hashes/modes, all2352originalrun6artifact hashes, all7run7artifact hashes, the exact10Markdownfile compositiondelta, unchanged7filepilotpatchSHA256, stable3runtimewrappers and two restoredpublicreadmodes. The canonical current-head full-pass condition is waived for this delivery only; any newsource/base/applicationchange invalidates this version's qualification. Fresh live-main/PRhead/tree guards and actual postmerge-tree verification still apply.

This preserves completebehavioral coverage without claiming one successful current-head fullrun. Localoperator claims and the bounded [FACTS-AUDIT.json](FACTS-AUDIT.json) remain distinct from independent GitHub runner attestation. No general workflow or future waiver is introduced.

Root Standards/Spec self-review and one independently owner-authorized Standards/Spec review found no blocking pilot issue. The one-line test correction was inspected under the existing bounded rule; mechanical merges preserve reviewed material. Nonblocking: older TDD mocking guidance remains narrower than the revised canonical TypeScript policy. No new review round is added solely for main advances or green verification.

The managed runtime also requires the qualified stable pnpm launcher and build-only public-CA trust in Docker. An original pinned-Node npm request failedSELF_SIGNED_CERT_IN_CHAIN; trusted probes and actual API/web image builds succeeded. A narrowly scoped external wrapper mounts that public CA for the three originalRUNcommands only. Original tracked recipes,FROMpins and application commands remain unchanged. Both preliminary runtime images were inspected for absent CA mount and NODE_EXTRA_CA_CERTS; this does not claim every possible certificate path is absent. Current actual packaging is independently run, not inferred from preflight images. Public effective recipes/wrapperhashes are published in the [original qualification package](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/6b23fa3d8ef7b1232819f9732f02ec69f83c9bec/INDEX.json).

Issue [#828](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/828), source branch and draftPR [#829](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/829) are published under explicit owner authority. Release asset upload returnedHTTP401; the documented bounded parentless evidence-ref fallback is used. Evidence never enters product history. Qualificationv1(9blobs) and v2(8blobs) were retrieved/hash-verified; source-bound experiments remain supplemental. Current-plus-preceding retention applies to full run evidence, with14daysaftermerge retention and open-review preservation. Earlier failed5's compact diagnosis remains separately linked below.

Repeated main advances and two diagnosed environmental prerequisites have a measurable coordination cost in the exact-tree full-gate protocol. A separate workflow decision could evaluate stable merge windows or rigorously bounded reuse. The owner has authorized only the exact-version reuse above; no general policy/tooling change or future exception is introduced. Do not relabel an older run as current proof.

No independent manually dispatched GitHub Actions run or separate pnpmverify pass is claimed. Local reports are self-reported execution evidence. APIdefaults remain the canonical local15000ms; this establishes no5000ms manual-workflow or business-SLA claim. All explicit test deadlines, assertions and browser scenario budgets remain unchanged. Complete originals/rawlogs remain local. The PR can become ready and be guardedly squash-merged after this exact owner-qualified evidence is published/retrieved and the final source/base/tree guards remain valid. The PR owns actual delivered state; this report is an immutable premerge decision/evidence snapshot.

## Diagnosed dossier-test synchronization correction

The narrow dossier404 browser case failed with `Expected a dossier read` immediately after asserting that loading was visible. The original spec and dossier/request implementation blobs are identical on exact main2833 and sourcee9e1. Loading is published before asynchronous identity/request composition, while the fixture installs its release callback only when it intercepts the HTTP read; visible loading does not establish route readiness.

Natural isolated controls passed20/20 on each revision; no natural main failure rate is claimed. On exact main, adding a controlled250ms delay before fixture release-callback assignment reproduced the same guard failure5/5. Adding one readiness poll under the identical delay passed5/5. The artificial delay exists only in archived diagnostic patches; it was restored/removed from the detached experiment checkout, which was then deleted.

The shipping change adds `await expect.poll(() => release !== undefined).toBe(true)` after the unchanged loading assertion. It preserves the existing runtime guard,403actor-status mutation before response release, exact404/503/403feedback and absent-control/absent-data assertions. It uses existing assertion deadlines, with no retry-policy, scenario-budget or production change. All three outcomes in both viewport projects, repeated five times, passed30/30(50.3s), alongside full format/lint/types. The shared baseline dependency metadata was restored with an explicit frozen offline install(562reused,0downloads) before those checks; no manifest/lock/source dependency change was committed.

The [preserved experiment record](supplement/dossier-experiment.json) distinguishes original failure, natural controls, diagnostic stress, treatment and later focused success. These focused results never convert failed gate5 into a pass. Fresh gate6 began at2026-10-24T06:11Z; it subsequently passed that browser scenario and all90realacceptancecases, but failed finalpackaging on localpublicfilepermissions as recorded above. The owner-qualified current composition reuses the successful runtime cases and separately corrected packaging under the exact-version exception above; no failed run is relabeled.

## Code-size context

A read-only inventory at the proposed source contains 545 production/tool TS/TSX files under API/web src after excluding tests and the recoverable UI baseline. The largest files include `accountability.service.ts` (3,480 lines), `CommercialIntakeWorkspace.tsx` (3,455), `offer.service.ts` (2,622), and `company-context-assignment.service.ts` (2,270). The inventory and exclusion rules are preserved in `module-size-context.json`.

These are line counts, not validated architectural defects or complexity scores. They confirm that code navigation/context size needs a separate module-design intervention: lint syntax rules do not decompose these files or establish transaction and authorization boundaries. A future slice should start from reasons to change and public behavior, then select one cohesive responsibility with regression proof; arbitrary file-length ceilings are insufficient.

## Proposed next work

1. Migrate unchecked response consumers in separate behavior-owned lots, prioritizing mutable command confirmation and security-sensitive context reads.
2. Evaluate shared runtime/API/OpenAPI ownership on a richer contract before choosing a repository-wide schema/generation strategy.
3. Qualify a small set of useful existing-ESLint checks using confirmed diagnostic value, migration scope and run time; preserve justified boundary patterns.
4. Assess the largest production modules and tests by reasons to change and public test seams, rather than use line counts as automatic refactoring orders.

The [response migration candidate table](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d33abbc2595a0489ddcc46870320e3f0585d95a4/assets/response-migration-candidates.md) identifies seven representative flows and their existing public test seams: actor bootstrap/revalidation, context recovery, self-assignment refresh, Client dossier correction, Company registration, suspension acknowledgement and Company discovery. These are static candidates, not seven confirmed defects or seven separately approved issues. In particular, suspension currently ignores the response body; deciding a status-only versus identifying-receipt contract comes before adding a decoder.

The [large-module supplement](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/d33abbc2595a0489ddcc46870320e3f0585d95a4/assets/large-module-candidates.md) examines one Commercial Intake workspace and names three bounded candidates: response contract ownership, the existing Request-list view and controlled capture-form presentation. Async/authority coordination, stale/abort behavior and draft/retry ownership stay together. Existing behavioral tests are identified; no extraction or measured agent-productivity improvement is claimed. Both supplements were inspected on source92f5024. The later Task-result base adds application code, including authority fields; the static migration table has not been exhaustively resurveyed for that later base. Its paths/contracts require a fresh targeted check before future implementation. The pilot itself remains byte-identical and is receiving current-base integration tests.

No follow-on implementation is started by this pilot.
