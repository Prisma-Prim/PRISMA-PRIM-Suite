import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000312';
const USER = '00000000-0000-4000-8000-000000003121';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003122';
const COMPANY = '00000000-0000-4000-8000-000000003123';
const ASSIGNMENT = '00000000-0000-4000-8000-000000003124';
const REQUEST = '00000000-0000-4000-8000-000000003125';
const OPPORTUNITY = '00000000-0000-4000-8000-000000003126';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'upgrades through 0028 without expanding captured permissions and enforces the next-action contract',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'next_action_upgrade',
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
      const entries: unknown[] = journal.entries.slice(0, 27);
      const tags = entries.map((entry) => {
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
      expect(tags.at(-1)).toBe('0026_flawless_black_crow');
      previous = await mkdtemp(join(tmpdir(), 'prisma-312-upgrade-'));
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
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved intake')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'intake-owner', 'Intake Owner', 'intake-owner@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-intake-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO company_role_assignments (id, workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, $4, 'company_commercial_intake', 'v1')`,
        [ASSIGNMENT, WORKSPACE, COMPANY, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
           captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Preserved request text', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Preserved Opportunity', 'Preserved next action', $5, $6)`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
           actor_internal_user_id, actor_workspace_membership_id, metadata)
         VALUES ($1, $2, 'client_request.created', $3, $4, $5, $6, '{"requestVersion": 1}'::jsonb),
                ($1, $2, 'opportunity.created', $3, $4, $5, $6, '{"opportunityVersion": 1}'::jsonb)`,
        [WORKSPACE, COMPANY, REQUEST, OPPORTUNITY, USER, MEMBERSHIP],
      );
      const preserved = [
        'company_role_assignments',
        'client_requests',
        'commercial_intake_events',
      ];
      const before = await Promise.all(
        preserved.map(
          async (table) =>
            (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
        ),
      );
      const opportunityBefore = (
        await query('SELECT * FROM opportunities ORDER BY id')
      ).rows;

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      const after = await Promise.all(
        preserved.map(
          async (table) =>
            (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
        ),
      );
      expect(after).toEqual(before);
      expect(
        (await query('SELECT * FROM opportunities ORDER BY id')).rows,
      ).toEqual(
        opportunityBefore.map((row) => ({
          ...row,
          last_updated_by_internal_user_id: null,
          last_updated_by_workspace_membership_id: null,
          last_updated_at: null,
        })),
      );
      expect(
        (await query('SELECT * FROM commercial_intake_next_action_commands'))
          .rows,
      ).toEqual([]);

      // The captured v1 assignment received no backfill; only a fresh grant
      // captures v2, and unknown versions stay rejected.
      await expect(
        query(
          `UPDATE company_role_assignments SET permission_set_version = 'v3' WHERE id = $1`,
          [ASSIGNMENT],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await query(
        `UPDATE company_role_assignments SET revoked_at = now() WHERE id = $1`,
        [ASSIGNMENT],
      );
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_commercial_intake', 'v2')`,
        [WORKSPACE, COMPANY, MEMBERSHIP],
      );

      // Migration 0028 preserves the Activity reader bundle introduced by
      // 0027 while widening only Commercial Intake to captured v2.
      await query(
        "INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, 'company_commercial_activity_reader', 'v1')",
        [WORKSPACE, COMPANY, MEMBERSHIP],
      );
      await expect(
        query(
          "INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, 'company_commercial_activity_reader', 'v2')",
          [WORKSPACE, COMPANY, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // The Opportunity version is no longer pinned, but the last-update trace
      // must accompany every version above the captured one.
      await expect(
        query('UPDATE opportunities SET version = 0 WHERE id = $1', [
          OPPORTUNITY,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        query('UPDATE opportunities SET version = 2 WHERE id = $1', [
          OPPORTUNITY,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await query(
        `UPDATE opportunities
            SET version = 2, next_action = 'Updated next action',
                last_updated_by_internal_user_id = $2,
                last_updated_by_workspace_membership_id = $3,
                last_updated_at = now()
          WHERE id = $1`,
        [OPPORTUNITY, USER, MEMBERSHIP],
      );
      expect(
        (
          await query(
            'SELECT version, original_text FROM client_requests WHERE id = $1',
            [REQUEST],
          )
        ).rows,
      ).toEqual([{ version: 1, original_text: 'Preserved request text' }]);
      await expect(
        query('UPDATE client_requests SET version = 2 WHERE id = $1', [
          REQUEST,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // The update event carries the resulting version only, exactly once.
      const insertEvent = (metadata: string) =>
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.next_action.updated', $3, $4, $5, $6, $7::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            REQUEST,
            OPPORTUNITY,
            USER,
            MEMBERSHIP,
            metadata,
          ],
        );
      for (const rejected of [
        '{"opportunityVersion": 1}',
        '{"opportunityVersion": "2"}',
        '{"opportunityVersion": 2, "nextAction": "Updated next action"}',
        '{"requestVersion": 1}',
        '{}',
      ])
        await expect(insertEvent(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertEvent('{"opportunityVersion": 2}');
      await expect(
        insertEvent('{"opportunityVersion": 2}'),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.created', $3, $4, $5, $6, '{"opportunityVersion": 1}'::jsonb)`,
          [WORKSPACE, COMPANY, REQUEST, OPPORTUNITY, USER, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // Receipts are unique per actor key and per produced version.
      const insertReceipt = (
        key: string,
        outcome: string,
        expectedVersion: number,
        resultVersion: number,
      ) =>
        query(
          `INSERT INTO commercial_intake_next_action_commands (workspace_id, company_id, actor_workspace_membership_id,
             idempotency_key, fingerprint, opportunity_id, expected_version, result_version, outcome, next_action)
           VALUES ($1, $2, $3, $4, 'fingerprint', $5, $6, $7, $8, 'Updated next action')`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            key,
            OPPORTUNITY,
            expectedVersion,
            resultVersion,
            outcome,
          ],
        );
      await insertReceipt('update-1', 'updated', 1, 2);
      await insertReceipt('no-op-1', 'unchanged', 2, 2);
      await expect(
        insertReceipt('update-1', 'updated', 2, 3),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertReceipt('update-duplicate', 'updated', 1, 2),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertReceipt('skipped-version', 'updated', 1, 3),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertReceipt('moving-no-op', 'unchanged', 2, 3),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertReceipt(
        'maximum-incrementable-version',
        'updated',
        2_147_483_646,
        2_147_483_647,
      );
      await expect(
        insertReceipt(
          'int4-maximum',
          'unchanged',
          2_147_483_647,
          2_147_483_647,
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-312-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
