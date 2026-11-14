import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000004520';
const USER = '00000000-0000-4000-8000-000000004521';
const MEMBERSHIP = '00000000-0000-4000-8000-000000004522';
const COMPANY = '00000000-0000-4000-8000-000000004523';
const CLIENT = '00000000-0000-4000-8000-000000004524';
const LINKED_REQUEST = '00000000-0000-4000-8000-000000004527';
const UNLINKED_REQUEST = '00000000-0000-4000-8000-000000004528';
const LINKED_OPPORTUNITY = '00000000-0000-4000-8000-000000004529';
const UNLINKED_OPPORTUNITY = '00000000-0000-4000-8000-000000004530';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'enforces the one-time Request Client association, receipt and event invariants on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'request_assoc_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(`
        INSERT INTO workspaces (id, name)
          VALUES ('${WORKSPACE}', 'Association proof');
        INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
          VALUES ('${USER}', 'deterministic-test', 'association-owner', 'Association Owner',
            'association-owner@example.test');
        INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
          VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
        INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key)
          VALUES ('${COMPANY}', '${WORKSPACE}', 'Association Company', '${USER}', '${MEMBERSHIP}',
            'association-company');
        INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id)
          VALUES ('${CLIENT}', '${WORKSPACE}', 'Association Client', '${USER}', '${MEMBERSHIP}');
        INSERT INTO client_requests (id, workspace_id, company_id, client_account_id,
          original_text, captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${LINKED_REQUEST}', '${WORKSPACE}', '${COMPANY}', '${CLIENT}',
            'Linked Request', '${USER}', '${MEMBERSHIP}');
        INSERT INTO client_requests (id, workspace_id, company_id, original_text,
          captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${UNLINKED_REQUEST}', '${WORKSPACE}', '${COMPANY}',
            'Unlinked Request', '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${LINKED_OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${LINKED_REQUEST}',
            'Linked Opportunity', 'Call the linked Client', '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${UNLINKED_OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${UNLINKED_REQUEST}',
            'Unlinked Opportunity', 'Find the unlinked Client', '${USER}', '${MEMBERSHIP}');
      `);

      await expect(
        query('UPDATE client_requests SET version = 2 WHERE id = $1', [
          UNLINKED_REQUEST,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await query('UPDATE client_requests SET version = 2 WHERE id = $1', [
        LINKED_REQUEST,
      ]);
      await expect(
        query('UPDATE client_requests SET version = 3 WHERE id = $1', [
          LINKED_REQUEST,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      for (const version of [null, 'v5'])
        await expect(
          query(
            `INSERT INTO company_role_assignments (workspace_id, company_id,
               workspace_membership_id, bundle, permission_set_version, revoked_at)
             VALUES ($1, $2, $3, 'company_commercial_intake', $4, now())`,
            [WORKSPACE, COMPANY, MEMBERSHIP, version],
          ),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      for (const [bundle, version] of [
        ['company_offer_preparer', 'v99'],
        ['company_opportunity_manager', 'v3'],
        ['company_director_client_access', 'v3'],
        ['company_project_access', 'v3'],
      ])
        await expect(
          query(
            `INSERT INTO company_role_assignments (workspace_id, company_id,
               workspace_membership_id, bundle, permission_set_version, revoked_at)
             VALUES ($1, $2, $3, $4, $5, now())`,
            [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
          ),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      const insertReceipt = (
        key: string,
        requestId: string,
        expectedVersion = 1,
        resultVersion = 2,
      ) =>
        query(
          `INSERT INTO commercial_intake_client_association_commands
             (workspace_id, company_id, actor_workspace_membership_id,
              idempotency_key, fingerprint, client_request_id, client_account_id,
              expected_version, result_version)
           VALUES ($1, $2, $3, $4, 'fingerprint', $5, $6, $7, $8)`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            key,
            requestId,
            CLIENT,
            expectedVersion,
            resultVersion,
          ],
        );
      await insertReceipt('association-1', LINKED_REQUEST);
      await expect(
        insertReceipt('association-2', LINKED_REQUEST),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertReceipt('association-invalid-version', UNLINKED_REQUEST, 2, 2),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      const insertEvent = (
        requestId: string,
        opportunityId: string,
        metadata: string,
      ) =>
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action,
             client_request_id, opportunity_id, actor_internal_user_id,
             actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'client_request.client_associated', $3, $4, $5, $6,
             $7::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            requestId,
            opportunityId,
            USER,
            MEMBERSHIP,
            metadata,
          ],
        );
      for (const metadata of [
        '{}',
        '{"requestVersion":1}',
        '{"requestVersion":2,"clientAccountId":"hidden"}',
      ])
        await expect(
          insertEvent(UNLINKED_REQUEST, UNLINKED_OPPORTUNITY, metadata),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertEvent(
        LINKED_REQUEST,
        LINKED_OPPORTUNITY,
        '{"requestVersion":2}',
      );
      await expect(
        insertEvent(LINKED_REQUEST, LINKED_OPPORTUNITY, '{"requestVersion":2}'),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    } finally {
      await database.close();
    }
  },
  60_000,
);
