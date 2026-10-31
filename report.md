Local verification: **failed** (complete).
Scope: complete — Complete verification required: documentation-only eligibility was not proven by scripts/ci-change-scope.mjs (#730).

Self-reported local execution; no GitHub runner attestation.

Source: `9a4bc00adc0932d23f57c6250ab7b11ae954b028`
Base: `ecb7edf42e90a39d44bda2e01c2cc607ac1a4b4e`
Tested integration tree: `48b932bb2ace94acd17108516daa15690eaffdf5`
UTC: 2026-10-30T20:57:30.622Z — 2026-10-30T22:18:12.665Z

| Family | Result | Exit | Process cap (min) | Exact argv |
| --- | --- | --- | --- | --- |
| doctor | passed | 0 | 45 | `["node","scripts/agent-doctor.mjs","--profile","web-postgres"]` |
| format | passed | 0 | 45 | `["pnpm","format:check"]` |
| lint | passed | 0 | 45 | `["pnpm","lint"]` |
| types | passed | 0 | 45 | `["pnpm","typecheck"]` |
| scripts | passed | 0 | 45 | `["pnpm","test:scripts"]` |
| documentation | passed | 0 | 45 | `["pnpm","--filter","@prisma-prim/api","exec","vitest","run","src/demonstration"]` |
| api-parallel | passed | 0 | 270 | `["pnpm","--filter","@prisma-prim/api","test:parallel","--maxWorkers=1","--testTimeout=15000"]` |
| api-serial | passed | 0 | 45 | `["pnpm","--filter","@prisma-prim/api","test:postgres:serial","--testTimeout=15000"]` |
| web-unit | passed | 0 | 45 | `["pnpm","--filter","@prisma-prim/web","exec","vitest","run","--maxWorkers=2"]` |
| browser | passed | 0 | 270 | `["node","scripts/verify-local-browser.mjs","browser","--output","<verification-output>"]` |
| acceptance | passed | 0 | 180 | `["node","scripts/verify-local-browser.mjs","acceptance","--output","<verification-output>"]` |
| acceptance-evidence | passed | 0 | 45 | `["node","scripts/verify-acceptance-evidence.mjs"]` |
| build | passed | 0 | 45 | `["pnpm","build"]` |
| railway-types | passed | 0 | 45 | `["pnpm","--dir",".railway","typecheck"]` |
| railway-tests | passed | 0 | 45 | `["pnpm","--dir",".railway","test"]` |
| packaging | failed | 1 | 45 | `["bash","scripts/railway-packaging-smoke.sh"]` |

Browser/acceptance use fresh local prebuilds before Playwright. Browser build argv: [pnpm, build, --mode, local-demo] in apps/web; acceptance first adds [pnpm, --filter, @prisma-prim/api, build] at the root. Preview argv: [pnpm, preview, --host, 127.0.0.1, --port, 4173] in apps/web. Exact build/test/preview argv, public environment, guarded input/output inventories and startup180s (guard+preview only) are recorded under local-browser/<family>/manifest.json. Child logs require operator selection before publication. The independent evidence probe remains mandatory after acceptance failure, without making the failed family pass.

These are process safety caps, separate from test defaults. API parallel/browser: 270 min = 2 x 3 x 45 min; acceptance: 180 min = 2 x 2 x 45 min; other families: 45 min. These conservative aggregate ceilings are not runtime benchmarks or business-test deadlines. The fixed local API parallel/serial argv uses --testTimeout=15000; canonical API configuration and manual Actions retain the implicit 5000 ms default. A local pass does not establish completion within 5000 ms. Explicit test timeouts, hook and internal-command deadlines, all assertions, and browser/acceptance scenario budgets remain unchanged.

Configuration, exact argv, input hashes and artifact inventory: manifest.json.
Artifact publication: **not published by this command**. Attach the validated manifest and reviewed synthetic evidence archive to the PR's evidence release, then record actual asset URLs and digests in the PR.
