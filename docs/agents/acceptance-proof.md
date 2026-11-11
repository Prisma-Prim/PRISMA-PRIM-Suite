# Acceptance proof

**Status:** Approved process (owner decision, 2026-11-11, [#1275](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1275))  
**Owner:** Dan Popescu  
**Enforced by:** `scripts/verify-acceptance-proof.mjs` in the required CI `quality` check ([#1276](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1276))

Read this when you write the **Acceptance proof** section of a pull request, or when the check fails. [Issue execution](issue-execution.md) owns the rest of delivery.

## The rule

Every pull request carries the Acceptance proof section of the [pull request template](../../.github/pull_request_template.md). It has one row per acceptance criterion of each issue the pull request closes. A pull request that closes no issue, such as a quick fix or a dependency bump, lists its own claims as criteria, at least one row. The check blocks the merge when a criterion has no row, or when a cited test is absent from the suite, failed or was skipped in the same CI run.

## Row format

| Column           | Content                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion        | The criterion number in the issue's "Acceptance criteria" list, `#<issue>.<number>` when the pull request closes several issues, or the claim |
| Kind             | `UI`, `behaviour`, `bug fix`, `refactor`, `docs` or `tooling`                                                                                 |
| Functional proof | One or more tests, each in its own code span, as `<file> :: <test title>` or a whole test file; docs and tooling rows may cite a command      |
| Visual proof     | An acceptance journey test, `apps/web/e2e/<journey>.acceptance.spec.ts :: <test title>`, or "—" when the kind needs none                      |

The file is the one CI reports for the test, usually the `*.test.*` or `*.spec.*` file. The title is the test's own title, or its full title, describe blocks first, separated by `>` with a space on each side. A whole file proves a row when at least one of its tests passed and none failed.

The proof matches the row's kind.

| Kind          | Functional proof                                                                                            | Visual proof                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| UI            | The test that exercises the criterion                                                                       | An acceptance journey that passed with desktop and narrow screenshots you inspected |
| behaviour     | The test that exercises the criterion in the API, a business rule or a script                               | None                                                                                |
| bug fix       | The regression test, plus one `Red-green:` line stating that it failed before the fix and passes after it   | None, unless the bug was visible                                                    |
| refactor      | One "Behaviour unchanged" row citing the existing suites that cover the changed code and passed in this run | None, unless the rendering changes                                                  |
| docs, tooling | A test or a command, such as `node scripts/validate-repository-docs.mjs`                                    | None                                                                                |

"Not applicable" is accepted only with its reason, for example "Not applicable: the criterion is an owner setting", and as functional proof only for documentation or tooling.

A pull request that changes web UI source needs at least one row with visual proof. Web UI source is `apps/web/index.html`, `apps/web/public/**` and `apps/web/src/**`, except tests, test fixtures, test support and Markdown. CI keeps a final screenshot of every acceptance journey at both widths in the browser evidence artifact; inspect the ones you cite.

## What the check reads

Each test job writes its results to a JSON file and uploads it on pull requests: script tests, the API parts, Web unit, the browser shards and the acceptance shards. The check also reads the current pull request body, its changed files and comments, and the issues it closes, through the GitHub API with read-only access. When CI reuses the API results of an earlier run with identical backend inputs, the check can only confirm that a cited API test is present in the source, and its output says so.

## Exception

An exception covers one pull request. An authorized approver posts a comment on it that states `Acceptance proof exception: <reason>`, and the section's `Exception:` line links that comment. The repository variable `PROOF_EXCEPTION_APPROVERS` lists the approvers' logins, separated by commas, initially the owner only. Without it, every exception fails. The check output records the exception, its reason and its link, with the findings it waived.

## Rerun

Editing the body or posting a comment does not start CI. The check reads the current body and comments when it runs, so rerun the failed `quality` job with `gh run rerun <run-id> --failed` or "Re-run failed jobs" on the run page. A merge group passes the check with a message, because its pull requests already passed their own `quality`.

## No automatic Claude

The check is a deterministic script. No workflow, comment, label, schedule or webhook may start Claude to produce or review proof. The session the owner launched to implement the issue produces the proof, itself or through a session it delegates to.

## Demonstration

`node scripts/verify-acceptance-proof.mjs --fixture scripts/fixtures/acceptance-proof/cases/missing-row` rejects a body that skips a criterion. The `complete` case next to it passes. Both read committed fixture results instead of GitHub.
