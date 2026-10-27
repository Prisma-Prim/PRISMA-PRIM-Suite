# PR #860 — bounded inspection of the new main delta

**Status:** Non-canonical local inspection evidence; no blocking integration finding identified. This records reuse of the existing Standards/Spec review after a main advance, not another review round or merge qualification. No tests were executed by this audit.

## Exact binding

- Inspected main delta: `653f2233b3b63aafd660347f569ccf31f0ec2121..2e6e3e820228c0debf5520091cc5285279590a2e`.
- New base: `2e6e3e820228c0debf5520091cc5285279590a2e`.
- Composed source: `aacda4a34631fbd1ddf7889b0dd3528af851f8bc`.
- Integration tree: `ff62610dcc2611286bac65aab089ee221f779912`.
- Checkout: `/workspace/work/integrate-pr860-20261026`, observed clean and with `origin/main` at the exact base above.
- Main adds #914 (`167ec00`, delayed Request focus), #913 (`333c658`, Offer discovery), and #916 (`2e6e3e8`, Contract discovery): 44 paths. Every one of those 44 Git tree entries, including mode and blob, is identical between the new base and composed source. Their path intersection with the #860 diff is empty. The new base is an ancestor of the source.
- #860 stable patch ID remains `224653f3d592b154e494cd5f305ab6b7f66ec15c`.

## Standards disposition

**No new blocking incompatibility found within the inspected recovery, module-wiring and navigation boundary.** Applied `AGENTS.md`, mandatory TypeScript discipline, and the existing bounded review policy in `docs/agents/issue-execution.md`. The incoming files are retained exactly; no conflict resolution or extra implementation is needed.

`OfferDecisionQueueService.list` (line 25) and `ContractDecisionQueueService.list` (line 24) each start one ordinary `DatabaseContext.transaction`, with `repeatable read` / `read only` configuration. They call only existing Company authorization methods, the pure cursor reader/writer, and SQL selection over the commercial tables. Authorization methods use `DatabaseContext.connection`, pass their default `lock = false`, and do not create another transaction. There is no external effect, business write, Client reference collaborator or nested recovery wrapper on either new route.

Both new services remain providers **and** exports of their existing Offer/Contract module; existing providers, exports and imports are retained. Both guarded GET controllers are registered in ApplicationCompositionModule. DatabaseContext remains single-attempt; neither new root expands its retry responsibility.

The source-bound preservation report [pr860-preservation-proof-aacda4a-2e6e3e8.json](/workspace/work/pr860-preservation-proof-aacda4a-2e6e3e8.json) reports 25 definitions in 15 modules restored to this exact base after reversing the wrappers, with comments retained, identical sentinel and identical ordinary Client owner body. Its SHA-256 is `53afee530494b8e2af4df1fc5fc26869db2f2c68b06f193a027edabdccb83d7b`; the recorded tuple and counts were independently checked here. This audit inspected that existing report; it did not rerun its helper.

## Spec disposition

**The #856/#860 ownership and recovery contract remains applicable; no new migrated root or owner is required.** The only Client drift producers remain the two throws in `ClientOperationalReferenceService.lockAndRecheckReferences` (lines 794 and 811). Neither queue can reach them: §32 expressly requires discovery metadata without live Client lookup, and both implementations read only scoped commercial records. Wrapping these discovery reads would add no reachable drift recovery. Opening a selected record delegates to the existing OfferPanel/ContractPanel and its existing API command/read roots, which retain #860's wrappers and unchanged transaction bodies. Native uncertain-result retries, immutable receipts and authorization checks therefore remain with their existing owners.

Against the approved `release-3-commercial-32-pending-decisions.md` contract, the inspected routes preserve independent family authority, optional model rights, current undecided heads, bounded keyset pagination and a coherent read snapshot. Selection carries the exact record/version into the native owner. PendingDecisionQueue aborts retired requests before shared-access callbacks, retires state by consumed authority/session context, and blocks Back/refresh/reselection while the selected native owner reports protected work. The new narrow boolean reports expose neither a payload nor an idempotency key.

The Home queues retain independent owners alongside the estimate queue and do not call App's Request/Document navigation callbacks. #914 preserves the already-merged #859 exact Request continuation: it forwards the existing source AbortSignal, retires queued section frames after identity/context/new-navigation changes, ignores hidden or stale destinations, and leaves focus inside a detail that is already ready. The monotonic Document request counter and its retirement rules are untouched. Existing source tests cover both focus orderings, source replacement, Company/session retirement, late 200/403 responses, exact record mismatches and protected uncertain retries; these tests were inspected, not executed here. Native acceptance selection now includes both new queue journeys; no existing acceptance family is removed.

## Execution and limits

Only local file/Git reads and this private handoff were performed. No source edits, tests, package installs, network calls, reference updates, PR actions or review triggers were performed. The root agent owns the fresh complete gate, evidence publication, current-base guard and merge. Earlier old-base full PASS plus the six documentation checks cannot qualify this runtime-advanced base; a passing current exact-tuple gate is still required.
