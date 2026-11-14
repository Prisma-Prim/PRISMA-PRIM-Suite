import { resolve } from 'node:path';
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

it.skipIf(!databaseUrl)(
  'enforces the Pricing Snapshot, line, receipt and event invariants on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_snapshot_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Pricing snapshots')`,
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
         VALUES ($1, $2, 'Snapshot Company', $3, $4, 'snapshot-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO client_requests (id, workspace_id, company_id, original_text,
           captured_by_internal_user_id, captured_by_workspace_membership_id)
         VALUES ($1, $2, $3, 'Snapshot request', $4, $5)`,
        [REQUEST, WORKSPACE, COMPANY, USER, MEMBERSHIP],
      );
      await query(
        `INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title, next_action,
           responsible_internal_user_id, responsible_workspace_membership_id)
         VALUES ($1, $2, $3, $4, 'Snapshot Opportunity', 'Snapshot next action', $5, $6)`,
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
         VALUES ($1, $2, $3, 1, 'Snapshot rule', '2026-01-01T00:00:00Z',
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
    } finally {
      await database.close();
    }
  },
  60_000,
);

function without(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key),
  );
}
