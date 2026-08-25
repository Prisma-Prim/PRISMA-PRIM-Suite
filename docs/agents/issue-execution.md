# AI agent issue execution — one issue

Use this workflow for Codex Cloud, Codex CLI, Claude Code, and other AI coding harnesses. Replace `FULL_ISSUE_URL` with the complete URL of the single issue on the execution frontier. Start with a fresh session whenever the harness supports it.

## Codex Cloud kickoff

When a GitHub issue defines the implementation contract, launch Codex Cloud from an `@codex` comment on that originating issue. This is the default repository workflow because the task inherits the complete issue body and available comments without depending on agent-phase Internet access.

Do not create a manual Codex Cloud task whose prompt contains only the issue URL. A manual task is acceptable only when its prompt contains the complete execution contract or when the work is fully specified by repository files available to the task.

## Invariant workflow

Every harness must follow these steps even when it cannot perform GitHub or local Git actions itself.

### Before changing anything

1. Read the complete issue body and all available comments.
2. Confirm every issue listed under **Blocked by** is closed. Stop if a blocker remains open.
3. Follow the [repository knowledge reading route](repository-knowledge-system.md#4-fresh-context-reading-route): read every applicable `AGENTS.md`, then use the issue pointers to load only the owning product documents, applicable ADRs, evidence and skills. Read `CONTEXT.md` when domain language or business boundaries are involved.
4. Run `node scripts/agent-doctor.mjs`; use `--profile postgres` when PostgreSQL verification is required, `--profile web` when browser verification is required, or `--profile web-postgres` when the slice needs both. Use the base profile only when neither PostgreSQL nor browser coverage is required. Fix safe setup drift before implementation and record unresolved failures in the final retrospective.
5. Inspect the current implementation and the highest stable public test seam.
6. Restate the observable outcome, exclusions, authority owners, decisions that require escalation, public module boundary, and first failing test in a short execution note.
7. Classify the issue and planned PR as `mechanical`, `product-contract`, or `implementation` using the [complex-feature preflight](complex-feature-preflight.md). Classify semantics rather than file types. For a triggered issue, complete or link the matrix and obtain the exact pre-code Spec approval marker before the first implementation edit. For a narrow low-risk issue, record the exemption marker and a concrete `- Exemption reason:` line. Every issue that a PR closes has exactly one disposition marker.

### Implementation

- Own exactly one issue. Do not start blocked or follow-on work.
- Protect existing user changes. Use an isolated branch or worktree when the harness provides Git access.
- Follow the repository `implement` and `tdd` workflows when behavior changes.
- Work red-green-refactor at the highest stable seam named by the issue.
- Expose the smallest stable public interface and keep implementation details private.
- Complete the narrow tracer bullet across all layers required by the issue.
- Preserve `/ui-baseline` unless the issue explicitly authorizes a change.
- Take reversible technical decisions autonomously without broadening scope.
- Record valuable follow-up work instead of implementing it silently.
- Never commit secrets, tokens, real Client data, or production bypasses.

### Verification and review

1. Run targeted tests while iterating.
2. Run every command required by the issue.
3. For UI work, inspect the real journey at every named viewport and retain deterministic evidence.
4. Review the final diff against repository Standards.
5. Review it again against the originating issue or Spec.
6. Correct every material finding and rerun affected checks.
7. Complete the [agent environment retrospective](agent-environment-retrospective.md), including an explicit no-friction declaration when appropriate.

Complete the whole diff, formatting, Standards review, and Spec review before the first push whenever the harness allows local staging. Publish one focused commit. A GitHub connector that writes one commit per file is not a staging interface: create the blobs, one tree, and one commit instead.

After terminal feedback, collect all findings before changing the branch and publish at most one grouped correction. If another material product-contract wave appears, stop editing and return the issue to preflight. Do not continue a one-finding/one-commit loop.

For a slice that crosses PostgreSQL, migrations, or browser behavior, run the
[local PostgreSQL and browser preflight](local-ci-preflight.md) before deep
review. If it reports a local blocker, trigger the documented early CI workflow
on the pushed draft branch and use that exact-head result as the early seam
evidence. Normal pull-request CI remains authoritative.

For browser evidence:

- write generated screenshots through Playwright's `testInfo.outputPath(...)` or another ignored test-output path;
- never commit generated screenshot binaries to the repository;
- let pull-request CI upload `apps/web/test-results/**/*.png` as `browser-evidence-pr-N`;
- link the successful CI run or its downloadable artifact in the PR body.

## Capability-aware publication

Harness capabilities and user authorization determine publication actions. A task prompt never grants capabilities or permissions the harness does not have.

| Capability                                                              | Required behavior                                                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| No Git or GitHub write access                                           | Produce a tested patch or diff and report the exact publication blocker.                      |
| Git branch and commit access                                            | Create one focused English commit on an isolated issue branch.                                |
| Push and PR access                                                      | Push the branch and open one PR targeting `main`.                                             |
| CI visibility                                                           | Monitor CI and fix failures caused by the PR.                                                 |
| Merge access without task-specific or standing repository authorization | Stop after a green, reviewable PR. Do not merge.                                              |
| Merge access with task-specific or standing repository authorization    | Squash-merge only after reviews and green CI, then clean the issue branch/worktree when safe. |

If `AGENTS.md` records standing repository authorization, it satisfies the authorization requirement for every conformant PR until explicitly revoked. Do not pause to request per-PR confirmation. Readiness remains mandatory: all required checks must be green, Standards and Spec reviews complete, scope conformant, and blocking feedback resolved.

The PR body must include `Closes #N`, the three common classification fields, any applicable conditional evidence, delivered behavior, checks, browser evidence when applicable, decisions, remaining limitations, Standards review, Spec review, and the environment retrospective. Pull-request governance fetches the closing issue and verifies that its preflight disposition and required approval marker match the PR; editing that issue dispatches a fresh check on every affected open PR head. Review-iteration metrics come from GitHub timelines during the five-PR retrospective; authors do not maintain a blocking counter.

## Genuine blockers

Stop only for missing authentication or permission, unavailable required external configuration that cannot be simulated, user changes at risk, an external service failure outside the issue, or a product ambiguity that materially changes the public contract. Ordinary implementation choices, fixable test failures, merge conflicts, and formatting issues are not blockers.

## Final report

Always provide:

- issue and PR links when available;
- concise outcome and demo instructions;
- public interfaces and migrations introduced;
- exact checks and results;
- desktop/mobile evidence paths when applicable;
- decisions and deliberately deferred follow-ups;
- the Agent environment retrospective;
- publication state and any capability or authorization boundary;
- confirmation that no next issue was started.

## Frontier rule

Run only the first open issue whose blockers are closed. Start a fresh session for the next issue only after the current PR has been accepted and merged.
