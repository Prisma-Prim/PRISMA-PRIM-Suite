# Failed verification evidence for PR998 — never merge into product

This parentless ref publishes a small reviewed selection of **FAILED run002** for inspection. PR998 remains open and unmerged. It is self-reported local execution, not a GitHub runner attestation, successful validation or permission to merge.

Source: `9a4bc00adc0932d23f57c6250ab7b11ae954b028`  
Base: `ecb7edf42e90a39d44bda2e01c2cc607ac1a4b4e`  
Integration commit: `68c52f54b6fc408259c8d60b6c21e653ed063c19`  
Actual integration tree: `48b932bb2ace94acd17108516daa15690eaffdf5`

The run passed15 required families and failed packaging with actual managed outer exit1. PostgreSQL API:3639 passed plus one unchanged optional external ClamAV skip, then106 serial passed. Web:3989 passed. Browser:707 passed plus the existing desktop skip of the narrow-only navigation test. Real App/API/PostgreSQL acceptance:146 passed. Builds, Railway types/tests and the independent failure-artifact probe passed. Packaging built both images and passed its production PDF smoke, then failed creating a temporary directory during its first migration with ENOSPC. The earlier complete attempt's unchanged web-readiness failure remains retained separately; two failed complete runs pause further full reruns. Source, assertions and budgets were unchanged.

[Report](report.md), [manifest](manifest.json), [native result](native-result.json) and [terminal excerpt](packaging-terminal-excerpt.txt) are inspection evidence of failure. The report/manifest are explicitly sanitized copies: local absolute path prefixes use aliases and only the nonessential host kernel value is omitted. Original sizes and SHA256, precise transformations and selected-file hashes are in the [publication index](publication-index.json). All source/base/tree values,1968 input hashes, family results, argv flags, timings and artifact hashes remain intact. Complete canonical originals stay unchanged locally. These copies do not constitute a passing canonical validation.

## Selected images and limits

Exactly seven original PNGs were actually viewed and SHA-bound to this failed run's2608 canonical artifacts; the complete originals remain local. This is a selection, not every screenshot, trace or log.

- Desktop/narrow Client-to-Document navigation, Version/PDF history and content-denial captures come from the registered real App/API/disposable-PostgreSQL acceptance journey using synthetic local-demo identities/data, not live Clerk. They show rendering only. The native ten-case REST/PostgreSQL saturation tests are the primary family-policy/pre-limit proof; pixels do not establish that predicate.
- The narrow navigation and history images retain a visible focused **Skip to content** link overlapping part of the heading or purpose. No zero-occlusion or fully visible-text claim is made. The narrow denial image has no such overlap. No image was retouched or regenerated.
- `captures/probe/test-failed-1.png` shows the white synthetic **Client evidence probe** fixture page. Its deliberate child failure is expected; the independent probe family passed after checking the context, PNG, trace and sanitized request timeline. This is artifact-retention proof, not a product acceptance failure or a Document/PG/privacy proof. Raw traces and verbose diagnostic logs are omitted from this publication.

The separate source-qualified author-preparation supplement is omitted to keep this failure inspection focused; its public handoff remains on issue995. The previously rejected long web diagnostic is absent.

No full retry, source change, gate waiver, issue closure or merge follows this publication. More storage capacity is an external prerequisite; a larger starting margin is only a planning target until an unchanged targeted packaging check and capacity measurement demonstrate restoration. A later full run must be fresh on the then-current base, without API-result reuse.

Keep this failed evidence while the PR/review needs it and at least14 days after any later merge. Delete only its owned evidence ref when retention permits. Never merge, rebase or cherry-pick it into product/source history.
