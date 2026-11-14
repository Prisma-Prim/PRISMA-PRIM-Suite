import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Certificate independence attestation migration', () => {
  it('reads every existing Certificate as not attested and requires the attestation on new ones', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1198_upgrade',
    });
    let previous: string | undefined;
    let through: string | undefined;
    try {
      previous = await mkdtemp(join(tmpdir(), 'certification1198-previous-'));
      through = await mkdtemp(join(tmpdir(), 'certification1198-through-'));
      const directory = resolve('drizzle');
      const journal = record(
        JSON.parse(
          await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
        ),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries = journal.entries.map((entry: unknown) => {
        const value = record(entry);
        if (typeof value.tag !== 'string')
          throw new Error('Invalid migration tag.');
        return { ...value, tag: value.tag };
      });
      const index = entries.findIndex((entry) =>
        entry.tag.endsWith('_certification_certificate_attestation'),
      );
      expect(index).toBeGreaterThan(0);
      // Later migrations refuse a Certificate without an issue date, so the
      // upgrade stops at the migration under test.
      for (const [folder, kept] of [
        [previous, entries.slice(0, index)],
        [through, entries.slice(0, index + 1)],
      ] as const) {
        await mkdir(join(folder, 'meta'));
        await writeFile(
          join(folder, 'meta', '_journal.json'),
          JSON.stringify({ ...journal, entries: kept }),
        );
        for (const entry of kept)
          await cp(
            join(directory, `${entry.tag}.sql`),
            join(folder, `${entry.tag}.sql`),
          );
      }
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      // A Certificate recorded before the attestation was stored. Its Case,
      // attachment and recording member do not matter to this column, so
      // this isolated database drops the references instead of building them.
      await database.targetPool.query(
        'ALTER TABLE certification_certificates DROP CONSTRAINT certification_certificates_case_fk, DROP CONSTRAINT certification_certificates_attachment_fk, DROP CONSTRAINT certification_certificates_actor_fk',
      );
      const certificate = (number: string) => [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        number,
        randomUUID(),
        randomUUID(),
        randomUUID(),
      ];
      const insert = `INSERT INTO certification_certificates
        (workspace_id, company_id, case_id, case_revision, number, valid_from, valid_until, first_surveillance_by, texts, attachment_id, actor_membership_id, actor_internal_user_id, actor_display_name, recorded_at)
        VALUES ($1, $2, $3, 23, $4, '2026-11-06', '2029-11-05', '2027-11-06', '[]'::jsonb, $5, $6, $7, 'Synthetic approver', now())`;
      await database.targetPool.query(insert, certificate('DEMO-OLD-0001'));
      await migrate(connection, { migrationsFolder: through });
      const existing = await database.targetPool.query(
        'SELECT number, independence_attested FROM certification_certificates',
      );
      expect(existing.rows).toEqual([
        { number: 'DEMO-OLD-0001', independence_attested: false },
      ]);
      await expect(
        database.targetPool.query(insert, certificate('DEMO-NEW-0001')),
      ).rejects.toMatchObject({ code: '23502' });
    } finally {
      try {
        await database.close();
      } finally {
        for (const folder of [previous, through])
          if (folder) await rm(folder, { recursive: true, force: true });
      }
    }
  }, 60000);
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected journal object.');
  return Object.fromEntries(Object.entries(value));
}
