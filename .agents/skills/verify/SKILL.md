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

3. Read the last stdout line, a JSON summary also saved as `summary.json` in the [private persistent evidence directory](../../../docs/agents/private-verification-evidence.md#local-synthetic-journeys-and-public-evidence). It holds each run's status, failing tests, screenshots, traces and logs. Open the relevant synthetic screenshots before citing them; keep raw diagnostics private.

| Exit | Meaning                                                    | Next                                                                                                                         |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0    | Every run passed                                           | Cite the summary and the screenshots you inspected.                                                                          |
| 1    | A test failed                                              | Read the run's `playwright.log` and the failing test's `error-context.md` beside its screenshot; a person can open the trace. |
| 2    | Usage error                                                | The message lists the journeys and flags.                                                                                    |
| 3    | Could not run: database, build, server start or interrupt | Read `message` and the log it names; fix the environment, not the test.                                                      |

To reproduce an intermittent race, add `--repeat N` (stops at the first failing run) and `--cpu-load` (one busy thread per CPU, or `--cpu-load=THREADS`). `--output DIR` chooses a new private evidence directory outside Git. Run directories have unique IDs; journey execution still needs exclusive use of its fixed ports.

To replay a nightly UI chaos failure ([#1376](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1376)), run the command it printed, `pnpm verify:journey <journey> --chaos <seed>`. The seed fixes the response delays, the slowed CPU, the double submits and the back navigation; `--chaos random` draws a seed. Only a journey that imports `test` from `./ui-chaos.fixture` accepts it. With `--repeat`, each run gets its own seed, recorded in `summary.json`; `--budget-minutes M` starts no run that would end after M minutes.
