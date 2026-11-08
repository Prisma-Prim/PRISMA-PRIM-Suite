---
status: accepted
---

# Preserve bounded questionnaire PDF content through a private PostgreSQL adapter

Issue #633 implements Dan's explicitly approved first stored-content scope in
Document Registry PRD section 22. It needs durable immutable PDF bytes, exact
Version download, independent content authorization and atomic history without
assuming an unconfigured external storage provider or durable API filesystem.

## Decision

Keep provider-independent Document, Version and Representation identities. Store
each PDF of at most 5 MiB through a private PostgreSQL byte-storage adapter.
Draft correction appends another immutable Representation while retaining all
prior uploads; the highest successful Document upload revision identifies the
current PDF of each Version, so replay never changes the current selection. Its table retains immutable bytes, size, SHA-256, safe
filename, media type and scan provenance, with composite Workspace/Company/Version
constraints and the successful Document upload revision. Public interfaces never expose its row address, location or database
credential as content authority.

The content insertion shares the existing Version command transaction with the
Document revision, durable receipt, minimal Activity event and original Client
operational-use fence. A stale or concurrent command cannot publish orphan bytes
or mutate an official Version. A database trigger rejects byte-row updates/deletions and insertion into an
official Version or outside the next Document revision. No byte update, deletion,
filesystem mirror or external synchronization is introduced. A successor draft copies no stored PDF.

Scan before committing with the configured engine: Amazon GuardDuty Malware
Protection for S3 by default, or a ClamAV INSTREAM boundary when selected (see
the [scanner engine amendment](#scanner-engine-amendment-1206)). Bound the actual
input and scanner response and require an explicit clean result. Missing scanner
configuration, timeout, transport failure, malformed or non-clean response or
infection fails closed; a PDF header alone is not malware evidence. Never hold the database
transaction open while scanning. Recheck live authorization, exact revision and
Version status afterwards, including when a grant was revoked during scanning.
An exact committed replay needs no new scan, but rechecks current authority.
After a clean scan, use the pinned `pdf-lib` parser with invalid-object rejection
and encryption refusal, then traverse the public page and media-box APIs before
publishing. Header/footer checks are only a cheap signature filter. Keep the
original byte buffer unchanged; this proves readable PDF structure, not signature,
evidence, certification, malware-definition completeness or PDF/A conformity.

## Rationale and alternatives

PostgreSQL already supplies the application's managed persistence, transactions
and backup boundary. Bounded bytes avoid the partial-commit/outbox and orphan
cleanup complexity of introducing an external object store for the first PDF
journey. A separate adapter preserves the option of moving byte storage without
changing business identity or download authorization.

An API-local directory is rejected because current API containers have no
persistent volume; a successful upload must not disappear after a restart.
Google Drive and Synology require their own approved account/topology integration,
which is outside this slice. An external object store remains a valid later
adapter once its configuration, recovery, immutable-object and transaction
reconciliation contract is scoped. This choice does not introduce a general
storage platform or force all future document content into PostgreSQL.

## Consequences and operational boundary

The database and its backups now contain confidential bytes. Operators must use
TLS and protected managed storage, configure a real reachable scanner (the
GuardDuty prerequisites are in the [operator checklist](../operations/document-malware-scanning.md);
a ClamAV endpoint needs maintained malware definitions and, when remote, TLS
termination) and include content in backup/restore proof before real
data. An unavailable scanner refuses new uploads while existing metadata and
clean stored content remain readable under current permissions. No deployment,
production secret, real document, scanner bypass or first-tenant grant is supplied
by this feature.

The bound protects an in-memory scan and transactional byte insertion; larger
files, other formats, streaming object storage, asynchronous processing and
retention require separate scope. Authorization stays in NestJS and current
captured Company assignments, never in storage paths or a public/signed URL.

Public PostgreSQL REST and browser tests prove the authorized upload/download
journey and historical preservation. Deterministic network-provider fixtures
prove denial, outage, malformed responses and revoke-during-scan races; a
separate disposable real ClamAV check proves clean PDF and EICAR outcomes. The
GuardDuty engine is proven against a local S3-compatible fake, not real AWS.

## Bounded scope extension — mission deliverables

[Document Registry §23 / #825](../product/release-1-document-registry-prd.md#23-approved-bounded-mission-deliverable-pdfs-825)
extends this same 5 MiB private adapter and scan/parse/immutable-Version guarantees
to one Company-confidential mission-deliverable family. It adds no provider,
filesystem persistence, real scanner configuration or storage permission. Its
reference-free draft and explicit family-access gate remain capability-owned;
existing questionnaire bytes, history and authority are unchanged.

## Bounded scope extension — received Contract PDFs

[Document Registry §24 / #870](../product/release-1-document-registry-24-received-contract-pdfs.md)
extends the same 5 MiB private adapter, configured scan, structural parsing,
immutable upload history and exact-Version downloads to one received-Contract
family. It adds no storage provider, filesystem persistence, scanner bypass or
real configuration. The separate family gate and exact declared Contract relation
remain capability-owned; no byte retention or Document designation establishes
signature validity, representation equivalence or business acceptance.

## Scanner engine amendment (#1206)

**Source:** the owner's decision of 2026-11-08, recorded in
[#1206](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1206) after
comparing ClamAV on the same host, ClamAV on a separate host and managed
scanning services. ClamAV needs 3–4 GiB of memory, which would size and price
the first single-user deployment; GuardDuty needs no local memory and, at the
expected volume (at most about 10,000 PDFs of at most 5 MiB a year), costs a few
dollars a year.

`DOCUMENT_MALWARE_SCANNER_ENGINE` selects the engine behind the same scan
boundary: Amazon GuardDuty Malware Protection for S3 (`guardduty`) when unset,
ClamAV (`clamav`) unchanged with its existing settings; any other value refuses
uploads. Settings are listed in `.env.example`.

**Data handling.** Each PDF is copied temporarily into a dedicated private
bucket of the owner's own AWS account, in a region located in an EU member
state (the API refuses any other region), under `document-scans/<random UUID>`
with S3-managed server-side encryption. No file name, Company, Case or Document
identifier reaches AWS. The API waits for GuardDuty's `GuardDutyMalwareScanStatus`
object tag, then always attempts to delete the object (its exact version when
the bucket is versioned); a one-day bucket lifecycle rule removes any object
whose deletion failed. GuardDuty's scan results stay in that account. Nothing is
shared outside it; services that share submissions with third parties, such as
VirusTotal, remain excluded. Credentials come from the standard AWS credential
chain, never from the repository.

**Verdicts.** Only `NO_THREATS_FOUND` is clean and records "Amazon GuardDuty
Malware Protection for S3" as scan provenance. `THREATS_FOUND` is the existing
unsafe refusal. `UNSUPPORTED`, `ACCESS_DENIED`, `FAILED`, any other value, no tag
within the bound, transport or access errors and missing or invalid
configuration refuse as scanner unavailable. A failed deletion never changes the
verdict.

**Bound.** The upload and the tag wait share a 40-second deadline, polled every
second, and the deletion has 5 more seconds: at most 45 seconds per upload,
below nginx's default 60-second `proxy_read_timeout`, so a conventional reverse
proxy in front of the API never cuts the request first. The repository's web
nginx serves only the SPA and does not proxy `/api`. A slower scan is refused as
unavailable; if GuardDuty latency makes that frequent, an asynchronous
quarantine design needs separate scope.

The scan still runs before, never inside, the database transaction, with the
same rechecks afterwards. Tests drive the real AWS SDK against a local
S3-compatible fake through an endpoint override honoured only with
`NODE_ENV=test` and a numeric-loopback address; they prove the adapter's use of
S3, not GuardDuty's detection. Activating the AWS account, bucket and GuardDuty
plan, and their synthetic proof, are owner actions listed in the
[operator checklist](../operations/document-malware-scanning.md).
