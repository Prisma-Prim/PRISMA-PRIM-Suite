import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { object, string } from './project-next-action.test-support.js';

function objects(value: unknown) {
  if (!Array.isArray(value))
    throw new Error('Expected synthetic fixture objects.');
  return value.map(object);
}
function permissions(value: unknown) {
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
  'upgrades genuine populated published parent / 0090 twice, conserves every full row, old nested receipt and PDF, then retains a new declaration through two application restarts',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('PostgreSQL required.');
    const directory = 'test-support/project-next-action-migration',
      backup = await readFile(directory + '/predecessor-0090.sql.gz'),
      contextBytes = await readFile(directory + '/context.json');
    const provenance = object(
        JSON.parse(await readFile(directory + '/provenance.json', 'utf8')),
      ),
      c = object(JSON.parse(contextBytes.toString('utf8')));
    expect(createHash('sha256').update(backup).digest('hex')).toBe(
      provenance.backupSha256,
    );
    expect(createHash('sha256').update(contextBytes).digest('hex')).toBe(
      provenance.contextSha256,
    );
    expect(c.source).toBe('f9928112d28b819cde6149f4af8a643e088c2dbf');
    expect(c.predecessor).toBe('0090_mission_applicability');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'pna_0090_upgrade',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const pool = database.targetPool,
        sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      await pool.query(
        sql
          .split('\n')
          .filter((line) => !/^\\(?:un)?restrict /u.test(line))
          .join('\n'),
      );
      await pool.query('SET search_path TO public');
      expect(
        (
          await pool.query(
            "SELECT to_regclass('public.project_next_action_heads') AS relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      const journal = object(
          JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
        ),
        entries = objects(journal.entries),
        index = entries.findIndex(
          (entry) => entry.tag === '0091_project_next_action',
        );
      expect(entries[index - 1]?.tag).toBe(c.predecessor);
      const tables = (
        await pool.query<{ tablename: string }>(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => row.tablename);
      async function snapshot() {
        const result: Record<string, unknown> = {};
        for (const table of tables) {
          if (!/^[a-z_]+$/u.test(table))
            throw new Error('Invalid native table.');
          result[table] = (
            await pool.query(
              `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows;
        }
        return result;
      }
      const before = await snapshot();
      expect(objects(before.projects)).toHaveLength(5);
      expect(objects(before.task_result_declarations)).toHaveLength(1);
      expect(objects(before.mission_applicability_facts)).toHaveLength(1);
      expect(objects(before.client_union_operations)).toHaveLength(1);
      for (const table of [
        'knowledge_sources',
        'knowledge_passages',
        'knowledge_source_events',
        'knowledge_source_commands',
        'knowledge_interactions',
      ])
        expect(objects(before[table]).length, table).toBeGreaterThan(0);
      expect(objects(before.document_pdfs)).toHaveLength(2);
      expect(
        (
          await pool.query(
            "SELECT bundle,permission_set_version FROM company_role_assignments WHERE bundle IN ('company_knowledge_source_administrator','company_knowledge_evidence_reader') ORDER BY bundle::text",
          )
        ).rows,
      ).toEqual([
        {
          bundle: 'company_knowledge_evidence_reader',
          permission_set_version: 'v1',
        },
        {
          bundle: 'company_knowledge_source_administrator',
          permission_set_version: 'v1',
        },
      ]);
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(before);
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(before);
      const environment = {
        KNOWLEDGE_EVIDENCE_ENABLED: 'true',
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000827',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
      };
      async function call(
        path: string,
        options: { method?: string; key?: string; body?: unknown } = {},
      ) {
        if (!harness) throw new Error('No compatible application.');
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
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment,
        serverClock: { now: () => new Date('2026-10-31T12:00:00Z') },
      });
      for (const [path, value] of Object.entries(object(c.reads))) {
        const response = await call(path);
        expect(response.status, path).toBe(200);
        const actual: unknown = await response.json();
        expect(
          path === '/access/current-actor' ? permissions(actual) : actual,
        ).toEqual(
          path === '/access/current-actor' ? permissions(value) : value,
        );
      }
      for (const command of objects(c.commands)) {
        const response = await call(string(command.path), {
          method: 'POST',
          key: string(command.key),
          body: command.body,
        });
        expect(response.status).toBe(command.status);
        // The matching predecessor recorded its actual public replay after its
        // existing union/closure projections. Immutable stored receipts are also
        // compared byte-for-byte in every full-row snapshot above.
        expect(await response.json()).toEqual(command.replay);
      }
      const download = await call(
        `/documents/${string(c.documentId)}/versions/${string(c.versionId)}/content`,
      );
      expect(download.status).toBe(200);
      expect(
        createHash('sha256')
          .update(Buffer.from(await download.arrayBuffer()))
          .digest('hex'),
      ).toBe(c.pdfSha256);
      async function conservedKnowledge() {
        const knowledge = object(c.knowledge);
        const adminPath = `/knowledge/sources/${string(knowledge.sourceId)}/administration`;
        const administration = await call(adminPath);
        expect(administration.status).toBe(200);
        expect(await administration.json()).toEqual(object(c.reads)[adminPath]);
        const pdf = await call(
          `/documents/${string(knowledge.documentId)}/versions/${string(knowledge.versionId)}/content`,
        );
        expect(pdf.status).toBe(200);
        expect(
          createHash('sha256')
            .update(Buffer.from(await pdf.arrayBuffer()))
            .digest('hex'),
        ).toBe(knowledge.pdfSha256);
      }
      await conservedKnowledge();
      for (const projectId of [
        c.projectId,
        c.manualId,
        c.legacyId,
        c.configuredId,
        c.closedId,
      ]) {
        const response = await call(
          `/projects/${string(projectId)}/next-action`,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          current: { revision: 0, text: null, lastChange: null },
          history: { entries: [], hasMore: false, nextBeforeRevision: null },
        });
      }
      const afterReads = await snapshot();
      expect({ ...afterReads, internal_users: before.internal_users }).toEqual(
        before,
      );
      for (const row of objects(afterReads.internal_users)) {
        const actual = object(row.row),
          old = objects(before.internal_users)
            .map((row) => object(row.row))
            .find((row) => row.id === actual.id);
        expect({ ...actual, updated_at: old?.updated_at }).toEqual(old);
      }
      const grant = await call(
        '/company-project-next-action-coordinator-assignments',
        {
          method: 'POST',
          body: {
            companyId: c.companyId,
            workspaceMembershipId: c.membershipId,
          },
        },
      );
      expect(grant.status).toBe(201);
      const beforeDeclaration = await snapshot();
      const path = `/projects/${string(c.manualId)}/next-action`,
        body = {
          expectedRevision: 0,
          expectedLifecycleRevision: 0,
          text: 'New action survives compatible forward recovery.\r\n🌍',
        };
      const response = await call(path, {
        method: 'POST',
        key: 'new-forward-recovery',
        body,
      });
      expect(response.status).toBe(200);
      const saved: unknown = await response.json();
      const afterDeclaration = await snapshot();
      expect({
        ...afterDeclaration,
        client_accounts: beforeDeclaration.client_accounts,
        internal_users: beforeDeclaration.internal_users,
      }).toEqual(beforeDeclaration);
      const firstRead = await (await call(path)).json();
      await harness.close();
      harness = undefined;
      for (let restart = 0; restart < 2; restart++) {
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          environment,
          serverClock: { now: () => new Date('2026-10-31T12:00:00Z') },
        });
        expect(await (await call(path)).json()).toEqual(firstRead);
        await conservedKnowledge();
        expect(
          await (
            await call(path, {
              method: 'POST',
              key: 'new-forward-recovery',
              body,
            })
          ).json(),
        ).toEqual(saved);
        await harness.close();
        harness = undefined;
      }
    } finally {
      await harness?.close();
      await database.close();
    }
  },
  30_000,
);
