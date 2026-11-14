import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { commandFingerprint } from '../command/idempotent-command.js';
import { ESTIMATE_OFFER_WORKSPACE } from '../offer/offer-estimate-preparation.test-support.js';
import {
  CONTRACT_CLAUSE_VERSIONS,
  PRECONTRACT_CLAUSE_VERSIONS,
  ADDENDUM_CLAUSE_VERSIONS,
} from './contract-representation.js';

/** Genuine 0081 rows: old columns, native constraints/triggers, no disabled guards. */
export async function seedPreModelAgreement(
  input: {
    pool: Pool;
    companyId: string;
    opportunityId: string;
    requestId: string;
    clientId: string;
    membershipId: string;
    userId: string;
    reference: number;
    snapshotId: string | null;
  } & (
    | { kind: 'DIRECT' }
    | { kind: 'PRECONTRACT'; offerId: string; offerVersionId: string }
    | { kind: 'ADDENDUM'; parentContractId: string }
  ),
) {
  const contractId = randomUUID(),
    versionId = randomUUID(),
    createdAt = '2026-10-24T09:00:00.000Z';
  const kind = input.kind === 'DIRECT' ? 'CONTRACT' : input.kind,
    origin =
      input.kind === 'DIRECT'
        ? 'DIRECT'
        : input.kind === 'PRECONTRACT'
          ? 'ACCEPTED_OFFER'
          : null;
  const template =
    input.kind === 'PRECONTRACT'
      ? 'PRECONTRACT_ILLUSTRATIVE'
      : input.kind === 'ADDENDUM'
        ? 'ADDENDUM_ILLUSTRATIVE'
        : 'CONTRACT_ILLUSTRATIVE';
  const clauses =
    input.kind === 'PRECONTRACT'
      ? PRECONTRACT_CLAUSE_VERSIONS
      : input.kind === 'ADDENDUM'
        ? ADDENDUM_CLAUSE_VERSIONS
        : CONTRACT_CLAUSE_VERSIONS;
  const payload = {
    pricingSnapshotId: input.snapshotId,
    recipient: { kind: 'PRIMARY' },
    scopeNote: 'Synthetic historical direct scope',
    commercialConditions: null,
    termStartsOn: null,
    termEndsOn: null,
    specialConditions: null,
    directReason: 'Synthetic historical direct reason',
  };
  const key = 'genuine-0081-' + input.kind;
  const fingerprint = commandFingerprint({
    kind: 'CREATE_DIRECT',
    opportunityId: input.opportunityId,
    payload,
  });
  const client = await input.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO contracts (workspace_id,company_id,id,opportunity_id,client_request_id,original_client_account_id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,illustrative_reference,kind,origin,source_offer_id,source_offer_version_id,direct_reason,parent_contract_id,addendum_ordinal) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        contractId,
        input.opportunityId,
        input.requestId,
        input.clientId,
        input.userId,
        input.membershipId,
        createdAt,
        input.reference,
        kind,
        origin,
        input.kind === 'PRECONTRACT' ? input.offerId : null,
        input.kind === 'PRECONTRACT' ? input.offerVersionId : null,
        input.kind === 'DIRECT' ? payload.directReason : null,
        input.kind === 'ADDENDUM' ? input.parentContractId : null,
        input.kind === 'ADDENDUM' ? 1 : null,
      ],
    );
    await client.query(
      `INSERT INTO contract_versions (workspace_id,company_id,id,contract_id,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,created_by_internal_user_id,created_by_workspace_membership_id,created_at,template_code,clause_versions,scope_note,term_ends_on,preliminary_work_scope,preliminary_financial_conditions,preliminary_limits,change_summary) VALUES($1,$2,$3,$4,$5,$6,$7,'PRIMARY','Synthetic internal Offer Client','SYNTHETIC-842','842 Example Street','Synthetic internal Offer Company',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        versionId,
        contractId,
        input.opportunityId,
        input.snapshotId,
        input.clientId,
        input.userId,
        input.membershipId,
        createdAt,
        template,
        JSON.stringify(clauses),
        input.kind === 'DIRECT' ? payload.scopeNote : null,
        input.kind === 'PRECONTRACT' ? '2026-12-31' : null,
        input.kind === 'PRECONTRACT' ? 'Synthetic preliminary scope' : null,
        input.kind === 'PRECONTRACT'
          ? 'Synthetic preliminary financial limits'
          : null,
        input.kind === 'PRECONTRACT'
          ? 'Synthetic preliminary limitations'
          : null,
        input.kind === 'ADDENDUM' ? 'Synthetic intended amendment' : null,
      ],
    );
    await client.query(
      `INSERT INTO contract_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'CREATE',$8)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        input.membershipId,
        key,
        fingerprint,
        input.opportunityId,
        contractId,
        createdAt,
      ],
    );
    const source =
      input.kind === 'DIRECT'
        ? { kind, origin }
        : input.kind === 'PRECONTRACT'
          ? { kind, origin, offerVersionId: input.offerVersionId }
          : {
              kind,
              parentContractId: input.parentContractId,
              addendumOrdinal: 1,
            };
    for (const first of [true, false])
      await client.query(
        `INSERT INTO contract_events (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          input.companyId,
          contractId,
          first ? null : versionId,
          input.userId,
          input.membershipId,
          createdAt,
          first ? 'contract.created' : 'contract_version.created',
          JSON.stringify({
            contractId,
            ...source,
            provenance: 'ILLUSTRATIVE',
            ...(first
              ? { illustrativeReference: input.reference }
              : {
                  contractVersionId: versionId,
                  versionNumber: 1,
                  ...(input.snapshotId
                    ? { pricingSnapshotId: input.snapshotId }
                    : {}),
                }),
          }),
        ],
      );
    await client.query(
      `INSERT INTO contract_reference_counters(workspace_id,company_id,kind,current_reference) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,company_id,kind) DO UPDATE SET current_reference=greatest(contract_reference_counters.current_reference,excluded.current_reference)`,
      [ESTIMATE_OFFER_WORKSPACE, input.companyId, kind, input.reference],
    );
    if (input.kind === 'DIRECT')
      await client.query(
        `INSERT INTO contract_quality_runs(workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,rule_set_version,results) VALUES($1,$2,$3,$4,$5,$6,$7,2,$8)`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          input.companyId,
          contractId,
          versionId,
          input.userId,
          input.membershipId,
          createdAt,
          JSON.stringify(
            [
              'SOURCE_COMPANY_MATCHES',
              'PARTY_AVAILABLE',
              'PARTY_IDENTITY_CURRENT',
              'PARTY_TAX_ID_RECORDED',
              'PRICING_SNAPSHOT_COHERENT',
              'DIRECT_ORIGIN_REVIEWED',
              'PROVISIONAL_MARKER_PRESENT',
            ].map((code) => ({
              code,
              status: code === 'DIRECT_ORIGIN_REVIEWED' ? 'WARNING' : 'PASS',
            })),
          ),
        ],
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { contractId, versionId, key, payload };
}
