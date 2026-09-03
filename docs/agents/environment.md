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
| CI           | Ubuntu, Node 24, pnpm 11.20.0, PostgreSQL 17            | `.github/workflows/ci.yml`              |

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

## Verification commands

`pnpm verify` is the single pre-publication gate: formatting, lint, type-check, the unit and script suites, and the production build. PostgreSQL-backed API suites run inside it only when `TEST_DATABASE_URL` names a safe local `_test` database and skip otherwise. `pnpm test` adds the complete API suite and the Playwright journeys; GitHub Actions always runs it with PostgreSQL 17 and Chromium.

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

The standard Codex environment requires no database variables. Do not configure `DATABASE_URL` or `TEST_DATABASE_URL` there. If they remain from the former combined environment, remove them when applying this contract.

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

### Optional PostgreSQL environment

Create a separate Codex environment only when a task genuinely requires local PostgreSQL. Configure these ordinary environment variables in that DB-specific environment:

```text
DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_dev
TEST_DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_test
```

These credentials belong only to the isolated task container. Never replace either URL with a shared, remote, staging, or production database. Use the explicit PostgreSQL profile for both lifecycle scripts:

```bash
# Setup
bash scripts/codex-cloud-setup.sh --profile postgres

# Maintenance
bash scripts/codex-cloud-maintenance.sh --profile postgres
```

The PostgreSQL setup installs the `postgresql-17` package from the PGDG apt repository, starts the Debian `main` cluster on `127.0.0.1:5432`, creates the `prisma_prim` role and both databases idempotently, proves the application connection over TCP, and runs the `postgres` doctor. Cached resumes restart the cluster and recreate missing databases without reinstalling packages. Any PostgreSQL 17.x release is accepted; CI runs the current `postgres:17-alpine` image.

### Managed-harness PostgreSQL fallback

Native PostgreSQL remains the supported path when the harness can install and start it. When native service setup is unavailable but a POSIX/Linux harness permits Docker, run the repository verification inside one disposable PostgreSQL lifecycle:

```bash
node scripts/managed-postgres.mjs -- corepack pnpm test:unit
```

The runner creates uniquely named, labelled Docker network and volume resources outside the checkout, waits on container health, creates both local databases, applies the reviewed Drizzle migrations to a pristine development database, and injects safe temporary `DATABASE_URL` and `TEST_DATABASE_URL` values into the requested command. It keeps cache and temporary state outside the checkout, and removes the exact container, network, volume, and temporary directory on success, failure, or interruption. Safe descendant termination relies on POSIX process groups, so Windows users must use native PostgreSQL or a POSIX/Linux Docker harness. A Docker socket denied by the harness sandbox is a permission-policy failure; use the native path or a harness with Docker permission rather than weakening database verification.

Some hosted command boundaries virtualize spawned process identifiers and do not expose the detached child through `/proc` or deliver the normal child lifecycle events. The process-group integration tests run a capability probe first and skip only the real detached-child cases when those semantics are unavailable; deterministic injected tests still cover TERM-to-KILL escalation. GitHub Actions remains authoritative and retains real POSIX process-group coverage. A capability skip does not make the managed runner safe in that harness: use native PostgreSQL or GitHub Actions instead.

### Browser tests

The standard Codex Cloud environment does not install Chromium. Its repository-wide verification uses `pnpm verify`, while GitHub Actions runs the complete `pnpm test` command including Playwright.

Do not try to download Chromium during the agent phase: agent Internet access is intentionally disabled. If repeated agent-side browser execution becomes necessary, create a separate browser-specific Codex environment whose setup phase installs Chromium, or use another harness where Chromium is already available. Pull-request CI always provides the browser evidence. Keep that cost out of the standard environment.

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
- a DB-specific environment reports missing PostgreSQL packages or no cluster;
- setup, maintenance, or environment values changed but automatic invalidation did not occur.

After changing the standard environment, launch a fresh issue task and require `node scripts/agent-doctor.mjs` to pass before implementation. Require `--profile postgres` only in the separate DB environment, and use `--profile web` or `--profile web-postgres` only in a browser-capable environment.

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

A harness that cannot run `pnpm verify` may draft issues, documentation, and reviews; it must not publish code.

## Updating this contract

Keep this file aligned with `package.json`, the versioned Codex scripts, and CI. Record observed drift in the pull request's [environment friction note](environment-friction.md). Changes to secrets, permissions, network policy, or hosted environments require a separate reviewed decision or `agent-friction` issue unless explicitly in scope.
