# Parallel worktree preparation

**Status:** Implemented tooling, #1368; replaces the optional shared-module recipe from #635.

Read this before preparing isolated worktrees for simultaneous agents. [Environment](environment.md) owns supported runtime setup; [issue execution](issue-execution.md) owns claims, verification and delivery. This command uses the installed supported toolchain; it does not provision one.

```bash
node scripts/prepare-worktree.mjs --path ../suite-123 --branch feat/123 --base origin/main --offline
```

Run from any checkout of the repository. New targets must not exist; Git creates the named branch and worktree. Existing targets must be registered to the same repository, on the named branch and clean. The primary checkout, unsafe aliases, foreign directories and replacement of user files are refused. Nested worktrees need an explicitly ignored destination; `.worktrees/` is provided for that purpose.

The result is one JSON object: `prepared` means the frozen installation and base doctor passed; `ready` means an unchanged private qualification was reused without installation. Exit 2 means preparation was refused or incomplete. Errors are bounded technical messages; arbitrary installer output is neither echoed nor retained. `--help` lists examples and flags.

## Isolation and cache

Every target owns its `node_modules`, virtual store, mutable pnpm metadata, links and shims. Package imports use copies, so changing installed bytes in one target cannot change a peer's package bytes through hardlinks. Existing module roots or dependency links pointing outside the target are refused before invoking pnpm. Read-only inode accounting also refuses hardlinks whose other names cannot all be accounted for inside the qualified worktree. Fully internal hardlinks remain supported. `--refresh` does not detach existing hardlinks; preserve an unqualified installation and prepare a fresh isolated target. Preserve an old shared installation; stop its consumers and detach only links whose ownership and intended target you have established before retrying.

`--store DIR` selects pnpm's supported shared content-addressable store outside every worktree; without it pnpm uses its normal configured store, subject to the same boundary. `--offline` requires package contents already available there; a cache's existence alone is not that proof. Missing contents fail the normal frozen install. There is no global dependency-check bypass, installer replacement or runtime upgrade.

Private home/cache/state directories and technical qualification hashes live under the Git common directory's `agent-preparation/<target hash>/`. They are scoped to one canonical target, outside tracked source, with owner-only POSIX modes. Windows ACL policy belongs to the operator. No credentials, environment values, raw output or Client data are written to these records; configuration and environment identity are hashed in memory. Nothing is uploaded.

## Reruns and changed inputs

Qualification covers the actual manifests, lockfile, workspace/configuration, patches, local dependency contents, runtime/tool identity, environment/configuration fingerprints and mutable installation metadata. A matching commit alone is insufficient. Local dependency paths must stay inside the target; source links and external local dependencies are conservatively refused. Dynamic pnpm hooks cannot qualify for automatic reuse.

If inputs or installation are changed or unknown, stop consumers and explicitly authorize a private frozen preparation:

```bash
node scripts/prepare-worktree.mjs --path ../suite-123 --branch feat/123 --refresh --offline
```

`--refresh` authorizes preparation; it never bypasses a live lock, cleanliness, frozen-lockfile validation or ownership checks. A lockfile incompatible with its manifests still fails. Input identities and source-directory observations detect changes during preparation, including edits restored before completion. Generated module directories are excluded from observation. Failed or interrupted work remains incomplete; it cannot inherit the prior ready state.

The lock coordinates preparations, not arbitrary commands run manually in the same target. Keep dependency inputs stable and stop consumers before a refresh; use separate worktrees for simultaneous implementation. Browser/API journeys retain their existing fixed-port coordination requirements.

## Contention and interruption

Two callers for one canonical target serialize before worktree creation; the second can reuse the first's successful result. Different target locks permit concurrent installations through the official store. `--wait-ms N` bounds lock waiting (default 120000, maximum 600000); zero refuses contention immediately. Lock age is never proof of abandonment.

An atomic owner record stores a generated token, opaque host identity, PID and idle/launching/running phase. Launch intent is durable before spawn; the running phase records the owned child group. Only that owner's filenames are removed, followed by removal of an empty directory. Recovery never recursively deletes a lock, steals live ownership or removes another process's resources.

On POSIX, graceful interruption stops and awaits owned process groups. After abrupt owner death, recovery waits until the recorded group has no live descendants before reclaiming the lock. An unknown host, malformed state or death in the unrecorded launch gap remains unresolved. On Windows, abrupt parent death cannot establish descendant exit through POSIX groups, so a running/launching orphan remains locked conservatively. Preserve that target and use a fresh isolated path/branch from the intended base when activity cannot be proved stopped; there is no force-unlock flag. Existing worktree cleanup remains owned by [remove-worktree](environment.md#removing-a-finished-worktree).

## Evidence and platform coverage

`node --test scripts/prepare-worktree.test.mjs` drives the public CLI with real pinned pnpm and synthetic local packages. Process barriers prove same-target serialization, different-target overlap, byte isolation, failure/recovery, input divergence and a surviving installer after owner death. POSIX-only graceful-signal assertions are labelled; Windows runs the remaining coverage natively in CI and `quality` requires its success. No test substitutes a mocked install plan for those real package-manager operations.

Keep local smoke results technical and private under the [verification evidence rules](private-verification-evidence.md). Inspect any artifact before publishing; this tool does not collect screenshots or certify arbitrary content.
