# Architecture decisions

## ADR-001 — TypeScript business platform

**Status:** Accepted  
**Date:** 2026-08-07

The product is primarily a workflow and document-management application with an important AI component. React and NestJS keep the main platform in TypeScript, reduce context switching, and provide a clear home for business rules.

## ADR-002 — PostgreSQL with Drizzle ORM

**Status:** Accepted  
**Date:** 2026-08-07

PostgreSQL is the source of truth. Drizzle is preferred over a higher-abstraction ORM because migrations remain visible SQL and advanced PostgreSQL capabilities such as JSONB, full-text search, and later `pgvector` remain directly accessible.

Migrations are generated, reviewed, versioned, and applied explicitly. Direct schema push is not a production workflow.

## ADR-003 — Python is an optional worker, not the business backend

**Status:** Accepted  
**Date:** 2026-08-07

The initial application does not include an empty Python service. A separately deployable Python worker may be introduced when document extraction, specialized NLP, reranking, local models, or long-running ML workloads justify it.

NestJS remains the owner of business state and validates every worker result before persistence or workflow transitions.

## ADR-004 — Minimal MVP access model

**Status:** Accepted  
**Date:** 2026-08-07

Clerk will provide invitation-only authentication. The MVP has one PRISMA workspace and no granular role-management UI. A local user record will link Clerk identities to audit events when authentication is implemented.

## ADR-005 — Simple pnpm monorepo

**Status:** Accepted  
**Date:** 2026-08-07

The repository uses pnpm workspaces without Nx or Turborepo. The current project size does not justify another orchestration layer. One can be added later only after a measured need.
