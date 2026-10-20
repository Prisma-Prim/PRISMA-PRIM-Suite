# Synthetic recovery operator command

**Status:** Draft operator usage for #736; publication and final checks pending.

This guide owns invocation details. [ADR0009](../adr/0009-isolated-synthetic-database-recovery.md)
and [Platform PRD §18](../product/platform-security-reliability-operations-prd.md#18-bounded-synthetic-recovery-exercise)
own the accepted synthetic boundary and exclusions. The executable adds no served
route or production recovery policy.

## Before invoking

Use an already built, compatible reviewed API revision with its `drizzle`
journal, installed dependencies and external development/test configuration.
Use an already running caller-named PostgreSQL 17 container, available Docker
socket and native `pg_dump`/`pg_restore`. No image is pulled and no service,
database, role or migration is created by this command. Provision required
external cluster roles/settings yourself before the exercise.

The database URL must use `postgres:` or `postgresql:`, numeric loopback
`127.0.0.1`, an explicit port published on that address by the named container,
and a literal database name. Query/fragment components, slash, `=` and NUL in the
decoded name are unsupported. The supplied source must already contain its exact
sole configured DEMO Workspace and supported migration journal. Keep exclusive
control of the fresh empty destination through the complete restore.

Prepare protected regular JSON/key/evidence files with no group/other
permissions. Use a private artifact directory. Retain the archive, raw 32-byte
key, verification evidence and completion evidence as four independent paths,
separately from source availability. Never put credentials, keys or real data in
Git. DEMO naming and caller attestation do not scan rows for real data.

## Configuration

Both protected JSON configurations require these explicit fields:

| Field                      | Value                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `version`                  | `1`                                                            |
| `attestation`              | `exclusive-synthetic-non-production`                           |
| `applicationRevision`      | Exact reviewed lowercase 40-character hexadecimal revision     |
| `workspace`                | Object with exact UUID `id` and exact `name` containing `DEMO` |
| `database`                 | Object with `url` and local Docker `container` name            |
| `archivePath`              | New retained encrypted artifact path; never overwritten        |
| `keyPath`                  | Separate protected raw 32-byte key file                        |
| `verificationEvidencePath` | Independently prepared protected public evidence JSON          |
| `completionEvidencePath`   | New protected backup completion JSON path, reused by restore   |

For restore, `database` names the destination, never the unavailable source.
Add `measurement` with canonical UTC ISO `referenceInstant`, finite nonnegative
`maximumRecencyMilliseconds` and finite positive
`maximumRecoveryMilliseconds`. Every bound is supplied by the caller; there are
no policy defaults. Completion evidence must establish
`snapshotCutoff <= completedAt <= referenceInstant`.

Verification evidence uses `version: 1`, `principals` and `reads`. Each principal
has unique `key`, `provider`, `subject`, `displayName` and `email`. Each read has
unique `key`, required evidence `family`, principal key in `principal`, supported
existing GET `path`, explicit `expectedStatus`, original response-byte `sha256`
and optional Company UUID `companyId`. Capture these independently before backup;
see the [public contract decoder](../../apps/api/src/recovery/synthetic-recovery.command.ts)
for supported routes, required families and limits of 1–16 principals and 64 reads. Preserve
original PDF fingerprints and receipt-derived identities. Do not derive expected
values from the restored destination. Persisted principal profiles must match
before ordinary application startup; the verifier does not repair them.

## Run backup, then a separate restore

From the compatible build’s `apps/api` directory, with the configuration path
variables set to your protected files:

```bash
umask 077
NODE_ENV=development node dist/recovery/synthetic-recovery.main.js backup --config "$recovery_backup_config" > "$recovery_backup_result"
NODE_ENV=development node dist/recovery/synthetic-recovery.main.js restore --config "$recovery_restore_config" > "$recovery_restore_result"
```

Use separate new protected result paths. Only `backup --config PATH` and
`restore --config PATH` are accepted; missing/extra arguments are refused.
`NODE_ENV` must be `development` or `test`. Restore requires ordinary external
configuration, with `ACCESS_IDENTITY_MODE`, `ACCESS_ACCEPTED_INVITATIONS_JSON`
and all `ACCESS_BOOTSTRAP_*` variables absent. It needs no source connection or
seed manifest. No migrations, reseeding or replacement grants run during restore.

## Interpret results and retry safely

Exit 0 means `archive-created` for backup or `recovered` for restore. Archive
creation alone never claims verified recovery. Exit 2 means a sanitized explicit
refusal or handled cancellation; exit 1 means failed/incomplete operation or owned
cleanup failure. Inspect the JSON outcome as well as the exit status.

A successful restore result binds revision, archive/verification fingerprints,
server/tool versions, cutoff/completion/reference, measured intervals and caller
bounds, public check fingerprints and cleanup. The technical custom-dump limit
is 128 MiB and each public response is bounded to 8 MiB; these are implementation
limits, not production capacity or policy promises.

Wrong keys, corrupt/incompatible artifacts, shared/nonempty destinations,
ordinary large objects and populated source aliases are refused. Restore uses
one transaction with exit-on-error; public verification can still fail after a
successful database restore. Either failure prohibits overall exercise success.
A retry needs another fresh empty exclusive destination; the command never drops
or overwrites it, the source or retained material to make retry possible.

A failed backup can leave a complete encrypted artifact if later completion
publication fails. Preserve it and inspect the incomplete outcome rather than
try to overwrite it. `owned-cleanup-incomplete` prohibits success. SIGINT/SIGTERM
request owned cleanup; abrupt host/process loss may leave protected owned files
requiring explicit inspection. No deletion or memory wipe proves secure erasure.
