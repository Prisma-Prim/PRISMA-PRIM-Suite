# PRISMA-PRIM Suite

PRISMA-PRIM Suite is the repository for the PRISMA CERT AI MVP: an internal platform that will assist PRISMA-PRIM and BIC from client request analysis through deterministic quotation, human approval, contract generation, and approved-document search.

This first commit contains only the executable engineering foundation. Business features will be implemented from scoped GitHub issues with AI coding agents.

## Architecture

| Area            | Choice                                                       |
| --------------- | ------------------------------------------------------------ |
| Web application | React, Vite, TypeScript                                      |
| Business API    | NestJS, TypeScript                                           |
| Database        | PostgreSQL with Drizzle ORM                                  |
| Authentication  | Clerk, added in a dedicated issue                            |
| AI workloads    | External APIs initially; a Python worker only when justified |
| Workspace       | pnpm monorepo without an additional build orchestrator       |

NestJS owns business data, workflows, permissions, and final decisions. A future Python worker may analyze documents and propose AI results, but it must not own business rules or write uncontrolled decisions.

## Repository layout

```text
apps/
  api/         NestJS API and Drizzle database access
  web/         React application
  ai-worker/   Reserved boundary for a future Python AI worker
docs/
  adr/           Durable technical decisions
  agents/        Cross-harness agent workflow and environment contract
  product/       Product specifications
scripts/          Zero-dependency agent diagnostics and governance checks
```

## Preserved UI baseline

The complete PRISMA CERT AI frontend mockup is preserved as an isolated,
backend-free reference at `/ui-baseline#/dashboard`. It uses synthetic data and
simulated interactions so local agents can work from the current approved visual
progress without confusing the mockup with implemented business behavior.

Treat `/ui-baseline` as the recoverable Atlas Blue visual and interaction
reference. Production slices may evolve it deliberately when their acceptance
criteria require a change, but must not confuse its synthetic behavior with
implemented product behavior.

## Local setup

For production packaging and owner-managed activation, follow the single
[Railway activation guide](docs/agents/railway-activation.md).

Prerequisites: Node.js 24, pnpm 11.20.0, Docker with Compose.

```bash
cp .env.example .env
set -a
. ./.env
set +a
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm db:migrate
node scripts/agent-doctor.mjs
pnpm dev
```

The web application runs at `http://localhost:5173`. The API health endpoint is available at `http://localhost:3000/api/health`.

The compose service creates the development database `prisma_prim` and, on a fresh volume, the isolated `prisma_prim_test` database that `TEST_DATABASE_URL` names. A volume created before that init script existed needs it once by hand:

```bash
docker compose exec -T postgres psql -U prisma_prim -d postgres -c "CREATE DATABASE prisma_prim_test OWNER prisma_prim;"
```

The browser journeys need Playwright's Chromium once per machine. The `--with-deps` flag installs the Linux system libraries and asks for `sudo`; omit it when those libraries are already present:

```bash
pnpm --filter @prisma-prim/web exec playwright install --with-deps chromium
```

With `.env` exported, the container running, and Chromium installed, `node scripts/agent-doctor.mjs --profile web-postgres` passes and `pnpm test` runs the PostgreSQL and Playwright suites locally.

The repository now contains reviewed, versioned Drizzle migrations for persistent business data.

## Local identity demonstration

The root `.env` file is not loaded automatically when pnpm runs a filtered package script from a workspace package. Export it in each terminal before starting the API and web application.

API terminal:

```bash
set -a
. ./.env
set +a
pnpm --filter @prisma-prim/api dev
```

Web terminal:

```bash
set -a
. ./.env
set +a
pnpm --filter @prisma-prim/web dev --mode local-demo
```

The local-demo mode is restricted to `NODE_ENV=development`. A normal production build and runtime fail closed even if demonstration variables are present.
The four `ACCESS_BOOTSTRAP_*` values configure the only verified principal that
may idempotently create the initial Workspace, Internal User, and Workspace
Membership. `ACCESS_ACCEPTED_INVITATIONS_JSON` is a provider-neutral JSON array
of `{ "provider", "subject", "workspaceId" }` entries. Each entry admits that
exact verified principal into an already existing Workspace. Missing complete
bootstrap configuration fails closed; partial or malformed admission
configuration prevents API startup. Every other unknown principal is denied
without persisted state. Authentication by Clerk alone never grants admission.

Public API demonstrations:

```bash
# 401: no verified principal
curl -i http://localhost:3000/api/access/current-actor

# 200: deterministic local demonstration principal
curl -i http://localhost:3000/api/access/current-actor \
  -H 'x-test-external-provider: local-demo' \
  -H 'x-test-external-subject: local-demonstration-user' \
  -H 'x-test-display-name: Local demonstration user' \
  -H 'x-test-email: local-demo@example.test'

# Persisted Workspace, Internal User, and explicit Workspace Membership
docker compose exec postgres psql -U prisma_prim -d prisma_prim \
  -c 'SELECT id, name FROM workspaces;' \
  -c 'SELECT id, external_provider, external_subject, display_name, email, status FROM internal_users;' \
  -c 'SELECT id, workspace_id, internal_user_id, status FROM workspace_memberships;'

# 403: deactivate the demonstrated Internal User, then repeat the 200 request
docker compose exec postgres psql -U prisma_prim -d prisma_prim \
  -c "UPDATE internal_users SET status = 'inactive' WHERE external_subject = 'local-demonstration-user';"
```

## Demonstration data

The demonstration seed fills a dedicated demonstration Workspace with the versioned synthetic scenario `demo-v1` through the public API: PRISMA-PRIM, BIC and ECG, four `DEMO` personas with provisional role profiles, and illustrative Clients, Projects, Tasks, Documents, Requests, Service offerings and Pricing Rule Versions. [Platform PRD section 17](docs/product/platform-security-reliability-operations-prd.md#17-approved-provisional-demonstration-data-409) owns its rules, and the [first-tenant substitution register](docs/product/first-tenant-substitution-register.md) indexes what each stand-in replaces.

The seed process fixes its server clock at startup and shares that instant with its runner. A first Pricing Rule starts at the next whole second of that synthetic run, so waiting for database locks cannot expire the request. The normal application continues to use real time; pricing validation, receipts and permissions are unchanged.

> **Warning:** never point the seed at a database that holds real or shared data. It refuses a target whose configured Workspace name lacks `DEMO`, that holds another Workspace, or that is not at the latest migration, but a dedicated demonstration database is the operator's responsibility.

Prepare a dedicated database, give the configured bootstrap Workspace a name that contains `DEMO`, and migrate it:

```bash
set -a
. ./.env
set +a
docker compose exec -T postgres psql -U prisma_prim -d postgres -c "CREATE DATABASE prisma_prim_demo OWNER prisma_prim;"
export DATABASE_URL=postgresql://prisma_prim:prisma_prim@127.0.0.1:5432/prisma_prim_demo
export ACCESS_BOOTSTRAP_WORKSPACE_NAME="PRISMA DEMO Workspace"
pnpm db:migrate
```

Build the API from a development checkout (the seed boots the application with the development dependencies), then run the seed with the explicit confirmation of the configured Workspace identifier:

```bash
pnpm --filter @prisma-prim/api build
pnpm demo:seed --confirm-workspace "$ACCESS_BOOTSTRAP_WORKSPACE_ID"
```

The command prints its manifest as JSON lines and exits with:

- `0` when every step converged: `created` on a first run, `replayed` or `present` on a repeated run;
- `2` when it refused the target, with a named reason and nothing written;
- `3` when it stopped at a named step; earlier steps remain, and a repeated run resumes;
- `1` on an unexpected failure.

A repeated run changes nothing and never overwrites a change made in the application. If the stored Workspace has been renamed, set `ACCESS_BOOTSTRAP_WORKSPACE_NAME` to that exact name (which must still contain `DEMO`); a stale name is refused without restoring the old one.

Inside the seed process, every writable transaction blocks concurrent Workspace changes and rechecks the target before writing, including the owner bootstrap. Another process may change the target between transactions; the next writable transaction then refuses and the command stops at that step, preserving earlier commits. This is protection for each write, not exclusive ownership of the database for the whole run.

To view the data as a persona, start the API in local-demo mode with the same `DATABASE_URL` and `ACCESS_BOOTSTRAP_WORKSPACE_NAME` exported (see "Local identity demonstration"), then restart the web with that persona's values:

| Persona     | `VITE_DEMO_EXTERNAL_SUBJECT` | `VITE_DEMO_DISPLAY_NAME` | `VITE_DEMO_EMAIL`          |
| ----------- | ---------------------------- | ------------------------ | -------------------------- |
| Ana DEMO    | `DEMO-persona-ana`           | `Ana DEMO`               | `ana.demo@example.test`    |
| Ion DEMO    | `DEMO-persona-ion`           | `Ion DEMO`               | `ion.demo@example.test`    |
| Maria DEMO  | `DEMO-persona-maria`         | `Maria DEMO`             | `maria.demo@example.test`  |
| Victor DEMO | `DEMO-persona-victor`        | `Victor DEMO`            | `victor.demo@example.test` |

Each persona uses `VITE_DEMO_EXTERNAL_PROVIDER=demo-seed`. The configured owner keeps the `.env` values.

The seed never deletes. To reset, stop the API, drop the dedicated database, then recreate, migrate and seed it again:

```bash
docker compose exec -T postgres psql -U prisma_prim -d postgres -c "DROP DATABASE prisma_prim_demo;"
```

## Workspace Membership authority

Workspace Membership is the only relationship between a global Internal User
and a Workspace. Migration `0016` removes the completed expand/backfill
compatibility surfaces. Admission uses stable Workspace UUIDs: bootstrap may
create or resolve the exact configured ID, while accepted invitations require
their configured Workspace ID to exist already.

## Quality commands

```bash
node scripts/agent-doctor.mjs
node scripts/agent-doctor.mjs --profile web
node scripts/agent-doctor.mjs --profile web-postgres
pnpm verify
pnpm test
```

`pnpm verify` is the single pre-publication gate: formatting, lint, type-check, the unit and script suites, and the production build. `pnpm test` adds the PostgreSQL and Playwright suites when a safe local database and Chromium are available; GitHub Actions always runs it.

For Codex Cloud setup, maintenance, isolated database variables, and cache-reset instructions, see [AI agent environment contract](docs/agents/environment.md).

## Development workflow

1. Domain language lives in `CONTEXT.md`; durable decisions live in `docs/adr/`.
2. Product behaviour is approved in a master specification before ticketing.
3. Production UI slices evolve coherently from the preserved Atlas Blue baseline at `/ui-baseline`.
4. Each GitHub ticket is a narrow, end-to-end tracer bullet with explicit blockers.
5. Every AI coding harness reads `AGENTS.md` and `docs/agents/issue-execution.md` before editing.
6. Implementation follows red-green-refactor at the highest stable test seam.
7. The final diff passes `pnpm verify`, one self-review, and at most [one review round](docs/agents/issue-execution.md#review-round).
8. Avoidable environment friction is noted in the pull request; recurring friction becomes an `agent-friction` issue that the repository owner prioritizes.
9. Generated SQL migrations are inspected and committed; schema push is not used in production.

Repository-scoped Codex skills are stored under `.agents/skills/` and pinned in `skills-lock.json`. They include the Matt Pocock planning and delivery workflow plus the thermo-nuclear structural quality review.
