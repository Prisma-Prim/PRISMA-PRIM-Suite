import { workingEvidenceTables } from '../working-evidence/working-evidence-schema.test-support.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { createPostgresRestTestHarness } from '../database/postgres-rest-test-harness.js';
import {
  fixtureHash,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from './external-invoice-migration.test-support.js';
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
} from './payment-evidence-predecessor.test-support.js';
import { conserveReceivedAddendumSchema } from './received-addendum-schema.test-support.js';
import { replayReceivedAddendumPredecessorSources } from './received-addendum-predecessor.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
const inherited = [
  {
    group: 'ancestral receipts',
    replay: replayPaymentPredecessorCapturedReceipts,
    layer: 'original',
  },
  {
    group: 'ancestral Date commands and histories',
    replay: replayPaymentPredecessorDates,
    layer: 'original',
  },
  {
    group: 'ancestral Invoice Records and Offer messages',
    replay: replayPaymentPredecessorDelivered1044,
    layer: 'original',
  },
  {
    group: 'ancestral reads and exact PDF/ZIP bytes',
    replay: replayPaymentPredecessorOriginalReadsAndBytes,
    layer: 'original',
  },
  {
    group: 'inherited Source captures, receipts, Versions and exact PDF bytes',
    replay: undefined,
    layer: 'source',
  },
  {
    group:
      'actual a917 Payment captures, receipts, restricted histories and exact source PDF bytes',
    replay: undefined,
    layer: 'actual',
  },
];
it.skipIf(!process.env.TEST_DATABASE_URL).each(inherited)(
  'conserves genuine populated immediate a917/0097 $group through migration twice and two real App restarts',
  async ({ replay, layer }) => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Native PostgreSQL is required.');
    const directory = 'test-support/fixtures/received-addendum-predecessor',
      backup = await readFile(directory + '/predecessor-a917.sql.gz'),
      compressed = await readFile(directory + '/context.json.gz'),
      provenanceBytes = await readFile(directory + '/provenance.json');
    expect(fixtureHash(provenanceBytes)).toBe(
      '289c78313f184e054feff3df6267d814ecefb3b8f5d597702c585ac49775c4e6',
    );
    const provenance = fixtureObject(
        JSON.parse(provenanceBytes.toString('utf8')),
      ),
      contextBytes = gunzipSync(compressed),
      context = fixtureObject(JSON.parse(contextBytes.toString('utf8'))),
      ancestor = fixtureObject(context.ancestor),
      original = fixtureObject(ancestor.ancestor),
      global = fixtureObject(context.actualA917GlobalReads);
    expect(provenance).toMatchObject({
      source: 'a917f06c290fbe8bbc5f693e2b645eecc9facd9a',
      tree: 'e4c0b1822baeb9f6e5a066beceb4fe6888918b15',
      predecessor: '0097_manual_payment_observations',
      nativeTables: 169,
      closedProducerBeforeDump: true,
      selectedSyntheticFixtureProvenance: true,
      independentRunnerAttestation: false,
      globalReadBoundary: { unchangedNativeRows: true },
    });
    expect(fixtureHash(backup)).toBe(provenance.backupSha256);
    expect(fixtureHash(compressed)).toBe(provenance.contextCompressedSha256);
    expect(fixtureHash(contextBytes)).toBe(provenance.contextSha256);
    expect(context.source).toBe(provenance.source);
    expect(context.tree).toBe(provenance.tree);
    expect(context.predecessor).toBe(provenance.predecessor);
    for (const [name, field] of [
      ['context.json.gz', 'contextCompressedSha256'],
      ['provenance.json', 'provenanceSha256'],
      ['predecessor-9394.sql.gz', 'backupSha256'],
    ]) {
      if (!name || !field) throw new Error('Ancestry manifest required');
      expect(
        fixtureHash(
          await readFile(
            'test-support/fixtures/payment-observation-predecessor/' + name,
          ),
        ),
      ).toBe(fixtureObject(provenance.ancestor)[field]);
    }
    const journal = fixtureObject(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      ),
      entries = fixtureObjects(journal.entries),
      index = entries.findIndex((entry) => entry.tag === context.predecessor);
    expect(index).toBe(97);
    expect(entries[index + 1]?.tag).toBe('0098_received_addendum_sources');
    expect(
      fixtureHash(
        JSON.stringify(
          { ...journal, entries: entries.slice(0, index + 1) },
          null,
          2,
        ),
      ),
    ).toBe(provenance.journalSha256);
    const replayOriginal = {
        ...original,
        reads: {
          ...fixtureObject(original.reads),
          ...fixtureObject(global.ancestralReads),
        },
        opportunityFollowUpPredecessor: {
          ...fixtureObject(original.opportunityFollowUpPredecessor),
          ...fixtureObject(global.dateActors),
          privacyProbes: global.datePrivacyProbes,
        },
      },
      runtime = paymentPredecessorRuntime(replayOriginal);
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'addendum_upgrade_a917',
    });
    let app:
        Awaited<ReturnType<typeof createPostgresRestTestHarness>> | undefined,
      scanner:
        Awaited<ReturnType<typeof openDocumentScannerFixture>> | undefined;
    try {
      await restorePaymentPredecessor(database.targetPool, backup);
      const tables = await paymentPredecessorTables(database.targetPool),
        before = await predecessorSnapshot(database.targetPool, tables),
        schema = await paymentPredecessorSchema(database.targetPool),
        beforeJournal = await paymentPredecessorJournal(database.targetPool);
      expect(tables).toEqual(context.nativeTables);
      expect(tables).toEqual(provenance.allNativeTables);
      expect(tables).toHaveLength(169);
      expect(before).toEqual(context.nativeBaseline);
      expect(schema).toEqual(context.nativeSchema);
      expect(fixtureHash(JSON.stringify(schema))).toBe(provenance.schemaSha256);
      expect(beforeJournal).toEqual(context.nativeJournal);
      expect(beforeJournal).toHaveLength(98);
      for (const [table, rows] of Object.entries(before)) {
        expect(fixtureObjects(rows), table).toHaveLength(
          Number(fixtureObject(provenance.nativeRowCounts)[table]),
        );
        expect(fixtureHash(JSON.stringify(rows)), table).toBe(
          fixtureObject(provenance.nativeRowsSha256)[table],
        );
      }
      for (const [table, rows] of Object.entries(
        fixtureObject(ancestor.nativeBaseline),
      ))
        for (const row of fixtureObjects(rows))
          expect(fixtureObjects(before[table]), table).toContainEqual(row);
      expect(fixtureObjects(before.payments)).toHaveLength(4);
      expect(fixtureObjects(before.payment_history).length).toBeGreaterThan(5);
      expect(fixtureObjects(before.payment_commands).length).toBeGreaterThan(5);
      expect(fixtureObjects(before.payment_events).length).toBeGreaterThan(5);
      for (let i = 0; i <= index; i++) {
        const entry = entries[i];
        if (!entry) throw new Error('Applied migration required');
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
          before,
        );
        const applied = await paymentPredecessorJournal(database.targetPool);
        expect(applied).toHaveLength(entries.length);
        expect(applied.slice(0, beforeJournal.length)).toEqual(beforeJournal);
        for (let i = beforeJournal.length; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry) throw new Error('Additive migration required');
          expect(applied[i]?.hash).toBe(
            fixtureHash(
              await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
            ),
          );
        }
        conserveReceivedAddendumSchema(
          schema,
          await paymentPredecessorSchema(database.targetPool),
          tables,
        );
      }
      expect(
        (await paymentPredecessorTables(database.targetPool)).filter(
          (table) => !tables.includes(table),
        ),
      ).toEqual([
        'received_addendum_document_relations',
        ...workingEvidenceTables,
      ]);
      const afterJournal = await paymentPredecessorJournal(database.targetPool);
      for (let restart = 0; restart < 3; restart++) {
        if (replay) {
          await runtime.open(database.targetUrl);
          await replay({ context: replayOriginal, runtime });
          await runtime.close();
        } else {
          scanner = await openDocumentScannerFixture();
          app = await createPostgresRestTestHarness({
            databaseUrl: database.targetUrl,
            synchronizeIdentityProfile: false,
            serverClock: {
              now: () =>
                new Date(
                  layer === 'actual'
                    ? '2026-11-06T12:00:00.000Z'
                    : '2026-11-05T12:00:00.000Z',
                ),
            },
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
          await replayReceivedAddendumPredecessorSources(
            layer === 'actual'
              ? context
              : {
                  ...ancestor,
                  workspaceId: context.workspaceId,
                  sourceReads: global.sourceReads,
                },
            app,
          );
          expect(scanner.scanCount).toBe(0);
          await app.close();
          app = undefined;
          await scanner.close();
          scanner = undefined;
        }
        expect(
          (
            await database.targetPool.query(
              'SELECT count(*)::int AS count FROM received_addendum_document_relations',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          before,
        );
        expect(await paymentPredecessorJournal(database.targetPool)).toEqual(
          afterJournal,
        );
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
