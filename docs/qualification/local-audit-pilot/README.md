# Fictional local audit pilot

This pilot runs the actual App, native API and a disposable PostgreSQL dossier. All people, source files and professional acts are fictional. It does not qualify real identities, malware scanning, OCR, external subscriptions or a private Client pilot. Nothing is deployed or merged into main under programme #1452.

## Start and reopen

Use the repository Node 24 and pnpm versions, installed workspace dependencies, Chromium and the supported managed PostgreSQL prerequisites. From the repository root:

```sh
pnpm pilot:audit
```

The bounded launcher builds the application, creates a fresh isolated database and prints a `ready` record with `guideUrl`, `manifestUrl` and the native Case identifier. Open `http://127.0.0.1:4173/__pilot`. The guide offers Romanian/Russian instructions, four fictional participants and the exact Company, Project, order and source-file identities. This composed source includes recoverable multi-file intake, controlled application/Stage draft preparation and the separately qualified free RU/RO OCR benchmark. The benchmark remains outside the application; no OCR/model/account is activated. Select a participant, select the named Company and Project, then follow the native controls. The manifest contains the current native IDs and original SHA-256 fingerprints.

Keep the terminal running. Closing or reopening the browser, including a new browser context, retains this session’s native dossier. Selecting a different fictional participant reloads the application and keeps decisions subject to that participant’s native grants. Every new launcher invocation creates a fresh fictional dossier; it does not resume a previous database. Press Ctrl+C to stop the owned session. Ports 4173/4174 must be free. The launcher refuses unsafe inherited database targets and occupied ports rather than replacing another process or database.

For bounded startup verification, including real Chromium application readiness and native refusal of external-account authorization:

```sh
pnpm pilot:audit --check
```

Startup has a 180-second deadline; interruption uses the existing managed runner’s process-group cleanup with a 10-second grace. Only loopback preview/API origins are admitted. Local participant aliases exist in the development preview plugin, outside the production application bundle. They select seeded test identities; the native API still authorizes each action. No external subscription/model request is enabled. The scanner and external HTTP boundaries remain synthetic test fixtures.

## Exercise the dossier

The prepared Case starts after the signed agreement and before team approval or decision. Download the exact bilingual PDF and DOCX from the guide. The fictional manager receives the existing Project document organizer grant for batch intake. The fictional auditor receives existing Document/source read grants for reviewed report context, through ordinary native grant commands in this disposable Company. Professional approval and decision remain independent. In Dossier Analysis, attach them, create a run and inspect the originals, citations and unreadable blank page. Enter or inspect proposals and deliberately confirm/correct their values. Analysis confirmation does not update canonical Case or Client facts. Use the multi-file import control to review ownership, language and per-file outcomes, pause/reopen and deliberately resume. Working originals remain drafts; formal Stage attachments remain separate native evidence. The draft-preparation controls preview selected human-reviewed application values or plan scope; the leader may append explicitly quoted source context to the Stage2 summary. Stage1 professional conclusions stay manual. Saving remains a separate native command.

Use the manager and independent approver for team preparation, then the manager for each Stage plan at its corresponding step and the auditor for Stage reports, NCs and recommendation. Independent approval and decision are separate acts. After a granted decision, the guide can prepare a fictional Certificate PDF from the current native granted texts and validity. Register that exact PDF through the application before draft, Client opinion, approval, issue and transmission. The example download itself performs no issuance or canonical write. Download the actual native Certificate and dossier register from the application.

The guide’s source PDF/DOCX bytes and ETags remain fixed for the session. Historical originals remain available through native Document Version authority. Access loss, stale Case/source state and self-approval still follow the ordinary native denial and validation rules.

## Source and proof

[source-manifest.json](source-manifest.json) pins all source inputs, their required CI runs, frozen composition base and promotion rule under [#1452](https://github.com/Prisma-Prim/PRISMA-PRIM-Suite/issues/1452). Call this complete source qualified only after every pinned required CI succeeds. The focused compatibility change sits above that base; original delivery branches remain unchanged. The native compatibility test proves an exact batch Word original can supply a human-corrected plan scope while its Document stays a draft. Target Case freshness and source freshness are checked independently; changing the Case does not invalidate an unchanged unbound Project original, while retiring its source prevents further preparation and retains reviewed history. Native Word preservation also checks admitted metadata, working revision and Project-association revision under its own transaction locks after scanning. A concurrent correction, PDF upload or unlink/relink refuses a new source; exact receipts still recover a previously committed original after a lost checkpoint acknowledgement. Native PDF preservation also fences the admitted Project association under its own Document update lock. A stale-target refusal is retained as a failed item before HTTP409, allowing deliberate Skip without losing confirmed checkpoints or changing the existing Document.

`local-audit-pilot.acceptance.spec.ts` drives the real guide/profile proxy and the complete shared combined-audit proof in RO desktop/RU narrow. `combined-audit-qualification.acceptance.spec.ts` calls the same typed proof through its original entry mode. Assertions cover exact originals, cited human review and exact uncertain retry, unchanged canonical facts, independent Case/source freshness, historical bytes, team/self-approval denial, native human Stage/NC/decision acts, actual Certificate/register downloads and access revoke/restore. The pilot additionally reopens the retained native certified Case in a clean browser context.

Run the registered native proof with the existing disposable database wrapper:

```sh
node scripts/managed-postgres.mjs -- pnpm verify:journey local-audit-pilot
node scripts/managed-postgres.mjs -- pnpm verify:journey combined-audit-qualification
node --test scripts/audit-pilot.test.mjs scripts/audit-pilot-preview.test.mjs
```

The HTTP echo in the preview unit test proves transport/body/key preservation only. Native browser proof establishes application permissions, state transitions and bytes. Published screenshots/downloads are an inspected fictional selection; complete local/CI traces are retained separately. This is prepared-example evidence, not real-world audit qualification.
