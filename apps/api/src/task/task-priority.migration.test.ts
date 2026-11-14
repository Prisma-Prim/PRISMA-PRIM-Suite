import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000003751';
const USER = '00000000-0000-4000-8000-000000003752';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003753';
const COMPANY = '00000000-0000-4000-8000-000000003754';
const CLIENT = '00000000-0000-4000-8000-000000003755';
const PROJECT = '00000000-0000-4000-8000-000000003756';
const OPEN_TASK = '00000000-0000-4000-8000-000000003757';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';

it.skipIf(!databaseUrl)(
  'constrains Task priority to normal, important or critical and never null on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'task_priority_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Prioritised Tasks')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'task-owner', 'Task Manager', 'task-owner@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Task Company', $3, $4, 'task-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'Task Client', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO projects (id, workspace_id, company_id, client_account_id, title,
           created_by_internal_user_id, created_by_workspace_membership_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'Task preparation', $5, $6, 'task-project')`,
        [PROJECT, WORKSPACE, COMPANY, CLIENT, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO tasks (id, workspace_id, company_id, project_id, client_account_id, title, due_date,
           priority, created_by_internal_user_id, created_by_membership_id, created_by_display_name)
         VALUES ($1, $2, $3, $4, $5, 'Open notes', '2026-10-01', 'normal', $6, $7, 'Task Manager')`,
        [OPEN_TASK, WORKSPACE, COMPANY, PROJECT, CLIENT, USER, MEMBERSHIP],
      );

      for (const rejected of ['urgent', 'Critical', 'critic', ''])
        await expect(
          query('UPDATE tasks SET priority = $2 WHERE id = $1', [
            OPEN_TASK,
            rejected,
          ]),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        query('UPDATE tasks SET priority = NULL WHERE id = $1', [OPEN_TASK]),
      ).rejects.toMatchObject({ code: NOT_NULL_VIOLATION });
      for (const accepted of ['important', 'critical', 'normal'])
        await query('UPDATE tasks SET priority = $2 WHERE id = $1', [
          OPEN_TASK,
          accepted,
        ]);
    } finally {
      await database.close();
    }
  },
  60_000,
);
