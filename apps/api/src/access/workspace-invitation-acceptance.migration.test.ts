import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
it.skipIf(!databaseUrl)(
  'upgrades 0019 without fabricating admission or altering existing identities, suspended memberships, invitations or history',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'acceptance_upgrade',
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
      const entries: unknown[] = journal.entries.slice(0, 20);
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
      expect(tags.at(-1)).toBe('0019_workspace_session_revocation');
      previous = await mkdtemp(join(tmpdir(), 'prisma-163-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of tags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      await database.targetPool.query(`
      INSERT INTO workspaces (id, name) VALUES ('00000000-0000-4000-8000-000000000163', 'Preserved');
      INSERT INTO internal_users (id, external_provider, external_subject, display_name, email, status) VALUES
        ('00000000-0000-4000-8000-000000001631','clerk','existing','Preserved','existing@example.test','inactive');
      INSERT INTO workspace_memberships (id, workspace_id, internal_user_id, status) VALUES
        ('00000000-0000-4000-8000-000000001632','00000000-0000-4000-8000-000000000163','00000000-0000-4000-8000-000000001631','inactive');
      INSERT INTO workspace_permission_grants (workspace_id, workspace_membership_id, permission) VALUES
        ('00000000-0000-4000-8000-000000000163','00000000-0000-4000-8000-000000001632','member.invite');
      INSERT INTO workspace_invitations (id,workspace_id,issued_by_workspace_membership_id,email,expires_in_days,expires_at,delivery_status,provider_id,sync_after) VALUES
        ('00000000-0000-4000-8000-000000001633','00000000-0000-4000-8000-000000000163','00000000-0000-4000-8000-000000001632','recipient@example.test',1,now()+interval '1 day','accepted','inv_existing',now());
      INSERT INTO activity_log_events (workspace_id,actor_internal_user_id,actor_workspace_membership_id,action,target_type,target_workspace_invitation_id,idempotency_key,metadata) VALUES
        ('00000000-0000-4000-8000-000000000163','00000000-0000-4000-8000-000000001631','00000000-0000-4000-8000-000000001632','workspace_invitation.issued','workspace_invitation','00000000-0000-4000-8000-000000001633','preserved-history','{}'::jsonb);
    `);
      const preserved = [
        'workspaces',
        'internal_users',
        'workspace_memberships',
        'workspace_permission_grants',
        'workspace_invitations',
        'activity_log_events',
      ];
      const before = await Promise.all(
        preserved.map(
          async (table) =>
            (
              await database.targetPool.query(
                'SELECT * FROM ' + table + ' ORDER BY id',
              )
            ).rows,
        ),
      );
      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      const after = await Promise.all(
        preserved.map(
          async (table) =>
            (
              await database.targetPool.query(
                'SELECT * FROM ' + table + ' ORDER BY id',
              )
            ).rows,
        ),
      );
      expect(after).toEqual(before);
      expect(
        (
          await database.targetPool.query(
            'SELECT * FROM workspace_invitation_acceptances',
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await database.targetPool.query(
            'SELECT * FROM workspace_invitation_proofs',
          )
        ).rows,
      ).toEqual([]);
      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      expect(
        (
          await database.targetPool.query(
            'SELECT * FROM workspace_invitation_acceptances',
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-163-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
