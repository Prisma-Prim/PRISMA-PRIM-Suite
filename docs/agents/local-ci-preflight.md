# Local PostgreSQL and browser preflight

Run the narrow preflight before deep review for a slice that crosses PostgreSQL,
migrations, or the browser:

```bash
pnpm preflight:local
```

The command checks the repository runtime, package manager, installed
dependencies, safe local PostgreSQL targets and connectivity, the immediately
previous migration state, and Playwright Chromium availability. When browser
execution is runnable, the smoke journey also proves that the configured web
server starts successfully. It never installs Docker, PostgreSQL, WSL, or a browser.

Each seam reports two independent facts:

- `RUNNABLE LOCALLY` or `BLOCKED LOCALLY WITH REASON` describes the current
  workstation.
- `LOCAL AND FULL CI` or `DELEGATED TO EARLY CI` identifies where authoritative
  evidence can be obtained.

For a normal run, exit code `0` means every seam ran successfully, `1` means a
runnable test failed, and `2` means at least one seam still needs delegated
evidence. `--check-only` has narrower planning semantics: it returns `0` when
every local blocker is recoverable by exact-head CI, and `2` only for an
intrinsic repository defect such as a missing lockfile, workspace manifest,
migration file, or prerequisite check. Delegation is not a PASS; the named
commit status must still succeed before delivery.

## Local guarantees

When the required tools are already available, the command runs:

```bash
pnpm test:preflight:postgres-smoke
pnpm test:preflight:migration
pnpm test:preflight:playwright
```

The PostgreSQL smoke command is destructive only against the isolated local
test database required by `agent-doctor` and covers a real cross-Workspace REST
setup. The migration command is independently runnable only when PostgreSQL is
version 13 or newer and the local role has `CREATEDB`, because its focused test
creates and forcibly removes an isolated database before migrating from the
immediately previous committed schema. The Playwright command starts the
configured preview server and executes one production-shell journey in both
desktop and narrow projects.

The full local suite remains available separately; the preflight is intentionally
small and does not duplicate lint, formatting, every unit test, every browser
journey, or production builds.

## Automatic Work mode and connector-compatible Early CI delegation

When Agent Doctor or this preflight delegates a seam, follow the canonical
[Work mode handoff path](environment.md#chatgpt-work-mode-pnpm-bootstrap).
Preserve the reported `handoff.action.marker` in the same-repository pull request
body. Connected GitHub interfaces can update that body without a local `gh`
executable. Apply the `early-ci` label to request an explicit retry; remove and
reapply it for another label-triggered run.

The GitHub Actions interface remains a fallback: run **Early CI preflight** for
the exact branch. With authenticated GitHub CLI access, the equivalent command
is:

```bash
gh workflow run early-ci.yml --ref <branch>
```

Both routes execute the same canonical package scripts as the local preflight
with PostgreSQL 17 and an explicitly installed Chromium. The workflow checks
out and verifies the requested commit before executing repository code. It is
advisory and does not replace normal pull-request CI or the final review gates.

## Work mode package-manager drift

If the hosted `pnpm --version` differs from root `packageManager`, run the
preflight through the repository launcher:

```bash
bash scripts/agent-pnpm.sh preflight:local --check-only
```

The launcher selects and verifies the pinned pnpm in an ignored, private
`.pnpm-home/` cache. Its first drift recovery needs package-network access; it
does not mutate a system-global Corepack or npm installation.

## CI-only guarantees

Normal CI remains authoritative for the complete lint, type-check, test, browser,
build, formatting, evidence-upload, and clean Linux runner guarantees. Operating
system behavior is not promised to be byte-for-byte identical locally.
