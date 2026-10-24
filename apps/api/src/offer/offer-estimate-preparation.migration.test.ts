import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  renderContractRepresentation,
  CONTRACT_CLAUSE_VERSIONS,
} from '../contract/contract-representation.js';
import {
  renderOfferRepresentation,
  type RenderOfferRepresentationInput,
} from './offer-representation.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0077 legacy Offers, both price bindings, execution evidence, Contracts and captured v1 receipts without changing their content',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'estimate-offer-upgrade-'));
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries)) throw new Error('Invalid journal.');
      const entries = journal.entries.map(responseRecord);
      const index = entries.findIndex(
        (entry) => entry.tag === '0078_approved_estimate_offer',
      );
      expect(index).toBe(78);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = responseString(entry, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await openEstimateOfferFixture({
        migrationsFolder: previous,
        legacyPreparer: true,
      });
      const source = await fixture.prepare();
      const plain = await fixture.illustrativeSnapshot(source);
      const catalogue = responseRecord(plain.catalogue);
      await fixture.grant({
        path: '/company-pricing-adjustment-assignments',
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
      const adjusted = responseRecord(
        await fixture.command({
          path: `/pricing/opportunities/${source.opportunityId}/snapshots`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            pricingRuleVersionNumber: catalogue.ruleVersionNumber,
            lines: [
              {
                offeringId: catalogue.offeringId,
                tariffVersionNumber: catalogue.tariffVersionNumber,
                quantity: '1',
                adjustment: {
                  type: 'FIXED_NET_DISCOUNT',
                  netReduction: '10.00',
                  reason: 'Synthetic fixed reduction',
                },
              },
            ],
          },
        }),
      );
      const other = responseRecord(
        await fixture.command({
          path: '/commercial-intake/requests',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            clientAccountId: source.clientId,
            originalText: 'Synthetic early Contract Request',
            opportunity: {
              title: 'Synthetic early preparation',
              nextAction: 'Prepare pending-acceptance Contract',
            },
          },
        }),
      );
      const otherOpportunity = responseString(
        responseRecord(other.initialOpportunity),
        'id',
      );
      const otherPrice = responseRecord(
        await fixture.command({
          path: `/pricing/opportunities/${otherOpportunity}/snapshots`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            pricingRuleVersionNumber: catalogue.ruleVersionNumber,
            lines: [
              {
                offeringId: catalogue.offeringId,
                tariffVersionNumber: catalogue.tariffVersionNumber,
                quantity: '1',
              },
            ],
          },
        }),
      );
      const legacyRows = await fixture.pool.query<{
        requestId: string;
        userId: string;
        readerUserId: string;
      }>(
        `SELECT o.client_request_id AS "requestId", m.internal_user_id AS "userId", r.internal_user_id AS "readerUserId"
      FROM opportunities o JOIN workspace_memberships m ON m.id=$2 JOIN workspace_memberships r ON r.id=$3 WHERE o.id=$1`,
        [
          source.opportunityId,
          source.preparerMembershipId,
          source.readerMembershipId,
        ],
      );
      const actors = legacyRows.rows[0];
      if (!actors) throw new Error('Missing synthetic legacy identities.');
      const seeds = [
        await seedLegacyOffer({
          pool: fixture.pool,
          ...source,
          ...actors,
          snapshot: plain,
          reference: 1,
          accepted: false,
          contract: false,
        }),
      ];
      // A different Opportunity keeps both an ordinary accepted Contract and the
      // independently constrained early preparation Contract in real old schema.
      const third = responseRecord(
        await fixture.command({
          path: '/commercial-intake/requests',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            clientAccountId: source.clientId,
            originalText: 'Synthetic accepted Contract Request',
            opportunity: {
              title: 'Synthetic ordinary Contract',
              nextAction: 'Prepare accepted-Offer Contract',
            },
          },
        }),
      );
      const thirdOpportunity = responseString(
        responseRecord(third.initialOpportunity),
        'id',
      );
      const thirdPrice = responseRecord(
        await fixture.command({
          path: `/pricing/opportunities/${thirdOpportunity}/snapshots`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            pricingRuleVersionNumber: catalogue.ruleVersionNumber,
            lines: [
              {
                offeringId: catalogue.offeringId,
                tariffVersionNumber: catalogue.tariffVersionNumber,
                quantity: '1',
                adjustment: {
                  type: 'FIXED_NET_DISCOUNT',
                  netReduction: '10.00',
                  reason: 'Synthetic fixed reduction',
                },
              },
            ],
          },
        }),
      );
      seeds.push(
        await seedLegacyOffer({
          pool: fixture.pool,
          ...source,
          ...actors,
          opportunityId: thirdOpportunity,
          requestId: responseString(third, 'id'),
          snapshot: thirdPrice,
          reference: 2,
          accepted: true,
          contract: true,
        }),
      );
      seeds.push(
        await seedLegacyOffer({
          pool: fixture.pool,
          ...source,
          ...actors,
          opportunityId: otherOpportunity,
          requestId: responseString(other, 'id'),
          snapshot: otherPrice,
          reference: 3,
          accepted: false,
          contract: true,
        }),
      );
      void adjusted;
      const tables = [
        'offers',
        'offer_versions',
        'offer_quality_runs',
        'offer_decisions',
        'offer_transmissions',
        'offer_client_responses',
        'offer_commands',
        'offer_events',
        'contracts',
        'contract_versions',
        'contract_commands',
        'contract_events',
        'pricing_snapshots',
        'pricing_snapshot_lines',
        'company_role_assignments',
        'company_context_assignment_commands',
      ];
      const before = new Map<string, unknown>();
      for (const table of tables)
        before.set(
          table,
          (
            await fixture.pool.query(
              `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`,
            )
          ).rows,
        );
      await fixture.applyCurrentMigrations();
      for (const table of tables) {
        const query =
          table === 'offer_versions'
            ? `SELECT to_jsonb(t) - ARRAY['estimate_source_id','estimate_source_version_id','estimate_source_version_number','estimate_source_decision_id','estimate_source_decision_code','estimate_source_approved_at','estimate_source_amount','estimate_source_currency']::text[] AS row FROM offer_versions t ORDER BY id`
            : `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`;
        expect((await fixture.pool.query(query)).rows, table).toEqual(
          before.get(table),
        );
      }
      for (const seeded of seeds) {
        const read = responseRecord(
          responseRecord(
            await fixture.read({
              path: `/offers/opportunities/${seeded.opportunityId}`,
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_READER,
            }),
          ).offer,
        );
        expect(responseRecord(read.version).representation).toEqual(
          seeded.representation,
        );
        expect(read).toMatchObject({
          version: {
            pricingSnapshotId: seeded.snapshotId,
            decisionState: 'APPROVED',
            transmissionState: 'TRANSMITTED',
            clientResponseState: seeded.accepted ? 'ACCEPTED' : 'PENDING',
          },
        });
      }
      await fixture.grant({
        path: '/company-contract-preparer-assignments',
        companyId: source.companyId,
        membershipId: source.preparerMembershipId,
      });
      for (const seeded of seeds.filter((seed) => seed.contract)) {
        const read = responseRecord(
          await fixture.read({
            path: `/contracts/opportunities/${seeded.opportunityId}`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
          }),
        );
        expect(
          responseRecord(responseRecord(read.contract).version).representation,
        ).toEqual(seeded.contractRepresentation);
        expect(read.contract).toMatchObject({
          origin: seeded.accepted ? 'ACCEPTED_OFFER' : 'OFFER_PREPARATION',
          version: { pricingSnapshotId: seeded.snapshotId },
        });
      }
      const receipt = await fixture.command({
        path: '/company-offer-preparer-assignments',
        key: 'legacy-preparer-grant',
        body: {
          companyId: source.companyId,
          workspaceMembershipId: source.preparerMembershipId,
        },
      });
      expect(receipt).toMatchObject({ permissionSetVersion: 'v1' });
      expect(
        await fixture.grant({
          path: '/company-offer-preparer-assignments',
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        }),
      ).toMatchObject({ permissionSetVersion: 'v1' });
      const revoke = await fixture.request({
        path: `/company-offer-preparer-assignments/${source.preparerMembershipId}/${source.companyId}`,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': 'upgrade-revoke' },
        },
      });
      expect(revoke.status).toBe(200);
      expect(
        await fixture.grant({
          path: '/company-offer-preparer-assignments',
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        }),
      ).toMatchObject({ permissionSetVersion: 'v2' });
      expect(
        await fixture.command({
          path: '/company-offer-preparer-assignments',
          key: 'legacy-preparer-grant',
          body: {
            companyId: source.companyId,
            workspaceMembershipId: source.preparerMembershipId,
          },
        }),
      ).toMatchObject({ permissionSetVersion: 'v1', active: true });
      await fixture.applyCurrentMigrations();
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
);

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
};
async function seedLegacyOffer(input: Seed) {
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
