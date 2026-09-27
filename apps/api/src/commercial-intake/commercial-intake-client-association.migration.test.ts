import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
const V1_ASSIGNMENT = '00000000-0000-4000-8000-000000004525';
const V2_ASSIGNMENT = '00000000-0000-4000-8000-000000004526';
const LINKED_REQUEST = '00000000-0000-4000-8000-000000004527';
const UNLINKED_REQUEST = '00000000-0000-4000-8000-000000004528';
const LINKED_OPPORTUNITY = '00000000-0000-4000-8000-000000004529';
const UNLINKED_OPPORTUNITY = '00000000-0000-4000-8000-000000004530';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'adds one-time Request Client association after 0039 without rewriting Requests, grants or events',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'request_assoc_upgrade',
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
      const tags = journal.entries.map((entry: unknown) => {
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
      const associationIndex = tags.findIndex((tag) =>
        tag.endsWith('_request_client_association'),
      );
      expect(associationIndex).toBeGreaterThan(0);
      const previousTags = tags.slice(0, associationIndex);
      expect(previousTags.at(-1)).toBe('0039_project_lifecycle');
      previous = await mkdtemp(join(tmpdir(), 'prisma-452-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, associationIndex),
        }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));

      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(`
        INSERT INTO workspaces (id, name)
          VALUES ('${WORKSPACE}', 'Preserved association proof');
        INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
          VALUES ('${USER}', 'deterministic-test', 'association-owner', 'Association Owner',
            'association-owner@example.test');
        INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
          VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
        INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key)
          VALUES ('${COMPANY}', '${WORKSPACE}', 'Preserved Company', '${USER}', '${MEMBERSHIP}',
            'preserved-association-company');
        INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id)
          VALUES ('${CLIENT}', '${WORKSPACE}', 'Preserved Client', '${USER}', '${MEMBERSHIP}');
        INSERT INTO company_role_assignments (id, workspace_id, company_id,
          workspace_membership_id, bundle, permission_set_version)
          VALUES ('${V1_ASSIGNMENT}', '${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}',
            'company_commercial_intake', 'v1');
        INSERT INTO company_role_assignments (id, workspace_id, company_id,
          workspace_membership_id, bundle, permission_set_version, revoked_at)
          VALUES ('${V2_ASSIGNMENT}', '${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}',
            'company_commercial_intake', 'v2', now());
        INSERT INTO client_requests (id, workspace_id, company_id, client_account_id,
          original_text, captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${LINKED_REQUEST}', '${WORKSPACE}', '${COMPANY}', '${CLIENT}',
            'Historically linked Request', '${USER}', '${MEMBERSHIP}');
        INSERT INTO client_requests (id, workspace_id, company_id, original_text,
          captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${UNLINKED_REQUEST}', '${WORKSPACE}', '${COMPANY}',
            'Historically unlinked Request', '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${LINKED_OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${LINKED_REQUEST}',
            'Linked Opportunity', 'Preserve linked history', '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${UNLINKED_OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${UNLINKED_REQUEST}',
            'Unlinked Opportunity', 'Preserve unlinked history', '${USER}', '${MEMBERSHIP}');
        INSERT INTO commercial_intake_events (workspace_id, company_id, action,
          client_request_id, opportunity_id, actor_internal_user_id,
          actor_workspace_membership_id, metadata)
          VALUES ('${WORKSPACE}', '${COMPANY}', 'client_request.created', '${LINKED_REQUEST}',
            '${LINKED_OPPORTUNITY}', '${USER}', '${MEMBERSHIP}',
            '{"requestVersion":1}'::jsonb),
          ('${WORKSPACE}', '${COMPANY}', 'opportunity.created', '${LINKED_REQUEST}',
            '${LINKED_OPPORTUNITY}', '${USER}', '${MEMBERSHIP}',
            '{"opportunityVersion":1}'::jsonb),
          ('${WORKSPACE}', '${COMPANY}', 'client_request.created', '${UNLINKED_REQUEST}',
            '${UNLINKED_OPPORTUNITY}', '${USER}', '${MEMBERSHIP}',
            '{"requestVersion":1}'::jsonb),
          ('${WORKSPACE}', '${COMPANY}', 'opportunity.created', '${UNLINKED_REQUEST}',
            '${UNLINKED_OPPORTUNITY}', '${USER}', '${MEMBERSHIP}',
            '{"opportunityVersion":1}'::jsonb);
      `);

      const preserved = () =>
        Promise.all(
          [
            'company_role_assignments',
            'client_requests',
            'opportunities',
            'commercial_intake_events',
          ].map(
            async (table) =>
              (
                await query(
                  `SELECT to_jsonb(row_value)::text AS value FROM ${table} row_value ORDER BY id`,
                )
              ).rows,
          ),
        );
      const before = await preserved();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(await preserved()).toEqual(before);
      expect(
        (
          await query(
            'SELECT count(*)::integer AS count FROM commercial_intake_client_association_commands',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await query(
            'SELECT id, client_account_id, version FROM client_requests ORDER BY id',
          )
        ).rows,
      ).toEqual([
        { id: LINKED_REQUEST, client_account_id: CLIENT, version: 1 },
        { id: UNLINKED_REQUEST, client_account_id: null, version: 1 },
      ]);

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

      await query(
        'UPDATE company_role_assignments SET revoked_at = now() WHERE id = $1',
        [V1_ASSIGNMENT],
      );
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id,
           workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_commercial_intake', 'v3')`,
        [WORKSPACE, COMPANY, MEMBERSHIP],
      );
      for (const version of [null, 'v4'])
        await expect(
          query(
            `INSERT INTO company_role_assignments (workspace_id, company_id,
               workspace_membership_id, bundle, permission_set_version, revoked_at)
             VALUES ($1, $2, $3, 'company_commercial_intake', $4, now())`,
            [WORKSPACE, COMPANY, MEMBERSHIP, version],
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

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-452-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
