# Exact captured Company permission rechecks

**Status:** Approved by [#1151](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1151) (registry stage 3 of #1148)  
**Scope:** Access application checks; [ADR 0006](0006-workspace-tenancy-and-company-scoped-authorization.md) remains the isolation authority.

A request captures a particular assignment and its immutable permission-set
version. Revoking it and granting an equal permission set creates a different
assignment. A check that accepts any current assignment of that bundle lets an
in-flight request continue through authority that it never captured.

Access therefore checks the exact captured assignment id, bundle and version
inside the transaction that consumes it. A command can share-lock the selected
grants until commit; an existing read snapshot uses the same check without
write locks. Active Internal User, Workspace Membership and same-Workspace
Company checks remain required. PostgreSQL rechecks a row after a lock wait:
a revocation committed by the holder denies the waiting command. The caller
may retry with a fresh server-resolved actor.

One permission requirement is a conjunction carried by a single captured
grant. Alternative conjunctions do not lend permissions to one another.
Prerequisites are separate requirements, including their existing Workspace
grant alternatives. A consumed context-conferring grant supplies Company
context according to the registry; otherwise Access checks an independent
captured context assignment or the existing live Workspace Company grant.
The result identifies the Company and consumed captured grants for Activity
Log evidence. Observation digests, Client-read captures and Document-family
fences remain explicit Access adapters.

The normalized capture stays private to Access. An opaque Symbol token follows
internal object spreads; JSON serialization retains the existing actor shape.
Private immutable evidence binds the capture to its identity and Workspace.
A copied projection may add unrelated permissions, as the existing Access
contract permits, but cannot omit or replace evidence of a consumed grant.
Each existing row projector supplies that grant’s legacy fields; optional
unconsumed grants do not retire independent authority.

This chooses the stricter semantics already used by the exact-id checks.
Existing captured versions retain their permission sets. No role, permission,
version, event, assignment URL, database constraint or PL/pgSQL guard changes.
Replacing the parallel public actor fields remains the separately scheduled
stage 4. REST/PostgreSQL tests cover Project replacement during a command-key
wait and committed revocation during both Project and Ideas assignment waits.
