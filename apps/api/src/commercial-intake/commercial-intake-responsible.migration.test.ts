import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000399';
const USER = '00000000-0000-4000-8000-000000003901';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003902';
const COLLEAGUE_USER = '00000000-0000-4000-8000-000000003903';
const COLLEAGUE = '00000000-0000-4000-8000-000000003904';
const COMPANY = '00000000-0000-4000-8000-000000003905';
const REQUEST = '00000000-0000-4000-8000-000000003906';
const OPPORTUNITY = '00000000-0000-4000-8000-000000003907';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const PRESERVED = [
  'company_role_assignments',
  'client_requests',
  'opportunities',
  'commercial_intake_events',
  'commercial_intake_next_action_commands',
] as const;

it.skipIf(!databaseUrl)(
  'upgrades through 0035 without altering rows and enforces the Opportunity Manager bundle, receipt and event contract',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'opp_reassignment_upgrade',
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
      const tags: string[] = journal.entries.map((entry: unknown) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('tag' in entry) ||
          typeof entry.tag !== 'string' ||
          !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag)
        )
          throw new Error('Invalid migration tag.');
        return entry.tag;
      });
      const target = tags.indexOf('0035_opportunity_reassignment');
      expect(target).toBeGreaterThan(0);
      const entries: unknown[] = journal.entries.slice(0, target);
      const previousTags = tags.slice(0, target);
      previous = await mkdtemp(join(tmpdir(), 'prisma-399-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved reassignment')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'ada', 'Ada Ionescu', 'ada@example.test'),
                ($2, 'deterministic-test', 'ion', 'Ion Popa', 'ion@example.test')`,
        [USER, COLLEAGUE_USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $3), ($4, $2, $5)`,
        [MEMBERSHIP, WORKSPACE, USER, COLLEAGUE, COLLEAGUE_USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-reassignment-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      // One active assignment per bundle and captured version on main.
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_context_access', NULL),
                ($1, $2, $3, 'company_director_client_access', 'v2'),
                ($1, $2, $3, 'company_document_registrar', 'v2'),
                ($1, $2, $3, 'company_project_access', 'v2'),
                ($1, $2, $3, 'company_commercial_intake', 'v2'),
                ($1, $2, $3, 'company_task_manager', 'v1'),
                ($1, $2, $3, 'company_document_project_organizer', 'v1'),
                ($1, $2, $3, 'company_service_catalogue', 'v1'),
                ($1, $2, $3, 'company_pricing_configuration', 'v1'),
                ($1, $2, $3, 'company_commercial_activity_reader', 'v1'),
                ($1, $2, $4, 'company_commercial_intake', 'v1'),
                ($1, $2, $4, 'company_context_access', NULL)`,
        [WORKSPACE, COMPANY, MEMBERSHIP, COLLEAGUE],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
           captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Preserved request text', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id, version,
           last_updated_by_internal_user_id, last_updated_by_workspace_membership_id, last_updated_at)
         VALUES ($1, $2, $3, $4, 'Preserved Opportunity', 'Preserved next action', $5, $6, 2, $5, $6, now())`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
           actor_internal_user_id, actor_workspace_membership_id, metadata)
         VALUES ($1, $2, 'client_request.created', $3, $4, $5, $6, '{"requestVersion": 1}'::jsonb),
                ($1, $2, 'opportunity.created', $3, $4, $5, $6, '{"opportunityVersion": 1}'::jsonb),
                ($1, $2, 'opportunity.next_action.updated', $3, $4, $5, $6, '{"opportunityVersion": 2}'::jsonb)`,
        [WORKSPACE, COMPANY, REQUEST, OPPORTUNITY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO commercial_intake_next_action_commands (workspace_id, company_id, actor_workspace_membership_id,
           idempotency_key, fingerprint, opportunity_id, expected_version, result_version, outcome, next_action)
         VALUES ($1, $2, $3, 'preserved-update', 'fingerprint', $4, 1, 2, 'updated', 'Preserved next action')`,
        [WORKSPACE, COMPANY, MEMBERSHIP, OPPORTUNITY],
      );
      const snapshot = () =>
        Promise.all(
          PRESERVED.map(
            async (table) =>
              (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
          ),
        );
      const before = await snapshot();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Additive only: no backfill, no row rewrite and no implicit grant.
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM company_role_assignments
              WHERE bundle = 'company_opportunity_manager'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (await query('SELECT * FROM commercial_intake_responsible_commands'))
          .rows,
      ).toEqual([]);

      // The manager bundle accepts only captured v1; every bundle and version
      // on main stays accepted.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle,
             permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, COLLEAGUE, bundle, version],
        );
      for (const version of ['v2', null, 'V1', 'v0'])
        await expect(
          insertAssignment('company_opportunity_manager', version),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      for (const [bundle, version] of [
        ['company_opportunity_manager', 'v1'],
        ['company_context_access', null],
        ['company_director_client_access', 'v1'],
        ['company_director_client_access', 'v2'],
        ['company_document_registrar', 'v1'],
        ['company_document_registrar', 'v2'],
        ['company_project_access', 'v1'],
        ['company_project_access', 'v2'],
        ['company_commercial_intake', 'v1'],
        ['company_commercial_intake', 'v2'],
        ['company_task_manager', 'v1'],
        ['company_document_project_organizer', 'v1'],
        ['company_service_catalogue', 'v1'],
        ['company_pricing_configuration', 'v1'],
        ['company_commercial_activity_reader', 'v1'],
      ] satisfies Array<[string, string | null]>)
        await insertAssignment(bundle, version);
      await expect(
        insertAssignment('company_commercial_intake', 'v3'),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertAssignment('company_context_access', 'v1'),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // The change event carries exactly the resulting version and two
      // different responsible actors with non-blank captured labels.
      const ada = {
        workspaceMembershipId: MEMBERSHIP,
        displayLabel: 'Ada Ionescu · A',
      };
      const ion = {
        workspaceMembershipId: COLLEAGUE,
        displayLabel: 'Ion Popa · B',
      };
      const insertEvent = (metadata: unknown) =>
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.responsible.changed', $3, $4, $5, $6, $7::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            REQUEST,
            OPPORTUNITY,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      for (const rejected of [
        { opportunityVersion: 3, before: ada, after: ion, email: 'x' },
        { opportunityVersion: 3, before: ada, after: ada },
        { opportunityVersion: 1, before: ada, after: ion },
        { opportunityVersion: '3', before: ada, after: ion },
        { opportunityVersion: 3, before: ada },
        { opportunityVersion: 3, before: null, after: ion },
        {
          opportunityVersion: 3,
          before: { ...ada, email: 'ada@example.test' },
          after: ion,
        },
        {
          opportunityVersion: 3,
          before: { ...ada, displayLabel: '   ' },
          after: ion,
        },
        {
          opportunityVersion: 3,
          before: { ...ada, workspaceMembershipId: null },
          after: ion,
        },
        {
          opportunityVersion: 3,
          before: ada,
          after: { workspaceMembershipId: COLLEAGUE },
        },
        { opportunityVersion: 3 },
      ])
        await expect(insertEvent(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertEvent({ opportunityVersion: 3, before: ada, after: ion });
      await expect(
        insertEvent({ opportunityVersion: 3, before: ion, after: ada }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      // The per-action index leaves the next-action event space unchanged.
      await expect(
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.next_action.updated', $3, $4, $5, $6,
             '{"opportunityVersion": 2, "before": null}'::jsonb)`,
          [WORKSPACE, COMPANY, REQUEST, OPPORTUNITY, USER, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // Receipts are unique per actor key and per produced version.
      const insertReceipt = (
        key: string,
        outcome: string,
        expectedVersion: number,
        resultVersion: number,
      ) =>
        query(
          `INSERT INTO commercial_intake_responsible_commands (workspace_id, company_id, actor_workspace_membership_id,
             idempotency_key, fingerprint, opportunity_id, expected_version, result_version, outcome,
             responsible_workspace_membership_id)
           VALUES ($1, $2, $3, $4, 'fingerprint', $5, $6, $7, $8, $9)`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            key,
            OPPORTUNITY,
            expectedVersion,
            resultVersion,
            outcome,
            COLLEAGUE,
          ],
        );
      await insertReceipt('change-1', 'updated', 2, 3);
      await insertReceipt('no-op-1', 'unchanged', 3, 3);
      await expect(
        insertReceipt('change-1', 'unchanged', 3, 3),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertReceipt('change-duplicate', 'updated', 2, 3),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      for (const [key, outcome, expectedVersion, resultVersion] of [
        ['skipped-version', 'updated', 2, 4],
        ['moving-no-op', 'unchanged', 3, 4],
        ['unknown-outcome', 'cleared', 3, 3],
        ['zero-version', 'unchanged', 0, 0],
      ] satisfies Array<[string, string, number, number]>)
        await expect(
          insertReceipt(key, outcome, expectedVersion, resultVersion),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-399-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
