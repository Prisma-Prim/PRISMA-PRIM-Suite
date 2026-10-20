# AI coding agent repository instructions

## Product boundary

This repository contains PRISMA-PRIM Suite. Implement only the scope of the assigned GitHub issue. Do not infer missing prices, legal clauses, certification decisions, or business rules.

Before changing business behaviour, read the complete issue, `CONTEXT.md`, and the relevant ADRs in `docs/adr/`. Use the canonical domain terms in code, tests, issues, and documentation.

While product reconciliation is active, read `docs/product/consolidated-product-decision-record.md` before proposing or changing product scope, tenancy, Company/Client/Project/Task/Document boundaries, authorization, integrations, roadmap sequencing, or AI priorities. The record preserves approved rationale; implementation still requires an approved PRD or GitHub issue.

When drafting, reviewing or decomposing product work, also read `docs/product/prd-index.md` and `docs/product/specification-and-ticketing-standard.md`. Treat the linked PRD as the canonical behaviour source, keep tracker issues concise, and create only vertical implementation issues whose readiness blockers are closed.

The accepted Prisme & lumière direction in [#225](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/225) is the preferred evolving visual reference for its production slices. Preserve the Atlas Blue mockup at `/ui-baseline` as a recoverable synthetic snapshot; neither visual reference proves implemented business behavior.

For product UI work under #225, ground visual decisions in its accepted reference and the assigned issue; read the [delivered frame provenance](apps/web/src/production-shell/prisme/README.md) when continuing that integration. Do not revive rejected historical directions or invent an independent visual system. The former design gate and T00 no longer block production work. Implement the assigned vertical feature issue without treating the baseline as a frozen final design or smuggling in unrequested business behaviour.

## Repository knowledge system

The repository must contain the durable context required for a fresh agent to execute one assigned issue without private conversation history. Each fact has one authoritative owner; issues and documents link to that owner instead of copying it. Keep the reading route targeted to the assigned issue and remove stale instructions when their replacement is delivered.

Before creating or restructuring documentation, reconciliation artifacts, evidence matrices, external reports, or fresh-agent reading routes, read [Repository knowledge and deliverable system](docs/agents/repository-knowledge-system.md).

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
- Before reading or editing any `.ts` or `.tsx` file, read and apply the [mandatory TypeScript discipline](docs/agents/typescript-discipline.md). It is the repository default for every TypeScript implementation and pull-request review, whether or not a skill was named.
- Do not bypass the shared TypeScript, ESLint, or Prettier configuration.
- Every schema change requires a reviewed Drizzle migration committed to the repository.
- Never use `drizzle-kit push` against production.
- Never commit secrets or real client documents.
- Preserve the boundary between confirmed, inferred, missing, and contradictory AI-extracted information.

## Delivery workflow

- Use a fresh AI-agent session for one GitHub issue and deliver only that issue as one narrow, end-to-end tracer bullet. A slice may cross schema, API, UI, and tests when that makes the behaviour complete.
- Work from a harness that can run the local checks required by the issue and `docs/agents/issue-execution.md`. The default is Codex Cloud launched from an `@codex` comment on the originating issue; a local harness with a shell, such as Codex CLI or Claude Code, is equivalent. A harness that cannot execute those checks, such as a GitHub connector without a shell, must not publish code. It may draft issues, documentation, and reviews.
- Follow [AI agent issue execution](docs/agents/issue-execution.md), beginning with its [issue ownership check and session claim](docs/agents/issue-execution.md#before-changing-anything). Its implementation, verification, and review rules are invariant; Git, GitHub, CI, and merge actions remain capability- and authorization-dependent.
- Run `node scripts/agent-doctor.mjs` before editing. Use `--profile postgres` for PostgreSQL work, `--profile web` for browser work, and `--profile web-postgres` only when the same slice needs both.
- Start with a failing test at the highest stable seam that can prove the issue's behaviour, then follow red-green-refactor.
- Give each owning module the narrowest stable public interface that completes the slice. Prefer tests through that interface, the API, or the user interface over tests coupled to implementation details.
- Run the targeted local verification required by `docs/agents/issue-execution.md` before publication. Publish one focused commit and one pull request per issue.
- Keep the branch green after every coherent step. Do not begin blocked or follow-on issues.
- Keep scope explicit. Record valuable follow-up work as a separate issue rather than implementing it silently.
- Do not create process, tooling, or environment work from inside a product issue. Note avoidable environment friction in the pull request as described in `docs/agents/environment-friction.md`; open an `agent-friction` issue only when the same friction blocked a required check twice, and implement it only after the repository owner prioritizes it.
- Run `thermo-nuclear-code-quality-review` after structurally significant slices and at milestone boundaries when that repository skill is available, not as a reason to expand every small issue.
- Run `improve-codebase-architecture` periodically after several business slices exist when that repository skill is available. Treat its output as candidate work requiring a separate decision or issue.

## Review policy

Each pull request receives one self-review and at most one review round. `docs/agents/issue-execution.md` owns the exact sequence; the rules are:

- Before publication, review the final diff once against repository Standards and once against the originating issue, and fix what you find.
- Apply the [acceptance evidence and review preparation](docs/agents/issue-execution.md#acceptance-evidence-and-review-preparation) procedure in every session: verify the complete acceptance contract before requesting review, and investigate the same defect pattern throughout the authorized scope when addressing a finding. Keep the evidence and review disposition in the pull request so another session can resume without private conversation history.
- After CI is green, product code may receive one automated review on the final head. For documentation and PRD pull requests, agents' applicable Standards/Spec preparation and recorded disposition suffice; neither owner review nor separate owner confirmation is required.
- A finding blocks only when it is a defect inside the changed scope that breaks an acceptance criterion, a security or data-integrity boundary, or a regression against `main`. Every other finding is recorded as a follow-up in the pull request body and does not change the branch.
- Apply all blocking findings in one correction commit. Do not request another review after it; a single confirmation review is allowed only when the correction touched authorization, tenancy, migration, or Activity Log code, and it cannot lead to a third.
- If the correction would exceed a focused fix, or CI fails twice on the same pull request for non-trivial reasons, stop: close the pull request, report the diagnosis on the issue, and start a fresh session after the owner re-scopes it.

## Decision authority

- Escalate product decisions that would change observable business rules, prices, legal clauses, certification decisions, permissions, workflow meaning, or issue acceptance criteria when the assigned issue and its references do not decide them.
- Take reversible technical decisions autonomously when they stay inside the issue's public boundary and comply with the durable technical decisions above. Document consequential choices in the pull request.
- Stop for a genuine external or product blocker. Resolve ordinary implementation choices, fixable check failures, and formatting issues without handing routine work back to the user.
- The repository owner has granted standing authorization for AI agents with merge access to squash-merge conformant PRs without asking again. Merge only after every required check is green, the review round is complete, the final scope matches the issue, and no blocking finding remains. Stop instead of merging if any precondition is failed, unresolved, or uncertain, or if this standing authorization is revoked.

## Required verification

Run the doctor before editing:

```bash
node scripts/agent-doctor.mjs
```

Before publication, run the appropriate local format, lint, and type checks, focused behavioral tests, and every affected PostgreSQL or browser check. For authorization, tenancy, migrations, data integrity, Activity Log, other sensitive changes, or difficult diagnosis, use `pnpm verify` as the stronger complete local gate when the environment supports it. Use the matching doctor profile for PostgreSQL or browser work, and report every relevant check that could not run with the exact sanitized reason in the pull request.

The published head must pass the complete GitHub Actions workflow before merge. GitHub CI is the authoritative integration gate; targeted local checks provide fast evidence and do not waive any CI, review, scope, or merge requirement.

## Agent skills

### Issue tracker

For issue or pull-request work, read `docs/agents/issue-tracker.md` for the canonical repository and publication interface.

### Domain docs

This repository uses a single domain context in `CONTEXT.md`, with durable decisions in `docs/adr/`. See `docs/agents/domain.md`.

### Workflow skills

Use the repository skills under `.agents/skills/` when their descriptions match the task and the active harness exposes them. In particular: sharpen language and decisions before a spec; synthesize approved discussion with `to-spec`; create vertical tickets with `to-tickets`; implement with `implement` and `tdd`; close with `code-review`; reserve the thermo-nuclear and architecture reviews for structural checkpoints.

For autonomous execution of one implementation ticket, use `docs/agents/issue-execution.md`. `docs/agents/local-codex-execution.md` remains a compatibility entry point for existing prompts.
