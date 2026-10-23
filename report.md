Local verification: **passed** (complete).
Scope: docs_only — Documentation-only change proven by scripts/ci-change-scope.mjs (#730): only root AGENTS.md and docs/**/*.md differ from the current base integration.

Self-reported local execution; no GitHub runner attestation.

Source: `e220aca5c5be7c5bc215ca07b6c6de2dc1e83ce3`
Base: `b9799c1713d8b9e8d5228b7627c3300b53815617`
Tested integration tree: `96dd0c4f2599a2b38be2b470bb5d09a74224b0eb`
UTC: 2026-10-23T13:21:13.020Z — 2026-10-23T13:22:56.270Z

| Family | Result | Exit | Process cap (min) | Exact argv |
| --- | --- | --- | --- | --- |
| doctor | passed | 0 | 45 | `["node","scripts/agent-doctor.mjs"]` |
| format | passed | 0 | 45 | `["pnpm","format:check"]` |
| lint | passed | 0 | 45 | `["pnpm","lint"]` |
| types | passed | 0 | 45 | `["pnpm","typecheck"]` |
| scripts | passed | 0 | 45 | `["pnpm","test:scripts"]` |
| documentation | passed | 0 | 45 | `["pnpm","--filter","@prisma-prim/api","exec","vitest","run","src/demonstration"]` |
| api-parallel | not_required | — | 270 | `["pnpm","--filter","@prisma-prim/api","test:parallel","--maxWorkers=1","--testTimeout=15000"]` |
| api-serial | not_required | — | 45 | `["pnpm","--filter","@prisma-prim/api","test:postgres:serial","--testTimeout=15000"]` |
| web-unit | not_required | — | 45 | `["pnpm","--filter","@prisma-prim/web","exec","vitest","run","--maxWorkers=2"]` |
| browser | not_required | — | 270 | `["node","scripts/verify-local-browser.mjs","browser","--output","/workspace/work/issue815/final-evidence"]` |
| acceptance | not_required | — | 180 | `["node","scripts/verify-local-browser.mjs","acceptance","--output","/workspace/work/issue815/final-evidence"]` |
| acceptance-evidence | not_required | — | 45 | `["node","scripts/verify-acceptance-evidence.mjs"]` |
| build | not_required | — | 45 | `["pnpm","build"]` |
| railway-types | not_required | — | 45 | `["pnpm","--dir",".railway","typecheck"]` |
| railway-tests | not_required | — | 45 | `["pnpm","--dir",".railway","test"]` |
| packaging | not_required | — | 45 | `["bash","scripts/railway-packaging-smoke.sh"]` |

Browser/acceptance use fresh local prebuilds before Playwright. Browser build argv: [pnpm, build, --mode, local-demo] in apps/web; acceptance first adds [pnpm, --filter, @prisma-prim/api, build] at the root. Preview argv: [pnpm, preview, --host, 127.0.0.1, --port, 4173] in apps/web. Exact build/test/preview argv, public environment, guarded input/output inventories and startup180s (guard+preview only) are recorded under local-browser/<family>/manifest.json. Child logs require operator selection before publication. The independent evidence probe remains mandatory after acceptance failure, without making the failed family pass.

These are process safety caps, separate from test defaults. API parallel/browser: 270 min = 2 x 3 x 45 min; acceptance: 180 min = 2 x 2 x 45 min; other families: 45 min. These conservative aggregate ceilings are not runtime benchmarks or business-test deadlines. The fixed local API parallel/serial argv uses --testTimeout=15000; canonical API configuration and manual Actions retain the implicit 5000 ms default. A local pass does not establish completion within 5000 ms. Explicit test timeouts, hook and internal-command deadlines, all assertions, and browser/acceptance scenario budgets remain unchanged.

Configuration, exact argv, input hashes and artifact inventory: manifest.json.
Artifact publication: **not published by this command**. Attach the validated manifest and reviewed synthetic evidence archive to the PR's evidence release, then record actual asset URLs and digests in the PR.
