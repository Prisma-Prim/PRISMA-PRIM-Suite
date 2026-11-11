# AI agent issue execution — one issue

One session owns one issue and delivers it as one focused pull request. One Codex Cloud task or local session is one ticket worked by one agent, with no internal coordinator, principals or lanes.

## Harness

- Launch Codex Cloud from ChatGPT Codex, with a prompt or repository files holding the complete issue contract; an issue URL alone is insufficient. A GitHub comment mention starts an unverified legacy environment instead.
- [Codex Cloud](environment.md#codex-cloud-environment) has Chromium and Docker PostgreSQL: use the `web` doctor and `node scripts/managed-postgres.mjs -- <command>`. GitHub CI runs the heavy verification: the complete suites, the `pnpm verify` families, browser and acceptance journeys, and production image packaging.
- A local harness with a shell, such as Codex CLI or Claude Code, is equivalent and can also run affected PostgreSQL or browser suites.

## Before changing anything

1. Read the complete issue and its comments. Confirm the issue is open, no open pull request implements it and no other session has claimed it; report an existing implementation or claim instead of duplicating it, and resume only through an explicit handoff. Post a one-line claim naming the harness and branch; an `@codex` launch comment is the claim. Recheck for competing claims before the first commit.
2. Confirm every issue under **Blocked by** is closed; stop if one is open.
3. Follow only the issue's pointers to its owning PRD, cross-cutting PRDs, decision-record sections, ADRs and evidence ([reading route](repository-knowledge-system.md#4-fresh-context-reading-route)). Read `CONTEXT.md` when domain language or business boundaries are involved.
4. Run `node scripts/agent-doctor.mjs`, adding `--profile postgres`, `--profile web` or `--profile web-postgres` when the slice needs PostgreSQL, a browser or both. In Codex Cloud, run `bash scripts/codex-cloud-start.sh` instead; it starts PostgreSQL and runs the `web-postgres` doctor. Fix safe setup drift and note what cannot run.
5. Inspect the current implementation and the highest stable public test seam.
6. Write a short execution note: observable outcome, exclusions, decisions to escalate, public module boundary and first failing test. Add the sensitive cases the behaviour touches (access loss or Company mismatch, invalidated related records, concurrent writes, retries after failure, list boundaries), each with its expected outcome from the issue or its authorities and the seam that proves it; for a concurrency risk, name the dangerous ordering and a deterministic reproduction. The note is ready when every case has an outcome and a seam, or is a genuine blocker. Documentation-only work needs no behavioural scenarios.

## Handoffs

A handoff between sessions, such as Codex to Claude Code, is compact: issue and branch, current commit, decisions with source links, checks run with their results, unresolved findings and the next action. Link evidence instead of copying transcripts or logs. The receiving session works from the issue, the PR and this procedure, without private conversation history.

## Structural decisions

On long-running work, append a structural decision to `.audit/<issue-number>.tsv` and commit that file on the issue branch before a step that depends on it. Checked against upstream, that per-issue file is the place. Structural means a change to the data model, a responsibility boundary, a public contract, compatibility, a migration, or a hard-to-reverse trade-off. On resume, read the file with the issue and check each row against the current code. Columns and the table-move illustration: [structural decisions](structural-decisions.md).

## Shared decisions for major trade-offs

Use this procedure for the major delivery decisions that [AGENTS.md](../../AGENTS.md#decision-authority) escalates, and as soon as an unexpectedly large impact emerges; pause further consequential commitments meanwhile.

1. Alert the owner in the user's language, briefly and without unexplained technical terms. Explain the goal and the expected effect on delivery time, cost or the way the project works. Separate observations from estimates and state what is uncertain; invent no figures.
2. Present two or three viable options with their consequences and a recommendation, including keeping the current approach when it is viable.
3. Wait for an explicit choice covering the trade-off, then record its source, scope and agreed limits in the execution note or PR. Reuse that decision within those limits; raise a materially changed trade-off again. Safe independent and routine authorized work may continue meanwhile.

A repository procedure never justifies hiding an unexpectedly large cost from the owner.

## Implementation

- Blocked and follow-on work stays in its own issue; record valuable follow-ups as new issues.
- Follow the repository `implement` and `tdd` skills when behaviour changes, at the highest stable seam the issue names.
- For any TypeScript implementation, apply the [mandatory TypeScript discipline](typescript-discipline.md) before reading or editing `.ts` or `.tsx` files and keep it active throughout the change.
- Complete the narrow tracer bullet across every layer the issue requires.
- Preserve `/ui-baseline` unless the issue explicitly authorizes a change.
- Work on an isolated branch or worktree when the harness provides Git access.

## Verification before publication

1. Run targeted tests while iterating, then every command the issue requires.
2. Before publishing, run format, lint and type checks and the focused behavioural tests for what changed, plus the affected PostgreSQL or browser suites when the harness provides them. Name in the PR each relevant check that could not run locally; CI runs it. To reproduce a CI failure locally, use the [local integration verifier](local-integration-verifier.md).
3. For UI work, inspect the real journey at desktop and narrow viewports. Write synthetic screenshots through Playwright's `testInfo.outputPath(...)`, keep them out of commits, and inspect the relevant ones before claiming visual evidence.
4. Self-review the final diff twice: against repository Standards and the originating issue. Standards review must report all material violations of the TypeScript discipline when the diff contains TypeScript. Check every acceptance criterion against the complete change; for browser or asynchronous work, audit the journey's reads, writes and readiness conditions before assertions, with permissions and state transitions where relevant, and keep assertion strength. For documentation, check the requested outcomes, links and consistency with the owning instructions. Fix what you find.
5. Publish one focused commit; squash intermediate commits before the first push.

## Acceptance proof

The PR body's Acceptance proof section gives each acceptance criterion, or each claim when no issue closes, a test that passed in the same CI run, plus desktop and narrow acceptance screenshots for UI; `quality` blocks the merge otherwise. An exception needs an approver's comment; rerun the failed job after any edit. No workflow, comment or label may start Claude for proof. [Acceptance proof](acceptance-proof.md) has the format and details.

## CI and merge

CI runs automatically on every pull request update. A ruleset protects `main`: pull request required, squash merge only, required check `quality`, no deletion or force push. No merge queue (owner decision, 2026-11-07): the PR's green `quality` gates the merge; an advancing base needs no refresh, re-verification or SHA binding. Manual `workflow_dispatch` serves diagnosis only and does not count toward a pull request's required check.

1. Push the branch and open one PR targeting `main`. Its body follows the [pull request template](../../.github/pull_request_template.md); `.agents/skills/pr/SKILL.md` shapes the summary and merge danger.
2. Wait once for the first CI result with a blocking `gh pr checks <n> --watch`, or the harness's equivalent single wait, instead of polling.
3. Merge preconditions: the CI result is green, the [review round](#review-round) disposition is complete, the scope matches the issue and no blocking finding remains. Then run `gh pr merge <n> --squash --auto`; GitHub merges the PR once `quality` is green, and `Closes #N` closes the issue. When CI is already green, GitHub refuses auto-merge; merge with `gh pr merge <n> --squash --match-head-commit <sha>`.
4. When CI is red, diagnose it, including failures in unchanged code that the diff may cause, and push one bounded correction; CI reruns automatically. Read the failed job's annotations (`gh api repos/Prisma-Prim/PRISMA-PRIM-Suite/check-runs/<job id>/annotations`) and the run's step summary before downloading a full log. After two failed complete runs, pause speculative pushes: diagnose with targeted checks and push again once an identified cause is corrected or a missing prerequisite is restored, recording that change in the PR.

Only a successful required check is a pass; queued, cancelled, failed and unexecuted checks are not, and a green result never dismisses a demonstrated blocking defect. Open `main-red` issues mean `main` is red. If `main` turns red after a merge, revert the offending PR, fix forward and tell the owner. The manual Clerk smoke is separate from CI. For deployment, follow [Railway activation](railway-activation.md#deployment-verification-and-explicit-activation).

## Capability-aware publication

Harness capabilities and the user's authorization decide publication; a task prompt never grants capabilities or permissions the harness lacks.

- Cannot run the targeted checks, such as a GitHub connector without a shell: publish no code; produce an issue draft, documentation or a review.
- Git commit access without GitHub write access: report the exact publication blocker with the committed branch name.
- Push and PR access: push the branch and open the PR.
- Merge access with the standing authorization in [AGENTS.md](../../AGENTS.md#decision-authority): queue the merge as above. Without that authorization: stop after a green, reviewed PR.

## Review round

Every pull request gets one review round, because repeated review-and-fix cycles on a growing diff do not converge.

1. A product-code PR receives one review: the automated Codex review, the repository owner's, or an independent reviewer the owner authorized. Use an automatic review made on opening or on the ready transition; otherwise request `@codex review` once. A requested `thermos` review, both passes included, is that one review. For documentation and PRD pull requests, the recorded self-review disposition suffices and owner review is optional.
2. Triage every finding with one rule. A finding **blocks** only when it is a defect inside the changed scope that breaks an acceptance criterion, a security or data-integrity boundary, or a regression against `main`.
3. Act only on a finding you can demonstrate with a failing test or command output. Fix every blocking finding, plus simple P2 findings (small, local fixes inside the changed scope), in one correction commit and rerun the affected checks. For each, identify its cause and correct every occurrence of the same defect pattern in the authorized scope, without broadening into unrelated hardening. Record every other finding, with the reason, under **Follow-ups** in the PR body; it does not change the branch.
4. At most one confirmation review follows, only when the correction touched authorization, tenancy, migration or Activity Log code. Its findings follow the same triage and lead to no further review.
5. When a correction would exceed a focused fix, or a confirmation review reports new blocking findings, keep the PR open: report the diagnosis and recommended re-scope on the issue and wait for the owner. The re-scoped correction lands on the same PR.
6. Answer every review thread with its disposition: fixed in `<commit>`, follow-up `#N` (an issue you open or link), or not valid, with the reason. Only then resolve it with GraphQL `resolveReviewThread`. Threads opened after the correction commit get the same answers and, per steps 4–5, no further correction. Resolved threads are a merge precondition: the ruleset refuses the merge otherwise.

A failed check alone needs no re-scope: keep the branch and PR, and record the diagnosis and next action. A green CI result requests no further review.

## Environment and tooling work

Environment, CI, repository-setting and agent-tooling changes are separate issues the repository owner prioritizes; note friction per [environment friction](environment-friction.md). Use the simplest available mechanism, such as an operating-system package or an official container image. Apply the shared decision procedure before committing to major delay or cost; the one-hour maximum is a cap, not advance approval. Stop at the agreed budget or that maximum and report instead of building a custom installer or provisioning script.

## Genuine blockers

Stop only for missing authentication or permission, unavailable required external configuration that cannot be simulated, user changes at risk, an external service failure outside the issue, or a product ambiguity that materially changes the public contract. Ordinary implementation choices, fixable test failures, merge conflicts and formatting issues are not blockers.

## Final report

Provide the issue and PR links; the outcome and demo instructions; public interfaces and migrations introduced; checks run with their results, including checks that could not run; desktop and narrow evidence paths for UI work; decisions and deferred follow-ups; publication and merge state with any capability or authorization boundary; and confirmation that no next issue was started.

Report the verification run's [cost record](verification-cost.md); its ledger line ships in the pull request.

## Frontier rule

Run only the first open issue whose blockers are closed. Start a fresh session for the next issue only after the current PR has merged.
