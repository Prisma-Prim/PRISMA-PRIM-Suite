import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000004061';
const USER = '00000000-0000-4000-8000-000000004062';
const MEMBERSHIP = '00000000-0000-4000-8000-000000004063';
const COMPANY = '00000000-0000-4000-8000-000000004064';
const CLIENT = '00000000-0000-4000-8000-000000004065';
const RESPONSIBLE_PROJECT = '00000000-0000-4000-8000-000000004066';
const UNASSIGNED_PROJECT = '00000000-0000-4000-8000-000000004067';
const CHECK_VIOLATION = '23514';

// Every bundle and captured version delivered before this migration,
// including superseded versions kept as revoked history.
const PRESERVED_ASSIGNMENTS: ReadonlyArray<
  readonly [bundle: string, version: string | null, revoked: boolean]
> = [
  ['company_context_access', null, false],
  ['company_director_client_access', 'v1', true],
  ['company_director_client_access', 'v2', false],
  ['company_document_registrar', 'v1', true],
  ['company_document_registrar', 'v2', true],
  ['company_document_registrar', 'v3', false],
  ['company_commercial_intake', 'v1', true],
  ['company_commercial_intake', 'v2', false],
  ['company_project_access', 'v1', true],
  ['company_project_access', 'v2', false],
  ['company_task_manager', 'v1', false],
  ['company_document_project_organizer', 'v1', false],
  ['company_document_approver', 'v1', false],
  ['company_service_catalogue', 'v1', false],
  ['company_pricing_configuration', 'v1', false],
  ['company_pricing_user', 'v1', false],
  ['company_commercial_activity_reader', 'v1', false],
];

it.skipIf(!databaseUrl)(
  'keeps every existing Project preparatory at revision 0 with its responsibility, and enforces the lifecycle, start and Approver invariants',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'project_lifecycle_upgrade',
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
      // Located by name, so integration renumbering keeps this upgrade seam.
      const lifecycleIndex = tags.findIndex((tag) =>
        tag.endsWith('_project_lifecycle'),
      );
      expect(lifecycleIndex).toBeGreaterThan(0);
      previous = await mkdtemp(join(tmpdir(), 'prisma-406-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: entries.slice(0, lifecycleIndex),
        }),
      );
      for (const tag of tags.slice(0, lifecycleIndex))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved Projects')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'lifecycle-owner', 'Ana Popescu', 'ana@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-lifecycle-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'GRUP Demo SA', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      for (const [id, key] of [
        [RESPONSIBLE_PROJECT, 'preserved-responsible'],
        [UNASSIGNED_PROJECT, 'preserved-unassigned'],
      ])
        await query(
          `INSERT INTO projects (id, workspace_id, company_id, client_account_id, title,
             created_by_internal_user_id, created_by_workspace_membership_id, idempotency_key)
           VALUES ($1, $2, $3, $4, 'Preserved preparation', $5, $6, $7)`,
          [id, WORKSPACE, COMPANY, CLIENT, USER, MEMBERSHIP, key],
        );
      await query(
        `UPDATE projects SET responsible_membership_id = $2, responsible_display_label = 'Ana Popescu · 1',
           responsibility_revision = 1, responsibility_changed_by_internal_user_id = $3,
           responsibility_changed_by_membership_id = $2, responsibility_changed_by_display_name = 'Ana Popescu',
           responsibility_changed_at = now()
         WHERE id = $1`,
        [RESPONSIBLE_PROJECT, MEMBERSHIP, USER],
      );
      for (const [bundle, version, revoked] of PRESERVED_ASSIGNMENTS)
        await query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version, revoked],
        );
      const snapshot = async () => ({
        projects: (await query('SELECT * FROM projects ORDER BY id')).rows,
        assignments: (
          await query('SELECT * FROM company_role_assignments ORDER BY id')
        ).rows,
        events: (await query('SELECT * FROM activity_log_events ORDER BY id'))
          .rows,
      });
      const before = await snapshot();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Additive: every Project stays preparatory at lifecycle revision 0 with
      // its responsibility, and no backfill confers the Approver.
      const after = await snapshot();
      expect(after.projects).toEqual(
        before.projects.map((row) => ({ ...row, lifecycle_revision: 0 })),
      );
      expect(after.projects.map((row) => row.status)).toEqual([
        'preparatory',
        'preparatory',
      ]);
      expect(after.assignments).toEqual(before.assignments);
      expect(after.events).toEqual(before.events);
      for (const table of [
        'project_lifecycle_transitions',
        'project_start_declarations',
        'project_lifecycle_commands',
      ])
        expect((await query('SELECT * FROM ' + table)).rows).toEqual([]);

      const rejected = (text: string, values: unknown[] = []) =>
        expect(query(text, values)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      // Statuses: exactly the five; the revision never negative and zero only
      // while preparatory; an active or on-hold Project keeps a responsible.
      for (const status of ['archived', 'draft', 'Active', ''])
        await rejected(
          'UPDATE projects SET status = $2, lifecycle_revision = 1 WHERE id = $1',
          [RESPONSIBLE_PROJECT, status],
        );
      await rejected(
        'UPDATE projects SET lifecycle_revision = -1 WHERE id = $1',
        [RESPONSIBLE_PROJECT],
      );
      await rejected("UPDATE projects SET status = 'active' WHERE id = $1", [
        RESPONSIBLE_PROJECT,
      ]);
      await rejected(
        "UPDATE projects SET status = 'active', lifecycle_revision = 1 WHERE id = $1",
        [UNASSIGNED_PROJECT],
      );
      for (const status of [
        'active',
        'on_hold',
        'completed',
        'cancelled',
        'preparatory',
      ])
        await query(
          'UPDATE projects SET status = $2, lifecycle_revision = CASE WHEN $2 = $3 THEN 0 ELSE 1 END WHERE id = $1',
          [RESPONSIBLE_PROJECT, status, 'preparatory'],
        );

      // Transition records: only the section 23 pairs and their text.
      const insertTransition = (
        revision: number,
        action: string,
        from: string,
        to: string,
        reason: string | null = null,
        note: string | null = null,
      ) =>
        query(
          `INSERT INTO project_lifecycle_transitions (workspace_id, company_id, project_id,
             lifecycle_revision, action, from_status, to_status, reason, note,
             actor_internal_user_id, actor_membership_id, actor_display_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Aprobator Demo')`,
          [
            WORKSPACE,
            COMPANY,
            RESPONSIBLE_PROJECT,
            revision,
            action,
            from,
            to,
            reason,
            note,
            USER,
            MEMBERSHIP,
          ],
        );
      for (const [action, from, to, reason, note] of [
        ['hold', 'preparatory', 'on_hold', 'Pause', null],
        ['resume', 'active', 'active', null, null],
        ['activate', 'on_hold', 'active', null, null],
        ['complete', 'on_hold', 'completed', null, 'Done'],
        ['cancel', 'cancelled', 'cancelled', 'Stop', null],
        ['archive', 'active', 'archived', null, null],
        ['hold', 'active', 'on_hold', null, null],
        ['resume', 'on_hold', 'active', 'Back', null],
        ['activate', 'preparatory', 'active', null, 'Note'],
        ['complete', 'active', 'completed', 'Reason', null],
        ['hold', 'active', 'on_hold', ' Padded ', null],
        ['hold', 'active', 'on_hold', 'x'.repeat(501), null],
        ['cancel', 'active', 'cancelled', '', null],
      ] as const)
        await expect(
          insertTransition(1, action, from, to, reason, note),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertTransition(0, 'activate', 'preparatory', 'active'),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      let revision = 0;
      for (const [action, from, to, reason, note] of [
        ['activate', 'preparatory', 'active', null, null],
        ['hold', 'active', 'on_hold', 'Client asked to pause.', null],
        ['resume', 'on_hold', 'active', null, null],
        ['complete', 'active', 'completed', null, 'Delivered.'],
        ['cancel', 'preparatory', 'cancelled', 'Withdrawn.', null],
        ['cancel', 'active', 'cancelled', 'Withdrawn.', null],
        ['cancel', 'on_hold', 'cancelled', 'Withdrawn.', null],
      ] as const)
        await insertTransition((revision += 1), action, from, to, reason, note);
      await expect(
        insertTransition(1, 'activate', 'preparatory', 'active'),
      ).rejects.toMatchObject({ code: '23505' });

      // Start records: the exception exists if and only if an item is missing.
      const items = [
        'approved_offer',
        'contract_or_precontract',
        'project_plan',
        'initial_documents',
        'deadlines',
        'financial_conditions',
        'risks',
      ];
      const insertStart = (
        values: Record<string, string>,
        exception: {
          reason: string;
          member: string;
          label: string;
          due: string;
        } | null,
      ) =>
        query(
          `INSERT INTO project_start_declarations (workspace_id, company_id, project_id,
             ${items.join(', ')}, exception_reason, completion_membership_id,
             completion_display_label, completion_due_date, declared_by_internal_user_id,
             declared_by_membership_id, declared_by_display_name)
           VALUES ($1, $2, $3, ${items.map((_, index) => `$${index + 4}`).join(', ')},
             $11, $12, $13, $14, $15, $16, 'Aprobator Demo')`,
          [
            WORKSPACE,
            COMPANY,
            RESPONSIBLE_PROJECT,
            ...items.map((item) => values[item] ?? 'present'),
            exception?.reason ?? null,
            exception?.member ?? null,
            exception?.label ?? null,
            exception?.due ?? null,
            USER,
            MEMBERSHIP,
          ],
        );
      const exception = {
        reason: 'Work starts on the preliminary agreement.',
        member: MEMBERSHIP,
        label: 'Ana Popescu · 1',
        due: '2026-10-15',
      };
      await expect(insertStart({}, exception)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
      await expect(
        insertStart({ approved_offer: 'missing' }, null),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertStart({ risks: 'not_applicable' }, null),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertStart(
          { approved_offer: 'missing' },
          { ...exception, reason: ' padded ' },
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await insertStart(
        { approved_offer: 'missing', financial_conditions: 'missing' },
        exception,
      );
      await expect(insertStart({}, null)).rejects.toMatchObject({
        code: '23505',
      });

      // The Approver exists only as captured v1; every other bundle and
      // version delivered on main stays accepted.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      for (const [bundle, version] of PRESERVED_ASSIGNMENTS)
        await insertAssignment(bundle, version);
      await insertAssignment('company_project_approver', 'v1');
      for (const version of [null, 'v2', 'V1'])
        await expect(
          insertAssignment('company_project_approver', version),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-406-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
