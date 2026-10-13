import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000000592';
const USER = '00000000-0000-4000-8000-000000005921';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005922';
const COMPANY = '00000000-0000-4000-8000-000000005923';
const OTHER_COMPANY = '00000000-0000-4000-8000-000000005924';
const REQUEST = '00000000-0000-4000-8000-000000005925';
const OPPORTUNITY = '00000000-0000-4000-8000-000000005926';
const STAGES = {
  qualification: '00000000-0000-4000-8000-000000005927',
  negotiation: '00000000-0000-4000-8000-000000005928',
  foreign: '00000000-0000-4000-8000-000000005929',
} as const;
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

it.skipIf(!databaseUrl)(
  'adds Sales Stages without seeding any stage or expanding captured assignments, and enforces their contract',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'sales_stage_upgrade',
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
      const tags: string[] = journal.entries.map((entry: unknown) => {
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
      const target = tags.indexOf('0066_sales_stages');
      expect(target).toBeGreaterThan(0);
      previous = await mkdtemp(join(tmpdir(), 'prisma-591-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, target),
        }),
      );
      for (const tag of tags.slice(0, target))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved stages')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'ion', 'Ion Popa', 'ion@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      for (const [company, key] of [
        [COMPANY, 'preserved-stage-company'],
        [OTHER_COMPANY, 'other-stage-company'],
      ] as const)
        await query(
          `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
             created_by_workspace_membership_id, registration_idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $3)`,
          [company, WORKSPACE, key, USER, MEMBERSHIP],
        );
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_commercial_intake', 'v3')`,
        [WORKSPACE, COMPANY, MEMBERSHIP],
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
      const opportunitiesBefore = (
        await query('SELECT * FROM opportunities ORDER BY id')
      ).rows;
      const assignmentsBefore = (
        await query('SELECT * FROM company_role_assignments ORDER BY id')
      ).rows;

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Existing Opportunities have no stage, a captured v3 assignment stays
      // v3, and no migration creates a stage, a revision or a history.
      expect(
        (await query('SELECT * FROM opportunities ORDER BY id')).rows,
      ).toEqual(
        opportunitiesBefore.map((row) => ({ ...row, sales_stage_id: null })),
      );
      expect(
        (await query('SELECT * FROM company_role_assignments ORDER BY id'))
          .rows,
      ).toEqual(assignmentsBefore);
      for (const table of [
        'sales_stages',
        'sales_stage_configurations',
        'sales_stage_configuration_commands',
        'sales_stage_events',
        'opportunity_stage_history',
        'commercial_intake_stage_commands',
      ])
        expect(
          (await query(`SELECT count(*)::int AS count FROM ${table}`)).rows,
        ).toEqual([{ count: 0 }]);

      // Commercial Intake admits v1 to v4; the configuration bundle v1 only.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle,
             permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      await insertAssignment('company_commercial_intake', 'v4');
      await insertAssignment('company_sales_stage_configuration', 'v1');
      for (const [bundle, version] of [
        ['company_commercial_intake', 'v5'],
        ['company_sales_stage_configuration', null],
        ['company_sales_stage_configuration', 'v2'],
        ['company_sales_stage_configuration', 'V1'],
      ] as const)
        await expect(insertAssignment(bundle, version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      // A stage: a non-blank label of at most 80 characters, unique within
      // the Company ignoring case, at one of positions 1 to 30, ACTIVE.
      const insertStage = (stage: {
        id?: string;
        company?: string;
        label: string;
        position: number;
        state?: string;
      }) =>
        query(
          `INSERT INTO sales_stages (id, workspace_id, company_id, label, position, state,
             created_by_internal_user_id, created_by_workspace_membership_id)
           VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8)`,
          [
            stage.id ?? null,
            WORKSPACE,
            stage.company ?? COMPANY,
            stage.label,
            stage.position,
            stage.state ?? 'ACTIVE',
            USER,
            MEMBERSHIP,
          ],
        );
      for (const rejected of [
        { label: '', position: 1 },
        { label: '   ', position: 1 },
        { label: 'x'.repeat(81), position: 1 },
        { label: 'Qualification', position: 0 },
        { label: 'Qualification', position: 31 },
        { label: 'Qualification', position: 1, state: 'RETIRED' },
      ])
        await expect(insertStage(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertStage({
        id: STAGES.qualification,
        label: ' Qualification ',
        position: 1,
      });
      await insertStage({
        id: STAGES.negotiation,
        label: 'Negotiation',
        position: 2,
      });
      await insertStage({
        id: STAGES.foreign,
        company: OTHER_COMPANY,
        label: ' QUALIFICATION ',
        position: 1,
      });
      for (const duplicate of [
        { label: ' qualification ', position: 3 },
        { label: 'Pricing', position: 2 },
      ])
        await expect(insertStage(duplicate)).rejects.toMatchObject({
          code: UNIQUE_VIOLATION,
        });
      expect(
        (
          await query('SELECT label FROM sales_stages WHERE id = $1', [
            STAGES.qualification,
          ])
        ).rows,
      ).toEqual([{ label: ' Qualification ' }]);

      // The configuration revision starts at 1 once an operation commits.
      await expect(
        query(
          `INSERT INTO sales_stage_configurations (workspace_id, company_id, revision) VALUES ($1, $2, 0)`,
          [WORKSPACE, COMPANY],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // An Opportunity takes a stage of its own Company only.
      await expect(
        query('UPDATE opportunities SET sales_stage_id = $1 WHERE id = $2', [
          STAGES.foreign,
          OPPORTUNITY,
        ]),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await query(
        'UPDATE opportunities SET sales_stage_id = $1 WHERE id = $2',
        [STAGES.qualification, OPPORTUNITY],
      );

      // History keeps two different stages, each with its captured label.
      const insertHistory = (
        version: number,
        entry: {
          previous?: string;
          previousLabel?: string;
          next?: string;
          nextLabel?: string;
        },
      ) =>
        query(
          `INSERT INTO opportunity_stage_history (workspace_id, company_id, opportunity_id, opportunity_version,
             previous_sales_stage_id, previous_label, new_sales_stage_id, new_label, actor_internal_user_id,
             actor_workspace_membership_id, actor_display_label)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Ion Popa · A')`,
          [
            WORKSPACE,
            COMPANY,
            OPPORTUNITY,
            version,
            entry.previous ?? null,
            entry.previousLabel ?? null,
            entry.next ?? null,
            entry.nextLabel ?? null,
            USER,
            MEMBERSHIP,
          ],
        );
      for (const rejected of [
        {},
        { next: STAGES.qualification },
        { nextLabel: 'Qualification' },
        {
          previous: STAGES.qualification,
          previousLabel: 'Qualification',
          next: STAGES.qualification,
          nextLabel: 'Qualification',
        },
        { next: STAGES.qualification, nextLabel: ' ' },
      ])
        await expect(insertHistory(2, rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await expect(
        insertHistory(1, {
          next: STAGES.qualification,
          nextLabel: 'Qualification',
        }),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertHistory(2, { next: STAGES.foreign, nextLabel: 'Foreign' }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await insertHistory(2, {
        next: STAGES.qualification,
        nextLabel: 'Qualification',
      });
      await insertHistory(3, {
        previous: STAGES.qualification,
        previousLabel: 'Qualification',
      });
      await expect(
        insertHistory(3, {
          next: STAGES.negotiation,
          nextLabel: 'Negotiation',
        }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // A stage receipt records an unchanged no-op or exactly one increment.
      const insertReceipt = (
        key: string,
        outcome: string,
        expected: number,
        result: number,
        stage: string | null = STAGES.qualification,
      ) =>
        query(
          `INSERT INTO commercial_intake_stage_commands (workspace_id, company_id, actor_workspace_membership_id,
             idempotency_key, fingerprint, opportunity_id, expected_version, result_version, outcome, sales_stage_id)
           VALUES ($1, $2, $3, $4, 'fingerprint', $5, $6, $7, $8, $9)`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            key,
            OPPORTUNITY,
            expected,
            result,
            outcome,
            stage,
          ],
        );
      await insertReceipt('updated', 'updated', 1, 2);
      await insertReceipt('cleared', 'updated', 2, 3, null);
      await insertReceipt('unchanged', 'unchanged', 3, 3, null);
      for (const [key, outcome, expected, result] of [
        ['skipped', 'updated', 1, 3],
        ['moved', 'unchanged', 1, 2],
        ['other', 'replaced', 1, 2],
      ] as const)
        await expect(
          insertReceipt(key, outcome, expected, result),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertReceipt('foreign', 'updated', 4, 5, STAGES.foreign),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await expect(
        insertReceipt('same-version', 'updated', 1, 2),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // The change event carries exactly the version and two different
      // stages, each an identifier and a non-blank captured label, or null.
      const qualification = {
        salesStageId: STAGES.qualification,
        label: 'Qualification',
      };
      const negotiation = {
        salesStageId: STAGES.negotiation,
        label: 'Negotiation',
      };
      const insertChange = (metadata: unknown) =>
        query(
          `INSERT INTO commercial_intake_events (workspace_id, company_id, action, client_request_id, opportunity_id,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, 'opportunity.stage.changed', $3, $4, $5, $6, $7::jsonb)`,
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
        { opportunityVersion: 1, previousStage: null, newStage: negotiation },
        { opportunityVersion: '2', previousStage: null, newStage: negotiation },
        { opportunityVersion: 2, newStage: negotiation },
        { opportunityVersion: 2, previousStage: null, newStage: null },
        {
          opportunityVersion: 2,
          previousStage: qualification,
          newStage: qualification,
        },
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { ...negotiation, label: ' ' },
        },
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: { ...negotiation, position: 2 },
        },
        {
          opportunityVersion: 2,
          previousStage: null,
          newStage: negotiation,
          nextAction: 'Call back',
        },
      ])
        await expect(insertChange(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertChange({
        opportunityVersion: 2,
        previousStage: null,
        newStage: qualification,
      });
      await insertChange({
        opportunityVersion: 3,
        previousStage: qualification,
        newStage: null,
      });
      await expect(
        insertChange({
          opportunityVersion: 3,
          previousStage: null,
          newStage: negotiation,
        }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      // The configuration event carries exactly CREATED, its revision and
      // the label; one event per revision.
      const insertConfigured = (metadata: unknown) =>
        query(
          `INSERT INTO sales_stage_events (workspace_id, company_id, sales_stage_id, action,
             actor_internal_user_id, actor_workspace_membership_id, metadata)
           VALUES ($1, $2, $3, 'sales_stage.configured', $4, $5, $6::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            STAGES.qualification,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      for (const rejected of [
        { operation: 'CREATED', configurationRevision: 0, label: 'Q' },
        { operation: 'CREATED', configurationRevision: '1', label: 'Q' },
        { operation: 'RENAMED', configurationRevision: 1, label: 'Q' },
        { operation: 'CREATED', configurationRevision: 1, label: ' ' },
        { operation: 'CREATED', configurationRevision: 1 },
        {
          operation: 'CREATED',
          configurationRevision: 1,
          label: 'Q',
          position: 1,
        },
      ])
        await expect(insertConfigured(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      await insertConfigured({
        operation: 'CREATED',
        configurationRevision: 1,
        label: ' Qualification ',
      });
      await expect(
        insertConfigured({
          operation: 'CREATED',
          configurationRevision: 1,
          label: 'Negotiation',
        }),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-591-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
