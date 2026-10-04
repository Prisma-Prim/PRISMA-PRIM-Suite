import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import { renderOfferRepresentation } from './offer-representation.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const MIGRATION_SUFFIX = '_offer_template_binding';
const WORKSPACE = '00000000-0000-4000-8000-000000005010';
const USER = '00000000-0000-4000-8000-000000005011';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005012';
const COMPANY = '00000000-0000-4000-8000-000000005013';
const CLIENT = '00000000-0000-4000-8000-000000005014';
const REQUEST = '00000000-0000-4000-8000-000000005015';
const OPPORTUNITY = '00000000-0000-4000-8000-000000005016';
const DEFINITION = '00000000-0000-4000-8000-000000005017';
const OFFERING = '00000000-0000-4000-8000-000000005018';
const RULE = '00000000-0000-4000-8000-000000005019';
const TARIFF = '00000000-0000-4000-8000-000000005020';
const SNAPSHOT = '00000000-0000-4000-8000-000000005021';
const LINE = '00000000-0000-4000-8000-000000005022';
const OFFER = '00000000-0000-4000-8000-000000005023';
const VERSION = '00000000-0000-4000-8000-000000005024';
const COMMAND = '00000000-0000-4000-8000-000000005025';
const OFFER_EVENT = '00000000-0000-4000-8000-000000005026';
const VERSION_EVENT = '00000000-0000-4000-8000-000000005027';
const CREATED_AT = '2026-09-26T12:00:02.000Z';
const VALID_UNTIL = '2026-10-26T12:00:02.000Z';
const GOLDEN_SHA256 =
  'e8e4cfa981e3ab5420f7674a061082914e7c31fdd85088b2e3d06d6db0a4aaaf';

it.skipIf(!databaseUrl)(
  'binds existing O1 Offer Versions to illustrative Template v1 without rewriting their history',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'offer_template_upgrade',
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
      const bindingIndex = tags.findIndex((tag) =>
        tag.endsWith(MIGRATION_SUFFIX),
      );
      expect(bindingIndex).toBeGreaterThan(
        tags.indexOf('0042_offer_first_version'),
      );
      const previousTags = tags.slice(0, bindingIndex);
      previous = await mkdtemp(join(tmpdir(), 'prisma-501-upgrade-'));
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, bindingIndex),
        }),
      );
      for (const tag of previousTags)
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));

      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(`
        INSERT INTO workspaces (id, name)
          VALUES ('${WORKSPACE}', 'Preserved Offer binding proof');
        INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
          VALUES ('${USER}', 'deterministic-test', 'offer-template-owner', 'Offer Owner',
            'offer-owner@example.test');
        INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
          VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
        INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key)
          VALUES ('${COMPANY}', '${WORKSPACE}', 'Preserved Issuer', '${USER}', '${MEMBERSHIP}',
            'preserved-offer-template-company');
        INSERT INTO client_accounts (id, workspace_id, display_name, tax_id, address,
          created_by_internal_user_id, created_by_workspace_membership_id)
          VALUES ('${CLIENT}', '${WORKSPACE}', 'Preserved Recipient & Co', 'RO501',
            '1 <Legacy> Street', '${USER}', '${MEMBERSHIP}');
        INSERT INTO client_requests (id, workspace_id, company_id, client_account_id,
          original_text, captured_by_internal_user_id, captured_by_workspace_membership_id)
          VALUES ('${REQUEST}', '${WORKSPACE}', '${COMPANY}', '${CLIENT}', 'Preserved request',
            '${USER}', '${MEMBERSHIP}');
        INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
          next_action, responsible_internal_user_id, responsible_workspace_membership_id)
          VALUES ('${OPPORTUNITY}', '${WORKSPACE}', '${COMPANY}', '${REQUEST}',
            'Preserved Opportunity', 'Prepare Offer', '${USER}', '${MEMBERSHIP}');
        INSERT INTO service_definitions (id, workspace_id, code, name,
          created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
          VALUES ('${DEFINITION}', '${WORKSPACE}', 'OFFER-501', 'Preserved <service>', '${USER}',
            '${MEMBERSHIP}', '${COMPANY}');
        INSERT INTO company_service_offerings (id, workspace_id, company_id,
          service_definition_id, commercial_label, created_by_internal_user_id,
          created_by_workspace_membership_id)
          VALUES ('${OFFERING}', '${WORKSPACE}', '${COMPANY}', '${DEFINITION}',
            'Preserved offering', '${USER}', '${MEMBERSHIP}');
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
          client_request_id, original_client_account_id, pricing_rule_version_id,
          pricing_rule_version_number, rule_shape, rounding_mode, rounding_scale, tax_application,
          currency, subtotal, tax_total, total, calculated_by_internal_user_id,
          calculated_by_workspace_membership_id, calculated_at, committed_at)
          VALUES ('${SNAPSHOT}', '${WORKSPACE}', '${COMPANY}', '${OPPORTUNITY}', '${REQUEST}',
            '${CLIENT}', '${RULE}', 1, 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP', 2, 'PER_LINE',
            'EUR', '308.63', '38.08', '346.71', '${USER}', '${MEMBERSHIP}',
            '2026-09-26T12:00:00Z', '2026-09-26T12:00:01Z');
        INSERT INTO pricing_snapshot_lines (id, workspace_id, company_id, snapshot_id,
          line_number, service_definition_id, service_code, service_name, offering_id,
          commercial_label, tariff_version_id, tariff_version_number, unit, unit_amount,
          currency, tax_rate_percent, tax_label, quantity, quantity_input, rule_shape,
          raw_line_amount, line_net, raw_line_tax, line_tax)
          VALUES ('${LINE}', '${WORKSPACE}', '${COMPANY}', '${SNAPSHOT}', 1, '${DEFINITION}',
            'OFFER-501', 'Preserved <service>', '${OFFERING}', 'Preserved offering', '${TARIFF}',
            1, 'illustrative-unit', '123.4500', 'EUR', '12.34', 'Illustrative tax', '2.500',
            '2.5', 'UNIT_PRICE_TIMES_QUANTITY', '308.6250000', '308.63', '38.0849420', '38.08');
        INSERT INTO offers (id, workspace_id, company_id, opportunity_id, client_request_id,
          original_client_account_id, illustrative_reference, revision,
          created_by_internal_user_id, created_by_workspace_membership_id, created_at)
          VALUES ('${OFFER}', '${WORKSPACE}', '${COMPANY}', '${OPPORTUNITY}', '${REQUEST}',
            '${CLIENT}', 501, 1, '${USER}', '${MEMBERSHIP}', '${CREATED_AT}');
        INSERT INTO offer_versions (id, workspace_id, company_id, offer_id, opportunity_id,
          client_request_id, original_client_account_id, version_number, pricing_snapshot_id,
          recipient_client_account_id, recipient_kind, recipient_legal_name, recipient_tax_id,
          recipient_legal_address, issuing_company_label, validity_days, valid_until, scope_note,
          commercial_conditions, created_by_internal_user_id,
          created_by_workspace_membership_id, created_at)
          VALUES ('${VERSION}', '${WORKSPACE}', '${COMPANY}', '${OFFER}', '${OPPORTUNITY}',
            '${REQUEST}', '${CLIENT}', 1, '${SNAPSHOT}', '${CLIENT}', 'PRIMARY',
            'Preserved Recipient & Co', 'RO501', '1 <Legacy> Street', 'Preserved Issuer', 30,
            '${VALID_UNTIL}', 'Preserved scope', 'Preserved conditions', '${USER}',
            '${MEMBERSHIP}', '${CREATED_AT}');
        INSERT INTO offer_reference_counters (workspace_id, company_id, current_reference)
          VALUES ('${WORKSPACE}', '${COMPANY}', 501);
        INSERT INTO offer_commands (id, workspace_id, company_id, actor_workspace_membership_id,
          idempotency_key, fingerprint, opportunity_id, result_offer_id, created_at)
          VALUES ('${COMMAND}', '${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}',
            'preserved-offer-command', 'preserved-offer-fingerprint', '${OPPORTUNITY}', '${OFFER}',
            '${CREATED_AT}');
        INSERT INTO offer_events (id, workspace_id, company_id, action, offer_id, offer_version_id,
          actor_internal_user_id, actor_workspace_membership_id, occurred_at, metadata)
          VALUES ('${OFFER_EVENT}', '${WORKSPACE}', '${COMPANY}', 'offer.created', '${OFFER}', NULL,
            '${USER}', '${MEMBERSHIP}', '${CREATED_AT}',
            '{"offerId":"${OFFER}","illustrativeReference":501,"provenance":"ILLUSTRATIVE"}'::jsonb),
            ('${VERSION_EVENT}', '${WORKSPACE}', '${COMPANY}', 'offer_version.created', '${OFFER}',
            '${VERSION}', '${USER}', '${MEMBERSHIP}', '${CREATED_AT}',
            '{"offerId":"${OFFER}","offerVersionId":"${VERSION}","versionNumber":1,"pricingSnapshotId":"${SNAPSHOT}","recipientKind":"PRIMARY","provenance":"ILLUSTRATIVE"}'::jsonb);
      `);

      const preserved = () =>
        Promise.all(
          [
            'offers',
            'offer_versions',
            'offer_reference_counters',
            'offer_commands',
            'offer_events',
            'activity_log_events',
          ].map(async (table) => {
            const omitted =
              table === 'offer_versions'
                ? " - ARRAY['template_code', 'template_version', 'predecessor_version_id', 'superseded_by_version_id', 'superseded_at']::text[]"
                : table === 'offer_commands'
                  ? " - ARRAY['kind', 'result_quality_run_id', 'result_decision_id', 'result_transmission_id', 'result_client_response_id', 'result_version_id', 'result_offer_revision']::text[]"
                  : '';
            return (
              await query(
                `SELECT to_jsonb(row_value)${omitted} AS value FROM ${table} row_value ORDER BY to_jsonb(row_value)::text`,
              )
            ).rows;
          }),
        );
      let before = await preserved();

      const negotiationIndex = tags.indexOf('0050_offer_version_negotiation');
      expect(negotiationIndex).toBeGreaterThan(bindingIndex);
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.slice(0, negotiationIndex),
        }),
      );
      for (const tag of tags.slice(bindingIndex, negotiationIndex))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      await migrate(connection, { migrationsFolder: previous });
      expect(await preserved()).toEqual(before);

      // Synthetic delivered O3–O6 evidence exists before the O7 upgrade.
      const quality = '00000000-0000-4000-8000-000000005030';
      const decision = '00000000-0000-4000-8000-000000005031';
      const transmission = '00000000-0000-4000-8000-000000005032';
      const response = '00000000-0000-4000-8000-000000005033';
      const results = [
        'PRICING_SNAPSHOT_COHERENT',
        'CURRENCY_UNCHANGED',
        'VALIDITY_OPEN',
        'RECIPIENT_AVAILABLE',
        'RECIPIENT_IDENTITY_CURRENT',
        'RECIPIENT_TAX_ID_RECORDED',
        'PRICING_CLIENT_CONTEXT_COHERENT',
        'PROVISIONAL_MARKER_PRESENT',
      ].map((code) => ({ code, status: 'PASS' }));
      await query(
        `INSERT INTO offer_quality_runs (id, workspace_id, company_id, offer_id, offer_version_id, actor_internal_user_id, actor_workspace_membership_id, evaluated_at, results)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          quality,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          JSON.stringify(results),
        ],
      );
      await query(
        `INSERT INTO offer_decisions (id, workspace_id, company_id, offer_id, offer_version_id, state, offer_revision, actor_internal_user_id, actor_workspace_membership_id, decided_at, quality_run_id, acknowledged_warning_codes, representation_sha256)
        VALUES ($1,$2,$3,$4,$5,'APPROVED',2,$6,$7,$8,$9,'[]',$10)`,
        [
          decision,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          quality,
          GOLDEN_SHA256,
        ],
      );
      await query(
        `INSERT INTO offer_transmissions (id, workspace_id, company_id, offer_id, offer_version_id, offer_revision, actor_internal_user_id, actor_workspace_membership_id, transmitted_at, quality_run_id, acknowledged_warning_codes, representation_sha256, note)
        VALUES ($1,$2,$3,$4,$5,3,$6,$7,$8,$9,'[]',$10,'Preserved synthetic transmission')`,
        [
          transmission,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
          quality,
          GOLDEN_SHA256,
        ],
      );
      await query(
        `INSERT INTO offer_client_responses (id, workspace_id, company_id, offer_id, offer_version_id, outcome, offer_revision, actor_internal_user_id, actor_workspace_membership_id, decided_at, received_at, reason)
        VALUES ($1,$2,$3,$4,$5,'REJECTED',4,$6,$7,$8,$8,'Preserved synthetic refusal')`,
        [
          response,
          WORKSPACE,
          COMPANY,
          OFFER,
          VERSION,
          USER,
          MEMBERSHIP,
          CREATED_AT,
        ],
      );
      for (const [kind, column, id] of [
        ['RUN_QUALITY_CHECKS', 'result_quality_run_id', quality],
        ['APPROVE', 'result_decision_id', decision],
        ['RECORD_TRANSMISSION', 'result_transmission_id', transmission],
        ['RECORD_CLIENT_RESPONSE', 'result_client_response_id', response],
      ]) {
        await query(
          `INSERT INTO offer_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_offer_id,created_at,kind,${column}) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9)`,
          [
            WORKSPACE,
            COMPANY,
            MEMBERSHIP,
            'preserved-' + kind,
            OPPORTUNITY,
            OFFER,
            CREATED_AT,
            kind,
            id,
          ],
        );
      }
      for (const { action, metadata } of [
        {
          action: 'offer_version.approved',
          metadata: {
            outcome: 'APPROVED',
            ruleSetVersion: 1,
            acknowledgedWarningCodes: [],
          },
        },
        {
          action: 'offer_version.transmission_recorded',
          metadata: {
            channel: 'SIMULATED',
            ruleSetVersion: 1,
            acknowledgedWarningCodes: [],
          },
        },
        {
          action: 'offer_version.client_response_recorded',
          metadata: { evidenceKind: 'SIMULATED', outcome: 'REJECTED' },
        },
      ])
        await query(
          `INSERT INTO offer_events (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            WORKSPACE,
            COMPANY,
            OFFER,
            VERSION,
            USER,
            MEMBERSHIP,
            CREATED_AT,
            action,
            JSON.stringify({
              offerId: OFFER,
              offerVersionId: VERSION,
              versionNumber: 1,
              provenance: 'ILLUSTRATIVE',
              ...metadata,
            }),
          ],
        );
      await query('UPDATE offers SET revision = 4 WHERE id = $1', [OFFER]);
      before = await preserved();
      const deliveredEvidence = () =>
        Promise.all(
          [
            'offer_quality_runs',
            'offer_decisions',
            'offer_transmissions',
            'offer_client_responses',
          ].map(
            async (table) =>
              (
                await query(
                  `SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY id`,
                )
              ).rows,
          ),
        );
      const beforeEvidence = await deliveredEvidence();

      await migrate(connection, { migrationsFolder: resolve('drizzle') });

      expect(await preserved()).toEqual(before);
      expect(await deliveredEvidence()).toEqual(beforeEvidence);
      expect(
        (
          await query(
            `SELECT kind, result_quality_run_id AS "resultQualityRunId",
                    result_decision_id AS "resultDecisionId",
                    result_transmission_id AS "resultTransmissionId",
                    result_client_response_id AS "resultClientResponseId"
               FROM offer_commands WHERE id = $1`,
            [COMMAND],
          )
        ).rows,
      ).toEqual([
        {
          kind: 'CREATE_OFFER',
          resultQualityRunId: null,
          resultDecisionId: null,
          resultTransmissionId: null,
          resultClientResponseId: null,
        },
      ]);
      expect(
        (
          await query(
            `SELECT column_name AS "columnName", column_default AS "columnDefault"
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'offer_commands'
                AND column_name IN ('kind', 'result_quality_run_id', 'result_decision_id', 'result_transmission_id')
              ORDER BY column_name`,
          )
        ).rows,
      ).toEqual([
        { columnName: 'kind', columnDefault: "'CREATE_OFFER'::text" },
        { columnName: 'result_decision_id', columnDefault: null },
        { columnName: 'result_quality_run_id', columnDefault: null },
        { columnName: 'result_transmission_id', columnDefault: null },
      ]);
      expect(
        (
          await query(
            `SELECT template_code AS "templateCode", template_version AS "templateVersion"
               FROM offer_versions WHERE id = $1`,
            [VERSION],
          )
        ).rows,
      ).toEqual([{ templateCode: 'OFFER_ILLUSTRATIVE', templateVersion: 1 }]);
      expect(
        (
          await query(
            `SELECT column_name AS "columnName", column_default AS "columnDefault"
               FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'offer_versions'
                AND column_name IN ('template_code', 'template_version')
              ORDER BY column_name`,
          )
        ).rows,
      ).toEqual([
        { columnName: 'template_code', columnDefault: null },
        { columnName: 'template_version', columnDefault: null },
      ]);

      const migrated = await database.targetPool.query<{
        templateCode: string;
        templateVersion: number;
        illustrativeReference: number;
        versionNumber: number;
        issuingCompanyLabel: string;
        recipientLegalName: string;
        recipientTaxId: string | null;
        recipientLegalAddress: string | null;
        createdAt: Date;
        validUntil: Date;
        serviceName: string;
        quantity: string;
        unit: string;
        unitAmount: string;
        lineNet: string;
        taxLabel: string;
        lineTax: string;
        subtotal: string;
        taxTotal: string;
        total: string;
        currency: string;
        scopeNote: string | null;
        commercialConditions: string | null;
        pricingSnapshotId: string;
        provenance: 'ILLUSTRATIVE';
        adjusted: boolean;
      }>(
        `SELECT version.template_code AS "templateCode",
                version.template_version AS "templateVersion",
                offer.illustrative_reference AS "illustrativeReference",
                version.version_number AS "versionNumber",
                version.issuing_company_label AS "issuingCompanyLabel",
                version.recipient_legal_name AS "recipientLegalName",
                version.recipient_tax_id AS "recipientTaxId",
                version.recipient_legal_address AS "recipientLegalAddress",
                version.created_at AS "createdAt", version.valid_until AS "validUntil",
                line.service_name AS "serviceName", line.quantity, line.unit,
                line.unit_amount AS "unitAmount", line.line_net AS "lineNet",
                line.tax_label AS "taxLabel", line.line_tax AS "lineTax",
                snapshot.subtotal, snapshot.tax_total AS "taxTotal", snapshot.total,
                snapshot.currency, version.scope_note AS "scopeNote",
                version.commercial_conditions AS "commercialConditions",
                version.pricing_snapshot_id AS "pricingSnapshotId", version.provenance,
                EXISTS (SELECT 1 FROM pricing_snapshot_adjustments adjustment
                         WHERE adjustment.snapshot_line_id = line.id) AS adjusted
           FROM offer_versions version
           INNER JOIN offers offer ON offer.id = version.offer_id
           INNER JOIN pricing_snapshots snapshot ON snapshot.id = version.pricing_snapshot_id
           INNER JOIN pricing_snapshot_lines line ON line.snapshot_id = snapshot.id
          WHERE version.id = $1`,
        [VERSION],
      );
      const row = migrated.rows[0];
      if (migrated.rowCount !== 1 || !row)
        throw new Error('Expected the migrated Offer Version.');
      expect(row.adjusted).toBe(false);
      const representation = renderOfferRepresentation({
        templateCode: row.templateCode,
        templateVersion: row.templateVersion,
        illustrativeReference: row.illustrativeReference,
        versionNumber: row.versionNumber,
        issuingCompanyLabel: row.issuingCompanyLabel,
        recipient: {
          legalName: row.recipientLegalName,
          taxId: row.recipientTaxId,
          legalAddress: row.recipientLegalAddress,
        },
        createdAt: row.createdAt.toISOString(),
        validUntil: row.validUntil.toISOString(),
        lines: [
          {
            serviceName: row.serviceName,
            quantity: row.quantity,
            unit: row.unit,
            unitAmount: row.unitAmount,
            lineNet: row.lineNet,
            taxLabel: row.taxLabel,
            lineTax: row.lineTax,
            adjustment: null,
          },
        ],
        subtotal: row.subtotal,
        taxTotal: row.taxTotal,
        total: row.total,
        currency: row.currency,
        scopeNote: row.scopeNote,
        commercialConditions: row.commercialConditions,
        pricingSnapshotId: row.pricingSnapshotId,
        provenance: row.provenance,
      });
      expect(representation.sha256).toBe(GOLDEN_SHA256);

      await migrate(connection, { migrationsFolder: resolve('drizzle') });
      expect(await preserved()).toEqual(before);
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-501-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  20_000,
);
