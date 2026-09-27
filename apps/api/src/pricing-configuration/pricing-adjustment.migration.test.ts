import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000004580';
const USER = '00000000-0000-4000-8000-000000004581';
const MEMBERSHIP = '00000000-0000-4000-8000-000000004582';
const COMPANY = '00000000-0000-4000-8000-000000004583';
const REQUEST = '00000000-0000-4000-8000-000000004584';
const OPPORTUNITY = '00000000-0000-4000-8000-000000004585';
const DEFINITION = '00000000-0000-4000-8000-000000004586';
const OFFERING = '00000000-0000-4000-8000-000000004587';
const RULE = '00000000-0000-4000-8000-000000004588';
const TARIFF = '00000000-0000-4000-8000-000000004589';
const SNAPSHOT = '00000000-0000-4000-8000-000000004590';
const LINE = '00000000-0000-4000-8000-000000004591';
const ADJUSTMENT = '00000000-0000-4000-8000-000000004592';
const EVENT_SNAPSHOT = '00000000-0000-4000-8000-000000004597';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

it.skipIf(!databaseUrl)(
  'adds fixed net adjustments after 0039 without changing old snapshots, roles or events',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'adjustment_upgrade',
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
      const adjustmentIndex = tags.findIndex((tag) =>
        tag.endsWith('_pricing_adjustments'),
      );
      expect(adjustmentIndex).toBeGreaterThan(0);
      const previousTags = tags.slice(0, adjustmentIndex);
      expect(previousTags.at(-1)).toBe('0039_project_lifecycle');
      previous = await mkdtemp(join(tmpdir(), 'prisma-458-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, adjustmentIndex),
        }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));

      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(`
        INSERT INTO workspaces (id, name) VALUES ('${WORKSPACE}', 'Preserved adjustment proof');
        INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
          VALUES ('${USER}', 'deterministic-test', 'adjustment-owner', 'Adjustment Owner',
            'adjustment-owner@example.test');
        INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
          VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
        INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key)
          VALUES ('${COMPANY}', '${WORKSPACE}', 'Preserved Company', '${USER}', '${MEMBERSHIP}',
            'preserved-adjustment-company');
        INSERT INTO company_role_assignments (workspace_id, company_id,
          workspace_membership_id, bundle, permission_set_version)
          VALUES ('${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}', 'company_pricing_user', 'v1');
        INSERT INTO client_requests (id, workspace_id, company_id, original_text,
          captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${REQUEST}', '${WORKSPACE}', '${COMPANY}', 'Preserved request', '${USER}',
            '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${REQUEST}',
            'Preserved Opportunity', 'Preserved next action', '${USER}', '${MEMBERSHIP}');
        INSERT INTO service_definitions (id, workspace_id, code, name,
          created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
          VALUES ('${DEFINITION}', '${WORKSPACE}', 'ADJUSTMENT', 'Adjustment service', '${USER}',
            '${MEMBERSHIP}', '${COMPANY}');
        INSERT INTO company_service_offerings (id, workspace_id, company_id,
          service_definition_id, commercial_label, created_by_internal_user_id,
          created_by_workspace_membership_id)
          VALUES ('${OFFERING}', '${WORKSPACE}', '${COMPANY}', '${DEFINITION}',
            'Adjustment offering', '${USER}', '${MEMBERSHIP}');
        INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
          effective_from, rule_shape, rounding_mode, rounding_scale, tax_application, provenance,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${RULE}', '${WORKSPACE}', '${COMPANY}', 1, 'Preserved rule',
            '2026-01-01T00:00:00Z', 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE',
            'ILLUSTRATIVE', '${USER}', '${MEMBERSHIP}', '2026-01-01T00:00:00Z');
        INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
          unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from, provenance,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${TARIFF}', '${WORKSPACE}', '${COMPANY}', '${OFFERING}', 1,
            'illustrative-unit', '123.4500', 'EUR', '12.34', 'Illustrative tax',
            '2026-01-01T00:00:00Z', 'ILLUSTRATIVE', '${USER}', '${MEMBERSHIP}',
            '2026-01-01T00:00:00Z');
        INSERT INTO pricing_snapshots (id, workspace_id, company_id, opportunity_id,
          client_request_id, pricing_rule_version_id, pricing_rule_version_number, rule_shape,
          rounding_mode, rounding_scale, tax_application, currency, subtotal, tax_total, total,
          calculated_by_internal_user_id, calculated_by_workspace_membership_id,
          calculated_at, committed_at)
          VALUES ('${SNAPSHOT}', '${WORKSPACE}', '${COMPANY}', '${OPPORTUNITY}', '${REQUEST}',
            '${RULE}', 1, 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE', 'EUR',
            '308.63', '38.08', '346.71', '${USER}', '${MEMBERSHIP}',
            '2026-09-26T12:00:00Z', '2026-09-26T12:00:01Z');
        INSERT INTO pricing_snapshot_lines (id, workspace_id, company_id, snapshot_id,
          line_number, service_definition_id, service_code, service_name, offering_id,
          commercial_label, tariff_version_id, tariff_version_number, unit, unit_amount,
          currency, tax_rate_percent, tax_label, quantity, quantity_input, rule_shape,
          raw_line_amount, line_net, raw_line_tax, line_tax)
          VALUES ('${LINE}', '${WORKSPACE}', '${COMPANY}', '${SNAPSHOT}', 1, '${DEFINITION}',
            'ADJUSTMENT', 'Adjustment service', '${OFFERING}', 'Adjustment offering', '${TARIFF}',
            1, 'illustrative-unit', '123.4500', 'EUR', '12.34', 'Illustrative tax', '2.500',
            '2.5', 'UNIT_PRICE_TIMES_QUANTITY', '308.6250000', '308.63', '38.0849420', '38.08');
        INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
          pricing_snapshot_id, actor_internal_user_id, actor_workspace_membership_id,
          occurred_at, metadata)
          VALUES ('${WORKSPACE}', '${COMPANY}', 'pricing_snapshot.created', '${SNAPSHOT}',
            '${USER}', '${MEMBERSHIP}', '2026-09-26T12:00:01Z',
            '{"pricingSnapshotId":"${SNAPSHOT}","opportunityId":"${OPPORTUNITY}","lineCount":1,"provenance":"ILLUSTRATIVE","currency":"EUR"}'::jsonb);
      `);

      const preserved = () =>
        Promise.all(
          [
            'company_role_assignments',
            'pricing_snapshots',
            'pricing_snapshot_lines',
            'pricing_configuration_events',
          ].map(
            async (table) =>
              (
                await query(
                  `SELECT to_jsonb(row_value)::text AS value FROM ${table} row_value ORDER BY id`,
                )
              ).rows,
          ),
        );
      const before = await preserved();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(await preserved()).toEqual(before);
      expect(
        (
          await query(
            'SELECT count(*)::integer AS count FROM pricing_snapshot_adjustments',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      await query(
        `INSERT INTO company_role_assignments (workspace_id, company_id,
           workspace_membership_id, bundle, permission_set_version)
         VALUES ($1, $2, $3, 'company_pricing_adjustment', 'v1')`,
        [WORKSPACE, COMPANY, MEMBERSHIP],
      );
      for (const version of [null, 'v2'])
        await expect(
          query(
            `INSERT INTO company_role_assignments (workspace_id, company_id,
               workspace_membership_id, bundle, permission_set_version, revoked_at)
             VALUES ($1, $2, $3, 'company_pricing_adjustment', $4, now())`,
            [WORKSPACE, COMPANY, MEMBERSHIP, version],
          ),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      const insertAdjustment = (
        id: string,
        overrides: {
          lineId?: string;
          reason?: string;
          netReduction?: string;
        } = {},
      ) =>
        query(
          `INSERT INTO pricing_snapshot_adjustments (id, workspace_id, company_id, snapshot_id,
             snapshot_line_id, type, net_reduction, reason, original_line_net,
             original_raw_line_tax, original_line_tax, tax_rate_percent, adjusted_line_net,
             adjusted_raw_line_tax, adjusted_line_tax, tax_reduction,
             applied_by_internal_user_id, applied_by_workspace_membership_id, applied_at)
           VALUES ($1, $2, $3, $4, $5, 'FIXED_NET_DISCOUNT', $6, $7, '308.63',
             '38.0849420', '38.08', '12.34', '300.00', '37.0200000', '37.02', '1.06',
             $8, $9, '2026-09-26T12:00:00Z')`,
          [
            id,
            WORKSPACE,
            COMPANY,
            SNAPSHOT,
            overrides.lineId ?? LINE,
            overrides.netReduction ?? '8.63',
            overrides.reason ?? '  Exact preserved reason  ',
            USER,
            MEMBERSHIP,
          ],
        );
      await insertAdjustment(ADJUSTMENT);
      expect(
        (
          await query(
            `SELECT type, net_reduction, reason, original_line_net, original_line_tax,
                    adjusted_line_net, adjusted_line_tax, tax_reduction
               FROM pricing_snapshot_adjustments`,
          )
        ).rows,
      ).toEqual([
        {
          type: 'FIXED_NET_DISCOUNT',
          net_reduction: '8.63',
          reason: '  Exact preserved reason  ',
          original_line_net: '308.63',
          original_line_tax: '38.08',
          adjusted_line_net: '300.00',
          adjusted_line_tax: '37.02',
          tax_reduction: '1.06',
        },
      ]);
      await expect(
        insertAdjustment('00000000-0000-4000-8000-000000004593'),
      ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(
        insertAdjustment('00000000-0000-4000-8000-000000004594', {
          lineId: '00000000-0000-4000-8000-000000004599',
        }),
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await expect(
        insertAdjustment('00000000-0000-4000-8000-000000004595', {
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertAdjustment('00000000-0000-4000-8000-000000004596', {
          netReduction: '308.64',
        }),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      await query(
        `INSERT INTO pricing_snapshots (id, workspace_id, company_id, opportunity_id,
           client_request_id, original_client_account_id, pricing_rule_version_id,
           pricing_rule_version_number, rule_shape, rounding_mode, rounding_scale,
           tax_application, currency, subtotal, tax_total, total,
           calculated_by_internal_user_id, calculated_by_workspace_membership_id,
           calculated_at, committed_at, version, provenance)
         SELECT $1, workspace_id, company_id, opportunity_id, client_request_id,
           original_client_account_id, pricing_rule_version_id, pricing_rule_version_number,
           rule_shape, rounding_mode, rounding_scale, tax_application, currency, subtotal,
           tax_total, total, calculated_by_internal_user_id,
           calculated_by_workspace_membership_id, calculated_at, committed_at, version,
           provenance
         FROM pricing_snapshots
         WHERE id = $2`,
        [EVENT_SNAPSHOT, SNAPSHOT],
      );
      const insertEvent = (metadata: Record<string, unknown>) =>
        query(
          `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
             pricing_snapshot_id, actor_internal_user_id, actor_workspace_membership_id,
             occurred_at, metadata)
           VALUES ($1, $2, 'pricing_snapshot.created', $3, $4, $5, now(), $6::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            EVENT_SNAPSHOT,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      const eventMetadata = {
        pricingSnapshotId: EVENT_SNAPSHOT,
        opportunityId: OPPORTUNITY,
        lineCount: 1,
        adjustmentCount: 1,
        provenance: 'ILLUSTRATIVE',
        currency: 'EUR',
      };
      for (const adjustmentCount of [-1, 1.5, 21, '1'])
        await expect(
          insertEvent({ ...eventMetadata, adjustmentCount }),
        ).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_events_action_metadata_check',
        });
      await insertEvent(eventMetadata);
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-458-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
