# First-team auditor selection — #1439 / PR #1449

Final prepared fictional App/API/PostgreSQL proof from the source of `3cd33ffa7faff3c869468294607ba15d7f9e1338`, 18 November 2026. No real Client data, secrets or source documents appear. The eight final screenshots in `final/` were visually inspected before publication; hashes and exact run timestamps are in `final-manifest.json`.

Romanian desktop (1440 × 900) and Russian narrow (390 × 844) pass with no skips or retries. These are interface locales; persisted source language is not claimed.

The manager selects previously uninvolved Ion Popa in the first team. Ion cannot approve his team even with the approver bundle. An independent actor approves, the manager records a plan, and Ion records Stage 1 work. Native responses and persisted actor attribution are asserted by `certification-team-selection.acceptance.spec.ts`. Dossier/decision independence has separate native proof in `certification-decision.rest.test.ts`; early browser form absence alone does not prove downstream authorization.

Local checks: affected API 175/175; certification Web 528/528 before the review correction and final team 23/23 afterwards; runner/workflow 34/34; global format/lint/types and affected strict E2E types pass. The canonical acceptance fixture seeds earlier business steps through recommendation using the public API, then exercises UI corrections, closing and register downloads; it passes both widths. The new first-team regression seeds only through agreement, then drives the first team and handoff through controls. Final full CI44265177806 completed successfully on this head:21/21 jobs, including required `quality`. `ci-proof.json` retains72 selected passing test records, all21 job results and eight official report ZIP digests; each digest and source head was verified before parsing. Both acceptance shards pass127 tests each, with zero retries, failures or skips. Four additionally inspected CI narrow screenshots are in `ci/narrow/`; the same-source local captures cover both widths in `final/`.

Retained failures: the first browser invocation stopped on an authoring/build error. The second had a genuine candidate-read concurrency HTTP 500 on desktop while narrow passed; a controlled PostgreSQL barrier reproduced and fixed it. A review regression reproduced stale discovered candidates after revoked authority and a fresh search; the fix replaces fresh results and preserves the literal draft while refusing the stale link. CI1 (44262900958) failed its nightly-registration guard because this deterministic test accidentally imported the chaos fixture; its downstream suites were skipped. The corrected plain Playwright import passes the guard and the fresh two-width browser run. None of these earlier failures count as passes.

The earlier pre-review screenshots remain in `desktop/` and `narrow/`, with their original manifest; immutable predecessor 069c5bf87cbdfe67d1816547ead56382b307264b preserves its original report. Raw logs/traces stay private. Cost records in PR #1449 retain measured local windows, CI1 failure and unavailable usage figures.

This bundle covers #1439 only. It does not qualify private documents, real subscription activation or completion of programme #1443. No merge to main or deployment.

## Complete CI and limits

The API report totals5909 passed and one existing real-ClamAV integration test skipped; the Web report has5827 passed. All tests cited for #1439 execute and pass, including6 native candidate guards,4 team guards,8 closing independence guards,23 rendered team tests,29 runner tests and2 new native browser variants. These are prepared software checks, not real-document accuracy measurements. The skipped scanner test does not qualify a real ClamAV deployment.

The superseded code-only CI44262837623 was cancelled after the cost-only commit replaced its head. Completed CI1 failed as described above. Completed CI2 is https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/actions/runs/44265177806 ; required quality job134690976631 succeeds. No raw tokens, signed URLs, diagnostics or uninspected screenshot archive are published.
