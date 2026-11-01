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
} from '../documents/external-invoice-migration.test-support.js';

type Payload =
  { kind: 'json'; value: unknown } | { kind: 'binary'; base64: string };

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine populated0093 twice, conserving all153 native tables,260 protocols,10 PDFs and the factual ZIP through two application restarts',
  async () => {
    const baseDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!baseDatabaseUrl) throw new Error('PostgreSQL is required.');
    const directory = 'test-support/fixtures/opportunity-follow-up-predecessor';
    const backup = await readFile(directory + '/predecessor-0093.sql.gz');
    const compressedContext = await readFile(directory + '/context.json.gz');
    const contextBytes = gunzipSync(compressedContext);
    const provenanceBytes = await readFile(directory + '/provenance.json');
    const context = fixtureObject(JSON.parse(contextBytes.toString('utf8')));
    const provenance = fixtureObject(
      JSON.parse(provenanceBytes.toString('utf8')),
    );
    expect(fixtureHash(backup)).toBe(
      'ccabb640d0e0c3494397cdc4c90564d5dec3e1fb830b1b90c4d0944406ed230c',
    );
    expect(fixtureHash(await readFile(directory + '/README.md'))).toBe(
      '1273c6f1c4eed0bd036d666dcd2683773ac117c26bdcfad3935382a14c330894',
    );
    expect(fixtureHash(compressedContext)).toBe(
      '684acb721e66fd6f4c2ed18f0bf04049966773fad4785c542ee3bf207320579b',
    );
    expect(fixtureHash(contextBytes)).toBe(
      '449d273fd527402f83fac01c258ca8bb2ba635b2a2c2a9962512402a5625b281',
    );
    expect(fixtureHash(provenanceBytes)).toBe(
      '76267167d97638842357161cef6d4c613891dc630534e5252dc7e0b5b6723128',
    );
    expect(provenance).toMatchObject({
      source: 'ad5df5b258d6d39ec0fc4d8ee49b0ec53df32c09',
      tree: '265ac7dc4e29b9140d225fddddc24ffb47cf6f73',
      predecessor: '0093_external_invoice_sources',
      closedProducerBeforeDump: true,
      backupSha256: fixtureHash(backup),
      contextSha256: fixtureHash(contextBytes),
      nativeTables: 153,
      oldReadCount: 41,
      oldCommandCount: 21,
      priorCapturedCommandCount: 94,
      newCapturedCommandCount: 145,
      exactOldPdfs: 4,
      exactNewPdfs: 6,
      selectedSyntheticFixtureProvenance: true,
      sourceInputCount: 2228,
      independentRunnerAttestation: false,
    });
    expect(context.source).toBe(provenance.source);
    expect(context.tree).toBe(provenance.tree);
    expect(context.predecessor).toBe(provenance.predecessor);
    expect(provenance.sourceInputManifestSha256).toBe(
      '1c94fcb34bebe0b63ecf8d14452c4e9a4e2c341d530b91a9d3f0a8a00392e415',
    );
    expect(provenance.journalSha256).toBe(
      'ff7196b7093c868262bcffebb65fbfcc3c677030bb6dd83f7b64b88a353de503',
    );
    expect(
      fixtureHash(await readFile('drizzle/0093_external_invoice_sources.sql')),
    ).toBe(provenance.migrationSha256);
    const journal = fixtureObject(
      JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
    );
    const entries = fixtureObjects(journal.entries);
    const migrationIndex = entries.findIndex(
      (entry) => entry.tag === '0094_opportunity_follow_up',
    );
    expect(migrationIndex).toBe(94);
    expect(entries[migrationIndex - 1]?.tag).toBe(context.predecessor);
    const oldReads = fixtureObject(context.reads);
    const oldCommands = fixtureObjects(context.commands);
    const capturedCommands = fixtureObjects(context.capturedCommands);
    const nativeCommands = fixtureObjects(context.native0093Commands);
    expect(Object.keys(oldReads)).toHaveLength(41);
    expect(oldCommands).toHaveLength(21);
    expect(capturedCommands).toHaveLength(94);
    expect(nativeCommands).toHaveLength(145);
    expect(
      oldCommands.length + capturedCommands.length + nativeCommands.length,
    ).toBe(260);
    expect(fixtureObjects(context.commercialDateCases)).toHaveLength(8);
    expect(fixtureObjects(context.commercialSources)).toHaveLength(2);
    expect(fixtureObjects(context.native0093ContractSources)).toHaveLength(2);
    expect(fixtureObjects(context.externalInvoiceSources)).toHaveLength(2);
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
      namePrefix: 'follow_up_native0093',
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
      expect(tables).toHaveLength(153);
      const original = await predecessorSnapshot(database.targetPool, tables);
      expect(original).toEqual(context.nativeBaseline);
      const counts = fixtureObject(context.nativeRowCounts);
      const hashes = fixtureObject(context.nativeRowsSha256);
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
      ).toHaveLength(111);
      expect(
        Object.values(original)
          .map((rows) => fixtureObjects(rows).length)
          .reduce((total, count) => total + count, 0),
      ).toBe(1093);
      expect(counts.tasks).toBe(36);
      expect(counts.internal_company_tasks).toBe(1);
      expect(counts.internal_company_task_history).toBe(7);
      expect(counts.internal_company_task_events).toBe(7);
      expect(counts.internal_company_task_commands).toBe(8);
      expect(counts.document_pdfs).toBe(10);
      expect(counts.external_invoice_document_relations).toBe(2);
      expect(counts.opportunity_outcome_history).toBe(19);
      expect(counts.commercial_intake_next_action_commands).toBe(2);
      expect(counts.commercial_intake_responsible_commands).toBe(2);
      expect(counts.commercial_intake_stage_commands).toBe(3);
      const migrationRows = async () =>
        (
          await database.targetPool.query<{ hash: string; created_at: string }>(
            'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
          )
        ).rows;
      const originalJournal = await migrationRows();
      expect(originalJournal).toHaveLength(94);
      expect(originalJournal.at(-1)?.hash).toBe(provenance.migrationSha256);
      for (let application = 0; application < 2; application++) {
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: resolve('drizzle'),
        });
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          original,
        );
        const migratedJournal = await migrationRows();
        expect(migratedJournal).toHaveLength(95);
        expect(migratedJournal.slice(0, 94)).toEqual(originalJournal);
        expect(migratedJournal.at(-1)?.hash).toBe(
          fixtureHash(await readFile('drizzle/0094_opportunity_follow_up.sql')),
        );
      }
      const upgradedJournal = await migrationRows();
      const newTables = [
        'opportunity_follow_up_commands',
        'opportunity_follow_up_cursor_keys',
        'opportunity_follow_up_events',
        'opportunity_follow_up_heads',
        'opportunity_follow_up_history',
      ];
      expect(
        (
          await database.targetPool.query<{ tablename: string }>(
            "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
          )
        ).rows.map(({ tablename }) => tablename),
      ).toEqual([...tables, ...newTables].sort());
      const unassigned = async () => {
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              "SELECT count(*)::int AS count FROM company_role_assignments WHERE bundle::text = 'company_opportunity_follow_up_coordinator'",
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        for (const table of newTables)
          expect(
            (
              await database.targetPool.query<{ count: number }>(
                `SELECT count(*)::int AS count FROM "${table}"`,
              )
            ).rows,
            table,
          ).toEqual([{ count: 0 }]);
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              "SELECT count(*)::int AS count FROM activity_log_events WHERE action::text LIKE 'company_opportunity_follow_up_coordinator_assignment.%'",
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
            'idempotency-key':
              options.key ?? 'opportunity-follow-up-upgrade-read',
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
      async function replayCapturedCommands(
        commands: Record<string, unknown>[],
      ) {
        let exact = 0;
        let currentDocument = 0;
        let currentRequest = 0;
        let nativeReceipt = 0;
        for (const command of commands) {
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
            expect(id).toBe(fixtureObject(command.response).id);
            expect(await read('/documents/' + id, options)).toEqual(actual);
            currentDocument++;
          } else if (path === '/commercial-intake/requests') {
            expect([
              'Exact conserved native command response.',
              'Same Request identity; complete current native detail, independently verified by GET.',
            ]).toContain(command.replayMeaning);
            if (
              command.replayMeaning ===
              'Exact conserved native command response.'
            )
              expect(actual, path).toEqual(command.response);
            const id = fixtureString(fixtureObject(actual).id);
            expect(id).toBe(fixtureObject(command.response).id);
            expect(
              await read('/commercial-intake/requests/' + id, options),
            ).toEqual(actual);
            currentRequest++;
          } else if (
            /^\/commercial-intake\/opportunities\/[^/]+\/(?:next-action|responsible|stage|outcome)$/u.test(
              path,
            )
          ) {
            expect(command.replayMeaning).toBe(
              'Exact conserved native Opportunity receipt; complete current original Request independently verified by GET.',
            );
            const replay = fixtureObject(actual);
            const originalResponse = fixtureObject(command.response);
            // These four native protocols return a past immutable receipt
            // alongside the complete current original Request.
            expect(replay.receipt, path).toEqual(originalResponse.receipt);
            const request = fixtureObject(replay.request);
            const id = fixtureString(request.id);
            expect(id).toBe(fixtureObject(originalResponse.request).id);
            expect(
              await read('/commercial-intake/requests/' + id, options),
            ).toEqual(request);
            nativeReceipt++;
          } else {
            expect(command.replayMeaning).toBe(
              'Exact conserved native command response.',
            );
            expect(actual, path).toEqual(command.response);
            exact++;
          }
        }
        return { exact, currentDocument, currentRequest, nativeReceipt };
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
        return 2;
      }
      async function deliveredPrivateAndCommercialFacts() {
        let pdfCount = 0;
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
        for (const commercial of [
          ...fixtureObjects(context.commercialSources),
          ...fixtureObjects(context.native0093ContractSources),
        ]) {
          const source = fixtureObject(commercial.source);
          const sourceCompanyId = fixtureString(source.companyId);
          const capturedIdentity = [
            ...capturedCommands,
            ...nativeCommands,
          ].find(
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
          pdfCount++;
        }
        const statuses = new Set<string>();
        for (const commercial of fixtureObjects(context.commercialDateCases)) {
          const options = {
            companyId: fixtureString(commercial.companyId),
            identity: fixtureHeaders(commercial.headers),
          };
          const detail = await read(fixtureString(commercial.path), options);
          expect(detail).toEqual(commercial.detail);
          statuses.add(
            fixtureString(
              fixtureObject(fixtureObject(detail).initialOpportunity).status,
            ),
          );
          const opportunityId = fixtureString(commercial.opportunityId);
          expect(
            await read(
              `/commercial-intake/opportunities/${opportunityId}/outcome-history`,
              options,
            ),
          ).toEqual(commercial.outcomeHistory);
          expect(
            await read(
              `/commercial-intake/opportunities/${opportunityId}/stage-history`,
              options,
            ),
          ).toEqual(commercial.stageHistory);
        }
        expect([...statuses].sort()).toEqual([
          'ARCHIVED',
          'DISQUALIFIED',
          'LOST',
          'ON_HOLD',
          'OPEN',
          'WON',
        ]);
        for (const invoice of fixtureObjects(context.externalInvoiceSources)) {
          const options = {
            companyId: fixtureString(invoice.companyId),
            identity: fixtureHeaders(invoice.headers),
          };
          const path = fixtureString(invoice.path);
          expect(await read(path, options)).toEqual(invoice.detail);
          expect(await read(path + '/versions', options)).toEqual(
            invoice.versions,
          );
          expect(await read(path + '/correction-history', options)).toEqual(
            invoice.corrections,
          );
          for (const representation of fixtureObjects(
            invoice.representations,
          )) {
            const response = await call(
              fixtureString(representation.path),
              options,
            );
            expect(response.status).toBe(200);
            const bytes = new Uint8Array(await response.arrayBuffer());
            expect(bytes.byteLength).toBe(representation.size);
            expect(fixtureHash(bytes)).toBe(representation.sha256);
            pdfCount++;
          }
        }
        return pdfCount;
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
        expect(await migrationRows()).toEqual(upgradedJournal);
        expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
          expectedState,
        );
        await unassigned();
        for (const [path, expected] of Object.entries(oldReads))
          if (path !== searchPath)
            expect(await read(path), path).toEqual(expected);
        await replayOldCommands();
        expect(await replayCapturedCommands(capturedCommands)).toEqual({
          exact: 90,
          currentDocument: 2,
          currentRequest: 2,
          nativeReceipt: 0,
        });
        expect(await replayCapturedCommands(nativeCommands)).toEqual({
          exact: 105,
          currentDocument: 4,
          currentRequest: 10,
          nativeReceipt: 26,
        });
        const ancestralPdfs = await originalBytes();
        const commercialPdfs = await deliveredPrivateAndCommercialFacts();
        expect(ancestralPdfs + commercialPdfs).toBe(10);
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
      // All migration-only conservation and two restart checks finish above.
      // This separate phase deliberately grants the new role through its API.
      const commercialCompany = fixtureObject(context.commercialDateCompany);
      const cases = fixtureObjects(context.commercialDateCases);
      const dateCompanyId = fixtureString(commercialCompany.companyId);
      const grant = await call(
        '/company-opportunity-follow-up-coordinator-assignments',
        {
          method: 'POST',
          companyId: dateCompanyId,
          key: 'upgrade-deliberate-new-coordinator',
          payload: {
            kind: 'json',
            value: {
              companyId: dateCompanyId,
              workspaceMembershipId: commercialCompany.preparerMembershipId,
            },
          },
        },
      );
      expect(grant.status).toBe(201);
      const afterDeliberateGrant = await predecessorSnapshot(
        database.targetPool,
        tables,
      );
      for (const entry of cases) {
        const opportunityId = fixtureString(entry.opportunityId);
        const detail = fixtureObject(entry.detail);
        const native = fixtureObject(detail.initialOpportunity);
        const options = {
          companyId: dateCompanyId,
          identity: fixtureHeaders(entry.headers),
        };
        const current = fixtureObject(
          await read(
            '/commercial-intake/opportunities/' + opportunityId + '/follow-up',
            options,
          ),
        );
        expect(current).toMatchObject({
          opportunityId,
          requestId: entry.requestId,
          status: native.status,
          opportunityVersion: native.version,
          head: { state: 'UNRECORDED', revision: 0 },
          history: { headRevision: 0, entries: [], nextCursor: null },
        });
        const epoch = await database.targetPool.query<{ epoch: string }>(
          "SELECT CASE WHEN EXISTS(SELECT 1 FROM opportunity_outcome_history WHERE opportunity_id=$1) THEN 'transition:'||(SELECT id::text FROM opportunity_outcome_history WHERE opportunity_id=$1 ORDER BY opportunity_version DESC LIMIT 1) ELSE 'initial:'||$1 END AS epoch",
          [opportunityId],
        );
        expect(current.outcomeEpoch).toBe(epoch.rows[0]?.epoch);
        expect(await read(fixtureString(entry.path), options)).toEqual(detail);
      }
      for (const table of newTables)
        expect(
          (
            await database.targetPool.query<{ count: number }>(
              `SELECT count(*)::int AS count FROM "${table}"`,
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
      for (const entry of cases) {
        const native = fixtureObject(
          fixtureObject(entry.detail).initialOpportunity,
        );
        if (native.status !== 'OPEN') continue;
        const options = {
          companyId: dateCompanyId,
          identity: fixtureHeaders(entry.headers),
        };
        const opportunityId = fixtureString(entry.opportunityId);
        const recorded = await call(
          '/commercial-intake/opportunities/' + opportunityId + '/follow-up',
          {
            ...options,
            method: 'POST',
            key: 'upgrade-first-date-' + opportunityId,
            payload: {
              kind: 'json',
              value: {
                expectedRevision: 0,
                observedOpportunityVersion: native.version,
                followUpOn: '0001-01-01',
                reason: null,
              },
            },
          },
        );
        expect(recorded.status).toBe(200);
        expect(fixtureObject(await recorded.json())).toMatchObject({
          outcome: 'updated',
          fact: { state: 'RECORDED', revision: 1, followUpOn: '0001-01-01' },
        });
        expect(await read(fixtureString(entry.path), options)).toEqual(
          entry.detail,
        );
      }
      // New Date facts change none of the 153 predecessor-owned tables.
      expect(await predecessorSnapshot(database.targetPool, tables)).toEqual(
        afterDeliberateGrant,
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
