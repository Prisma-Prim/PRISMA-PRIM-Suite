# Codex terminal review merge gate

The `Codex terminal review` commit status represents the automated Codex review
state for one exact pull-request head commit. It is produced by
`.github/workflows/codex-terminal-review.yml` and is deliberately separate from
Standards, Spec, CI, and security checks.

## Lifecycle

| State     | Meaning                                                                                                     | Merge effect when the status is required                     |
| --------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pending` | No terminal Codex review or no-findings comment identifies the current head SHA.                            | Blocks.                                                      |
| `failure` | Codex reviewed the current head, but at least one Codex-authored, non-outdated review thread is unresolved. | Blocks.                                                      |
| `success` | Codex produced a terminal signal for the current head and every current Codex thread is resolved.           | Allows this gate; every other required gate must still pass. |

A terminal signal is either a Codex review whose `commit_id` equals the pull
request head or a Codex no-findings comment whose `Reviewed commit` value
identifies that head. A push changes the head, so an earlier success no longer
applies and the new head returns to `pending`. The workflow never sleeps or
guesses whether enough time has passed.

The workflow re-evaluates on pull-request changes, Codex reviews, review
comments, and pull-request conversation comments. GitHub Actions does not expose
review-thread resolution as a workflow trigger. After resolving the last thread
without adding a comment, re-run the most recent gate workflow or dispatch
`Codex terminal review` with the pull-request number. Re-evaluation reads the
current GitHub state and writes the result to the current head SHA.

## Required GitHub configuration

Repository code can publish the status, but it cannot make that status a merge
gate by itself. Configure the default-branch protection rule or repository
ruleset to require the status context named exactly:

```text
Codex terminal review
```

Keep all existing Standards, Spec, CI, and security requirements enabled. The
rule should require branches to be up to date if that is already repository
policy.

As of 2026-08-16, GitHub rejected ruleset access for this private repository
with a plan-upgrade response, and the connected integration could not read
branch protection. Until the owning account or organization has a plan that
supports protected private branches and an administrator adds this required
status, the status is visible but advisory and issue #78 is not fully enforced.

## Human override and audit

There is no repository label, comment phrase, or workflow input that turns a
blocked result into success. Human override belongs in the branch-protection or
ruleset bypass configuration, restricted to the smallest appropriate maintainer
group. GitHub then records the actor and merge in repository audit history.
Using that bypass does not alter or waive any other required gate.

## Fixture verification

The zero-dependency test fixture exercises the public evaluator:

```bash
node --test scripts/validate-codex-review-gate.test.mjs
```

It proves that a missing review is pending, an old-head terminal signal is
invalid, an exact-head signal is accepted, unresolved current Codex threads
block, and resolved or outdated threads do not block.
