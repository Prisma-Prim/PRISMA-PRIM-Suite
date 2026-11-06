# AI coding agent repository instructions

PRISMA-PRIM Suite. One session delivers only its assigned GitHub issue, as one pull request, through [issue execution](docs/agents/issue-execution.md), which owns the claim, verification, review, CI and merge rules.

## Navigation

- Issues and pull requests: [issue tracker](docs/agents/issue-tracker.md).
- Domain: `CONTEXT.md` terms everywhere, decisions in `docs/adr/`, [domain docs](docs/agents/domain.md) for a missing concept.
- Product behaviour: the PRD the issue links; in `docs/product/consolidated-product-decision-record.md`, only the DEC sections the issue links.
- Drafting or decomposing product work: `docs/product/prd-index.md`, `docs/product/specification-and-ticketing-standard.md`.
- Documentation changes: [repository knowledge system](docs/agents/repository-knowledge-system.md).
- TypeScript: before reading or editing any `.ts` or `.tsx` file, apply the [mandatory TypeScript discipline](docs/agents/typescript-discipline.md), the default for every implementation and review.
- Product UI: follow the Prisme & lumière direction ([#225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225), [frame provenance](apps/web/src/production-shell/prisme/README.md)); `/ui-baseline` stays a synthetic snapshot. Neither proves business behaviour.
- Skills: `.agents/skills/<name>/SKILL.md`. Run `thermos`, `thermo-nuclear-code-quality-review` and `improve-codebase-architecture` only at structural checkpoints; their findings become candidate issues.

## Guardrails

- Stack: React + Vite, NestJS, PostgreSQL with Drizzle and `node-postgres`, Clerk, all TypeScript. NestJS may call external model APIs; Python only as a separate worker for a concrete NLP/ML workload.
- NestJS owns business data, workflows, validation, permissions and final decisions. AI outputs are proposals needing deterministic validation and human approval; label AI-extracted facts confirmed, inferred, missing or contradictory.
- English code, identifiers, commits and technical docs; localization-ready user-facing copy.
- Test first at the highest stable public seam, then red-green-refactor; keep module interfaces narrow.
- Add dependencies only when the issue requires them; keep the shared TypeScript, ESLint and Prettier configuration.
- Every schema change ships a reviewed, committed Drizzle migration; `drizzle-kit push` never touches production.
- Never commit secrets, real Client data or production bypasses.

## Decision authority

- Escalate, never infer, product decisions the issue leaves open: business rules, prices, legal clauses, certification decisions, permissions, workflow meaning, acceptance criteria.
- Raise major delivery trade-offs (delay, cost, architecture, verification, delivery, infrastructure, operations) through the [shared decision procedure](docs/agents/issue-execution.md#shared-decisions-for-major-trade-offs) before committing; only the owner's explicit choice authorizes them.
- Decide reversible technical choices inside the issue yourself; record consequential ones in the PR.
- Standing merge authorization: with merge access, run `gh pr merge <n> --squash --auto` once the [merge preconditions](docs/agents/issue-execution.md#ci-and-merge) hold; stop if one is unmet or uncertain, or the owner revokes it.

## Code Review Rules

CI covers format, lint and types. Each rule: risky pattern, consequence, safe pattern.

**Workspace and Company isolation** ([ADR 0006](docs/adr/0006-workspace-tenancy-and-company-scoped-authorization.md))

- Query or command scoped by a request-supplied identifier, or unscoped: leaks or corrupts another tenant's data. Safe: scope from the server actor context.
- Business table without `workspace_id`, or Company-owned without `company_id` and composite foreign keys: allows cross-Workspace references. Safe: both columns, composite constraints.
- Responses differing for hidden and missing records, lists, counts or events: reveal existence. Safe: one identical denial.

**Authorization**

- Authority from the payload, role names, controller conditions or direct Access-table queries: drifts from the Access module. Safe: actor-context grants through the owning module; no grant denies.
- Check made before the transaction relying on it: races revocation. Safe: recheck authorization, versions and state inside it.

**Drizzle migrations** ([ADR 0002](docs/adr/0002-postgresql-with-drizzle.md))

- Schema change without generated SQL and meta in `apps/api/drizzle`: environments diverge. Safe: the reviewed generated migration.
- Drop or rename in one step: loses data, breaks consumers. Safe: expand, backfill, contract, preserving identifiers and events.

**Activity Log**

- Event updated or deleted: rewrites evidence. Safe: append-only, corrected by a new event.
- Event outside the change's transaction, or for a denied, failed, no-op or replayed command: false history. Safe: the PRD's event in the same transaction.
- Actor, scope or target from client input, or metadata wider than target visibility: leaks activity. Safe: server-established fields, minimal metadata.
