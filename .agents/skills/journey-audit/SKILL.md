---
name: journey-audit
description: Walk acceptance journeys by role and screen width, then file one issue per confirmed inconsistency and an audit report. Started only by a person.
disable-model-invocation: true
---

# Journey audit

An **audit** walks journeys of the [journey map](journey-map.md) as each of their roles, at desktop and narrow widths, on a fresh fictional dataset. At every step it takes a screenshot and checks it against the owning PRD. It reports only **confirmed** inconsistencies, one issue each, and ends with an audit report that holds the coverage table and the cost record. It fixes nothing; each finding is its own issue.

## Who starts an audit, and when

- A person starts a Claude audit, in a session they launch explicitly for it. No CI step, workflow, comment command, label, schedule or webhook may start Claude to audit, review or produce proof ([owner clarification on #1275](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1275)). Codex automation remains allowed.
- Run an audit after a batch of features, and before a delivery is shown to the first tenant.
- The person names the scope: journeys of the map, roles, and widths (both by default). A scope given as screens or screenshots maps to journeys through the map's [Sections](journey-map.md#sections) table.

## Public and private mode

**Public mode** is the default: the journey fixtures' fictional Companies, Clients and members, on a new isolated database. Keep screenshots, traces and drafts in an audit folder outside the clone.

**Private mode** audits the first tenant's real dossier:

- It runs only on the owner's machine, against the private replay data ([Certification Case PRD §20.3](../../../docs/product/release-4-certification-case-prd.md#203-private-pilot-verification)), in a session the owner starts. Never in Codex Cloud, CI or on another machine.
- Screenshots, traces, the audit report and finding drafts stay in the owner's private folder outside Git. They never enter CI, issues, pull requests, commits or cost-ledger notes; the audit report is not posted.
- Each public finding issue restates the problem with synthetic data: fictional names, numbers, dates and text, reproduced on a fictional dataset when possible. It carries no real screenshot, name, number or document text.
- The agent refuses to post real data publicly. Asked to put a private screenshot, value or text into an issue, comment, pull request, commit or CI artifact, it declines, says why, and offers the synthetic restatement.

## Steps

1. **Scope.** Note the start time in UTC. List the journey × role × width cells you will walk; they become the coverage table.
2. **Start** the application for each journey, per harness, as the [verify skill](../verify/SKILL.md) does:
   - Claude Code or Codex on local Windows: start a disposable `postgres:17` container on loopback, export `TEST_DATABASE_URL` for its `*_test` database, then `pnpm verify:journey <journey>`.
   - Claude Code or Codex on local Linux or macOS: `node scripts/managed-postgres.mjs -- pnpm verify:journey <journey>`.
   - Codex Cloud, public mode only: `node scripts/agent-doctor.mjs --profile web --readiness-profile cloud`, then `node scripts/managed-postgres.mjs -- pnpm verify:journey <journey>`.

   Add `--output <audit folder>/baseline` so the evidence stays in the audit folder. The run builds the API and the web application, then replays the scripted journey at both widths, each on a new isolated database with the fictional members of the acceptance setup. Its screenshots are the baseline. A failure that reproduces is a finding; when the environment cannot run the journey, mark its cells blocked with the reason.

3. **Walk** each cell with a throwaway audit spec in the audit folder, which seeds a fresh dataset through the journey's fixture and captures every step, as the [audit driver](audit-driver.md) shows. Go beyond the scripted assertions: each role's view of every screen the journey touches, the actions the PRD allows and refuses that role, the forms of the steps the spec records through the API, the empty, error, loading, denied and stale states, and a pass in each other locale.
4. **Look** at every step next to the owning PRD and its permission matrix: read its accessible text, open its screenshots (each region a role acts in, at both widths) and read the audit log. Look for:
   - wrong or untranslated labels;
   - values that differ between screens or documents, such as a page and its PDF, or a list and its detail;
   - dead ends and actions that do nothing;
   - permission leaks: a command or a fact the PRD denies that role, or anything shown to another Company;
   - missing empty, error, loading, denied and stale states;
   - broken narrow layouts: horizontal scrolling, clipped or overlapping text and controls.
5. **Confirm** each candidate: reproduce it on a new dataset, or show the same fact through a direct API read. Drop what does not reproduce. A behaviour the PRD does not decide is a question for the report, not a finding.
6. **File** one issue per confirmed inconsistency with the finding template, labelled `journey-audit`. The owner creates that label; when it is missing, ask the owner instead of creating it. In public mode, then post the audit report as an issue labelled `journey-audit`, with the coverage template, and link each finding from it.
7. **Record the cost** of the run with the [verification cost ledger](../../../docs/agents/verification-cost.md), run type `journey-audit`, bounded by the start and end times of the audit:

   ```text
   node scripts/verification-cost.mjs record --run-type journey-audit --harness <harness> <source> \
     --issue <report issue> --from <start> --to <end> --result <pass|fail> --findings <P1=1,P2=2|none> --append
   ```

   The source follows the harness: `--claude-code` with the session transcript and its folder, `--codex` with the rollout, or the self-reported figures in Codex Cloud. `--result` is `pass` when the audit confirmed no finding and `fail` otherwise; private mode omits `--issue`. Paste the printed line into the report, and ship the record file in a pull request that also corrects the journey-map rows the audit found wrong.

## Finding template

Title: `<screen>: <what is wrong>`, in one line.

```markdown
- **Journey:** `<journey>`
- **Role:** <role> (<fictional member>)
- **Width:** <desktop 1440 × 900 | narrow 390 × 844>, locale <en>
- **Severity:** <P0 | P1 | P2 | P3>
- **PRD:** [<PRD title> §<section>](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/blob/main/docs/product/<prd>.md#<section>)

## Reproduction

1. <numbered steps from a fresh dataset, with the fixture or API call that seeds it>

## Expected

<what the PRD requires, with its section>

## Actual

<what the screen shows>

## Evidence

Screenshot `<width>/<nn>-<role>-<step>.png` of the audit of <YYYY-MM-DD>, at commit <sha>. In private mode: a synthetic restatement, no image.
```

Severity: **P0** a permission or Company leak, or data loss; **P1** a step cannot be completed, or a wrong value is shown; **P2** a missing state, a wrong or untranslated label, or a broken narrow layout that still lets the step complete; **P3** cosmetic.

## Coverage report template

Title: `Journey audit <YYYY-MM-DD>: <journeys>`.

```markdown
- **Mode:** <public | private>
- **Harness:** <claude-code-local | codex-local | codex-cloud>
- **Commit:** <sha>
- **Window (UTC):** <start> to <end>

## Coverage

| Journey     | Role              | Desktop | Narrow               |
| ----------- | ----------------- | ------- | -------------------- |
| `<journey>` | <role> (<member>) | walked  | walked               |
| `<journey>` | <role> (<member>) | walked  | blocked: <reason>    |
| `<journey>` | <role> (<member>) | walked  | not walked: <reason> |

## Findings

- #<n> <title> (<severity>), or "None found."

## Questions for the owner

- <a behaviour the PRD does not decide, with the screen and section>

## Cost record

<the line printed by verification-cost.mjs>
```
