import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000004180';
const USER = '00000000-0000-4000-8000-000000004181';
const MEMBERSHIP = '00000000-0000-4000-8000-000000004182';
const COMPANY = '00000000-0000-4000-8000-000000004183';
const REQUEST = '00000000-0000-4000-8000-000000004184';
const OPPORTUNITY = '00000000-0000-4000-8000-000000004185';
const DEFINITION = '00000000-0000-4000-8000-000000004186';
const OTHER_DEFINITION = '00000000-0000-4000-8000-000000004195';
const OFFERING = '00000000-0000-4000-8000-000000004187';
const RULE = '00000000-0000-4000-8000-000000004188';
const TARIFF = '00000000-0000-4000-8000-000000004189';
const SNAPSHOT = '00000000-0000-4000-8000-000000004190';
const SECOND_SNAPSHOT = '00000000-0000-4000-8000-000000004191';
const BAD_SNAPSHOT = '00000000-0000-4000-8000-000000004192';
const LINE = '00000000-0000-4000-8000-000000004193';
const BAD_LINE = '00000000-0000-4000-8000-000000004194';
const CALCULATED_AT = '2026-09-26T12:00:00.000Z';
const COMMITTED_AT = '2026-09-26T12:00:01.000Z';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const PRESERVED_ASSIGNMENTS: ReadonlyArray<
  readonly [bundle: string, version: string | null, revoked: boolean]
> = [
  ['company_context_access', null, false],
  ['company_director_client_access', 'v1', true],
  ['company_director_client_access', 'v2', false],
  ['company_document_registrar', 'v1', true],
  ['company_document_registrar', 'v2', true],
  ['company_document_registrar', 'v3', false],
  ['company_document_approver', 'v1', false],
  ['company_commercial_intake', 'v1', true],
  ['company_commercial_intake', 'v2', false],
  ['company_project_access', 'v1', true],
  ['company_project_access', 'v2', false],
  ['company_task_manager', 'v1', false],
  ['company_document_project_organizer', 'v1', false],
  ['company_service_catalogue', 'v1', false],
  ['company_pricing_configuration', 'v1', false],
  ['company_pricing_user', 'v1', false],
  ['company_commercial_activity_reader', 'v1', false],
];

const PRESERVED_TABLES: ReadonlyArray<
  readonly [table: string, addedColumns: readonly string[]]
> = [
  ['company_role_assignments', []],
  ['client_requests', []],
  ['opportunities', []],
  ['service_definitions', []],
  ['company_service_offerings', []],
  ['pricing_rule_versions', []],
  ['tariff_versions', []],
  ['pricing_configuration_commands', ['result_pricing_snapshot_id']],
  ['pricing_configuration_events', ['pricing_snapshot_id']],
  ['activity_log_events', []],
];

it.skipIf(!databaseUrl)(
  'adds immutable Pricing Snapshots after 0036 while preserving roles, activity schema and pricing history',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_snapshot_upgrade',
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
      const snapshotIndex = tags.findIndex((tag) =>
        tag.endsWith('_pricing_snapshots'),
      );
      expect(snapshotIndex).toBeGreaterThan(0);
      const previousTags = tags.slice(0, snapshotIndex);
      expect(previousTags.at(-1)).toBe('0036_official_document_versions');
      previous = await mkdtemp(join(tmpdir(), 'prisma-418-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, snapshotIndex),
        }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));

      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Preserved snapshots')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'snapshot-owner', 'Snapshot Owner', 'snapshot-owner@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
         VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Preserved Company', $3, $4, 'preserved-snapshot-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      for (const [bundle, version, revoked] of PRESERVED_ASSIGNMENTS)
        await query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version, revoked],
        );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text,
           captured_by_internal_user_id, captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Preserved request', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Preserved Opportunity', 'Preserved next action', $5, $6)`,
        [OPPORTUNITY, WORKSPACE, COMPANY, REQUEST, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO service_definitions (id, workspace_id, code, name,
           created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
         VALUES ($1, $2, 'SNAPSHOT', 'Snapshot service', $3, $4, $5)`,
        [DEFINITION, WORKSPACE, USER, MEMBERSHIP, COMPANY],
      );
      await query(
        `INSERT INTO service_definitions (id, workspace_id, code, name,
           created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
         VALUES ($1, $2, 'OTHER-SNAPSHOT', 'Other snapshot service', $3, $4, $5)`,
        [OTHER_DEFINITION, WORKSPACE, USER, MEMBERSHIP, COMPANY],
      );
      await query(
        `INSERT INTO company_service_offerings (id, workspace_id, company_id,
           service_definition_id, commercial_label, created_by_internal_user_id,
           created_by_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Snapshot offering', $5, $6)`,
        [OFFERING, WORKSPACE, COMPANY, DEFINITION, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
           effective_from, rule_shape, rounding_mode, rounding_scale, tax_application, provenance,
           created_by_internal_user_id, created_by_workspace_membership_id, created_at)
         VALUES ($1, $2, $3, 1, 'Preserved rule', '2026-01-01T00:00:00Z',
           'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE', 'ILLUSTRATIVE', $4, $5,
           '2026-01-01T00:00:00Z')`,
        [RULE, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
           unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from, provenance,
           created_by_internal_user_id, created_by_workspace_membership_id, created_at)
         VALUES ($1, $2, $3, $4, 1, 'illustrative-unit', '12.3450', 'EUR', '12.34',
           'Illustrative tax', '2026-01-01T00:00:00Z', 'ILLUSTRATIVE', $5, $6,
           '2026-01-01T00:00:00Z')`,
        [TARIFF, WORKSPACE, COMPANY, OFFERING, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
           actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
           result_pricing_rule_version_id, created_at)
         VALUES ($1, $2, $3, 'pricing_rule_version.publish', 'preserved-rule',
           'preserved-rule-fingerprint', 'PUBLISHED', $4, now())`,
        [WORKSPACE, COMPANY, MEMBERSHIP, RULE],
      );
      await query(
        `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
           actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
           result_tariff_version_id, created_at)
         VALUES ($1, $2, $3, 'tariff_version.publish', 'preserved-tariff',
           'preserved-tariff-fingerprint', 'PUBLISHED', $4, now())`,
        [WORKSPACE, COMPANY, MEMBERSHIP, TARIFF],
      );
      await query(
        `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
           pricing_rule_version_id, actor_internal_user_id, actor_workspace_membership_id,
           occurred_at, metadata)
         VALUES ($1, $2, 'pricing_rule_version.published', $3, $4, $5, now(), $6::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          RULE,
          USER,
          MEMBERSHIP,
          JSON.stringify({
            pricingRuleVersionId: RULE,
            versionNumber: 1,
            provenance: 'ILLUSTRATIVE',
          }),
        ],
      );
      await query(
        `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
           tariff_version_id, actor_internal_user_id, actor_workspace_membership_id,
           occurred_at, metadata)
         VALUES ($1, $2, 'tariff_version.published', $3, $4, $5, now(), $6::jsonb)`,
        [
          WORKSPACE,
          COMPANY,
          TARIFF,
          USER,
          MEMBERSHIP,
          JSON.stringify({
            tariffVersionId: TARIFF,
            offeringId: OFFERING,
            versionNumber: 1,
            provenance: 'ILLUSTRATIVE',
            currency: 'EUR',
          }),
        ],
      );

      const preserved = () =>
        Promise.all(
          PRESERVED_TABLES.map(
            async ([table, addedColumns]) =>
              (
                await query(
                  `SELECT (to_jsonb(preserved_row) - $1::text[])::text AS value
                     FROM ${table} AS preserved_row ORDER BY id`,
                  [addedColumns],
                )
              ).rows,
          ),
        );
      const activitySchema = () =>
        query(
          `SELECT column_name, data_type, udt_name, is_nullable
             FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'activity_log_events'
            ORDER BY ordinal_position`,
        );
      const before = await preserved();
      const activityBefore = (await activitySchema()).rows;
      expect(before[0]).toHaveLength(PRESERVED_ASSIGNMENTS.length);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(await preserved()).toEqual(before);
      expect((await activitySchema()).rows).toEqual(activityBefore);
      expect(
        (
          await query(
            `SELECT
               (SELECT count(*)::int FROM pricing_snapshots) AS snapshots,
               (SELECT count(*)::int FROM pricing_snapshot_lines) AS lines,
               (SELECT count(*)::int FROM company_role_assignments
                 WHERE bundle::text = 'company_document_registrar'
                   AND permission_set_version = 'v3' AND revoked_at IS NULL) AS registrars,
               (SELECT count(*)::int FROM company_role_assignments
                 WHERE bundle::text = 'company_document_approver'
                   AND permission_set_version = 'v1' AND revoked_at IS NULL) AS approvers`,
          )
        ).rows,
      ).toEqual([{ snapshots: 0, lines: 0, registrars: 1, approvers: 1 }]);

      const insertSnapshot = (
        id: string,
        overrides: {
          committedAt?: string;
          pricingRuleVersionNumber?: number;
          total?: string;
        } = {},
      ) =>
        query(
          `INSERT INTO pricing_snapshots (id, workspace_id, company_id, opportunity_id,
             client_request_id, pricing_rule_version_id, pricing_rule_version_number, rule_shape,
             rounding_mode, rounding_scale, tax_application, currency, subtotal, tax_total, total,
             calculated_by_internal_user_id, calculated_by_workspace_membership_id,
             calculated_at, committed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2,
             'PER_LINE', 'EUR', '308.63', '38.08', $8, $9, $10, $11, $12)`,
          [
            id,
            WORKSPACE,
            COMPANY,
            OPPORTUNITY,
            REQUEST,
            RULE,
            overrides.pricingRuleVersionNumber ?? 1,
            overrides.total ?? '346.71',
            USER,
            MEMBERSHIP,
            CALCULATED_AT,
            overrides.committedAt ?? COMMITTED_AT,
          ],
        );
      await insertSnapshot(SNAPSHOT);
      await insertSnapshot(SECOND_SNAPSHOT);
      for (const invalid of [
        { total: '346.72' },
        { committedAt: '2026-09-26T11:59:59.000Z' },
      ])
        await expect(
          insertSnapshot(BAD_SNAPSHOT, invalid),
        ).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_snapshots_trace_check',
        });
      await expect(
        insertSnapshot(BAD_SNAPSHOT, { pricingRuleVersionNumber: 2 }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'pricing_snapshots_rule_version_fk',
      });

      const insertLine = (
        snapshotId: string,
        id: string,
        overrides: {
          currency?: string;
          quantityInput?: string;
          serviceDefinitionId?: string;
          tariffVersionNumber?: number;
        } = {},
      ) =>
        query(
          `INSERT INTO pricing_snapshot_lines (id, workspace_id, company_id, snapshot_id,
             line_number, service_definition_id, service_code, service_name, offering_id,
             commercial_label, tariff_version_id, tariff_version_number, unit, unit_amount,
             currency, tax_rate_percent, tax_label, quantity, quantity_input, rule_shape,
             raw_line_amount, line_net, raw_line_tax, line_tax)
           VALUES ($1, $2, $3, $4, 1, $5, 'SNAPSHOT', 'Snapshot service', $6,
             'Snapshot offering', $7, $8, 'illustrative-unit', '12.3450', $9, '12.34',
             'Illustrative tax', '25.000', $10, 'UNIT_PRICE_TIMES_QUANTITY', '308.6250000',
             '308.63', '38.0849420', '38.08')`,
          [
            id,
            WORKSPACE,
            COMPANY,
            snapshotId,
            overrides.serviceDefinitionId ?? DEFINITION,
            OFFERING,
            TARIFF,
            overrides.tariffVersionNumber ?? 1,
            overrides.currency ?? 'EUR',
            overrides.quantityInput ?? '25',
          ],
        );
      await insertLine(SNAPSHOT, LINE);
      await expect(
        insertLine(SECOND_SNAPSHOT, BAD_LINE, { quantityInput: '26' }),
      ).rejects.toMatchObject({
        code: CHECK_VIOLATION,
        constraint: 'pricing_snapshot_lines_trace_check',
      });
      await expect(
        insertLine(SECOND_SNAPSHOT, BAD_LINE, { currency: 'USD' }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'pricing_snapshot_lines_snapshot_fk',
      });
      await expect(
        insertLine(SECOND_SNAPSHOT, BAD_LINE, { tariffVersionNumber: 2 }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'pricing_snapshot_lines_tariff_version_fk',
      });
      await expect(
        insertLine(SECOND_SNAPSHOT, BAD_LINE, {
          serviceDefinitionId: OTHER_DEFINITION,
        }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'pricing_snapshot_lines_offering_definition_fk',
      });

      await query(
        `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
           actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
           result_pricing_snapshot_id, created_at)
         VALUES ($1, $2, $3, 'pricing_snapshot.calculate', 'snapshot-created',
           'snapshot-fingerprint', 'CREATED', $4, $5)`,
        [WORKSPACE, COMPANY, MEMBERSHIP, SNAPSHOT, COMMITTED_AT],
      );
      await expect(
        query(
          `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
             actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
             result_pricing_snapshot_id, created_at)
           VALUES ($1, $2, $3, 'pricing_snapshot.calculate', 'snapshot-duplicate',
             'snapshot-fingerprint', 'CREATED', $4, $5)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, SNAPSHOT, COMMITTED_AT],
        ),
      ).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'pricing_configuration_commands_snapshot_unique',
      });

      const validMetadata = {
        pricingSnapshotId: SNAPSHOT,
        opportunityId: OPPORTUNITY,
        lineCount: 1,
        provenance: 'ILLUSTRATIVE',
        currency: 'EUR',
      };
      const insertEvent = (
        snapshotId: string,
        metadata: Record<string, unknown>,
      ) =>
        query(
          `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
             pricing_snapshot_id, actor_internal_user_id, actor_workspace_membership_id,
             occurred_at, metadata)
           VALUES ($1, $2, 'pricing_snapshot.created', $3, $4, $5, $6, $7::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            snapshotId,
            USER,
            MEMBERSHIP,
            COMMITTED_AT,
            JSON.stringify(metadata),
          ],
        );
      await insertEvent(SNAPSHOT, validMetadata);
      for (const rejected of [
        {},
        ...Object.keys(validMetadata).flatMap((key) => [
          without(validMetadata, key),
          { ...validMetadata, [key]: null },
        ]),
        { ...validMetadata, pricingSnapshotId: BAD_SNAPSHOT },
        { ...validMetadata, opportunityId: 1 },
        { ...validMetadata, lineCount: '1' },
        { ...validMetadata, lineCount: 0 },
        { ...validMetadata, provenance: 'REAL' },
        { ...validMetadata, currency: 'GBP' },
        { ...validMetadata, label: 'Sensitive label' },
        { ...validMetadata, amount: '346.71' },
        { ...validMetadata, quantity: '25' },
        { ...validMetadata, taxRatePercent: '12.34' },
      ])
        await expect(
          insertEvent(SECOND_SNAPSHOT, rejected),
        ).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_events_action_metadata_check',
        });
      await insertEvent(SECOND_SNAPSHOT, {
        ...validMetadata,
        pricingSnapshotId: SECOND_SNAPSHOT,
      });

      expect(
        (
          await query(
            `SELECT
               (SELECT count(*)::int FROM pricing_snapshots) AS snapshots,
               (SELECT count(*)::int FROM pricing_snapshot_lines) AS lines,
               (SELECT count(*)::int FROM pricing_configuration_commands
                 WHERE command = 'pricing_snapshot.calculate') AS receipts,
               (SELECT count(*)::int FROM pricing_configuration_events
                 WHERE action = 'pricing_snapshot.created') AS events`,
          )
        ).rows,
      ).toEqual([{ snapshots: 2, lines: 1, receipts: 1, events: 2 }]);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-418-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);

function without(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key),
  );
}
