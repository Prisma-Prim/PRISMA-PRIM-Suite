import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000011051';
const OTHER_WORKSPACE = '00000000-0000-4000-8000-000000011052';
const USER = '00000000-0000-4000-8000-000000011053';
const OTHER_MEMBERSHIP = '00000000-0000-4000-8000-000000011055';
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
  'rejects an invitation proof naming another Workspace on a database migrated from empty (#1105)',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'invitation_proof_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
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
         VALUES ($1, $2, $3)`,
        [OTHER_MEMBERSHIP, OTHER_WORKSPACE, USER],
      );
      await query(
        `INSERT INTO workspace_invitations (id, workspace_id, issued_by_workspace_membership_id, email, expires_in_days, expires_at, sync_after)
         VALUES ($1, $2, $3, 'other@example.test', 7, now() + interval '7 days', now())`,
        [OTHER_INVITATION, OTHER_WORKSPACE, OTHER_MEMBERSHIP],
      );

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
    }
  },
  60_000,
);
