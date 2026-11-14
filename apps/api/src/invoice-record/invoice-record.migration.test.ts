import { withoutGrantsList } from '../access/company-grants.test-support.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { committedMigrationTables } from '../database/committed-migration-test-support.js';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  fixtureHash,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from '../documents/external-invoice-migration.test-support.js';
import {
  invoicePredecessorProtocols,
  type UpgradeCallOptions,
} from './invoice-record-predecessor-protocols.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades the genuine populated0094 twice, retaining all158 native tables/334 protocols/10 PDFs/ZIP/manual Dates through two restarts with zero inferred Records or grants',
  async () => {
    const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!baseDatabaseUrl) throw new Error('Native PostgreSQL is required.');
    const directory = 'test-support/fixtures/invoice-record-predecessor';
    const backup = await readFile(directory + '/predecessor-date.sql.gz'),
      compressed = await readFile(directory + '/context.json.gz'),
      contextBytes = gunzipSync(compressed),
      provenanceBytes = await readFile(directory + '/provenance.json');
    const context = fixtureObject(JSON.parse(contextBytes.toString('utf8'))),
      provenance = fixtureObject(JSON.parse(provenanceBytes.toString('utf8')));
    expect(fixtureHash(await readFile(directory + '/README.md'))).toBe(
      'be7935bd0a9f779322030ee21b20841dfeca85a5b263f35c7d822fbc7e7c876c',
    );
    expect(fixtureHash(backup)).toBe(
      '8d536c9be84e444a6d4ba91b508a3cc611274a8600784cfbaa477c9f9d8f88ac',
    );
    expect(fixtureHash(compressed)).toBe(
      '91d96ca0a8d4e1e232262a98003682f7f227ad89a165d4538e50e8290e1edd2c',
    );
    expect(fixtureHash(contextBytes)).toBe(
      'f6fa8294759a7b69e0a8cc62ea23a07d970f27f4cbbe18b27f7194c19c9711c9',
    );
    expect(fixtureHash(provenanceBytes)).toBe(
      '28fe0c513b6b4796567f151910ed6f98d598b595d2865a7e76dd0664ced977b0',
    );
    expect(provenance).toMatchObject({
      source: 'd608b0436288e89f3c580c8ace219f304ec9ea3a',
      base: '8c67367860b5591374e3fd7e8fd31dad9006921e',
      tree: '7db5b3e858c09a9a7e4106cb6649b565c4ae75a5',
      predecessor: '0094_opportunity_follow_up',
      closedProducerBeforeDump: true,
      nativeTables: 158,
      sourceInputCount: 2275,
      sourceInputManifestSha256:
        '75bdeec1b64678bf077fa40ac0b921d0f79e642d293b300f050edccd9f173f0b',
      backupSha256: fixtureHash(backup),
      contextSha256: fixtureHash(contextBytes),
      compressedContextSha256: fixtureHash(compressed),
      oldReadCount: 41,
      oldCommandCount: 21,
      priorCapturedCommandCount: 94,
      prior0093CommandCount: 145,
      newCapturedCommandCount: 74,
      selectedSyntheticFixtureProvenance: true,
      independentRunnerAttestation: false,
    });
    expect(context.source).toBe(provenance.source);
    expect(context.tree).toBe(provenance.tree);
    expect(context.predecessor).toBe(provenance.predecessor);
    expect(
      fixtureHash(await readFile('drizzle/0094_opportunity_follow_up.sql')),
    ).toBe(provenance.migrationSha256);
    const journal = fixtureObject(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      ),
      entries = fixtureObjects(journal.entries),
      migrationIndex = entries.findIndex(
        (entry) => entry.tag === '0095_invoice_records',
      );
    expect(migrationIndex).toBe(95);
    expect(entries[migrationIndex - 1]?.tag).toBe(context.predecessor);
    expect(
      fixtureHash(
        JSON.stringify({ ...journal, entries: entries.slice(0, 95) }, null, 2),
      ),
    ).toBe(provenance.journalSha256);
    const oldReads = fixtureObject(context.reads),
      oldCommands = fixtureObjects(context.commands),
      captured = fixtureObjects(context.capturedCommands),
      sources = fixtureObjects(context.native0093Commands),
      dates = fixtureObjects(context.nativeDateCommands);
    expect(Object.keys(oldReads)).toHaveLength(41);
    expect(oldCommands).toHaveLength(21);
    expect(captured).toHaveLength(94);
    expect(sources).toHaveLength(145);
    expect(dates).toHaveLength(74);
    expect(
      oldCommands.length + captured.length + sources.length + dates.length,
    ).toBe(334);
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl,
      namePrefix: 'invoice_native0094',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      const empty = "SELECT pg_catalog.set_config('search_path', '', false);";
      expect(sql.split(empty)).toHaveLength(2);
      await database.targetPool.query(
        sql
          .replace(
            empty,
            "SELECT pg_catalog.set_config('search_path', 'public', false);",
          )
          .split('\n')
          .filter((line) => !/^\\(?:un)?restrict /u.test(line))
          .join('\n'),
      );
      await database.targetPool.query('SET search_path TO public');
      const tableNames = async () =>
        (
          await database.targetPool.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
          )
        ).rows.map((row) => row.tablename);
      const tables = await tableNames();
      expect(tables).toHaveLength(158);
      const original = await predecessorSnapshot(database.targetPool, tables);
      expect(original).toEqual(context.nativeBaseline);
      const counts = fixtureObject(context.nativeRowCounts),
        hashes = fixtureObject(context.nativeRowsSha256);
      expect(counts).toEqual(provenance.nativeRowCounts);
      expect(Object.keys(original)).toEqual(Object.keys(counts));
      expect(Object.keys(original)).toEqual(Object.keys(hashes));
      for (const [table, rows] of Object.entries(original)) {
        expect(fixtureObjects(rows).length, table).toBe(counts[table]);
        expect(fixtureHash(JSON.stringify(rows)), table).toBe(hashes[table]);
      }
      expect(
        Object.values(counts).filter(
          (count) => typeof count === 'number' && count > 0,
        ),
      ).toHaveLength(116);
      expect(
        Object.values(original).reduce<number>(
          (sum, rows) => sum + fixtureObjects(rows).length,
          0,
        ),
      ).toBe(1345);
      expect(counts.document_pdfs).toBe(10);
      expect(counts.external_invoice_document_relations).toBe(2);
      const dateCounts = fixtureObject(
        fixtureObject(context.opportunityFollowUpPredecessor)
          .nativeDateRowCounts,
      );
      expect(dateCounts).toEqual({
        opportunity_follow_up_commands: 42,
        opportunity_follow_up_cursor_keys: 1,
        opportunity_follow_up_events: 41,
        opportunity_follow_up_heads: 11,
        opportunity_follow_up_history: 41,
      });
      for (const [table, count] of Object.entries(dateCounts))
        expect(counts[table]).toBe(count);
      const migrationRows = async () =>
        (
          await database.targetPool.query<{ hash: string; created_at: string }>(
            'SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
          )
        ).rows;
      const beforeJournal = await migrationRows();
      expect(beforeJournal).toHaveLength(95);
      expect(beforeJournal.at(-1)?.hash).toBe(provenance.migrationSha256);
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        const applied = await migrationRows();
        expect(applied).toHaveLength(entries.length);
        expect(applied.slice(0, 95)).toEqual(beforeJournal);
        for (let index = 95; index < entries.length; index++) {
          const entry = entries[index];
          if (!entry) throw new Error('A committed migration is required.');
          expect(applied[index]?.hash).toBe(
            fixtureHash(
              await readFile('drizzle/' + fixtureString(entry.tag) + '.sql'),
            ),
          );
        }
      }
      expect(await tableNames()).toEqual(
        await committedMigrationTables(entries),
      );
      const upgradedJournal = await migrationRows(),
        newTables = [
          'invoice_record_commands',
          'invoice_record_cursor_keys',
          'invoice_record_events',
          'invoice_record_history',
          'invoice_records',
        ];
      const emptyRecords = async () => {
        for (const table of newTables)
          expect(
            (
              await database.targetPool.query<{ count: number }>(
                `SELECT count(*)::int AS count FROM "${table}"`,
              )
            ).rows,
            table,
          ).toEqual([{ count: 0 }]);
      };
      await emptyRecords();
      const oldActor = fixtureObject(oldReads['/access/current-actor']),
        workspaceId = fixtureString(oldActor.workspaceId),
        companyId = fixtureString(context.companyId);
      const defaultIdentity = {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'mission-owner',
        'x-test-display-name': 'Mission Owner DEMO',
        'x-test-email': 'mission-owner@example.test',
      };
      async function open() {
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          synchronizeIdentityProfile: false,
          serverClock: { now: () => new Date('2026-10-31T12:00:00.000Z') },
          environment: {
            KNOWLEDGE_EVIDENCE_ENABLED: 'true',
            NODE_ENV: 'test',
            ACCESS_IDENTITY_MODE: 'test',
            ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
            ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
            ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
            ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
          },
        });
      }
      async function call(path: string, options: UpgradeCallOptions = {}) {
        if (!harness)
          throw new Error('The native upgrade application is closed.');
        const payload = options.payload;
        return fetch(harness.origin + '/api' + path, {
          method: options.method ?? 'GET',
          headers: {
            ...(options.identity ?? defaultIdentity),
            'x-workspace-context-id': workspaceId,
            'x-company-context-id': options.companyId ?? companyId,
            'content-type': 'application/json',
            'idempotency-key': options.key ?? 'invoice-record-upgrade-read',
            ...options.requestHeaders,
          },
          ...(payload
            ? {
                body:
                  payload.kind === 'json'
                    ? JSON.stringify(payload.value)
                    : new Uint8Array(Buffer.from(payload.base64, 'base64')),
              }
            : {}),
        });
      }
      async function read(
        path: string,
        options?: UpgradeCallOptions,
      ): Promise<unknown> {
        const response = await call(path, options);
        expect(response.status, path).toBe(200);
        return response.json();
      }
      const protocols = invoicePredecessorProtocols({ context, call, read }),
        searchPath =
          '/knowledge/search?query=Private%20Company-only%20inventory';
      expect(oldReads[searchPath]).toEqual({ items: [], nextCursor: null });
      let expectedState = original;
      await open();
      for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle) {
          await harness?.close();
          harness = undefined;
          await open();
        }
        expect(await migrationRows()).toEqual(upgradedJournal);
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expectedState,
        );
        await emptyRecords();
        for (const [path, expected] of Object.entries(oldReads))
          if (path !== searchPath)
            expect(withoutGrantsList(path, await read(path)), path).toEqual(
              expected,
            );
        for (const command of oldCommands) {
          const path = fixtureString(command.path),
            response = await call(path, {
              method: 'POST',
              key: fixtureString(command.key),
              payload: { kind: 'json', value: command.body },
            });
          expect(response.status, path).toBe(command.status);
          expect(await response.json(), path).toEqual(command.replay);
        }
        expect(await protocols.replayCapturedCommands(captured)).toEqual({
          exact: 90,
          currentDocument: 2,
          currentRequest: 2,
          nativeReceipt: 0,
        });
        expect(await protocols.replayCapturedCommands(sources)).toEqual({
          exact: 105,
          currentDocument: 4,
          currentRequest: 10,
          nativeReceipt: 26,
        });
        expect(await protocols.replayCapturedCommands(dates)).toEqual({
          exact: 53,
          currentDocument: 0,
          currentRequest: 12,
          nativeReceipt: 9,
        });
        expect(
          (await protocols.originalBytes()) +
            (await protocols.deliveredPrivateAndCommercialFacts()),
        ).toBe(10);
        await protocols.dates();
        await emptyRecords();
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expectedState,
        );
        // The attributed native search conserves its empty result and adds exactly one restricted interaction.
        expect(await read(searchPath)).toEqual(oldReads[searchPath]);
        const after = await predecessorSnapshot(database.targetPool, tables),
          beforeInteractions = fixtureObjects(
            expectedState.knowledge_interactions,
          ),
          afterInteractions = fixtureObjects(after.knowledge_interactions),
          ids = new Set(
            beforeInteractions.map((entry) =>
              fixtureString(fixtureObject(entry.row).id),
            ),
          );
        expect(
          afterInteractions.filter((entry) =>
            ids.has(fixtureString(fixtureObject(entry.row).id)),
          ),
        ).toEqual(beforeInteractions);
        expect(
          afterInteractions.filter(
            (entry) => !ids.has(fixtureString(fixtureObject(entry.row).id)),
          ),
        ).toEqual([
          {
            row: {
              id: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
              ),
              workspace_id: workspaceId,
              company_id: companyId,
              actor_membership_id: context.membershipId,
              capability_version: '1',
              operation: 'search',
              source_references: [],
              recorded_at: '2026-10-31T12:00:00+00:00',
            },
          },
        ]);
        expect({
          ...after,
          knowledge_interactions: expectedState.knowledge_interactions,
        }).toEqual(expectedState);
        expectedState = after;
      }
      expect(fixtureObjects(expectedState.knowledge_interactions)).toHaveLength(
        fixtureObjects(original.knowledge_interactions).length + 3,
      );
    } finally {
      try {
        await harness?.close();
      } finally {
        await database.close();
      }
    }
  },
  120000,
);
