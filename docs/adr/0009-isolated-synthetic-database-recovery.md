---
status: accepted
---

# Retain authenticated logical backups for isolated synthetic recovery

**Technical disposition:** Accepted on 20 October 2026 by the coordinating agent
after Standards then Spec review, under Dan's delegated technical authority, as
recorded in [#732](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/732#issuecomment-6283949510).
Dan delegates routine PRD review in [#51](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/51#issuecomment-6283507237);
this records the agent's acceptance, not Dan's personal review, production policy
approval or executed restoration evidence.

**Behavior owner:** [Platform Operations PRD section 18](../product/platform-security-reliability-operations-prd.md#18-bounded-synthetic-recovery-exercise).

## Decision

Support one full logical custom-format snapshot of a caller-supplied, already
populated, dedicated synthetic DEMO application database on PostgreSQL 17.
Preserve every application schema and migration record, application configuration,
business record, immutable Version/history, local identity, membership, Role
Assignment, command receipt, Activity Log event and current/historical PDF byte.
No table/data selection, seed reconstruction or grant repair substitutes for the
supplied database. Cluster roles, tablespaces and runtime/provider secrets remain
external prerequisites; a single-database archive does not recover them.

Bind the source checks to the same complete consistent snapshot consumed by
`pg_dump`, using an exported read-only snapshot held until the dump completes.
Check the actual sole configured Workspace and migration state in that snapshot;
a separate earlier admission query cannot authorize a later dump. Record a
conservative cutoff immediately before snapshot acquisition, separately from the
later successful archive-completion instant. A later write is outside the dump.

Use only PostgreSQL 17 `pg_dump` and `pg_restore` through `docker exec` in already
available caller-named local containers. Do not pull an image, install tools,
provision a service or add selectable transports. The initial writer and reader
support envelope version 1 and the same exact reviewed application revision
and migration journal. Declare and validate the supported server/tool versions
and archive format; refuse unsupported combinations rather than claiming
cross-revision, cross-major or generic PostgreSQL recovery.

The retained envelope uses native Node `aes-256-gcm`, a separately supplied
32-byte key, a fresh cryptographically random 12-byte nonce for every archive and
a 16-byte authentication tag. Authenticate the bounded versioned header and
metadata with the encrypted complete dump: application/migration compatibility,
Workspace identity, snapshot cutoff and payload length cannot be altered
unnoticed. The key is external to the archive and report. Publish the
encrypted archive only after successful complete dumping/encryption; preserve an
existing retained artifact rather than overwriting it. A checksum alone is not
authentication. Report archive completion only after the finished encrypted
artifact is published; retain that non-secret completion report independently.

A later restore invocation requires only the independently retained encrypted
artifact, separately retained key and exercise verification/completion evidence,
declared compatible application/tooling, external technical configuration and a
fresh empty isolated destination. It
requires no source connection or seed manifest. Fully authenticate the header and
entire ciphertext/tag before any restore mutation, including technical settings
reconstruction. Reject wrong keys, corruption, truncation, trailing content,
unknown versions, invalid lengths or incompatible metadata. Do not stream
unauthenticated plaintext into a destination.

Bound archive size, decrypted size and temporary storage use. Keep plaintext in
an exclusively owned private temporary directory outside the checkout, with
restricted file permissions and no secret-bearing diagnostics. Remove owned dump,
decryption and staging files on success, refusal, error and handled cancellation;
report any cleanup failure and never report overall success while owned plaintext
cleanup is incomplete. Abrupt process/host loss may leave protected temporary
files for explicit owned cleanup; deletion is not secure-erasure proof.

The destination is caller-supplied, separate, fresh and empty under exclusive
exercise control throughout admission and restoration. Reject application or other
user objects, shared workloads and a populated source reached by an alias; URL
inequality alone is insufficient. This needs no universal topology resolver.
Reconstruct only reviewed external technical roles/settings, preserve dumped
application grants unchanged and restore with `pg_restore --single-transaction --exit-on-error`, without
create-database, clean or in-place overwrite behavior.
The supported dump must restore completely inside that transaction; failure rolls
back its database changes. Never mutate the source or remove the retained archive
on failure. Report external technical setup separately from the atomic database
restore; it is not rolled back by PostgreSQL's restore transaction.

## Rationale and alternatives

[ADR-0002](0002-postgresql-with-drizzle.md) makes PostgreSQL the system of record;
[ADR-0008](0008-bounded-document-content-storage.md) stores bounded immutable PDF
bytes there. Full logical recovery preserves that existing persistence boundary
without a new storage provider. Independent encrypted retention permits a later
restore after the source and its resources are unavailable.

A retained plaintext dump fails artifact protection. Replaying fixtures or
creating fresh grants manufactures state. In-place recovery risks an existing
workload. Physical backup, PITR, provider-managed backup and an external archive
adapter require separate scope and compatibility decisions.

## Consequences and limits

The versioned envelope becomes a durable compatibility contract. Keep the first
reader narrow and fail closed; introduce no generic configuration engine,
installer, PII/secret scanner or recovery platform. DEMO admission and caller
attestation cannot establish that arbitrary rows contain no real data.

Only ordinary compiled application reads/downloads against the restored database
can establish the representative business/history/PDF/authorization acceptance
owned by the PRD. Database restore, decryption or artifact creation alone cannot.
No migration, reseed, bootstrap identity creation, fresh grant or history repair
may precede those checks. Existing isolated test identity verification may present
exact persisted synthetic principals without adding a served identity mode or
recovering Clerk. NestJS's normal authorization remains authoritative.

This decision supplies no executed recovery evidence or whole MP-2 credit.
Production topology, actual loss/downtime tolerances, backup schedule, retention,
offsite/key custody, operator/incident responsibility, provider identity recovery
and reconciliation of post-snapshot revocations remain outside this synthetic
contract. The whole Platform PRD remains Draft with its production dependencies.
