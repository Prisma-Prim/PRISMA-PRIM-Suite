# AI agent environment contract

This document is the canonical repository environment contract. Product-specific services, variables, and secrets still belong to their owning issue and must not be guessed or committed.

Last validated: 2026-08-09.

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

Use `postgres` for ordinary backend or persistent-data work. Use `web` only when browser execution is required and `web-postgres` only when the same task genuinely needs both. The doctor rejects missing, remote, shared, query-overridden, or non-`_test` destructive database targets before opening a connection. Its connectivity probe runs only `SELECT 1`; it never migrates or truncates data.

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

The PostgreSQL setup installs the system packages, creates both databases idempotently, and runs the `postgres` doctor. Cached resumes restart the cluster and recreate missing databases without reinstalling packages.

### Browser tests

The standard Codex Cloud environment does not install Chromium. Its repository-wide verification uses `pnpm test:unit`, while GitHub Actions runs the complete `pnpm test` command including Playwright.

Do not try to download Chromium during the agent phase: agent Internet access is intentionally disabled. If repeated agent-side browser execution becomes necessary, create a separate browser-specific Codex environment whose setup phase installs Chromium, or use another harness where Chromium is already available. Keep that cost out of the standard environment.

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
2. Activate the exact pnpm version declared by `packageManager`.
3. Install dependencies from the lockfile.
4. Install Playwright Chromium when browser tests are required.
5. Start an isolated local PostgreSQL instance and set explicit development and `_test` URLs when database tests are required.
6. Run the matching doctor profile before implementation.

Claude Code reads the root `CLAUDE.md`, which imports `AGENTS.md`. Harnesses that discover neither file automatically must be explicitly prompted to read `AGENTS.md` and `docs/agents/issue-execution.md`.

## Capability matrix

| Harness         | Local files and tests        | Git branch/commit            | Push/PR                         | CI visibility                | Merge                                                   |
| --------------- | ---------------------------- | ---------------------------- | ------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Codex Cloud     | Yes, isolated cloud checkout | Usually yes                  | Yes when GitHub is connected    | Task-dependent               | Only with applicable explicit or standing authorization |
| Codex CLI       | Yes                          | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Claude Code     | Yes                          | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Generic harness | Must be verified             | Must be verified             | Must be verified                | Must be verified             | Never assume                                            |

## Updating this contract

Keep this file aligned with `package.json`, the versioned Codex scripts, and CI. Record observed drift in the PR retrospective. Changes to secrets, permissions, network policy, or hosted environments require a separate reviewed decision or `agent-friction` issue unless explicitly in scope.
