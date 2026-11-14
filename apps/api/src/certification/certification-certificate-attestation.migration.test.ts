import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certificate independence attestation schema', () => {
  it('requires the attestation on every new Certificate on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1198_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      // The Case, attachment, recording member and approved draft do not
      // matter to this column, so this isolated database drops the
      // references instead of building them.
      await database.targetPool.query(
        'ALTER TABLE certification_certificates DROP CONSTRAINT certification_certificates_case_fk, DROP CONSTRAINT certification_certificates_attachment_fk, DROP CONSTRAINT certification_certificates_actor_fk, DROP CONSTRAINT certification_certificates_approved_draft_fk',
      );
      const certificate = (number: string) => [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        number,
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      const columns =
        'workspace_id, company_id, case_id, case_revision, number, issued_on, approved_draft_version_id, valid_from, valid_until, first_surveillance_by, texts, attachment_id, actor_membership_id, actor_internal_user_id, actor_display_name, recorded_at';
      const values =
        "$1, $2, $3, 23, $4, '2026-11-06', $5, '2026-11-06', '2029-11-05', '2027-11-06', '[]'::jsonb, $6, $7, $8, 'Synthetic approver', '2026-11-07T08:00:00Z'";
      await database.targetPool.query(
        `INSERT INTO certification_certificates (${columns}, independence_attested) VALUES (${values}, true)`,
        certificate('DEMO-ATTESTED-0001'),
      );
      await expect(
        database.targetPool.query(
          `INSERT INTO certification_certificates (${columns}) VALUES (${values})`,
          certificate('DEMO-UNATTESTED-0001'),
        ),
      ).rejects.toMatchObject({
        code: '23502',
        column: 'independence_attested',
      });
    } finally {
      await database.close();
    }
  }, 60_000);
});
