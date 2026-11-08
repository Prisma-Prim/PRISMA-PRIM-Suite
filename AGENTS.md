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

- Deduce open business details [from the cahier des charges](docs/product/specification-and-ticketing-standard.md#91-open-business-details), or take the conservative MVP default; escalate only the unsupported categories listed there.
- Raise major delivery trade-offs (delay, cost, architecture, verification, delivery, infrastructure, operations) through the [shared decision procedure](docs/agents/issue-execution.md#shared-decisions-for-major-trade-offs) before committing; only the owner's explicit choice authorizes them.
- Decide reversible technical choices inside the issue yourself; record consequential ones in the PR.
- Standing merge authorization: with merge access, run `gh pr merge <n> --squash --auto` once the [merge preconditions](docs/agents/issue-execution.md#ci-and-merge) hold; stop if one is unmet or uncertain, or the owner revokes it.

## Code Review Rules

CI enforces format, lint, types and the mechanical rules listed in [review rule enforcement](docs/agents/review-rule-enforcement.md). Review only these judgment calls; each rule names the risky pattern, its consequence and the safe pattern.

**Workspace and Company isolation** ([ADR 0006](docs/adr/0006-workspace-tenancy-and-company-scoped-authorization.md))

- Query or command scoped by a request-supplied identifier, or unscoped: leaks or corrupts another tenant's data. Safe: scope from the server actor context.
- Responses differing for hidden and missing records, lists, counts or events: reveal existence. Safe: one identical denial.

**Authorization**

- Authority from the payload, role names or controller conditions: drifts from the Access module. Safe: actor-context grants through the owning module; no grant denies.
- Check made before the transaction relying on it: races revocation. Safe: recheck authorization, versions and state inside it.

**Activity Log**

- Event outside the change's transaction, or for a denied, failed, no-op or replayed command: false history. Safe: the PRD's event in the same transaction.
- Actor, scope or target from client input, or metadata wider than target visibility: leaks activity. Safe: server-established fields, minimal metadata.

## Build the lever

- For any non-trivial work: do the first unit by hand to learn the recipe, then build the smallest rerunnable tool adapted to that work. The tool does or proves the work. Compare its result with the hand-done unit, and make the tool safe to rerun. Only a trivial task is exempt. "The bar is triviality, not repetition. A one-off still earns a lever when the lever is what makes the work checkable." ([Build the lever](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-build-the-lever/SKILL.md))
