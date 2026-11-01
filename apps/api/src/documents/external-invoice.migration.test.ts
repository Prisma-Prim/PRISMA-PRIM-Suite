import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { strFromU8, unzipSync } from 'fflate';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  fixtureHash,
  fixtureHeaders,
  fixtureObject,
  fixtureObjects,
  fixtureString,
  predecessorSnapshot,
} from './external-invoice-migration.test-support.js';

type Payload =
  { kind: 'json'; value: unknown } | { kind: 'binary'; base64: string };

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades the genuine populated0092 twice and conserves every original row, captured command and exact PDF through two application restarts',
  async () => {
    const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!baseDatabaseUrl) throw new Error('PostgreSQL is required.');
    const directory = 'test-support/external-invoice-source-migration';
    const backup = await readFile(directory + '/predecessor-0092.sql.gz');
    const contextBytes = gunzipSync(
      await readFile(directory + '/context.json.gz'),
    );
    const provenanceBytes = await readFile(directory + '/provenance.json');
    const context = fixtureObject(JSON.parse(contextBytes.toString('utf8')));
    const provenance = fixtureObject(
      JSON.parse(provenanceBytes.toString('utf8')),
    );
    expect(fixtureHash(backup)).toBe(
      '0f30d063af7e78cd8b1a309c02ba772e4283329824ed5d305ed49282646bb588',
    );
    expect(fixtureHash(contextBytes)).toBe(
      '29ee729d1c3699126046622179bc270c6dff1a07a0e8ede52cf7be5c7e269e42',
    );
    expect(fixtureHash(provenanceBytes)).toBe(
      'b1d2e0d1059628cd3e924be233514a7d03e74d475ba3a68a8f0f4062a2dc2b08',
    );
    expect(provenance).toMatchObject({
      source: '1ffc5417562bc4987f68646d54d0960c7a6874c0',
      tree: '707a022bea644466f2c1752dfddf341b0d588196',
      predecessor: '0092_company_internal_tasks',
      closedProducerBeforeDump: true,
      backupSha256: fixtureHash(backup),
      contextSha256: fixtureHash(contextBytes),
      nativeTables: 152,
      oldTasks: 36,
      oldReadCount: 41,
      oldCommandCount: 21,
      newConservedCommandCount: 94,
      independentRunnerAttestation: false,
    });
    expect(context.source).toBe(provenance.source);
    expect(context.predecessor).toBe(provenance.predecessor);
    expect(fixtureObjects(provenance.sourceInputs)).toHaveLength(2166);
    expect(fixtureHash(JSON.stringify(provenance.sourceInputs))).toBe(
      provenance.sourceInputManifestSha256,
    );
    expect(
      fixtureHash(await readFile('drizzle/0092_company_internal_tasks.sql')),
    ).toBe(provenance.migrationSha256);
    const journal = fixtureObject(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    const entries = fixtureObjects(journal.entries);
    const migrationIndex = entries.findIndex(
      (entry) => entry.tag === '0093_external_invoice_sources',
    );
    expect(migrationIndex).toBe(93);
    expect(entries[migrationIndex - 1]?.tag).toBe(context.predecessor);
    const oldReads = fixtureObject(context.reads);
    const oldCommands = fixtureObjects(context.commands);
    const capturedCommands = fixtureObjects(context.capturedCommands);
    expect(Object.keys(oldReads)).toHaveLength(41);
    expect(oldCommands).toHaveLength(21);
    expect(capturedCommands).toHaveLength(94);
    expect(
      capturedCommands.filter(
        (command) =>
          command.replayMeaning === 'Exact conserved native command response.',
      ),
    ).toHaveLength(92);
    expect(
      capturedCommands.filter((command) => command.path === '/documents'),
    ).toHaveLength(2);
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl,
      namePrefix: 'external_invoice_0092',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      const emptySearchPath =
        "SELECT pg_catalog.set_config('search_path', '', false);";
      expect(sql.split(emptySearchPath)).toHaveLength(2);
      await database.targetPool.query(
        sql
          // Native CHECK functions call other public functions. Restore with
          // their owning schema visible while preserving every guard and fact.
          .replace(
            emptySearchPath,
            "SELECT pg_catalog.set_config('search_path', 'public', false);",
          )
          .split('\n')
          .filter((line) => !/^\\(?:un)?restrict /u.test(line))
          .join('\n'),
      );
      await database.targetPool.query('SET search_path TO public');
      const tables = (
        await database.targetPool.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map(({ tablename }) => tablename);
      expect(tables).toHaveLength(152);
      const original = await predecessorSnapshot(database.targetPool, tables);
      expect(original).toEqual(context.nativeBaseline);
      const counts = fixtureObject(context.nativeRowCounts);
      const hashes = fixtureObject(context.nativeRowsSha256);
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
      ).toHaveLength(99);
      expect(counts.tasks).toBe(36);
      expect(counts.internal_company_tasks).toBe(1);
      expect(counts.internal_company_task_history).toBe(7);
      expect(counts.internal_company_task_events).toBe(7);
      expect(counts.internal_company_task_commands).toBe(8);
      const migrationRows = async () =>
        (
          await database.targetPool.query<{ hash: string; created_at: string }>(
            'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
          )
        ).rows;
      const originalJournal = await migrationRows();
      expect(originalJournal).toHaveLength(93);
      expect(originalJournal.at(-1)?.hash).toBe(provenance.migrationSha256);
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        const migratedJournal = await migrationRows();
        expect(migratedJournal).toHaveLength(entries.length);
        expect(migratedJournal.slice(0, 93)).toEqual(originalJournal);
        expect(migratedJournal[migrationIndex]?.hash).toBe(
          fixtureHash(
            await readFile('drizzle/0093_external_invoice_sources.sql'),
          ),
        );
        // Later additive migrations may accompany this compatibility replay.
        // Preserve the exact 0093 boundary and verify every later committed SQL hash.
        for (let index = migrationIndex + 1; index < entries.length; index++) {
          const entry = entries[index];
          if (!entry)
            throw new Error('The committed migration entry is required.');
          const tag = fixtureString(entry.tag);
          expect(migratedJournal[index]?.hash).toBe(
            fixtureHash(await readFile('drizzle/' + tag + '.sql')),
          );
        }
      }
      const unassigned = async () => {
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle::text IN ('company_invoice_reader','company_invoice_recorder','company_external_invoice_access')",
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              'SELECT count(*)::int AS count FROM external_invoice_document_relations',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      };
      await unassigned();
      const oldActor = fixtureObject(oldReads['/access/current-actor']);
      const workspaceId = fixtureString(oldActor.workspaceId);
      const companyId = fixtureString(context.companyId);
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
      async function call(
        path: string,
        options: {
          method?: string;
          companyId?: string;
          identity?: Record<string, string>;
          requestHeaders?: Record<string, string>;
          key?: string;
          payload?: Payload;
        } = {},
      ) {
        if (!harness) throw new Error('The migration application is closed.');
        const payload = options.payload;
        return fetch(harness.origin + '/api' + path, {
          method: options.method ?? 'GET',
          headers: {
            ...(options.identity ?? defaultIdentity),
            'x-workspace-context-id': workspaceId,
            'x-company-context-id': options.companyId ?? companyId,
            'content-type': 'application/json',
            'idempotency-key': options.key ?? 'external-invoice-upgrade-read',
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
        options: Parameters<typeof call>[1] = {},
      ) {
        const response = await call(path, options);
        expect(response.status, path).toBe(200);
        const value: unknown = await response.json();
        return value;
      }
      async function replayOldCommands() {
        for (const command of oldCommands) {
          const path = fixtureString(command.path);
          const response = await call(path, {
            method: 'POST',
            key: fixtureString(command.key),
            payload: { kind: 'json', value: command.body },
          });
          expect(response.status, path).toBe(command.status);
          expect(await response.json(), path).toEqual(command.replay);
        }
      }
      async function replayCapturedCommands() {
        let exact = 0;
        let currentDocument = 0;
        for (const command of capturedCommands) {
          const path = fixtureString(command.path);
          const identity = fixtureHeaders(command.headers);
          const commandCompanyId = fixtureString(command.companyId);
          const payload: Payload =
            typeof command.binaryBodyBase64 === 'string'
              ? { kind: 'binary', base64: command.binaryBodyBase64 }
              : { kind: 'json', value: command.body };
          const options = { identity, companyId: commandCompanyId };
          const response = await call(path, {
            ...options,
            method: fixtureString(command.method),
            requestHeaders: fixtureHeaders(command.requestHeaders),
            payload,
          });
          expect(response.status, path).toBe(command.status);
          const actual: unknown = await response.json();
          expect(actual, path).toEqual(command.replay);
          if (path === '/documents') {
            expect(command.replayMeaning).toBe(
              'Same registration identity; complete current native readDetail, independently verified by GET.',
            );
            const id = fixtureString(fixtureObject(actual).id);
            expect(await read('/documents/' + id, options)).toEqual(actual);
            currentDocument++;
          } else {
            expect(command.replayMeaning).toBe(
              'Exact conserved native command response.',
            );
            expect(actual, path).toEqual(command.response);
            exact++;
          }
        }
        expect({ exact, currentDocument }).toEqual({
          exact: 92,
          currentDocument: 2,
        });
      }
      async function originalBytes() {
        const knowledge = fixtureObject(context.knowledge);
        for (const [documentId, versionId, expected] of [
          [context.documentId, context.versionId, context.pdfSha256],
          [knowledge.documentId, knowledge.versionId, knowledge.pdfSha256],
        ]) {
          const response = await call(
            `/documents/${fixtureString(documentId)}/versions/${fixtureString(versionId)}/content`,
          );
          expect(response.status).toBe(200);
          expect(
            fixtureHash(new Uint8Array(await response.arrayBuffer())),
          ).toBe(expected);
        }
        const exported = fixtureObject(context.export);
        const response = await call(fixtureString(exported.path), {
          method: 'POST',
          payload: { kind: 'json', value: exported.body },
        });
        expect(response.status).toBe(200);
        const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
        const manifestBytes = files['manifest.json'];
        if (!manifestBytes)
          throw new Error('The native ZIP manifest is missing.');
        const manifest = fixtureObject(JSON.parse(strFromU8(manifestBytes)));
        expect(typeof manifest.preparedAt).toBe('string');
        expect(
          Object.fromEntries(
            Object.entries(manifest).filter(([key]) => key !== 'preparedAt'),
          ),
        ).toEqual(exported.manifest);
        expect(
          Object.entries(files)
            .filter(([path]) => path !== 'manifest.json')
            .map(([path, bytes]) => ({
              path,
              size: bytes.byteLength,
              sha256: fixtureHash(bytes),
            }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        ).toEqual(exported.files);
      }
      async function deliveredPrivateAndCommercialFacts() {
        const privateTask = fixtureObject(context.internalTasks);
        expect(await read('/company-internal-tasks')).toEqual(privateTask.list);
        expect(
          await read('/company-internal-tasks/eligible-assignees'),
        ).toEqual(privateTask.eligible);
        expect(
          await read(
            '/company-internal-tasks/' + fixtureString(privateTask.taskId),
          ),
        ).toEqual(privateTask.detail);
        for (const commercial of fixtureObjects(context.commercialSources)) {
          const source = fixtureObject(commercial.source);
          const sourceCompanyId = fixtureString(source.companyId);
          const capturedIdentity = capturedCommands.find(
            (command) =>
              command.companyId === sourceCompanyId &&
              fixtureHeaders(command.headers)['x-test-external-subject'] ===
                'estimate-offer-preparer',
          );
          if (!capturedIdentity)
            throw new Error('The conserved Commercial caller is missing.');
          const options = {
            companyId: sourceCompanyId,
            identity: fixtureHeaders(capturedIdentity.headers),
          };
          const current = fixtureObject(
            await read(fixtureString(commercial.contractPath), options),
          );
          expect(current.contract).toEqual(commercial.contract);
          const contract = fixtureObject(commercial.contract);
          const version = fixtureObject(contract.version);
          expect(version).toMatchObject({
            versionNumber: 2,
            decisionState: 'APPROVED',
            executionState: 'EXECUTED',
            signature: commercial.declaration,
          });
          const firstVersion = fixtureObject(
            fixtureObject(commercial.unexecutedFirstVersion).version,
          );
          const historical = fixtureObject(
            await read(
              fixtureString(commercial.contractPath) +
                '/versions/' +
                fixtureString(firstVersion.id),
              options,
            ),
          );
          expect(fixtureObject(historical.contract).version).toMatchObject({
            id: firstVersion.id,
            versionNumber: 1,
            executionState: 'NOT_EXECUTED',
            recipient: firstVersion.recipient,
          });
          const original = await call(
            `/documents/${fixtureString(fixtureObject(commercial.document).id)}/versions/${fixtureString(commercial.documentVersionId)}/content/${fixtureString(commercial.representationId)}`,
            options,
          );
          expect(original.status).toBe(200);
          const bytes = new Uint8Array(await original.arrayBuffer());
          expect(bytes.byteLength).toBe(commercial.pdfSize);
          expect(fixtureHash(bytes)).toBe(commercial.pdfSha256);
        }
      }
      const searchPath =
        '/knowledge/search?query=Private%20Company-only%20inventory';
      expect(oldReads[searchPath]).toEqual({ items: [], nextCursor: null });
      let expectedState = original;
      await open();
      for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle > 0) {
          await harness?.close();
          harness = undefined;
          await open();
        }
        for (const [path, expected] of Object.entries(oldReads))
          if (path !== searchPath)
            expect(await read(path), path).toEqual(expected);
        await replayOldCommands();
        await replayCapturedCommands();
        await originalBytes();
        await deliveredPrivateAndCommercialFacts();
        await unassigned();
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expectedState,
        );
        // The 41st ancestral read is an attributed Knowledge search. Its empty
        // old response stays exact; only one new, fully asserted interaction may append.
        expect(await read(searchPath)).toEqual(oldReads[searchPath]);
        const afterSearch = await predecessorSnapshot(
          database.targetPool,
          tables,
        );
        const beforeInteractions = fixtureObjects(
          expectedState.knowledge_interactions,
        );
        const beforeIds = new Set(
          beforeInteractions.map((entry) =>
            fixtureString(fixtureObject(entry.row).id),
          ),
        );
        const afterInteractions = fixtureObjects(
          afterSearch.knowledge_interactions,
        );
        expect(
          afterInteractions.filter((entry) =>
            beforeIds.has(fixtureString(fixtureObject(entry.row).id)),
          ),
        ).toEqual(beforeInteractions);
        const added = afterInteractions.filter(
          (entry) => !beforeIds.has(fixtureString(fixtureObject(entry.row).id)),
        );
        expect(added).toEqual([
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
          ...afterSearch,
          knowledge_interactions: expectedState.knowledge_interactions,
        }).toEqual(expectedState);
        expectedState = afterSearch;
      }
      expect(fixtureObjects(expectedState.knowledge_interactions)).toHaveLength(
        fixtureObjects(original.knowledge_interactions).length + 3,
      );
    } finally {
      await harness?.close();
      await database.close();
    }
  },
  120000,
);
