import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Certification Case additive migration', () => {
  it('preserves existing identities and grants, creates no certification rights or rows, and guards history', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1131_upgrade',
    });
    let previous: string | undefined;
    try {
      previous = await mkdtemp(join(tmpdir(), 'certification1131-previous-'));
      const directory = resolve('drizzle');
      const journal = record(
        JSON.parse(
          await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
        ),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries = journal.entries.map((entry: unknown) => {
        const value = record(entry);
        if (typeof value.tag !== 'string')
          throw new Error('Invalid migration tag.');
        return { ...value, tag: value.tag };
      });
      const index = entries.findIndex((entry) =>
        entry.tag.endsWith('_certification_cases'),
      );
      expect(index).toBeGreaterThan(0);
      const old = entries.slice(0, index);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: old }),
      );
      for (const entry of old)
        await cp(
          join(directory, `${entry.tag}.sql`),
          join(previous, `${entry.tag}.sql`),
        );
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const workspace = randomUUID(),
        user = randomUUID(),
        membership = randomUUID(),
        company = randomUUID();
      await database.targetPool.query(
        'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
        [workspace, 'Synthetic pre-certification workspace'],
      );
      await database.targetPool.query(
        'INSERT INTO internal_users (id, external_provider, external_subject, display_name, email) VALUES ($1, $2, $3, $4, $5)',
        [
          user,
          'deterministic-test',
          'certification-upgrade',
          'Synthetic existing member',
          'upgrade@example.test',
        ],
      );
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)',
        [membership, workspace, user],
      );
      await database.targetPool.query(
        'INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id, created_by_workspace_membership_id, registration_idempotency_key) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          company,
          workspace,
          'Synthetic existing Company',
          user,
          membership,
          'old-company-key',
        ],
      );
      for (const [bundle, version] of [
        ['company_project_access', 'v2'],
        ['company_working_evidence_case_reader', 'v1'],
      ])
        await database.targetPool.query(
          'INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, $4, $5)',
          [workspace, company, membership, bundle, version],
        );
      const snapshot = async () =>
        database.targetPool.query(`SELECT jsonb_build_object(
        'workspaces', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM workspaces t),
        'users', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM internal_users t),
        'memberships', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM workspace_memberships t),
        'companies', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM companies t),
        'assignments', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM company_role_assignments t)) AS state`);
      const before = await snapshot();
      await migrate(connection, { migrationsFolder: directory });
      expect((await snapshot()).rows).toEqual(before.rows);
      const state = await database.targetPool.query(
        "SELECT (SELECT count(*) FROM company_role_assignments WHERE bundle::text LIKE 'company_certification_%') AS grants, (SELECT count(*) FROM certification_cases) AS cases, (SELECT count(*) FROM certification_step_versions) AS steps, (SELECT count(*) FROM certification_events) AS events, (SELECT count(*) FROM certification_receipts) AS receipts",
      );
      expect(state.rows).toEqual([
        { grants: '0', cases: '0', steps: '0', events: '0', receipts: '0' },
      ]);
      for (const role of ['reader', 'programme_manager'])
        for (const version of [null, 'v2'])
          await expect(
            database.targetPool.query(
              'INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, $4, $5)',
              [
                workspace,
                company,
                membership,
                `company_certification_${role}`,
                version,
              ],
            ),
          ).rejects.toMatchObject({ code: '23514' });
      const triggers = await database.targetPool.query<{ name: string }>(
        "SELECT tgname AS name FROM pg_trigger WHERE tgname LIKE 'certification_%' AND NOT tgisinternal ORDER BY tgname",
      );
      expect(triggers.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'certification_case_not_deleted',
          'certification_event_immutable',
          'certification_receipt_immutable',
          'certification_step_version_immutable',
        ]),
      );
    } finally {
      try {
        await database.close();
      } finally {
        if (previous) await rm(previous, { recursive: true, force: true });
      }
    }
  }, 60000);
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected journal object.');
  return Object.fromEntries(Object.entries(value));
}
