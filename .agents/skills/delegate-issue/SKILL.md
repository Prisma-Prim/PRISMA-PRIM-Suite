---
name: delegate-issue
description: Prepare, brief, follow and close an issue that a local orchestrator delegates to a subagent.
disable-model-invocation: true
---

# Delegate an issue

A local **orchestrator** hands one issue to one **delegate**, a subagent that delivers it as one pull request through [issue execution](../../../docs/agents/issue-execution.md). The orchestrator readies, prepares, briefs, follows, verifies and cleans up; the delegate keeps its pull request until the merge. Each step holds only what delegating adds, and points to the document that owns every other rule.

The repository is public. Machine-specific facts come from your local notes into the brief and never into the repository: the local database address, personal paths, private material, free disk space, local check quirks and the other sessions at work on the machine.

## Steps

1. **Ready.** Run `node scripts/issue-readiness.mjs <issue>`. In one read it checks the issue's state, the claims in its comments, open pull requests and blockers ([issue execution steps 1 and 2](../../../docs/agents/issue-execution.md#before-changing-anything)), and its sub-issues. The delegate posts the claim. Done when it prints `verdict: ready` and exits 0; otherwise delegate nothing and report its reasons.

2. **Prepare.** Before preparing several worktrees at once, compare free disk space with your notes. Run `git fetch origin`, then `git worktree add -b <type>/<issue>-<slug> .worktrees/<name> origin/main` from the main checkout, and install the dependencies from the lockfile with the new worktree's own `bash scripts/agent-pnpm.sh install --frozen-lockfile`, run inside it. Done when the worktree's `git status` is clean on its new branch at `origin/main` and the install succeeded.

3. **Brief.** The brief is the delegate's whole context. Fill the [brief template](#brief-template), answering every placeholder, with "none" where nothing applies. In flight means every open pull request (`node scripts/pr-status.mjs`) and running delegate whose files the issue may touch. Done when no placeholder remains.

4. **Follow.** Read the delegates' rows of one `node scripts/pr-status.mjs` run instead of many `gh` calls. Answer a delegate's question yourself from the issue and its authorities, and take to the owner only what [AGENTS.md](../../../AGENTS.md#decision-authority) escalates. A delegate that stops before its hand-back gets the brief's hand-back paragraph again. Keep this session until every delegate has handed back: a delegate reports only to the session that started it. Done when every delegate has handed back.

5. **Verify** each hand-back claim before you report it:

   ```text
   gh pr view <pr> --json state,files    # MERGED; the files include the cost record
   gh issue view <issue> --json state    # CLOSED
   git worktree list                     # no line for the worktree
   git branch --list <branch>            # empty
   ```

   Done when every claim matches its output. A leftover worktree or branch goes to step 6; report any other mismatch as found, not as claimed.

6. **Clean up** only after step 5 shows the merge, and only what you prepared: from another checkout, [remove each leftover worktree](../../../docs/agents/environment.md#removing-a-finished-worktree) with `node scripts/remove-worktree.mjs <path> --delete-branch`, and rerun it once a held file it names is released. A blocked delegation keeps its worktree until its pull request merges or the owner drops the issue. Done when `git worktree list` and `git branch --list` show nothing of the merged delegations.

## Brief template

```text
Deliver issue #<issue> "<title>" as one pull request, through merge, following
docs/agents/issue-execution.md; the pull request body's proof follows
docs/agents/acceptance-proof.md. Read the issue and every comment first.

Worktree: <path>, branch <branch>, at origin/main <sha>, dependencies installed.
Work only there.

In flight: <pull requests and delegates that may touch the same files>. Leave
their branches alone. On a conflict, merge origin/main into your branch and push
normally; a published branch is never force-pushed.

Shared machine: run a full API or web suite at most once and targeted tests
otherwise, make no extra copy of the repository, and stop only the processes,
containers and worktrees you started. Write @codex only for the one review
request issue execution allows: anywhere else in GitHub text, even in a code
span, it starts a Codex task.

Cost record: per docs/agents/verification-cost.md, from your own transcript in
<the subagents folder beside this session's transcript>.

Hand-back: do the CI wait yourself, and stay with the pull request until it
merges and your worktree is removed (docs/agents/environment.md, "Removing a
finished worktree"). Only then, or when blocked, report to me, never to the
owner: "#<pr> merged" or "BLOCKED: <reason>", with a short summary in <owner's
language>.

Machine: <from your local notes: database, private material, check quirks, disk,
other sessions' worktrees>.
```

## Cost record

A subagent records its own run as [verification cost](../../../docs/agents/verification-cost.md#building-the-record) describes for a subagent, in the file `<session id>~<agent id>.json`. The brief names the folder that holds its transcript, and step 5 finds that file among the merged pull request's files.
