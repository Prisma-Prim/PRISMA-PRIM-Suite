# TypeScript quality and API contract pilot

Status: implementation published and reviewed in draft PR #829 for issue #828; complete current-base validation is paused for coordination after two concurrent main advances. No merge or deployment is claimed.

The owner requested critical examination of existing AI-authored requirements and anti-slop, followed by a tested first improvement. The existing policy was not treated as evidence of technical merit. This report distinguishes measured behavior, static observations and future recommendations.

## Scope and decision

Original qualification baseline: `3277c478f8d164ccc0c995627dc3112d1c2b64e3`. Original reviewed/experiment commit: `28c31ee8048a210524e6a269b62616e597708eb1` (tree `e2bf8c32a209c78369a9108f0caa811e45235008`). Branch: `codex/client-boundary-quality-pilot`. Upstream anti-slop assessment revision: `13909c9e07590f5a85d93c62712259fe14a883f7`.

Current published source: `c3c3b237ccd7111c9a11404b750242727794c9c1`; current base: `947951c420412fcd2d3416c265492625b0679431`; integration tree: `45bcd2efde687f3bcf26c9eee5f25896ec22cae4`. Main advanced twice during validation: first mission-PDF implementation #831, then product Task-result declarations #833. Two non-conflicting mechanical merges incorporate those bases without changing any of the seven pilot files or the byte-for-byte reviewed pilot diff (SHA-256 `3a7f3b7cf763abba44af771824312788290527e991b26878b160e08a110beff3`). Existing review remains applicable. Anti-slop counts, module sizes, option benchmarks and initial browser qualification below remain bound to the original qualification snapshot, not a new scan of the enlarged base. The pilot reader SHA-256 is unchanged (`1449e9ac640d8c63a776ab7f1db08d1118f4649f412c3d8a277608969c4b5af2`).

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

Focused checks completed before independent review:

- New public ClientWorkspace contract regressions: 11/11 passed, with separate RED-before-GREEN evidence for all four operations.
- Existing ClientWorkspace, latest-authenticated-request and App legal-entity suites: 99/99 passed.
- Existing API dossier, stored legal-entity result and union-snapshot validation suites: 97/97 passed.
- Registered real-App browser checks with synthetic HTTP: 10/10 passed, desktop 1440 and narrow 390. Four new error/recovery screenshots were visually inspected; responsive fit and existing registration focus behavior passed.
- Scratch option comparison: 114/114 passed and strict types passed.

Full source format/lint and strict API/web types passed. Independent Standards and Spec reviews of the exact baseline-to-source diff both found no blocking issue. One nonblocking follow-up remains: the older TDD mocking guide still states the narrower system-boundary-only rule; the revised canonical TypeScript policy controls, and alignment remains proposed under the bounded review policy. Final integration evidence is recorded separately when complete. Attempt2 passed doctor, format, lint, types, scripts (479 tests), documentation (83), API parallel (2,690 passed and one skipped real-ClamAV test), API serial (102 passed) and web unit (171 files, 2,944 passed). The real-ClamAV integration case requires TEST_CLAMAV_HOST/PORT and was not configured. Browser prebuild passed but the startup guard refused a changed resolved pnpm executable caused by the initial task-local launcher; the overall run remains failed. Acceptance, acceptance-evidence, build, Railway types/tests and packaging were unexecuted in that run. A corrected stable-path launcher passes the guard and a separate registered-browser diagnostic passed 707 cases with one intentional desktop skip for a narrow-only navigation case. Preview and post-test guards passed. This is not complete integration evidence; attempt3 later passed API-parallel (2,690 tests and one optional ClamAV skip) but was deliberately interrupted during API-serial after main advanced. Its original failed/superseded report is published separately. Attempt4 passed doctor, format, lint, types, scripts and documentation on source92f5024/base53de310, then root interrupted API-parallel after the second main advance (five product documents only). Its original runner records a source/base integration refusal after the refreshed base. Current sourcec3c3b23/base947951c still requires a fresh complete gate; it is paused pending coordination for a stable merge window. No current-base complete pass is claimed. Focused proof is not a claim of a complete integration gate or independent GitHub runner success.

The managed runtime also required a writable task-local Docker client configuration and build-only public-CA trust: an actual unadapted pinned-Node npm request failed `SELF_SIGNED_CERT_IN_CHAIN`, while the trusted probe and both canonical API/WEB prerequisite builds passed. A narrowly scoped external Docker launcher materializes temporary effective recipes that mount the managed public CA and export `NODE_EXTRA_CA_CERTS` during the three original RUN commands. Original tracked recipes, FROM pins and application commands remain unchanged; there is no persistent ENV or certificate in either resulting runtime image. Original/effective recipe hashes, actual image IDs, public-CA digest, wrapper source and runtime-hygiene checks are included in the preflight archive. This is a declared transport adaptation, not a claim of execution without it. Proxy configuration and certificate contents are excluded from publication.

Issue [#828](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/828), source branch and draft PR [#829](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/pull/829) are published under the owner's explicit authorization. The [original qualification package](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/6b23fa3d8ef7b1232819f9732f02ec69f83c9bec/INDEX.json) includes the reproducible pinned experiment, anti-slop counts and four inspected desktop/narrow screenshots. All nine blobs were retrieved and size/SHA-256 verified. Release asset upload returned HTTP401; the repository's bounded parentless evidence-ref fallback was used. This evidence never enters product history.

The latest [superseded attempt4 report](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/f4e2393bda6c388a90e73e05abd994db864ef9eb/report.md), [original manifest](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/f4e2393bda6c388a90e73e05abd994db864ef9eb/manifest.json) and [publication index](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/f4e2393bda6c388a90e73e05abd994db864ef9eb/INDEX.json) are separately published; all five blobs were retrieved and SHA-256 verified. Only reports, public metadata and composition proof are selected. Raw test logs and complete originals remain local. A broader earlier log bundle was refused by automatic disclosure review; a reduced metadata-only approach was approved and used instead. Older nonpassing evidence refs are retired under the current-plus-preceding retention rule; qualification experiments remain supplemental.

Two actual base advances interrupted complete integration qualification after about 35 and 12 minutes respectively. This identifies a present coordination cost in the mandatory full-gate protocol. A separate workflow decision could evaluate stable merge windows or rigorously bounded reuse for documentation-only base advances; no such exception or tooling change is implemented here. Current policy still requires a fresh exact-tree complete gate. The owner has been asked to coordinate a roughly90-minute period without other merges. No additional full run is launched blindly while that coordination is unresolved.

No separate `pnpm verify` or independent manually dispatched GitHub Actions run is claimed. The PR remains draft, and merge is blocked by missing complete current-base qualification rather than a blocking code-review finding.

## Code-size context

A read-only inventory at the proposed source contains 545 production/tool TS/TSX files under API/web src after excluding tests and the recoverable UI baseline. The largest files include `accountability.service.ts` (3,480 lines), `CommercialIntakeWorkspace.tsx` (3,455), `offer.service.ts` (2,622), and `company-context-assignment.service.ts` (2,270). The inventory and exclusion rules are preserved in `module-size-context.json`.

These are line counts, not validated architectural defects or complexity scores. They confirm that code navigation/context size needs a separate module-design intervention: lint syntax rules do not decompose these files or establish transaction and authorization boundaries. A future slice should start from reasons to change and public behavior, then select one cohesive responsibility with regression proof; arbitrary file-length ceilings are insufficient.

## Proposed next work

1. Migrate unchecked response consumers in separate behavior-owned lots, prioritizing mutable command confirmation and security-sensitive context reads.
2. Evaluate shared runtime/API/OpenAPI ownership on a richer contract before choosing a repository-wide schema/generation strategy.
3. Qualify a small set of useful existing-ESLint checks using confirmed diagnostic value, migration scope and run time; preserve justified boundary patterns.
4. Assess the largest production modules and tests by reasons to change and public test seams, rather than use line counts as automatic refactoring orders.

The [response migration candidate table](response-migration-candidates.md) identifies seven representative flows and their existing public test seams: actor bootstrap/revalidation, context recovery, self-assignment refresh, Client dossier correction, Company registration, suspension acknowledgement and Company discovery. These are static candidates, not seven confirmed defects or seven separately approved issues. In particular, suspension currently ignores the response body; deciding a status-only versus identifying-receipt contract comes before adding a decoder.

The [large-module supplement](large-module-candidates.md) examines one Commercial Intake workspace and names three bounded candidates: response contract ownership, the existing Request-list view and controlled capture-form presentation. Async/authority coordination, stale/abort behavior and draft/retry ownership stay together. Existing behavioral tests are identified; no extraction or measured agent-productivity improvement is claimed. Both supplements were inspected on source92f5024; the current sourcec3c3b23 changes only product documents relative to that source, leaving all application code unchanged.

No follow-on implementation is started by this pilot.
