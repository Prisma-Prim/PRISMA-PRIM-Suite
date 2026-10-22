# AI agent environment contract

This document is the canonical repository environment contract. Product-specific services, variables, and secrets still belong to their owning issue and must not be guessed or committed.

Last validated: 2026-09-03.

## Canonical baseline

| Concern      | Contract                                                | Source of truth                         |
| ------------ | ------------------------------------------------------- | --------------------------------------- |
| Node.js      | `>=24.0.0 <25.0.0`                                      | root `package.json` and `.node-version` |
| pnpm         | `11.20.0`                                               | root `packageManager` and lockfile      |
| Dependencies | `pnpm install --frozen-lockfile`                        | `pnpm-lock.yaml`                        |
| Browser      | on demand and in CI; excluded from standard Codex setup | `@prisma-prim/web` and CI               |
| Database     | on demand locally; PostgreSQL 17 in CI                  | profile scripts and CI workflow         |
| CI           | Ubuntu 24.04, Node 24, pnpm 11.20.0, PostgreSQL 17      | `.github/workflows/ci.yml`              |

Run the zero-dependency diagnostic after setup:

```bash
node scripts/agent-doctor.mjs
```

The profiles are composable:

```bash
# Node, pnpm, workspace, lockfile, and dependencies
node scripts/agent-doctor.mjs

# Base checks plus safe PostgreSQL variables and real connectivity
node scripts/agent-doctor.mjs --profile postgres

# Base checks plus Playwright Chromium
node scripts/agent-doctor.mjs --profile web

# Browser and PostgreSQL checks together
node scripts/agent-doctor.mjs --profile web-postgres
```

Use `postgres` for ordinary backend or persistent-data work. Use `web` only when browser execution is required and `web-postgres` only when the same task genuinely needs both. The doctor rejects missing, remote, shared, query-overridden, or non-`_test` destructive database targets before opening a connection. Its read-only connectivity probe records the PostgreSQL server version and whether the current role is superuser or has `CREATEDB`; it never migrates, creates, drops, or truncates data.

Canonical CI selects the standard public `ubuntu-24.04` runner explicitly. The
pinned Playwright release supports that OS; `ubuntu-latest` may advance to an
unsupported OS and change the Docker toolchain. A runner change requires proving
browser installation, production packaging and every existing verification family
on the proposed environment, with image-integrity checks preserved.

The shared CI setup reuses that runner's Chromium system libraries without
running APT. It caches Playwright browser downloads by Ubuntu release, runner OS,
architecture and the resolved Playwright version. The ordinary Chromium install
command fills a cold or incomplete cache and is a no-op when the matching browser
is present. Playwright's host checks remain enabled; the doctor and both browser
families still run.
CI API and acceptance jobs mount only their disposable PostgreSQL data directory
on a 2 GiB tmpfs. PostgreSQL durability settings remain at their defaults; the
mount disappears with the container. Production packaging and local managed
PostgreSQL retain their existing storage behavior.

## Verification commands

CI PostgreSQL services and Railway packaging use Docker Official Images from
[Docker's Amazon ECR Public publisher](https://gallery.ecr.aws/docker). Readable
version tags are pinned to immutable multi-platform index digests in the workflow,
Dockerfiles and packaging smoke script. This avoids Docker Hub's unauthenticated
image/token endpoints for these checks while retaining the existing image versions.
ECR Public remains an external dependency with its own availability and rate
limits; acquiring an image does not prove that packaging or the complete verification gate executed.

`pnpm verify` remains a broader development check: formatting, lint, type-check, unit/script suites and production build. PostgreSQL-backed API suites can skip there without a safe local `_test` target, and it does not include every browser/packaging family. Targeted checks and `pnpm verify:docs` support iteration; publication and merge require the [complete local integration evidence gate](issue-execution.md#complete-local-integration-evidence), including safe PostgreSQL, Chromium and real packaging when the canonical change classifier requires those families. The complete GitHub workflow is available through explicit manual dispatch when independent verification is requested; never report an unexecuted workflow as passed.

Narrow seams for targeted runs:

```bash
pnpm test:access:postgres          # Access, assignment, suspension, and membership REST suites
pnpm test:company:postgres         # Company REST and idempotency suites
pnpm test:client:postgres          # Client dossier REST suite
pnpm test:preflight:postgres-smoke # one cross-Workspace REST smoke suite
pnpm test:preflight:migration      # migration from the previous committed schema
pnpm test:preflight:playwright     # one production-shell journey on desktop and narrow viewports
```

## Codex Cloud environment

Configure the repository environment in [Codex settings](https://chatgpt.com/codex/settings/environments).

### Package version

Keep the `universal` image. The repository pins Node 24 through `.node-version` and `package.json`, and the setup doctor rejects runtime drift. If the package-version selector exposes Node 24, selecting it is valid but not required; do not choose a different major or add an inline runtime bootstrap.

### Standard environment variables

No profile requires Codex environment variables. Do not configure `DATABASE_URL` or `TEST_DATABASE_URL` in the environment settings; the PostgreSQL profile below provides them. If they remain from an earlier configuration, remove them.

### Setup script

```bash
bash scripts/codex-cloud-setup.sh
```

Setup activates the exact repository pnpm version, installs the frozen dependency graph with the local package cache preferred, and runs the base doctor. It installs neither PostgreSQL nor Chromium and reports each phase duration.

### Maintenance script

```bash
bash scripts/codex-cloud-maintenance.sh
```

Maintenance runs when Codex resumes a cached container. It rechecks pnpm, compares a fingerprint of every workspace dependency manifest, runs `pnpm install` only when that fingerprint changed, and reruns the base doctor. The legacy `scripts/setup-codex-cloud.sh` and `scripts/maintain-codex-cloud.sh` names are compatibility wrappers only; do not configure new environments with them.

### pnpm launcher

The Cloud lifecycle scripts run pnpm through `bash scripts/agent-pnpm.sh`. The launcher uses the exact `packageManager` version and, when the container launcher drifts, downloads that version into the ignored private `.pnpm-home/` directory. Use the same launcher in any other harness whose `pnpm --version` differs from the root pin; it never runs `corepack enable`, activates a system-global version, or installs a global npm package.

### Isolated worktrees and dependency reuse (#635)

This optional POSIX profile is for agents on the **same machine** with an already
qualified primary installation. It does not provision tools or grant network,
filesystem, PostgreSQL or browser permissions. The ordinary isolated frozen
installation remains the default when any reuse prerequisite is uncertain.

Before linking dependencies, the coordinator and author must establish:

- The primary checkout and new worktree start at the same commit, with no staged
  or unstaged tracked changes. The primary installation was prepared by a successful
  `pnpm install --frozen-lockfile` for those actual inputs. A directory's presence,
  a warm store or a successful doctor alone does not prove that installation.
- Both use the repository's exact Node/pnpm contract, verified through the normal
  launcher and doctor. Reuse the environment's installed launcher on `PATH`;
  never substitute another version or install globally.
- Neither checkout has additional untracked dependency inputs or different local
  pnpm configuration. Compare the actual workspace manifests, lockfiles,
  `pnpm-workspace.yaml`, `.node-version`, `.npmrc`, pnpm hooks and patches, including
  additions/deletions. Do not print configuration credentials. Unknown inputs or
  a changed dependency graph require the isolated-install route below.
- The primary owner freezes its installation and dependency inputs for the full
  reuse period. No consumer may run install, add, update, remove, rebuild, lifecycle
  preparation or other dependency-mutating commands through the shared links.
  **Even `pnpm add --lockfile-only` can rewrite shared module metadata and shims.**
  Stop all consumers and detach their links before the owner changes the primary
  graph. Changes to product source alone do not require a dependency reinstall.

Use absolute paths for the two existing checkouts. In this example,
`task_primary` and `task_worktree` are operator-selected paths, not provider defaults.
First confirm the same clean starting revision with `git -C PATH status --short`
and `git -C PATH rev-parse HEAD` for each checkout. Resolve any unexpected entries
before proceeding. From a fresh worktree with **all three destinations absent**:

```bash
# Set these to the existing, verified checkouts before running this block.
test -n "${task_primary:-}" && test -n "${task_worktree:-}" || exit 1
for task_package in . apps/api apps/web; do
  test -d "$task_primary/$task_package/node_modules" || exit 1
  test ! -e "$task_worktree/$task_package/node_modules" || exit 1
  test ! -L "$task_worktree/$task_package/node_modules" || exit 1
done
for task_package in . apps/api apps/web; do
  ln -s "$task_primary/$task_package/node_modules" \
    "$task_worktree/$task_package/node_modules" || exit 1
done
```

Do not remove or replace an existing dependency directory to make this recipe
fit. If linking fails partway, inspect and unlink only the links this operation
created. The separate `.railway` package needs its own frozen installation when
the complete gate requires it; these three links do not prepare packaging.

Give each author a private writable runtime directory outside tracked source for
`PNPM_HOME`, `npm_config_cache` and `pnpm_config_cache_dir`; keep the installed
exact pnpm launcher on `PATH`. If browser work is required, set
`PLAYWRIGHT_BROWSERS_PATH` to the environment's already installed matching browser
cache, then run the matching doctor. A private pnpm home/cache does **not** isolate
module metadata behind shared links. Do not change `HOME`, credentials, inherited
proxy settings or CA trust, and do not promise offline installation from a cache
whose package contents have not been verified.

Before **each** command using the linked graph, confirm that its dependency inputs
still match the frozen primary. Only for that verified reuse, scope pnpm 11's
dependency-status setting to the individual invocation, including subprocesses:

```bash
pnpm_config_verify_deps_before_run=false node scripts/agent-doctor.mjs --profile web
pnpm_config_verify_deps_before_run=false pnpm --filter @prisma-prim/web exec vitest run
```

Use the lower-case `pnpm_config_` spelling; `npm_config_` is not equivalent here.
Do not export this setting, persist it in configuration or use it for changed
manifests/lockfiles. It prevents pnpm's automatic pre-command installation on the
verified shared graph; it neither validates that graph nor waives any check.
Use the selected harness's supported execution permissions for actual browser
and subprocess checks. A denied probe is not evidence of a missing executable.

**Dependency changes or uncertain provenance:** stop this worktree's consumers
before any dependency-changing command. Inspect each `node_modules` link and
verify its exact intended primary target, then `unlink` only those three owned
links. Never run recursive removal through them or use `CI=true` to authorize
pnpm to replace their shared target. Preserve unexpected directories for diagnosis.
Install independent root/API/web module directories from this worktree's actual
inputs with ordinary dependency validation enabled:

```bash
# Run at the detached worktree root, with no shared node_modules links.
pnpm install --frozen-lockfile --store-dir "$task_store"
node scripts/agent-doctor.mjs --profile web
```

Set `task_store` explicitly to a permitted content-addressable store; an approved
shared package store may reuse package bytes while each checkout owns its module
metadata, links and shims. Do not rely on a legacy cache variable to select it.
Prepare a changed lockfile only after detaching, through the normal isolated
dependency-change workflow, then qualify its frozen installation. Use `--offline`
only when all required packages are actually present; a cache miss is a setup
blocker, not a reason to alter the lockfile or another author's installation.
If links or shims were already rewritten, stop affected consumers and let the
primary owner restore its original frozen graph before anyone resumes. Record
the original failure and recovery separately; required tests and the complete
integration gate remain unchanged.

### PostgreSQL profile

Do not select this profile in Codex Cloud. Provisioning succeeds there — the setup script installs PostgreSQL 17 and the `postgres` doctor passes entirely in about a minute — but the platform then holds the task until `Startup script timed out after 3600 seconds`, with container caching enabled and with it disabled. Issue #216 records the measurements and the hypotheses already eliminated; reopen that investigation before selecting the profile again. Codex Cloud environments run the base lifecycle scripts, and the PostgreSQL-backed suites are proven by the local Docker loop and by GitHub Actions.

The profile is supported in a harness that can install and start a service itself, such as Codex CLI or Claude Code on Linux:

```bash
# Setup
bash scripts/codex-cloud-setup.sh --profile postgres

# Maintenance
bash scripts/codex-cloud-maintenance.sh --profile postgres
```

It installs the `postgresql-17` package from the PGDG apt repository, starts the Debian `main` cluster on `127.0.0.1:5432`, creates the `prisma_prim` role and both databases idempotently, proves the application connection over TCP, exports the two targets for agent shells, and runs the `postgres` doctor. Resumes restart the cluster and recreate missing databases without reinstalling packages. Any PostgreSQL 17.x release is accepted; CI pins the official `postgres:17-alpine` image from ECR Public as described above.

The profile exports both isolated targets itself, into `~/.config/prisma-prim/postgres-runtime.sh` sourced by the agent shell. Never define `DATABASE_URL` or `TEST_DATABASE_URL` as Codex environment variables: on 2026-09-04 every environment variable defined in the Codex environment settings made the container fail before the setup script ran. The exported credentials belong only to the isolated task container; never replace either URL with a shared, remote, staging, or production database.

### Managed-harness PostgreSQL fallback

Native PostgreSQL remains the supported path when the harness can install and start it. When native service setup is unavailable but a POSIX/Linux harness permits Docker, run the repository verification inside one disposable PostgreSQL lifecycle:

```bash
node scripts/managed-postgres.mjs -- corepack pnpm test:unit
```

The runner creates uniquely named, labelled Docker network and volume resources outside the checkout, waits on container health, creates both local databases, applies the reviewed Drizzle migrations to a pristine development database, and injects safe temporary `DATABASE_URL` and `TEST_DATABASE_URL` values into the requested command. It keeps cache and temporary state outside the checkout, and removes the exact container, network, volume, and temporary directory on success, failure, or interruption. Safe descendant termination relies on POSIX process groups, so Windows users must use native PostgreSQL or a POSIX/Linux Docker harness. A Docker socket denied by the harness sandbox is a permission-policy failure; use the native path or a harness with Docker permission rather than weakening database verification.

Some hosted command boundaries virtualize spawned process identifiers and do not expose the detached child through `/proc` or deliver the normal child lifecycle events. The process-group integration tests run a capability probe first and skip only the real detached-child cases when those semantics are unavailable; deterministic injected tests still cover TERM-to-KILL escalation. A capability skip is honest missing local coverage, and does not make the managed runner safe in that harness. Use native PostgreSQL or another capable local harness to execute these cases. Explicitly request manual GitHub Actions when independent real POSIX process-group coverage is needed, and confirm that the cases executed. A skipped process-group case is not an executed pass.

### Browser tests

The standard Codex Cloud environment does not install Chromium. Its `pnpm verify` development result therefore does not establish the complete gate. Use a harness with Chromium and the required database/packaging prerequisites for complete local verification.

Do not try to download Chromium during the agent phase: agent Internet access is intentionally disabled. If repeated agent-side browser execution becomes necessary, create a separate browser-specific Codex environment whose setup phase installs Chromium, or use another harness where Chromium is already available. Local browser runs must preserve the synthetic evidence as required by the execution guide. Explicitly requested manual GitHub runs provide separate runner evidence; ordinary PR publication does not start them. Keep browser setup out of the standard environment.

### Network and credentials

- Keep agent-phase Internet access off.
- Do not add a GitHub PAT or another long-lived credential.
- Setup uses its temporary network access only for package and operating-system installation.

This follows the [official OpenAI Cloud environment contract](https://learn.chatgpt.com/docs/environments/cloud-environment): package versions can be pinned in settings, environment variables persist for the whole task, setup and maintenance are distinct cache lifecycle steps, and changing environment configuration normally invalidates the cache.

### Cache reset

Use **Reset cache** only when:

- maintenance reports missing cached dependencies;
- a package-version change cannot be activated from the cached image;
- repository changes add a new system-level prerequisite for the selected profile;
- setup, maintenance, or environment values changed but automatic invalidation did not occur.

After changing the standard environment, launch a fresh issue task and require `node scripts/agent-doctor.mjs` to pass before implementation. Keep the base profile on both Codex Cloud lifecycle scripts, and use `--profile postgres`, `--profile web`, or `--profile web-postgres` only in a harness that provides the corresponding service.

## Local and other harnesses

1. Install a Node version satisfying the root engine.
2. Activate the exact pnpm version declared by `packageManager`; use `bash scripts/agent-pnpm.sh` when the harness launcher drifts.
3. Install dependencies from the lockfile.
4. Install Playwright Chromium when browser tests are required.
5. Start an isolated local PostgreSQL instance and set explicit development and `_test` URLs when database tests are required.
6. Run the matching doctor profile before implementation.

On Ubuntu or WSL2 with systemd, the same PGDG package gives a local PostgreSQL 17 in a few minutes:

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt-get update && sudo apt-get install -y postgresql-17
sudo systemctl enable --now postgresql
sudo -u postgres psql -c "CREATE ROLE prisma_prim LOGIN PASSWORD 'prisma_prim' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE prisma_prim_dev OWNER prisma_prim;" -c "CREATE DATABASE prisma_prim_test OWNER prisma_prim;"
```

Then set `DATABASE_URL` and `TEST_DATABASE_URL` to the two `127.0.0.1` targets shown above and run `node scripts/agent-doctor.mjs --profile postgres`.

Claude Code reads the root `CLAUDE.md`, which imports `AGENTS.md`. Harnesses that discover neither file automatically must be explicitly prompted to read `AGENTS.md` and `docs/agents/issue-execution.md`.

## Capability matrix

| Harness         | Local files and tests        | Git branch/commit            | Push/PR                         | CI visibility                | Merge                                                   |
| --------------- | ---------------------------- | ---------------------------- | ------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Codex Cloud     | Yes, isolated cloud checkout | Usually yes                  | Yes when GitHub is connected    | Task-dependent               | Only with applicable explicit or standing authorization |
| Codex CLI       | Yes                          | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Claude Code     | Yes                          | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Generic harness | Must be verified             | Must be verified             | Must be verified                | Must be verified             | Never assume                                            |

A harness that cannot run the local checks required by the issue may draft issues, documentation, and reviews; it must not publish code.

## Updating this contract

Keep this file aligned with `package.json`, the versioned Codex scripts, and CI. Record observed drift in the pull request's [environment friction note](environment-friction.md). Changes to secrets, permissions, network policy, or hosted environments require a separate reviewed decision or `agent-friction` issue unless explicitly in scope.
