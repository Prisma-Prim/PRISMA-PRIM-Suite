import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  json,
  record,
  text,
} from '../documents/mission-document.test-support.js';
import { objects } from '../project-template/project-pilot-plan.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine populated main / Knowledge 0089, preserves captured v1 grants, every old row, receipts, histories and exact PDF across two restarts',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('PostgreSQL required');
    const directory = 'test-support/mission-applicability-migration';
    const backup = await readFile(directory + '/predecessor-0089.sql.gz');
    const contextBytes = await readFile(directory + '/context-0089.json');
    const provenance = record(
      JSON.parse(await readFile(directory + '/provenance-0089.json', 'utf8')),
    );
    expect(createHash('sha256').update(backup).digest('hex')).toBe(
      provenance.backupSha256,
    );
    expect(createHash('sha256').update(contextBytes).digest('hex')).toBe(
      provenance.contextSha256,
    );
    const context = record(JSON.parse(contextBytes.toString('utf8')));
    expect(context.source).toBe('e706662adb82dca6b462b64472f1df872a274756');
    expect(context.predecessor).toBe('0089_knowledge_cited_evidence');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'ma_0089_upgrade',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const pool = database.targetPool;
      const sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      // Only psql's non-SQL restrict delimiters are removed; native constraints,
      // functions, triggers, stored bytes and captured grants remain intact.
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
            "SELECT to_regclass('public.mission_applicability_facts') AS relation",
          )
        ).rows,
      ).toEqual([{ relation: null }]);
      const entries = objects(
        record(JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')))
          .entries,
      );
      const index = entries.findIndex(
        (entry) => entry.tag === '0090_mission_applicability',
      );
      expect(entries[index - 1]?.tag).toBe(context.predecessor);
      const tables = (
        await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((row) => text(record(row).tablename));
      const snapshot = async () => {
        const rows: Record<string, unknown> = {};
        for (const table of tables) {
          if (!/^[a-z_]+$/u.test(table))
            throw new Error('Invalid native table');
          rows[table] = (
            await pool.query(
              `SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY to_jsonb(t)::text`,
            )
          ).rows;
        }
        return rows;
      };
      const before = await snapshot();
      for (const table of [
        'knowledge_sources',
        'knowledge_passages',
        'knowledge_source_events',
        'knowledge_source_commands',
        'knowledge_interactions',
        'document_pdfs',
      ])
        expect(objects(before[table]).length, table).toBeGreaterThan(0);
      const captures = (
        await pool.query(
          "SELECT bundle, permission_set_version FROM company_role_assignments WHERE bundle IN ('company_knowledge_source_administrator','company_knowledge_evidence_reader') ORDER BY bundle::text",
        )
      ).rows;
      expect(captures).toEqual([
        {
          bundle: 'company_knowledge_evidence_reader',
          permission_set_version: 'v1',
        },
        {
          bundle: 'company_knowledge_source_administrator',
          permission_set_version: 'v1',
        },
      ]);
      // The old producer application was closed before pg_dump. No current
      // application/owner ORM is constructed until this native upgrade finishes.
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(before);
      await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') });
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await pool.query(
            'SELECT count(*)::int AS count FROM mission_applicability_facts',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      for (let restart = 0; restart < 2; restart++) {
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          synchronizeIdentityProfile: false,
          serverClock: { now: () => new Date('2026-10-30T12:00:00Z') },
          environment: {
            NODE_ENV: 'test',
            ACCESS_IDENTITY_MODE: 'test',
            ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
            ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'knowledge-owner',
            ACCESS_BOOTSTRAP_WORKSPACE_ID:
              '00000000-0000-4000-8000-000000007019',
            ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Fictional Knowledge Workspace',
            KNOWLEDGE_EVIDENCE_ENABLED: 'true',
          },
        });
        const origin = harness.origin;
        const call = (
          path: string,
          options: { method?: string; key?: string; body?: unknown } = {},
        ) =>
          fetch(origin + '/api' + path, {
            method: options.method ?? 'GET',
            headers: {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject': 'knowledge-owner',
              'x-test-display-name': 'Knowledge Owner',
              'x-test-email': 'knowledge-owner@example.test',
              'x-company-context-id': text(context.companyId),
              'content-type': 'application/json',
              'idempotency-key': options.key ?? 'upgrade-read',
            },
            ...(options.body === undefined
              ? {}
              : { body: JSON.stringify(options.body) }),
          });
        for (const [path, expected] of Object.entries(record(context.reads))) {
          const response = await call(path);
          expect(response.status, path).toBe(200);
          expect(await json(response), path).toEqual(expected);
        }
        for (const command of objects(context.commands)) {
          const response = await call(text(command.path), {
            method: 'POST',
            key: text(command.key),
            body: command.body,
          });
          expect(response.status).toBe(command.status);
          expect(await json(response)).toEqual(command.receipt);
        }
        const pdf = await call(
          `/documents/${text(context.documentId)}/versions/${text(context.versionId)}/content`,
        );
        expect(pdf.status).toBe(200);
        expect(
          createHash('sha256')
            .update(Buffer.from(await pdf.arrayBuffer()))
            .digest('hex'),
        ).toBe(context.pdfSha256);
        const actor = record(
          (await json(await call('/access/current-actor'))).activeCompany,
        );
        expect(
          actor.missionApplicabilityCoordinatorAssignmentId,
        ).toBeUndefined();
        expect(actor.missionApplicabilityApproverAssignmentId).toBeUndefined();
        expect(await snapshot()).toEqual(before);
        await harness.close();
        harness = undefined;
      }
    } finally {
      await harness?.close();
      await database.close();
    }
  },
  90_000,
);
