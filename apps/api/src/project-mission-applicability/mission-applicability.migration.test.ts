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
import {
  json,
  record,
  text,
  PDF_A,
} from '../documents/mission-document.test-support.js';
import { objects } from '../project-template/project-pilot-plan.test-support.js';

function permissionSets(value: Record<string, unknown>) {
  const company = record(value.activeCompany);
  const normalized: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(company))
    normalized[key] =
      key.endsWith('Permissions') && Array.isArray(field)
        ? [...field].sort()
        : field;
  return {
    ...value,
    workspacePermissions: Array.isArray(value.workspacePermissions)
      ? [...value.workspacePermissions].sort()
      : value.workspacePermissions,
    activeCompany: normalized,
  };
}

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades the genuine populated 212 / 0088 native backup twice, conserves every old full row and reopens public histories, receipts and exact PDFs through two application restarts',
  async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('PostgreSQL required');
    const directory = 'test-support/mission-applicability-migration';
    const backup = await readFile(directory + '/predecessor-0088.sql.gz');
    const contextBytes = await readFile(directory + '/context.json');
    const provenance = record(
      JSON.parse(await readFile(directory + '/provenance.json', 'utf8')),
    );
    expect(createHash('sha256').update(backup).digest('hex')).toBe(
      provenance.backupSha256,
    );
    expect(createHash('sha256').update(contextBytes).digest('hex')).toBe(
      provenance.contextSha256,
    );
    const c = record(JSON.parse(contextBytes.toString('utf8')));
    expect(c.source).toBe('212ce26dd92a5dba7ada66b2befd96e1cd383b1c');
    expect(c.predecessor).toBe('0088_operational_risk_journal_corrections');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: url,
      namePrefix: 'ma_0088_upgrade',
    });
    let harness: PostgresRestTestHarness | undefined;
    try {
      const pool = database.targetPool;
      const sql = gunzipSync(backup).toString('utf8');
      expect(sql).not.toMatch(/DISABLE TRIGGER|session_replication_role/u);
      // pg_dump's psql-only restrict delimiters have no SQL meaning. Every SQL byte,
      // including all old native constraints/functions/triggers and rows, is retained.
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
      const journal = record(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      const entries = objects(journal.entries),
        index = entries.findIndex(
          (entry) => entry.tag === '0089_mission_applicability',
        );
      expect(entries[index - 1]?.tag).toBe(c.predecessor);
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
      expect(objects(before.task_result_declarations).length).toBe(1);
      expect(objects(before.operational_risk_entries).length).toBe(3);
      expect(objects(before.document_pdfs).length).toBe(1);
      // Only the raw migrator touches the historical schema. No current application
      // or current owner ORM is constructed until the complete upgrade has finished.
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
      const environment = {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'mission-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000827',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Mission Documents DEMO',
      };
      for (let restart = 0; restart < 2; restart++) {
        harness = await createPostgresRestTestHarness({
          databaseUrl: database.targetUrl,
          environment,
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
              'x-test-external-subject': 'mission-owner',
              'x-test-display-name': 'Mission Owner DEMO',
              'x-test-email': 'mission-owner@example.test',
              'x-company-context-id': text(c.companyId),
              'content-type': 'application/json',
              'idempotency-key': options.key ?? 'upgrade-probe-demo',
            },
            ...(options.body === undefined
              ? {}
              : { body: JSON.stringify(options.body) }),
          });
        for (const [path, value] of Object.entries(record(c.reads))) {
          const response = await call(path);
          expect(response.status).toBe(200);
          const actual = await json(response);
          expect(
            path === '/access/current-actor' ? permissionSets(actual) : actual,
          ).toEqual(
            path === '/access/current-actor'
              ? permissionSets(record(value))
              : value,
          );
        }
        for (const command of objects(c.commands)) {
          const response = await call(text(command.path), {
            method: 'POST',
            key: text(command.key),
            body: command.body,
          });
          expect(response.status).toBe(command.status);
          // Existing Project creation confirmation returns its current Project view.
          // Immutable creation receipt rows are compared in full by snapshot().
          const receipt = record(command.receipt),
            expected =
              command.path === '/projects/from-template' &&
              receipt.id === c.closedId
                ? { ...receipt, status: 'cancelled' }
                : receipt;
          expect(await json(response)).toEqual(expected);
        }
        const download = await call(
          `/documents/${text(c.documentId)}/versions/${text(c.versionId)}/content`,
        );
        expect(download.status).toBe(200);
        expect(Buffer.from(await download.arrayBuffer())).toEqual(PDF_A);
        const actor = record(
          (await json(await call('/access/current-actor'))).activeCompany,
        );
        for (const field of [
          'missionApplicabilityProposalPermissions',
          'missionApplicabilityCoordinatorAssignmentId',
          'missionApplicabilityCoordinatorPermissionSetVersion',
          'missionApplicabilityDecisionPermissions',
          'missionApplicabilityApproverAssignmentId',
          'missionApplicabilityApproverPermissionSetVersion',
        ])
          expect(actor[field]).toBeUndefined();
        for (const projectId of [c.projectId, c.closedId]) {
          const projection = record(
            (
              await json(
                await call(
                  `/projects/${text(projectId)}/mission-applicability`,
                ),
              )
            ).applicability,
          );
          expect(projection).toMatchObject({
            kind: 'available',
            revision: 0,
            clarification: {
              state: 'BUSINESS_CLARIFICATION_PENDING',
              questionId: 'MISSION-CLOSE-01',
            },
          });
          expect(objects(projection.activities)).toHaveLength(13);
          expect(projection.mutable).toBe(projectId === c.projectId);
        }
        for (const projectId of [c.manualId, c.legacyId, c.configuredId])
          expect(
            await json(
              await call(`/projects/${text(projectId)}/mission-applicability`),
            ),
          ).toEqual({ applicability: null });
        expect(
          (
            await call(`/projects/${text(c.projectId)}/mission-applicability`, {
              method: 'POST',
              body: {
                action: 'PROPOSE',
                taskId: c.resultTaskId,
                expectedTaskVersion: 2,
                expectedResultRevision: 1,
                expectedLifecycleRevision: 0,
                expectedApplicabilityRevision: 0,
                reason: 'DEMO explicit new opt-in required',
                scopeBasis: 'DEMO reported scope',
                agreement: {
                  kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
                  basis: 'DEMO',
                },
              },
            })
          ).status,
        ).toBe(403);
        await harness.close();
        harness = undefined;
      }
      const afterReads = await snapshot();
      // Ordinary authenticated requests refresh the existing identity's updated_at.
      // The two migration-only comparisons above remain exact for every full row.
      expect({ ...afterReads, internal_users: before.internal_users }).toEqual(
        before,
      );
      const usersBefore = objects(before.internal_users),
        usersAfter = objects(afterReads.internal_users);
      expect(usersAfter).toHaveLength(usersBefore.length);
      for (let index = 0; index < usersBefore.length; index++) {
        const original = record(usersBefore[index]?.row),
          current = record(usersAfter[index]?.row);
        expect({ ...current, updated_at: original.updated_at }).toEqual(
          original,
        );
        expect(Date.parse(text(current.updated_at))).toBeGreaterThanOrEqual(
          Date.parse(text(original.updated_at)),
        );
      }
    } finally {
      await harness?.close();
      await database.close();
    }
  },
  30_000,
);
