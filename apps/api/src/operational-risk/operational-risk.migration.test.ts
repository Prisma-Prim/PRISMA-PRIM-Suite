import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000763001';
const userId = '00000000-0000-4000-8000-000000763002';
const membershipId = '00000000-0000-4000-8000-000000763003';
const companyId = '00000000-0000-4000-8000-000000763004';
const preservedTables = [
  'workspaces',
  'internal_users',
  'workspace_memberships',
  'workspace_permission_grants',
  'companies',
  'company_role_assignments',
  'activity_log_events',
];
const newTables = [
  'operational_risks',
  'operational_risk_entries',
  'operational_risk_receipts',
  'operational_risk_events',
];

describe.skipIf(!databaseUrl)('Operational Risk additive migration', () => {
  let database: IsolatedPostgresTestDatabase | undefined;
  let before: unknown;
  let after: unknown;
  let initiallyEmpty: unknown;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'risk763_upgrade',
    });
    const previous = await mkdtemp(join(tmpdir(), 'prisma-risk763-upgrade-'));
    try {
      const journal: unknown = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      );
      const root = object(journal);
      if (!Array.isArray(root.entries))
        throw new Error('Invalid synthetic migration journal.');
      const entries = root.entries;
      const tags = entries.map((value) => {
        const entry = object(value);
        if (
          typeof entry.tag !== 'string' ||
          !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag)
        )
          throw new Error('Invalid migration tag.');
        return entry.tag;
      });
      const index = tags.indexOf('0073_company_operational_risks');
      expect(index).toBeGreaterThan(0);
      // Independent on its delivered base. Root requalifies the integrated
      // Ideas/Complaints predecessors before publication; do not import them.
      expect(tags[index - 1]).toBe('0070_project_template_successors');
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...root, entries: entries.slice(0, index) }),
      );
      for (const tag of tags.slice(0, index))
        await cp(join('drizzle', `${tag}.sql`), join(previous, `${tag}.sql`));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      await database.targetPool.query(
        "INSERT INTO workspaces (id,name) VALUES ($1,'Synthetic preserved Risk Workspace')",
        [workspaceId],
      );
      await database.targetPool.query(
        "INSERT INTO internal_users (id,external_provider,external_subject,display_name,email) VALUES ($1,'synthetic-risk-migration','synthetic-risk-member','Synthetic Actor','actor@example.test')",
        [userId],
      );
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
        [membershipId, workspaceId, userId],
      );
      await database.targetPool.query(
        "INSERT INTO companies (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES ($1,$2,'Synthetic preserved Company',$3,$4,'preserved-company')",
        [companyId, workspaceId, userId, membershipId],
      );
      for (const [bundle, version] of [
        ['company_context_access', null],
        ['company_project_access', 'v1'],
        ['company_project_template_configuration', 'v1'],
        ['company_director_client_access', 'v2'],
      ])
        await database.targetPool.query(
          'INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES ($1,$2,$3,$4,$5)',
          [workspaceId, companyId, membershipId, bundle, version],
        );
      await database.targetPool.query(
        "INSERT INTO activity_log_events (workspace_id,actor_internal_user_id,actor_workspace_membership_id,action,target_type,target_company_id,metadata,idempotency_key) VALUES ($1,$2,$3,'company.registered','company',$4,'{}'::jsonb,'preserved-event')",
        [workspaceId, userId, membershipId, companyId],
      );
      const capture = () =>
        Promise.all(
          preservedTables.map(
            async (table) =>
              (await databasePool().query(`SELECT * FROM ${table} ORDER BY id`))
                .rows,
          ),
        );
      before = await capture();
      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      after = await capture();
      initiallyEmpty = await Promise.all(
        newTables.map(
          async (table) =>
            (
              await databasePool().query<{ count: number }>(
                `SELECT count(*)::integer AS count FROM ${table}`,
              )
            ).rows,
        ),
      );
    } finally {
      await rm(previous, { recursive: true, force: true });
    }
  });
  afterAll(async () => {
    await database?.close();
  });

  it('upgrades populated 0070 without changing any existing row or backfilling Risk facts or grants', () => {
    expect(after).toEqual(before);
    expect(initiallyEmpty).toEqual(newTables.map(() => [{ count: 0 }]));
  });
  it.each([
    'company_operational_risk_reader',
    'company_operational_risk_recorder',
  ])('permits only explicit captured v1 for %s', async (bundle) => {
    for (const version of [null, 'v2', 'unknown'])
      await expect(
        databasePool().query(
          'INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES ($1,$2,$3,$4,$5)',
          [workspaceId, companyId, membershipId, bundle, version],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    const result = await databasePool().query(
      'INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES ($1,$2,$3,$4,$5) RETURNING permission_set_version',
      [workspaceId, companyId, membershipId, bundle, 'v1'],
    );
    expect(result.rows).toEqual([{ permission_set_version: 'v1' }]);
  });
  function databasePool() {
    if (!database) throw new Error('Synthetic migration database unavailable.');
    return database.targetPool;
  }
});

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid synthetic object.');
  return Object.fromEntries(Object.entries(value));
}
