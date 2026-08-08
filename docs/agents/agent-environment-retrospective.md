# Agent environment retrospective

Every AI-assisted pull request and final execution report must include a concise **Agent environment retrospective**. Its purpose is to remove repeatable repository and harness friction, not to preserve a debugging diary.

## Reportable friction

Report evidence about:

- runtime or package-manager drift;
- missing dependencies, system packages, browsers, or services;
- incorrect, missing, or ambiguous repository commands;
- undocumented environment variables or setup prerequisites;
- permission, secret, network, or sandbox constraints;
- differences between local, cloud, and CI behavior;
- flaky or non-reproducible tests;
- a harness limitation that prevented a required check or publication action.

Do not routinely report expected failing TDD tests, syntax mistakes, discarded implementation approaches, or bugs introduced and fixed during ordinary development. Report an implementation mistake only when it reveals a reusable missing guardrail.

## Required format

When friction occurred:

```markdown
## Agent environment retrospective

- Harness: Codex Cloud
- Environment: prisma-prim-suite
- OS/runtime: Linux, Node 24.x, pnpm 11.20.0

| Category | Evidence                         | Root cause                                 | Confidence | Workaround                    | Durable fix                         | Status           |
| -------- | -------------------------------- | ------------------------------------------ | ---------- | ----------------------------- | ----------------------------------- | ---------------- |
| Runtime  | `pnpm` failed under Node 20.20.2 | Cloud runtime did not match `package.json` | Confirmed  | Installed Node 24 with `mise` | Pin and verify Node 24 during setup | Fixed externally |

### Checks not run

- None.

### Follow-up

- None; the durable fix is already applied.
```

Allowed confidence values are `Confirmed`, `Suspected`, and `Unknown`. Allowed status values are `Fixed in PR`, `Fixed externally`, `Follow-up required`, and `Not reproducible`.

When no friction occurred:

```markdown
## Agent environment retrospective

- Harness: Codex Cloud
- Avoidable environment or repository friction: none observed.
- Required checks not run: none.
- Suggested environment improvements: none.
```

## Fix or follow up

Apply a small durable fix in the current PR only when it is certain, low-risk, relevant to the touched workflow, and does not widen the issue's product scope. Examples include correcting an obsolete command or aligning an explicit version check.

Create an issue with the `Agent friction` form when the problem is likely to recur and any of these conditions apply:

- the fix changes CI, cloud setup, Docker, secrets, permissions, or network policy;
- a required verification could not run;
- the root cause is not confirmed;
- the durable fix belongs outside the current issue;
- the incident caused material repeated effort.

Link the originating PR and deduplicate against existing friction issues. Never silently broaden a product PR to fix speculative environment concerns.

## Promotion rule

PR retrospectives are observation records. Only confirmed, reproducible, and actionable findings become repository configuration, documentation, or an `agent-friction` issue. Re-evaluate whether to enforce retrospective presence in CI after 2–3 trial PRs; until then, the PR template and repository instructions provide the guardrail.
