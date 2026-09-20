# AI agent issue execution — one issue

Use this workflow for Codex Cloud, Codex CLI, Claude Code, and other AI coding harnesses. Own exactly one issue per fresh session and deliver it as one focused pull request.

## Harness

- The default harness is Codex Cloud launched from an `@codex` comment on the originating issue, so the task inherits the complete issue body and comments. A manual task is acceptable only when its prompt or repository files contain the complete contract; an issue URL alone is insufficient.
- A local harness with a shell, such as Codex CLI or Claude Code, is equivalent when it can run the targeted checks required by the issue and, for PostgreSQL or browser slices, the matching doctor profile and affected suites.
- A harness that cannot execute the repository checks, such as a GitHub connector without a shell, must not publish code. It may draft issues, documentation, and reviews. Never publish one commit per file.

## Before changing anything

1. Read the complete issue body and all available comments. Confirm the issue is still open, inspect open pull requests for an implementation of that issue, and check the comments for another active session claim. Stop and report an existing implementation or active claim instead of starting a duplicate; resume only through an explicit handoff. Before implementation, post a one-line claim on the issue identifying the harness and branch. An existing `@codex` launch comment for this session serves as its claim. Recheck for competing claims before the first commit; a comment is a coordination signal, not an atomic lock.
2. Confirm every issue listed under **Blocked by** is closed. Stop if a blocker remains open.
3. Read every applicable `AGENTS.md`, then follow only the issue's pointers to its owning PRD, cross-cutting PRDs, decision record sections, ADRs, and evidence, as described in the [fresh-context reading route](repository-knowledge-system.md#4-fresh-context-reading-route). Read `CONTEXT.md` when domain language or business boundaries are involved.
4. Run `node scripts/agent-doctor.mjs`; use `--profile postgres` when PostgreSQL verification is required, `--profile web` when browser verification is required, or `--profile web-postgres` when the slice needs both. Fix safe setup drift before implementation and note anything that cannot run.
5. Inspect the current implementation and the highest stable public test seam.
6. Restate the observable outcome, exclusions, decisions that require escalation, public module boundary, and first failing test in a short execution note.

## Implementation

- Own exactly one issue. Do not start blocked or follow-on work.
- Protect existing user changes. Use an isolated branch or worktree when the harness provides Git access.
- Follow the repository `implement` and `tdd` workflows when behavior changes.
- For any TypeScript implementation, apply the [mandatory TypeScript discipline](typescript-discipline.md) before reading or editing `.ts` or `.tsx` files and keep it active throughout the change.
- Work red-green-refactor at the highest stable seam named by the issue.
- Expose the smallest stable public interface and keep implementation details private.
- Complete the narrow tracer bullet across all layers required by the issue.
- Preserve `/ui-baseline` unless the issue explicitly authorizes a change.
- Take reversible technical decisions autonomously without broadening scope.
- Record valuable follow-up work as a separate issue instead of implementing it silently.
- Never commit secrets, tokens, real Client data, or production bypasses.

## Verification before publication

1. Run targeted tests while iterating, then every command required by the issue.
2. Before publication, run the appropriate local format, lint, and type checks, focused behavioral tests, and every affected PostgreSQL or browser suite. For authorization, tenancy, migrations, data integrity, Activity Log, other sensitive changes, or difficult diagnosis, run the stronger `pnpm verify` gate when the environment supports it. Name every relevant check that could not run locally in the pull request.
3. For UI work, inspect the real journey at the desktop and narrow viewports. Write screenshots through Playwright's `testInfo.outputPath(...)`, never commit them, and let pull-request CI upload `apps/web/test-results/**/*.png` as `browser-evidence-pr-N`.
4. Review the final diff once against repository Standards and once against the originating issue or Spec. The Standards review must report all material violations of the TypeScript discipline when the diff contains TypeScript. Fix what you find before publishing.
5. Publish one focused commit. Squash intermediate commits before the first push.
6. After publication, require the complete GitHub Actions workflow to pass on the published head before merge. GitHub CI is the authoritative integration proof and does not replace the targeted local evidence above.

## Capability-aware publication

Harness capabilities and user authorization determine publication actions. A task prompt never grants capabilities or permissions the harness does not have.

| Capability                                             | Required behavior                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Cannot run the local checks required by the issue      | Do not publish code. Produce an issue draft, documentation, or a review instead.  |
| Git commit access without GitHub write access          | Report the exact publication blocker together with the committed branch name.     |
| Push and PR access                                     | Push the branch and open one PR targeting `main` using the pull request template. |
| CI visibility                                          | Monitor CI and fix failures caused by the PR within the review round below.       |
| Merge access without standing repository authorization | Stop after a green, reviewed PR. Do not merge.                                    |
| Merge access with standing repository authorization    | Squash-merge after the review round, then delete the issue branch.                |

The pull request body follows `.github/pull_request_template.md`: outcome and `Closes #N`, scope, verification evidence, review disposition, follow-ups, and an [environment friction](environment-friction.md) section only when friction occurred.

## Review round

Every pull request gets at most one review round. The rule exists because repeated review-and-fix cycles on a growing diff do not converge.

1. Wait for green CI on the published head.
2. Product code may receive one automated review, requested with an `@codex review` comment on the final head, or one review by the repository owner. Documentation and PRD pull requests are reviewed by the repository owner only; do not request an automated review on them.
3. Triage every finding with one rule. A finding **blocks** only when it is a defect inside the changed scope that breaks an acceptance criterion, a security or data-integrity boundary, or a regression against `main`. Every other finding, including missing edge cases outside the acceptance criteria, style preferences, and hardening suggestions, is recorded under **Follow-ups** in the pull request body and does not change the branch.
4. Apply all blocking findings in one correction commit, rerun the local checks affected by the correction, and let the complete CI workflow run. Use `pnpm verify` for a sensitive correction or when the broader gate is needed to diagnose the finding. Do not request another review. One confirmation review is allowed only when the correction touched authorization, tenancy, migration, or Activity Log code; its findings follow the same triage and cannot lead to a third review.
5. Stop when the correction would exceed a focused fix, when a confirmation review reports new blocking findings, or when CI fails twice on the same pull request for non-trivial reasons. Close the pull request, report the diagnosis and the recommended re-scope on the issue, and end the session. A fresh session starts only after the owner has re-scoped the issue.
6. Merge under standing authorization when CI is green, the review round is complete, and the scope matches the issue.

## Environment and tooling work

Environment, CI, and agent-tooling changes are separate issues prioritized by the repository owner; never fold them into a product issue. Use the simplest available mechanism, such as an operating-system package or an official container image, and time-box the attempt to one hour. If the simplest mechanism does not work within that budget, stop and report instead of building a custom installer or provisioning script.

## Genuine blockers

Stop only for missing authentication or permission, unavailable required external configuration that cannot be simulated, user changes at risk, an external service failure outside the issue, or a product ambiguity that materially changes the public contract. Ordinary implementation choices, fixable test failures, merge conflicts, and formatting issues are not blockers.

## Final report

Always provide:

- issue and PR links when available;
- concise outcome and demo instructions;
- public interfaces and migrations introduced;
- exact checks and results, including checks that could not run;
- desktop and narrow evidence paths when applicable;
- decisions and deliberately deferred follow-ups;
- publication state and any capability or authorization boundary;
- confirmation that no next issue was started.

## Frontier rule

Run only the first open issue whose blockers are closed. Start a fresh session for the next issue only after the current PR has been accepted and merged.
