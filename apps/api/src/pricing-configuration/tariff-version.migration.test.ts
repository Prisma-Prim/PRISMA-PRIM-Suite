import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000003960';
const USER = '00000000-0000-4000-8000-000000003961';
const MEMBERSHIP = '00000000-0000-4000-8000-000000003962';
const COMPANY = '00000000-0000-4000-8000-000000003963';
const OTHER_COMPANY = '00000000-0000-4000-8000-000000003964';
const DEFINITION = '00000000-0000-4000-8000-000000003965';
const OTHER_DEFINITION = '00000000-0000-4000-8000-000000003966';
const OFFERING = '00000000-0000-4000-8000-000000003967';
const SECOND_OFFERING = '00000000-0000-4000-8000-000000003968';
const OTHER_COMPANY_OFFERING = '00000000-0000-4000-8000-000000003969';
const RULE_V1 = '00000000-0000-4000-8000-000000003970';
const RULE_V2 = '00000000-0000-4000-8000-000000003971';
const TARIFF_V1 = '00000000-0000-4000-8000-000000003972';
const TARIFF_V2 = '00000000-0000-4000-8000-000000003973';
const SECOND_OFFERING_V1 = '00000000-0000-4000-8000-000000003974';
const MISSING_VERSION = '00000000-0000-4000-8000-000000003999';
const CHECK_VIOLATION = '23514';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';
const NUMERIC_OUT_OF_RANGE = '22003';

it.skipIf(!databaseUrl)(
  'enforces the Tariff Version, tariff event and tariff receipt invariants beside the Pricing Rule ones on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'tariff_version_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Tariff pricing')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'tariff-owner', 'Tariff Owner', 'tariff-owner@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      // One parameter per column: PostgreSQL deduces a single type for each
      // parameter, so the uuid id and the text key cannot share one.
      for (const [id, name, registrationKey] of [
        [COMPANY, 'Tariff Company', 'tariff-company'],
        [OTHER_COMPANY, 'Other Company', 'other-tariff-company'],
      ] as const)
        await query(
          `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
             created_by_workspace_membership_id, registration_idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, WORKSPACE, name, USER, MEMBERSHIP, registrationKey],
        );
      for (const [id, code, company] of [
        [DEFINITION, 'TARIFF', COMPANY],
        [OTHER_DEFINITION, 'OTHER', OTHER_COMPANY],
      ] as const)
        await query(
          `INSERT INTO service_definitions (id, workspace_id, code, name, created_by_internal_user_id,
             created_by_workspace_membership_id, created_in_company_id)
           VALUES ($1, $2, $3, 'Illustrative service', $4, $5, $6)`,
          [id, WORKSPACE, code, USER, MEMBERSHIP, company],
        );
      for (const [id, company, definition] of [
        [OFFERING, COMPANY, DEFINITION],
        [SECOND_OFFERING, COMPANY, OTHER_DEFINITION],
        [OTHER_COMPANY_OFFERING, OTHER_COMPANY, DEFINITION],
      ] as const)
        await query(
          `INSERT INTO company_service_offerings (id, workspace_id, company_id, service_definition_id,
             created_by_internal_user_id, created_by_workspace_membership_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, WORKSPACE, company, definition, USER, MEMBERSHIP],
        );
      // A Pricing Rule chain and the publishing receipt of its first version.
      const client = await database.targetPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
             effective_from, created_by_internal_user_id, created_by_workspace_membership_id,
             created_at, superseded_by_version_id, superseded_at, superseded_from)
           VALUES ($1, $2, $3, 1, 'Illustrative rule A', '2026-05-01T00:00:00Z', $4, $5,
             '2026-04-01T00:00:00Z', $6, '2026-04-02T00:00:00Z', '2026-06-01T00:00:00Z')`,
          [RULE_V1, WORKSPACE, COMPANY, USER, MEMBERSHIP, RULE_V2],
        );
        await client.query(
          `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
             effective_from, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1, $2, $3, 2, 'Illustrative rule B', '2026-06-01T00:00:00Z', $4, $5,
             '2026-04-02T00:00:00Z')`,
          [RULE_V2, WORKSPACE, COMPANY, USER, MEMBERSHIP],
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }
      await query(
        `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
           actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
           result_pricing_rule_version_id, created_at)
         VALUES ($1, $2, $3, 'pricing_rule_version.publish', 'rule-a', 'fingerprint',
           'PUBLISHED', $4, now())`,
        [WORKSPACE, COMPANY, MEMBERSHIP, RULE_V1],
      );

      // The Pricing Rule metadata cases #360 added fail beside the tariff ones.
      const insertRuleEvent = (metadata: Record<string, unknown>) =>
        query(
          `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
             pricing_rule_version_id, actor_internal_user_id, actor_workspace_membership_id,
             occurred_at, metadata)
           VALUES ($1, $2, 'pricing_rule_version.published', $3, $4, $5, now(), $6::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            RULE_V2,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      const validRuleMetadata = {
        pricingRuleVersionId: RULE_V2,
        versionNumber: 2,
        provenance: 'ILLUSTRATIVE',
      };
      for (const rejected of [
        { ...validRuleMetadata, label: 'Illustrative rule B' },
        { ...validRuleMetadata, pricingRuleVersionId: RULE_V1 },
        { ...validRuleMetadata, provenance: 'REAL' },
        {},
        ...Object.keys(validRuleMetadata).flatMap((key) => [
          without(validRuleMetadata, key),
          { ...validRuleMetadata, [key]: null },
        ]),
        { ...validRuleMetadata, pricingRuleVersionId: 2 },
        { ...validRuleMetadata, versionNumber: '2' },
        { ...validRuleMetadata, provenance: ['ILLUSTRATIVE'] },
        // Tariff keys never satisfy a rule event.
        {
          tariffVersionId: RULE_V2,
          offeringId: OFFERING,
          versionNumber: 2,
          provenance: 'ILLUSTRATIVE',
          currency: 'EUR',
        },
      ])
        await expect(insertRuleEvent(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_events_action_metadata_check',
        });

      const insertTariff = (
        id: string,
        overrides: Record<string, string | number | null> = {},
      ) => {
        const values: Record<string, string | number | null> = {
          company_id: COMPANY,
          offering_id: OFFERING,
          version_number: 1,
          unit: 'illustrative-unit',
          unit_amount: '12.5',
          currency: 'EUR',
          tax_rate_percent: '20',
          tax_label: 'Illustrative tax',
          effective_from: '2026-05-01T00:00:00Z',
          effective_to: null,
          provenance: 'ILLUSTRATIVE',
          ...overrides,
        };
        return query(
          `INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
             unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from, effective_to,
             provenance, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())`,
          [
            id,
            WORKSPACE,
            values.company_id,
            values.offering_id,
            values.version_number,
            values.unit,
            values.unit_amount,
            values.currency,
            values.tax_rate_percent,
            values.tax_label,
            values.effective_from,
            values.effective_to,
            values.provenance,
            USER,
            MEMBERSHIP,
          ],
        );
      };
      // Content, decimals, currency, window, provenance and the version
      // number are enforced by the database itself.
      for (const [overrides, constraint] of [
        [{ version_number: 0 }, 'tariff_versions_version_number_check'],
        [{ unit: '' }, 'tariff_versions_unit_check'],
        [{ unit: '   ' }, 'tariff_versions_unit_check'],
        [{ unit: 'x'.repeat(25) }, 'tariff_versions_unit_check'],
        [{ tax_label: '' }, 'tariff_versions_tax_label_check'],
        [{ tax_label: ' ' }, 'tariff_versions_tax_label_check'],
        [{ tax_label: 'x'.repeat(61) }, 'tariff_versions_tax_label_check'],
        [{ unit_amount: '0' }, 'tariff_versions_unit_amount_check'],
        [{ unit_amount: '-1' }, 'tariff_versions_unit_amount_check'],
        [
          { tax_rate_percent: '-0.01' },
          'tariff_versions_tax_rate_percent_check',
        ],
        [
          { tax_rate_percent: '100.01' },
          'tariff_versions_tax_rate_percent_check',
        ],
        [{ currency: 'eur' }, 'tariff_versions_currency_check'],
        [{ currency: 'GBP' }, 'tariff_versions_currency_check'],
        [
          { effective_to: '2026-05-01T00:00:00Z' },
          'tariff_versions_window_check',
        ],
        [{ provenance: 'REAL' }, 'tariff_versions_provenance_check'],
      ] as const)
        await expect(insertTariff(TARIFF_V1, overrides)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint,
        });
      // Beyond the declared precision the column itself refuses the value.
      const overflowing: ReadonlyArray<Record<string, string>> = [
        { unit_amount: '10000000' },
        { tax_rate_percent: '1000' },
      ];
      for (const overrides of overflowing)
        await expect(insertTariff(TARIFF_V1, overrides)).rejects.toMatchObject({
          code: NUMERIC_OUT_OF_RANGE,
        });
      // The offering belongs to the version's own Workspace and Company.
      await expect(
        insertTariff(TARIFF_V1, { offering_id: OTHER_COMPANY_OFFERING }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'tariff_versions_offering_fk',
      });
      await expect(
        insertTariff(TARIFF_V1, { offering_id: MISSING_VERSION }),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'tariff_versions_offering_fk',
      });

      await insertTariff(TARIFF_V1);
      expect(
        (
          await query(
            `SELECT unit_amount, tax_rate_percent, provenance FROM tariff_versions WHERE id = $1`,
            [TARIFF_V1],
          )
        ).rows,
      ).toEqual([
        {
          unit_amount: '12.5000',
          tax_rate_percent: '20.00',
          provenance: 'ILLUSTRATIVE',
        },
      ]);
      await expect(
        query("UPDATE tariff_versions SET provenance = 'REAL' WHERE id = $1", [
          TARIFF_V1,
        ]),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });

      // At most one head per offering, and one number per offering; another
      // offering of the same Company keeps its own head and numbers.
      await expect(
        insertTariff(TARIFF_V2, {
          version_number: 2,
          effective_from: '2026-06-01T00:00:00Z',
        }),
      ).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'tariff_versions_head_unique',
      });
      await insertTariff(SECOND_OFFERING_V1, { offering_id: SECOND_OFFERING });
      // Selection metadata is complete or absent, and only advances.
      for (const statement of [
        `UPDATE tariff_versions SET superseded_by_version_id = '${TARIFF_V2}' WHERE id = $1`,
        `UPDATE tariff_versions SET superseded_by_version_id = '${TARIFF_V2}',
           superseded_at = now(), superseded_from = '2026-05-01T00:00:00Z' WHERE id = $1`,
        `UPDATE tariff_versions SET superseded_by_version_id = id,
           superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z' WHERE id = $1`,
      ])
        await expect(query(statement, [TARIFF_V1])).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'tariff_versions_supersession_check',
        });

      // The takeover precedes its successor row inside one transaction; the
      // deferred successor key is verified at commit, and only a successor of
      // the same offering satisfies it.
      const successorClient = await database.targetPool.connect();
      try {
        for (const successor of [MISSING_VERSION, SECOND_OFFERING_V1]) {
          await successorClient.query('BEGIN');
          await successorClient.query(
            `UPDATE tariff_versions SET superseded_by_version_id = $2,
               superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z'
             WHERE id = $1`,
            [TARIFF_V1, successor],
          );
          await expect(successorClient.query('COMMIT')).rejects.toMatchObject({
            code: FOREIGN_KEY_VIOLATION,
            constraint: 'tariff_versions_successor_fk',
          });
        }
        await successorClient.query('BEGIN');
        await successorClient.query(
          `UPDATE tariff_versions SET superseded_by_version_id = $2,
             superseded_at = now(), superseded_from = '2026-06-01T00:00:00Z'
           WHERE id = $1`,
          [TARIFF_V1, TARIFF_V2],
        );
        await successorClient.query(
          `INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
             unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from,
             created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1, $2, $3, $4, 2, 'illustrative-unit', '13', 'USD', '0', 'Illustrative tax',
             '2026-06-01T00:00:00Z', $5, $6, now())`,
          [TARIFF_V2, WORKSPACE, COMPANY, OFFERING, USER, MEMBERSHIP],
        );
        await successorClient.query('COMMIT');
      } finally {
        successorClient.release();
      }
      // A version number is unique within its offering, even for a row that
      // is not a head.
      await expect(
        query(
          `INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
             unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from,
             created_by_internal_user_id, created_by_workspace_membership_id, created_at,
             superseded_by_version_id, superseded_at, superseded_from)
           VALUES ($1, $2, $3, $4, 2, 'illustrative-unit', '14', 'EUR', '0', 'Illustrative tax',
             '2026-07-01T00:00:00Z', $5, $6, now(), $7, now(), '2026-08-01T00:00:00Z')`,
          [
            MISSING_VERSION,
            WORKSPACE,
            COMPANY,
            OFFERING,
            USER,
            MEMBERSHIP,
            SECOND_OFFERING_V1,
          ],
        ),
      ).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'tariff_versions_number_unique',
      });
      expect(
        (
          await query(
            `SELECT offering_id, version_number, superseded_by_version_id, currency
               FROM tariff_versions ORDER BY offering_id, version_number`,
          )
        ).rows,
      ).toEqual([
        {
          offering_id: OFFERING,
          version_number: 1,
          superseded_by_version_id: TARIFF_V2,
          currency: 'EUR',
        },
        {
          offering_id: OFFERING,
          version_number: 2,
          superseded_by_version_id: null,
          currency: 'USD',
        },
        {
          offering_id: SECOND_OFFERING,
          version_number: 1,
          superseded_by_version_id: null,
          currency: 'EUR',
        },
      ]);

      // Tariff event metadata: exactly the identifiers, number, provenance
      // and currency, each required with its JSON type and matching the
      // event's own version reference.
      const insertTariffEvent = (
        metadata: Record<string, unknown>,
        references: {
          action?: string;
          tariffVersionId?: string | null;
          pricingRuleVersionId?: string | null;
        } = {},
      ) =>
        query(
          `INSERT INTO pricing_configuration_events (workspace_id, company_id, action,
             pricing_rule_version_id, tariff_version_id, actor_internal_user_id,
             actor_workspace_membership_id, occurred_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8::jsonb)`,
          [
            WORKSPACE,
            COMPANY,
            references.action ?? 'tariff_version.published',
            references.pricingRuleVersionId ?? null,
            references.tariffVersionId === undefined
              ? TARIFF_V2
              : references.tariffVersionId,
            USER,
            MEMBERSHIP,
            JSON.stringify(metadata),
          ],
        );
      const validMetadata = {
        tariffVersionId: TARIFF_V2,
        offeringId: OFFERING,
        versionNumber: 2,
        provenance: 'ILLUSTRATIVE',
        currency: 'USD',
      };
      const rejectedMetadata: ReadonlyArray<Record<string, unknown>> = [
        {},
        ...Object.keys(validMetadata).flatMap((key) => [
          without(validMetadata, key),
          { ...validMetadata, [key]: null },
        ]),
        { ...validMetadata, tariffVersionId: 2 },
        { ...validMetadata, tariffVersionId: [TARIFF_V2] },
        { ...validMetadata, offeringId: 3967 },
        { ...validMetadata, offeringId: { id: OFFERING } },
        { ...validMetadata, versionNumber: '2' },
        { ...validMetadata, versionNumber: true },
        { ...validMetadata, provenance: ['ILLUSTRATIVE'] },
        { ...validMetadata, currency: ['USD'] },
        { ...validMetadata, currency: 840 },
        { ...validMetadata, provenance: 'REAL' },
        { ...validMetadata, currency: 'usd' },
        { ...validMetadata, unitAmount: '13.0000' },
        { ...validMetadata, taxLabel: 'Illustrative tax' },
        { ...validMetadata, tariffVersionId: TARIFF_V1 },
        // Rule keys never satisfy a tariff event.
        {
          pricingRuleVersionId: TARIFF_V2,
          versionNumber: 2,
          provenance: 'ILLUSTRATIVE',
        },
      ];
      for (const rejected of rejectedMetadata)
        await expect(insertTariffEvent(rejected)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_events_action_metadata_check',
        });
      // Exactly one version reference, of the action's own kind. A second
      // reference of the other kind is refused by the reference check alone.
      await expect(
        insertTariffEvent(validMetadata, { pricingRuleVersionId: RULE_V2 }),
      ).rejects.toMatchObject({
        code: CHECK_VIOLATION,
        constraint: 'pricing_configuration_events_reference_check',
      });
      // A missing own reference or another action also fails the metadata
      // check, which PostgreSQL evaluates first by name; either refuses it.
      for (const references of [
        { tariffVersionId: null },
        { action: 'pricing_rule_version.published' },
      ])
        await expect(
          insertTariffEvent(validMetadata, references),
        ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      await expect(
        insertTariffEvent(
          { ...validMetadata, tariffVersionId: MISSING_VERSION },
          { tariffVersionId: MISSING_VERSION },
        ),
      ).rejects.toMatchObject({
        code: FOREIGN_KEY_VIOLATION,
        constraint: 'pricing_configuration_events_tariff_version_fk',
      });
      expect(
        (
          await query(
            `SELECT count(*)::int AS count FROM pricing_configuration_events
              WHERE action = 'tariff_version.published'`,
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      await insertTariffEvent(validMetadata);
      await expect(insertTariffEvent(validMetadata)).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'pricing_configuration_events_tariff_published_unique',
      });

      // One receipt namespace; one publishing receipt per tariff version and
      // exactly one result reference of the command's own kind.
      const insertReceipt = (
        key: string,
        outcome: string,
        references: {
          command?: string;
          tariffVersionId?: string | null;
          pricingRuleVersionId?: string | null;
        } = {},
      ) =>
        query(
          `INSERT INTO pricing_configuration_commands (workspace_id, company_id,
             actor_workspace_membership_id, command, idempotency_key, fingerprint, outcome,
             result_pricing_rule_version_id, result_tariff_version_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'fingerprint', $6, $7, $8, now())`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            references.command ?? 'tariff_version.publish',
            key,
            outcome,
            references.pricingRuleVersionId ?? null,
            references.tariffVersionId === undefined
              ? TARIFF_V2
              : references.tariffVersionId,
          ],
        );
      for (const references of [
        { tariffVersionId: null },
        { pricingRuleVersionId: RULE_V2 },
        { command: 'pricing_rule_version.publish' },
        {
          command: 'pricing_rule_version.publish',
          tariffVersionId: null,
          pricingRuleVersionId: null,
        },
      ])
        await expect(
          insertReceipt('invalid-reference', 'PUBLISHED', references),
        ).rejects.toMatchObject({
          code: CHECK_VIOLATION,
          constraint: 'pricing_configuration_commands_result_check',
        });
      await insertReceipt('tariff-published', 'PUBLISHED');
      await insertReceipt('tariff-unchanged-1', 'UNCHANGED');
      await insertReceipt('tariff-unchanged-2', 'UNCHANGED');
      await expect(
        insertReceipt('tariff-published-again', 'PUBLISHED'),
      ).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'pricing_configuration_commands_tariff_published_unique',
      });
      // A key already used by a rule publication cannot be reused.
      await expect(insertReceipt('rule-a', 'UNCHANGED')).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'pricing_configuration_commands_actor_key_unique',
      });
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
