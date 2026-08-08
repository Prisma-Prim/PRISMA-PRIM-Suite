# PRISMA-PRIM Suite

PRISMA-PRIM Suite is the repository for the PRISMA CERT AI MVP: an internal platform that will assist PRISMA-PRIM and BIC from client request analysis through deterministic quotation, human approval, contract generation, and approved-document search.

This first commit contains only the executable engineering foundation. Business features will be implemented from scoped GitHub issues with Codex CLI.

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
  agents/        Agent workflow configuration
  design/        UI/UX exploration and visual approval process
  product/       Product specifications
```

## Preserved UI baseline

The complete PRISMA CERT AI frontend mockup is preserved as an isolated,
backend-free reference at `/ui-baseline#/dashboard`. It uses synthetic data and
simulated interactions so local agents can work from the current approved visual
progress without confusing the mockup with implemented business behavior.

Read [`docs/design/ui-baseline.md`](docs/design/ui-baseline.md) before extending
or connecting this interface.

## Local setup

Prerequisites: Node.js 24+, pnpm 11+, Docker with Compose.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```

The web application runs at `http://localhost:5173`. The API health endpoint is available at `http://localhost:3000/api/health`.

No migration exists yet because the initial commit deliberately contains no business table. The first issue introducing persistent data must add a reviewed, versioned SQL migration.

## Quality commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Development workflow

1. Domain language lives in `CONTEXT.md`; durable decisions live in `docs/adr/`.
2. Product behaviour is approved in a master specification before ticketing.
3. The production UI direction passes the iterative design approval gate and T00 consolidation before functional frontend slices start.
4. Each GitHub ticket is a narrow, end-to-end tracer bullet with explicit blockers.
5. Codex CLI reads `AGENTS.md`, the complete ticket, the glossary, and relevant ADRs before editing.
6. Implementation follows red-green-refactor at the highest stable test seam.
7. The final diff is reviewed against both repository standards and the originating specification.
8. Generated SQL migrations are inspected and committed; schema push is not used in production.

Repository-scoped Codex skills are stored under `.agents/skills/` and pinned in `skills-lock.json`. They include the Matt Pocock planning and delivery workflow plus the thermo-nuclear structural quality review.
