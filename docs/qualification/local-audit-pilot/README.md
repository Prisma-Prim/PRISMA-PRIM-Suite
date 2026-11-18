# Fictional local audit pilot

This pilot runs the actual App, native API and a disposable PostgreSQL dossier. All people, source files and professional acts are fictional. It does not qualify real identities, malware scanning, OCR, external subscriptions or a private Client pilot. Nothing is deployed or merged into main under programme #1452.

## Start and reopen

Use the repository Node 24 and pnpm versions, installed workspace dependencies, Chromium and the supported managed PostgreSQL prerequisites. From the repository root:

```sh
pnpm pilot:audit
```

The bounded launcher builds the application, creates a fresh isolated database and prints a `ready` record with `guideUrl`, `manifestUrl` and the native Case identifier. Open `http://127.0.0.1:4173/__pilot`. The guide offers Romanian/Russian instructions, four fictional participants and the exact Company, Project, order and source-file identities. Select a participant, select the named Company and Project, then follow the native controls. The manifest contains the current native IDs and original SHA-256 fingerprints.

Keep the terminal running. Closing or reopening the browser, including a new browser context, retains this session’s native dossier. Selecting a different fictional participant reloads the application and keeps decisions subject to that participant’s native grants. Every new launcher invocation creates a fresh fictional dossier; it does not resume a previous database. Press Ctrl+C to stop the owned session. Ports 4173/4174 must be free. The launcher refuses unsafe inherited database targets and occupied ports rather than replacing another process or database.

For bounded startup verification, including real Chromium application readiness and native refusal of external-account authorization:

```sh
pnpm pilot:audit --check
```

Startup has a 180-second deadline; interruption uses the existing managed runner’s process-group cleanup with a 10-second grace. Only loopback preview/API origins are admitted. Local participant aliases exist in the development preview plugin, outside the production application bundle. They select seeded test identities; the native API still authorizes each action. No external subscription/model request is enabled. The scanner and external HTTP boundaries remain synthetic test fixtures.

## Exercise the dossier

The prepared Case starts after the signed agreement and before team approval or decision. Download the exact bilingual PDF and DOCX from the guide. In Dossier Analysis, attach them, create a run and inspect the originals, citations and unreadable blank page. Enter or inspect proposals and deliberately confirm/correct their values. Analysis confirmation does not update canonical Case or Client facts. The existing draft-preparation control previews selected reviewed fields; saving remains a separate native command and can invalidate later checks.

Use the manager and independent approver for team preparation, then the manager for each Stage plan at its corresponding step and the auditor for Stage reports, NCs and recommendation. Independent approval and decision are separate acts. After a granted decision, the guide can prepare a fictional Certificate PDF from the current native granted texts and validity. Register that exact PDF through the application before draft, Client opinion, approval, issue and transmission. The example download itself performs no issuance or canonical write. Download the actual native Certificate and dossier register from the application.

The guide’s source PDF/DOCX bytes and ETags remain fixed for the session. Historical originals remain available through native Document Version authority. Access loss, stale Case/source state and self-approval still follow the ordinary native denial and validation rules.

## Source and proof

[source-manifest.json](source-manifest.json) pins both independently green inputs and their frozen composition base. The pilot commit sits above that base and preserves the input histories. Existing input branches are not modified.

`local-audit-pilot.acceptance.spec.ts` drives the real guide/profile proxy and the complete shared combined-audit proof in RO desktop/RU narrow. `combined-audit-qualification.acceptance.spec.ts` calls the same typed proof through its original entry mode. Assertions cover exact originals, cited human review and exact uncertain retry, unchanged canonical facts, independent Case/source freshness, historical bytes, team/self-approval denial, native human Stage/NC/decision acts, actual Certificate/register downloads and access revoke/restore. The pilot additionally reopens the retained native certified Case in a clean browser context.

Run the registered native proof with the existing disposable database wrapper:

```sh
node scripts/managed-postgres.mjs -- pnpm verify:journey local-audit-pilot
node scripts/managed-postgres.mjs -- pnpm verify:journey combined-audit-qualification
node --test scripts/audit-pilot.test.mjs scripts/audit-pilot-preview.test.mjs
```

The HTTP echo in the preview unit test proves transport/body/key preservation only. Native browser proof establishes application permissions, state transitions and bytes. Published screenshots/downloads are an inspected fictional selection; complete local/CI traces are retained separately. This is prepared-example evidence, not real-world audit qualification.
