# Recoverable native document intake — fictional proof

Issue [#1454](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1454), code `dbffb9c3c79518563f1a72704b9df93afea6681b`, qualified tree `393abb837eed6482fcc0441d152069e264afceac`. These four original App captures were inspected before publication. They show Romanian desktop (1440 × 900 viewport) and Russian narrow (390 × 844 viewport); element captures may be taller than the viewport. Image hashes, timing and native original identifiers/checksums are in [proof.json](proof.json).

| State | Romanian desktop | Russian narrow |
| --- | --- | --- |
| Partial failure, all six items retained, deliberately paused | [Paused](desktop-ro-paused.png) | [Paused](narrow-ru-paused.png) |
| Reopened, exact original reselected, resumed and deliberately completed | [Completed](desktop-ro-completed.png) | [Completed](narrow-ru-completed.png) |

The real App/API/PostgreSQL journey passed at both widths without retries or skips. Six items remain accounted for: three exact originals preserved and selected, one structurally unreadable Word file left aside with its native draft retained, one duplicate deliberately left aside and one unsupported file excluded. Each preserved original is downloaded through the public native endpoint and compared byte-for-byte; the PDF retains one upload-history receipt. A transport-only connection reset exercises reopening and reselecting, including refusal of the wrong bytes. Native REST separately proves recovery after a committed PDF's checkpoint acknowledgement fails at the real database boundary.

Final focused checks passed:10 native tests,20 rendered tests and19 OpenAPI tests. The affected native run passed631 tests, timed out on4 and skipped its separately configured real ClamAV integration; the4 timed-out tests then passed serially (68 others intentionally filtered). The affected Web run passed399 tests and exposed2 outdated negative fixtures after the new generic family chooser; the corrected11-test invoice file and the9-test intake file passed together. [attempts.json](attempts.json) retains earlier browser outcomes and limits. These overlapping runs are not added together as distinct tests.

Independent Standards review found0 material findings. Spec review found3 P2 defects (unreadable selection accounting, native inventory visibility and editable rejected admission); public RED→GREEN regressions and both reviewers' bounded follow-ups verified all3 fixes. A later visible stale history label was corrected and separately verified.

All identities, Companies, Clients, originals and addresses are fictional fixtures. Identity and scan acceptance use existing deterministic external test protocols. This proof establishes neither real private-corpus accuracy nor live identity/scanning, account eligibility, OCR quality, deployment or professional approval. Every incoming source stays a working draft. No raw diagnostic log, trace, secret or private document is published.
