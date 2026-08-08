# AI agent environment contract

This document records the shared repository baseline. Product-specific services, variables, and secrets still belong to their owning issue and must not be guessed or committed.

Last validated: 2026-08-08.

## Canonical baseline

| Concern      | Contract                         | Source of truth                    |
| ------------ | -------------------------------- | ---------------------------------- |
| Node.js      | `>=24.0.0`                       | root `package.json`                |
| pnpm         | `11.20.0`                        | root `packageManager` and lockfile |
| Dependencies | `pnpm install --frozen-lockfile` | `pnpm-lock.yaml`                   |
| Browser      | Playwright Chromium              | `@prisma-prim/web`                 |
| CI           | Ubuntu, Node 24, pnpm 11.20.0    | `.github/workflows/ci.yml`         |

After setup, run the zero-dependency diagnostic:

```bash
node scripts/agent-doctor.mjs
```

`pnpm agent:doctor` is the convenience alias once pnpm is usable. The default `base` profile validates Node, pnpm, workspace files, the lockfile, and installed dependencies without requiring a browser or network access. Use the web profile after installing Chromium:

```bash
node scripts/agent-doctor.mjs --profile web
node scripts/agent-doctor.mjs --profile web --json
```

PostgreSQL, Clerk, external APIs, and issue-specific variables must be checked only when the assigned issue requires them. Additional profiles should be introduced only after those contracts exist in their owning issues.

## Codex Cloud environment

Use Node 22 as the available preinstalled bootstrap package, then install and persist Node 24 with `mise`.

The versioned scripts are the source of truth. Configure the Codex Cloud setup field as:

```bash
bash scripts/setup-codex-cloud.sh
```

Configure the maintenance field as:

```bash
bash scripts/maintain-codex-cloud.sh
```

Reset the Codex environment cache after changing runtime or setup configuration. The agent must verify `node --version`, `pnpm --version`, and `node scripts/agent-doctor.mjs --profile web` before editing frontend work.

## Local and other harnesses

1. Install a Node version satisfying the root engine.
2. Activate the exact pnpm version declared by `packageManager`.
3. Install dependencies from the lockfile.
4. Install Playwright Chromium when browser tests are part of the repository checks.
5. Run the doctor before implementation.

Claude Code reads the root `CLAUDE.md`, which imports `AGENTS.md`. Harnesses that do not discover either file automatically must be explicitly prompted to read both `AGENTS.md` and `docs/agents/issue-execution.md`.

## Capability matrix

| Harness | Local files and tests | Git branch/commit | Push/PR | CI visibility | Merge |
| --- | --- | --- | --- | --- | --- |
| Codex Cloud | Yes, isolated cloud checkout | Usually yes | Yes when GitHub is connected | Task-dependent | Only with explicit authorization |
| Codex CLI | Yes | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with explicit authorization |
| Claude Code | Yes | Depends on local permissions | Depends on local authentication | Via available GitHub tooling | Only with explicit authorization |
| Generic harness | Must be verified | Must be verified | Must be verified | Must be verified | Never assume |

Current limitation: the Codex Cloud runtime selection UI does not expose Node 24 directly, so the setup script bootstraps it with `mise`. Reset the cloud environment cache whenever this script or its runtime assumptions change.

## Updating this contract

Keep this file aligned with `package.json` and CI. Record observed drift in the PR retrospective. Changes to secrets, permissions, network policy, or hosted environments require a separate reviewed decision or `agent-friction` issue unless they are explicitly in scope.
