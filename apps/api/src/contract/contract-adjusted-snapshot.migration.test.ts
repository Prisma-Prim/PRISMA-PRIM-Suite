import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool, PoolClient } from 'pg';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

// Synthetic records only; nothing here is a real price, Contract or Client.
const databaseUrl = process.env.TEST_DATABASE_URL;
const MIGRATION_SUFFIX = '_contract_adjusted_snapshot';
const WORKSPACE = '00000000-0000-4000-8000-000000005610';
const USER = '00000000-0000-4000-8000-000000005611';
const MEMBERSHIP = '00000000-0000-4000-8000-000000005612';
const COMPANY = '00000000-0000-4000-8000-000000005613';
const CLIENT = '00000000-0000-4000-8000-000000005614';
const DEFINITION = '00000000-0000-4000-8000-000000005615';
const OFFERING = '00000000-0000-4000-8000-000000005616';
const RULE = '00000000-0000-4000-8000-000000005617';
const TARIFF = '00000000-0000-4000-8000-000000005618';
// Opportunity one holds an executed direct Contract over an unadjusted Snapshot.
const PLAIN = {
  request: '00000000-0000-4000-8000-000000005620',
  opportunity: '00000000-0000-4000-8000-000000005621',
  snapshot: '00000000-0000-4000-8000-000000005622',
  line: '00000000-0000-4000-8000-000000005623',
  contract: '00000000-0000-4000-8000-000000005624',
  version: '00000000-0000-4000-8000-000000005625',
} as const;
// Opportunity two holds a pending direct Contract over an adjusted Snapshot with
// an older rule set v1 run recorded before rule set v2 existed.
const ADJUSTED = {
  request: '00000000-0000-4000-8000-000000005630',
  opportunity: '00000000-0000-4000-8000-000000005631',
  snapshot: '00000000-0000-4000-8000-000000005632',
  line: '00000000-0000-4000-8000-000000005633',
  contract: '00000000-0000-4000-8000-000000005634',
  version: '00000000-0000-4000-8000-000000005635',
} as const;
const ADJUSTMENT = '00000000-0000-4000-8000-000000005636';
const APPROVAL_RUN = '00000000-0000-4000-8000-000000005640';
const DECISION = '00000000-0000-4000-8000-000000005641';
const SIGNATURE_RUN = '00000000-0000-4000-8000-000000005642';
const SIGNATURE = '00000000-0000-4000-8000-000000005643';
const LEGACY_RUN = '00000000-0000-4000-8000-000000005644';
const CALCULATED_AT = '2026-10-01T12:00:00.000Z';
const CREATED_AT = '2026-10-01T12:00:02.000Z';
const APPROVED_AT = '2026-10-01T12:00:03.000Z';
const SIGNED_AT = '2026-10-01T12:00:04.000Z';
const CHECKSUM = 'c'.repeat(64);
const DIRECT_RESULTS = (coherent: 'PASS' | 'ERROR') =>
  JSON.stringify([
    { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
    { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
    { code: 'PRICING_SNAPSHOT_COHERENT', status: coherent },
    { code: 'DIRECT_ORIGIN_REVIEWED', status: 'WARNING' },
    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
  ]);

it.skipIf(!databaseUrl)(
  'admits Contract rule set v2 only for adjusted Snapshots and keeps delivered v1 evidence valid',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'contract_561_upgrade',
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
      expect(index).toBeGreaterThan(
        tags.indexOf('0063_offer_adjusted_snapshot'),
      );
      previous = await mkdtemp(join(tmpdir(), 'prisma-561-upgrade-'));
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
      const pool = database.targetPool;
      const query = (text: string, values: unknown[] = []) =>
        pool.query(text, values);

      await query(baseRecords());
      await query(executedPlainContract());
      await query(pendingAdjustedContract());
      // Before the upgrade only rule set v1 exists.
      await expect(
        insertRun(pool, PLAIN, 2, DIRECT_RESULTS('PASS')),
      ).rejects.toMatchObject({ code: '23514' });

      const evidence = () =>
        Promise.all(
          [
            'contracts',
            'contract_versions',
            'contract_quality_runs',
            'contract_decisions',
            'contract_signatures',
            'contract_commands',
            'contract_events',
            'pricing_snapshots',
            'pricing_snapshot_lines',
            'pricing_snapshot_adjustments',
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
      // No backfill, recheck or rewrite: every delivered row is byte-identical.
      expect(await evidence()).toEqual(before);
      expect(
        (
          await query(
            'SELECT contract_version_id AS version, rule_set_version AS rule FROM contract_quality_runs ORDER BY sequence',
          )
        ).rows,
      ).toEqual([
        { version: PLAIN.version, rule: 1 },
        { version: PLAIN.version, rule: 1 },
        { version: ADJUSTED.version, rule: 1 },
      ]);

      // New runs use the binding derived from the immutable Snapshot.
      for (const [target, ruleSetVersion] of [
        [ADJUSTED, 1],
        [PLAIN, 2],
        [ADJUSTED, 3],
        [PLAIN, 0],
      ] as const)
        await expect(
          insertRun(pool, target, ruleSetVersion, DIRECT_RESULTS('PASS')),
        ).rejects.toMatchObject({ code: '23514' });
      await insertRun(pool, PLAIN, 1, DIRECT_RESULTS('PASS'));
      await insertRun(pool, ADJUSTED, 2, DIRECT_RESULTS('PASS'));

      // Approval and signature events name the bound rule set as a JSON number.
      for (const [target, action, ruleSetVersion] of [
        [ADJUSTED, 'contract_version.approved', 1],
        [ADJUSTED, 'contract_version.approved', '2'],
        [ADJUSTED, 'contract_version.approved', 2.5],
        [ADJUSTED, 'contract_version.approved', 3],
        [ADJUSTED, 'contract_version.approved', null],
        [ADJUSTED, 'contract_version.signature_recorded', 1],
        [ADJUSTED, 'contract_version.signature_recorded', '2'],
        [PLAIN, 'contract_version.signature_recorded', 2],
        [PLAIN, 'contract_version.approved', 2],
      ] as const)
        await expect(
          insertEvent(pool, target, action, { ruleSetVersion }),
        ).rejects.toMatchObject({ code: '23514' });
      // The typed check refuses a JSON string by itself, and other events never
      // carry a rule set version.
      for (const [action, ruleSetVersion] of [
        ['contract_version.approved', '2'],
        ['contract_version.signature_recorded', '1'],
        ['contract_version.rejected', 1],
      ] as const)
        await expect(
          withoutEventBinding(pool, (client) =>
            insertEvent(client, ADJUSTED, action, { ruleSetVersion }),
          ),
        ).rejects.toMatchObject({
          code: '23514',
          constraint: 'contract_events_metadata_check',
        });
      await expect(
        rolledBack(pool, (client) =>
          insertEvent(client, ADJUSTED, 'contract_version.approved', {
            ruleSetVersion: 2,
          }),
        ),
      ).resolves.toBeUndefined();

      // A rule set v2 approval commits through the deferred decision evidence guard.
      await query(approveAdjusted());
      expect(
        (
          await query(
            "SELECT metadata->'ruleSetVersion' AS rule FROM contract_events WHERE action='contract_version.approved' ORDER BY occurred_at",
          )
        ).rows,
      ).toEqual([{ rule: 1 }, { rule: 2 }]);
      // Delivered v1 approval and signature events stay bound to v1 runs.
      expect(
        (
          await query(
            `SELECT count(*)::int AS unbound FROM contract_events event
               JOIN contract_versions bound ON bound.id = event.contract_version_id
              WHERE event.action IN ('contract_version.approved','contract_version.signature_recorded')
                AND event.metadata->'ruleSetVersion' IS DISTINCT FROM to_jsonb(contract_version_quality_rule_set(bound.workspace_id, bound.company_id, bound.id))`,
          )
        ).rows,
      ).toEqual([{ unbound: 0 }]);
    } finally {
      await database.close();
      if (
        previous &&
        dirname(resolve(previous)) === resolve(tmpdir()) &&
        basename(previous).startsWith('prisma-561-upgrade-')
      )
        await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);

type Target = typeof PLAIN | typeof ADJUSTED;
type Executor = Pick<PoolClient, 'query'>;

function insertRun(
  pool: Executor,
  target: Target,
  ruleSetVersion: number,
  results: string,
) {
  return pool.query(
    `INSERT INTO contract_quality_runs (workspace_id, company_id, contract_id, contract_version_id, rule_set_version, actor_internal_user_id, actor_workspace_membership_id, evaluated_at, results)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      WORKSPACE,
      COMPANY,
      target.contract,
      target.version,
      ruleSetVersion,
      USER,
      MEMBERSHIP,
      SIGNED_AT,
      results,
    ],
  );
}

function insertEvent(
  pool: Executor,
  target: Target,
  action: string,
  metadata: Record<string, unknown>,
) {
  return pool.query(
    `INSERT INTO contract_events (workspace_id, company_id, contract_id, contract_version_id, actor_internal_user_id, actor_workspace_membership_id, occurred_at, action, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      WORKSPACE,
      COMPANY,
      target.contract,
      target.version,
      USER,
      MEMBERSHIP,
      SIGNED_AT,
      action,
      JSON.stringify({
        contractId: target.contract,
        contractVersionId: target.version,
        versionNumber: 1,
        kind: 'CONTRACT',
        origin: 'DIRECT',
        provenance: 'ILLUSTRATIVE',
        pricingSnapshotId: target.snapshot,
        ...(action === 'contract_version.rejected'
          ? {}
          : { acknowledgedWarningCodes: ['DIRECT_ORIGIN_REVIEWED'] }),
        ...(action === 'contract_version.signature_recorded'
          ? { evidenceKind: 'SIMULATED' }
          : {}),
        ...metadata,
      }),
    ],
  );
}

/** Runs statements on one connection in a transaction that is always rolled back. */
async function rolledBack(
  pool: Pool,
  statement: (client: Executor) => Promise<unknown>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await statement(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/**
 * Isolates the metadata CHECK from the binding trigger inside one rolled-back
 * transaction, so the trigger is never disabled for any other statement.
 */
async function withoutEventBinding(
  pool: Pool,
  statement: (client: Executor) => Promise<unknown>,
) {
  return rolledBack(pool, async (client) => {
    await client.query(
      'ALTER TABLE contract_events DISABLE TRIGGER contract_events_bound_rule_set',
    );
    await statement(client);
  });
}

function baseRecords() {
  const opportunity = (target: Target, title: string) => `
    INSERT INTO client_requests (id, workspace_id, company_id, client_account_id,
      original_text, captured_by_internal_user_id, captured_by_workspace_membership_id)
      VALUES ('${target.request}', '${WORKSPACE}', '${COMPANY}', '${CLIENT}',
        'Synthetic request', '${USER}', '${MEMBERSHIP}');
    INSERT INTO opportunities (id, workspace_id, company_id, client_request_id, title,
      next_action, responsible_internal_user_id, responsible_workspace_membership_id)
      VALUES ('${target.opportunity}', '${WORKSPACE}', '${COMPANY}', '${target.request}',
        '${title}', 'Prepare Contract', '${USER}', '${MEMBERSHIP}');`;
  const snapshot = (
    target: Target,
    totals: { subtotal: string; tax: string; total: string },
  ) => `
    INSERT INTO pricing_snapshots (id, workspace_id, company_id, opportunity_id,
      client_request_id, original_client_account_id, pricing_rule_version_id,
      pricing_rule_version_number, rule_shape, rounding_mode, rounding_scale, tax_application,
      currency, subtotal, tax_total, total, calculated_by_internal_user_id,
      calculated_by_workspace_membership_id, calculated_at, committed_at)
      VALUES ('${target.snapshot}', '${WORKSPACE}', '${COMPANY}', '${target.opportunity}',
        '${target.request}', '${CLIENT}', '${RULE}', 1, 'UNIT_PRICE_TIMES_QUANTITY', 'HALF_UP',
        2, 'PER_LINE', 'EUR', '${totals.subtotal}', '${totals.tax}', '${totals.total}',
        '${USER}', '${MEMBERSHIP}', '${CALCULATED_AT}', '2026-10-01T12:00:01Z');
    INSERT INTO pricing_snapshot_lines (id, workspace_id, company_id, snapshot_id,
      line_number, service_definition_id, service_code, service_name, offering_id,
      commercial_label, tariff_version_id, tariff_version_number, unit, unit_amount,
      currency, tax_rate_percent, tax_label, quantity, quantity_input, rule_shape,
      raw_line_amount, line_net, raw_line_tax, line_tax)
      VALUES ('${target.line}', '${WORKSPACE}', '${COMPANY}', '${target.snapshot}', 1,
        '${DEFINITION}', 'CONTRACT-561', 'Synthetic service', '${OFFERING}', 'Synthetic offering',
        '${TARIFF}', 1, 'illustrative-unit', '300.0000', 'EUR', '15.00', 'Illustrative tax',
        '1.000', '1', 'UNIT_PRICE_TIMES_QUANTITY', '300.0000000', '300.00', '45.0000000', '45.00');`;
  return `
    INSERT INTO workspaces (id, name) VALUES ('${WORKSPACE}', 'Synthetic #561 upgrade');
    INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
      VALUES ('${USER}', 'deterministic-test', 'c561-upgrade', 'C561 Owner', 'c561@example.test');
    INSERT INTO workspace_memberships (id, workspace_id, internal_user_id)
      VALUES ('${MEMBERSHIP}', '${WORKSPACE}', '${USER}');
    INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
      created_by_workspace_membership_id, registration_idempotency_key)
      VALUES ('${COMPANY}', '${WORKSPACE}', 'Synthetic Issuer', '${USER}', '${MEMBERSHIP}', 'c561-company');
    INSERT INTO client_accounts (id, workspace_id, display_name, tax_id, address,
      created_by_internal_user_id, created_by_workspace_membership_id)
      VALUES ('${CLIENT}', '${WORKSPACE}', 'Synthetic Recipient', 'RO561', '1 Example Street',
        '${USER}', '${MEMBERSHIP}');
    INSERT INTO service_definitions (id, workspace_id, code, name,
      created_by_internal_user_id, created_by_workspace_membership_id, created_in_company_id)
      VALUES ('${DEFINITION}', '${WORKSPACE}', 'CONTRACT-561', 'Synthetic service', '${USER}',
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
    ${opportunity(PLAIN, 'Synthetic unadjusted Opportunity')}
    ${opportunity(ADJUSTED, 'Synthetic adjusted Opportunity')}
    ${snapshot(PLAIN, { subtotal: '300.00', tax: '45.00', total: '345.00' })}
    ${snapshot(ADJUSTED, { subtotal: '291.37', tax: '43.71', total: '335.08' })}
    INSERT INTO pricing_snapshot_adjustments (id, workspace_id, company_id, snapshot_id,
      snapshot_line_id, type, net_reduction, reason, original_line_net, original_raw_line_tax,
      original_line_tax, tax_rate_percent, adjusted_line_net, adjusted_raw_line_tax,
      adjusted_line_tax, tax_reduction, applied_by_internal_user_id,
      applied_by_workspace_membership_id, applied_at)
      VALUES ('${ADJUSTMENT}', '${WORKSPACE}', '${COMPANY}', '${ADJUSTED.snapshot}',
        '${ADJUSTED.line}', 'FIXED_NET_DISCOUNT', '8.63', 'Synthetic discount', '300.00',
        '45.0000000', '45.00', '15.00', '291.37', '43.7055000', '43.71', '1.29', '${USER}',
        '${MEMBERSHIP}', '${CALCULATED_AT}');`;
}

/** Contract creation with its receipt and creation events, as C9 records it. */
function createdDirectContract(target: Target, reference: number) {
  const source = `"contractId":"${target.contract}","kind":"CONTRACT","origin":"DIRECT","provenance":"ILLUSTRATIVE"`;
  return `
    INSERT INTO contracts (id, workspace_id, company_id, opportunity_id, client_request_id,
      original_client_account_id, kind, origin, direct_reason, illustrative_reference,
      created_by_internal_user_id, created_by_workspace_membership_id, created_at)
      VALUES ('${target.contract}', '${WORKSPACE}', '${COMPANY}', '${target.opportunity}',
        '${target.request}', '${CLIENT}', 'CONTRACT', 'DIRECT', 'Synthetic direct reason',
        ${reference}, '${USER}', '${MEMBERSHIP}', '${CREATED_AT}');
    INSERT INTO contract_versions (id, workspace_id, company_id, contract_id, opportunity_id,
      pricing_snapshot_id, recipient_client_account_id, recipient_kind, recipient_legal_name,
      recipient_tax_id, recipient_legal_address, issuing_company_label, scope_note,
      created_by_internal_user_id, created_by_workspace_membership_id, created_at)
      VALUES ('${target.version}', '${WORKSPACE}', '${COMPANY}', '${target.contract}',
        '${target.opportunity}', '${target.snapshot}', '${CLIENT}', 'PRIMARY',
        'Synthetic Recipient', 'RO561', '1 Example Street', 'Synthetic Issuer',
        'Synthetic direct scope', '${USER}', '${MEMBERSHIP}', '${CREATED_AT}');
    INSERT INTO contract_commands (workspace_id, company_id, actor_workspace_membership_id,
      idempotency_key, fingerprint, opportunity_id, result_contract_id, kind, created_at)
      VALUES ('${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}', 'create-${reference}',
        'fingerprint-create-${reference}', '${target.opportunity}', '${target.contract}',
        'CREATE', '${CREATED_AT}');
    INSERT INTO contract_events (workspace_id, company_id, contract_id, contract_version_id,
      actor_internal_user_id, actor_workspace_membership_id, occurred_at, action, metadata)
      VALUES ('${WORKSPACE}', '${COMPANY}', '${target.contract}', NULL, '${USER}',
        '${MEMBERSHIP}', '${CREATED_AT}', 'contract.created',
        '{${source},"illustrativeReference":${reference}}'),
      ('${WORKSPACE}', '${COMPANY}', '${target.contract}', '${target.version}', '${USER}',
        '${MEMBERSHIP}', '${CREATED_AT}', 'contract_version.created',
        '{${source},"pricingSnapshotId":"${target.snapshot}","contractVersionId":"${target.version}","versionNumber":1}');`;
}

function eventMetadata(target: Target, extra: string) {
  return `{"contractId":"${target.contract}","contractVersionId":"${target.version}","versionNumber":1,"kind":"CONTRACT","origin":"DIRECT","provenance":"ILLUSTRATIVE","pricingSnapshotId":"${target.snapshot}",${extra}}`;
}

/** Approval at APPROVED_AT through its own run, receipt and event. */
function approval(target: Target, run: string, ruleSetVersion: number) {
  return `
    INSERT INTO contract_quality_runs (id, workspace_id, company_id, contract_id,
      contract_version_id, rule_set_version, actor_internal_user_id,
      actor_workspace_membership_id, evaluated_at, results)
      VALUES ('${run}', '${WORKSPACE}', '${COMPANY}', '${target.contract}', '${target.version}',
        ${ruleSetVersion}, '${USER}', '${MEMBERSHIP}', '${APPROVED_AT}',
        '${DIRECT_RESULTS('PASS')}');
    INSERT INTO contract_decisions (id, workspace_id, company_id, contract_id,
      contract_version_id, kind, result_revision, actor_internal_user_id,
      actor_workspace_membership_id, decided_at, quality_run_id, representation_checksum,
      acknowledged_warning_codes)
      VALUES ('${target === PLAIN ? DECISION : '00000000-0000-4000-8000-000000005645'}',
        '${WORKSPACE}', '${COMPANY}', '${target.contract}', '${target.version}', 'APPROVE', 2,
        '${USER}', '${MEMBERSHIP}', '${APPROVED_AT}', '${run}', '${CHECKSUM}',
        '["DIRECT_ORIGIN_REVIEWED"]');
    UPDATE contract_versions SET decision_state = 'APPROVED' WHERE id = '${target.version}';
    UPDATE contracts SET revision = 2 WHERE id = '${target.contract}';
    INSERT INTO contract_commands (workspace_id, company_id, actor_workspace_membership_id,
      idempotency_key, fingerprint, opportunity_id, result_contract_id, kind,
      result_decision_id, created_at)
      SELECT '${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}', 'approve-' || id::text,
        'fingerprint-approve', '${target.opportunity}', '${target.contract}', 'APPROVE', id,
        '${APPROVED_AT}'
        FROM contract_decisions WHERE contract_version_id = '${target.version}';
    INSERT INTO contract_events (workspace_id, company_id, contract_id, contract_version_id,
      actor_internal_user_id, actor_workspace_membership_id, occurred_at, action, metadata)
      VALUES ('${WORKSPACE}', '${COMPANY}', '${target.contract}', '${target.version}', '${USER}',
        '${MEMBERSHIP}', '${APPROVED_AT}', 'contract_version.approved',
        '${eventMetadata(target, `"ruleSetVersion":${ruleSetVersion},"acknowledgedWarningCodes":["DIRECT_ORIGIN_REVIEWED"]`)}');`;
}

function executedPlainContract() {
  return `BEGIN;
    ${createdDirectContract(PLAIN, 1)}
    ${approval(PLAIN, APPROVAL_RUN, 1)}
    INSERT INTO contract_quality_runs (id, workspace_id, company_id, contract_id,
      contract_version_id, actor_internal_user_id, actor_workspace_membership_id,
      evaluated_at, results)
      VALUES ('${SIGNATURE_RUN}', '${WORKSPACE}', '${COMPANY}', '${PLAIN.contract}',
        '${PLAIN.version}', '${USER}', '${MEMBERSHIP}', '${SIGNED_AT}',
        '${DIRECT_RESULTS('PASS')}');
    INSERT INTO contract_signatures (id, workspace_id, company_id, contract_id,
      contract_version_id, result_revision, actor_internal_user_id,
      actor_workspace_membership_id, recorded_at, provider_signatory_label,
      client_signatory_label, provider_signed_on, client_signed_on, quality_run_id,
      representation_checksum, acknowledged_warning_codes)
      VALUES ('${SIGNATURE}', '${WORKSPACE}', '${COMPANY}', '${PLAIN.contract}',
        '${PLAIN.version}', 3, '${USER}', '${MEMBERSHIP}', '${SIGNED_AT}',
        'Synthetic provider', 'Synthetic Client', '2026-10-01', '2026-10-01',
        '${SIGNATURE_RUN}', '${CHECKSUM}', '[]');
    UPDATE contract_versions SET execution_state = 'EXECUTED' WHERE id = '${PLAIN.version}';
    UPDATE contracts SET revision = 3 WHERE id = '${PLAIN.contract}';
    INSERT INTO contract_commands (workspace_id, company_id, actor_workspace_membership_id,
      idempotency_key, fingerprint, opportunity_id, result_contract_id, kind,
      result_signature_id, created_at)
      VALUES ('${WORKSPACE}', '${COMPANY}', '${MEMBERSHIP}', 'sign-1', 'fingerprint-sign',
        '${PLAIN.opportunity}', '${PLAIN.contract}', 'RECORD_SIGNATURE', '${SIGNATURE}',
        '${SIGNED_AT}');
    INSERT INTO contract_events (workspace_id, company_id, contract_id, contract_version_id,
      actor_internal_user_id, actor_workspace_membership_id, occurred_at, action, metadata)
      VALUES ('${WORKSPACE}', '${COMPANY}', '${PLAIN.contract}', '${PLAIN.version}', '${USER}',
        '${MEMBERSHIP}', '${SIGNED_AT}', 'contract_version.signature_recorded',
        '${eventMetadata(PLAIN, '"ruleSetVersion":1,"acknowledgedWarningCodes":[],"evidenceKind":"SIMULATED"')}');
    COMMIT;`;
}

function pendingAdjustedContract() {
  return `BEGIN;
    ${createdDirectContract(ADJUSTED, 2)}
    INSERT INTO contract_quality_runs (id, workspace_id, company_id, contract_id,
      contract_version_id, actor_internal_user_id, actor_workspace_membership_id,
      evaluated_at, results)
      VALUES ('${LEGACY_RUN}', '${WORKSPACE}', '${COMPANY}', '${ADJUSTED.contract}',
        '${ADJUSTED.version}', '${USER}', '${MEMBERSHIP}', '${CREATED_AT}',
        '${DIRECT_RESULTS('ERROR')}');
    COMMIT;`;
}

function approveAdjusted() {
  return `BEGIN;
    ${approval(ADJUSTED, '00000000-0000-4000-8000-000000005646', 2)}
    COMMIT;`;
}
