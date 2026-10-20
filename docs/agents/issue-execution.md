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
3. For UI work, inspect the real journey at desktop and narrow viewports. Write synthetic screenshots through Playwright's `testInfo.outputPath(...)`, never commit them. Preserve the complete local `browser-evidence/` directory, including `browser/`, `acceptance/` and the deliberate `acceptance-evidence-probe/`, even after failure. Inspect the relevant screenshots before claiming visual evidence.
4. Complete both self-review axes: once against repository Standards and once against the originating issue's Spec/acceptance contract. Fix what you find before publishing.
5. Publish one focused commit. Squash intermediate commits before the first push.
6. Require validated complete local integration evidence for the published source head and current base before merge. Partial checks remain useful during development but do not waive this gate. Requested manual GitHub verification must also succeed; an unexecuted workflow has no success attestation.

### Complete local integration evidence

The canonical command plan and manifest owner is `scripts/verify-local.mjs`. It retains the approved documentation-only optimization from #730 through the existing `scripts/ci-change-scope.mjs` owner: only root `AGENTS.md` and Markdown under `docs/` qualify. Eligibility comes from the proven current base-to-integration checkout diff, with ancestry and checkout agreement and both paths of renames/deletions; no user flag selects it. Unknown/empty/unavailable metadata, divergent history and every mixed or out-of-allowlist change require all existing families. There is no API reuse. Commands remain owned by the existing packages and verification scripts.

For a proven documentation-only change, the required gate is the existing simple doctor, format, lint, strict types, complete script suite and documentation API contracts. The manifest retains all sixteen families; the ten heavy families and their Railway/DB/browser prerequisites are explicitly `not_required` with the canonical source-derived reason, never passed or arbitrarily skipped. The report shows the scope, reason and exact argv, and validation recalculates eligibility from the real source/base/integration inputs before accepting those results. For every other change, including this tooling/workflow transition, the full gate below remains required. For full-scope changes, the API parallel and serial commands together cover the complete API suite. The runner records fixed local parallelism overrides in its exact argv: API parallel and web unit use `--maxWorkers=2`, browser uses `--workers=2`; API serial and acceptance keep their existing serial policies and all tests/assertions/time budgets. This is a reversible local resource choice, not a claim of matching GitHub runner hardware. Browser and real-PostgreSQL acceptance run both existing desktop/narrow projects; the acceptance failure-evidence probe remains mandatory. Build, Railway configuration tests/types and the actual production packaging smoke remain required. Missing Docker/images, database configuration, browser or dependencies produce failed/incomplete evidence, never a successful skip. The plan also records finite process safety caps for the aggregated local commands: API parallel and browser each use 270 minutes (2 × 3 × the workflow’s 45-minute shard budget), acceptance uses 180 minutes (2 × 2 × 45), and other families use 45 minutes. The factor of two is a conservative local margin, not a measured runtime claim. These caps terminate an entire child process and its descendants; they do not change any scenario, assertion or business-test deadline. The validator recomputes both deadlines and argv from the fixed plan, including families marked `not_required`. Before running, prepare application dependencies with the normal frozen-lockfile setup; for full-scope changes, separately run `pnpm --dir .railway install --frozen-lockfile`. The verifier checks installed Railway/TypeScript versions against that tracked manifest, whose separate lock is included in input hashes; the runner does not install or acquire substitutes.

Browser and acceptance use the closed local startup helper `scripts/verify-local-browser.mjs`, while the manual Actions commands and canonical Playwright configurations remain unchanged. The helper always removes only its listed generated build outputs and performs the real required builds before launching Playwright: web `pnpm build --mode local-demo` in `apps/web`, preceded for acceptance by `pnpm --filter @prisma-prim/api build` at the root. It records their exact public environment, inputs, dependency/tool identities, output path sets and byte hashes, argv, UTC and exits in `local-browser/<family>/manifest.json`. An external temporary configuration imports the registered configuration and preserves its test selection, projects, global setup, use/expect and scenario budgets, reanchoring relative paths to `apps/web`. Its only startup change is a fresh-build guard followed by the original preview command, with a finite 180-second local guard/preview startup window; builds run outside that window but inside the unchanged family process cap. Guard/config/input/output drift refuses preview. No older lot, arbitrary command or skip option qualifies. Child output logs remain private execution evidence until the operator selects and sanitizes publication artifacts. Acceptance helper failure or process expiration still runs the independent existing evidence probe, retaining acceptance failure and partial results; external interruption cancels work and cleans owned descendants. The probe has neither a server nor a database setup, and cannot turn a failed acceptance run into success.

1. Fetch the current base and record the proposed source commit. Create an isolated disposable checkout of their actual merge, with no untracked source or tracked edits. For example, from the issue checkout: `git fetch origin main`, `git worktree add --detach /tmp/issue-integration origin/main`, then in that worktree `git merge --no-edit SOURCE_SHA`. Resolve conflicts on the issue branch and start again rather than inventing an uncommitted integration. When the base is an ancestor, the source checkout itself already has the integration tree. Provide the installed dependencies and, for full-scope changes, the normal safe isolated PostgreSQL URLs to the integration checkout; use the existing managed-PostgreSQL lifecycle when appropriate.
2. In that clean integration checkout, run `node scripts/verify-local.mjs run --source SOURCE_SHA --base origin/main --output /tmp/issue-evidence-UNIQUE`. Use a fresh external output directory. The manifest records source/base/checkout SHAs, the exact merge tree, every tracked input's hash (including manifests, locks and configuration), allowlisted tool/DB/browser versions, effective environment policy and overrides, literal argv, UTC timing, each family exit/result, and artifact hashes. Database credentials/URLs and unrestricted environment dumps are excluded. Required failures leave later families explicitly unexecuted. `contract-test` reports are synthetic runner-contract tests and never qualify as merge evidence.
3. Refresh `origin/main` immediately before merge, ensure the PR head still equals the recorded source, then run `node scripts/verify-local.mjs validate --output /tmp/issue-evidence-UNIQUE` in the same integration checkout. Changed source, base, integration, input bytes, missing/failed families or altered artifacts invalidate the report. A new base or head requires testing the new integration. Do not treat a source-branch green result as proof of a different merge tree.
4. Publish the compact `report.md` plus the machine-readable `manifest.json` on GitHub, with exact configuration, actual artifact links and checksums in the PR. Publish before merge and retrieve/check the uploaded assets; a local path or digest alone does not establish publication. Keep failed/incomplete reports honest and separate from successful runs.

For bounded binary publication without source-history artifacts, use a GitHub prerelease per PR, named/tagged `local-evidence-pr-N`, targeted at the tested source commit. Upload a reviewed archive containing the sanitized logs and synthetic `browser-evidence/`, plus the report and manifest; include the source SHA in immutable asset names, never overwrite a different run, and link the actual release/asset URLs in the PR. Use `gh release create`/`gh release upload` only under the session's publication authorization. Split archives below GitHub's per-asset limit when necessary. Keep at most the current passing run and its immediately preceding failed run for each open PR; after merge retain the final compact manifest/report and linked evidence for 14 days, then delete bulky archives. Do not delete evidence still needed by an open review. This uses existing GitHub storage, creates no new hosting service, and never commits binary evidence to normal product history. Review logs, screenshots and traces for secrets or real data before upload; automated text redaction does not certify binary content.

The runner deliberately executes a small allowlist of inherited runtime/path/proxy/CA/database settings and fixed PostgreSQL/CI requirements; other environment overrides are excluded. Tracked configuration hashes and literal commands provide the remaining effective configuration. Credentials must be provided privately to the reproduction environment. Local evidence is self-reported execution, not independent GitHub runner attestation; do not create a forged GitHub success status.

The complete `.github/workflows/ci.yml` remains available only through explicit `workflow_dispatch` for requested independent execution. Existing verification commands, failure aggregation and full browser artifacts remain intact; the separate manual Clerk smoke is unchanged and is not launched by this gate. Retrieve manual-run evidence under `browser-evidence-pr-RUN_ID`; five shard artifacts remain recoverable individually if aggregation fails. No schedule or background run is authorized. Workflow triggers can be restored by reverting the transition; repository protection/required-check settings require an explicit owner decision, not a silent edit. At transition preparation, branch metadata reported `main protected=false`, while the protection endpoint returned 403; recheck actual settings instead of inferring future protection from that observation.

### Acceptance evidence and review preparation

Apply this procedure in every fresh session, including a handoff between Codex and Claude Code. The issue, repository instructions and pull-request evidence supply the contract; private conversation memory is not a prerequisite.

- Before requesting review, check every acceptance criterion against the complete change. Record a compact mapping from each criterion to its test or other verifiable evidence in the pull request; identify any missing proof or unresolved ambiguity. For documentation, check the requested outcomes, links and consistency with the owning instructions instead of inventing behavioral tests.
- Complete both Standards and Spec self-reviews before publication, fix their findings, and inspect the resulting final diff. For browser or asynchronous work, audit the affected journey's reads, writes and readiness conditions before assertions, together with permissions and state transitions where relevant. Preserve assertion strength and stay within the assigned acceptance contract.
- When addressing a blocking finding, identify its cause and search the entire authorized scope for the same defect pattern. Correct all affected occurrences in the same batch; do not stop at the cited line or broaden the issue into unrelated hardening. Disposition nonblocking findings under the review-round policy below.
- Wait for the requested review to complete, collect its findings, and apply the blocking corrections together. Rerun the affected checks and record the correction, tested revision, results and remaining uncertainties in the pull request. This preparation does not add review rounds or change the stopping rules below.
- Before merge, validate local evidence against the current source head, current base and integration tree, and verify that the required review disposition applies to that head. After a correction, explicitly distinguish evidence for unchanged material from checks rerun on the correction; an earlier green result does not establish that the new head passed.

## Capability-aware publication

Harness capabilities and user authorization determine publication actions. A task prompt never grants capabilities or permissions the harness does not have.

| Capability                                             | Required behavior                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Cannot run the local checks required by the issue      | Do not publish code. Produce an issue draft, documentation, or a review instead.  |
| Git commit access without GitHub write access          | Report the exact publication blocker together with the committed branch name.     |
| Push and PR access                                     | Push the branch and open one PR targeting `main` using the pull request template. |
| Verification visibility                                | Validate published local evidence; monitor any explicitly requested manual CI.    |
| Merge access without standing repository authorization | Stop after a green, reviewed PR. Do not merge.                                    |
| Merge access with standing repository authorization    | Squash-merge after the review round, then delete the issue branch.                |

The pull request body follows `.github/pull_request_template.md`: outcome and `Closes #N`, scope, verification evidence, review disposition, follow-ups, and an [environment friction](environment-friction.md) section only when friction occurred.

## Review round

Every pull request gets at most one review round. The rule exists because repeated review-and-fix cycles on a growing diff do not converge.

1. Wait for validated complete local evidence on the published head and current integration tree, plus any explicitly requested manual GitHub verification.
2. Product code may receive one automated review, requested with an `@codex review` comment on the final head, or one review by the repository owner. For documentation and PRD pull requests, agents' applicable Standards/Spec preparation and recorded disposition suffice; do not request an automated review on them. The owner may volunteer a review, but neither owner review nor separate owner confirmation is required.
3. Triage every finding with one rule. A finding **blocks** only when it is a defect inside the changed scope that breaks an acceptance criterion, a security or data-integrity boundary, or a regression against `main`. Every other finding, including missing edge cases outside the acceptance criteria, style preferences, and hardening suggestions, is recorded under **Follow-ups** in the pull request body and does not change the branch.
4. Apply all blocking findings in one correction commit, rerun the local checks affected by the correction, and regenerate/validate the complete local integration evidence. Run manual GitHub verification only when explicitly requested. Use `pnpm verify` for a sensitive correction or when the broader gate is needed to diagnose the finding. Do not request another review. One confirmation review is allowed only when the correction touched authorization, tenancy, migration, or Activity Log code; its findings follow the same triage and cannot lead to a third review.
5. Stop when the correction would exceed a focused fix, when a confirmation review reports new blocking findings, or when CI fails twice on the same pull request for non-trivial reasons. Close the pull request, report the diagnosis and the recommended re-scope on the issue, and end the session. A fresh session starts only after the owner has re-scoped the issue.
6. Merge under standing authorization when the complete local integration evidence is valid and published, any requested manual verification passed, the review round is complete, and the scope matches the issue.

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
