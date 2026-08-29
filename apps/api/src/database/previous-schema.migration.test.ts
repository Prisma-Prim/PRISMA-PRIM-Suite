import type { INestApplication } from '@nestjs/common';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from './isolated-postgres-test-database.js';
import { runPreviousSchemaTestLifecycle } from './previous-schema-test-lifecycle.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) assertLocalTestDatabaseUrl(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const previousSchemaMigrationTestTimeoutMs = 15_000;

describeWithPostgres('previous schema migration preflight', () => {
  it(
    'starts the current application after migration without promoting a membership outside bootstrap resolution',
    async () => {
      let isolatedDatabase: IsolatedPostgresTestDatabase | undefined;
      let migrationPool: Pool | undefined;
      let applicationPool: Pool | undefined;
      let application: INestApplication | undefined;
      let previousMigrationsDirectory: string | undefined;

      await runPreviousSchemaTestLifecycle(async () => {
        isolatedDatabase = await createIsolatedPostgresTestDatabase({
          baseDatabaseUrl: databaseUrl!,
          namePrefix: 'prisma_prim_previous',
        });
        migrationPool = isolatedDatabase.targetPool;
        const targetUrl = isolatedDatabase.targetUrl;

        const migrationsDirectory = resolve('drizzle');
        const journal = JSON.parse(
          await readFile(
            join(migrationsDirectory, 'meta', '_journal.json'),
            'utf8',
          ),
        );
        expect(journal.entries.length).toBeGreaterThan(1);
        const previousEntries = journal.entries.slice(0, -1);

        previousMigrationsDirectory = await mkdtemp(
          join(tmpdir(), 'prisma-prim-previous-schema-'),
        );
        await cp(
          join(migrationsDirectory, 'meta'),
          join(previousMigrationsDirectory, 'meta'),
          { recursive: true },
        );
        await writeFile(
          join(previousMigrationsDirectory, 'meta', '_journal.json'),
          `${JSON.stringify({ ...journal, entries: previousEntries }, null, 2)}\n`,
        );
        for (const entry of previousEntries) {
          await cp(
            join(migrationsDirectory, `${entry.tag}.sql`),
            join(previousMigrationsDirectory, `${entry.tag}.sql`),
          );
        }

        const database = drizzle(migrationPool);
        await migrate(database, {
          migrationsFolder: previousMigrationsDirectory,
        });
        await migrationPool.query(`
          WITH seeded_workspace AS (
            INSERT INTO workspaces (singleton_key, name)
            VALUES ('previous-schema-workspace', 'Previous Schema Workspace')
            RETURNING id
          )
          INSERT INTO internal_users (
            workspace_id, external_provider, external_subject,
            display_name, email
          )
          SELECT id, 'deterministic-test', 'previous-schema-owner',
            'Previous Owner', 'previous-owner@example.test'
          FROM seeded_workspace
        `);
        await migrationPool.query(`
          WITH seeded_membership AS (
            SELECT membership.workspace_id, membership.id,
              membership.internal_user_id
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.workspace_id = membership.workspace_id
              AND internal_user.id = membership.internal_user_id
            INNER JOIN workspaces AS workspace
              ON workspace.id = membership.workspace_id
            WHERE workspace.singleton_key = 'previous-schema-workspace'
              AND internal_user.external_provider = 'deterministic-test'
              AND internal_user.external_subject = 'previous-schema-owner'
          ), seeded_company AS (
            INSERT INTO companies (
              id, workspace_id, display_name, created_by_internal_user_id,
              created_by_workspace_membership_id,
              registration_idempotency_key
            )
            SELECT '00000000-0000-4000-8000-000000001461', workspace_id,
              'Previous Provider', internal_user_id, id,
              'previous-provider-registration'
            FROM seeded_membership
            RETURNING workspace_id, id
          ), seeded_client AS (
            INSERT INTO client_accounts (
              id, workspace_id, display_name, created_by_internal_user_id,
              created_by_workspace_membership_id
            )
            SELECT '00000000-0000-4000-8000-000000001462', workspace_id,
              'Previous Shared Client', internal_user_id, id
            FROM seeded_membership
            RETURNING workspace_id, id
          )
          INSERT INTO client_company_relationships (
            id, workspace_id, client_account_id, company_id,
            created_by_internal_user_id, created_by_workspace_membership_id
          )
          SELECT '00000000-0000-4000-8000-000000001463',
            seeded_client.workspace_id, seeded_client.id, seeded_company.id,
            seeded_membership.internal_user_id, seeded_membership.id
          FROM seeded_client
          INNER JOIN seeded_company
            ON seeded_company.workspace_id = seeded_client.workspace_id
          INNER JOIN seeded_membership
            ON seeded_membership.workspace_id = seeded_client.workspace_id
        `);
        await migrationPool.query(`
          WITH seeded_membership AS (
            SELECT membership.workspace_id, membership.id,
              membership.internal_user_id
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.workspace_id = membership.workspace_id
              AND internal_user.id = membership.internal_user_id
            WHERE internal_user.external_provider = 'deterministic-test'
              AND internal_user.external_subject = 'previous-schema-owner'
          ), seeded_revoked_company AS (
            INSERT INTO companies (
              id, workspace_id, display_name, created_by_internal_user_id,
              created_by_workspace_membership_id,
              registration_idempotency_key, status
            )
            SELECT '00000000-0000-4000-8000-000000001468', workspace_id,
              'Previous Revoked Provider', internal_user_id, id,
              'previous-revoked-provider-registration', 'inactive'
            FROM seeded_membership
            RETURNING id
          ), seeded_assignment AS (
            INSERT INTO company_role_assignments (
              id, workspace_id, company_id, workspace_membership_id, bundle
            )
            SELECT '00000000-0000-4000-8000-000000001464', workspace_id,
              '00000000-0000-4000-8000-000000001461', id,
              'company_context_access'
            FROM seeded_membership
            RETURNING id, workspace_id, company_id, workspace_membership_id
          ), seeded_legacy_director_assignments AS (
            INSERT INTO company_role_assignments (
              id, workspace_id, company_id, workspace_membership_id, bundle,
              revoked_at
            )
            SELECT '00000000-0000-4000-8000-000000001466'::uuid, workspace_id,
              '00000000-0000-4000-8000-000000001461'::uuid, id,
              'company_director_client_access'::company_role_bundle,
              NULL::timestamptz
            FROM seeded_membership
            UNION ALL
            SELECT '00000000-0000-4000-8000-000000001467'::uuid, workspace_id,
              '00000000-0000-4000-8000-000000001468'::uuid, id,
              'company_director_client_access'::company_role_bundle,
              '2026-08-27T11:00:00.000Z'::timestamptz
            FROM seeded_membership
            RETURNING id
          )
          INSERT INTO activity_log_events (
            id, workspace_id, actor_internal_user_id,
            actor_workspace_membership_id, action, target_type,
            target_internal_user_id, target_workspace_membership_id,
            target_company_id, target_company_role_assignment_id,
            occurred_at, metadata, idempotency_key
          )
          SELECT '00000000-0000-4000-8000-000000001465',
            seeded_membership.workspace_id,
            seeded_membership.internal_user_id, seeded_membership.id,
            'company_context_assignment.granted', 'company_role_assignment',
            seeded_membership.internal_user_id, seeded_membership.id,
            seeded_assignment.company_id, seeded_assignment.id,
            '2026-08-27T12:00:00.000Z',
            '{"bundle":"Company Context Access"}'::jsonb,
            'previous-schema-assignment-granted'
          FROM seeded_membership
          INNER JOIN seeded_assignment
            ON seeded_assignment.workspace_id = seeded_membership.workspace_id
            AND seeded_assignment.workspace_membership_id = seeded_membership.id
        `);
        await migrationPool.query(`
          UPDATE client_accounts
          SET tax_id = 'PREVIOUS-ID-169'
          WHERE id = '00000000-0000-4000-8000-000000001462';

          WITH seeded_context AS (
            SELECT membership.workspace_id,
              membership.id AS workspace_membership_id
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.id = membership.internal_user_id
            WHERE internal_user.external_subject = 'previous-schema-owner'
          )
          INSERT INTO client_account_registration_commands (
            id, workspace_id, actor_workspace_membership_id, idempotency_key,
            display_name, tax_id, company_id
          )
          SELECT command.id, seeded_context.workspace_id,
            seeded_context.workspace_membership_id, command.idempotency_key,
            command.display_name, 'PREVIOUS-ID-169',
            '00000000-0000-4000-8000-000000001461'
          FROM seeded_context
          CROSS JOIN (
            VALUES
              (
                '00000000-0000-4000-8000-000000001692'::uuid,
                'previous-duplicate-review-a',
                'Previous Duplicate Proposal A'
              ),
              (
                '00000000-0000-4000-8000-000000001693'::uuid,
                'previous-duplicate-review-b',
                'Previous Duplicate Proposal B'
              )
          ) AS command(id, idempotency_key, display_name);

          WITH seeded_context AS (
            SELECT membership.workspace_id,
              membership.id AS workspace_membership_id
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.id = membership.internal_user_id
            WHERE internal_user.external_subject = 'previous-schema-owner'
          )
          INSERT INTO client_duplicate_reviews (
            reference, workspace_id, proposal_kind,
            proposal_actor_workspace_membership_id, attempted_company_id,
            registration_command_id, normalized_identifier, proposed_fields,
            created_at
          )
          SELECT proposal.reference, seeded_context.workspace_id,
            'registration', seeded_context.workspace_membership_id,
            '00000000-0000-4000-8000-000000001461',
            proposal.command_id, 'PREVIOUS-ID-169',
            jsonb_build_object(
              'displayName', proposal.display_name,
              'taxId', 'PREVIOUS-ID-169',
              'address', NULL,
              'telephone', NULL,
              'generalEmail', NULL,
              'contacts', '[]'::jsonb,
              'businessActivity', NULL
            ),
            '2026-08-29T12:00:00.000Z'
          FROM seeded_context
          CROSS JOIN (
            VALUES
              (
                '00000000-0000-4000-8000-000000001694'::uuid,
                '00000000-0000-4000-8000-000000001692'::uuid,
                'Previous Duplicate Proposal A'
              ),
              (
                '00000000-0000-4000-8000-000000001695'::uuid,
                '00000000-0000-4000-8000-000000001693'::uuid,
                'Previous Duplicate Proposal B'
              )
          ) AS proposal(reference, command_id, display_name);

          INSERT INTO client_duplicate_review_candidates (
            workspace_id, review_reference, client_account_id,
            captured_version
          )
          SELECT review.workspace_id, review.reference,
            '00000000-0000-4000-8000-000000001462', 1
          FROM client_duplicate_reviews AS review
          WHERE review.reference IN (
            '00000000-0000-4000-8000-000000001694',
            '00000000-0000-4000-8000-000000001695'
          );

          INSERT INTO client_duplicate_review_relationship_snapshots (
            workspace_id, review_reference, participant_kind,
            client_account_id, company_id, relationship_id
          )
          SELECT review.workspace_id, review.reference, 'candidate',
            '00000000-0000-4000-8000-000000001462',
            '00000000-0000-4000-8000-000000001461',
            '00000000-0000-4000-8000-000000001463'
          FROM client_duplicate_reviews AS review
          WHERE review.reference IN (
            '00000000-0000-4000-8000-000000001694',
            '00000000-0000-4000-8000-000000001695'
          );
        `);
        await migrate(database, { migrationsFolder: migrationsDirectory });
        const migratedReviewCursors = await migrationPool.query<{
          reference: string;
          pagination_cursor: string;
          normalized_identifier: string;
          display_name: string;
        }>(`SELECT reference::text, pagination_cursor::text,
              normalized_identifier,
              proposed_fields ->> 'displayName' AS display_name
            FROM client_duplicate_reviews
            ORDER BY reference`);
        expect(migratedReviewCursors.rows).toEqual([
          {
            reference: '00000000-0000-4000-8000-000000001694',
            pagination_cursor: expect.any(String),
            normalized_identifier: 'PREVIOUS-ID-169',
            display_name: 'Previous Duplicate Proposal A',
          },
          {
            reference: '00000000-0000-4000-8000-000000001695',
            pagination_cursor: expect.any(String),
            normalized_identifier: 'PREVIOUS-ID-169',
            display_name: 'Previous Duplicate Proposal B',
          },
        ]);
        const migratedCursorValues = migratedReviewCursors.rows.map(
          (review) => review.pagination_cursor,
        );
        expect(new Set(migratedCursorValues).size).toBe(2);
        expect(migratedCursorValues).not.toContain(
          '00000000-0000-4000-8000-000000001694',
        );
        expect(migratedCursorValues).not.toContain(
          '00000000-0000-4000-8000-000000001695',
        );
        const upgradedClient = await migrationPool.query<{
          id: string;
          relationship_id: string;
          version: number;
          contacts: unknown[];
        }>(`SELECT client.id, relationship.id AS relationship_id,
              client.version, client.contacts
            FROM client_accounts AS client
            INNER JOIN client_company_relationships AS relationship
              ON relationship.workspace_id = client.workspace_id
              AND relationship.client_account_id = client.id
            WHERE client.id = '00000000-0000-4000-8000-000000001462'`);
        expect(upgradedClient.rows).toEqual([
          {
            id: '00000000-0000-4000-8000-000000001462',
            relationship_id: '00000000-0000-4000-8000-000000001463',
            version: 1,
            contacts: [],
          },
        ]);
        const migratedDirectorAssignments = await migrationPool.query<{
          id: string;
          permission_set_version: string;
          active: boolean;
        }>(`SELECT id::text, permission_set_version,
              revoked_at IS NULL AS active
            FROM company_role_assignments
            WHERE bundle::text = 'company_director_client_access'
            ORDER BY id`);
        expect(migratedDirectorAssignments.rows).toEqual([
          {
            id: '00000000-0000-4000-8000-000000001466',
            permission_set_version: 'v1',
            active: true,
          },
          {
            id: '00000000-0000-4000-8000-000000001467',
            permission_set_version: 'v1',
            active: false,
          },
        ]);
        await expect(
          migrationPool.query(`UPDATE company_role_assignments
            SET permission_set_version = NULL
            WHERE id = '00000000-0000-4000-8000-000000001466'`),
        ).rejects.toMatchObject({ code: '23514' });
        const grantsAfterMigration = await migrationPool.query<{
          count: string;
        }>(`SELECT count(*)
            FROM workspace_permission_grants
            WHERE permission::text = 'client.manage'`);
        expect(grantsAfterMigration.rows[0]).toEqual({ count: '0' });
        const suspensionMigrationState = await migrationPool.query<{
          commands: string;
          membership_status: string;
          clients: string;
          relationships: string;
          assignment_id: string;
          assignment_active: boolean;
          activity_id: string;
          activity_action: string;
          activity_target_type: string;
        }>(`SELECT
              (SELECT count(*)
                FROM workspace_membership_suspension_commands) AS commands,
              membership.status AS membership_status,
              (SELECT count(*) FROM client_accounts) AS clients,
              (SELECT count(*) FROM client_company_relationships) AS relationships,
              (SELECT id::text FROM company_role_assignments
                WHERE id = '00000000-0000-4000-8000-000000001464') AS assignment_id,
              (SELECT revoked_at IS NULL FROM company_role_assignments
                WHERE id = '00000000-0000-4000-8000-000000001464') AS assignment_active,
              (SELECT id::text FROM activity_log_events
                WHERE id = '00000000-0000-4000-8000-000000001465') AS activity_id,
              (SELECT action::text FROM activity_log_events
                WHERE id = '00000000-0000-4000-8000-000000001465') AS activity_action,
              (SELECT target_type::text FROM activity_log_events
                WHERE id = '00000000-0000-4000-8000-000000001465') AS activity_target_type
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.id = membership.internal_user_id
            WHERE internal_user.external_subject = 'previous-schema-owner'`);
        expect(suspensionMigrationState.rows[0]).toEqual({
          commands: '0',
          membership_status: 'active',
          clients: '1',
          relationships: '1',
          assignment_id: '00000000-0000-4000-8000-000000001464',
          assignment_active: true,
          activity_id: '00000000-0000-4000-8000-000000001465',
          activity_action: 'company_context_assignment.granted',
          activity_target_type: 'company_role_assignment',
        });

        process.env.NODE_ENV = 'test';
        process.env.ACCESS_IDENTITY_MODE = 'test';
        process.env.DATABASE_URL = targetUrl;
        process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
        process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'previous-schema-owner';
        process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY =
          'previous-schema-workspace';
        process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME =
          'Previous Schema Workspace';
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        applicationPool = moduleRef.get(DATABASE).$client as Pool;
        application = moduleRef.createNestApplication();
        application.setGlobalPrefix('api');
        await application.listen(0, '127.0.0.1');

        const applicationUrl = await application.getUrl();
        const actorResponse = await fetch(
          `${applicationUrl}/api/access/current-actor`,
          {
            headers: {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject': 'previous-schema-owner',
              'x-test-display-name': 'Previous Owner',
              'x-test-email': 'previous-owner@example.test',
            },
          },
        );
        expect(actorResponse.status).toBe(200);
        await expect(actorResponse.json()).resolves.toMatchObject({
          workspacePermissions: expect.arrayContaining(['client.manage']),
        });
        const grantsAfterBootstrapResolution = await migrationPool.query<{
          count: string;
        }>(`SELECT count(*)
            FROM workspace_permission_grants
            WHERE permission::text = 'client.manage'`);
        expect(grantsAfterBootstrapResolution.rows[0]).toEqual({ count: '1' });

        const legacyClientHeaders = {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': 'previous-schema-owner',
          'x-test-display-name': 'Previous Owner',
          'x-test-email': 'previous-owner@example.test',
          'x-company-context-id': '00000000-0000-4000-8000-000000001461',
        };
        const migratedClientListResponse = await fetch(
          `${applicationUrl}/api/clients`,
          { headers: legacyClientHeaders },
        );
        expect(migratedClientListResponse.status).toBe(200);
        await expect(migratedClientListResponse.json()).resolves.toEqual([
          {
            id: '00000000-0000-4000-8000-000000001462',
            displayName: 'Previous Shared Client',
            relatedToActiveCompany: true,
          },
        ]);

        const migratedClientDossierResponse = await fetch(
          `${applicationUrl}/api/clients/00000000-0000-4000-8000-000000001462`,
          { headers: legacyClientHeaders },
        );
        expect(migratedClientDossierResponse.status).toBe(200);
        await expect(migratedClientDossierResponse.json()).resolves.toEqual({
          id: '00000000-0000-4000-8000-000000001462',
          displayName: 'Previous Shared Client',
          taxId: null,
          address: null,
          telephone: null,
          generalEmail: null,
          contacts: [],
          businessActivity: null,
          version: 1,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: ['Previous Provider'],
        });

        const response = await fetch(`${applicationUrl}/api/health`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({ status: 'ok' }),
        );
      }, [
        {
          name: 'current application',
          cleanup: async () => {
            await application?.close();
          },
        },
        {
          name: 'current application database pool',
          cleanup: async () => {
            await applicationPool?.end();
          },
        },
        {
          name: 'isolated target database',
          cleanup: async () => {
            await isolatedDatabase?.close();
          },
        },
        {
          name: 'temporary previous-schema migrations',
          cleanup: async () => {
            if (!previousMigrationsDirectory) return;
            await rm(previousMigrationsDirectory, {
              recursive: true,
              force: true,
            });
          },
        },
      ]);
    },
    previousSchemaMigrationTestTimeoutMs,
  );
});
