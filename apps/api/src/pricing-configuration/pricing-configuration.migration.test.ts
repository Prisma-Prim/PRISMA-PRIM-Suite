import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000003600';
const USER = '00000000-0000-4000-8000-000000003601';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003602';
const COMPANY = '00000000-0000-4000-8000-000000003603';
const FIRST_VERSION = '00000000-0000-4000-8000-000000003604';
const SECOND_VERSION = '00000000-0000-4000-8000-000000003605';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

// Every bundle and captured version delivered before this migration,
// including superseded versions kept as revoked history.
const PRESERVED_ASSIGNMENTS: ReadonlyArray<
  readonly [bundle: string, version: string | null, revoked: boolean]
> = [
  ['company_context_access', null, false],
  ['company_director_client_access', 'v1', true],
  ['company_director_client_access', 'v2', false],
  ['company_document_registrar', 'v1', true],
  ['company_document_registrar', 'v2', false],
  ['company_commercial_intake', 'v1', true],
  ['company_commercial_intake', 'v2', false],
  ['company_project_access', 'v1', true],
  ['company_project_access', 'v2', false],
  ['company_task_manager', 'v1', false],
  ['company_document_project_organizer', 'v1', false],
  ['company_service_catalogue', 'v1', false],
  ['company_commercial_activity_reader', 'v1', false],
];

it.skipIf(!databaseUrl)(
  'upgrades through 0032 preserving every captured bundle and enforcing the Pricing Rule Version invariants',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_rule_upgrade',
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
      const entries: unknown[] = journal.entries.slice(0, 32);
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
      expect(tags.at(-1)).toBe('0031_project_responsible');
      previous = await mkdtemp(join(tmpdir(), 'prisma-360-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries }),
      );
      for (const tag of tags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved access')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'pricing-owner', 'Pricing Owner', 'pricing-owner@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-pricing-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      for (const [bundle, version, revoked] of PRESERVED_ASSIGNMENTS)
        await query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version, revoked],
        );
      const preserved = [
        'company_role_assignments',
        'activity_log_events',
        'service_definitions',
        'company_service_offerings',
      ];
      const snapshot = () =>
        Promise.all(
          preserved.map(
            async (table) =>
              (await query('SELECT * FROM ' + table + ' ORDER BY id')).rows,
          ),
        );
      const before = await snapshot();
      expect(before[0]).toHaveLength(PRESERVED_ASSIGNMENTS.length);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      // Additive: no existing assignment gains, loses or changes a version,
      // and no backfill confers the new bundle.
      expect(await snapshot()).toEqual(before);
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM company_role_assignments
              WHERE bundle = 'company_pricing_configuration'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      for (const table of [
        'pricing_rule_versions',
        'pricing_configuration_commands',
        'pricing_configuration_events',
      ])
        expect((await query('SELECT * FROM ' + table)).rows).toEqual([]);

      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      // The rewritten constraint keeps every delivered bundle and version.
      for (const [bundle, version] of PRESERVED_ASSIGNMENTS)
        await insertAssignment(bundle, version);
      await insertAssignment('company_pricing_configuration', 'v1');
      for (const [bundle, version] of [
        ['company_pricing_configuration', null],
        ['company_pricing_configuration', 'v2'],
        ['company_pricing_configuration', 'V1'],
        ['company_service_catalogue', 'v2'],
        ['company_commercial_activity_reader', 'v2'],
        ['company_commercial_intake', 'v3'],
        ['company_project_access', 'v3'],
        ['company_director_client_access', null],
        ['company_document_registrar', 'v4'],
        ['company_task_manager', null],
        ['company_context_access', 'v1'],
      ] as const)
        await expect(insertAssignment(bundle, version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      const insertVersion = (
        id: string,
        versionNumber: number,
        overrides: Record<string, string | number> = {},
      ) => {
        const values = {
          label: 'Illustrative rule',
          effective_from: '2026-05-01T00:00:00Z',
          rule_shape: 'UNIT_PRICE_TIMES_QUANTITY',
          rounding_mode: 'HALF_UP',
          rounding_scale: 2,
          tax_application: 'PER_LINE',
          provenance: 'ILLUSTRATIVE',
          ...overrides,
        };
        return query(
          `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
             effective_from, effective_to, rule_shape, rounding_mode, rounding_scale, tax_application,
             provenance, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())`,
          [
            id,
            WORKSPACE,
            COMPANY,
            versionNumber,
            values.label,
            values.effective_from,
            'effective_to' in overrides ? overrides.effective_to : null,
            values.rule_shape,
            values.rounding_mode,
            values.rounding_scale,
            values.tax_application,
            values.provenance,
            USER,
            MEMBERSHIP,
          ],
        );
      };
      // Provenance, the fixed rule shape, the label, the window and the
      // version number are enforced by the database itself.
      const invalidContent: ReadonlyArray<Record<string, string | number>> = [
        { provenance: 'REAL' },
        { rule_shape: 'FLAT_FEE' },
        { rounding_mode: 'HALF_EVEN' },
        { rounding_scale: 4 },
        { tax_application: 'ON_TOTAL' },
        { label: '   ' },
        { label: 'x'.repeat(121) },
        { effective_to: '2026-05-01T00:00:00Z' },
      ];
      for (const overrides of invalidContent)
        await expect(
          insertVersion(FIRST_VERSION, 1, overrides),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(insertVersion(FIRST_VERSION, 0)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
      });
      await insertVersion(FIRST_VERSION, 1);
      await expect(
        query(
          "UPDATE pricing_rule_versions SET provenance = 'REAL' WHERE id = $1",
          [FIRST_VERSION],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // At most one head per Company, enforced by the partial unique index.
      await expect(
        insertVersion(SECOND_VERSION, 2, {
          effective_from: '2026-06-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'pricing_rule_versions_head_unique',
      });
      // Selection metadata is complete or absent, and only advances.
      for (const statement of [
        `UPDATE pricing_rule_versions SET superseded_by_version_id = '${SECOND_VERSION}' WHERE id = $1`,
        `UPDATE pricing_rule_versions SET superseded_by_version_id = '${SECOND_VERSION}',
           superseded_at = now(), superseded_from = '2026-05-01T00:00:00Z' WHERE id = $1`,
        `UPDATE pricing_rule_versions SET superseded_by_version_id = id,
           superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z' WHERE id = $1`,
      ])
        await expect(query(statement, [FIRST_VERSION])).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      // The takeover precedes its successor row inside one transaction; the
      // deferred successor key is verified at commit.
      const client = await database.targetPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE pricing_rule_versions SET superseded_by_version_id = $2,
             superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z'
           WHERE id = $1`,
          [FIRST_VERSION, '00000000-0000-4000-8000-000000003699'],
        );
        await expect(client.query('COMMIT')).rejects.toMatchObject({
          code: FOREIGN_KEY_VIOLATION,
        });
        await client.query('BEGIN');
        await client.query(
          `UPDATE pricing_rule_versions SET superseded_by_version_id = $2,
             superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z'
           WHERE id = $1`,
          [FIRST_VERSION, SECOND_VERSION],
        );
        await client.query(
          `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
             effective_from, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1, $2, $3, 2, 'Illustrative successor', '2026-06-01T00:00:00Z', $4, $5, now())`,
          [SECOND_VERSION, WORKSPACE, COMPANY, USER, MEMBERSHIP],
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      expect(
        (
          await query(
            `SELECT version_number, superseded_by_version_id, provenance, rule_shape,
                    rounding_mode, rounding_scale, tax_application
               FROM pricing_rule_versions ORDER BY version_number`,
          )
        ).rows,
      ).toEqual([
        {
          version_number: 1,
          superseded_by_version_id: SECOND_VERSION,
          provenance: 'ILLUSTRATIVE',
          rule_shape: 'UNIT_PRICE_TIMES_QUANTITY',
          rounding_mode: 'HALF_UP',
          rounding_scale: 2,
          tax_application: 'PER_LINE',
        },
        {
          version_number: 2,
          superseded_by_version_id: null,
          provenance: 'ILLUSTRATIVE',
          rule_shape: 'UNIT_PRICE_TIMES_QUANTITY',
          rounding_mode: 'HALF_UP',
          rounding_scale: 2,
          tax_application: 'PER_LINE',
        },
      ]);

      // Event metadata is limited to identifiers, the number and provenance,
      // and requires each of them with its JSON type. A missing key or an
      // explicit JSON null is rejected, never accepted as unknown.
      const insertEvent = (metadata: string) =>
        query(
          `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
             pricing_rule_version_id, actor_internal_user_id, actor_workspace_membership_id,
             occurred_at, metadata)
           VALUES ($1, $2, 'pricing_rule_version.published', $3, $4, $5, now(), $6::jsonb)`,
          [WORKSPACE, COMPANY, SECOND_VERSION, USER, MEMBERSHIP, metadata],
        );
      const validMetadata = {
        pricingRuleVersionId: SECOND_VERSION,
        versionNumber: 2,
        provenance: 'ILLUSTRATIVE',
      };
      const withoutKey = (key: string) =>
        Object.fromEntries(
          Object.entries(validMetadata).filter(([name]) => name !== key),
        );
      const rejectedMetadata: ReadonlyArray<Record<string, unknown>> = [
        { ...validMetadata, label: 'Illustrative successor' },
        { ...validMetadata, pricingRuleVersionId: FIRST_VERSION },
        { ...validMetadata, provenance: 'REAL' },
        {},
        ...Object.keys(validMetadata).flatMap((key) => [
          withoutKey(key),
          { ...validMetadata, [key]: null },
        ]),
        { ...validMetadata, pricingRuleVersionId: 2 },
        { ...validMetadata, pricingRuleVersionId: [SECOND_VERSION] },
        { ...validMetadata, versionNumber: '2' },
        { ...validMetadata, versionNumber: true },
        { ...validMetadata, provenance: ['ILLUSTRATIVE'] },
        { ...validMetadata, provenance: { value: 'ILLUSTRATIVE' } },
      ];
      for (const rejected of rejectedMetadata)
        await expect(
          insertEvent(JSON.stringify(rejected)),
        ).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_events_action_metadata_check',
        });
      expect(
        (
          await query(
            'SELECT count(*)::int AS count FROM pricing_configuration_events',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      const accepted = JSON.stringify(validMetadata);
      await insertEvent(accepted);
      await expect(insertEvent(accepted)).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
      });

      // One publishing receipt per version; no-op receipts may repeat it.
      const insertReceipt = (key: string, outcome: string) =>
        query(
          `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
             actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
             result_pricing_rule_version_id, created_at)
           VALUES ($1, $2, $3, 'pricing_rule_version.publish', $4, 'fingerprint', $5, $6, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, key, outcome, SECOND_VERSION],
        );
      await insertReceipt('published', 'PUBLISHED');
      await insertReceipt('unchanged-1', 'UNCHANGED');
      await insertReceipt('unchanged-2', 'UNCHANGED');
      await expect(
        insertReceipt('published-again', 'PUBLISHED'),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertReceipt('published', 'UNCHANGED'),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-360-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
