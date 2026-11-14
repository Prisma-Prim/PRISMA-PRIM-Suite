---
name: verify
description: Run one acceptance journey on a fresh database and get its screenshots and traces. Use before claiming a UI or API behaviour works, or to reproduce a flaky acceptance test.
---

# Verify one journey

A **journey** is one `apps/web/e2e/<journey>.acceptance.spec.ts`; `pnpm verify:journey --list` names them all.

1. Pick the journey that exercises the behaviour. Given a screen or a screenshot, find its section in the [journey map](../journey-audit/journey-map.md#sections), then a journey whose Access cell walks it.
2. Run it against PostgreSQL:
   - Codex Cloud or Linux: `node scripts/managed-postgres.mjs -- pnpm verify:journey <journey>`.
   - Windows, or a server you already run: export `TEST_DATABASE_URL` for a loopback `*_test` database (a disposable `postgres:17` container works), then `pnpm verify:journey <journey>`.

   The command rebuilds `apps/api/dist` and `apps/web/dist`, then runs the journey at the desktop and narrow projects, each run on a new isolated database. Run one at a time: the preview and API ports are fixed.

3. Read the last stdout line, a JSON summary also saved as `summary.json` in the evidence directory (default `apps/web/test-results/journeys/<journey>-<UTC time>/`). It holds each run's status, failing tests, screenshots, traces and logs. Open the relevant screenshots before you cite them as evidence.

| Exit | Meaning                                                    | Next                                                                                                                         |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0    | Every run passed                                           | Cite the summary and the screenshots you inspected.                                                                          |
| 1    | A test failed                                              | Read the run's `playwright.log` and the failing test's `error-context.md` beside its screenshot; a person can open the trace. |
| 2    | Usage error                                                | The message lists the journeys and flags.                                                                                    |
| 3    | Could not run: database, build, server start or interrupt | Read `message` and the log it names; fix the environment, not the test.                                                      |

To reproduce an intermittent race, add `--repeat N` (stops at the first failing run) and `--cpu-load` (one busy thread per CPU, or `--cpu-load=THREADS`). `--output DIR` chooses a new evidence directory.
