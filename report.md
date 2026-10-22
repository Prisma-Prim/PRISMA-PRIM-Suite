# PR #795 — validation after merge

**Status: six requested commands completed with exit code 0 on the actual merged tree.**

This is self-reported **post-merge** validation. It does not replace, extend or retroactively validate the earlier pre-merge integration evidence. It is not canonical `verify-local` output or a GitHub Actions attestation.

- Actual merged commit: `98a6135ee8f38aead7438e3606b1264fb441cd15`
- Actual parent: `0b87cb91da0f9384bc12f942cb65e047a73dfa42`
- Actual tree: `6796b9cb0fd04c6e96f37ae170cec20e579ef67e`
- Checkout: `/workspace/work/postmerge-795`
- Checks UTC: 2026-10-22T19:51:07.907002Z to 2026-10-22T19:53:05.497102Z
- Final Git status: clean; final commit and tree unchanged.

The coordinator detected that another documentation PR was merged between the last pre-merge validation and the merge API call. Therefore the final tree differs from the previously validated integration. The commands below were deliberately executed against the resulting merged commit in a new detached checkout, without altering `origin/main`, manufacturing a base, calling `verify-local` on an empty diff, or changing the earlier integration checkout.

## Executed commands

| Command | Started UTC | Finished UTC | Duration | Exit |
| --- | --- | --- | ---: | ---: |
| `node scripts/agent-doctor.mjs` | 2026-10-22T19:51:07.907184Z | 2026-10-22T19:51:08.489002Z | 0.58 s | 0 |
| `pnpm format:check` | 2026-10-22T19:51:08.489659Z | 2026-10-22T19:51:38.281601Z | 29.79 s | 0 |
| `pnpm lint` | 2026-10-22T19:51:38.282075Z | 2026-10-22T19:52:00.905979Z | 22.62 s | 0 |
| `pnpm typecheck` | 2026-10-22T19:52:00.906696Z | 2026-10-22T19:52:25.037216Z | 24.13 s | 0 |
| `pnpm test:scripts` | 2026-10-22T19:52:25.038171Z | 2026-10-22T19:52:58.251479Z | 33.21 s | 0 |
| `pnpm --filter @prisma-prim/api exec vitest run src/demonstration` | 2026-10-22T19:52:58.252420Z | 2026-10-22T19:53:05.495893Z | 7.24 s | 0 |

Result detail: doctor, formatting, lint and strict type checks passed. The script suite reports **446 passed, 0 failed, 0 skipped**. The documentation API command reports **48 passed and 35 skipped**, across 8 passed and 2 skipped files. Those skipped PostgreSQL-dependent cases were not executed and are not reported as passed. No PostgreSQL/browser/packaging family was requested or run for this direct six-command follow-up.

## Setup and boundaries

`pnpm install --frozen-lockfile` ran successfully in the new checkout with the exact existing pnpm 11.20.0 launcher and independent root/API/web module metadata. It reused 562 packages from the existing content store and downloaded none; pnpm reported 11.4 s. No module directory links to another checkout were used. No lockfile or tracked file was changed.

Selected settings:

```text
PATH prefix=/workspace/prisma-cloud-tools/node_modules/.bin
PNPM_HOME=/workspace/work/merge-runtime-pnpm795
PLAYWRIGHT_BROWSERS_PATH=/workspace/prisma-cloud-tools/browsers
CI=true
REQUIRE_ACCESS_POSTGRES=true
REQUIRE_COMPANY_POSTGRES=true
REQUIRE_CLIENT_POSTGRES=true
```

Inherited environment names were filtered to the canonical runner allowlist, retaining applicable path/temp/proxy/CA selectors privately. Dependency validation retained its normal default; no separate store/cache override was supplied. Execution used the supported tool permission profile `with_additional_permissions` with `network.enabled=true`; no denied subprocess result was ignored.

Machine-readable argv, UTC timestamps, exits and log hashes are in `checks-record.json`; setup is separately recorded in `install-record.json`. The raw command logs are preserved alongside them. No review, GitHub write or additional merge was performed by this validation agent.
