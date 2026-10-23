# PR #824 / issue #823 — final pre-merge verification

D1 is implemented: an explicitly authorized preparer can save and reopen a complete illustrative Contract before its transmitted Offer receives a Client response. An explicit same-party successor preserves exact source Versions and history. Fresh checks still require explicit acceptance of the exact current Offer before independent approval and existing simulated execution. No real customer data or operational legal model is introduced.

## Source and integration

- Source: `6257ccb2a9dbcc81774253fb09a2182d54f9a10b`.
- Fresh main/base: `ad120bda711482a532bd16fd997bc6010919bd66`.
- Clean exact source/proposed integration tree: `ba077638bcb22f656068612265cb60dd22df3f85`; base is an ancestor.
- [Complete public GitHub CI40021532772](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/actions/runs/40021532772): completed, success; all16jobs successful, including10executed API/web/browser/acceptance test steps, build, packaging and quality. Five part-artifact uploads, quality download and aggregate upload succeeded. Actual provider metadata and immutable artifact links/digests are retained alongside this report.
- The [owner-authorized queue route](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/747#issuecomment-6332942799) makes complete public CI the independent integration gate. This report is root validation, not a canonical local-gate or provider-authored attestation.

## Local checks and review

Doctor web-postgres9PASS, frozen dependency install, scoped format/lint/strict types PASS;53targeted PostgreSQL API/migration/legacy cases PASS (254filtered/skipped; local15s,one worker);178ContractPanel cases PASS;2registered actual-App/PostgreSQL journeys PASS, desktop1440/narrow390,52.1s. Assignment fixture correction:69unit cases and8keyboard/locale browser cases PASS at original timeouts; those eight use an intercepted App HTTP boundary and do not attest PostgreSQL/Clerk.

Broader `pnpm verify` originally exited1: format/lint/types,479scripts,2690parallelAPI and102serialAPI cases passed; web2931passed and one stale expected-label inventory failed, preventing build. The two already implemented expected labels were added; all21App cases, affected checks and full API/web build then passed. Original failed/partial outcomes remain preserved, not relabeled green. One optional disposable-real-ClamAV integration test could not run because TEST_CLAMAV_HOST/PORT are unconfigured; scanning code is unchanged.

Independent Standards then Spec found1+2blockers on61d189c: exact source identity, source-refusal recovery and preparation Template footer. One correction batch fixed all three. Single migration-sensitive confirmation on571a3e5 found0remaining blockers. Compared with that confirmed material, current source changes only App.test.tsx label expectations and the shared assignment test fixture. Root inspected both deltas; runtime, migration, permission, configuration and acceptance journey bytes remain identical. No duplicate review or post-CI review requested.

The first complete CI40019347342 failed because the strict assignment menu fixture omitted the newly approved role. That specific test-only correction passed69unit and8browser cases before the second complete run. Original failed metadata/artifacts remain linked in previous-ci-failure.json.

## Evidence provenance and limits

The complete GitHub artifacts are separately linked and their provider metadata/digests inspected. Their ZIPs could not be transferred locally: the network proxy returns403 and the connector file exceeds the executor32MiB limit. No local ZIP byte verification or locally extracted CI capture is claimed. The six selected PNGs under browser/ are visually inspected synthetic LOCAL actual-App/PostgreSQL acceptance-run7 captures: pending complete draft, explicit successor, executed/project-eligible state, each desktop/narrow. Production and the acceptance journey are byte-identical to current source. Private business originals and detailed SQL diagnostics are excluded.

## Demo and delivered boundary

Using synthetic Company/Client data, grant ordinary Contract preparation and source/identity read rights plus the separate Company Contract Early Preparation v1. In Client Requests, select an eligible approved/transmitted pending Offer and prepare the Contract. Open its exact representation, revise against the explicit current same-party source and reopen old Versions. Accept that exact Offer explicitly, rerun v3 checks, approve independently and use the existing simulated signature path.

Public interface: POST /api/contracts/opportunities/:opportunityId/preparation; existing Contract revision/history/representation and explicit assignment administration are extended. Additive Drizzle migrations0073/0074 add the early source/integrity/grant/v3 bindings without granting anybody or rewriting old Contract origins. No production migration or tenant/person activation is claimed.

Official numbering, actual sending/signing, real legal clauses, source imports and remaining #820 lots are deferred. No next issue has been started. Merge delivery will be confirmed separately against the actual main parent and exact tested tree.
