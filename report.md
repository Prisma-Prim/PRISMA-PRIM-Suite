# Bounded execution evidence for PR #859

**Not a canonical passing verify-local report. An explicit owner exception is required to merge using this packet.**

Source: `e1aca077e83c56f4c34155909808dcdefb72ebdc`  
Base: `c3a1f249180379569e01f18e238ca7d111c798d4`  
Integration tree: `cad9047b5aff8c2abdd0e4e238914420e2370c5e`

The original complete run executed fifteen successful families, then packaging failed with exit 102 because Docker VFS exhausted the 32 GiB volume. Final manifest writing also failed; its artifact array is truncated. The original failed bytes and all complete top-level values are retained separately without changing their status. No original failure is relabeled.

Original successful behavioral results: API 3,312 + 106 passed (one optional ClamAV integration skipped); web 3,177 passed in 195 files; browser 707 passed with one configured skip; actual App/API/PostgreSQL acceptance 116 passed. The independent failure-evidence probe, real builds and Railway types/tests also passed in that original run.

| Original family | Original result | Original exit | Original exact argv |
| --- | --- | --- | --- |
| doctor | passed | 0 | `["node", "scripts/agent-doctor.mjs", "--profile", "web-postgres"]` |
| format | passed | 0 | `["pnpm", "format:check"]` |
| lint | passed | 0 | `["pnpm", "lint"]` |
| types | passed | 0 | `["pnpm", "typecheck"]` |
| scripts | passed | 0 | `["pnpm", "test:scripts"]` |
| documentation | passed | 0 | `["pnpm", "--filter", "@prisma-prim/api", "exec", "vitest", "run", "src/demonstration"]` |
| api-parallel | passed | 0 | `["pnpm", "--filter", "@prisma-prim/api", "test:parallel", "--maxWorkers=1", "--testTimeout=15000"]` |
| api-serial | passed | 0 | `["pnpm", "--filter", "@prisma-prim/api", "test:postgres:serial", "--testTimeout=15000"]` |
| web-unit | passed | 0 | `["pnpm", "--filter", "@prisma-prim/web", "exec", "vitest", "run", "--maxWorkers=2"]` |
| browser | passed | 0 | `["node", "scripts/verify-local-browser.mjs", "browser", "--output", "/workspace/work/integrate859-verification-20261026-6"]` |
| acceptance | passed | 0 | `["node", "scripts/verify-local-browser.mjs", "acceptance", "--output", "/workspace/work/integrate859-verification-20261026-6"]` |
| acceptance-evidence | passed | 0 | `["node", "scripts/verify-acceptance-evidence.mjs"]` |
| build | passed | 0 | `["pnpm", "build"]` |
| railway-types | passed | 0 | `["pnpm", "--dir", ".railway", "typecheck"]` |
| railway-tests | passed | 0 | `["pnpm", "--dir", ".railway", "test"]` |
| packaging | failed | 102 | `["bash", "scripts/railway-packaging-smoke.sh"]` |

After restoration, the same owned packaging command was executed successfully using the original inherited-name allowlist and exact fixed overrides. Source/head/base/tree and all 1703 original tracked input hashes matched before and after this targeted execution. No source, assertion, timeout, skip or Dockerfile override changed. The command passed image startup, hosting ports, health, direct SPA navigation, production identity refusal and repeatable migrations. Actual UTC: 2026-10-26T19:37:07.325205+00:00 to 2026-10-26T19:37:59.650300+00:00; exit 0. Its actual record and complete selected log are included.

Storage restoration removed only unused Docker build cache older than one hour and a generated duplicate whose complete retained evidence was verified byte-identical. All 2,387 current synthetic browser/acceptance/probe artifacts remain retained locally and were copied/hash-verified; two inspected navigation screenshots are selected here. Complete unselected logs and artifacts remain private; selected summaries include their original log hashes. This is self-reported local execution, not independent GitHub CI.

The repository ordinarily requires a single validated complete canonical gate with no API reuse. This combined record DOES NOT satisfy that rule and cannot be passed to the canonical validator as success. A fresh canonical run continues independently. An owner may expressly allow this bounded exception only for the exact unchanged source/base/tree above; a later base/head/input change requires a new assessment. Review disposition remains in the PR.
