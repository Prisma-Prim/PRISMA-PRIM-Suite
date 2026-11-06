# MVP capability grid

- **Status:** Non-canonical tracking artifact — not a PRD; it approves no scope, price, clause or acceptance decision
- **Owner:** Dan Popescu
- **Delivery:** [#1071](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1071); recorded coverage statements live on the commercial tracker [#290](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/290)
- **Data:** [mvp-capability-grid.csv](mvp-capability-grid.csv)
- **Answer:** run `node scripts/mvp-progress.mjs`

The official MVP grid measures **functional coverage**, not effort or remaining time: 19 modules and 71 capabilities, all weighted equally (operational base 38, commerce 24, finalization 9). A capability counts only when it is complete and integrated; an enrichment of a capability that already counts adds no point, and unverified production gets no credit. Post-MVP rows (Google and messaging, audits and certification, finance, archives and search, AI and knowledge) are outside the total. Changing the denominator needs an explicit owner decision.

Until this file, the grid existed only in a Codex conversation and in local HTML sheets, which name the 19 modules and their sizes but not each capability. The capability names reconstruct each module description into its listed items, so that every module total matches the 2026-09-24 sheet. They are this repository's wording; renaming one changes no id.

## Columns

| Column            | Meaning                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `id`              | Stable capability id: module code and number, for example `OF-3`                                         |
| `module`, `group` | One of the 19 modules and its group: `operational base`, `commerce` or `finalization`                    |
| `capability`      | Short English name of the capability                                                                     |
| `delivery_issues` | GitHub issue numbers that deliver it, separated by `;`; empty when `unmapped`                            |
| `status_rule`     | `closed-completed`: delivered when every listed issue is closed as completed; otherwise pending          |
|                   | `unmapped`: no issue is evidenced, so the row stays pending until the owner assigns issues or a decision |

An issue that is open, closed as not planned or as a duplicate, missing, or a pull request keeps its capability pending. The script reads states from GitHub through `gh`; set `GH_TOKEN` when nobody is signed in. It only reads.

## How rows were mapped

Rows follow the per-merge evidence in the 2026-09-26 coordination map, the Codex progression sheet, tracker #290 and its comments, and the later progress notes on #51. Nothing is guessed.

- A pull request cited as evidence is replaced by the issue it closes. For example `#42` is issue `#21`, and `#525` is issue `#522`.
- Issues the sources mark as enrichment of an already counted capability are not listed (for example Client contact preferences #372 or Task priority #375), so the rule cannot be blocked by work that never earned a point.
- One issue may serve several rows when the sources credit it that way, such as #418 for CA-1, CA-2 and CA-4, or #281 for TE-1 and UI-3.
- DO-5 lists the issues behind the Offer, Contract, Precontract and Addendum representations that tracker #290 names as its recognized evidence.
- EN-4 (Company isolation) is cross-cutting and was proven slice by slice; its row shares #67 with EN-2, and the script cannot test the isolation itself.

## Rows left unmapped

These stay pending in the report. The owner decides; the issues named here are candidates found in the sources, not a mapping.

| Row  | Why it is unmapped                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-2 | The sources cite an unlisted series of Prisme `[UX]` issues (#231–#271) plus the acceptance proof #281; they do not say which issues complete "real screens"              |
| UI-4 | Localization children (for example #447, #622, #703) are partial; tracker #290 says they do not credit UI-4 alone, and no completion criterion is recorded                |
| TE-3 | Needs the actual business trial with Iurie; no issue exists                                                                                                               |
| CF-2 | Credited by an audit recognition of delivered Template and Clause identities, with documentation PR #569 that closes no issue; no source attributes it to specific issues |
| MP-1 | Configured deployment; #523 prepares credential-free Railway packaging and, per #290, authorizes no live deployment                                                       |
| MP-2 | Tested restoration; #736 is a synthetic isolated restore that #51 records as no production credit                                                                         |
| MP-3 | Supervision and an exercised incident procedure; #738 detects local web and API liveness and, per #51, infers no production incident policy                               |

Dated coverage statements, with their evidence, stay on #290 and #51. A difference between the count printed here and a figure recorded there comes from rows listed above or from issues reopened since.
