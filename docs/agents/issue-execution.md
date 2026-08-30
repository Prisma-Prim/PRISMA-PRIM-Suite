# AI agent issue execution — one issue

Use this workflow for Codex Cloud, Codex CLI, Claude Code, and other AI coding harnesses. Replace `FULL_ISSUE_URL` with the complete URL of the single issue on the execution frontier. Start with a fresh session whenever the harness supports it.

## Codex Cloud kickoff

When a GitHub issue defines the implementation contract, launch Codex Cloud from an `@codex` comment on that originating issue. This is the default repository workflow because the task inherits the complete issue body and available comments without depending on agent-phase Internet access.

Do not create a manual Codex Cloud task whose prompt contains only the issue URL. A manual task is acceptable only when its prompt contains the complete execution contract or when the work is fully specified by repository files available to the task.

## Invariant workflow

Every harness must follow these steps even when it cannot perform GitHub or local Git actions itself.

### Low-risk fast path

Use this path by default when the issue and planned PR are mechanical or documentation-only, set `Product contract changed` to `no`, declare `exempt-low-risk`, and cross no high-risk boundary.

- Use a **15-minute execution target** measured after the required environment is ready. When the target is exceeded, finish the current safe check and diagnose the process or environment before adding more review cycles.
- Complete the full narrow diff and affected checks before publication. Run repository-wide checks only when the issue or affected surface requires them.
- Perform **one final review pass** covering both repository Standards and the originating issue or Spec.
- Publish **one focused commit**. Amend or replace it for a grouped correction; do not stack review-iteration commits.
- Request the exact-head terminal review once after the complete diff is published.
- **P0 and P1 findings are blocking.** A **P2 blocks only** when it directly violates the issue acceptance criteria or demonstrates a concrete security or correctness defect in the changed scope. For every nonblocking finding, record the deferred disposition, resolve its review thread without changing the branch, and trigger terminal-gate re-evaluation; **do not request another Codex review**.
- If terminal feedback contains blocking findings, collect them before editing and allow one grouped correction plus one final exact-head confirmation. A second new blocking wave stops the PR for process or preflight diagnosis instead of continuing a correction loop.
- Merge immediately under standing authorization when CI, governance, and terminal review are green and no blocking feedback remains.

Every PR that is not eligible for the low-risk fast path uses the full verification and separate-review path below. This includes product-contract changes, every implementation change, migrations, authorization, privacy, concurrency, transversal changes, and any other high-risk boundary. The fast path never waives their conditional evidence.

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
- For any TypeScript implementation, apply the [mandatory TypeScript discipline](typescript-discipline.md) before reading or editing `.ts` or `.tsx` files and keep it active throughout the change.
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
4. On the low-risk fast path, review the final diff once against both repository Standards and the originating issue or Spec.
5. On the full path, review against repository Standards and then review again against the originating issue or Spec.
6. Standards review must report all material violations of the TypeScript discipline when the diff contains TypeScript.
7. On the low-risk fast path, correct blocking findings and disposition every nonblocking finding as described above; on the full path, correct every material finding. Rerun affected checks after corrections.
8. Complete the [agent environment retrospective](agent-environment-retrospective.md), including an explicit no-friction declaration when appropriate.

Complete the whole diff, formatting, Standards review, and Spec review before the first push whenever the harness allows local staging. Publish one focused commit. A GitHub connector that writes one commit per file is not a staging interface: create the blobs, one tree, and one commit instead.

When a matching Agent Doctor report has `handoff.state` equal to `required`,
the publishing harness consumes `handoff.action` without asking a human. With
push and pull-request access, add its marker in the same create or update
pull-request operation that publishes the exact candidate. Then resolve the
exact PR head SHA and monitor the named `handoff.completion.statusContext` on
that SHA until `handoff.completion.requiredState` is `success`. Triggering the
handoff is not verification, and delivery remains blocked until that exact-head
result succeeds. A harness without the required publication or CI visibility
follows the capability boundary below instead of claiming delegated evidence.

After terminal feedback, apply the severity gate from the selected path. Collect all blocking findings before changing the branch and publish at most one grouped correction. If another blocking wave appears, stop editing and return the issue to process diagnosis or preflight. Do not continue a one-finding/one-commit loop.

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

| Capability                                                              | Required behavior                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| No local Git commit access                                              | Produce a tested patch or diff and report the exact publication blocker.                         |
| Local Git commit access without GitHub write access                     | Export the exact committed tree through the Cloud-to-Work handoff below.                         |
| Push and PR access                                                      | Push the branch and open one PR targeting `main`.                                                |
| CI visibility                                                           | Monitor CI and fix failures caused by the PR.                                                    |
| Merge access without task-specific or standing repository authorization | Stop after a green, reviewable PR. Do not merge.                                                 |
| Merge access with task-specific or standing repository authorization    | Squash-merge only after reviews and green CI, then clean the issue branch or worktree when safe. |

### Codex Cloud-to-Work publication handoff

Native publication remains preferred whenever Codex Cloud exposes a branch or pull-request action. When Cloud can create a local Git commit but cannot write to GitHub, the lossless fallback is the versioned `prisma-prim-codex-handoff/v1` bundle; a prose summary or reconstructed patch is not an equivalent artifact.

Before editing, record the exact starting commit as `BASE_COMMIT_SHA`. After the complete diff, checks, reviews, and one focused commit, create a temporary verification JSON file outside the checkout with this bounded shape:

```json
{
  "environment": {
    "harness": "Codex Cloud",
    "nodeVersion": "v24.0.0",
    "pnpmVersion": "11.20.0",
    "postgresVersion": "17.6"
  },
  "checks": [
    {
      "command": "pnpm test:unit",
      "status": "passed",
      "summary": "All unit suites passed."
    }
  ]
}
```

Omit environment fields that do not apply. Each check status is `passed`, `failed`, or `skipped`. The exporter rejects common credential patterns, but the task author remains responsible for keeping summaries free of credentials, connection strings, Client data, and other secrets. Export only from the clean committed checkout:

```bash
node scripts/codex-cloud-handoff.mjs export \
  --base "$BASE_COMMIT_SHA" \
  --verification /tmp/codex-cloud-verification.json
```

Paste the command's complete fenced output into the final task result and state why native publication was unavailable. The bundle binds its SHA-256 envelope, base commit and tree, source commit and tree, commit message, exact changed Git blobs and modes, deletions, and verification manifest. If the command reports the issue-comment transport limit, narrow the issue or use native publication; do not split or manually rewrite the bundle.

The authenticated Work supervisor saves the exact fence outside the checkout and runs:

```bash
node scripts/codex-cloud-handoff.mjs inspect \
  --input /tmp/codex-cloud-handoff.md \
  --expected-base "$CURRENT_MAIN_SHA"
```

`CURRENT_MAIN_SHA` comes from the authenticated GitHub target branch, not a potentially stale local ref. The command fails explicitly if that head moved. Work also confirms the authenticated base commit's tree equals `baseTreeSha`.

For connector publication, extract the already validated machine-readable payload into a new private temporary file:

```bash
node scripts/codex-cloud-handoff.mjs extract \
  --input /tmp/codex-cloud-handoff.md \
  --expected-base "$CURRENT_MAIN_SHA" \
  --output /tmp/codex-cloud-connector-manifest.json
```

The manifest contains the source commit message and every addition's mode, type, expected blob SHA, and base64 content. Deletions include the exact base blob identity. Work creates each added blob and rejects any returned SHA that differs, creates one tree from those identities and deletions on `baseTreeSha`, and rejects a returned tree that differs from `sourceTreeSha`.

Alternatively, a clean checkout detached at the exact base can materialize the same tree locally:

```bash
node scripts/codex-cloud-handoff.mjs materialize \
  --input /tmp/codex-cloud-handoff.md
```

Before creating the branch and pull request, the staged or connector-created tree must equal `sourceTreeSha`. Work creates one remote commit without editing the materialized content, records both the Cloud `sourceCommitSha` and the published commit SHA, and retains exact-head review and CI as merge authority. Any digest, blob, path, dirty-checkout, stale-base, non-canonical delta, or tree mismatch is a hard failure; do not repair the artifact semantically.

If `AGENTS.md` records standing repository authorization, it satisfies the authorization requirement for every conformant PR until explicitly revoked. Do not pause to request per-PR confirmation. Readiness remains mandatory: all required checks must be green, Standards and Spec reviews complete, scope conformant, and blocking feedback resolved.

The PR body must include `Closes #N`, the three common classification fields, any applicable conditional evidence, the delivered outcome, affected-check evidence, blocking-feedback state, and the environment retrospective. Add browser evidence, consequential decisions, remaining limitations, deferred follow-up links, and separate Standards and Spec conclusions only when they apply; the full path records both conclusions. Pull-request governance fetches the closing issue and verifies that its preflight disposition and required approval marker match the PR; editing that issue dispatches a fresh check on every affected open PR head. Review-iteration metrics come from GitHub timelines during the five-PR retrospective; authors do not maintain a blocking counter.

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
