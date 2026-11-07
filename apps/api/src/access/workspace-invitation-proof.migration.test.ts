import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000011051';
const OTHER_WORKSPACE = '00000000-0000-4000-8000-000000011052';
const USER = '00000000-0000-4000-8000-000000011053';
const MEMBERSHIP = '00000000-0000-4000-8000-000000011054';
const OTHER_MEMBERSHIP = '00000000-0000-4000-8000-000000011055';
const INVITATION = '00000000-0000-4000-8000-000000011056';
const OTHER_INVITATION = '00000000-0000-4000-8000-000000011057';
const FOREIGN_KEY_VIOLATION = '23503';
// The Drizzle name of the proof's foreign key, as PostgreSQL stores it: cut to
// its 63-byte identifier limit.
const PROOF_FK =
  'workspace_invitation_proofs_invitation_id_workspace_invitations_id_fk'.slice(
    0,
    63,
  );

it.skipIf(!databaseUrl)(
  'backfills each invitation proof with its invitation Workspace and rejects a proof naming another Workspace (#1105)',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'invitation_proof_upgrade',
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
      const entries: unknown[] = journal.entries;
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
      // Located by name, so integration renumbering keeps this upgrade seam.
      const upgradeIndex = tags.findIndex((tag) =>
        tag.endsWith('_tenancy_composite_keys'),
      );
      expect(upgradeIndex).toBeGreaterThan(0);
      previous = await mkdtemp(join(tmpdir(), 'prisma-1105-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, upgradeIndex) }),
      );
      for (const tag of tags.slice(0, upgradeIndex))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Invited'), ($2, 'Other')`,
        [WORKSPACE, OTHER_WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'invitation-issuer', 'Ana Popescu', 'ana@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $4), ($3, $5, $4)`,
        [MEMBERSHIP, WORKSPACE, OTHER_MEMBERSHIP, USER, OTHER_WORKSPACE],
      );
      await query(
        `INSERT INTO workspace_invitations (id, workspace_id, issued_by_workspace_membership_id, email, expires_in_days, expires_at, sync_after)
         VALUES ($1, $2, $3, 'invited@example.test', 7, now() + interval '7 days', now()),
                ($4, $5, $6, 'other@example.test', 7, now() + interval '7 days', now())`,
        [
          INVITATION,
          WORKSPACE,
          MEMBERSHIP,
          OTHER_INVITATION,
          OTHER_WORKSPACE,
          OTHER_MEMBERSHIP,
        ],
      );
      await query(
        `INSERT INTO workspace_invitation_proofs (invitation_id, client_id, sealed_token)
         VALUES ($1, 'client_preserved', 'sealed-preserved')`,
        [INVITATION],
      );

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(
        (
          await query(
            'SELECT invitation_id, workspace_id, client_id, sealed_token FROM workspace_invitation_proofs',
          )
        ).rows,
      ).toEqual([
        {
          invitation_id: INVITATION,
          workspace_id: WORKSPACE,
          client_id: 'client_preserved',
          sealed_token: 'sealed-preserved',
        },
      ]);
      await expect(
        query(
          `INSERT INTO workspace_invitation_proofs (invitation_id, workspace_id, client_id, sealed_token)
           VALUES ($1, $2, 'client_crossed', 'sealed-crossed')`,
          [OTHER_INVITATION, WORKSPACE],
        ),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: PROOF_FK,
      });
      await query(
        `INSERT INTO workspace_invitation_proofs (invitation_id, workspace_id, client_id, sealed_token)
         VALUES ($1, $2, 'client_other', 'sealed-other')`,
        [OTHER_INVITATION, OTHER_WORKSPACE],
      );
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-1105-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
