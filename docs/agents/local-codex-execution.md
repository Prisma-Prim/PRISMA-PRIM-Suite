# Local Codex execution prompt — one issue

Replace `FULL_ISSUE_URL` with the complete URL of the one issue currently on the execution frontier. Start a fresh Codex CLI session from the repository root for every issue.

```text
Implement FULL_ISSUE_URL completely and autonomously in
Dan-Popescu/PRISMA-PRIM-Suite.

This session owns exactly one issue. Do not start any blocked or follow-on issue.
I do not want to perform Git operations or routine technical decisions myself.

Before changing anything:

1. Confirm the repository and current branch, fetch origin, and verify that the
   working tree contains no user changes that could be overwritten.
2. Read the complete issue body and all comments.
3. Confirm every issue listed under “Blocked by” is closed. If not, stop and
   report the blocker without implementing.
4. Read every applicable AGENTS.md in full, then CONTEXT.md, every document and
   ADR referenced by the issue, and the relevant repository skills.
5. Inspect the current implementation and the highest stable public test seam.
6. Restate the issue's observable outcome, exclusions, public module boundary,
   and first failing test in a short execution note. Do not ask me to validate
   routine engineering choices already fixed by the issue.

Execution requirements:

- Create an isolated branch and worktree for this issue from the latest
  origin/main.
- Use the repository's $implement workflow and $tdd when behavior changes.
- Follow red-green-refactor incrementally at the highest stable seam specified
  by the issue. Tests must prove public behavior, not private structure.
- Keep the owning module deep: expose the smallest stable public interface and
  keep provider, persistence, orchestration, and UI implementation details
  private.
- Implement the complete narrow tracer bullet across every required layer.
- Preserve /ui-baseline unless the issue explicitly authorizes a change.
- Take reversible technical decisions autonomously. Do not broaden the issue.
- If a valuable follow-up is discovered, record it in the final report; do not
  implement it silently.
- Never commit secrets, tokens, real Client data, or production bypasses.

Verification and review:

1. Run every targeted test while iterating.
2. Run every command required by the issue, including repository-wide lint,
   typecheck, tests, build, and format checks when listed.
3. For UI work, inspect the real journey in a browser at every named desktop
   and mobile viewport and retain the required deterministic captures.
4. Review the actual final diff against repository Standards first.
5. Review it a second time against the originating issue/Spec.
6. Correct every material finding and rerun affected checks.
7. Run any structural review explicitly required by AGENTS.md or the issue,
   without expanding scope from optional suggestions.

Publication:

- Commit only the issue's changes with an intentional English commit message.
- Push the branch and open one PR targeting `main` whose body includes “Closes
  #N”, the behavior delivered, tests run, browser evidence, decisions taken,
  and remaining limitations.
- Monitor CI and fix failures caused by this PR autonomously.
- When reviews are complete and CI is green, squash-merge the PR and remove the
  issue branch/worktree unless repository protection prevents it.
- Verify the issue is closed, origin/main contains the merge, and the next issue
  was not started.

Stop only for a genuine blocker: missing authentication or permission,
unavailable required external configuration that cannot be simulated, user
changes at risk of being overwritten, a failing external service outside this
issue, or a product ambiguity that would materially change the public contract.
Do not stop for ordinary implementation choices, fixable test failures, merge
conflicts, or formatting issues.

At the end provide:

- issue and merged PR links;
- concise outcome and demo instructions;
- final public interfaces and migrations introduced;
- exact tests/checks and results;
- desktop/mobile evidence paths when applicable;
- decisions made and any deliberately deferred follow-ups;
- confirmation that the branch/worktree was cleaned and no next issue started.
```

## Frontier rule

Run only the first open issue whose blockers are all closed. After its PR is squash-merged, start a new Codex session with the next issue URL and the same prompt.
