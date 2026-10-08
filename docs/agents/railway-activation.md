# Railway activation

**Status:** Prepared configuration; live activation pending owner-managed accounts, secrets and verification

**Scope:** #523 deployment packaging only

This is the single activation route for the existing web, API and PostgreSQL
services. Preparation needs no Railway credentials. Activation provisions paid
resources and must be performed by the owner after choosing a budget. Do not copy
the local `.env.example` into Railway; it enables local demonstration identity.

## Verify the candidate without an account

Use the repository Node/pnpm versions and a working Docker daemon:

```bash
node scripts/agent-doctor.mjs
pnpm verify
pnpm --dir .railway install --frozen-lockfile
pnpm --dir .railway typecheck
pnpm --dir .railway test
bash scripts/railway-packaging-smoke.sh
```

The smoke command builds both images from the monorepo root, uses synthetic
public Clerk settings, starts a disposable PostgreSQL 17 container, applies the
committed Drizzle migrations twice, and checks hosting ports, health, direct SPA
navigation, missing assets and rejection of injected identity headers. It cleans
up its own containers, network and image tags. It never contacts Railway or Clerk.
It fails if Docker is unavailable; configuration/unit checks do not prove image
startup or migrations. Record every unavailable check in the PR.

The API runtime includes the locked Drizzle CLI so the existing `drizzle-kit
migrate` command is available before deployment. Applied migration files are
unchanged. The web runtime contains only the static production build and nginx
configuration. Both services run as unprivileged users. Node images use an exact
24.x release and both builds install pnpm 11.20.0 and frozen dependencies; update
the image tags together with toolchain changes and rerun the smoke proof. Image
tags may be republished upstream: retain the deployed image digest and source SHA
in release records rather than claiming bit-for-bit image reproducibility.

## Owner prerequisites

1. Choose a Railway workspace, billing plan, deployment region, monthly budget,
   usage alerts and responsible operator. No purchase is part of preparation.
2. Give the Railway GitHub App access to `Prisma-Prim/PRISMA-PRIM-Suite`; connect a
   project member's GitHub account with contributor access.
3. Choose stable HTTPS web and API origins. Configure a Clerk **production**
   instance for the web domain, permitted redirects and the invitation callback
   at `WEB_ORIGIN/accept-invitation`. Complete Clerk's required domain/DNS setup.
   Production identity uses the existing Clerk adapter and the exact web origin
   as its authorized party; do not enable development/test identity modes.
4. Create an empty Railway project and select its production environment. Review
   all settings and secret references before creating the GitHub-backed services;
   applying the graph can start their first deployment. If adapting existing
   services, disable their autodeploy while configuring them. Do not apply this whole-project definition to an unrelated
   existing project: omitted resources may be deleted.

Create these **shared variables** in the environment before applying the graph.
Enter secrets directly in Railway's secret store; never put them in source,
Docker build arguments, CLI command history, screenshots or logs.

| Shared variable         | Owner-supplied value                                                | Referenced by |
| ----------------------- | ------------------------------------------------------------------- | ------------- |
| `WEB_ORIGIN`            | Exact HTTPS web origin, no path or trailing slash                   | API runtime   |
| `VITE_API_URL`          | Public HTTPS API origin followed by `/api`                          | Web build     |
| `CLERK_PUBLISHABLE_KEY` | Clerk production `pk_live_…` key; safe to include in browser assets | API and web   |
| `CLERK_SECRET_KEY`      | Matching production `sk_live_…` secret; seal it in Railway          | API runtime   |

The web's `VITE_*` values are compiled into browser assets. Changing them requires
a rebuild. The API receives its database URL through the graph's
`${{postgres.DATABASE_URL}}` reference over the private network, never
`DATABASE_PUBLIC_URL`. Do not expose PostgreSQL publicly for normal operation.
Leave test database variables, `VITE_DEMO_*` and demonstration fixtures unset.

If an initial Workspace owner still needs admission, configure the existing
bootstrap settings only on the API: provider `clerk`, the verified Clerk user
subject, the owner-approved Workspace UUID and name. Set all four
`ACCESS_BOOTSTRAP_*` values together using the existing
[access admission contract](../../apps/api/src/access/access-admission.ts).
Do not use synthetic/local-demo identities, pre-approved invitation JSON or
`demo:seed` for production setup. This guide does not change admission rules.

## Apply and inspect service settings

Install a Railway CLI that supports IaC (SDK 3.13.0 requires CLI 5.42.1 or newer)
using the [official CLI instructions](https://docs.railway.com/cli). From the
repository root, authenticate and link the intended project/environment, then
review the plan:

```bash
railway login
railway link
railway config plan
```

The versioned [project definition](../../.railway/railway.ts) uses the current
[Infrastructure as Code API](https://docs.railway.com/infrastructure-as-code).
Legacy `railway.json`/`railway.toml` is not used: Railway documents that new
services cannot opt in and existing files stop being read on 2026-12-01.
The independent `.railway` package pins the SDK without altering application
dependencies. These local tests evaluate its graph without remote planning.

Only after confirming the target, resources, required variables, costs and a
recorded current `main` SHA whose complete CI workflow is green, run
`railway config apply` interactively and approve that exact plan. Provisioning and
deployment are activation actions, outside credential-free preparation. Inspect
the resulting settings against the following table, attach the chosen public
web/API domains and configure their target ports to match `PORT`.

| Setting           | API                                               | Web                               | PostgreSQL                         |
| ----------------- | ------------------------------------------------- | --------------------------------- | ---------------------------------- |
| Source            | Repository `main`, monorepo root `/`              | Same                              | Railway PostgreSQL image, major 17 |
| Dockerfile        | `deploy/railway/api.Dockerfile`                   | `deploy/railway/web.Dockerfile`   | Database product                   |
| Start override    | Leave unset; use image CMD                        | Leave unset; use image ENTRYPOINT | Database product                   |
| Pre-deploy        | `node scripts/railway-api.mjs migrate`, 300 s cap | None                              | None                               |
| Healthcheck       | `/api/health`, 120 s timeout                      | `/health`, 120 s timeout          | Database product                   |
| Restart           | On failure, maximum 3 retries                     | Same                              | Inspect database product policy    |
| Replicas/sleep    | One replica, sleeping disabled                    | Same                              | Persistent database volume         |
| Public networking | HTTPS API domain                                  | HTTPS web domain                  | Disabled                           |

The launcher maps Railway's `PORT` to the API's existing `API_PORT`; the web
entrypoint renders nginx's listening port from `PORT`. Missing or invalid live
identity settings fail visibly. The database helper preserves the repository's
PostgreSQL major; confirm the created database has its persistent volume mounted
at `/var/lib/postgresql/data` and retain its generated credentials in Railway.
Do not add a volume to web/API or upgrade the database major during activation.

The pre-deploy command runs in a separate container with runtime variables and
private networking. Failure or timeout stops the new API deployment. Keep one
API replica and serialize migration-bearing deployments; migrations are not
part of the web build and are never run through `drizzle-kit push`.

## GitHub deployment after green checks

Enable **Wait for CI** for both GitHub-backed services and confirm the deployment
branch is `main`. The graph requests this through `checkSuites: true`. The
repository CI runs on pushes to `main`; packaging runs alongside the independent
test families after the fast checks. The required `quality` aggregate succeeds
only after checks, every test family, the host build and packaging succeed. No
Railway token or deploy workflow is installed in GitHub.

For initial activation, confirm `main` has not advanced past the recorded green
SHA before applying the graph or manually triggering deployment. Confirm Wait for
CI is enabled on both created services. After verification, enable autodeploy if
it was disabled on either service.
Subsequent pushes to `main` wait for GitHub Actions before building; a failed
workflow skips deployment. [Wait for CI](https://docs.railway.com/deployments/github-autodeploys)
uses whole workflow conclusions, ignores skipped/neutral workflows, and can
ignore a cancelled workflow if another workflow on the same SHA succeeds. Preserve
the single required CI workflow and its packaging job; never treat a cancelled
or incomplete required check as release approval. Manual deployments and variable
changes require the same operator check of the source SHA and complete CI result.
IaC edits require another reviewed `config plan`/`config apply`; a GitHub source
deployment does not automatically apply project configuration.

## Verification, budget, backups and rollback

Verify both health URLs, then open a direct SPA route such as
`/accept-invitation` and sign in with the production Clerk owner. Check the API's
current-actor request, expected Workspace admission and one authorized read.
Confirm the exact web origin succeeds in CORS and an unapproved origin does not.
Verify unauthenticated/injected-header requests receive 401. Record source SHA,
image digests, deployment IDs and migration output without secrets or Client data.
The existing API health route proves process liveness, not database readiness or
Clerk availability. Railway's healthcheck gates traffic switch only; it does not
continuously monitor an active service. Configure operator alerts/monitoring.

Before accepting real data, configure PostgreSQL volume backup schedules and
retention appropriate to the owner's recovery objectives; take an initial backup
and rehearse restoration into a separate disposable environment. Retain an
access-controlled off-platform database export if required by the owner's policy.
Review [backup availability and limits](https://docs.railway.com/volumes/backups)
for the chosen plan. Backups incur storage costs and restoring an old backup
discards subsequent writes; a successful backup is not proof of a tested restore.

Set owner-approved usage email alerts and a compute hard limit in Railway's
workspace usage settings, and inspect per-service CPU/memory limits. Do not invent
a budget or rely on trial credits. [A hard usage limit](https://docs.railway.com/pricing/cost-control)
takes workloads offline; agree that availability trade-off before setting it.
Include database/backup storage and network egress in the budget, keep database
traffic private, and review usage after activation.

If a release fails, disable autodeploy and inspect build, migration and runtime
logs. An unsuccessful healthcheck prevents the new image receiving traffic.
Rollback web/API to a retained known-good deployment only when that application
version is compatible with the **current** schema and settings; restoring an
application image does not undo migrations or database writes. Never edit an
applied migration or run destructive down-migrations. Prefer a reviewed forward
fix; restore a tested backup into a separate database only under an owner-approved
recovery plan that accounts for lost writes, identity settings and downtime.
Railway rollback is limited by the deployment retention of the selected plan.

Official references: [Dockerfiles/build arguments](https://docs.railway.com/builds/dockerfiles),
[pre-deploy semantics](https://docs.railway.com/deployments/pre-deploy-command),
[healthchecks](https://docs.railway.com/deployments/healthchecks),
[restart policy](https://docs.railway.com/deployments/restart-policy), and
[deployment rollback](https://docs.railway.com/deployments/reference).
