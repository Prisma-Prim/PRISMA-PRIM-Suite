import { conserveFrozenPdfPolicyUpgrade } from '../documents/frozen-pdf-policy-schema.test-support.js';
import { certificationTables } from '../certification/certification-schema.test-support.js';
import {
  workingEvidenceExistingTableTriggers,
  workingEvidenceTables,
} from '../working-evidence/working-evidence-schema.test-support.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { committedMigrationTables } from '../database/committed-migration-test-support.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import {
  fixtureHash,
  fixtureHeaders,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from '../documents/external-invoice-migration.test-support.js';
import {
  paymentPredecessorJournal,
  paymentPredecessorRuntime,
  paymentPredecessorSchema,
  paymentPredecessorTables,
  replayPaymentPredecessorCapturedReceipts,
  replayPaymentPredecessorDates,
  replayPaymentPredecessorDelivered1044,
  replayPaymentPredecessorOriginalReadsAndBytes,
  restorePaymentPredecessor,
} from '../documents/payment-evidence-predecessor.test-support.js';
import {
  withoutReceivedAddendumSchema,
  receivedAddendumExistingTableTriggers,
} from '../documents/received-addendum-schema.test-support.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';

function capturedCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('A captured native count is required.');
  return value;
}
const predecessorSource = '9394a08a923adb22bd47dde5d4528cdacc05e906';
const predecessorTree = '49cd5ed5d36bddc1c66e274448d052525b4d45c9';
const provenanceHash =
  '269d16aabe722fd766c269c025bf92715c13cea75d2a608eab836c19e7b50d27';
const inheritedGroups = [
  {
    group: 'ancestral captured receipts',
    replay: replayPaymentPredecessorCapturedReceipts,
  },
  {
    group: 'ancestral Date receipts and integral histories',
    replay: replayPaymentPredecessorDates,
  },
  {
    group: 'ancestral Invoice Records and Offer messages',
    replay: replayPaymentPredecessorDelivered1044,
  },
  {
    group: 'ancestral reads, PDF originals and factual ZIP',
    replay: replayPaymentPredecessorOriginalReadsAndBytes,
  },
];
it.skipIf(!process.env.TEST_DATABASE_URL).each([
  ...inheritedGroups,
  {
    group:
      'actual9394 Source v1 actors, commands, copied payer, Versions and exact PDFs',
    replay: undefined,
  },
])(
  'conserves genuine actual9394/0096 $group through additive migration twice and two real App/API restarts',
  async ({ replay }) => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Native PostgreSQL is required.');
    const directory = 'test-support/fixtures/payment-observation-predecessor';
    const [backup, compressed, provenanceBytes] = await Promise.all(
      ['predecessor-9394.sql.gz', 'context.json.gz', 'provenance.json'].map(
        (name) => readFile(directory + '/' + name),
      ),
    );
    if (!backup || !compressed || !provenanceBytes)
      throw new Error('A complete immediate-predecessor capture is required.');
    expect(fixtureHash(provenanceBytes)).toBe(provenanceHash);
    const provenance = fixtureObject(
        JSON.parse(provenanceBytes.toString('utf8')),
      ),
      contextBytes = gunzipSync(compressed),
      context = fixtureObject(JSON.parse(contextBytes.toString('utf8'))),
      ancestor = fixtureObject(context.ancestor);
    expect(provenance).toMatchObject({
      source: predecessorSource,
      tree: predecessorTree,
      predecessor: '0096_payment_evidence_sources',
      closedProducerBeforeDump: true,
      selectedSyntheticFixtureProvenance: true,
      independentRunnerAttestation: false,
      ancestor: {
        source: 'f87911a5fc4bd8de9b79f9f17e7a58b54ae9b4e7',
        tree: '793b4896f6048b6595e3db026af9cb9b4394b7f4',
        predecessor: '0095_invoice_records',
      },
    });
    expect(fixtureHash(backup)).toBe(provenance.backupSha256);
    expect(fixtureHash(compressed)).toBe(provenance.contextCompressedSha256);
    expect(fixtureHash(contextBytes)).toBe(provenance.contextSha256);
    expect(context).toMatchObject({
      source: predecessorSource,
      tree: predecessorTree,
      predecessor: provenance.predecessor,
    });
    expect(
      fixtureHash(
        await readFile(
          'test-support/fixtures/payment-evidence-predecessor/context.json.gz',
        ),
      ),
    ).toBe(fixtureObject(provenance.ancestor).contextCompressedSha256);
    expect(
      fixtureHash(
        await readFile(
          'test-support/fixtures/payment-evidence-predecessor/provenance.json',
        ),
      ),
    ).toBe(fixtureObject(provenance.ancestor).provenanceSha256);
    const journal = fixtureObject(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      ),
      entries = fixtureObjects(journal.entries),
      index = entries.findIndex((entry) => entry.tag === context.predecessor);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(entries.length).toBeGreaterThan(index + 1);
    expect(
      fixtureHash(
        JSON.stringify(
          { ...journal, entries: entries.slice(0, index + 1) },
          null,
          2,
        ),
      ),
    ).toBe(provenance.journalSha256);
    const database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: url,
        namePrefix: 'payment_upgrade_9394',
      }),
      globalReads = fixtureObject(context.actual9394GlobalReads),
      replayAncestor = {
        ...ancestor,
        reads: {
          ...fixtureObject(ancestor.reads),
          ...fixtureObject(globalReads.ancestralReads),
        },
        opportunityFollowUpPredecessor: {
          ...fixtureObject(ancestor.opportunityFollowUpPredecessor),
          privacyProbes: fixtureObjects(globalReads.datePrivacyProbes),
        },
      },
      runtime = paymentPredecessorRuntime(replayAncestor);
    let sourceApp:
      Awaited<ReturnType<typeof createPostgresRestTestHarness>> | undefined;
    let scanner:
      Awaited<ReturnType<typeof openDocumentScannerFixture>> | undefined;
    try {
      await restorePaymentPredecessor(database.targetPool, backup);
      const tables = await paymentPredecessorTables(database.targetPool),
        original = await predecessorSnapshot(database.targetPool, tables),
        schema = await paymentPredecessorSchema(database.targetPool),
        beforeJournal = await paymentPredecessorJournal(database.targetPool);
      expect(tables).toEqual(context.nativeTables);
      expect(tables).toEqual(provenance.allNativeTables);
      expect(tables).toEqual(
        Object.keys(fixtureObject(context.nativeBaseline)).sort(),
      );
      expect(tables).toHaveLength(capturedCount(provenance.nativeTables));
      expect(original).toEqual(context.nativeBaseline);
      expect(schema).toEqual(context.nativeSchema);
      expect(fixtureHash(JSON.stringify(schema))).toBe(provenance.schemaSha256);
      expect(beforeJournal).toEqual(context.nativeJournal);
      expect(beforeJournal).toHaveLength(index + 1);
      for (const [table, rows] of Object.entries(original)) {
        expect(fixtureObjects(rows), table).toHaveLength(
          capturedCount(fixtureObject(provenance.nativeRowCounts)[table]),
        );
        expect(fixtureHash(JSON.stringify(rows)), table).toBe(
          fixtureObject(provenance.nativeRowsSha256)[table],
        );
      }
      for (const [table, rows] of Object.entries(
        fixtureObject(ancestor.nativeBaseline),
      ))
        for (const row of fixtureObjects(rows))
          expect(fixtureObjects(original[table]), table).toContainEqual(row);
      for (let i = 0; i <= index; i++) {
        const entry = entries[i];
        if (!entry)
          throw new Error('Every applied ancestral migration is required.');
        expect(beforeJournal[i]?.hash).toBe(
          fixtureHash(
            await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
          ),
        );
      }
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        const applied = await paymentPredecessorJournal(database.targetPool);
        expect(applied).toHaveLength(entries.length);
        expect(applied.slice(0, beforeJournal.length)).toEqual(beforeJournal);
        for (let i = beforeJournal.length; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry)
            throw new Error('The actual additive migration is required.');
          expect(applied[i]?.hash).toBe(
            fixtureHash(
              await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
            ),
          );
        }
        const after = await paymentPredecessorSchema(database.targetPool),
          normalized = withoutReceivedAddendumSchema(
            conserveFrozenPdfPolicyUpgrade(schema, after),
          );
        for (const [kind, rows] of Object.entries(schema))
          for (const entry of fixtureObjects(rows))
            expect(
              fixtureObjects(normalized[kind]).find(
                (value) => value.name === entry.name,
              ),
              kind + ':' + String(entry.name),
            ).toEqual(entry);
        const oldTriggers = new Set(
          fixtureObjects(schema.triggers).map((value) => value.name),
        );
        expect(
          fixtureObjects(after.triggers)
            .map((value) => fixtureString(value.name))
            .filter(
              (name) =>
                !oldTriggers.has(name) &&
                tables.some((table) => name.startsWith(table + '.')),
            ),
        ).toEqual(
          [
            'companies.payment_company_cursor',
            ...receivedAddendumExistingTableTriggers,
            ...workingEvidenceExistingTableTriggers,
          ].sort(),
        );
      }
      const actualTables = await paymentPredecessorTables(database.targetPool),
        currentTables = await committedMigrationTables(entries);
      expect(actualTables).toEqual(currentTables);
      expect(actualTables.filter((table) => !tables.includes(table))).toEqual([
        ...certificationTables,
        'payment_commands',
        'payment_cursor_keys',
        'payment_events',
        'payment_history',
        'payments',
        'received_addendum_document_relations',
        ...workingEvidenceTables,
      ]);
      const upgradedJournal = await paymentPredecessorJournal(
        database.targetPool,
      );
      async function noInferredPayment() {
        expect(
          (
            await database.targetPool.query<{
              roots: number;
              commands: number;
              history: number;
              events: number;
            }>(
              'SELECT (SELECT count(*)::int FROM payments) roots,(SELECT count(*)::int FROM payment_commands) commands,(SELECT count(*)::int FROM payment_history) history,(SELECT count(*)::int FROM payment_events) events',
            )
          ).rows,
        ).toEqual([{ roots: 0, commands: 0, history: 0, events: 0 }]);
      }
      for (let restart = 0; restart < 3; restart++) {
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        if (replay) {
          await runtime.open(database.targetUrl);
          await replay({ context: replayAncestor, runtime });
          await runtime.close();
        } else {
          scanner = await openDocumentScannerFixture();
          sourceApp = await createPostgresRestTestHarness({
            databaseUrl: database.targetUrl,
            synchronizeIdentityProfile: false,
            serverClock: { now: () => new Date('2026-11-05T12:00:00.000Z') },
            environment: {
              ...scanner.environment,
              KNOWLEDGE_EVIDENCE_ENABLED: 'true',
              NODE_ENV: 'test',
              ACCESS_IDENTITY_MODE: 'test',
              ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
              ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
              ACCESS_BOOTSTRAP_WORKSPACE_ID: fixtureString(context.workspaceId),
              ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
            },
          });
          const sourceOrigin = sourceApp.origin;
          async function call(
            path: string,
            captured: Record<string, unknown>,
            method = 'GET',
          ) {
            const payload =
              captured.payload === undefined
                ? undefined
                : fixtureObject(captured.payload);
            return fetch(sourceOrigin + '/api' + path, {
              method,
              headers: {
                ...fixtureHeaders(context.identity),
                'x-workspace-context-id': fixtureString(context.workspaceId),
                ...(captured.companyId === null
                  ? {}
                  : {
                      'x-company-context-id': fixtureString(
                        captured.companyId ?? context.companyId,
                      ),
                    }),
                'idempotency-key':
                  captured.key === undefined
                    ? 'actual9394-read'
                    : fixtureString(captured.key),
                ...(captured.requestHeaders === undefined
                  ? {}
                  : fixtureHeaders(captured.requestHeaders)),
              },
              ...(payload
                ? {
                    body:
                      payload.kind === 'bytes'
                        ? new Uint8Array(
                            Buffer.from(
                              fixtureString(payload.base64),
                              'base64',
                            ),
                          )
                        : JSON.stringify(payload.value),
                  }
                : {}),
            });
          }
          for (const captured of fixtureObjects(context.sourceCommands)) {
            const response = await call(
              fixtureString(captured.path),
              captured,
              fixtureString(captured.method),
            );
            expect(response.status, fixtureString(captured.path)).toBe(
              captured.initialStatus,
            );
            expect(await response.json()).toEqual(captured.replayResponse);
          }
          for (const captured of fixtureObjects(context.sourceReads)) {
            const path = fixtureString(captured.path),
              response = await call(path, captured);
            expect(response.status, path).toBe(200);
            const value: unknown = await response.json();
            if (path === '/access/current-actor') {
              const actor = fixtureObject(value),
                company = fixtureObject(actor.activeCompany),
                {
                  paymentObservationReadCapture,
                  paymentObservationContextCapture,
                  receivedAddendumAccessAssignmentId,
                  receivedAddendumAccessPermissionSetVersion,
                  receivedAddendumClientReadCapture,
                  ...preserved
                } = company;
              expect(receivedAddendumAccessAssignmentId).toBeUndefined();
              expect(
                receivedAddendumAccessPermissionSetVersion,
              ).toBeUndefined();
              expect(receivedAddendumClientReadCapture).toBeUndefined();
              expect(paymentObservationReadCapture).toMatch(
                /^payment-observation-read\.v1\.[a-f0-9]{64}$/u,
              );
              expect(paymentObservationContextCapture).toMatch(
                /^payment-observation-context\.v1\.[a-f0-9]{64}$/u,
              );
              expect({ ...actor, activeCompany: preserved }).toEqual(
                captured.response,
              );
            } else expect(value, path).toEqual(captured.response);
          }
          for (const captured of fixtureObjects(context.sourceBinaries)) {
            const response = await call(fixtureString(captured.path), captured);
            expect(response.status).toBe(200);
            const bytes = new Uint8Array(await response.arrayBuffer());
            expect(bytes.length).toBe(captured.byteLength);
            expect(fixtureHash(bytes)).toBe(captured.sha256);
            for (const header of fixtureObjects(captured.headers))
              expect(response.headers.get(fixtureString(header.name))).toBe(
                header.value,
              );
          }
          expect(scanner.scanCount).toBe(0);
          await sourceApp.close();
          sourceApp = undefined;
          await scanner.close();
          scanner = undefined;
        }
        await noInferredPayment();
        expect(await paymentPredecessorJournal(database.targetPool)).toEqual(
          upgradedJournal,
        );
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
      }
    } finally {
      await runtime.close();
      await sourceApp?.close();
      await scanner?.close();
      await database.close();
    }
  },
  120_000,
);
