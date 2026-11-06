# AI agent issue execution — one issue

One session owns one issue and delivers it as one focused pull request. One Codex Cloud task or local session is one ticket worked by one agent, with no internal coordinator, principals or lanes.

## Harness

- Launch Codex Cloud from an `@codex` comment on the originating issue so the task inherits the complete issue body and comments. A manual task needs a prompt or repository files holding the complete contract; an issue URL alone is insufficient.
- Codex Cloud runs targeted checks only: its standard environment has no Chromium and cannot run the [PostgreSQL profile](environment.md#postgresql-profile). GitHub CI runs the heavy verification: the complete suites, the `pnpm verify` families, browser and acceptance journeys, and production image packaging.
- A local harness with a shell, such as Codex CLI or Claude Code, is equivalent and can also run affected PostgreSQL or browser suites.
- A harness that cannot run the targeted checks the issue needs, such as a GitHub connector without a shell, publishes no code; it may draft issues, documentation and reviews. Never publish one commit per file.

## Before changing anything

1. Read the complete issue and its comments. Confirm the issue is open, no open pull request implements it and no other session has claimed it; report an existing implementation or claim instead of duplicating it, and resume only through an explicit handoff. Post a one-line claim naming the harness and branch; an `@codex` launch comment is the claim. Recheck for competing claims before the first commit.
2. Confirm every issue under **Blocked by** is closed; stop if one is open.
3. Follow only the issue's pointers to its owning PRD, cross-cutting PRDs, decision-record sections, ADRs and evidence ([reading route](repository-knowledge-system.md#4-fresh-context-reading-route)). Read `CONTEXT.md` when domain language or business boundaries are involved.
4. Run `node scripts/agent-doctor.mjs`, adding `--profile postgres`, `--profile web` or `--profile web-postgres` when the slice needs PostgreSQL, a browser or both. Fix safe setup drift and note what cannot run.
5. Inspect the current implementation and the highest stable public test seam.
6. Write a short execution note: observable outcome, exclusions, decisions to escalate, public module boundary and first failing test. Add the sensitive cases the behaviour touches (access loss or Company mismatch, invalidated related records, concurrent writes, retries after failure, list boundaries), each with its expected outcome from the issue or its authorities and the seam that proves it; for a concurrency risk, name the dangerous ordering and a deterministic reproduction. The note is ready when every case has an outcome and a seam, or is a genuine blocker. Documentation-only work needs no behavioural scenarios.

## Handoffs

A handoff between sessions, for example from Codex to Claude Code, is compact: issue and branch, current commit, decisions with source links, checks run with their results, unresolved findings and the next action. Link evidence instead of copying transcripts or logs. The receiving session works from the issue, the PR and this procedure, without private conversation history.

## Shared decisions for major trade-offs

Use this procedure for the major delivery decisions that [AGENTS.md](../../AGENTS.md#decision-authority) escalates, and as soon as an unexpectedly large impact emerges; pause further consequential commitments meanwhile.

1. Alert the owner in the user's language, briefly and without unexplained technical terms. Explain the goal and the expected effect on delivery time, cost or the way the project works. Separate observations from estimates and state what is uncertain; invent no figures.
2. Present two or three viable options with their consequences and a recommendation, including keeping the current approach when it is viable.
3. Wait for an explicit choice covering the trade-off, then record its source, scope and agreed limits in the execution note or PR. Reuse that decision within those limits; raise a materially changed trade-off again. Safe independent work and routine authorized work may continue meanwhile.

The step is complete when the owner's choice and its limits are recorded. A repository procedure never justifies hiding an unexpectedly large cost from the owner.

## Implementation

- Own exactly one issue. Blocked and follow-on work stays in its own issue; record valuable follow-ups as new issues.
- Follow the repository `implement` and `tdd` skills when behaviour changes, at the highest stable seam the issue names.
- For any TypeScript implementation, apply the [mandatory TypeScript discipline](typescript-discipline.md) before reading or editing `.ts` or `.tsx` files and keep it active throughout the change.
- Complete the narrow tracer bullet across every layer the issue requires.
- Preserve `/ui-baseline` unless the issue explicitly authorizes a change.
- Work on an isolated branch or worktree when the harness provides Git access.

## Verification before publication

1. Run targeted tests while iterating, then every command the issue requires.
2. Before publishing, run format, lint and type checks and the focused behavioural tests for what changed, plus the affected PostgreSQL or browser suites when the harness provides them. Name in the PR each relevant check that could not run locally; CI runs it. To reproduce a CI failure locally, use the [local integration verifier](local-integration-verifier.md).
3. For UI work, inspect the real journey at desktop and narrow viewports. Write synthetic screenshots through Playwright's `testInfo.outputPath(...)`, keep them out of commits, and inspect the relevant ones before claiming visual evidence.
4. Self-review the final diff twice: against repository Standards and against the originating issue. Standards review must report all material violations of the TypeScript discipline when the diff contains TypeScript. Check every acceptance criterion against the complete change; for browser or asynchronous work, audit the journey's reads, writes and readiness conditions before assertions, with permissions and state transitions where relevant, and keep assertion strength. For documentation, check the requested outcomes, links and consistency with the owning instructions. Fix what you find.
5. Publish one focused commit; squash intermediate commits before the first push.

## CI and merge

CI runs automatically on every pull request update and in GitHub's merge queue. A ruleset protects `main`: pull request required, squash merge only, required check `quality`, no deletion or force push. The merge queue re-tests each queued PR against the current `main`, so an advancing base needs no manual refresh, re-verification or SHA binding. Manual `workflow_dispatch` serves diagnosis only and does not count toward a pull request's required check.

1. Push the branch and open one PR targeting `main`. Its body follows the [pull request template](../../.github/pull_request_template.md); `.agents/skills/pr/SKILL.md` shapes the summary and merge danger.
2. Wait once for the first CI result with a blocking `gh pr checks <n> --watch`, or the harness's equivalent single wait, instead of polling.
3. Merge preconditions: the CI result is green, the [review round](#review-round) disposition is complete, the scope matches the issue and no blocking finding remains. Then run `gh pr merge <n> --squash --auto`; GitHub queues, re-tests and merges the PR, and `Closes #N` closes the issue.
4. When CI is red, diagnose it, including failures in unchanged code that the diff may cause, and push one bounded correction; CI reruns automatically. Read the failed job's annotations (`gh api repos/Prisma-Prim/PRISMA-PRIM-Suite/check-runs/<job id>/annotations`) and the run's step summary before downloading a full log. After two failed complete runs, pause speculative pushes: diagnose with targeted checks and push again once an identified cause is corrected or a missing prerequisite is restored, recording that change in the PR.

Only a successful required check is a pass; queued, cancelled, failed and unexecuted checks are not, and a green result never dismisses a demonstrated blocking defect. A failed merge-queue run removes the PR from the queue; treat it as red. The manual Clerk smoke is separate from CI. For deployment, follow [Railway activation](railway-activation.md#deployment-verification-and-explicit-activation).

## Capability-aware publication

Harness capabilities and the user's authorization decide publication; a task prompt never grants capabilities or permissions the harness lacks.

- Cannot run the targeted checks: publish no code; produce an issue draft, documentation or a review.
- Git commit access without GitHub write access: report the exact publication blocker with the committed branch name.
- Push and PR access: push the branch and open the PR.
- Merge access with the standing authorization in [AGENTS.md](../../AGENTS.md#decision-authority): queue the merge as above. Without that authorization: stop after a green, reviewed PR.

## Review round

Every pull request gets one review round, because repeated review-and-fix cycles on a growing diff do not converge.

1. A product-code PR receives one review: the automated Codex review, the repository owner's, or an independent reviewer the owner authorized. When automation already reviewed the PR on opening or on the ready transition, use that review; otherwise request `@codex review` once. A requested `thermos` review, both passes included, is that one review. For documentation and PRD pull requests, the recorded self-review disposition suffices and owner review is optional.
2. Triage every finding with one rule. A finding **blocks** only when it is a defect inside the changed scope that breaks an acceptance criterion, a security or data-integrity boundary, or a regression against `main`.
3. Fix every blocking finding, plus simple P2 findings (small, local fixes inside the changed scope), in one correction commit and rerun the affected checks. For each finding, identify its cause and correct every occurrence of the same defect pattern in the authorized scope in that commit, without broadening into unrelated hardening. Record every other finding under **Follow-ups** in the PR body; it does not change the branch.
4. At most one confirmation review follows, only when the correction touched authorization, tenancy, migration or Activity Log code. Its findings follow the same triage and lead to no further review.
5. When a correction would exceed a focused fix, or a confirmation review reports new blocking findings, keep the PR open: report the diagnosis and recommended re-scope on the issue and wait for the owner. The re-scoped correction lands on the same PR.

A failed check alone needs no re-scope: keep the branch and PR, and record the diagnosis and next action. A green CI result requests no further review.

## Environment and tooling work

Environment, CI, repository-setting and agent-tooling changes are separate issues the repository owner prioritizes, kept out of product issues; note friction as described in [environment friction](environment-friction.md). Use the simplest available mechanism, such as an operating-system package or an official container image. Apply the shared decision procedure before committing to major delay or cost; the one-hour maximum is a cap, not advance approval. Stop at the agreed budget or that maximum and report instead of building a custom installer or provisioning script.

## Genuine blockers

Stop only for missing authentication or permission, unavailable required external configuration that cannot be simulated, user changes at risk, an external service failure outside the issue, or a product ambiguity that materially changes the public contract. Ordinary implementation choices, fixable test failures, merge conflicts and formatting issues are not blockers.

## Final report

Provide the issue and PR links; the outcome and demo instructions; public interfaces and migrations introduced; checks run with their results, including checks that could not run; desktop and narrow evidence paths for UI work; decisions and deferred follow-ups; publication and merge state with any capability or authorization boundary; and confirmation that no next issue was started.

## Frontier rule

Run only the first open issue whose blockers are closed. Start a fresh session for the next issue only after the current PR has merged.
