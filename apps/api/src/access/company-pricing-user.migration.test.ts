import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000039700';
const USER = '00000000-0000-4000-8000-000000039701';
const MEMBERSHIP = '00000000-0000-4000-8000-000000039702';
const COMPANY = '00000000-0000-4000-8000-000000039703';
const CONFIGURATION_ASSIGNMENT = '00000000-0000-4000-8000-000000039704';
const PRICING_USER_ASSIGNMENT = '00000000-0000-4000-8000-000000039705';
const RULE_VERSION = '00000000-0000-4000-8000-000000039706';
const PREVIOUS_MIGRATIONS = 33;
const CHECK_VIOLATION = '23514';

// Every bundle and captured version delivered before this migration,
// including superseded versions kept as revoked history.
const PRESERVED_ASSIGNMENTS: ReadonlyArray<
  readonly [bundle: string, version: string | null, revoked: boolean]
> = [
  ['company_context_access', null, false],
  ['company_director_client_access', 'v1', true],
  ['company_director_client_access', 'v2', false],
  ['company_document_registrar', 'v1', true],
  ['company_document_registrar', 'v2', false],
  ['company_commercial_intake', 'v1', true],
  ['company_commercial_intake', 'v2', false],
  ['company_project_access', 'v1', true],
  ['company_project_access', 'v2', false],
  ['company_task_manager', 'v1', false],
  ['company_document_project_organizer', 'v1', false],
  ['company_service_catalogue', 'v1', false],
  ['company_commercial_activity_reader', 'v1', false],
];

it.skipIf(!databaseUrl)(
  'adds Company Pricing User through 0033 without changing any existing row and accepts only its captured v1',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_user_upgrade',
    });
    let previous: string | undefined;
    try {
      const journal: unknown = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      );
      if (
        typeof journal !== 'object' ||
        journal === null ||
        !('entries' in journal) ||
        !Array.isArray(journal.entries)
      )
        throw new Error('Invalid migration journal.');
      const allEntries: unknown[] = journal.entries;
      const entries = allEntries.slice(0, PREVIOUS_MIGRATIONS);
      const tags = entries.map(journalTag);
      expect(tags.at(-1)).toBe('0032_pricing_rule_versions');
      expect(journalTag(allEntries[PREVIOUS_MIGRATIONS])).toBe(
        '0033_company_pricing_user',
      );
      previous = await mkdtemp(join(tmpdir(), 'prisma-397-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of tags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved access')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'pricing-user', 'Pricing User', 'pricing-user@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-pricing-user-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      for (const [bundle, version, revoked] of PRESERVED_ASSIGNMENTS)
        await query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version, revoked],
        );
      await query(
        `INSERT INTO company_role_assignments (id, workspace_id, company_id, workspace_membership_id,
           bundle, permission_set_version)
         VALUES ($1, $2, $3, $4, 'company_pricing_configuration', 'v1')`,
        [CONFIGURATION_ASSIGNMENT, WORKSPACE, COMPANY, MEMBERSHIP],
      );
      await query(
        `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
           actor_workspace_membership_id, action, target_type, target_company_id, metadata,
           idempotency_key)
         VALUES ($1, $2, $3, 'company.registered', 'company', $4, '{}'::jsonb,
                 'preserved-company-registered')`,
        [WORKSPACE, USER, MEMBERSHIP, COMPANY],
      );
      await query(
        `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
           actor_workspace_membership_id, action, target_type, target_internal_user_id,
           target_workspace_membership_id, target_company_id, target_company_role_assignment_id,
           metadata, idempotency_key)
         VALUES ($1, $2, $3, 'company_pricing_configuration_assignment.granted',
                 'company_role_assignment', $2, $3, $4, $5,
                 '{"bundle":"Company Pricing Configuration"}'::jsonb,
                 'preserved-configuration-granted')`,
        [WORKSPACE, USER, MEMBERSHIP, COMPANY, CONFIGURATION_ASSIGNMENT],
      );
      await query(
        `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
           effective_from, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
         VALUES ($1, $2, $3, 1, 'Preserved rule', TIMESTAMPTZ '2026-05-01 00:00:00+00', $4, $5,
                 TIMESTAMPTZ '2026-04-01 00:00:00+00')`,
        [RULE_VERSION, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );

      // Every row of every table, whatever pricing tables exist on main.
      const tables = (
        await database.targetPool.query<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name`,
        )
      ).rows.map((table) => table.name);
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            tables.map(async (table): Promise<[string, string[]]> => [
              table,
              (
                await database.targetPool.query<{ row: string }>(
                  `SELECT to_jsonb(preserved)::text AS row FROM "${table}" AS preserved`,
                )
              ).rows
                .map((preserved) => preserved.row)
                .sort(),
            ]),
          ),
        );
      const before = await snapshot();
      expect(before.company_role_assignments).toHaveLength(
        PRESERVED_ASSIGNMENTS.length + 1,
      );
      expect(before.activity_log_events).toHaveLength(2);
      expect(before.pricing_rule_versions).toHaveLength(1);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Additive: every existing row survives byte-identical and no backfill
      // confers the new bundle.
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM company_role_assignments
              WHERE bundle = 'company_pricing_user'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        await enumValues('company_role_bundle', database.targetPool),
      ).toContain('company_pricing_user');
      expect(
        await enumValues('activity_log_action', database.targetPool),
      ).toEqual(
        expect.arrayContaining([
          'company_pricing_user_assignment.granted',
          'company_pricing_user_assignment.revoked',
        ]),
      );

      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      // The rewritten check keeps every delivered bundle and version.
      for (const [bundle, version] of PRESERVED_ASSIGNMENTS)
        await insertAssignment(bundle, version);
      await insertAssignment('company_pricing_configuration', 'v1');
      await insertAssignment('company_pricing_user', 'v1');
      for (const [bundle, version] of [
        ['company_pricing_user', null],
        ['company_pricing_user', 'v2'],
        ['company_pricing_user', 'V1'],
        ['company_pricing_configuration', 'v2'],
        ['company_service_catalogue', 'v2'],
        ['company_commercial_activity_reader', 'v2'],
        ['company_commercial_intake', 'v3'],
        ['company_project_access', 'v3'],
        ['company_director_client_access', null],
        ['company_document_registrar', 'v3'],
        ['company_task_manager', null],
        ['company_context_access', 'v1'],
      ] as const)
        await expect(insertAssignment(bundle, version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      // A live v1 assignment carries both lifecycle actions.
      await query(
        `INSERT INTO company_role_assignments (id, workspace_id, company_id, workspace_membership_id,
           bundle, permission_set_version)
         VALUES ($1, $2, $3, $4, 'company_pricing_user', 'v1')`,
        [PRICING_USER_ASSIGNMENT, WORKSPACE, COMPANY, MEMBERSHIP],
      );
      for (const action of [
        'company_pricing_user_assignment.granted',
        'company_pricing_user_assignment.revoked',
      ])
        await query(
          `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
             actor_workspace_membership_id, action, target_type, target_internal_user_id,
             target_workspace_membership_id, target_company_id, target_company_role_assignment_id,
             metadata, idempotency_key)
           VALUES ($1, $2, $3, $4, 'company_role_assignment', $2, $3, $5, $6,
                   '{"bundle":"Company Pricing User"}'::jsonb, $7)`,
          [
            WORKSPACE,
            USER,
            MEMBERSHIP,
            action,
            COMPANY,
            PRICING_USER_ASSIGNMENT,
            `upgraded-${action}`,
          ],
        );

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-397-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);

function journalTag(entry: unknown): string {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('tag' in entry) ||
    typeof entry.tag !== 'string' ||
    !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag)
  )
    throw new Error('Invalid migration tag.');
  return entry.tag;
}

async function enumValues(
  type: 'company_role_bundle' | 'activity_log_action',
  pool: Pool,
): Promise<string[]> {
  return (
    await pool.query<{ value: string }>(
      `SELECT unnest(enum_range(NULL::${type}))::text AS value`,
    )
  ).rows.map((row) => row.value);
}
