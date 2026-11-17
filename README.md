# Certification journey audit — 17 November 2026

**Audit completed with one confirmed P1: [#1439](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1439). The intended journey cannot be completed entirely through the interface.** The first team selector omits the existing authorized auditor. One explicitly recorded public API team proposal allowed the downstream interface to be examined.

Report: [#1438](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1438). Tested source: [`b14c45c0ab7a7f540df9d1aa3ccc50a0bbc6ac94`](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/tree/b14c45c0ab7a7f540df9d1aa3ccc50a0bbc6ac94). This dedicated evidence branch contains reviewed fictional proof and no application changes.

## Open the proof

- [Romanian desktop journey — 75 viewport captures, 50 documented steps](gallery-desktop.md)
- [Russian narrow journey — 75 viewport captures, 50 documented steps](gallery-narrow.md)
- [Lost acknowledgement and concurrent-edit warnings — 8 additional viewport captures](gallery-resilience.md)
- [Canonical acceptance states — 16 region captures](gallery-baseline.md)
- [Romanian register PDF](desktop/dossier-register-ro.pdf) and [Russian register PDF](narrow/dossier-register-ru.pdf)
- [All ten reviewed register page previews](pdf-preview/README.md)
- [Sanitized run results](run-results.json), [attempt history](run-history.md), [file hashes](SHA256SUMS)

## Role and viewport coverage

| Role | Desktop 1440×900 / Romanian | Narrow 390×844 / Russian |
| --- | --- | --- |
| Programme manager — Ada | Walked; first-team membership selector blocked | Walked; same blocker |
| Auditor/team leader — Ion | Walked after explicit API team checkpoint; self-approval/review/decision controls absent | Same |
| Independent approver — Workspace Owner | Team approval, dossier review, decision, draft approval, issuance and revision | Same |
| Reader — Commercial Reader | Completed Case, no write forms, register download, locale smoke | Same |
| Other Company member | Company absent in UI selector; known and absent Case reads both identical 403 | Same |

The five-role × two-viewport table describes the specified paths, not every permission permutation of the entire application. Remaining locales were checked on the completed reader release screen, rather than repeating all forms in French and English.

## What was exercised

The new driver seeded only prerequisites through public APIs: fictional Company and grants, Client, Legal Entity, Project, and twelve exact synthetic PDF Document Versions. It created the Case and entered the application through the interface, with Romanian/Cyrillic text and both audit languages. It then attached sources, explicitly answered the four application review criteria, computed and confirmed duration, recorded the signed agreement, and exposed the first-team selector blocker.

After the recorded team-proposal checkpoint, interface actions covered independent team approval, Stage 1/2 planning and reports, one major nonconformity with exact evidence, client correction/cause/action plan, adequacy judgment, effectiveness verification, team recommendation, client-agreed certificate data, independent checklist review and decision, draft transmission record, received client-opinion exchange, agreement, independent draft approval, issuance, transmission record, revision and revision transmission record. This scenario uses one category-qualified leader and a major nonconformity; it supplements the canonical PRD fixture.

Controlled browser-boundary faults verified loading, unavailable read and recovery, an actual committed POST with lost acknowledgement and unchanged-key retry, and stale correction from two real UI tabs. The first save still had exactly one immutable application version. The second tab's correction won; the first tab received 409, retained its draft and disabled another save until explicit reload.

Both final Cases were certified with `DEMO-0001`, decision/validity start `2026-11-17`, validity end `2029-11-16`, first surveillance deadline `2027-11-17`, revision index 1. The actual downloaded five-page registers passed native text/font/geometry inspection, an independent text comparison for these facts, the finding clause and Cyrillic text, and visual review of all pages. Zero page-level horizontal overflows were measured at the 150 full-09 capture points; no page errors were recorded. This does not prove every possible content length or browser is free from layout defects.

The existing canonical suite additionally exercised discrepancy correction/acceptance, deadline states, re-verification items, missing decision preconditions, requested draft changes, skipped opinion and an unmarked revision. These cases passed at both widths; their API-seeded setup is distinguished in the canonical gallery.

## Result and boundaries

The baseline passed 2/2, the final extended driver passed 2/2, and the focused warning-capture run passed 2/2, with no skipped or flaky tests in the final two runs. **The audit verdict is still fail because #1439 prevents continuous UI completion.** Passing assertions that record a known blocker do not erase it. Earlier failed/partial attempts remain in the attempt history.

Every person, Company, address, document and business value in this bundle is fictional, created for this audit. The snapshots were inspected before publication. Request headers, credentials, traces, raw diagnostics, private environment files and throwaway driver source are excluded. No real dossier was anonymized or uploaded.

This public audit does not qualify the real private pilot, real authentication/provider sign-in, AI/OCR extraction, real e-mail delivery, surveillance/recertification, every rejection branch, accessibility conformance, performance under document volume or exhaustive application correctness. “Sent” means a recorded fictional exchange, not an external message sent by this audit. No merge or deployment was performed.

## Verification cost

Audit window: 2026-11-17 16:06:22–17:06:53 UTC (3,631 seconds of elapsed session time, including baseline, driver iterations and visual review). The canonical baseline took 308 recorded seconds and is included within this window; do not add the two durations. The final extended browser run took 201.809 seconds and the focused resilience run 39.8 seconds. Token counts, model and subscription price were not reported by the harness; no cost is invented. [Audit ledger record](cost/codex-cloud-1438-certification-audit-20261117.json); [baseline record](cost/codex-cloud-1438-certification-baseline-20261117.json).

## Reproduction

On the pinned source in an isolated prepared checkout with the supported Cloud runtime, run:

```sh
node scripts/agent-doctor.mjs --profile web --readiness-profile cloud
node scripts/managed-postgres.mjs -- pnpm verify:journey certification-journey --output /tmp/certification-audit-baseline
```

The extended audit used the repository's documented `.agents/skills/journey-audit/audit-driver.md` with fresh public fixtures and a throwaway spec outside Git. Its observable steps, exact source, sanitized Case summaries, accessible snapshots, fixture/checkpoint boundaries and original captures are retained here; it is not a newly committed acceptance suite. The permanent regression belongs to #1439.
