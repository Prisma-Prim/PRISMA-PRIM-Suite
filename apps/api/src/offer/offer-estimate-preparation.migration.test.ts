import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { seedLegacyOffer } from './offer-historical.test-fixture.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
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
        historicalOfferCaptures: { preparer: 'v1', approver: 'v1' },
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
            ? `SELECT to_jsonb(t) - ARRAY['estimate_source_id','estimate_source_version_id','estimate_source_version_number','estimate_source_decision_id','estimate_source_decision_code','estimate_source_approved_at','estimate_source_amount','estimate_source_currency','model_source_id','model_source_version_id','model_source_version_number','model_source_decision_id','model_source_decision_outcome','model_generation_snapshot']::text[] AS row FROM offer_versions t ORDER BY id`
            : table === 'contract_versions'
              ? `SELECT to_jsonb(t)-ARRAY['model_source_id','model_source_version_id','model_source_version_number','model_source_decision_id','model_source_decision_outcome','model_generation_snapshot'] AS row FROM ${table} t ORDER BY id`
              : table === 'contract_decisions'
                ? `SELECT to_jsonb(t)-ARRAY['review_basis'] AS row FROM ${table} t ORDER BY id`
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
      ).toMatchObject({ permissionSetVersion: 'v3' });
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
