import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000312';
const USER = '00000000-0000-4000-8000-000000003121';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003122';
const COMPANY = '00000000-0000-4000-8000-000000003123';
const REQUEST = '00000000-0000-4000-8000-000000003125';
const OPPORTUNITY = '00000000-0000-4000-8000-000000003126';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'enforces the Opportunity next-action version, event and receipt contract on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'next_action_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Next-action intake')`,
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
         VALUES ($1, $2, 'Next-action Company', $3, $4, 'next-action-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
           captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Request text', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Next-action Opportunity', 'First next action', $5, $6)`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );
      // The creation event the duplicate check below collides with.
      await query(
        `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
           actor_internal_user_id, actor_workspace_membership_id, metadata)
         VALUES ($1, $2, 'opportunity.created', $3, $4, $5, $6, '{"opportunityVersion": 1}'::jsonb)`,
        [WORKSPACE, COMPANY, REQUEST, OPPORTUNITY, USER, MEMBERSHIP],
      );

      // Unknown Commercial Intake versions fail closed.
      await expect(
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle,
             permission_set_version, revoked_at)
           VALUES ($1, $2, $3, 'company_commercial_intake', 'v5', now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // The Activity reader bundle admits its captured v1 only.
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
      // The PostgreSQL integer maximum admits an unchanged receipt, while no
      // updated receipt can claim it as its observed version; the bigint
      // comparison refuses that without an arithmetic overflow.
      await insertReceipt(
        'int4-maximum-unchanged',
        'unchanged',
        2_147_483_647,
        2_147_483_647,
      );
      await expect(
        insertReceipt(
          'int4-maximum-updated',
          'updated',
          2_147_483_647,
          2_147_483_647,
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertEvent('{"opportunityVersion": 2147483647}');
    } finally {
      await database.close();
    }
  },
  60_000,
);
