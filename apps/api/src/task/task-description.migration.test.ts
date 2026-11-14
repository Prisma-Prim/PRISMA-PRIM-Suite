import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000008701';
const USER = '00000000-0000-4000-8000-000000008702';
const MEMBERSHIP = '00000000-0000-4000-8000-000000008703';
const COMPANY = '00000000-0000-4000-8000-000000008704';
const CLIENT = '00000000-0000-4000-8000-000000008705';
const PROJECT = '00000000-0000-4000-8000-000000008706';
const TASK = '00000000-0000-4000-8000-000000008707';

it.skipIf(!databaseUrl)(
  'refuses blank, padded, overlong and unencodable Task descriptions on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('Disposable PostgreSQL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'task_description_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Task descriptions')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'task-manager', 'Ana Popescu', 'ana@example.test')`,
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
         VALUES ($1, $2, 'GRUP Demo SA', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO projects (id, workspace_id, company_id, client_account_id, title,
           created_by_internal_user_id, created_by_workspace_membership_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'Described preparation', $5, $6, 'task-description-project')`,
        [PROJECT, WORKSPACE, COMPANY, CLIENT, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO tasks (id, workspace_id, company_id, project_id, client_account_id, title,
           created_by_internal_user_id, created_by_membership_id, created_by_display_name)
         VALUES ($1, $2, $3, $4, $5, 'Prepare the audit notes', $6, $7, 'Ana Popescu')`,
        [TASK, WORKSPACE, COMPANY, PROJECT, CLIENT, USER, MEMBERSHIP],
      );
      const constraints = ['', ' ', '﻿X', 'X ', '😀'.repeat(2001)];
      for (const value of constraints)
        await expect(
          query('UPDATE tasks SET description=$2 WHERE id=$1', [TASK, value]),
        ).rejects.toMatchObject({ code: '23514' });
      for (const hex of ['00', 'eda080', 'edbfbf'])
        await expect(
          query(
            "UPDATE tasks SET description=convert_from(decode($2,'hex'),'UTF8') WHERE id=$1",
            [TASK, hex],
          ),
        ).rejects.toMatchObject({ code: '22021' });
      await query('UPDATE tasks SET description=$2 WHERE id=$1', [
        TASK,
        '😀'.repeat(2000),
      ]);
    } finally {
      await database.close();
    }
  },
  60_000,
);
