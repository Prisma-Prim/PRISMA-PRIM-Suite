import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Working Evidence persisted cursor key migration',
  () => {
    it('backfills existing Companies, provisions new ones atomically, preserves keys on reapplication and enforces scope and immutability', async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
      const database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'cursor1185_upgrade',
      });
      const previous = await mkdtemp(join(tmpdir(), 'cursor1185-previous-'));
      try {
        const directory = resolve('drizzle');
        const raw: unknown = JSON.parse(
          await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
        );
        const journal = object(raw);
        if (!Array.isArray(journal.entries))
          throw new Error('Journal required.');
        const entries = journal.entries.map((entry: unknown) => object(entry));
        const index = entries.findIndex(
          (entry) =>
            typeof entry.tag === 'string' &&
            entry.tag.endsWith('_working_evidence_cursor_keys'),
        );
        expect(index).toBeGreaterThan(0);
        await mkdir(join(previous, 'meta'));
        await writeFile(
          join(previous, 'meta', '_journal.json'),
          JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
        );
        for (const entry of entries.slice(0, index)) {
          if (typeof entry.tag !== 'string') throw new Error('Tag required.');
          await cp(
            join(directory, entry.tag + '.sql'),
            join(previous, entry.tag + '.sql'),
          );
        }
        const connection = drizzle(database.targetPool);
        await migrate(connection, { migrationsFolder: previous });
        const workspace = randomUUID(),
          user = randomUUID(),
          member = randomUUID(),
          company = randomUUID();
        await database.targetPool.query(
          'INSERT INTO workspaces (id,name) VALUES ($1,$2)',
          [workspace, 'Fictional cursor predecessor'],
        );
        await database.targetPool.query(
          'INSERT INTO internal_users (id,external_provider,external_subject,display_name,email) VALUES ($1,$2,$3,$4,$5)',
          [
            user,
            'deterministic-test',
            'cursor1185',
            'Fictional member',
            'cursor@example.test',
          ],
        );
        await database.targetPool.query(
          'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
          [member, workspace, user],
        );
        const insert =
          'INSERT INTO companies (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)';
        await database.targetPool.query(insert, [
          company,
          workspace,
          'Existing fictional Company',
          user,
          member,
          randomUUID(),
        ]);
        const companies = async () =>
          (
            await database.targetPool.query(
              'SELECT * FROM companies ORDER BY id',
            )
          ).rows;
        const before = await companies();
        await migrate(connection, { migrationsFolder: directory });
        expect(await companies()).toEqual(before);
        const keys = async () =>
          (
            await database.targetPool.query<{
              workspace_id: string;
              company_id: string;
              key: string;
            }>('SELECT * FROM working_evidence_cursor_keys ORDER BY company_id')
          ).rows;
        const backfilled = await keys();
        expect(backfilled).toEqual([
          {
            workspace_id: workspace,
            company_id: company,
            key: expect.stringMatching(/^[a-f0-9-]{72}$/u),
          },
        ]);
        await migrate(connection, { migrationsFolder: directory });
        expect(await keys()).toEqual(backfilled);
        await expect(
          database.targetPool.query(
            "UPDATE working_evidence_cursor_keys SET key='changed'",
          ),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          database.targetPool.query('DELETE FROM working_evidence_cursor_keys'),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
          database.targetPool.query(
            'INSERT INTO working_evidence_cursor_keys (workspace_id,company_id) VALUES ($1,$2)',
            [randomUUID(), company],
          ),
        ).rejects.toMatchObject({ code: '23503' });
        const transaction = await database.targetPool.connect();
        try {
          await transaction.query('BEGIN');
          const rolledBack = randomUUID();
          await transaction.query(insert, [
            rolledBack,
            workspace,
            'Rolled back Company',
            user,
            member,
            randomUUID(),
          ]);
          const insertedKeys = await transaction.query<{ company_id: string }>(
            'SELECT company_id FROM working_evidence_cursor_keys',
          );
          expect(
            insertedKeys.rows.some((row) => row.company_id === rolledBack),
          ).toBe(true);
        } finally {
          try {
            await transaction.query('ROLLBACK');
          } finally {
            transaction.release();
          }
        }
        expect(await keys()).toEqual(backfilled);
        const fresh = randomUUID();
        await database.targetPool.query(insert, [
          fresh,
          workspace,
          'New fictional Company',
          user,
          member,
          randomUUID(),
        ]);
        expect(
          (await keys()).find((row) => row.company_id === fresh)?.key,
        ).toMatch(/^[a-f0-9-]{72}$/u);
      } finally {
        await database.close();
        await rm(previous, { recursive: true, force: true });
      }
    }, 60_000);
  },
);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required.');
  return Object.fromEntries(Object.entries(value));
}
