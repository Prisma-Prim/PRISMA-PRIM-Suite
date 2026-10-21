Local verification: **failed** (complete).
Scope: complete — Complete verification required: documentation-only eligibility was not proven by scripts/ci-change-scope.mjs (#730).

Self-reported local execution; no GitHub runner attestation.

Source: `fbc54ca93cd6ee3af3e4465b85a5287938948f7a`
Base: `4fa112c6e47c3af5942269adaeb03d96a850c05d`
Tested integration tree: `ac9263ddd35a59ba34a05d9d1fe7090b2d29892d`
UTC: 2026-10-21T05:27:32.374Z — 2026-10-21T05:31:29.519Z

| Family | Result | Exit | Process cap (min) | Exact argv |
| --- | --- | --- | --- | --- |
| doctor | passed | 0 | 45 | `["node","scripts/agent-doctor.mjs","--profile","web-postgres"]` |
| format | passed | 0 | 45 | `["pnpm","format:check"]` |
| lint | passed | 0 | 45 | `["pnpm","lint"]` |
| types | passed | 0 | 45 | `["pnpm","typecheck"]` |
| scripts | failed | 1 | 45 | `["pnpm","test:scripts"]` |
| documentation | unexecuted | — | 45 | `["pnpm","--filter","@prisma-prim/api","exec","vitest","run","src/demonstration"]` |
| api-parallel | unexecuted | — | 270 | `["pnpm","--filter","@prisma-prim/api","test:parallel","--maxWorkers=2"]` |
| api-serial | unexecuted | — | 45 | `["pnpm","--filter","@prisma-prim/api","test:postgres:serial"]` |
| web-unit | unexecuted | — | 45 | `["pnpm","--filter","@prisma-prim/web","exec","vitest","run","--maxWorkers=2"]` |
| browser | unexecuted | — | 270 | `["node","scripts/verify-local-browser.mjs","browser","--output","/workspace/work/local-ci-transition/full-integration-fbc54ca-20261021-01"]` |
| acceptance | unexecuted | — | 180 | `["node","scripts/verify-local-browser.mjs","acceptance","--output","/workspace/work/local-ci-transition/full-integration-fbc54ca-20261021-01"]` |
| acceptance-evidence | unexecuted | — | 45 | `["node","scripts/verify-acceptance-evidence.mjs"]` |
| build | unexecuted | — | 45 | `["pnpm","build"]` |
| railway-types | unexecuted | — | 45 | `["pnpm","--dir",".railway","typecheck"]` |
| railway-tests | unexecuted | — | 45 | `["pnpm","--dir",".railway","test"]` |
| packaging | unexecuted | — | 45 | `["bash","scripts/railway-packaging-smoke.sh"]` |

Browser/acceptance use fresh local prebuilds before Playwright. Browser build argv: [pnpm, build, --mode, local-demo] in apps/web; acceptance first adds [pnpm, --filter, @prisma-prim/api, build] at the root. Preview argv: [pnpm, preview, --host, 127.0.0.1, --port, 4173] in apps/web. Exact build/test/preview argv, public environment, guarded input/output inventories and startup180s (guard+preview only) are recorded under local-browser/<family>/manifest.json. Child logs require operator selection before publication. The independent evidence probe remains mandatory after acceptance failure, without making the failed family pass.

These are process safety caps; scenario and assertion deadlines remain unchanged. API parallel/browser: 270 min = 2 x 3 x 45 min; acceptance: 180 min = 2 x 2 x 45 min; other families: 45 min. These conservative aggregate ceilings are not runtime benchmarks or business-test deadlines.

Configuration, exact argv, input hashes and artifact inventory: manifest.json.
Artifact publication: **not published by this command**. Attach the validated manifest and reviewed synthetic evidence archive to the PR's evidence release, then record actual asset URLs and digests in the PR.
