Local verification: **failed** (complete).
Scope: docs_only — Documentation-only change proven by scripts/ci-change-scope.mjs (#730): only root AGENTS.md and docs/**/*.md differ from the current base integration.

Self-reported local execution; no GitHub runner attestation.

Source: `7e6787fc72f462c04893aa5f8cbcd6b9d9e99a17`
Base: `72482d3c642a6cc7fd0403db064348226bb34718`
Tested integration tree: `5420636b90af91e13355b3e178fab2815a7a2bc5`
UTC: 2026-10-22T18:51:08.668Z — 2026-10-22T18:51:12.295Z

| Family | Result | Exit | Process cap (min) | Exact argv |
| --- | --- | --- | --- | --- |
| doctor | passed | 0 | 45 | `["node","scripts/agent-doctor.mjs"]` |
| format | failed | 1 | 45 | `["pnpm","format:check"]` |
| lint | unexecuted | — | 45 | `["pnpm","lint"]` |
| types | unexecuted | — | 45 | `["pnpm","typecheck"]` |
| scripts | unexecuted | — | 45 | `["pnpm","test:scripts"]` |
| documentation | unexecuted | — | 45 | `["pnpm","--filter","@prisma-prim/api","exec","vitest","run","src/demonstration"]` |
| api-parallel | not_required | — | 270 | `["pnpm","--filter","@prisma-prim/api","test:parallel","--maxWorkers=1","--testTimeout=15000"]` |
| api-serial | not_required | — | 45 | `["pnpm","--filter","@prisma-prim/api","test:postgres:serial","--testTimeout=15000"]` |
| web-unit | not_required | — | 45 | `["pnpm","--filter","@prisma-prim/web","exec","vitest","run","--maxWorkers=2"]` |
| browser | not_required | — | 270 | `["node","scripts/verify-local-browser.mjs","browser","--output","/workspace/work/635/integration-evidence-profile"]` |
| acceptance | not_required | — | 180 | `["node","scripts/verify-local-browser.mjs","acceptance","--output","/workspace/work/635/integration-evidence-profile"]` |
| acceptance-evidence | not_required | — | 45 | `["node","scripts/verify-acceptance-evidence.mjs"]` |
| build | not_required | — | 45 | `["pnpm","build"]` |
| railway-types | not_required | — | 45 | `["pnpm","--dir",".railway","typecheck"]` |
| railway-tests | not_required | — | 45 | `["pnpm","--dir",".railway","test"]` |
| packaging | not_required | — | 45 | `["bash","scripts/railway-packaging-smoke.sh"]` |

Browser/acceptance use fresh local prebuilds before Playwright. Browser build argv: [pnpm, build, --mode, local-demo] in apps/web; acceptance first adds [pnpm, --filter, @prisma-prim/api, build] at the root. Preview argv: [pnpm, preview, --host, 127.0.0.1, --port, 4173] in apps/web. Exact build/test/preview argv, public environment, guarded input/output inventories and startup180s (guard+preview only) are recorded under local-browser/<family>/manifest.json. Child logs require operator selection before publication. The independent evidence probe remains mandatory after acceptance failure, without making the failed family pass.

These are process safety caps, separate from test defaults. API parallel/browser: 270 min = 2 x 3 x 45 min; acceptance: 180 min = 2 x 2 x 45 min; other families: 45 min. These conservative aggregate ceilings are not runtime benchmarks or business-test deadlines. The fixed local API parallel/serial argv uses --testTimeout=15000; canonical API configuration and manual Actions retain the implicit 5000 ms default. A local pass does not establish completion within 5000 ms. Explicit test timeouts, hook and internal-command deadlines, all assertions, and browser/acceptance scenario budgets remain unchanged.

Configuration, exact argv, input hashes and artifact inventory: manifest.json.
Artifact publication: **not published by this command**. Attach the validated manifest and reviewed synthetic evidence archive to the PR's evidence release, then record actual asset URLs and digests in the PR.
