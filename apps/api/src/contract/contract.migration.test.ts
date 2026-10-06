import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
it.skipIf(!databaseUrl)(
  'upgrades main 0050 without changing evidence or granting Contract authority',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'contract_main_upgrade',
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
        throw new Error('Invalid migration journal');
      const tags = journal.entries.map((entry: unknown) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('tag' in entry) ||
          typeof entry.tag !== 'string' ||
          !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag)
        )
          throw new Error('Invalid migration tag');
        return entry.tag;
      });
      const index = tags.indexOf('0051_contract_first_version');
      expect(index).toBe(51);
      expect(tags[index - 1]?.startsWith('0050_')).toBe(true);
      previous = await mkdtemp(join(tmpdir(), 'prisma-c1-main-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, index),
        }),
      );
      for (const tag of tags.slice(0, index))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      await database.targetPool.query(`
   INSERT INTO workspaces(id,name) VALUES('00000000-0000-4000-8000-000000005220','Synthetic prior workspace');
   INSERT INTO internal_users(id,external_provider,external_subject,display_name,email) VALUES('00000000-0000-4000-8000-000000005221','deterministic-test','prior-owner','Prior owner','prior@example.test');
   INSERT INTO workspace_memberships(id,workspace_id,internal_user_id) VALUES('00000000-0000-4000-8000-000000005222','00000000-0000-4000-8000-000000005220','00000000-0000-4000-8000-000000005221');
   INSERT INTO companies(id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES('00000000-0000-4000-8000-000000005223','00000000-0000-4000-8000-000000005220','Synthetic prior Company','00000000-0000-4000-8000-000000005221','00000000-0000-4000-8000-000000005222','prior-company');
   INSERT INTO company_role_assignments(workspace_id,workspace_membership_id,company_id,bundle,permission_set_version) VALUES('00000000-0000-4000-8000-000000005220','00000000-0000-4000-8000-000000005222','00000000-0000-4000-8000-000000005223','company_offer_preparer','v1');
   INSERT INTO client_requests(id,workspace_id,company_id,original_text,captured_by_internal_user_id,captured_by_workspace_membership_id) VALUES('00000000-0000-4000-8000-000000005224','00000000-0000-4000-8000-000000005220','00000000-0000-4000-8000-000000005223','Exact prior Request evidence','00000000-0000-4000-8000-000000005221','00000000-0000-4000-8000-000000005222');
  `);
      const evidence = () =>
        database.targetPool.query<{ assignments: unknown; requests: unknown }>(
          `SELECT (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM company_role_assignments a) AS assignments,(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM client_requests r) AS requests`,
        );
      const before = await evidence();
      await migrate(connection, { migrationsFolder: 'drizzle' });
      expect((await evidence()).rows).toEqual(before.rows);
      const state = await database.targetPool.query<{
        contracts: string;
        grants: string;
      }>(
        `SELECT (SELECT count(*) FROM contracts)::text AS contracts,(SELECT count(*) FROM company_role_assignments WHERE bundle='company_contract_preparer')::text AS grants`,
      );
      expect(state.rows[0]).toEqual({ contracts: '0', grants: '0' });
    } finally {
      await database.close();
      if (previous) await removeMigrationFixture(previous);
    }
  },
  60000,
);
async function removeMigrationFixture(path: string) {
  if (
    dirname(path) !== resolve(tmpdir()) ||
    !basename(path).startsWith('prisma-c1-main-upgrade-')
  )
    throw new Error('Unexpected temporary migration directory');
  await rm(path, { recursive: true, force: true });
}
