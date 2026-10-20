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

Before coding, extend that note with the sensitive cases relevant to the assigned behavior: expected outcome from the issue or its authorities, and the public test seam that will prove it. Consider access loss or Company mismatch, invalidated related records, concurrent writes, retries after failure, and list boundaries only where affected. For a concurrency risk, name the dangerous ordering and a deterministic way to reproduce it. The note is ready when each identified case has an expected outcome and a test seam, or a genuine unresolved blocker. Reuse the issue's existing cases; documentation-only work needs no behavioral scenarios. This preparation adds no review round or product requirement.

## Coordination and context reuse

- Name one session to own routine CI and review monitoring in the existing issue claim. Other agents use its updates rather than polling the same work. Transfer that responsibility explicitly on handoff; independent reviewers still inspect the evidence needed for their review.
- Reuse unchanged material already read in the current session. Read relevant changes when sources change, refresh uncertain facts, and follow the required reading route in a fresh session. Reuse never waives ownership, publication, or final-head merge checks.
- Keep handoffs compact: issue and branch, current commit, decisions with source links, checks and their tested revision, unresolved findings, next action, and monitoring owner. Link to evidence instead of copying full transcripts or logs. Report a changed result or needed action; while a run is unchanged, wait with bounded checks instead of launching duplicate watchers. Report continued waiting honestly when an update is due or the user asks.

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
   A branch that `node scripts/ci-change-scope.mjs --base origin/main` classifies as `docs_only=true` (only Markdown under `docs/` changed) runs `pnpm verify:docs` instead: formatting, the script suite and the documentation-reading API test. CI then skips the heavy families for that pull request by the same rule; every other change runs the workflow with every verification family either executed or covered by the verified reuse rule below.
3. For UI work, inspect the real journey at the desktop and narrow viewports. Write screenshots through Playwright's `testInfo.outputPath(...)`, never commit them, and retrieve the complete pull-request evidence from `browser-evidence-pr-N`. The sharded browser and acceptance jobs each upload their whole `apps/web/test-results/` root, including failure traces and, from acceptance shard 1 only so that no shard overwrites it, the deliberate evidence probe, as `browser-evidence-part-browser-SHARD-RUN_ID` (shards 1–3) and `browser-evidence-part-acceptance-SHARD-RUN_ID` (shards 1–2). The final `quality` job combines all five shard artifacts, whose test directories are disjoint, into `browser/`, `acceptance/` and `acceptance-evidence-probe/` without overwriting them, even after a failed test. A rerun replaces each re-executed shard's source artifact and the combined artifact; a successful shard omitted from a failed-job rerun retains its source evidence from the same immutable run head. If aggregation is interrupted, download all five shard artifacts from the same run (`gh run download RUN_ID --pattern 'browser-evidence-part-*'`). Artifacts are retained for 14 days; a family cancelled before upload may have no evidence.
4. Review the final diff once against repository Standards and once against the originating issue or Spec. The Standards review must report all material violations of the TypeScript discipline when the diff contains TypeScript. Fix what you find before publishing.
5. Publish one focused commit. Squash intermediate commits before the first push.
6. After publication, require the complete GitHub Actions workflow, including its aggregate `quality` gate, to pass on the published head before merge. GitHub CI is the authoritative integration proof and does not replace the targeted local evidence above.

### Verified CI reuse

The workflow owns reuse decisions through `scripts/ci-proof-reuse.mjs`. A successful scope may reuse heavy suites on a push to `main` only for the exact Git tree tested by an earlier complete successful CI run in this repository. A pull request may reuse only API tests when every tracked input outside `apps/web/` is identical to that tested tree; this includes shared packages, lockfiles, scripts, workflow and configuration. The web package manifest is also compared because workspace installation can execute its lifecycle scripts. Frontend unit, browser, real-PostgreSQL acceptance, build and packaging still execute on that PR. Cheap checks and main PostgreSQL cache priming remain required.

A proof must be less than 24 hours old, use the same observed runner image and Node version, identify the actual checkout from the scope log, match the source event's commit, and include all successful, executed verification families. For main reuse, a PR whose frontend suites executed may also name one directly verified full API source with identical non-web inputs. A second level of API reuse is rejected, and skipped frontend suites never create another proof. Missing logs, unknown inputs, API failures and any ambiguity run the full suites. `quality` rejects any unproven skip, failure or cancellation; the scope summary links the source run and tested commit. A green result on a branch head alone is never sufficient: the actual checkout may be a different integration tree.

Do not launch extra CI to estimate savings or repeatedly rerun a budget failure. Retain the five partial browser artifacts and combined evidence for open PRs so failed-only reruns remain possible. Cost estimates are opportunities until measured from physical job executions, deduplicating GitHub's successful-job projections across attempts. A fourfold cost target also requires a separately priced, equal-work runner benchmark; do not buy hosting or claim that target is achieved from workflow estimates.

### Acceptance evidence and review preparation

Apply this procedure in every fresh session, including a handoff between Codex and Claude Code. The issue, repository instructions and pull-request evidence supply the contract; private conversation memory is not a prerequisite.

- Before requesting review, check every acceptance criterion against the complete change. Record a compact mapping from each criterion to its test or other verifiable evidence in the pull request; identify any missing proof or unresolved ambiguity. For documentation, check the requested outcomes, links and consistency with the owning instructions instead of inventing behavioral tests.
- Complete both Standards and Spec self-reviews before publication, fix their findings, and inspect the resulting final diff. For browser or asynchronous work, audit the affected journey's reads, writes and readiness conditions before assertions, together with permissions and state transitions where relevant. Preserve assertion strength and stay within the assigned acceptance contract.
- When addressing a blocking finding, identify its cause and search the entire authorized scope for the same defect pattern. Correct all affected occurrences in the same batch; do not stop at the cited line or broaden the issue into unrelated hardening. Disposition nonblocking findings under the review-round policy below.
- Wait for the requested review to complete, collect its findings, and apply the blocking corrections together. Rerun the affected checks and record the correction, tested revision, results and remaining uncertainties in the pull request. This preparation does not add review rounds or change the stopping rules below.
- Before merge, verify that CI and the required review disposition apply to the exact current head. After a correction, explicitly distinguish evidence for unchanged material from checks rerun on the correction; an earlier green result does not establish that the new head passed.

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
2. Product code may receive one automated review, requested with an `@codex review` comment on the final head, or one review by the repository owner. For documentation and PRD pull requests, agents' applicable Standards/Spec preparation and recorded disposition suffice; do not request an automated review on them. The owner may volunteer a review, but neither owner review nor separate owner confirmation is required.
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
