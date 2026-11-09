# Structural decisions

**Status:** Local repository rule  
**Owner:** Dan Popescu  
**Issue:** [#1223](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1223)

[Issue execution](issue-execution.md#structural-decisions) says when a session writes a row and when a later session reads it. This file states the place, the columns, and the illustration.

## Source that was checked

`cursor/plugins` revision `6b0300214a09fd6029cfb7077043125758cd1fd2`, [Show me your work](https://github.com/cursor/plugins/blob/6b0300214a09fd6029cfb7077043125758cd1fd2/pstack/skills/show-me-your-work/SKILL.md).

Upstream, on where the log lives:

> By default the log is a working artifact, not committed. Keep it at `decisions.tsv` in the work dir, or `.audit/<task-slug>.tsv` when several efforts run at once, and leave it out of git.
>
> Commit it only when the work is ambitious enough that a reviewer needs the trail to trust the result.

Upstream, on the format:

> A single TSV file, one row per decision. Cells stay single-line. Evidence is a pointer, not prose.

Columns are `ts`, `phase`, `decision`, `why`, `evidence`, and `result`. A wrong call gets a new row that supersedes it. The header is:

```text
ts	phase	decision	why	evidence	result
```

The issue sketched a markdown heading with Decision, Justification, and Evidence lines, and asked for that sketch to be checked against this source before a local choice. The checked format is the TSV. `decision` is what was chosen, `why` is the justification, and `evidence` is the reference.

## Place

Several issues run at once, so the upstream path for that case is the place: `.audit/<issue-number>.tsv` on the issue branch. The open candidates were `AGENTS.md`, one shared file such as `decisions.md`, or an existing mechanism. The checked source names a per-effort TSV, so the place is that file.

A later session resumes from git. Upstream commits the log when a reviewer needs the trail. A structural decision is that case: commit `.audit/<issue-number>.tsv` on the issue branch before the step that depends on it. A workstream with no structural decision has no file. The decisions for issue N are `.audit/N.tsv` on its branch. An absent file means none were preserved.

The row is the record. The pull request links the file and does not copy the row into a second journal. A decision that already belongs in an ADR, a PRD, or the decision record stays there; the row's `evidence` points at that artifact. An owner choice under [shared decisions](issue-execution.md#shared-decisions-for-major-trade-offs) is logged after the owner makes it.

`ts` is an ISO8601 timestamp. `phase` names the phase of the work. `result` is the outcome. When the evidence does not yet settle the choice, `result` is `INCONCLUSIVE` and `evidence` names what is still unchecked.

Log the structural fork. Leave ordinary edits out of the file.

## Illustration

This row is the shape of a schema choice. It is not a migration observed in this repository. When the example is applied, `evidence` names the real schema, the migration plan, and the test result that shows the relationships still hold.

```text
ts	phase	decision	why	evidence	result
2026-11-09T00:00:00Z	schema	move the existing table instead of creating a replacement	preserve identifiers and relationships and avoid a period of dual writes	schema, migration plan, and the test result that shows the relationships still hold	illustration only
```
