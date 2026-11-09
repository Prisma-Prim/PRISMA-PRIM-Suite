# Delivery proof

**Status:** Local repository rule  
**Owner:** Dan Popescu  
**Issues:** [#1234](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1234), [#1235](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1235), [#1236](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1236), [#1219](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1219)

This file is the active rule. Quoted upstream sentences stay labeled. [Issue execution](issue-execution.md) still owns which checks to run and how to name a check that could not run.

## Before claiming done

Upstream, `cursor/plugins` revision `6b0300214a09fd6029cfb7077043125758cd1fd2`, [Prove It Works](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-prove-it-works/SKILL.md):

> Verify every task output by checking the real thing directly. Do not infer from proxies, self-reports, or "it compiles."

Local adaptation: a completion claim names an artifact a reviewer can open. The artifact is a command output, a log path, a test report, or a demonstration. It states what ran, what was skipped, and what failed. A sentence or template field that only says verified is not that artifact. A result that only shows the code compiles does not prove the outcome.

## Prose, once, before delivery

`/poteto-mode` is an opt-in skill. The plugin README says to pick it from the `/` menu before the task. Plain enter attaches it to one message. Option+enter or alt+enter keeps it as a custom mode until you exit. This repository does not install that mode and does not add a hook.

The installed skill sends any prose surface, the reply included, to unslop, and says to write the reply clean as you draft it because a cleanup pass after drafting does not remove the patterns. That is continuous review.

Local override: review prose once, on the deliverable, before publication. Deliverables are the pull request body, the issue body, and repository documentation a person will read. Do not intercept each sentence while drafting, and do not apply this pass to working chat.

[`.agents/skills/deslop/SKILL.md`](../../.agents/skills/deslop/SKILL.md) reviews the code diff. It is a different pass.

Delivery checklist, adapted from the pinned [unslop](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/unslop/SKILL.md) skill, not a copy of it:

- Delete a filler phrase that adds no fact.
- Name a source or delete a vague attribution.
- State the point in one direction.
- Use sentence case headings.
- A colon may introduce a list. It is not a mid-sentence connector.

## A repeated mistake

Upstream, same revision, [Encode Lessons in Structure](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-encode-lessons-in-structure/SKILL.md):

> If the lesson needs judgment and cannot be encoded, make the instruction more prominent and add an example of the failure mode.

The pinned [correct](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/correct/SKILL.md) skill counts a class once it has happened twice, then prefers architecture, types, a check whose error names the fix, and a test. Docs come last.

Local procedure:

1. Record the first occurrence with a source id, a file, and a date.
2. After a second separate occurrence of the same class, encode it in architecture, types, or an executable check, and cite both occurrences.
3. Do not add that check from one anecdote.

On 2026-11-08 the subjects of the last 200 commits on `origin/main` at `0ddc70322435f81be903e7a5df1cfc9f6ee57057`, and the commits whose subject matches revert, did not establish two occurrences of one class. That search does not prove older history has no class. This change adds no lint, type, or CI check, and no model judge.

An exception needs its reason beside the check.

## A reported number

Upstream, same revision, [Explain the Number](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/principle-explain-the-number/SKILL.md):

> Keep the evidence with the number. Put the run count, the spread, and the limiter in the notes or a linked artifact.

Local rule: [measurement evidence](measurement-evidence.md). Label every reported figure as an actual measurement, a result on prepared examples, unverified declared data, or an estimate. An estimate is not an actual measurement. A prepared or declared result is not validation of the system. A failed, interrupted, or partial run stays visible and is not a complete result.
