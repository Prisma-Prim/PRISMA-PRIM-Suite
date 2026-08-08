# Codex Cloud environment

Use the repository scripts below for the PRISMA Codex Cloud environment. Keep the configuration short in the UI so setup behavior remains versioned and reviewable with the code.

Open the repository environment in Codex settings and configure:

## Package versions

- Node.js: `24`

The repository doctor enforces the supported range from `package.json`, currently `>=24.0.0 <25.0.0`.

## Environment variables

These are ordinary environment variables, not secrets. They must be configured in the environment settings so they remain available after the setup Bash session ends.

```text
DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_dev
TEST_DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_test
```

The credentials are limited to the isolated local container. Do not replace either URL with a shared, remote, staging, or production database. The setup script rejects any different target.

## Setup script

```bash
bash scripts/codex-cloud-setup.sh
```

The setup script:

1. activates the exact pnpm version declared by the repository;
2. installs dependencies from the frozen lockfile;
3. installs Playwright Chromium and its operating-system dependencies;
4. installs and starts local PostgreSQL when needed;
5. creates `prisma_prim_dev` and `prisma_prim_test` idempotently;
6. runs the complete environment doctor.

## Maintenance script

```bash
bash scripts/codex-cloud-maintenance.sh
```

Codex runs this script when it resumes a cached container. It rechecks the exact pnpm version, synchronizes dependencies, restores Chromium, starts PostgreSQL, recreates missing local databases, and runs the doctor.

## Internet and credentials

- Keep agent-phase Internet access **off**.
- Do not add a GitHub PAT or another long-lived credential.
- Setup uses its temporary network access only for package and operating-system installation.

## Verification

Run this before implementing any slice that needs PostgreSQL and browser coverage:

```bash
node scripts/agent-doctor.mjs --profile web-postgres
pnpm test:access:postgres
```

The doctor checks Node, exact pnpm, dependencies, Chromium, both database variables, local and distinct database targets, the `_test` suffix, and a real connection to the test database. It never runs migrations or destructive SQL.

## Cache reset

Use **Reset cache** on the Codex environment page only when:

- the maintenance script reports missing system packages or no PostgreSQL cluster;
- a package-version change cannot be activated from the cached image;
- the repository changes system-level prerequisites;
- the setup or maintenance configuration was changed but the environment did not invalidate automatically.

Changing setup, maintenance, variables, or secrets normally invalidates the cache automatically. Keep the first issue run after an environment change limited to validating this configuration before starting product work.
