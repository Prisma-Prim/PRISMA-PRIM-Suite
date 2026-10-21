# Targeted recovery evidence for PR #752

Status: selected local evidence prepared for coordinator review; not yet published and not merge approval.

The recovery test fixture originally addressed `ci-postgres` under `CI=true`, even when the local gate supplied a different owned PostgreSQL container. The retained RED shows that exact setup error. The correction changes only tests/support: an explicitly supplied caller tool keeps priority; otherwise the helper selects a unique managed container by its exact numeric-loopback PostgreSQL port and refuses ambiguous or invalid metadata. CLI product admission remains unchanged.

The selected proof contains 15 passing boundary cases, scoped ESLint, strict API types and one coherent 27/27 PostgreSQL/compiled-CLI run with zero failed/skipped cases. The latter ran on 21 October 2026 from 06:31:04 to 06:34:47 UTC, 191.50 s Vitest and 222.83 s complete lifecycle, with actual Tini exit0. Before/after guards and the original cleanup record show no remaining owned identities among 119 observed PID/start-time pairs, and identical managed-resource inventories. This is self-reported local execution, not an independent GitHub runner attestation.

## Exact provenance

The 27-case run's real HEAD was `42aba93d50c1b0d05349b40d6d32979f9d6499ef`, with the three test changes still WIP. It was not a run whose HEAD was `9130d359c7d781d98ce5ac860a8c948417d1e281`. `source-binding.json` records the later content comparison to that published commit: 1315 tracked input snapshots plus the two additional frozen untracked TypeScript files cover 1317 committed paths. Recorded tracked executable flags also agree; modes of the two then-untracked TypeScript inputs were not separately retained.

The 15-case helper record does not retain its HEAD. Its exact three source hashes, argv, UTC and exits are retained and match the subsequently committed blobs. No HEAD is inferred from timing. Both original snapshot files and the exact 8-source/9-config guard are included.

## Contents and limits

`execution-summary.json` gives commands, configuration, outcomes, timings, source state and remaining gates. `index.json` binds each selected text file to its SHA256, byte length and exact local origin. Most files are exact byte copies. `records/green/managed-readable.log` only removes ANSI display control sequences and renders carriage returns as newlines; its raw original hash/size and transformation are in the index. Originals remain intact.

No database dumps, encrypted archives, keys, PDFs, real data, credentials or opaque binaries are included. Logs and script text were read for content and checked for high-confidence credential markers. The source snapshots contain paths, hashes and executable flags, not copied source payloads or environment dumps. The original scripts retain their exact historical output paths; these are evidence copies, not a request to rerun into the same directories.

This packet does not include a complete local integration manifest, packaging success or a final automated review. It does not establish whole MP-2, production recovery policy, deployment or merge eligibility. Publication and retrieval must be confirmed by the coordinator before claiming that these blobs are available on GitHub.

Planned bounded publication destination: the unique parentless evidence ref `local-evidence/pr-752/9130d359-targeted-20261021`, outside product/main history. No ref, commit or blob has been published by this preparation.
