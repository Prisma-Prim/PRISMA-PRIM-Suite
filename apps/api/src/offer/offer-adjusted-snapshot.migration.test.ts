import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

// Synthetic records only; nothing here is a real price, Offer or Client.
const databaseUrl = process.env.TEST_DATABASE_URL;
const MIGRATION_SUFFIX = '_offer_adjusted_snapshot';
const WORKSPACE = '00000000-0000-4000-8000-000000005590';
const USER = '00000000-0000-4000-8000-000000005591';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005592';
const COMPANY = '00000000-0000-4000-8000-000000005593';
const CLIENT = '00000000-0000-4000-8000-000000005594';
const REQUEST = '00000000-0000-4000-8000-000000005595';
const OPPORTUNITY = '00000000-0000-4000-8000-000000005596';
const DEFINITION = '00000000-0000-4000-8000-000000005597';
const OFFERING = '00000000-0000-4000-8000-000000005598';
const RULE = '00000000-0000-4000-8000-000000005599';
const TARIFF = '00000000-0000-4000-8000-000000005600';
const SNAPSHOT = '00000000-0000-4000-8000-000000005601';
const LINE = '00000000-0000-4000-8000-000000005602';
const OFFER = '00000000-0000-4000-8000-000000005603';
const VERSION = '00000000-0000-4000-8000-000000005604';
const RUN = '00000000-0000-4000-8000-000000005605';
const DECISION = '00000000-0000-4000-8000-000000005606';
const TRANSMISSION = '00000000-0000-4000-8000-000000005607';
const SUCCESSOR = '00000000-0000-4000-8000-000000005608';
const CREATED_AT = '2026-10-01T12:00:02.000Z';
const VALID_UNTIL = '2026-10-31T12:00:02.000Z';
const CHECKSUM = 'a'.repeat(64);
const PASSING = [
  'PRICING_SNAPSHOT_COHERENT',
  'CURRENCY_UNCHANGED',
  'VALIDITY_OPEN',
  'RECIPIENT_AVAILABLE',
  'RECIPIENT_IDENTITY_CURRENT',
  'RECIPIENT_TAX_ID_RECORDED',
  'PRICING_CLIENT_CONTEXT_COHERENT',
  'PROVISIONAL_MARKER_PRESENT',
].map((code) => ({ code, status: 'PASS' }));

it.skipIf(!databaseUrl)(
  'admits only Offer Template v2, rule set v2 and version-bound ruleSetVersion events while preserving delivered v1 evidence',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'offer_o8_upgrade',
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
      const index = tags.findIndex((tag) => tag.endsWith(MIGRATION_SUFFIX));
      expect(index).toBeGreaterThan(tags.indexOf('0062_contract_precontracts'));
      previous = await mkdtemp(join(tmpdir(), 'prisma-559-upgrade-'));
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
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(`
        INSERT INTO workspaces (id, name) VALUES ('${WORKSPACE}', 'Synthetic O8 upgrade');
        INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
          VALUES ('${USER}', 'deterministic-test', 'o8-upgrade', 'O8 Owner', 'o8@example.test');
        INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
          VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
        INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key)
          VALUES ('${COMPANY}', '${WORKSPACE}', 'Synthetic Issuer', '${USER}', '${MEMBERSHIP}', 'o8-company');
        INSERT INTO client_accounts (id, workspace_id, display_name, tax_id, address,
          created_by_internal_user_id, created_by_workspace_membership_id)
          VALUES ('${CLIENT}', '${WORKSPACE}', 'Synthetic Recipient', 'RO559', '1 Example Street',
            '${USER}', '${MEMBERSHIP}');
        INSERT INTO client_requests (id, workspace_id, company_id, client_account_id,
          original_text, captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${REQUEST}', '${WORKSPACE}', '${COMPANY}', '${CLIENT}', 'Synthetic request',
            '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${REQUEST}',
            'Synthetic Opportunity', 'Prepare Offer', '${USER}', '${MEMBERSHIP}');
        INSERT INTO service_definitions (id, workspace_id, code, name,
          created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
          VALUES ('${DEFINITION}', '${WORKSPACE}', 'OFFER-559', 'Synthetic service', '${USER}',
            '${MEMBERSHIP}', '${COMPANY}');
        INSERT INTO company_service_offerings (id, workspace_id, company_id,
          service_definition_id, commercial_label, created_by_internal_user_id,
          created_by_workspace_membership_id)
          VALUES ('${OFFERING}', '${WORKSPACE}', '${COMPANY}', '${DEFINITION}',
            'Synthetic offering', '${USER}', '${MEMBERSHIP}');
        INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
          effective_from, rule_shape, rounding_mode, rounding_scale, tax_application, provenance,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${RULE}', '${WORKSPACE}', '${COMPANY}', 1, 'Synthetic rule',
            '2026-01-01T00:00:00Z', 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE',
            'ILLUSTRATIVE', '${USER}', '${MEMBERSHIP}', '2026-01-01T00:00:00Z');
        INSERT INTO tariff_versions (id, workspace_id, company_id, offering_id, version_number,
          unit, unit_amount, currency, tax_rate_percent, tax_label, effective_from, provenance,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${TARIFF}', '${WORKSPACE}', '${COMPANY}', '${OFFERING}', 1,
            'illustrative-unit', '300.0000', 'EUR', '15.00', 'Illustrative tax',
            '2026-01-01T00:00:00Z', 'ILLUSTRATIVE', '${USER}', '${MEMBERSHIP}',
            '2026-01-01T00:00:00Z');
        INSERT INTO pricing_snapshots (id, workspace_id, company_id, opportunity_id,
          client_request_id, original_client_account_id, pricing_rule_version_id,
          pricing_rule_version_number, rule_shape, rounding_mode, rounding_scale, tax_application,
          currency, subtotal, tax_total, total, calculated_by_internal_user_id,
          calculated_by_workspace_membership_id, calculated_at, committed_at)
          VALUES ('${SNAPSHOT}', '${WORKSPACE}', '${COMPANY}', '${OPPORTUNITY}', '${REQUEST}',
            '${CLIENT}', '${RULE}', 1, 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE',
            'EUR', '300.00', '45.00', '345.00', '${USER}', '${MEMBERSHIP}',
            '2026-10-01T12:00:00Z', '2026-10-01T12:00:01Z');
        INSERT INTO pricing_snapshot_lines (id, workspace_id, company_id, snapshot_id,
          line_number, service_definition_id, service_code, service_name, offering_id,
          commercial_label, tariff_version_id, tariff_version_number, unit, unit_amount,
          currency, tax_rate_percent, tax_label, quantity, quantity_input, rule_shape,
          raw_line_amount, line_net, raw_line_tax, line_tax)
          VALUES ('${LINE}', '${WORKSPACE}', '${COMPANY}', '${SNAPSHOT}', 1, '${DEFINITION}',
            'OFFER-559', 'Synthetic service', '${OFFERING}', 'Synthetic offering', '${TARIFF}',
            1, 'illustrative-unit', '300.0000', 'EUR', '15.00', 'Illustrative tax', '1.000',
            '1', 'UNIT_PRICE_TIMES_QUANTITY', '300.0000000', '300.00', '45.0000000', '45.00');
        INSERT INTO offers (id, workspace_id, company_id, opportunity_id, client_request_id,
          original_client_account_id, illustrative_reference, revision,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${OFFER}', '${WORKSPACE}', '${COMPANY}', '${OPPORTUNITY}', '${REQUEST}',
            '${CLIENT}', 1, 3, '${USER}', '${MEMBERSHIP}', '${CREATED_AT}');
        INSERT INTO offer_versions (id, workspace_id, company_id, offer_id, opportunity_id,
          client_request_id, original_client_account_id, version_number, pricing_snapshot_id,
          recipient_client_account_id, recipient_kind, recipient_legal_name, recipient_tax_id,
          recipient_legal_address, issuing_company_label, validity_days, valid_until,
          template_code, template_version, created_by_internal_user_id,
          created_by_workspace_membership_id, created_at)
          VALUES ('${VERSION}', '${WORKSPACE}', '${COMPANY}', '${OFFER}', '${OPPORTUNITY}',
            '${REQUEST}', '${CLIENT}', 1, '${SNAPSHOT}', '${CLIENT}', 'PRIMARY',
            'Synthetic Recipient', 'RO559', '1 Example Street', 'Synthetic Issuer', 30,
            '${VALID_UNTIL}', 'OFFER_ILLUSTRATIVE', 1, '${USER}', '${MEMBERSHIP}', '${CREATED_AT}');
      `);
      await query(
        `INSERT INTO offer_quality_runs (id, workspace_id, company_id, offer_id, offer_version_id, actor_internal_user_id, actor_workspace_membership_id, evaluated_at, results)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          RUN,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          JSON.stringify(PASSING),
        ],
      );
      await query(
        `INSERT INTO offer_decisions (id, workspace_id, company_id, offer_id, offer_version_id, state, offer_revision, actor_internal_user_id, actor_workspace_membership_id, decided_at, quality_run_id, acknowledged_warning_codes, representation_sha256)
         VALUES ($1,$2,$3,$4,$5,'APPROVED',2,$6,$7,$8,$9,'[]',$10)`,
        [
          DECISION,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          RUN,
          CHECKSUM,
        ],
      );
      await query(
        `INSERT INTO offer_transmissions (id, workspace_id, company_id, offer_id, offer_version_id, offer_revision, actor_internal_user_id, actor_workspace_membership_id, transmitted_at, quality_run_id, acknowledged_warning_codes, representation_sha256)
         VALUES ($1,$2,$3,$4,$5,3,$6,$7,$8,$9,'[]',$10)`,
        [
          TRANSMISSION,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          RUN,
          CHECKSUM,
        ],
      );
      const insertEvent = (
        target: { id: string; versionNumber: number },
        action: string,
        metadata: Record<string, unknown>,
      ) =>
        query(
          `INSERT INTO offer_events (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            WORKSPACE,
            COMPANY,
            OFFER,
            target.id,
            USER,
            MEMBERSHIP,
            CREATED_AT,
            action,
            JSON.stringify({
              offerId: OFFER,
              offerVersionId: target.id,
              versionNumber: target.versionNumber,
              provenance: 'ILLUSTRATIVE',
              ...metadata,
            }),
          ],
        );
      const first = { id: VERSION, versionNumber: 1 };
      const second = { id: SUCCESSOR, versionNumber: 2 };
      const approved = (target: typeof first, ruleSetVersion: unknown) =>
        insertEvent(target, 'offer_version.approved', {
          outcome: 'APPROVED',
          ruleSetVersion,
          acknowledgedWarningCodes: [],
        });
      const transmitted = (target: typeof first, ruleSetVersion: unknown) =>
        insertEvent(target, 'offer_version.transmission_recorded', {
          channel: 'SIMULATED',
          ruleSetVersion,
          acknowledgedWarningCodes: [],
        });
      await approved(first, 1);
      await transmitted(first, 1);
      // Rule set v2 and Template v2 are refused before the O8 migration.
      await expect(transmitted(first, 2)).rejects.toMatchObject({
        code: '23514',
      });

      const evidence = () =>
        Promise.all(
          [
            'offers',
            'offer_versions',
            'offer_quality_runs',
            'offer_decisions',
            'offer_transmissions',
            'offer_events',
            'pricing_snapshots',
            'pricing_snapshot_lines',
          ].map(
            async (table) =>
              (
                await query(
                  `SELECT to_jsonb(row_value) AS value FROM ${table} row_value ORDER BY to_jsonb(row_value)::text`,
                )
              ).rows,
          ),
        );
      const before = await evidence();
      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      expect(await evidence()).toEqual(before);

      const insertVersion = (id: string, number: number, template: number) =>
        query(
          `INSERT INTO offer_versions (id, workspace_id, company_id, offer_id, opportunity_id,
             client_request_id, original_client_account_id, version_number, predecessor_version_id,
             pricing_snapshot_id, recipient_client_account_id, recipient_kind, recipient_legal_name,
             issuing_company_label, validity_days, valid_until, template_code, template_version,
             created_by_internal_user_id, created_by_workspace_membership_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$7,'PRIMARY','Synthetic Recipient',
             'Synthetic Issuer',30,$11,'OFFER_ILLUSTRATIVE',$12,$13,$14,$15)`,
          [
            id,
            WORKSPACE,
            COMPANY,
            OFFER,
            OPPORTUNITY,
            REQUEST,
            CLIENT,
            number,
            VERSION,
            SNAPSHOT,
            VALID_UNTIL,
            template,
            USER,
            MEMBERSHIP,
            CREATED_AT,
          ],
        );
      await expect(
        insertVersion('00000000-0000-4000-8000-000000005609', 2, 3),
      ).rejects.toMatchObject({ code: '23514' });
      await insertVersion(SUCCESSOR, 2, 2);
      const insertRun = (versionId: string, ruleSetVersion: number) =>
        query(
          `INSERT INTO offer_quality_runs (workspace_id, company_id, offer_id, offer_version_id, rule_set_version, actor_internal_user_id, actor_workspace_membership_id, evaluated_at, results)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            WORKSPACE,
            COMPANY,
            OFFER,
            versionId,
            ruleSetVersion,
            USER,
            MEMBERSHIP,
            CREATED_AT,
            JSON.stringify(PASSING),
          ],
        );
      await insertRun(SUCCESSOR, 2);
      await insertRun(VERSION, 1);
      for (const [versionId, ruleSetVersion] of [
        [VERSION, 2],
        [SUCCESSOR, 1],
        [SUCCESSOR, 3],
      ] as const)
        await expect(
          insertRun(versionId, ruleSetVersion),
        ).rejects.toMatchObject({ code: '23514' });
      // Events must name the rule set bound to their own version.
      for (const refused of [
        () => transmitted(first, 2),
        () => approved(first, 2),
        () => transmitted(second, 1),
        () => approved(second, 1),
      ])
        await expect(refused()).rejects.toMatchObject({ code: '23514' });
      await transmitted(second, 2);
      for (const invalid of [3, 0, '2.0', '2', null])
        await expect(transmitted(second, invalid)).rejects.toMatchObject({
          code: '23514',
        });
      for (const invalid of [3, '1.5', '2', null])
        await expect(approved(second, invalid)).rejects.toMatchObject({
          code: '23514',
        });
      await approved(second, 2);
      // Delivered v1 events stay valid under the binding the upgrade enforces.
      expect(
        (
          await query(
            `SELECT count(*)::int AS unbound FROM offer_events event
               JOIN offer_versions bound ON bound.id = event.offer_version_id
              WHERE event.metadata ? 'ruleSetVersion'
                AND event.metadata->>'ruleSetVersion' <> bound.template_version::text`,
          )
        ).rows,
      ).toEqual([{ unbound: 0 }]);
      expect(
        (
          await query(
            "SELECT action, metadata->'ruleSetVersion' AS version FROM offer_events WHERE metadata ? 'ruleSetVersion' ORDER BY action, metadata->>'ruleSetVersion'",
          )
        ).rows,
      ).toEqual([
        { action: 'offer_version.approved', version: 1 },
        { action: 'offer_version.approved', version: 2 },
        { action: 'offer_version.transmission_recorded', version: 1 },
        { action: 'offer_version.transmission_recorded', version: 2 },
      ]);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      expect(
        (
          await query(
            'SELECT id, template_version FROM offer_versions ORDER BY version_number',
          )
        ).rows,
      ).toEqual([
        { id: VERSION, template_version: 1 },
        { id: SUCCESSOR, template_version: 2 },
      ]);
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-559-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
