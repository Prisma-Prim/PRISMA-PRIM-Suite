import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const ISSUE_DATE_MIGRATION = '_certification_certificate_issue_date';
const INSERT_CERTIFICATE = `INSERT INTO certification_certificates (id, workspace_id, company_id, case_id, case_revision, number, issued_on, approved_draft_version_id, valid_from, valid_until, first_surveillance_by, texts, independence_attested, attachment_id, actor_membership_id, actor_internal_user_id, actor_display_name, recorded_at) VALUES ($1,$2,$3,$4,21,$5,$6,$7,'2026-11-06','2029-11-05','2027-11-06','[]',$8,$9,$10,$11,'Fictional approver','2026-11-07T08:00:00Z')`;

withPostgres('Certificate release migrations', () => {
  it.each([
    [
      'an issue date and an approved draft',
      { issuedOn: null, approvedDraftVersionId: null, attested: true },
    ],
    [
      'the independence attestation',
      {
        issuedOn: '2026-11-06',
        approvedDraftVersionId: randomUUID(),
        attested: false,
      },
    ],
  ] satisfies [string, Omit<CertificateShape, 'id' | 'number'>][])(
    'refuses a Certificate stored without %s and asks to recreate the development database',
    async (_name, shape) => {
      await withPreviousSchema('release1344_refused', async (database) => {
        const id = randomUUID();
        await insertCertificate(database, {
          ...shape,
          id,
          number: 'PRE-LAUNCH-1',
        });
        const applied = await appliedMigrations(database);
        const refusal = raisedError(
          await migrate(drizzle(database.targetPool), {
            migrationsFolder: resolve('drizzle'),
          }).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(refusal).toEqual({
          code: 'P0001',
          message:
            'certification_certificates holds a Certificate without an issue date, an approved draft or the independence attestation; the development database must be recreated.',
        });
        expect(await appliedMigrations(database)).toBe(applied);
        expect(await nullableColumns(database)).toEqual([
          'approved_draft_version_id',
          'issued_on',
        ]);
        expect(
          (
            await database.targetPool.query(
              'SELECT number FROM certification_certificates WHERE id=$1',
              [id],
            )
          ).rows,
        ).toEqual([{ number: 'PRE-LAUNCH-1' }]);
      });
    },
    60_000,
  );

  it('requires the issue date, approved draft and attestation on every Certificate and keeps release records immutable', async () => {
    await withPreviousSchema('release1344_upgrade', async (database) => {
      const id = randomUUID();
      const approvedDraftVersionId = randomUUID();
      await insertCertificate(database, {
        id,
        number: 'ISSUED-1',
        issuedOn: '2026-11-06',
        approvedDraftVersionId,
        attested: true,
      });
      const before = await database.targetPool.query(
        'SELECT * FROM certification_certificates WHERE id=$1',
        [id],
      );
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(
        (
          await database.targetPool.query(
            'SELECT * FROM certification_certificates WHERE id=$1',
            [id],
          )
        ).rows,
      ).toEqual(before.rows);
      expect(before.rows).toMatchObject([
        {
          number: 'ISSUED-1',
          approved_draft_version_id: approvedDraftVersionId,
          independence_attested: true,
        },
      ]);
      expect(await nullableColumns(database)).toEqual([]);
      for (const [shape, code] of [
        [{ issuedOn: null }, '23502'],
        [{ approvedDraftVersionId: null }, '23502'],
        [{ issuedOn: null, approvedDraftVersionId: null }, '23502'],
        [{ attested: false }, '23514'],
        [{ issuedOn: '2026-11-05' }, '23514'],
      ] satisfies [Partial<CertificateShape>, string][]) {
        const complete: CertificateShape = {
          id: randomUUID(),
          number: `REFUSED-${randomUUID()}`,
          issuedOn: '2026-11-06',
          approvedDraftVersionId: randomUUID(),
          attested: true,
        };
        await expect(
          insertCertificate(database, { ...complete, ...shape }),
        ).rejects.toMatchObject({ code });
      }
      await expect(
        database.targetPool.query(
          "UPDATE certification_certificates SET number='MUTATED' WHERE id=$1",
          [id],
        ),
      ).rejects.toBeDefined();
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
    });
  }, 60_000);
});

interface CertificateShape {
  id: string;
  number: string;
  issuedOn: string | null;
  approvedDraftVersionId: string | null;
  attested: boolean;
}

/**
 * Runs `test` on an isolated database migrated up to, but excluding, the
 * issue-date migration. The Case, attachment, actor and draft references do
 * not matter to these columns, so the database drops them instead of
 * building the records they point at.
 */
async function withPreviousSchema(
  namePrefix: string,
  test: (database: IsolatedPostgresTestDatabase) => Promise<void>,
) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix,
  });
  let previous: string | undefined;
  try {
    previous = await mkdtemp(join(tmpdir(), 'release1344-previous-'));
    const directory = resolve('drizzle');
    const journal = object(
      JSON.parse(
        await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
      ),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Journal entries required');
    const entries = journal.entries.map((entry: unknown) => object(entry));
    const index = entries.findIndex(
      (entry) =>
        typeof entry.tag === 'string' &&
        entry.tag.endsWith(ISSUE_DATE_MIGRATION),
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
    await migrate(drizzle(database.targetPool), { migrationsFolder: previous });
    await database.targetPool.query(
      'ALTER TABLE certification_certificates DROP CONSTRAINT certification_certificates_case_fk, DROP CONSTRAINT certification_certificates_attachment_fk, DROP CONSTRAINT certification_certificates_actor_fk, DROP CONSTRAINT certification_certificates_approved_draft_fk',
    );
    await test(database);
  } finally {
    await database.close();
    if (previous) await rm(previous, { recursive: true, force: true });
  }
}

function insertCertificate(
  database: IsolatedPostgresTestDatabase,
  shape: CertificateShape,
) {
  return database.targetPool.query(INSERT_CERTIFICATE, [
    shape.id,
    randomUUID(),
    randomUUID(),
    randomUUID(),
    shape.number,
    shape.issuedOn,
    shape.approvedDraftVersionId,
    shape.attested,
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ]);
}

async function appliedMigrations(database: IsolatedPostgresTestDatabase) {
  const result = await database.targetPool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations',
  );
  return result.rows[0]?.total;
}

async function nullableColumns(database: IsolatedPostgresTestDatabase) {
  const result = await database.targetPool.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='certification_certificates' AND column_name IN ('issued_on','approved_draft_version_id') AND is_nullable='YES' ORDER BY column_name",
  );
  return result.rows.map((row) => row.column_name);
}

/** The PostgreSQL error the migration raised, under the driver's wrapper. */
function raisedError(error: unknown): { code: unknown; message: unknown } {
  let current = error;
  while (current instanceof Error) {
    if ('code' in current && typeof current.code === 'string')
      return { code: current.code, message: current.message };
    current = current.cause;
  }
  throw new Error('Expected the migration to raise a PostgreSQL error.');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required');
  return Object.fromEntries(Object.entries(value));
}
