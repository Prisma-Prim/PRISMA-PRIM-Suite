# AI agent environment contract

This document is the canonical repository environment contract. Product-specific services, variables, and secrets still belong to their owning issue and must not be guessed or committed.

Last validated: 2026-08-08.

## Canonical baseline

| Concern | Contract | Source of truth |
| --- | --- | --- |
| Node.js | `>=24.0.0 <25.0.0` | root `package.json` and `.node-version` |
| pnpm | `11.20.0` | root `packageManager` and lockfile |
| Dependencies | `pnpm install --frozen-lockfile` | `pnpm-lock.yaml` |
| Browser | Playwright Chromium | `@prisma-prim/web` |
| Database | isolated local PostgreSQL | issue #36 and the versioned scripts |
| CI | Ubuntu, Node 24, pnpm 11.20.0, PostgreSQL 17 | `.github/workflows/ci.yml` |

Run the zero-dependency diagnostic after setup:

```bash
node scripts/agent-doctor.mjs
```

The profiles are cumulative:

```bash
# Node, pnpm, workspace, lockfile, and dependencies
node scripts/agent-doctor.mjs

# Base checks plus Playwright Chromium
node scripts/agent-doctor.mjs --profile web

# Web checks plus safe PostgreSQL variables and real test-database connectivity
node scripts/agent-doctor.mjs --profile web-postgres
```

Use `web-postgres` before any slice that needs both browser and persistent-data coverage. The doctor rejects missing, remote, shared, query-overridden, or non-`_test` destructive database targets before opening a connection. Its connectivity probe runs only `SELECT 1`; it never migrates or truncates data.

## Codex Cloud environment

Configure the repository environment in [Codex settings](https://chatgpt.com/codex/settings/environments).

### Package version

Set Node.js to `24` with **Set package versions**. Do not bootstrap a different runtime with `mise`; Codex Cloud supports pinning the environment runtime directly.

### Environment variables

Configure these as ordinary environment variables, not secrets, so they remain available during setup and the agent phase:

```text
DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_dev
TEST_DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_test
```

These credentials belong only to the isolated task container. Never replace either URL with a shared, remote, staging, or production database. The setup script accepts only the two exact loopback targets above.

### Setup script

```bash
bash scripts/codex-cloud-setup.sh
```

Setup activates the exact repository pnpm version, installs the frozen dependency graph, installs Chromium and its operating-system dependencies, installs and starts local PostgreSQL, creates both databases idempotently, and runs the `web-postgres` doctor.

### Maintenance script

```bash
bash scripts/codex-cloud-maintenance.sh
```

Maintenance runs when Codex resumes a cached container. It rechecks pnpm, synchronizes dependencies, restores Chromium, restarts PostgreSQL, recreates missing databases, and reruns the doctor. The legacy `scripts/setup-codex-cloud.sh` and `scripts/maintain-codex-cloud.sh` names are compatibility wrappers only; do not configure new environments with them.

### Network and credentials

- Keep agent-phase Internet access off.
- Do not add a GitHub PAT or another long-lived credential.
- Setup uses its temporary network access only for package and operating-system installation.

This follows the [official OpenAI Cloud environment contract](https://learn.chatgpt.com/docs/environments/cloud-environment): package versions can be pinned in settings, environment variables persist for the whole task, setup and maintenance are distinct cache lifecycle steps, and changing environment configuration normally invalidates the cache.

### Cache reset

Use **Reset cache** only when:

- maintenance reports missing system packages or no PostgreSQL cluster;
- a package-version change cannot be activated from the cached image;
- repository changes add a new system-level prerequisite;
- setup, maintenance, or environment values changed but automatic invalidation did not occur.

After changing the environment, launch a fresh issue task and require `node scripts/agent-doctor.mjs --profile web-postgres` to pass before implementation.

## Local and other harnesses

1. Install a Node version satisfying the root engine.
2. Activate the exact pnpm version declared by `packageManager`.
3. Install dependencies from the lockfile.
4. Install Playwright Chromium when browser tests are required.
5. Start an isolated local PostgreSQL instance and set explicit development and `_test` URLs when database tests are required.
6. Run the matching doctor profile before implementation.

Claude Code reads the root `CLAUDE.md`, which imports `AGENTS.md`. Harnesses that discover neither file automatically must be explicitly prompted to read `AGENTS.md` and `docs/agents/issue-execution.md`.

## Capability matrix

| Harness | Local files and tests | Git branch/commit | Push/PR | CI visibility | Merge |
| --- | --- | --- | --- | --- | --- |
| Codex Cloud | Yes, isolated cloud checkout | Usually yes | Yes when GitHub is connected | Task-dependent | Only with applicable explicit or standing authorization |
| Codex CLI | Yes | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Claude Code | Yes | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with applicable explicit or standing authorization |
| Generic harness | Must be verified | Must be verified | Must be verified | Must be verified | Never assume |

## Updating this contract

Keep this file aligned with `package.json`, the versioned Codex scripts, and CI. Record observed drift in the PR retrospective. Changes to secrets, permissions, network policy, or hosted environments require a separate reviewed decision or `agent-friction` issue unless explicitly in scope.
