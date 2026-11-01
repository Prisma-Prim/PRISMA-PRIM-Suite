# Genuine populated 0091 predecessor

This synthetic native backup was produced by the unchanged delivered application
at commit `1416798bb55608853fc527abc3054fb30dbe5838`, tree
`4185fa74c3c3cf4b1b50624646d3b51bc549a01e`. Its own Drizzle journal ends at
`0091_project_next_action`. It contains no Internal Company Task schema or data.

The producer used a separate clean checkout, frozen pnpm install and compiled API.
A new isolated PostgreSQL database first restored the genuine populated 0090
fixture in `project-next-action-migration`; only the old application's migrations
and public API then added an explicit captured Next Action Coordinator grant,
three material next-action declarations and a no-op. The producer exercised all
21 saved old commands through their exact public replay routes and captured 41
public reads, including existing Task queues, Home, Activity, results, Client and
Knowledge search. The existing Project PDF export was downloaded through its real
route. The producer application closed before native `pg_dump --column-inserts`.
No successor application or ORM, disabled trigger or nullable Task conversion
participated in production of this backup.

The backup includes 57 populated public tables, 36 old Tasks, single and group
planning receipts, immutable task/result/source facts, captured assignments, two
original PDF contents, a governed Client union and its identifier fences, and
populated 0091 history/events/receipts. All identities, addresses, prose and PDF
content are synthetic. The logical old server instant was
`2026-10-31T12:00:00.000Z`; pre-existing facts retain their original timestamps.

`context.json` contains the public command inputs, exact old replay responses,
public read snapshots, original PDF hashes and factual exported manifest/file
hashes. Only the ZIP manifest's newly generated `preparedAt` is excluded from
export comparison; every original PDF byte and every other manifest field is
compared. JSON was formatted without changing values, and the provenance hash
binds the final formatted context. The compressed native backup is unchanged.
`provenance.json` binds the source/tree, backup/context hashes and a 741-file
producer input manifest with its own hash. These are reproducible synthetic test
inputs and locally recorded provenance, not an independent runner attestation.

The migration test restores this backup, verifies the immediate predecessor and
populated single/group/native facts, compares every full old public table through
two migration calls, and exercises every captured public read/replay/PDF/export.
It then grants only the new bundle, establishes an explicit old-data baseline,
operates private work, and repeats exact conservation plus private history/replay
after two application restarts.
