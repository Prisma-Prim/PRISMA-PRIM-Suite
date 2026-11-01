import { createHash } from 'node:crypto';
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
import { object, string } from './internal-task.test-support.js';
function objects(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected synthetic objects.');
  return value.map(object);
}
function hash(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}
function actorPermissions(value: unknown) {
  const actor = object(value),
    company = object(actor.activeCompany);
  return {
    ...actor,
    workspacePermissions: Array.isArray(actor.workspacePermissions)
      ? [...actor.workspacePermissions].sort()
      : actor.workspacePermissions,
    activeCompany: Object.fromEntries(
      Object.entries(company).map(([key, value]) => [
        key,
        key.endsWith('Permissions') && Array.isArray(value)
          ? [...value].sort()
          : value,
      ]),
    ),
  };
}
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades a genuine populated immediate0091 predecessor twice, conserves full old rows/receipts/PDFs and public consumers, then preserves private work through two restarts',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('PostgreSQL required.');
    const directory = 'test-support/internal-task-migration',
      backup = await readFile(directory + '/predecessor-0091.sql.gz'),
      contextBytes = await readFile(directory + '/context.json'),
      provenance = object(
        JSON.parse(await readFile(directory + '/provenance.json', 'utf8')),
      ),
      c = object(JSON.parse(contextBytes.toString('utf8')));
    expect(hash(backup)).toBe(provenance.backupSha256);
    expect(hash(contextBytes)).toBe(provenance.contextSha256);
    expect(provenance.closedProducerBeforeDump).toBe(true);
    expect(provenance.source).toBe('1416798bb55608853fc527abc3054fb30dbe5838');
    expect(provenance.tree).toBe('4185fa74c3c3cf4b1b50624646d3b51bc549a01e');
    expect(hash(Buffer.from(JSON.stringify(provenance.sourceInputs)))).toBe(
      provenance.sourceInputManifestSha256,
    );
    expect(c.source).toBe('1416798bb55608853fc527abc3054fb30dbe5838');
    expect(c.predecessor).toBe('0091_project_next_action');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'ict_0091_upgrade',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      await database.targetPool.query(
        sql
          .split('\n')
          .filter((line) => !/^\\(?:un)?restrict /u.test(line))
          .join('\n'),
      );
      await database.targetPool.query('SET search_path TO public');
      expect(
        (
          await database.targetPool.query(
            "SELECT to_regclass('public.internal_company_tasks') AS relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      const journal = object(
          JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
        ),
        entries = objects(journal.entries),
        index = entries.findIndex(
          (entry) => entry.tag === '0092_company_internal_tasks',
        );
      expect(entries[index - 1]?.tag).toBe(c.predecessor);
      const tables = (
        await database.targetPool.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename);
      async function snapshot() {
        const result: Record<string, unknown> = {};
        for (const table of tables) {
          if (!/^[a-z_]+$/u.test(table))
            throw new Error('Invalid native table.');
          result[table] = (
            await database.targetPool.query(
              `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows;
        }
        return result;
      }
      const before = await snapshot();
      for (const table of [
        'tasks',
        'task_commands',
        'task_events',
        'project_template_task_copies',
        'company_role_assignments',
        'task_result_declarations',
        'task_result_commands',
        'document_pdfs',
        'client_union_operations',
        'client_union_projections',
        'client_identifier_reservations',
        'mission_applicability_facts',
        'project_next_action_commands',
        'project_next_action_history',
        'project_next_action_events',
      ])
        expect(objects(before[table]).length, table).toBeGreaterThan(0);
      const singleAndGroup = objects(before.task_commands).map((row) =>
        object(row.row),
      );
      expect(singleAndGroup.length).toBeGreaterThan(2);
      expect(
        singleAndGroup.some((row) => typeof object(row.result).id === 'string'),
      ).toBe(true);
      const groups = singleAndGroup
        .map((row) => object(row.result))
        .filter((row) => row.schema === 'task-planning/v1');
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.some((row) => objects(row.tasks).length > 1)).toBe(true);
      expect(
        objects(c.commands).some((command) =>
          string(command.path).endsWith('/tasks/planning'),
        ),
      ).toBe(true);
      const nativeBefore = JSON.stringify(before);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await snapshot()).toEqual(before);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(JSON.stringify(await snapshot())).toBe(nativeBefore);
      const environment = {
        KNOWLEDGE_EVIDENCE_ENABLED: 'true',
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000827',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
      };
      async function open() {
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          environment,
          serverClock: { now: () => new Date('2026-10-31T12:00:00.000Z') },
          synchronizeIdentityProfile: false,
        });
      }
      async function call(
        path: string,
        options: { method?: string; key?: string; body?: unknown } = {},
      ) {
        if (!harness) throw new Error('No current application.');
        return fetch(harness.origin + '/api' + path, {
          method: options.method ?? 'GET',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': 'mission-owner',
            'x-test-display-name': 'Mission Owner DEMO',
            'x-test-email': 'mission-owner@example.test',
            'x-company-context-id': string(c.companyId),
            'content-type': 'application/json',
            'idempotency-key': options.key ?? 'upgrade-probe',
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        });
      }
      async function json(response: Response) {
        const result: unknown = await response.json();
        return result;
      }
      async function publicReads(expected: Record<string, unknown>) {
        for (const [path, value] of Object.entries(expected)) {
          const response = await call(path);
          expect(response.status, path).toBe(200);
          const actual = await json(response);
          expect(
            path === '/access/current-actor'
              ? actorPermissions(actual)
              : actual,
            path,
          ).toEqual(
            path === '/access/current-actor' ? actorPermissions(value) : value,
          );
        }
      }
      async function oldReplays() {
        for (const command of objects(c.commands)) {
          const response = await call(string(command.path), {
            method: 'POST',
            key: string(command.key),
            body: command.body,
          });
          expect(response.status, string(command.path)).toBe(command.status);
          expect(await json(response)).toEqual(command.replay);
        }
      }
      async function pdfs() {
        const knowledge = object(c.knowledge);
        for (const [documentId, versionId, expected] of [
          [c.documentId, c.versionId, c.pdfSha256],
          [knowledge.documentId, knowledge.versionId, knowledge.pdfSha256],
        ]) {
          const response = await call(
            `/documents/${string(documentId)}/versions/${string(versionId)}/content`,
          );
          expect(response.status).toBe(200);
          expect(hash(Buffer.from(await response.arrayBuffer()))).toBe(
            expected,
          );
        }
        const exported = object(c.export),
          response = await call(string(exported.path), {
            method: 'POST',
            body: exported.body,
          });
        expect(response.status).toBe(200);
        const files = unzipSync(new Uint8Array(await response.arrayBuffer())),
          manifestBytes = files['manifest.json'];
        if (!manifestBytes) throw new Error('Missing exact export manifest.');
        const manifest = object(JSON.parse(strFromU8(manifestBytes)));
        expect(typeof manifest.preparedAt).toBe('string');
        expect(
          Object.fromEntries(
            Object.entries(manifest).filter(([name]) => name !== 'preparedAt'),
          ),
        ).toEqual(exported.manifest);
        expect(
          Object.entries(files)
            .filter(([path]) => path !== 'manifest.json')
            .map(([path, bytes]) => ({
              path,
              size: bytes.length,
              sha256: hash(Buffer.from(bytes)),
            }))
            .sort((a, b) => a.path.localeCompare(b.path)),
        ).toEqual(exported.files);
      }
      // Knowledge search owns a real interaction write. Exercise it separately
      // after the exact all-table conservation checks, then prove that one fact.
      const searchPath =
          '/knowledge/search?query=Private%20Company-only%20inventory',
        allOldReads = object(c.reads),
        searchExpected = allOldReads[searchPath],
        readOnlyOld = Object.fromEntries(
          Object.entries(allOldReads).filter(([path]) => path !== searchPath),
        );
      expect(searchExpected).toBeDefined();
      await open();
      await publicReads(readOnlyOld);
      await oldReplays();
      await pdfs();
      expect(await snapshot()).toEqual(before);
      const grant = await call('/company-internal-task-manager-assignments', {
        method: 'POST',
        key: 'new-independent-grant',
        body: { companyId: c.companyId, workspaceMembershipId: c.membershipId },
      });
      expect(grant.status).toBe(201);
      const oldBaseline = await snapshot(),
        consumerBaseline: Record<string, unknown> = {};
      for (const path of Object.keys(readOnlyOld)) {
        const response = await call(path);
        expect(response.status).toBe(200);
        consumerBaseline[path] = await json(response);
      }
      const createBody = {
          title: 'Private Company-only inventory',
          description: 'Literal Ж\r\n  preserved',
          dueDate: '2028-02-29',
          priority: 'critical',
        },
        created = await call('/company-internal-tasks', {
          method: 'POST',
          key: 'durable-private-create',
          body: createBody,
        });
      expect(created.status).toBe(201);
      const receipt = object(await json(created)),
        task = object(receipt.task),
        id = string(task.id);
      const changes = [
        {
          kind: 'EDIT',
          expectedVersion: 1,
          description: 'Exact corrected private instructions',
        },
        {
          kind: 'MOVE',
          expectedVersion: 2,
          status: 'blocked',
          reason: 'Private blockage',
        },
        { kind: 'MOVE', expectedVersion: 3, status: 'in_progress' },
        { kind: 'MOVE', expectedVersion: 4, status: 'done' },
        { kind: 'MOVE', expectedVersion: 5, status: 'todo' },
        {
          kind: 'MOVE',
          expectedVersion: 6,
          status: 'cancelled',
          reason: 'Private cancellation',
        },
      ];
      for (const [index, body] of changes.entries())
        expect(
          (
            await call('/company-internal-tasks/' + id + '/changes', {
              method: 'POST',
              key: 'new-private-change-' + index,
              body,
            })
          ).status,
        ).toBe(200);
      const detail = await json(await call('/company-internal-tasks/' + id));
      expect(object(detail)).toMatchObject({
        task: { version: 7, status: 'cancelled' },
        history: expect.any(Array),
      });
      expect(await snapshot()).toEqual(oldBaseline);
      await publicReads(consumerBaseline);
      await oldReplays();
      await pdfs();
      expect(await snapshot()).toEqual(oldBaseline);
      for (let restart = 0; restart < 2; restart++) {
        await harness?.close();
        harness = undefined;
        await open();
        expect(await json(await call('/company-internal-tasks/' + id))).toEqual(
          detail,
        );
        const confirmed = await call('/company-internal-tasks', {
          method: 'POST',
          key: 'durable-private-create',
          body: createBody,
        });
        expect(confirmed.status).toBe(201);
        expect(await json(confirmed)).toEqual(receipt);
        await publicReads(consumerBaseline);
        await oldReplays();
        await pdfs();
        expect(await snapshot()).toEqual(oldBaseline);
      }
      const beforeSearch = await snapshot(),
        search = await call(searchPath);
      expect(search.status).toBe(200);
      expect(await json(search)).toEqual(searchExpected);
      const afterSearch = await snapshot(),
        oldInteractions = objects(beforeSearch.knowledge_interactions),
        oldIds = new Set(
          oldInteractions.map((entry) => string(object(entry.row).id)),
        ),
        currentInteractions = objects(afterSearch.knowledge_interactions),
        added = currentInteractions.filter(
          (entry) => !oldIds.has(string(object(entry.row).id)),
        );
      expect(
        currentInteractions.filter((entry) =>
          oldIds.has(string(object(entry.row).id)),
        ),
      ).toEqual(oldInteractions);
      expect(added).toEqual([
        {
          row: {
            id: expect.stringMatching(/^[0-9a-f-]{14}4[0-9a-f-]{21}$/u),
            workspace_id: object(allOldReads['/access/current-actor'])
              .workspaceId,
            company_id: c.companyId,
            actor_membership_id: c.membershipId,
            capability_version: '1',
            operation: 'search',
            source_references: [],
            recorded_at: '2026-10-31T12:00:00+00:00',
          },
        },
      ]);
      expect({
        ...afterSearch,
        knowledge_interactions: beforeSearch.knowledge_interactions,
      }).toEqual(beforeSearch);
    } finally {
      await harness?.close();
      await database.close();
    }
  },
  120000,
);
