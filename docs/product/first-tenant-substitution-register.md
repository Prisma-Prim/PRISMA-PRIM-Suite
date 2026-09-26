# First-tenant substitution register

**Status:** Non-canonical index — owners are the linked PRD rows  
**Owner:** Dan Popescu  
**Data:** [first-tenant-substitution-register.csv](first-tenant-substitution-register.csv)  
**Introduced by:** [#409](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/409), under [Platform PRD section 17](platform-security-reliability-operations-prd.md#17-approved-provisional-demonstration-data-409)

The register lists every stand-in that the MVP uses in place of first-tenant configuration or documents: what the application shows now, who owns that provisional choice, what Iurie must supply, and how the real value replaces the stand-in. It restates no rule. Each row links to the PRD section or row that owns the choice, or to the issue while that section is unmerged. The register owns only the request to Iurie, the expected format, the substitution path and his recorded decision.

## Columns

| Column              | Meaning                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                | Stable row identifier, `SUB-<area>-<nn>`                                                                     |
| `area`, `item`      | The configuration or document concerned                                                                      |
| `mvp_stand_in`      | What the MVP uses now                                                                                        |
| `owner_link`        | The owning PRD section or row; an issue only while that section is unmerged; several links are `;`-separated |
| `where_visible`     | Where the stand-in appears in the demonstration                                                              |
| `seed_key`          | The demonstration scenario steps that create the stand-in, `;`-separated, or empty                           |
| `real_input_needed` | What must replace the stand-in                                                                               |
| `request_ro`        | The linked question-bank items, condensed in Romanian; empty when no question-bank item exists               |
| `format`            | The expected form of the material                                                                            |
| `evidence_refs`     | Question-bank IDs with their coverage state, kept exactly as the coverage matrix records them                |
| `substitution_path` | How the real value replaces the stand-in without rewriting history                                           |
| `blocks_real_use`   | `Yes: …` when the stand-in blocks real use, otherwise `No: …`                                                |
| `decision`          | Empty, `ACCEPTED`, `ACCEPTED_WITH_CORRECTIONS`, `REJECTED` or `POSTPONED`                                    |
| `decision_ref`      | The evidence issue comment that records the decision; empty while undecided                                  |

The decision vocabulary follows the candidate, non-canonical Sarcina criterion AC-UNIVERSAL-03 (row M01-AC13 of the [traceability CSV](sarcina-v1-traceability.csv)): « acceptat, acceptat cu corectări, respins sau amânat ».

## Rules

- A row changes in the pull request that changes its owner. A new provisional choice adds its row; a merged owning section replaces an issue link.
- Iurie's decisions are recorded first on a trial evidence issue, then copied into `decision` and `decision_ref` by a documentation pull request. An accepted or corrected row is resolved only when a focused issue amends its owning PRD row.
- Real materials go to Dan through a controlled channel and never into Git. Client examples are anonymized, and no password, signing secret, private key or bulk Client archive is ever sent by chat or email ([decision record 22.6](consolidated-product-decision-record.md#226-access-oversight-and-representative-evidence)).
- Rows whose `seed_key` names demonstration steps are checked against the scenario by `apps/api/src/demonstration/demonstration-register.test.ts`.

## Materials checklist

Condensed from the evidence lists of the [question bank](iurie-business-question-bank-ro.md) and decision record 22.6:

1. Tariff tables per Company: service, unit, amount, currency, VAT and validity.
2. Five worked price calculations, anonymized.
3. The Offer template of each Company and two negotiated versions of one Offer, anonymized.
4. Contract templates (ordinary, exceptional, Addendum and Precontract), anonymized, with the approved clause texts.
5. Offer and Contract numbering rules per Company and year.
6. A data sheet per Company: legal data, VAT status, bank account, logo and signatories.
7. The users by Company and responsibility, the approvers and the thresholds.
8. Three to five Project categories, each with one anonymized example and its required Tasks.
9. The Document families, who declares an official version, and the storage and archive rules.
10. The first three home actions per role and the meaning of late and urgent.
11. The Romanian and Russian terms list.

Outside the MVP and not indexed here: Release 2 Google accounts, Release 4 accreditation, Release 5 finance and Release 6 migration.
