import { randomUUID } from 'node:crypto';
import { commandFingerprint } from '../command/idempotent-command.js';
import type { Pool, PoolClient } from 'pg';
import {
  renderContractRepresentation,
  CONTRACT_CLAUSE_VERSIONS,
} from '../contract/contract-representation.js';
import {
  renderOfferRepresentation,
  type RenderOfferRepresentationInput,
} from './offer-representation.js';
import {
  ESTIMATE_OFFER_WORKSPACE,
  responseString,
} from './offer-estimate-preparation.test-support.js';
type Seed = {
  pool: Pool;
  companyId: string;
  clientId: string;
  opportunityId: string;
  requestId: string;
  preparerMembershipId: string;
  readerMembershipId: string;
  userId: string;
  readerUserId: string;
  snapshot: Record<string, unknown>;
  reference: number;
  accepted: boolean;
  contract: boolean;
  linkedProject?: boolean;
};
export async function seedLegacyOffer(input: Seed) {
  const offerId = randomUUID(),
    versionId = randomUUID(),
    runId = randomUUID();
  const createdAt = '2026-10-24T09:00:00.000Z',
    validUntil = '2026-11-23T09:00:00.000Z';
  const snapshotId = responseString(input.snapshot, 'id');
  const adjusted = input.snapshot.total === '333.50';
  const line: RenderOfferRepresentationInput['lines'][number] = {
    serviceName: 'Synthetic service',
    quantity: '1',
    unit: 'synthetic-unit',
    unitAmount: '300.0000',
    lineNet: '300.00',
    taxLabel: 'Illustrative tax',
    lineTax: '45.00',
    adjustedLineNet: adjusted ? '290.00' : '300.00',
    adjustedLineTax: adjusted ? '43.50' : '45.00',
    adjustment: adjusted
      ? {
          type: 'FIXED_NET_DISCOUNT',
          netReduction: '10.00',
          taxReduction: '1.50',
          reason: 'Synthetic fixed reduction',
          appliedByWorkspaceMembershipId: input.preparerMembershipId,
          appliedAt: createdAt,
        }
      : null,
  };
  const representation = renderOfferRepresentation({
    templateCode: 'OFFER_ILLUSTRATIVE',
    templateVersion: adjusted ? 2 : 1,
    illustrativeReference: input.reference,
    versionNumber: 1,
    issuingCompanyLabel: 'Synthetic internal Offer Company',
    recipient: {
      legalName: 'Synthetic internal Offer Client',
      taxId: 'SYNTHETIC-842',
      legalAddress: '842 Example Street',
    },
    createdAt,
    validUntil,
    lines: [line],
    subtotal: adjusted ? '290.00' : '300.00',
    taxTotal: adjusted ? '43.50' : '45.00',
    total: adjusted ? '333.50' : '345.00',
    currency: 'EUR',
    scopeNote: null,
    commercialConditions: null,
    pricingSnapshotId: snapshotId,
    provenance: 'ILLUSTRATIVE',
  });
  const contractRepresentation = input.contract
    ? renderContractRepresentation({
        templateCode: input.accepted
          ? 'CONTRACT_ILLUSTRATIVE'
          : 'CONTRACT_PREPARATION_ILLUSTRATIVE',
        templateVersion: 1,
        clauseVersions: CONTRACT_CLAUSE_VERSIONS,
        illustrativeReference: input.reference,
        versionNumber: 1,
        issuingCompanyLabel: 'Synthetic internal Offer Company',
        recipient: {
          legalName: 'Synthetic internal Offer Client',
          taxId: 'SYNTHETIC-842',
          legalAddress: '842 Example Street',
        },
        createdAt,
        sourceOffer: {
          illustrativeReference: input.reference,
          versionNumber: 1,
        },
        pricingSnapshotId: snapshotId,
        lines: [line],
        subtotal: adjusted ? '290.00' : '300.00',
        taxTotal: adjusted ? '43.50' : '45.00',
        total: adjusted ? '333.50' : '345.00',
        currency: 'EUR',
        scopeNote: null,
        commercialConditions: null,
        termStartsOn: null,
        termEndsOn: null,
        specialConditions: null,
        precontractReference: null,
        provenance: 'ILLUSTRATIVE',
      })
    : null;
  const client = await input.pool.connect();
  try {
    await client.query('BEGIN');
    const actor = [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      offerId,
      versionId,
      input.opportunityId,
      input.requestId,
      input.clientId,
      input.userId,
      input.preparerMembershipId,
      createdAt,
    ];
    await client.query(
      `INSERT INTO offers (workspace_id,company_id,id,opportunity_id,client_request_id,original_client_account_id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,illustrative_reference,revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        offerId,
        input.opportunityId,
        input.requestId,
        input.clientId,
        input.userId,
        input.preparerMembershipId,
        createdAt,
        input.reference,
        input.accepted ? 4 : 3,
      ],
    );
    await client.query(
      `INSERT INTO offer_versions (workspace_id,company_id,offer_id,id,opportunity_id,client_request_id,original_client_account_id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,validity_days,valid_until,template_code,template_version) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$7,'PRIMARY','Synthetic internal Offer Client','SYNTHETIC-842','842 Example Street','Synthetic internal Offer Company',30,$12,'OFFER_ILLUSTRATIVE',$13)`,
      [...actor, snapshotId, validUntil, adjusted ? 2 : 1],
    );
    const evidence = [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      offerId,
      versionId,
      input.readerUserId,
      input.readerMembershipId,
      createdAt,
      runId,
    ];
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
    await client.query(
      `INSERT INTO offer_quality_runs (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,id,rule_set_version,results) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [...evidence, adjusted ? 2 : 1, JSON.stringify(results)],
    );
    await client.query(
      `INSERT INTO offer_decisions (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,decided_at,quality_run_id,state,offer_revision,acknowledged_warning_codes,representation_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APPROVED',2,'[]',$9)`,
      [...evidence, representation.sha256],
    );
    await client.query(
      `INSERT INTO offer_transmissions (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,transmitted_at,quality_run_id,offer_revision,acknowledged_warning_codes,representation_sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3,'[]',$9)`,
      [...evidence, representation.sha256],
    );
    if (input.accepted)
      await client.query(
        `INSERT INTO offer_client_responses (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,decided_at,received_at,outcome,offer_revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'ACCEPTED',4)`,
        evidence.slice(0, 7),
      );
    if (input.contract) {
      const contractId = randomUUID(),
        contractVersionId = randomUUID();
      const origin = input.accepted ? 'ACCEPTED_OFFER' : 'OFFER_PREPARATION';
      await client.query(
        `INSERT INTO contracts (workspace_id,company_id,id,opportunity_id,client_request_id,original_client_account_id,created_by_internal_user_id,created_by_workspace_membership_id,created_at,illustrative_reference,origin,source_offer_id,source_offer_version_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          input.companyId,
          contractId,
          input.opportunityId,
          input.requestId,
          input.clientId,
          input.userId,
          input.preparerMembershipId,
          createdAt,
          input.reference,
          origin,
          offerId,
          versionId,
        ],
      );
      await client.query(
        `INSERT INTO contract_versions (workspace_id,company_id,id,contract_id,opportunity_id,pricing_snapshot_id,recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,created_by_internal_user_id,created_by_workspace_membership_id,created_at,template_code,source_offer_version_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'PRIMARY','Synthetic internal Offer Client','SYNTHETIC-842','842 Example Street','Synthetic internal Offer Company',$8,$9,$10,$11,$12)`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          input.companyId,
          contractVersionId,
          contractId,
          input.opportunityId,
          snapshotId,
          input.clientId,
          input.userId,
          input.preparerMembershipId,
          createdAt,
          input.accepted
            ? 'CONTRACT_ILLUSTRATIVE'
            : 'CONTRACT_PREPARATION_ILLUSTRATIVE',
          input.accepted ? null : versionId,
        ],
      );
      await client.query(
        `INSERT INTO contract_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_contract_id,kind,created_at) VALUES ($1,$2,$3,$4,'synthetic-legacy-fingerprint',$5,$6,'CREATE',$7)`,
        [
          ESTIMATE_OFFER_WORKSPACE,
          input.companyId,
          input.preparerMembershipId,
          `legacy-contract-${input.reference}`,
          input.opportunityId,
          contractId,
          createdAt,
        ],
      );
      const metadata = {
        contractId,
        kind: 'CONTRACT',
        origin,
        offerVersionId: versionId,
        provenance: 'ILLUSTRATIVE',
      };
      for (const event of [
        {
          action: 'contract.created',
          version: null,
          metadata: { ...metadata, illustrativeReference: input.reference },
        },
        {
          action: 'contract_version.created',
          version: contractVersionId,
          metadata: {
            ...metadata,
            contractVersionId,
            versionNumber: 1,
            pricingSnapshotId: snapshotId,
          },
        },
      ])
        await client.query(
          `INSERT INTO contract_events (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            ESTIMATE_OFFER_WORKSPACE,
            input.companyId,
            contractId,
            event.version,
            input.userId,
            input.preparerMembershipId,
            createdAt,
            event.action,
            JSON.stringify(event.metadata),
          ],
        );
      if (input.linkedProject) {
        if (!contractRepresentation)
          throw new Error('Missing historical Contract bytes.');
        await seedExecutedContractProject({
          client,
          input,
          offerId,
          versionId,
          contractId,
          contractVersionId,
          snapshotId,
          checksum: contractRepresentation.sha256,
          instant: createdAt,
        });
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return {
    opportunityId: input.opportunityId,
    snapshotId,
    accepted: input.accepted,
    contract: input.contract,
    representation,
    contractRepresentation,
  };
}

/** Native pre-0080 evidence under the actual historical constraints, never disabled. */
async function seedExecutedContractProject({
  client,
  input,
  offerId,
  versionId,
  contractId,
  contractVersionId,
  snapshotId,
  checksum,
  instant,
}: {
  client: PoolClient;
  input: Seed;
  offerId: string;
  versionId: string;
  contractId: string;
  contractVersionId: string;
  snapshotId: string;
  checksum: string;
  instant: string;
}) {
  const base = [
    ESTIMATE_OFFER_WORKSPACE,
    input.companyId,
    contractId,
    contractVersionId,
    input.userId,
    input.preparerMembershipId,
    instant,
  ];
  if (!input.accepted) {
    // Early preparation is created before acceptance; execution requires later acceptance.
    await client.query(
      `INSERT INTO offer_client_responses (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,decided_at,received_at,outcome,offer_revision) VALUES ($1,$2,$3,$4,$5,$6,$7,$7,'ACCEPTED',4)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        offerId,
        versionId,
        input.readerUserId,
        input.readerMembershipId,
        instant,
      ],
    );
    await client.query('UPDATE offers SET revision=4 WHERE id=$1', [offerId]);
  }
  const ruleSetVersion = input.accepted ? 1 : 3;
  const codes = [
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
    'PARTY_MATCHES_SOURCE',
    'PARTY_IDENTITY_MATCHES_SOURCE',
    'PARTY_IDENTITY_CURRENT',
    'PARTY_TAX_ID_RECORDED',
    input.accepted
      ? 'PRICE_MATCHES_ACCEPTED_OFFER'
      : 'PRICE_MATCHES_SOURCE_OFFER',
    'PRICING_SNAPSHOT_COHERENT',
    input.accepted
      ? 'CONDITIONS_MATCH_ACCEPTED_OFFER'
      : 'CONDITIONS_MATCH_SOURCE_OFFER',
    'ADDED_CONDITIONS_CONFIRMED',
    ...(!input.accepted ? ['SOURCE_OFFER_ACCEPTED'] : []),
    'PROVISIONAL_MARKER_PRESENT',
  ];
  const results = JSON.stringify(
    codes.map((code) => ({ code, status: 'PASS' })),
  );
  const decisionId = randomUUID(),
    signatureId = randomUUID(),
    projectId = randomUUID(),
    linkId = randomUUID();
  const metadata = {
    contractId,
    contractVersionId,
    versionNumber: 1,
    kind: 'CONTRACT',
    origin: input.accepted ? 'ACCEPTED_OFFER' : 'OFFER_PREPARATION',
    offerVersionId: versionId,
    pricingSnapshotId: snapshotId,
    provenance: 'ILLUSTRATIVE',
    ruleSetVersion,
    acknowledgedWarningCodes: [],
  };
  for (const operation of ['APPROVE', 'RECORD_SIGNATURE'] as const) {
    const runId = randomUUID();
    await client.query(
      `INSERT INTO contract_quality_runs (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,evaluated_at,id,rule_set_version,results) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [...base, runId, ruleSetVersion, results],
    );
    if (operation === 'APPROVE') {
      await client.query(
        `INSERT INTO contract_decisions (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,decided_at,id,kind,result_revision,quality_run_id,representation_checksum,acknowledged_warning_codes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'APPROVE',2,$9,$10,'[]')`,
        [...base, decisionId, runId, checksum],
      );
      await client.query(
        "UPDATE contract_versions SET decision_state='APPROVED' WHERE id=$1",
        [contractVersionId],
      );
    } else {
      await client.query(
        `INSERT INTO contract_signatures (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,recorded_at,id,result_revision,provider_signatory_label,client_signatory_label,provider_signed_on,client_signed_on,quality_run_id,representation_checksum,acknowledged_warning_codes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,3,'Synthetic historical provider','Synthetic historical Client','2026-10-24','2026-10-24',$9,$10,'[]')`,
        [...base, signatureId, runId, checksum],
      );
      await client.query(
        "UPDATE contract_versions SET execution_state='EXECUTED' WHERE id=$1",
        [contractVersionId],
      );
    }
    await client.query('UPDATE contracts SET revision=$2 WHERE id=$1', [
      contractId,
      operation === 'APPROVE' ? 2 : 3,
    ]);
    await client.query(
      `INSERT INTO contract_commands (workspace_id,company_id,result_contract_id,actor_workspace_membership_id,created_at,opportunity_id,idempotency_key,fingerprint,kind,result_decision_id,result_signature_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'synthetic-historical-command',$8,$9,$10)`,
      [
        ESTIMATE_OFFER_WORKSPACE,
        input.companyId,
        contractId,
        input.preparerMembershipId,
        instant,
        input.opportunityId,
        `0079-${operation}-${contractId}`,
        operation,
        operation === 'APPROVE' ? decisionId : null,
        operation === 'RECORD_SIGNATURE' ? signatureId : null,
      ],
    );
    await client.query(
      `INSERT INTO contract_events (workspace_id,company_id,contract_id,contract_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        ...base,
        operation === 'APPROVE'
          ? 'contract_version.approved'
          : 'contract_version.signature_recorded',
        JSON.stringify({
          ...metadata,
          ...(operation === 'RECORD_SIGNATURE'
            ? { evidenceKind: 'SIMULATED' }
            : {}),
        }),
      ],
    );
  }
  await client.query(
    `INSERT INTO projects (workspace_id,company_id,id,client_account_id,title,created_by_internal_user_id,created_by_workspace_membership_id,idempotency_key) VALUES ($1,$2,$3,$4,'Synthetic historical linked Project',$5,$6,$7)`,
    [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      projectId,
      input.clientId,
      input.userId,
      input.preparerMembershipId,
      `0079-project-${contractId}`,
    ],
  );
  await client.query(
    `INSERT INTO contract_project_links (workspace_id,company_id,contract_id,id,project_id,result_revision,actor_internal_user_id,actor_workspace_membership_id,linked_at) VALUES ($1,$2,$3,$4,$5,4,$6,$7,$8)`,
    [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      contractId,
      linkId,
      projectId,
      input.userId,
      input.preparerMembershipId,
      instant,
    ],
  );
  await client.query('UPDATE contracts SET revision=4 WHERE id=$1', [
    contractId,
  ]);
  await client.query(
    `INSERT INTO contract_commands (workspace_id,company_id,result_contract_id,actor_workspace_membership_id,created_at,opportunity_id,idempotency_key,fingerprint,kind,result_project_link_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'synthetic-historical-link','LINK_PROJECT',$8)`,
    [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      contractId,
      input.preparerMembershipId,
      instant,
      input.opportunityId,
      `0079-link-${contractId}`,
      linkId,
    ],
  );
  await client.query(
    `INSERT INTO contract_events (workspace_id,company_id,contract_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata) VALUES ($1,$2,$3,$4,$5,$6,'contract_project.linked',$7)`,
    [
      ESTIMATE_OFFER_WORKSPACE,
      input.companyId,
      contractId,
      input.userId,
      input.preparerMembershipId,
      instant,
      JSON.stringify({ contractId, projectId, created: false }),
    ],
  );
}

/** Native 0078/0079 rows: current ORM columns do not exist before upgrade. */
export async function seedHistoricalInternalOffer(input: {
  pool: Pool;
  companyId: string;
  opportunityId: string;
  clientId: string;
  preparerMembershipId: string;
  estimateVersionId: string;
  estimateVersionNumber: number;
  approvalDecisionId: string;
  key: string;
  payload: unknown;
}) {
  const offerId = randomUUID(),
    versionId = randomUUID();
  const client = await input.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO offers (workspace_id,company_id,id,opportunity_id,client_request_id,original_client_account_id,illustrative_reference,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
      SELECT o.workspace_id,o.company_id,$3,o.id,o.client_request_id,$5,1,m.internal_user_id,m.id,'2026-10-24T09:00:00Z'
      FROM opportunities o JOIN workspace_memberships m ON m.workspace_id=o.workspace_id AND m.id=$4 WHERE o.company_id=$1 AND o.id=$2`,
      [
        input.companyId,
        input.opportunityId,
        offerId,
        input.preparerMembershipId,
        input.clientId,
      ],
    );
    await client.query(
      `INSERT INTO offer_versions (workspace_id,company_id,id,offer_id,opportunity_id,client_request_id,original_client_account_id,version_number,pricing_snapshot_id,
      estimate_source_id,estimate_source_version_id,estimate_source_version_number,estimate_source_decision_id,estimate_source_decision_code,estimate_source_approved_at,estimate_source_amount,estimate_source_currency,
      recipient_client_account_id,recipient_kind,recipient_legal_name,recipient_tax_id,recipient_legal_address,issuing_company_label,validity_days,valid_until,scope_note,commercial_conditions,template_code,template_version,provenance,created_by_internal_user_id,created_by_workspace_membership_id,created_at)
      SELECT o.workspace_id,o.company_id,$3,o.id,o.opportunity_id,o.client_request_id,o.original_client_account_id,1,NULL,
      v.estimate_id,v.id,v.version_number,d.id,'APPROVE',d.decided_at,v.inputs->>'proposedPrice',v.inputs->>'currency',o.original_client_account_id,'PRIMARY',
      'Synthetic internal Offer Client','SYNTHETIC-842','842 Example Street','Synthetic internal Offer Company',30,'2026-11-23T09:00:00Z','Synthetic literal scope',NULL,NULL,NULL,'APPROVED_ESTIMATE_INTERNAL_DRAFT',o.created_by_internal_user_id,o.created_by_workspace_membership_id,o.created_at
      FROM offers o JOIN profitability_estimate_versions v ON v.workspace_id=o.workspace_id AND v.company_id=o.company_id AND v.opportunity_id=o.opportunity_id AND v.id=$4
      JOIN profitability_estimate_decisions d ON d.workspace_id=v.workspace_id AND d.company_id=v.company_id AND d.version_id=v.id AND d.id=$5
      WHERE o.company_id=$1 AND o.id=$2`,
      [
        input.companyId,
        offerId,
        versionId,
        input.estimateVersionId,
        input.approvalDecisionId,
      ],
    );
    await client.query(
      `INSERT INTO offer_commands (workspace_id,company_id,actor_workspace_membership_id,idempotency_key,fingerprint,opportunity_id,result_offer_id,kind,result_version_id,result_offer_revision,created_at)
      SELECT workspace_id,company_id,created_by_workspace_membership_id,$3,$4,opportunity_id,id,'CREATE_ESTIMATE_OFFER',$5,1,created_at FROM offers WHERE company_id=$1 AND id=$2`,
      [
        input.companyId,
        offerId,
        input.key,
        commandFingerprint({
          kind: 'CREATE_ESTIMATE_OFFER',
          opportunityId: input.opportunityId,
          payload: input.payload,
        }),
        versionId,
      ],
    );
    for (const event of [
      {
        action: 'offer.created',
        version: null,
        metadata: {
          offerId,
          illustrativeReference: 1,
          provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
        },
      },
      {
        action: 'offer_version.created',
        version: versionId,
        metadata: {
          offerId,
          offerVersionId: versionId,
          versionNumber: 1,
          recipientKind: 'PRIMARY',
          provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
          priceSourceKind: 'DIRECTOR_APPROVED_ESTIMATE',
          estimateVersionId: input.estimateVersionId,
          estimateVersionNumber: input.estimateVersionNumber,
          approvalDecisionId: input.approvalDecisionId,
        },
      },
    ])
      await client.query(
        `INSERT INTO offer_events (workspace_id,company_id,offer_id,offer_version_id,actor_internal_user_id,actor_workspace_membership_id,occurred_at,action,metadata)
      SELECT workspace_id,company_id,id,$3,created_by_internal_user_id,created_by_workspace_membership_id,created_at,$4,$5 FROM offers WHERE company_id=$1 AND id=$2`,
        [
          input.companyId,
          offerId,
          event.version,
          event.action,
          JSON.stringify(event.metadata),
        ],
      );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { offerId, versionId };
}
