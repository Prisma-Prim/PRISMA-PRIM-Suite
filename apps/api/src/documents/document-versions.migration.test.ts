import { resolve } from 'node:path';
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
const DOCUMENT = '00000000-0000-4000-8000-000000004008';
const VERSION = '00000000-0000-4000-8000-000000004009';
const REFERENCE = '00000000-0000-4000-8000-000000004010';
const SECOND_VERSION = '00000000-0000-4000-8000-000000004011';
const THIRD_VERSION = '00000000-0000-4000-8000-000000004012';
const OFFICIAL_REFERENCE = '00000000-0000-4000-8000-000000004014';
const SUPERSEDED_REFERENCE = '00000000-0000-4000-8000-000000004015';
const DRAFT_REFERENCE = '00000000-0000-4000-8000-000000004016';
const CREATED_AT = '2026-09-01T10:00:00.000Z';
const OFFICIAL_CREATED_AT = '2026-09-02T10:00:00.000Z';
const DRAFT_CREATED_AT = '2026-09-03T10:00:00.000Z';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const RAISED = 'P0001';

it.skipIf(!databaseUrl)(
  'enforces the Version, bundle and frozen-row invariants on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'document_versions_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Versioned Documents')`,
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
         VALUES ($1, $2, 'Versioned Company', $3, $4, 'versioned-document-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'Versioned Client', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_company_relationships (workspace_id, client_account_id, company_id,
           created_by_internal_user_id, created_by_workspace_membership_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [WORKSPACE, CLIENT, COMPANY, USER, MEMBERSHIP],
      );
      // One corrected working Document with its draft Version 1 and reference.
      await query(
        `INSERT INTO working_documents (id, workspace_id, company_id, client_id,
           working_revision, title, purpose, created_by_membership_id,
           created_at, idempotency_key, request_fingerprint)
         VALUES ($1, $2, $3, $4, 2, 'Corrected questionnaire', 'Questionnaire purpose', $5,
           $6, 'versioned-document', 'versioned-fingerprint')`,
        [DOCUMENT, WORKSPACE, COMPANY, CLIENT, CREATOR, CREATED_AT],
      );
      await query(
        `INSERT INTO document_versions (id, workspace_id, company_id, document_id, number,
           created_by_membership_id, created_at)
         VALUES ($1, $2, $3, $4, 1, $5, $6)`,
        [VERSION, WORKSPACE, COMPANY, DOCUMENT, CREATOR, CREATED_AT],
      );
      await query(
        `INSERT INTO document_representations (id, workspace_id, company_id, version_id, url,
           added_by_membership_id)
         VALUES ($1, $2, $3, $4, 'https://example.test/questionnaire', $5)`,
        [REFERENCE, WORKSPACE, COMPANY, VERSION, CREATOR],
      );

      // The permission-set rule accepts Registrar v3 and Approver v1 only,
      // and fails closed.
      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      await insertAssignment('company_document_registrar', 'v3');
      await insertAssignment('company_document_approver', 'v1');
      await insertAssignment('company_commercial_intake', 'v3');
      for (const [bundle, version] of [
        ['company_document_approver', null],
        ['company_document_approver', 'v2'],
        ['company_document_approver', 'V1'],
        ['company_document_registrar', 'v4'],
        ['company_document_registrar', null],
        ['company_document_project_organizer', 'v2'],
        ['company_commercial_intake', 'v5'],
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
                frozen_title = 'Corrected questionnaire', frozen_purpose = 'Questionnaire purpose'
          WHERE id = $1`,
        [VERSION, MEMBERSHIP],
      );
      for (const statement of [
        `UPDATE document_representations SET url = 'https://example.test/changed' WHERE version_id = $1`,
        `DELETE FROM document_representations WHERE version_id = $1`,
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
             position, form, added_by_membership_id, appended_after_designation)
           SELECT workspace_id, company_id, id, 'https://example.test/appended',
             2, 'signed', created_by_membership_id, false
             FROM document_versions WHERE id = $1`,
        `UPDATE document_versions SET frozen_title = 'Rewritten' WHERE id = $1`,
        `UPDATE document_versions
            SET status = 'draft', designated_by_membership_id = NULL, designated_at = NULL,
                frozen_title = NULL, frozen_purpose = NULL
          WHERE id = $1`,
        `DELETE FROM document_versions WHERE id = $1`,
      ])
        await expect(query(statement, [VERSION])).rejects.toMatchObject(frozen);
      // The only designated-reference write allowed is an append to the
      // current official Version, explicitly marked after designation.
      await query(
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
           position, form, added_by_membership_id, appended_after_designation)
         VALUES ($1, $2, $3, 'https://example.test/signed', 2, 'signed', $4, true)`,
        [WORKSPACE, COMPANY, VERSION, MEMBERSHIP],
      );
      await expect(
        query(
          `UPDATE document_representations SET form = 'other'
            WHERE version_id = $1 AND appended_after_designation = true`,
          [VERSION],
        ),
      ).rejects.toMatchObject(frozen);
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
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
           added_by_membership_id)
         VALUES ($1, $2, $3, 'https://example.test/third', $4)`,
        [WORKSPACE, COMPANY, THIRD_VERSION, MEMBERSHIP],
      );
      await query(
        `UPDATE document_representations SET url = 'https://example.test/third-corrected'
          WHERE version_id = $1`,
        [THIRD_VERSION],
      );
      await query(
        `UPDATE document_representations
            SET removed_by_membership_id = $2, removed_at = now()
          WHERE version_id = $1`,
        [THIRD_VERSION, MEMBERSHIP],
      );
      await expect(
        query(`DELETE FROM document_representations WHERE version_id = $1`, [
          THIRD_VERSION,
        ]),
      ).rejects.toMatchObject({ code: RAISED });

      // The Version command table is append-only and checked.
      await query(
        `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
           version_id, version_number, related_version_number, actor_membership_id,
           idempotency_key, request_fingerprint, expected_revision, revision)
         VALUES ($1, $2, $3, 'drafted', $4, 3, 2, $5, 'drafted-key', 'fingerprint', 2, 3)`,
        [WORKSPACE, COMPANY, DOCUMENT, THIRD_VERSION, MEMBERSHIP],
      );
      await query(
        `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
           version_id, version_number, representation_id, representation_form,
           appended_after_designation, actor_membership_id, idempotency_key,
           request_fingerprint, expected_revision, revision)
         VALUES ($1, $2, $3, 'representation_added', $4, 1, $5, 'signed', true,
           $6, 'representation-added-key', 'representation-fingerprint', 3, 4)`,
        [WORKSPACE, COMPANY, DOCUMENT, VERSION, REFERENCE, MEMBERSHIP],
      );
      await query(
        `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
           version_id, version_number, representation_id, representation_form,
           appended_after_designation, actor_membership_id, idempotency_key,
           request_fingerprint, expected_revision, revision)
         VALUES ($1, $2, $3, 'representation_removed', $4, 3, $5, 'other', false,
           $6, 'representation-removed-key', 'removal-fingerprint', 4, 5)`,
        [WORKSPACE, COMPANY, DOCUMENT, THIRD_VERSION, REFERENCE, MEMBERSHIP],
      );
      await expect(
        query(
          `INSERT INTO document_version_commands (workspace_id, company_id, document_id, action,
             version_id, version_number, representation_id, representation_form,
             appended_after_designation, actor_membership_id, idempotency_key,
             request_fingerprint, expected_revision, revision)
           VALUES ($1, $2, $3, 'representation_removed', $4, 3, $5, 'other', true,
             $6, 'invalid-removal-key', 'invalid-removal-fingerprint', 5, 6)`,
          [WORKSPACE, COMPANY, DOCUMENT, THIRD_VERSION, REFERENCE, MEMBERSHIP],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
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
      await database.close();
    }
  },
  60_000,
);

it.skipIf(!databaseUrl)(
  'freezes official and superseded references and only soft-removes draft references on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'typed_refs_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Typed reference Workspace')`,
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
         VALUES ($1, $2, 'Typed Reference Company', $3, $4, 'typed-reference-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, 'Typed Reference Client', $3, $4)`,
        [CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_company_relationships (workspace_id, client_account_id, company_id,
           created_by_internal_user_id, created_by_workspace_membership_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [WORKSPACE, CLIENT, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO working_documents (id, workspace_id, company_id, client_id,
           working_revision, title, purpose, created_by_membership_id, created_at,
           idempotency_key, request_fingerprint)
         VALUES ($1, $2, $3, $4, 5, 'Versioned questionnaire', 'Reference proof', $5, $6,
           'typed-reference-document', 'typed-reference-fingerprint')`,
        [DOCUMENT, WORKSPACE, COMPANY, CLIENT, CREATOR, CREATED_AT],
      );

      const insertVersion = async ({
        id,
        number,
        creator,
        createdAt,
        referenceId,
        url,
      }: {
        id: string;
        number: number;
        creator: string;
        createdAt: string;
        referenceId: string;
        url: string;
      }) => {
        await query(
          `INSERT INTO document_versions (id, workspace_id, company_id, document_id, number,
             created_by_membership_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, WORKSPACE, COMPANY, DOCUMENT, number, creator, createdAt],
        );
        await query(
          `INSERT INTO document_representations (id, workspace_id, company_id, version_id, url,
             added_by_membership_id, added_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [referenceId, WORKSPACE, COMPANY, id, url, creator, createdAt],
        );
      };
      const designate = (id: string, title: string) =>
        query(
          `UPDATE document_versions
              SET status = 'official', designated_by_membership_id = $2,
                  designated_at = '2026-09-10T10:00:00.000Z', frozen_title = $3,
                  frozen_purpose = 'Reference proof'
            WHERE id = $1`,
          [id, MEMBERSHIP, title],
        );

      await insertVersion({
        id: VERSION,
        number: 1,
        creator: CREATOR,
        createdAt: CREATED_AT,
        referenceId: SUPERSEDED_REFERENCE,
        url: 'https://example.test/superseded',
      });
      await designate(VERSION, 'Version one');
      await insertVersion({
        id: SECOND_VERSION,
        number: 2,
        creator: MEMBERSHIP,
        createdAt: OFFICIAL_CREATED_AT,
        referenceId: OFFICIAL_REFERENCE,
        url: 'https://example.test/official',
      });
      await query(
        `UPDATE document_versions
            SET status = 'superseded', superseded_at = '2026-09-11T10:00:00.000Z',
                superseded_by_version_id = $2
          WHERE id = $1`,
        [VERSION, SECOND_VERSION],
      );
      await designate(SECOND_VERSION, 'Version two');
      await insertVersion({
        id: THIRD_VERSION,
        number: 3,
        creator: CREATOR,
        createdAt: DRAFT_CREATED_AT,
        referenceId: DRAFT_REFERENCE,
        url: 'https://example.test/draft',
      });

      const frozen = {
        code: RAISED,
        message: expect.stringMatching(/frozen/u),
      };
      for (const [statement, values] of [
        [
          `UPDATE document_representations SET url = 'https://example.test/changed'
            WHERE id = $1`,
          [OFFICIAL_REFERENCE],
        ],
        [
          `DELETE FROM document_representations WHERE id = $1`,
          [OFFICIAL_REFERENCE],
        ],
        [
          `UPDATE document_representations SET url = 'https://example.test/changed'
            WHERE id = $1`,
          [SUPERSEDED_REFERENCE],
        ],
        [
          `DELETE FROM document_representations WHERE id = $1`,
          [SUPERSEDED_REFERENCE],
        ],
        [
          `UPDATE document_representations
              SET version_id = $2, position = 2, appended_after_designation = true
            WHERE id = $1`,
          [DRAFT_REFERENCE, SECOND_VERSION],
        ],
        [
          `UPDATE document_representations
              SET version_id = $2, position = 2, appended_after_designation = true
            WHERE id = $1`,
          [DRAFT_REFERENCE, VERSION],
        ],
      ] as const)
        await expect(query(statement, [...values])).rejects.toMatchObject(
          frozen,
        );

      await query(
        `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
           position, form, added_by_membership_id, appended_after_designation)
         VALUES ($1, $2, $3, 'https://example.test/official-append', 2, 'signed', $4, true)`,
        [WORKSPACE, COMPANY, SECOND_VERSION, MEMBERSHIP],
      );
      await expect(
        query(
          `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
             position, form, added_by_membership_id, appended_after_designation)
           VALUES ($1, $2, $3, 'https://example.test/unmarked-official-append', 3, 'other', $4, false)`,
          [WORKSPACE, COMPANY, SECOND_VERSION, MEMBERSHIP],
        ),
      ).rejects.toMatchObject(frozen);
      await expect(
        query(
          `INSERT INTO document_representations (workspace_id, company_id, version_id, url,
             position, form, added_by_membership_id, appended_after_designation)
           VALUES ($1, $2, $3, 'https://example.test/superseded-append', 2, 'signed', $4, true)`,
          [WORKSPACE, COMPANY, VERSION, MEMBERSHIP],
        ),
      ).rejects.toMatchObject(frozen);
      await query(
        `UPDATE document_representations
            SET removed_by_membership_id = $2, removed_at = now()
          WHERE id = $1`,
        [DRAFT_REFERENCE, MEMBERSHIP],
      );
      await expect(
        query(`DELETE FROM document_representations WHERE id = $1`, [
          DRAFT_REFERENCE,
        ]),
      ).rejects.toMatchObject({ code: RAISED });
    } finally {
      await database.close();
    }
  },
  60_000,
);
