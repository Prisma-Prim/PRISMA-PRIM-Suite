import { resolve } from 'node:path';
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

it.skipIf(!databaseUrl)(
  'enforces the Opportunity Manager bundle, responsible receipt and event contract on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'opp_reassignment_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Reassignment intake')`,
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
         VALUES ($1, $2, 'Reassignment Company', $3, $4, 'reassignment-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text, captured_by_internal_user_id,
           captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Reassignment request text', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id, version,
           last_updated_by_internal_user_id, last_updated_by_workspace_membership_id, last_updated_at)
         VALUES ($1, $2, $3, $4, 'Reassignment Opportunity', 'Updated next action', $5, $6, 2, $5, $6, now())`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );

      // The manager bundle and the Company context bundle refuse versions
      // outside their captured ones.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle,
             permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, COLLEAGUE, bundle, version],
        );
      for (const version of [null, 'V1', 'v0'])
        await expect(
          insertAssignment('company_opportunity_manager', version),
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

      // Offer Preparer admits its captured v3 and an unknown successor fails
      // closed, as do unknown Commercial Intake versions and a v3 of every
      // bundle without one.
      await insertAssignment('company_offer_preparer', 'v3');
      await expect(
        insertAssignment('company_offer_preparer', 'v4'),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      for (const version of [null, 'v0', 'V3', 'v5'])
        await expect(
          insertAssignment('company_commercial_intake', version),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      for (const bundle of [
        'company_context_access',
        'company_director_client_access',
        'company_project_access',
        'company_task_manager',
        'company_document_project_organizer',
        'company_document_approver',
        'company_service_catalogue',
        'company_pricing_configuration',
        'company_pricing_user',
        'company_pricing_adjustment',
        'company_commercial_activity_reader',
        'company_opportunity_manager',
        'company_project_approver',
      ])
        await expect(insertAssignment(bundle, 'v3')).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
    } finally {
      await database.close();
    }
  },
  60_000,
);
