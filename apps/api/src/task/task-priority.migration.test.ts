import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
const DONE_TASK = '00000000-0000-4000-8000-000000003758';
const STARTED_TASK = '00000000-0000-4000-8000-000000003759';
const BLOCKED_TASK = '00000000-0000-4000-8000-00000000375a';
const CANCELLED_TASK = '00000000-0000-4000-8000-00000000375b';
const BLOCKAGE_REASON = 'Attente du questionnaire signé — Clientă 🙂';
const CANCELLATION_REASON = 'Doublon d’une autre tâche';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';

it.skipIf(!databaseUrl)(
  'backfills every existing Task in each execution state as normal, constrains priority and leaves states, reasons, receipts and history byte-identical',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'task_priority_upgrade',
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
      const entries: unknown[] = journal.entries;
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
      // Locate the priority migration by name so journal renumbering keeps this upgrade seam.
      const priorityIndex = tags.findIndex((tag) =>
        tag.endsWith('_task_priority'),
      );
      expect(priorityIndex).toBeGreaterThan(0);
      const previousTags = tags.slice(0, priorityIndex);
      previous = await mkdtemp(join(tmpdir(), 'prisma-375-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: entries.slice(0, priorityIndex),
        }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved Tasks')`,
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
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-task-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'Preserved Client', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO projects (id, workspace_id, company_id, client_account_id, title,
           created_by_internal_user_id, created_by_workspace_membership_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'Preserved preparation', $5, $6, 'preserved-project')`,
        [PROJECT, WORKSPACE, COMPANY, CLIENT, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO tasks (id, workspace_id, company_id, project_id, client_account_id, title, due_date,
           version, created_by_internal_user_id, created_by_membership_id, created_by_display_name)
         VALUES ($1, $3, $4, $5, $6, 'Open notes', '2026-10-01', 2, $7, $8, 'Task Manager'),
                ($2, $3, $4, $5, $6, 'Done notes', NULL, 2, $7, $8, 'Task Manager'),
                ($9, $3, $4, $5, $6, 'Started notes', NULL, 2, $7, $8, 'Task Manager'),
                ($10, $3, $4, $5, $6, 'Blocked notes', NULL, 2, $7, $8, 'Task Manager'),
                ($11, $3, $4, $5, $6, 'Cancelled notes', NULL, 2, $7, $8, 'Task Manager')`,
        [
          OPEN_TASK,
          DONE_TASK,
          WORKSPACE,
          COMPANY,
          PROJECT,
          CLIENT,
          USER,
          MEMBERSHIP,
          STARTED_TASK,
          BLOCKED_TASK,
          CANCELLED_TASK,
        ],
      );
      await query(
        `UPDATE tasks SET status = 'done', completed_at = now(), completed_by_internal_user_id = $2,
           completed_by_membership_id = $3, completed_by_display_name = 'Task Manager'
         WHERE id = $1`,
        [DONE_TASK, USER, MEMBERSHIP],
      );
      await query(`UPDATE tasks SET status = 'in_progress' WHERE id = $1`, [
        STARTED_TASK,
      ]);
      await query(
        `UPDATE tasks SET status = 'blocked', blockage_reason = $4, blocked_at = now(),
           blocked_by_internal_user_id = $2, blocked_by_membership_id = $3, blocked_by_display_name = 'Task Manager'
         WHERE id = $1`,
        [BLOCKED_TASK, USER, MEMBERSHIP, BLOCKAGE_REASON],
      );
      await query(
        `UPDATE tasks SET status = 'cancelled', cancellation_reason = $4, cancelled_at = now(),
           cancelled_by_internal_user_id = $2, cancelled_by_membership_id = $3, cancelled_by_display_name = 'Task Manager'
         WHERE id = $1`,
        [CANCELLED_TASK, USER, MEMBERSHIP, CANCELLATION_REASON],
      );
      const legacyResult = (id: string, title: string) => ({
        id,
        companyId: COMPANY,
        projectId: PROJECT,
        clientAccountId: CLIENT,
        title,
        assignee: null,
        dueDate: null,
        status: 'todo',
        completion: null,
        version: 1,
        createdAt: '2026-09-20T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
        createdBy: {
          internalUserId: USER,
          workspaceMembershipId: MEMBERSHIP,
          displayName: 'Task Manager',
        },
      });
      await query(
        `INSERT INTO task_commands (workspace_id, company_id, task_id, actor_membership_id, idempotency_key, command, result)
         VALUES ($1, $2, $3, $4, 'legacy-create', $5, $6::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          OPEN_TASK,
          MEMBERSHIP,
          JSON.stringify({
            action: 'create',
            companyId: COMPANY,
            projectId: PROJECT,
            title: 'Open notes',
            assigneeMembershipId: null,
            dueDate: null,
          }),
          JSON.stringify(legacyResult(OPEN_TASK, 'Open notes')),
        ],
      );
      await query(
        `INSERT INTO task_events (workspace_id, company_id, task_id, version, actor_internal_user_id,
           actor_membership_id, actor_display_name, meaning)
         VALUES ($1, $2, $3, 1, $4, $5, 'Task Manager', $6::jsonb),
                ($1, $2, $3, 2, $4, $5, 'Task Manager', $7::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          OPEN_TASK,
          USER,
          MEMBERSHIP,
          JSON.stringify({
            action: 'task.created',
            metadata: {
              version: 1,
              initial: { title: 'Open notes', assignee: null, dueDate: null },
            },
          }),
          JSON.stringify({
            action: 'task.updated',
            metadata: {
              version: 2,
              changes: { dueDate: { before: null, after: '2026-10-01' } },
            },
          }),
        ],
      );
      // Execution-state receipts and history recorded before priority existed keep their reasons.
      const actor = {
        internalUserId: USER,
        workspaceMembershipId: MEMBERSHIP,
        displayName: 'Task Manager',
      };
      await query(
        `INSERT INTO task_commands (workspace_id, company_id, task_id, actor_membership_id, idempotency_key, command, result)
         VALUES ($1, $2, $3, $4, 'legacy-block', $5, $6::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          BLOCKED_TASK,
          MEMBERSHIP,
          JSON.stringify({
            companyId: COMPANY,
            taskId: BLOCKED_TASK,
            action: 'status',
            input: {
              expectedVersion: 1,
              status: 'blocked',
              reason: BLOCKAGE_REASON,
            },
          }),
          JSON.stringify({
            ...legacyResult(BLOCKED_TASK, 'Blocked notes'),
            status: 'blocked',
            version: 2,
            blockage: {
              reason: BLOCKAGE_REASON,
              actor,
              occurredAt: '2026-09-21T08:00:00.000Z',
            },
          }),
        ],
      );
      await query(
        `INSERT INTO task_events (workspace_id, company_id, task_id, version, actor_internal_user_id,
           actor_membership_id, actor_display_name, meaning)
         VALUES ($1, $2, $3, 2, $5, $6, 'Task Manager', $7::jsonb),
                ($1, $2, $4, 2, $5, $6, 'Task Manager', $8::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          BLOCKED_TASK,
          CANCELLED_TASK,
          USER,
          MEMBERSHIP,
          JSON.stringify({
            action: 'task.status.changed',
            metadata: {
              version: 2,
              before: 'todo',
              after: 'blocked',
              reason: BLOCKAGE_REASON,
            },
          }),
          JSON.stringify({
            action: 'task.cancelled',
            metadata: {
              version: 2,
              before: 'todo',
              after: 'cancelled',
              reason: CANCELLATION_REASON,
            },
          }),
        ],
      );
      const snapshot = async () => ({
        tasks: (await query('SELECT * FROM tasks ORDER BY id')).rows,
        // Text renderings compare the stored receipts and history exactly.
        commands: (
          await query(
            'SELECT id, command, result::text AS result FROM task_commands ORDER BY id',
          )
        ).rows,
        events: (
          await query(
            `SELECT id, task_id, version, actor_membership_id, occurred_at, meaning::text AS meaning
             FROM task_events ORDER BY id`,
          )
        ).rows,
      });
      const before = await snapshot();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      const after = await snapshot();
      expect(after.commands).toEqual(before.commands);
      expect(after.events).toEqual(before.events);
      expect(after.tasks).toEqual(
        before.tasks.map((row) => ({
          ...row,
          priority: 'normal',
          description: null,
        })),
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
      expect(
        (
          await query(
            `SELECT id, status, version, priority, blockage_reason, cancellation_reason
             FROM tasks ORDER BY id`,
          )
        ).rows,
      ).toEqual([
        {
          id: OPEN_TASK,
          status: 'todo',
          version: 2,
          priority: 'normal',
          blockage_reason: null,
          cancellation_reason: null,
        },
        {
          id: DONE_TASK,
          status: 'done',
          version: 2,
          priority: 'normal',
          blockage_reason: null,
          cancellation_reason: null,
        },
        {
          id: STARTED_TASK,
          status: 'in_progress',
          version: 2,
          priority: 'normal',
          blockage_reason: null,
          cancellation_reason: null,
        },
        {
          id: BLOCKED_TASK,
          status: 'blocked',
          version: 2,
          priority: 'normal',
          blockage_reason: BLOCKAGE_REASON,
          cancellation_reason: null,
        },
        {
          id: CANCELLED_TASK,
          status: 'cancelled',
          version: 2,
          priority: 'normal',
          blockage_reason: null,
          cancellation_reason: CANCELLATION_REASON,
        },
      ]);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-375-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
