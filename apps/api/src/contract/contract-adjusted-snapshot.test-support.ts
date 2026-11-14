import type { PoolClient } from 'pg';

// Synthetic records only; nothing here is a real price, Contract or Client.
// Seeds for the current schema: an executed direct Contract over an
// unadjusted Snapshot (rule set v1) and a pending one over an adjusted
// Snapshot (rule set v2), with the records their guards require.
export const WORKSPACE = '00000000-0000-4000-8000-000000005610';
export const USER = '00000000-0000-4000-8000-000000005611';
export const MEMBERSHIP = '00000000-0000-4000-8000-000000005612';
export const COMPANY = '00000000-0000-4000-8000-000000005613';
const CLIENT = '00000000-0000-4000-8000-000000005614';
const DEFINITION = '00000000-0000-4000-8000-000000005615';
const OFFERING = '00000000-0000-4000-8000-000000005616';
const RULE = '00000000-0000-4000-8000-000000005617';
const TARIFF = '00000000-0000-4000-8000-000000005618';
// Opportunity one holds an executed direct Contract over an unadjusted Snapshot.
export const PLAIN = {
  request: '00000000-0000-4000-8000-000000005620',
  opportunity: '00000000-0000-4000-8000-000000005621',
  snapshot: '00000000-0000-4000-8000-000000005622',
  line: '00000000-0000-4000-8000-000000005623',
  contract: '00000000-0000-4000-8000-000000005624',
  version: '00000000-0000-4000-8000-000000005625',
} as const;
// Opportunity two holds a pending direct Contract over an adjusted Snapshot.
export const ADJUSTED = {
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
const CALCULATED_AT = '2026-10-01T12:00:00.000Z';
const CREATED_AT = '2026-10-01T12:00:02.000Z';
const APPROVED_AT = '2026-10-01T12:00:03.000Z';
export const SIGNED_AT = '2026-10-01T12:00:04.000Z';
const CHECKSUM = 'c'.repeat(64);
const DIRECT_RESULTS = JSON.stringify([
  { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
  { code: 'PARTY_AVAILABLE', status: 'PASS' },
  { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
  { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
  { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
  { code: 'DIRECT_ORIGIN_REVIEWED', status: 'WARNING' },
  { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
]);

export type Target = typeof PLAIN | typeof ADJUSTED;
export type Executor = Pick<PoolClient, 'query'>;

export function insertRun(
  pool: Executor,
  target: Target,
  ruleSetVersion: number,
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
      DIRECT_RESULTS,
    ],
  );
}

export function baseRecords() {
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
    INSERT INTO workspaces (id, name) VALUES ('${WORKSPACE}', 'Synthetic #561 rule set binding');
    INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
      VALUES ('${USER}', 'deterministic-test', 'c561-binding', 'C561 Owner', 'c561@example.test');
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
        '${DIRECT_RESULTS}');
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

export function executedPlainContract() {
  return `BEGIN;
    ${createdDirectContract(PLAIN, 1)}
    ${approval(PLAIN, APPROVAL_RUN, 1)}
    INSERT INTO contract_quality_runs (id, workspace_id, company_id, contract_id,
      contract_version_id, actor_internal_user_id, actor_workspace_membership_id,
      evaluated_at, results)
      VALUES ('${SIGNATURE_RUN}', '${WORKSPACE}', '${COMPANY}', '${PLAIN.contract}',
        '${PLAIN.version}', '${USER}', '${MEMBERSHIP}', '${SIGNED_AT}',
        '${DIRECT_RESULTS}');
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

export function pendingAdjustedContract() {
  return `BEGIN;
    ${createdDirectContract(ADJUSTED, 2)}
    COMMIT;`;
}

export function approveAdjusted() {
  return `BEGIN;
    ${approval(ADJUSTED, '00000000-0000-4000-8000-000000005646', 2)}
    COMMIT;`;
}
