# AI coding agent repository instructions

## Product boundary

This repository contains PRISMA-PRIM Suite. Implement only the scope of the assigned GitHub issue. Do not infer missing prices, legal clauses, certification decisions, or business rules.

Before changing business behaviour, read the complete issue, `CONTEXT.md`, and the relevant ADRs in `docs/adr/`. Use the canonical domain terms in code, tests, issues, and documentation.

The complete current Atlas Blue frontend mockup is preserved at `/ui-baseline`. Before extending or connecting it, read `docs/design/ui-baseline.md`. Treat it as the preferred, evolving visual and interaction baseline, not as proof of implemented business behavior. Production UI may evolve from it deliberately in narrow feature slices; preserve `/ui-baseline` as the recoverable snapshot and do not silently replace synthetic interactions while implementing an unrelated issue.

Before changing product UI, also read `docs/design/design-exploration.md` for the historical exploration record. The former design gate and T00 no longer block production work. Implement the assigned vertical feature issue without treating the baseline as a frozen final design or smuggling in unrequested business behaviour.

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

## Delivery workflow

- Use a fresh AI-agent session for one GitHub issue and deliver only that issue as one narrow, end-to-end tracer bullet. A slice may cross schema, API, UI, and tests when that makes the behaviour complete.
- Follow `docs/agents/issue-execution.md`. Its implementation and review rules are invariant; Git, GitHub, CI, and merge actions remain capability- and authorization-dependent.
- Run `node scripts/agent-doctor.mjs` before editing, adding `--profile web` when browser work is required.
- Start with a failing test at the highest stable seam that can prove the issue's behaviour, then follow red-green-refactor.
- Give each owning module the narrowest stable public interface that completes the slice. Prefer tests through that interface, the API, or the user interface over tests coupled to implementation details.
- Keep the branch green after every coherent step. Do not begin blocked or follow-on issues.
- Review the actual finished diff twice: first against repository Standards, then against the originating issue or Spec. Fix every material finding before publication.
- Keep scope explicit. Record valuable follow-up work for a separate issue rather than implementing it silently.
- Run `thermo-nuclear-code-quality-review` after structurally significant slices and at milestone boundaries when that repository skill is available, not as a reason to expand every small issue.
- Run `improve-codebase-architecture` periodically after several business slices exist when that repository skill is available. Treat its output as candidate work requiring a separate decision or issue.

## Agent environment retrospective

Every AI-assisted PR and final execution report must contain an **Agent environment retrospective** following `docs/agents/agent-environment-retrospective.md`.

Report only avoidable repository, environment, CI, or harness friction that could recur: runtime drift, missing prerequisites, incorrect commands, undocumented configuration, permission or network constraints, local/cloud/CI divergence, flaky tests, or a required check that could not run. Do not include full logs, secret values, client data, expected TDD failures, or routine coding mistakes.

Apply a small certain fix in the current PR only when it remains within scope. Create or recommend an `agent-friction` issue for reproducible or recurring friction, blocked required checks, uncertain root causes, or fixes involving CI, cloud setup, Docker, secrets, permissions, or network policy. Never broaden a product PR silently.

If no friction occurred, state that explicitly. The retrospective is mandatory even when empty.

## Decision authority

- Escalate product decisions that would change observable business rules, prices, legal clauses, certification decisions, permissions, workflow meaning, or issue acceptance criteria when the assigned issue and its references do not decide them.
- Take reversible technical decisions autonomously when they stay inside the issue's public boundary and comply with the durable technical decisions above. Document consequential choices in the pull request.
- Stop for a genuine external or product blocker. Resolve ordinary implementation choices, fixable check failures, and formatting issues without handing routine work back to the user.
- The repository owner has granted standing authorization for AI agents with merge access to squash-merge conformant PRs without asking again. Merge only after every required check is green, Standards and Spec reviews are complete, the final scope matches the issue, and no blocking feedback remains. Stop instead of merging if any precondition is failed, unresolved, or uncertain, or if this standing authorization is revoked.

## Required verification

Before committing, run the checks affected by the change. For repository-wide or foundational changes, run:

```bash
node scripts/agent-doctor.mjs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

Use `node scripts/agent-doctor.mjs --profile web` for frontend/browser work. Report any check that could not be run and the exact sanitized reason.

## Agent skills

### Issue tracker

Product specs and implementation tickets live in GitHub Issues for `Dan-Popescu/PRISMA-PRIM-Suite`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single domain context in `CONTEXT.md`, with durable decisions in `docs/adr/`. See `docs/agents/domain.md`.

### Workflow skills

Use the repository skills under `.agents/skills/` when their descriptions match the task and the active harness exposes them. In particular: sharpen language and decisions before a spec; synthesize approved discussion with `to-spec`; create vertical tickets with `to-tickets`; implement with `implement` and `tdd`; close with `code-review`; reserve the thermo-nuclear and architecture reviews for structural checkpoints.

For autonomous execution of one implementation ticket, use `docs/agents/issue-execution.md`. `docs/agents/local-codex-execution.md` remains a compatibility entry point for existing prompts.
