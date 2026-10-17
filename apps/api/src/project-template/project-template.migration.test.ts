import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000006340';

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function tag(entry: unknown) {
  const value = record(entry).tag;
  if (typeof value !== 'string' || !/^\d{4}_[a-z0-9_-]+$/u.test(value))
    throw new Error('Invalid migration tag.');
  return value;
}

it.skipIf(!databaseUrl)(
  'preserves every existing row and receipt without assigning a Template or new authority during upgrade',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'template_upgrade',
    });
    const previous = await mkdtemp(join(tmpdir(), 'prisma-634-upgrade-'));
    let harness: PostgresRestTestHarness | undefined;
    try {
      const rawJournal: unknown = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      );
      const journal = record(rawJournal);
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries: unknown[] = journal.entries;
      const tags = entries.map(tag);
      const index = tags.findIndex((value) =>
        value.endsWith('_project_template_copies'),
      );
      expect(index).toBeGreaterThan(0);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const name of tags.slice(0, index))
        await cp(join('drizzle', name + '.sql'), join(previous, name + '.sql'));
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        migrationsFolder: previous,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'upgrade-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Preserved preparation',
        },
      });
      const origin = harness.origin;
      async function request(
        path: string,
        value?: unknown,
        context?: { companyId: string },
      ) {
        const response = await fetch(`${origin}/api${path}`, {
          method: value === undefined ? 'GET' : 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': 'upgrade-owner',
            'x-test-display-name': 'Upgrade Owner',
            'x-test-email': 'upgrade-owner@example.test',
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
            ...(context ? { 'x-company-context-id': context.companyId } : {}),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        expect(response.status).toBe(value === undefined ? 200 : 201);
        const body: unknown = await response.json();
        return record(body);
      }
      const membershipId = text(
        (await request('/access/current-actor')).workspaceMembershipId,
      );
      const companyId = text(
        (await request('/companies', { displayName: 'Existing Company' })).id,
      );
      function requestInCompany(path: string, value?: unknown) {
        return request(path, value, { companyId });
      }
      for (const path of [
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
      ])
        await requestInCompany(path, {
          workspaceMembershipId: membershipId,
          companyId,
        });
      const clientId = text(
        (await requestInCompany('/clients', { displayName: 'Existing Client' }))
          .id,
      );
      const projectId = text(
        (
          await requestInCompany('/projects', {
            title: 'Independent manual Project',
            clientAccountId: clientId,
          })
        ).id,
      );
      const taskId = text(
        (
          await requestInCompany(`/projects/${projectId}/tasks`, {
            title: 'Existing notes {literal}',
            dueDate: '2026-12-01',
            priority: 'important',
            assigneeMembershipId: membershipId,
          })
        ).id,
      );
      await requestInCompany(`/tasks/${taskId}/complete`, {
        expectedVersion: 1,
      });
      const tables = (
        await database.targetPool.query<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
        )
      ).rows.map((row) => row.name);
      async function snapshot() {
        return Object.fromEntries(
          await Promise.all(
            tables.map(async (table): Promise<[string, string[]]> => [
              table,
              (
                await database.targetPool.query<{ row: string }>(
                  `SELECT to_jsonb(preserved)::text AS row FROM "${table}" AS preserved`,
                )
              ).rows
                .map((row) => row.row)
                .sort(),
            ]),
          ),
        );
      }
      const before = await snapshot();
      expect(before.projects).toHaveLength(1);
      expect(before.tasks).toHaveLength(1);
      expect(before.task_commands).toHaveLength(2);
      expect(before.task_events).toHaveLength(2);
      expect(before.project_creation_events).toHaveLength(1);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await database.targetPool.query(
            `SELECT (SELECT count(*)::int FROM project_template_instances) AS instances, (SELECT count(*)::int FROM project_template_task_copies) AS copies, (SELECT count(*)::int FROM company_role_assignments WHERE bundle::text = 'company_project_template_user') AS grants`,
          )
        ).rows,
      ).toEqual([{ instances: 0, copies: 0, grants: 0 }]);
      const insert = (version: string | null) =>
        database.targetPool.query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version, revoked_at) VALUES ($1, $2, $3, 'company_project_template_user', $4, now())`,
          [workspaceId, companyId, membershipId, version],
        );
      for (const version of [null, 'v2', 'V1'])
        await expect(insert(version)).rejects.toMatchObject({ code: '23514' });
      await insert('v1');
      await requestInCompany('/company-project-template-user-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      expect(await requestInCompany(`/projects/${projectId}/template`)).toEqual(
        {
          template: null,
        },
      );
      expect(await requestInCompany(`/tasks/${taskId}`)).toMatchObject({
        mutable: true,
        task: {
          status: 'done',
          version: 2,
          priority: 'important',
          dueDate: '2026-12-01',
        },
      });
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
    } finally {
      try {
        await harness?.close();
      } finally {
        try {
          await database.close();
        } finally {
          await rm(previous, { recursive: true, force: true });
        }
      }
    }
  },
  60_000,
);
