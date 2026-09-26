import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000004000';
const USER = '00000000-0000-4000-8000-000000004001';
const MEMBERSHIP = '00000000-0000-4000-8000-000000004002';
const CREATOR_USER = '00000000-0000-4000-8000-000000004003';
const CREATOR = '00000000-0000-4000-8000-000000004004';
const COMPANY = '00000000-0000-4000-8000-000000004005';
const CLIENT = '00000000-0000-4000-8000-000000004006';
const PROJECT = '00000000-0000-4000-8000-000000004007';
const DOCUMENT = '00000000-0000-4000-8000-000000004008';
const VERSION = '00000000-0000-4000-8000-000000004009';
const REFERENCE = '00000000-0000-4000-8000-000000004010';
const SECOND_VERSION = '00000000-0000-4000-8000-000000004011';
const THIRD_VERSION = '00000000-0000-4000-8000-000000004012';
const CREATED_AT = '2026-09-01T10:00:00.000Z';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const RAISED = 'P0001';

// Every bundle and captured version delivered before this migration,
// including superseded versions kept as revoked history.
const PRESERVED_ASSIGNMENTS: ReadonlyArray<
  readonly [bundle: string, version: string | null, revoked: boolean]
> = [
  ['company_context_access', null, false],
  ['company_director_client_access', 'v1', true],
  ['company_director_client_access', 'v2', false],
  ['company_document_registrar', 'v1', true],
  ['company_document_registrar', 'v2', false],
  ['company_commercial_intake', 'v1', true],
  ['company_commercial_intake', 'v2', false],
  ['company_project_access', 'v1', true],
  ['company_project_access', 'v2', false],
  ['company_task_manager', 'v1', false],
  ['company_document_project_organizer', 'v1', false],
  ['company_service_catalogue', 'v1', false],
  ['company_pricing_configuration', 'v1', false],
  ['company_commercial_activity_reader', 'v1', false],
];

it.skipIf(!databaseUrl)(
  'upgrades existing Documents to Version 1 drafts and enforces the Version, bundle and frozen-row invariants',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'document_versions_upgrade',
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
      const allTags = journal.entries.map((entry: unknown) => {
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
      // Locate this migration by name so journal renumbering keeps the seam:
      // every earlier migration builds the pre-Version schema.
      const versionsIndex = allTags.findIndex((tag) =>
        tag.endsWith('_official_document_versions'),
      );
      expect(versionsIndex).toBeGreaterThan(0);
      const entries: unknown[] = journal.entries.slice(0, versionsIndex);
      const tags = allTags.slice(0, versionsIndex);
      previous = await mkdtemp(join(tmpdir(), 'prisma-400-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of tags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved Documents')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'document-owner', 'Document Owner', 'document-owner@example.test'),
                ($2, 'deterministic-test', 'document-creator', 'Document Creator', 'document-creator@example.test')`,
        [USER, CREATOR_USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $3), ($4, $2, $5)`,
        [MEMBERSHIP, WORKSPACE, USER, CREATOR, CREATOR_USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-document-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'Preserved Client', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_company_relationships (workspace_id, client_account_id, company_id,
           created_by_internal_user_id, created_by_workspace_membership_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [WORKSPACE, CLIENT, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO projects (id, workspace_id, company_id, client_account_id, title,
           created_by_internal_user_id, created_by_workspace_membership_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'Preserved Project', $5, $6, 'preserved-project')`,
        [PROJECT, WORKSPACE, COMPANY, CLIENT, USER, MEMBERSHIP],
      );
      // One corrected working Document attached to a Project.
      await query(
        `INSERT INTO working_documents (id, workspace_id, company_id, client_id, project_id,
           project_revision, working_revision, title, purpose, created_by_membership_id,
           created_at, idempotency_key, request_fingerprint)
         VALUES ($1, $2, $3, $4, $5, 1, 2, 'Corrected questionnaire', 'Preserved purpose', $6,
           $7, 'preserved-document', 'preserved-fingerprint')`,
        [DOCUMENT, WORKSPACE, COMPANY, CLIENT, PROJECT, CREATOR, CREATED_AT],
      );
      await query(
        `INSERT INTO document_versions (id, workspace_id, company_id, document_id)
         VALUES ($1, $2, $3, $4)`,
        [VERSION, WORKSPACE, COMPANY, DOCUMENT],
      );
      await query(
        `INSERT INTO document_representations (id, workspace_id, company_id, version_id, url)
         VALUES ($1, $2, $3, $4, 'https://example.test/preserved')`,
        [REFERENCE, WORKSPACE, COMPANY, VERSION],
      );
      await query(
        `INSERT INTO document_registration_events (workspace_id, company_id, document_id,
           actor_membership_id, occurred_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [WORKSPACE, COMPANY, DOCUMENT, CREATOR, CREATED_AT],
      );
      await query(
        `INSERT INTO document_correction_commands (workspace_id, company_id, document_id,
           actor_membership_id, idempotency_key, request_fingerprint, expected_revision, revision,
           outcome, before_title, before_purpose, before_url, after_title, after_purpose, after_url)
         VALUES ($1, $2, $3, $4, 'preserved-correction', 'preserved-correction-fingerprint', 1, 2,
           'corrected', 'Initial questionnaire', 'Preserved purpose', 'https://example.test/preserved',
           'Corrected questionnaire', 'Preserved purpose', 'https://example.test/preserved')`,
        [WORKSPACE, COMPANY, DOCUMENT, MEMBERSHIP],
      );
      await query(
        `INSERT INTO document_project_events (workspace_id, company_id, document_id, project_id,
           action, expected_revision, revision, actor_membership_id, idempotency_key)
         VALUES ($1, $2, $3, $4, 'link', 0, 1, $5, 'preserved-link')`,
        [WORKSPACE, COMPANY, DOCUMENT, PROJECT, MEMBERSHIP],
      );
      for (const [bundle, version, revoked] of PRESERVED_ASSIGNMENTS)
        await query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version, revoked],
        );
      const preserved = [
        'working_documents',
        'document_representations',
        'document_registration_events',
        'document_correction_commands',
        'document_project_events',
        'projects',
        'company_role_assignments',
        'activity_log_events',
      ];
      const snapshot = () =>
        Promise.all(
          preserved.map(
            async (table) =>
              (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
          ),
        );
      const before = await snapshot();
      expect(before[6]).toHaveLength(PRESERVED_ASSIGNMENTS.length);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Additive: nothing but the Version row changes, and no backfill
      // confers Registrar v3 or the Approver.
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await query(
            `SELECT id, document_id, number, status, created_by_membership_id,
                    created_at, designated_by_membership_id, designated_at,
                    frozen_title, frozen_purpose, superseded_at, superseded_by_version_id
               FROM document_versions`,
          )
        ).rows,
      ).toEqual([
        {
          id: VERSION,
          document_id: DOCUMENT,
          number: 1,
          status: 'draft',
          created_by_membership_id: CREATOR,
          created_at: new Date(CREATED_AT),
          designated_by_membership_id: null,
          designated_at: null,
          frozen_title: null,
          frozen_purpose: null,
          superseded_at: null,
          superseded_by_version_id: null,
        },
      ]);
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM company_role_assignments
              WHERE bundle::text = 'company_document_approver'
                 OR permission_set_version = 'v3'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (await query('SELECT * FROM document_version_commands')).rows,
      ).toEqual([]);

      // The rewritten permission-set rule keeps every delivered bundle and
      // version, accepts Registrar v3 and Approver v1 only, and fails closed.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      for (const [bundle, version] of PRESERVED_ASSIGNMENTS)
        await insertAssignment(bundle, version);
      await insertAssignment('company_document_registrar', 'v3');
      await insertAssignment('company_document_approver', 'v1');
      for (const [bundle, version] of [
        ['company_document_approver', null],
        ['company_document_approver', 'v2'],
        ['company_document_approver', 'V1'],
        ['company_document_registrar', 'v4'],
        ['company_document_registrar', null],
        ['company_document_project_organizer', 'v2'],
        ['company_commercial_intake', 'v3'],
        ['company_project_access', 'v3'],
        ['company_director_client_access', 'v3'],
        ['company_pricing_configuration', 'v2'],
        ['company_context_access', 'v1'],
      ] as const)
        await expect(insertAssignment(bundle, version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      const frozen = {
        code: RAISED,
        message: expect.stringMatching(/frozen/u),
      };
      // A draft Version's reference stays correctable.
      await query(
        `UPDATE document_representations SET url = 'https://example.test/draft-correction'
          WHERE version_id = $1`,
        [VERSION],
      );
      // Draft -> official is the designation; it freezes the row.
      await query(
        `UPDATE document_versions
            SET status = 'official', designated_by_membership_id = $2, designated_at = now(),
                frozen_title = 'Corrected questionnaire', frozen_purpose = 'Preserved purpose'
          WHERE id = $1`,
        [VERSION, MEMBERSHIP],
      );
      for (const statement of [
        `UPDATE document_representations SET url = 'https://example.test/changed' WHERE version_id = $1`,
        `DELETE FROM document_representations WHERE version_id = $1`,
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url)
           SELECT workspace_id, company_id, id, 'https://example.test/appended'
             FROM document_versions WHERE id = $1`,
        `UPDATE document_versions SET frozen_title = 'Rewritten' WHERE id = $1`,
        `UPDATE document_versions
            SET status = 'draft', designated_by_membership_id = NULL, designated_at = NULL,
                frozen_title = NULL, frozen_purpose = NULL
          WHERE id = $1`,
        `DELETE FROM document_versions WHERE id = $1`,
      ])
        await expect(query(statement, [VERSION])).rejects.toMatchObject(frozen);
      await expect(
        query(`UPDATE document_versions SET number = 7 WHERE id = $1`, [
          VERSION,
        ]),
      ).rejects.toMatchObject({ code: RAISED });

      const insertVersion = (id: string, number: number) =>
        query(
          `INSERT INTO document_versions (id, workspace_id, company_id, document_id, number,
             created_by_membership_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, WORKSPACE, COMPANY, DOCUMENT, number, MEMBERSHIP],
        );
      await insertVersion(SECOND_VERSION, 2);
      // One draft and one official Version at most, numbered 1 to 50.
      await expect(
        insertVersion('00000000-0000-4000-8000-000000004013', 3),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        query(
          `UPDATE document_versions
              SET status = 'official', designated_by_membership_id = $2, designated_at = now(),
                  frozen_title = 'Second', frozen_purpose = 'Second'
            WHERE id = $1`,
          [SECOND_VERSION, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      // The single allowed change of a designated row: official -> superseded.
      await query(
        `UPDATE document_versions
            SET status = 'superseded', superseded_at = now(), superseded_by_version_id = $2
          WHERE id = $1`,
        [VERSION, SECOND_VERSION],
      );
      await query(
        `UPDATE document_versions
            SET status = 'official', designated_by_membership_id = $2, designated_at = now(),
                frozen_title = 'Second', frozen_purpose = 'Second'
          WHERE id = $1`,
        [SECOND_VERSION, MEMBERSHIP],
      );
      for (const statement of [
        `UPDATE document_versions SET superseded_at = now() + interval '1 day' WHERE id = $1`,
        `UPDATE document_versions
            SET status = 'official', superseded_at = NULL, superseded_by_version_id = NULL
          WHERE id = $1`,
        `DELETE FROM document_versions WHERE id = $1`,
      ])
        await expect(query(statement, [VERSION])).rejects.toMatchObject(frozen);
      await expect(
        query(
          `UPDATE document_versions
              SET status = 'superseded', superseded_at = now(),
                  superseded_by_version_id = $2, frozen_title = 'Rewritten'
            WHERE id = $1`,
          [SECOND_VERSION, VERSION],
        ),
      ).rejects.toMatchObject(frozen);
      await expect(
        query(
          `INSERT INTO document_versions (id, workspace_id, company_id, document_id, number,
             created_by_membership_id)
           VALUES ($1, $2, $3, $4, 51, $5)`,
          [THIRD_VERSION, WORKSPACE, COMPANY, DOCUMENT, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      // A new draft's reference may be inserted and corrected.
      await insertVersion(THIRD_VERSION, 3);
      await query(
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url)
         VALUES ($1, $2, $3, 'https://example.test/third')`,
        [WORKSPACE, COMPANY, THIRD_VERSION],
      );
      await query(
        `UPDATE document_representations SET url = 'https://example.test/third-corrected'
          WHERE version_id = $1`,
        [THIRD_VERSION],
      );

      // The Version command table is append-only and checked.
      await query(
        `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
           version_id, version_number, related_version_number, actor_membership_id,
           idempotency_key, request_fingerprint, expected_revision, revision)
         VALUES ($1, $2, $3, 'drafted', $4, 3, 2, $5, 'drafted-key', 'fingerprint', 2, 3)`,
        [WORKSPACE, COMPANY, DOCUMENT, THIRD_VERSION, MEMBERSHIP],
      );
      await expect(
        query(`UPDATE document_version_commands SET revision = 4`),
      ).rejects.toMatchObject({ code: RAISED });
      await expect(
        query(`DELETE FROM document_version_commands`),
      ).rejects.toMatchObject({ code: RAISED });
      await expect(
        query(
          `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
             version_id, version_number, related_version_number, actor_membership_id,
             idempotency_key, request_fingerprint, expected_revision, revision)
           VALUES ($1, $2, $3, 'archived', $4, 3, 2, $5, 'unknown-action', 'fingerprint', 3, 4)`,
          [WORKSPACE, COMPANY, DOCUMENT, THIRD_VERSION, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    } finally {
      if (previous) await rm(previous, { recursive: true, force: true });
      await database.close();
    }
  },
  60_000,
);
