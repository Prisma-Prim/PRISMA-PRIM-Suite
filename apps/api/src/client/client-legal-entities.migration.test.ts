import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const MIGRATION_TAG = '0033_client_legal_entities';
const PREVIOUS_TAG = '0032_pricing_rule_versions';
const WORKSPACE = '00000000-0000-4000-8000-000000000393';
const OTHER_WORKSPACE = '00000000-0000-4000-8000-000000003939';
const USER = '00000000-0000-4000-8000-000000003931';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003932';
const OTHER_MEMBERSHIP = '00000000-0000-4000-8000-000000003938';
const COMPANY = '00000000-0000-4000-8000-000000003933';
const CLIENT = '00000000-0000-4000-8000-000000003934';
const SECOND_CLIENT = '00000000-0000-4000-8000-000000003935';
const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

it.skipIf(!databaseUrl)(
  'adds empty legal-entity storage and two Activity actions without changing existing Clients or events',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'legal_entities_upgrade',
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
      const tags = journal.entries.map((entry: unknown) => {
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
      // Everything before this slice's migration, wherever integration
      // places it; merged migrations are never renumbered.
      const index = tags.indexOf(MIGRATION_TAG);
      expect(index).toBeGreaterThan(0);
      expect(tags[index - 1]).toBe(PREVIOUS_TAG);
      const entries: unknown[] = journal.entries.slice(0, index);
      previous = await mkdtemp(join(tmpdir(), 'prisma-393-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of tags.slice(0, index))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved Clients'), ($2, 'Other Workspace')`,
        [WORKSPACE, OTHER_WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'legal-entity-director', 'Director', 'director@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $3, $4), ($2, $5, $4)`,
        [MEMBERSHIP, OTHER_MEMBERSHIP, WORKSPACE, USER, OTHER_WORKSPACE],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'PRISMA-PRIM', $3, $4, 'preserved-legal-entity-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_accounts (id, workspace_id, display_name, tax_id, version,
           created_by_internal_user_id, created_by_workspace_membership_id)
         VALUES ($1, $3, 'GRUP Demo SA', '1002600000001', 3, $4, $5),
                ($2, $3, 'Demo Logistic SRL', NULL, 1, $4, $5)`,
        [CLIENT, SECOND_CLIENT, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_company_relationships (workspace_id, client_account_id, company_id,
           created_by_internal_user_id, created_by_workspace_membership_id)
         VALUES ($1, $2, $3, $4, $5), ($1, $6, $3, $4, $5)`,
        [WORKSPACE, CLIENT, COMPANY, USER, MEMBERSHIP, SECOND_CLIENT],
      );
      await query(
        `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
           actor_workspace_membership_id, action, target_type, target_client_account_id,
           target_company_id, metadata, idempotency_key)
         VALUES ($1, $2, $3, 'client.corrected', 'client_account', $4, $5,
           '{"changes":{"address":{"before":null,"after":"Str. Demo 1"}}}'::jsonb,
           'client.corrected:preserved')`,
        [WORKSPACE, USER, MEMBERSHIP, CLIENT, COMPANY],
      );
      const preserved = [
        'client_accounts',
        'client_company_relationships',
        'activity_log_events',
      ];
      const snapshot = () =>
        Promise.all(
          preserved.map(
            async (table) =>
              (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
          ),
        );
      const before = await snapshot();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(await snapshot()).toEqual(before);
      // Every existing Client starts with zero additional entities.
      expect(
        (
          await query(
            `SELECT client.id, count(entity.id)::integer AS entities
               FROM client_accounts AS client
               LEFT JOIN client_legal_entities AS entity
                 ON entity.workspace_id = client.workspace_id
                AND entity.client_account_id = client.id
              GROUP BY client.id ORDER BY client.id`,
          )
        ).rows,
      ).toEqual([
        { id: CLIENT, entities: 0 },
        { id: SECOND_CLIENT, entities: 0 },
      ]);
      expect(
        (await query('SELECT * FROM client_legal_entity_commands')).rows,
      ).toEqual([]);

      const insertEntity = (
        values: {
          workspace?: string;
          membership?: string;
          legalName?: string;
          taxId?: string | null;
        } = {},
      ) =>
        query(
          `INSERT INTO client_legal_entities (workspace_id, client_account_id, legal_name,
             tax_id, created_by_internal_user_id, created_by_workspace_membership_id)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            values.workspace ?? WORKSPACE,
            CLIENT,
            values.legalName ?? 'GRUP Demo SA — Sucursala Bălți',
            values.taxId === undefined ? '1002600000001' : values.taxId,
            USER,
            values.membership ?? MEMBERSHIP,
          ],
        );
      // Workspace-composite keys reject a creator membership or Client of
      // another Workspace; bounded non-empty values are enforced as well.
      await expect(
        insertEntity({ membership: OTHER_MEMBERSHIP }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await expect(
        insertEntity({
          workspace: OTHER_WORKSPACE,
          membership: OTHER_MEMBERSHIP,
        }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      for (const invalid of [
        { legalName: '' },
        { legalName: 'x'.repeat(201) },
        { taxId: '' },
        { taxId: 'x'.repeat(501) },
      ])
        await expect(insertEntity(invalid)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });
      const inserted = await insertEntity();
      const entityId: unknown = inserted.rows[0]?.id;

      const insertReceipt = (
        key: string,
        action: string,
        legalEntityId: unknown,
        client = CLIENT,
      ) =>
        query(
          `INSERT INTO client_legal_entity_commands (workspace_id, actor_workspace_membership_id,
             idempotency_key, action, client_account_id, company_id, legal_entity_id,
             expected_client_version, intent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 3, '{}'::jsonb)`,
          [WORKSPACE, MEMBERSHIP, key, action, client, COMPANY, legalEntityId],
        );
      await insertReceipt('register', 'register', null);
      await insertReceipt('correct', 'correct', entityId);
      await expect(
        insertReceipt('register-with-target', 'register', entityId),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertReceipt('correct-without-target', 'correct', null),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertReceipt('archive', 'archive', null),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      // A correction receipt cannot target an entity of another Client.
      await expect(
        insertReceipt(
          'other-client-target',
          'correct',
          entityId,
          SECOND_CLIENT,
        ),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });

      // Both new actions are recordable against the Client in a Company.
      await query(
        `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
           actor_workspace_membership_id, action, target_type, target_client_account_id,
           target_company_id, metadata, idempotency_key)
         VALUES ($1, $2, $3, 'client_legal_entity.registered', 'client_account', $4, $5, '{}'::jsonb, 'registered'),
                ($1, $2, $3, 'client_legal_entity.corrected', 'client_account', $4, $5, '{}'::jsonb, 'corrected')`,
        [WORKSPACE, USER, MEMBERSHIP, CLIENT, COMPANY],
      );

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-393-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
