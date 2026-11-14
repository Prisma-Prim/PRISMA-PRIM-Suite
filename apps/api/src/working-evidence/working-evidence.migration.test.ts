import { withoutGrantsList } from '../access/company-grants.test-support.js';
import { conserveWorkingEvidenceSchema } from './working-evidence-schema.test-support.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
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
  paymentPredecessorSchema,
  paymentPredecessorTables,
  replayPaymentPredecessorCapturedReceipts,
  replayPaymentPredecessorDates,
  replayPaymentPredecessorDelivered1044,
  replayPaymentPredecessorOriginalReadsAndBytes,
  paymentPredecessorRuntime,
  restorePaymentPredecessor,
} from '../documents/payment-evidence-predecessor.test-support.js';
import { replayReceivedAddendumPredecessorSources } from '../documents/received-addendum-predecessor.test-support.js';

const layers = [
  'ancestral-receipts',
  'ancestral-dates',
  'ancestral-commercial',
  'ancestral-originals',
  'inherited-source',
  'inherited-payment',
  'actual-addendum',
];
it.skipIf(!process.env.TEST_DATABASE_URL).each(layers)(
  'conserves actual1749/0098 populated predecessor %s through additive migration and two App restarts',
  async (layer) => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('PostgreSQL is required.');
    const directory = 'test-support/fixtures/working-evidence-predecessor';
    const backup = await readFile(directory + '/predecessor-1749.sql.gz');
    const compressed = await readFile(directory + '/context.json.gz');
    const provenanceBytes = await readFile(directory + '/provenance.json');
    const provenance = fixtureObject(
      JSON.parse(provenanceBytes.toString('utf8')),
    );
    const contextBytes = gunzipSync(compressed);
    const context = fixtureObject(JSON.parse(contextBytes.toString('utf8')));
    expect(provenance).toMatchObject({
      source: '174952efd701fca4b44f2919dc1021673a7fa99c',
      tree: '47ef8bc75f82a64e36b98013d55480d71bb3a2cd',
      predecessor: '0098_received_addendum_sources',
      closedProducerBeforeDump: true,
      selectedSyntheticFixtureProvenance: true,
      independentRunnerAttestation: false,
    });
    expect(fixtureHash(backup)).toBe(provenance.backupSha256);
    expect(fixtureHash(compressed)).toBe(provenance.contextCompressedSha256);
    expect(fixtureHash(contextBytes)).toBe(provenance.contextSha256);
    expect(
      fixtureHash(await readFile('drizzle/0098_received_addendum_sources.sql')),
    ).toBe(provenance.migrationSha256);
    const journal = fixtureObject(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    const entries = fixtureObjects(journal.entries);
    expect(entries[98]?.tag).toBe(context.predecessor);
    expect(
      fixtureHash(
        JSON.stringify({ ...journal, entries: entries.slice(0, 99) }, null, 2),
      ),
    ).toBe(provenance.journalSha256);
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'working_evidence_upgrade',
    });
    const ancestor = fixtureObject(context.ancestor);
    const prior = fixtureObject(ancestor.ancestor);
    const original = fixtureObject(prior.ancestor);
    const priorGlobal = fixtureObject(ancestor.actualA917GlobalReads);
    const replayOriginal = {
      ...original,
      reads: {
        ...fixtureObject(original.reads),
        ...fixtureObject(priorGlobal.ancestralReads),
      },
      opportunityFollowUpPredecessor: {
        ...fixtureObject(original.opportunityFollowUpPredecessor),
        ...fixtureObject(priorGlobal.dateActors),
        privacyProbes: priorGlobal.datePrivacyProbes,
      },
    };
    const runtime = paymentPredecessorRuntime(replayOriginal);
    let app:
      Awaited<ReturnType<typeof createPostgresRestTestHarness>> | undefined;
    let scanner:
      Awaited<ReturnType<typeof openDocumentScannerFixture>> | undefined;
    try {
      await restorePaymentPredecessor(database.targetPool, backup);
      const tables = await paymentPredecessorTables(database.targetPool);
      expect(tables).toEqual(context.nativeTables);
      expect(tables).toEqual(provenance.allNativeTables);
      const before = await predecessorSnapshot(database.targetPool, tables);
      expect(before).toEqual(context.nativeBaseline);
      const beforeSchema = await paymentPredecessorSchema(database.targetPool);
      expect(beforeSchema).toEqual(context.nativeSchema);
      expect(fixtureHash(JSON.stringify(beforeSchema))).toBe(
        provenance.schemaSha256,
      );
      expect(
        fixtureObjects(before.received_addendum_document_relations).length,
      ).toBeGreaterThan(0);
      expect(fixtureObjects(before.document_pdfs).length).toBeGreaterThan(0);
      expect(
        fixtureObjects(before.company_role_assignments).some(
          (entry) => fixtureObject(entry.row).revoked_at !== null,
        ),
      ).toBe(true);
      const oldJournal = await paymentPredecessorJournal(database.targetPool);
      expect(oldJournal).toHaveLength(99);
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          before,
        );
        const applied = await paymentPredecessorJournal(database.targetPool);
        expect(applied).toHaveLength(entries.length);
        expect(applied.slice(0, 99)).toEqual(oldJournal);
        conserveWorkingEvidenceSchema(
          beforeSchema,
          await paymentPredecessorSchema(database.targetPool),
          tables,
        );
      }
      const afterJournal = await paymentPredecessorJournal(database.targetPool);
      for (let restart = 0; restart < 3; restart++) {
        const legacyReplay =
          layer === 'ancestral-receipts'
            ? replayPaymentPredecessorCapturedReceipts
            : layer === 'ancestral-dates'
              ? replayPaymentPredecessorDates
              : layer === 'ancestral-commercial'
                ? replayPaymentPredecessorDelivered1044
                : layer === 'ancestral-originals'
                  ? replayPaymentPredecessorOriginalReadsAndBytes
                  : undefined;
        if (legacyReplay) {
          await runtime.open(database.targetUrl);
          await legacyReplay({ context: replayOriginal, runtime });
          await runtime.close();
        } else {
          scanner = await openDocumentScannerFixture();
          app = await createPostgresRestTestHarness({
            databaseUrl: database.targetUrl,
            synchronizeIdentityProfile: false,
            serverClock: {
              now: () =>
                new Date(
                  layer === 'actual-addendum'
                    ? '2026-10-24T09:00:00.000Z'
                    : '2026-11-06T12:00:00.000Z',
                ),
            },
            environment: {
              ...scanner.environment,
              KNOWLEDGE_EVIDENCE_ENABLED: 'true',
              NODE_ENV: 'test',
              ACCESS_IDENTITY_MODE: 'test',
              ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
              ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT:
                layer === 'actual-addendum'
                  ? 'estimate-offer-owner'
                  : 'mission-owner',
              ACCESS_BOOTSTRAP_WORKSPACE_ID: fixtureString(
                layer === 'actual-addendum'
                  ? context.workspaceId
                  : ancestor.workspaceId,
              ),
              ACCESS_BOOTSTRAP_WORKSPACE_NAME:
                layer === 'actual-addendum'
                  ? 'Fictional preserved predecessor'
                  : 'Mission Documents DEMO',
            },
          });
          if (layer === 'actual-addendum')
            await replayActualAddendum(context, app);
          else
            await replayReceivedAddendumPredecessorSources(
              layer === 'inherited-payment'
                ? ancestor
                : {
                    ...prior,
                    workspaceId: ancestor.workspaceId,
                    sourceReads: priorGlobal.sourceReads,
                  },
              app,
            );
          expect(scanner.scanCount).toBe(0);
          await app.close();
          app = undefined;
          await scanner.close();
          scanner = undefined;
        }
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          before,
        );
        expect(await paymentPredecessorJournal(database.targetPool)).toEqual(
          afterJournal,
        );
        for (const table of [
          'received_audit_source_registrations',
          'working_evidence_cases',
          'working_evidence_revisions',
          'working_evidence_supports',
          'working_evidence_outputs',
          'working_evidence_receipts',
          'working_evidence_events',
        ])
          expect(
            (
              await database.targetPool.query(
                `SELECT count(*)::int AS count FROM ${table}`,
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
      }
    } finally {
      await runtime.close();
      await app?.close();
      await scanner?.close();
      await database.close();
    }
  },
  120_000,
);

async function replayActualAddendum(
  context: Record<string, unknown>,
  app: Awaited<ReturnType<typeof createPostgresRestTestHarness>>,
) {
  async function call(captured: Record<string, unknown>, method = 'GET') {
    const payload =
      captured.payload === undefined ? null : fixtureObject(captured.payload);
    return fetch(app.origin + '/api' + fixtureString(captured.path), {
      method,
      headers: {
        ...fixtureHeaders(captured.identity),
        'x-workspace-context-id': fixtureString(context.workspaceId),
        'x-company-context-id': fixtureString(captured.companyId),
        ...(captured.requestHeaders === undefined
          ? {}
          : fixtureHeaders(captured.requestHeaders)),
      },
      ...(payload
        ? {
            body:
              payload.kind === 'bytes'
                ? new Uint8Array(
                    Buffer.from(fixtureString(payload.base64), 'base64'),
                  )
                : JSON.stringify(payload.value),
          }
        : {}),
    });
  }
  for (const captured of fixtureObjects(context.sourceCommands)) {
    const response = await call(captured, fixtureString(captured.method));
    expect(response.status, fixtureString(captured.path)).toBe(
      captured.replayStatus,
    );
    expect(await response.json()).toEqual(captured.replayResponse);
  }
  for (const captured of fixtureObjects(context.sourceReads)) {
    const response = await call(captured);
    expect(response.status, fixtureString(captured.path)).toBe(200);
    const body: unknown = withoutGrantsList(
      fixtureString(captured.path),
      await response.json(),
    );
    expect(body).toEqual(captured.response);
  }
  for (const captured of fixtureObjects(context.sourceBinaries)) {
    const response = await call(captured);
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(captured.byteLength);
    expect(fixtureHash(bytes)).toBe(captured.sha256);
    for (const header of fixtureObjects(captured.headers))
      expect(response.headers.get(fixtureString(header.name))).toBe(
        header.value,
      );
  }
}
