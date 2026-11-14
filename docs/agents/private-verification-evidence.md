# Private verification evidence

**Status:** Implemented tooling, #1367

Read this when recording a completed check, resuming an interrupted session or retaining local synthetic journey evidence. [Issue execution](issue-execution.md) owns delivery; [acceptance proof](acceptance-proof.md) owns the public CI gate.

## Record and resume

From the worktree containing the code being checked:

```bash
node scripts/proof-checkpoint.mjs begin --issue 1367 --check scripts
# Run the check once and retain its actual exit code.
node scripts/proof-checkpoint.mjs finish --issue 1367 --run <generated-id> --exit-code 0
node scripts/proof-checkpoint.mjs resume --issue 1367
```

Use the generated run ID, and record the observed exit code rather than assuming success. `begin --help` lists the finite check names and optional numeric PR/CI references. `--root DIR` selects a private persistent directory outside Git; every action for that run must use the same root.

The default is `.prisma-agent-evidence` beside the primary checkout, partitioned by the Git common-directory identity, category, issue and generated run ID. It survives linked-worktree removal and process restart within that workspace. It is local storage, not a remote backup: losing the workspace loses these files. No command imports or uploads files.

Each run has immutable begin/end JSON files, published atomically. Simultaneous writers cannot overwrite another result. An identical finish is safe to repeat; a conflicting finish is refused. Interrupted runs remain incomplete. Resume reads metadata and never executes a saved command.

`recorded-pass` and `recorded-fail` describe recorded observations on the same clean commit and Node/platform/architecture. A changed commit is `stale`; missing completion, dirty source or a runtime mismatch is `incomplete`. A clean HEAD alone cannot qualify dirty working files. These records are not CI certification, merge approval or a reason to skip checks required by the issue; use them to recover completed work and identify what still needs verification.

## Privacy boundary

Checkpoint fields allow only generated IDs/timestamps, numeric issue/PR/CI references, a finite check name, commit/runtime identity, cleanliness and exit status. Unknown fields and malformed values are refused without echoing their contents. Commands, environment values, credentials, cookies, prompts, Client data and arbitrary notes are not accepted. Private JSON readers reject symlinks and verify file identity before reading. POSIX directories/files require owner-only modes (0700/0600); Windows filesystem ACLs remain the operator's responsibility.

Do not put Client data or secrets into diagnostics or screenshots. No regular expression or file extension can certify an arbitrary image or log as safe. Public examples and evidence must use synthetic data and be inspected before publication.

Known runtime evidence directories are ignored by Git, checked by `test:scripts` even when force-added, and refused by PR-description preflight before publication. This is a backstop for known paths, not a scanner for sensitive content renamed elsewhere. Inspect the staged diff and every artifact before publishing.

## Local synthetic journeys and public evidence

The [verify skill](../../.agents/skills/verify/SKILL.md) runs the existing synthetic acceptance journey against isolated disposable databases. Its default output now lives under the private persistent root's `journeys` category, with a fresh UUID directory per run. The final stdout summary names screenshots, traces and logs. Inspect screenshots locally; keep diagnostics private. `--output DIR` must be outside every registered worktree and other Git source, new or empty, and private when it already exists.

Local private output is not included in CI uploads. The existing CI acceptance jobs continue to create synthetic evidence in their controlled artifact paths; inspect the desktop and narrow screenshots cited in public proof. Their retention is configured by [the CI workflow](../../.github/workflows/ci.yml) (currently 14 days). Expiring CI artifacts and losing the local workspace are separate limits. Keep public handoffs to technical results and public source/CI links; never paste raw diagnostics or attach uninspected screenshots.
