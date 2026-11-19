# Native Document and Project/Task action sequences

Issue [#1447](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1447) adds the missing Project/Task adapter to the existing `fast-check` browser runner. The delivered Document Version, Document PDF and PaymentEvidence adapters remain in use. Generated Document Version/PDF runs now settle in Romanian on desktop and Russian on narrow screens. Existing deterministic Document assertions are retained.

## Reproduce

Use the repository's supported Node/pnpm and native PostgreSQL/browser environment:

```sh
node scripts/managed-postgres.mjs -- pnpm verify:journey project-task-action-sequences
node scripts/managed-postgres.mjs -- pnpm verify:journey document-action-sequences
```

The existing runner defaults remain two generated trials, at most ten actions each and a 60-second exploration budget per case/width. Manual recipes have the existing 150-second test bound. Nightly and manual dispatch use the same workflow: the new seventh journey joins the existing matrix without increasing its job, exploration or repetition bounds. Normal PR verification calls no model or external service.

## Expected outcomes

The independent oracle reads native Task details/history, Project next-action history and unrelated Project Task inventories. It checks exact literal instructions, actor attribution, revisions and immutable scope/title/assignment/status/priority/date fields. It does not derive expected text from the server response under test.

| Action                                | Required observation                                                                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent Project read/write        | The Task draft survives; only the Project's next-action revision changes on its write.                                                                      |
| Lost Task receipt and duplicate retry | The same body and key are retried; one committed edit and one native history entry result.                                                                  |
| Confirmed Task write, failed refresh  | A fresh read recovers it without another write.                                                                                                             |
| Concurrent Task revision              | The conflict preserves the literal draft until deliberate reload; no automatic resubmission.                                                                |
| Held token, HTTP or parser completion | Project navigation preserves its cached draft; Company/access replacement consumes the old authority. Old completions never change another Project's draft. |
| Navigation and locale change          | Exact instructions, line breaks, leading zeroes, markup-like text and Unicode survive.                                                                      |

Project switching intentionally leaves the old Project's cached Task reader alive under its own owner. It may finish into that cache. Company replacement consumes its scope. The access recipe keeps Company A selected, revokes Task Manager and Next Action Coordinator, submits a native next-action write that is refused with 403, and observes the real current-actor response without those grants. It releases the old continuation only after that Actor is published, preserving an independent Project-registration draft and withholding old Task data. The token case also proves no retired Task HTTP request starts. Grants and Company context are restored only afterward. The curated recipe covers every token/parser/HTTP × Project/Company/access combination. Delayed old Task 403 replies are scheduled transport perturbations; the next-action refusal is native. Generated exploration reports only the actions it actually selected.

Fixtures create fictional Companies, Clients, Projects, Tasks and grants through native authenticated API commands. Browser actions use actual controls against the real API and PostgreSQL. Local demonstration identities, transport loss/503/403 scheduling and token/parser holds are test boundaries. No production identity provider or paid account is qualified.

## Failure sensitivity and evidence

On 2026-11-18, removing only the Task edit body's `description` member from `ProjectTasks.tsx` made generated and manual cases fail at both widths. Seed `1422001` selected a single lost-receipt save; the retained assertion showed the omitted literal instructions in the actual PATCH body. Both generated reports retained the original action, counterexample screenshot and replay path `0`. They report zero shrinks and no interruption: the generated example already contained one action. This is no claim that a larger counterexample was minimized.

The original product file is restored byte for byte before the exact replays:

```sh
UI_SEQUENCE_REPLAY='project-task@desktop~10~0' pnpm verify:journey project-task-action-sequences --chaos 1422001
UI_SEQUENCE_REPLAY='project-task@narrow~10~0' pnpm verify:journey project-task-action-sequences --chaos 1422001
```

The measured manifest beside this file retains commands, outcome summaries, selected action traces and source/file checksums. Full local Playwright traces stay under `/workspace/work/batch-20261118/evidence/`; CI retains fresh native browser evidence. Failed development runs remain visible: the first run exposed incomplete Task read readiness, and a later run installed the synthetic token gate after App bootstrap. The final adapter uses the existing 15-second bounded API-idle observation for the sequential listing/detail/history/member read phase and installs the gate before bootstrap. Neither correction changes product code, deterministic assertions or runner budgets. Earlier replay coordinates precede the final action set and are identified as historical development evidence.

Independent review found one P2 coverage defect: the earlier access recipe changed Company and restored the grant before releasing the old read, so it proved Company disposal. A same-Company Project assertion failed at both widths before correction (two generated cases passed, both curated recipes failed). The corrected recipe above observes native access recovery before any Company change. One earlier attempt could not start because an interrupted browser left its preview process listening; that infrastructure outcome is retained separately and proves no behavior.

One reviewed-source run passed both curated recipes and the narrow generated case, but its desktop exploration reached 62.949 seconds and was interrupted by the unchanged 60-second budget. That attempt remains incomplete. An unchanged-source run subsequently passed all four cases with the default two generated trials per width; both exact controlled-defect replays also pass on the reviewed source. The timing variation's cause was not isolated, and these observations make no performance claim.

The final Project/Task recipe screenshots were inspected at 1440×900 and 390×844: literal instructions and before/after history remain readable, Romanian/Russian controls render correctly, and the page has no horizontal overflow. Synthetic sources establish regression behavior, not completion of all #1420 migrations, real-client usefulness or production qualification. Programme #1443 forbids merging this delivery to main or deploying it.

## CI catalogue correction

The first PR CI run, [44284755206](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/actions/runs/44284755206), rejected the missing journey-map row and expected chaos-spec list entry. Both registrations are now present. Project/Overview navigation clicks the actual sidebar list links. A native check exposed an ambiguous Overview selector that also matched the brand link; scoping it to the navigation list corrects the test. The runner still checks every settled state; the curated recipe explicitly does the same. Duplicate verification inside settlement and a redundant locale reset were removed without changing assertions or time bounds.

Three attempted navigation checks omitted the managed browser activation and failed before Chromium launched. They remain environment failures, not product observations. The manifest records those attempts, the ambiguous-selector failure and the subsequent activated native run/replays with their respective source hashes. Earlier reviewed-source results retain the earlier adapter hashes.

The unambiguous-navigation attempt passed every generated state assertion and both curated recipes, but the generated cases were interrupted at 65.943/60.127 seconds. Its Playwright trace showed repeated default locator-assertion backoff waiting about 2.9 seconds for ready Task controls/headings. Those readiness conditions now poll every 100 ms, with the same assertion timeout; native read-phase idle checks keep their 500 ms quiet interval and 15-second deadline. No action, state assertion, generated trial/step, transport perturbation or exploration bound is removed. Earlier interrupted evidence remains incomplete.

The activated final run (`1447-prompt-readiness-native`) passes all four cases. Default generated exploration completes two trials at each width in 56.335 seconds on desktop and 50.538 seconds on narrow. These are observed prepared-example timings, not a throughput or production-capacity claim. Both final curated screenshots were inspected again.
