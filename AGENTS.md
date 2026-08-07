# Codex repository instructions

## Product boundary

This repository contains PRISMA-PRIM Suite. Implement only the scope of the assigned GitHub issue. Do not infer missing prices, legal clauses, certification decisions, or business rules.

## Durable technical decisions

- Frontend: React + Vite + TypeScript.
- Business backend: NestJS + TypeScript.
- Database: PostgreSQL accessed with Drizzle ORM and `node-postgres`.
- Authentication: Clerk, introduced only by the authentication issue.
- AI: NestJS may call external model APIs. Add Python only for a concrete NLP/ML workload that justifies a separately deployable worker.
- NestJS owns business data, workflows, validation, permissions, and final decisions.
- AI outputs are proposals. Important actions require deterministic validation and human approval.

## Engineering rules

- Keep code, identifiers, commit messages, and technical documentation in English.
- Keep user-facing copy ready for localization; do not scatter hard-coded multilingual strings.
- Prefer explicit, readable code over abstractions created for hypothetical future needs.
- Do not add dependencies unless the issue requires them.
- Do not bypass the shared TypeScript, ESLint, or Prettier configuration.
- Every schema change requires a reviewed Drizzle migration committed to the repository.
- Never use `drizzle-kit push` against production.
- Never commit secrets or real client documents.
- Preserve the boundary between confirmed, inferred, missing, and contradictory AI-extracted information.

## Required verification

Before committing, run the checks affected by the change. For repository-wide or foundational changes, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Report any check that could not be run and the exact reason.
