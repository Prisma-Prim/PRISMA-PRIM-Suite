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
withPostgres('Certificate release migration', () => {
  it('preserves earlier issuance without inventing an issue date or approval and keeps records immutable', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'release1294_upgrade',
    });
    let previous: string | undefined;
    try {
      previous = await mkdtemp(join(tmpdir(), 'release1294-previous-'));
      const directory = resolve('drizzle');
      const raw: unknown = JSON.parse(
        await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
      );
      const journal = object(raw);
      if (!Array.isArray(journal.entries))
        throw new Error('Journal entries required');
      const entries = journal.entries.map((entry: unknown) => object(entry));
      const index = entries.findIndex(
        (entry) =>
          typeof entry.tag === 'string' &&
          entry.tag.endsWith('_certification_release'),
      );
      expect(index).toBeGreaterThan(0);
      const old = entries.slice(0, index);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: old }),
      );
      for (const entry of old) {
        if (typeof entry.tag !== 'string') throw new Error('Tag required');
        await cp(
          join(directory, `${entry.tag}.sql`),
          join(previous, `${entry.tag}.sql`),
        );
      }
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      await database.targetPool.query(
        'ALTER TABLE certification_certificates DROP CONSTRAINT certification_certificates_case_fk, DROP CONSTRAINT certification_certificates_attachment_fk, DROP CONSTRAINT certification_certificates_actor_fk',
      );
      const id = randomUUID();
      await database.targetPool.query(
        `INSERT INTO certification_certificates (id, workspace_id, company_id, case_id, case_revision, number, valid_from, valid_until, first_surveillance_by, texts, independence_attested, attachment_id, actor_membership_id, actor_internal_user_id, actor_display_name, recorded_at) VALUES ($1,$2,$3,$4,21,'LEGACY-1','2026-11-06','2029-11-05','2027-11-06','[]',true,$5,$6,$7,'Fictional approver','2026-11-07T08:00:00Z')`,
        [
          id,
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
          randomUUID(),
        ],
      );
      await migrate(connection, { migrationsFolder: directory });
      const result = await database.targetPool.query(
        'SELECT number, issued_on, approved_draft_version_id, recorded_at FROM certification_certificates WHERE id=$1',
        [id],
      );
      expect(result.rows).toEqual([
        {
          number: 'LEGACY-1',
          issued_on: null,
          approved_draft_version_id: null,
          recorded_at: new Date('2026-11-07T08:00:00Z'),
        },
      ]);
      const empty = await database.targetPool.query(
        'SELECT count(*)::int AS total FROM certification_number_observations',
      );
      expect(empty.rows).toEqual([{ total: 0 }]);
      await database.targetPool.query(
        'ALTER TABLE certification_number_observations DROP CONSTRAINT certification_number_observations_case_fk',
      );
      await database.targetPool.query(
        `INSERT INTO certification_number_observations (workspace_id, company_id, case_id, case_revision, numbers, recorded_at) VALUES ($1,$2,$3,22,'[]',now())`,
        [randomUUID(), randomUUID(), randomUUID()],
      );
      await expect(
        database.targetPool.query(
          'UPDATE certification_number_observations SET numbers=\'["INVENTED"]\'',
        ),
      ).rejects.toBeDefined();
      await expect(
        database.targetPool.query(
          'DELETE FROM certification_number_observations',
        ),
      ).rejects.toBeDefined();
      await expect(
        database.targetPool.query(
          "UPDATE certification_certificates SET number='MUTATED' WHERE id=$1",
          [id],
        ),
      ).rejects.toBeDefined();
      const constraints = await database.targetPool.query<{
        definition: string;
      }>(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname IN ('certification_step_versions_step_check','certification_receipts_kind_check','certification_case_documents_role_check','certification_events_action_check','certification_certificates_release_check')",
      );
      const definitions = constraints.rows
        .map((row) => row.definition)
        .join('\n');
      for (const code of [
        'certificate_draft',
        'client_opinion',
        'certificate_draft_approval',
        'certificate_draft_recorded',
        'client_opinion_recorded',
        'certificate_draft_approved',
        'issued_on',
      ])
        expect(definitions).toContain(code);
    } finally {
      await database.close();
      if (previous) await rm(previous, { recursive: true, force: true });
    }
  }, 60_000);
});
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required');
  return Object.fromEntries(Object.entries(value));
}
