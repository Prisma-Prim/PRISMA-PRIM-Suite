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

## Rows verified against the code on 2026-11-06

- **UI-2 (Real screens)**: `ApplicationRoot.tsx` keeps `/ui-baseline` as a separate lazy route, and no production file imports its synthetic data. `App.tsx` mounts the API-backed sections (clients, projects, documents, requests with offers and contracts, pricing, catalogue, tasks, access, activity). `operational-foundation.acceptance.spec.ts` (#281) and `commercial-journey.acceptance.spec.ts` exercise them through the real API and PostgreSQL at desktop and narrow widths. The row lists the closed Prisme `[UX]` screen issues.
- **CF-2 (Identified provisional templates)**: illustrative Offer, Contract with Clauses, Addendum and Precontract template versions are bound by migrations 0044, 0053, 0060 and 0062 and labelled "(unapproved)" in their outputs. The row lists the issues that delivered them.
- **UI-4 (Translation and business vocabulary)**: all 105 message catalogs of the `.copy.ts` modules have their keys in ro, ru, fr and en. The completion criterion is the unchecked whole-production four-locale acceptance item on #56 (audit A02 on #51), so the row waits for #56. The shared required-key check discovers every such catalog automatically and fails for a catalog its module keeps private ([#1085](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1085)), and `client/ClientUnionPanel.tsx` has no English-only copy left. Known remaining work: the real desktop and 390 px journey audit in the four locales; Iurie has not yet confirmed the Romanian and Russian business terms.

## Rows left unmapped

These stay pending in the report. Each needs a production or client action, not more code.

| Row  | Verified state on 2026-11-06                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TE-3 | No recorded business trial with Iurie; the pilot-evaluation runs are synthetic. Needs a hosted application (MP-1) and Iurie's time |
| MP-1 | No live deployment: Railway configuration is prepared (#523, `railway-activation.md`), GitHub records no deployment                |
| MP-2 | Restoration is proven only on a synthetic database (#736); no production backup exists before MP-1                                 |
| MP-3 | `scripts/monitor-liveness.mjs` (#738) checks local liveness only; no alert channel, incident owner or exercised procedure          |

Dated coverage statements, with their evidence, stay on #290 and #51. A difference between the count printed here and a figure recorded there comes from rows listed above or from issues reopened since.
