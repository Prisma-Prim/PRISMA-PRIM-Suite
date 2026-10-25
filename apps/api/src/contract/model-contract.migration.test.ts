import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareGeneratedOfferWorkflow } from '../offer/offer-model-generation.test-fixture.js';
import { seedLegacyOffer } from '../offer/offer-historical.test-fixture.js';
import { generatedContractModelContent } from './model-contract.test-fixture.js';
import { seedPreModelAgreement } from './model-contract-legacy.test-fixture.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0081 with old origins, all quality versions, executed links, model states and full Offer bytes without expanding captures or rewriting historical facts',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'model-contract-0081-'));
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries)) throw new Error('Invalid journal');
      const entries = journal.entries.map(responseRecord),
        index = entries.findIndex(
          (e) => e.tag === '0082_model_contract_generation',
        );
      expect(index).toBe(82);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = responseString(entry, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag');
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      }
      fixture = await openEstimateOfferFixture({ migrationsFolder: previous });
      const flow = await prepareGeneratedOfferWorkflow(fixture, 'TRANSMITTED'),
        { source } = flow;
      // These columns really do not exist yet; latest Contract ORM cannot seed them.
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='contract_versions' AND column_name='model_generation_snapshot'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      const actors = await fixture.pool.query<{
        userId: string;
        readerUserId: string;
      }>(
        'SELECT m.internal_user_id AS "userId",r.internal_user_id AS "readerUserId" FROM workspace_memberships m JOIN workspace_memberships r ON r.id=$2 WHERE m.id=$1',
        [source.preparerMembershipId, source.readerMembershipId],
      );
      const actor = actors.rows[0];
      if (!actor) throw new Error('Missing historical actors');
      for (const bundle of [
        'company_contract_preparer',
        'company_contract_approver',
      ])
        await fixture.pool.query(
          `WITH a AS(INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES($1,$2,$3,$4,'v1') RETURNING id) INSERT INTO company_context_assignment_commands(workspace_id,actor_workspace_membership_id,bundle,idempotency_key,operation,target_workspace_membership_id,company_id,result_assignment_id) SELECT $1,$3,$4,$5,'grant',$3,$2,id FROM a`,
          [
            ESTIMATE_OFFER_WORKSPACE,
            source.companyId,
            source.preparerMembershipId,
            bundle,
            'old-' + bundle,
          ],
        );
      for (const role of ['editor', 'approver'])
        await fixture.grant({
          path: `/company-contract-model-${role}-assignments`,
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        });
      const modelCommand = (path: string, body: unknown) =>
        fixture?.command({
          path,
          body,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        });
      let revision = 0;
      for (const outcome of ['APPROVE', 'WITHDRAW', 'REJECT', 'PENDING']) {
        const submitted = responseRecord(
            responseRecord(
              await modelCommand('/contract-models/consulting-ro/versions', {
                expectedModelRevision: revision,
                content: {
                  ...generatedContractModelContent,
                  title: 'Synthetic pre-0082 ' + outcome,
                },
              }),
            ).model,
          ),
          head = responseRecord(submitted.head);
        revision++;
        if (outcome !== 'PENDING') {
          await modelCommand(
            `/contract-models/consulting-ro/versions/${responseString(head, 'id')}/decision`,
            {
              expectedModelRevision: revision,
              versionNumber: head.versionNumber,
              outcome: outcome === 'REJECT' ? 'REJECT' : 'APPROVE',
              basis: 'Synthetic historical complete wording review',
            },
          );
          revision++;
          if (outcome === 'WITHDRAW') {
            await modelCommand(
              `/contract-models/consulting-ro/versions/${responseString(head, 'id')}/withdrawal`,
              {
                expectedModelRevision: revision,
                versionNumber: head.versionNumber,
                reason: 'Synthetic historical retirement',
              },
            );
            revision++;
          }
        }
      }
      const newRequest = async (label: string) => {
        if (!fixture) throw new Error('Missing historical fixture');
        const request = responseRecord(
          await fixture.command({
            path: '/commercial-intake/requests',
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: {
              clientAccountId: source.clientId,
              originalText: 'Synthetic historical ' + label,
              opportunity: {
                title: 'Synthetic ' + label,
                nextAction: 'Preserve exact prior facts',
              },
            },
          }),
        );
        return {
          ...source,
          ...actor,
          requestId: responseString(request, 'id'),
          opportunityId: responseString(
            responseRecord(request.initialOpportunity),
            'id',
          ),
          pool: fixture.pool,
        };
      };
      let catalogue: Record<string, unknown> | undefined;
      const historicalSnapshot = async (
        target: Awaited<ReturnType<typeof newRequest>>,
        adjusted: boolean,
      ) => {
        if (!fixture) throw new Error('Missing historical fixture');
        if (!catalogue) {
          const snapshot = await fixture.illustrativeSnapshot(target, adjusted);
          catalogue = snapshot.catalogue;
          return snapshot;
        }
        if (adjusted)
          await fixture.grant({
            path: '/company-pricing-adjustment-assignments',
            companyId: source.companyId,
            membershipId: source.preparerMembershipId,
          });
        return responseRecord(
          await fixture.command({
            path: `/pricing/opportunities/${target.opportunityId}/snapshots`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: {
              pricingRuleVersionNumber: catalogue.ruleVersionNumber,
              lines: [
                {
                  offeringId: catalogue.offeringId,
                  tariffVersionNumber: catalogue.tariffVersionNumber,
                  quantity: '1',
                  ...(adjusted
                    ? {
                        adjustment: {
                          type: 'FIXED_NET_DISCOUNT',
                          netReduction: '10.00',
                          reason: 'Synthetic fixed reduction',
                        },
                      }
                    : {}),
                },
              ],
            },
          }),
        );
      };
      const agreements: {
        opportunityId: string;
        contractId: string;
        versionId: string;
        representation?: unknown;
        kind: 'CONTRACT' | 'PRECONTRACT' | 'ADDENDUM';
      }[] = [];
      let ordinaryParent: string | undefined;
      for (const accepted of [true, false]) {
        const target = await newRequest(accepted ? 'accepted' : 'early'),
          snapshot = await historicalSnapshot(target, false);
        const old = await seedLegacyOffer({
          ...target,
          snapshot,
          reference: accepted ? 2 : 3,
          accepted,
          contract: true,
          linkedProject: true,
        });
        const rows = await fixture.pool.query<{
          contractId: string;
          versionId: string;
        }>(
          'SELECT c.id AS "contractId",v.id AS "versionId" FROM contracts c JOIN contract_versions v ON v.contract_id=c.id WHERE c.opportunity_id=$1',
          [target.opportunityId],
        );
        const bound = rows.rows[0];
        if (!bound) throw new Error('Missing prior Contract');
        agreements.push({
          ...bound,
          opportunityId: target.opportunityId,
          representation: old.contractRepresentation,
          kind: 'CONTRACT',
        });
        if (accepted) {
          ordinaryParent = bound.contractId;
          const addendum = await seedPreModelAgreement({
            ...target,
            membershipId: source.preparerMembershipId,
            userId: actor.userId,
            kind: 'ADDENDUM',
            parentContractId: bound.contractId,
            snapshotId: null,
            reference: 1,
          });
          agreements.push({
            ...addendum,
            opportunityId: target.opportunityId,
            kind: 'ADDENDUM',
          });
        }
      }
      expect(ordinaryParent).toBeDefined();
      const directTarget = await newRequest('direct adjusted'),
        directSnapshot = await historicalSnapshot(directTarget, true);
      const direct = await seedPreModelAgreement({
        ...directTarget,
        membershipId: source.preparerMembershipId,
        userId: actor.userId,
        kind: 'DIRECT',
        snapshotId: responseString(directSnapshot, 'id'),
        reference: 4,
      });
      agreements.push({
        ...direct,
        opportunityId: directTarget.opportunityId,
        kind: 'CONTRACT',
      });
      const preliminary = await newRequest('precontract'),
        preSnapshot = await historicalSnapshot(preliminary, false);
      await seedLegacyOffer({
        ...preliminary,
        snapshot: preSnapshot,
        reference: 4,
        accepted: true,
        contract: false,
      });
      const offers = await fixture.pool.query<{
        offerId: string;
        offerVersionId: string;
      }>(
        'SELECT o.id AS "offerId",v.id AS "offerVersionId" FROM offers o JOIN offer_versions v ON v.offer_id=o.id WHERE o.opportunity_id=$1',
        [preliminary.opportunityId],
      );
      const accepted = offers.rows[0];
      if (!accepted) throw new Error('Missing accepted precontract source');
      const precontract = await seedPreModelAgreement({
        ...preliminary,
        ...accepted,
        membershipId: source.preparerMembershipId,
        userId: actor.userId,
        kind: 'PRECONTRACT',
        snapshotId: responseString(preSnapshot, 'id'),
        reference: 1,
      });
      agreements.push({
        ...precontract,
        opportunityId: preliminary.opportunityId,
        kind: 'PRECONTRACT',
      });
      expect(
        (
          await fixture.pool.query(
            'SELECT DISTINCT rule_set_version AS version FROM contract_quality_runs ORDER BY version',
          )
        ).rows,
      ).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }]);
      const tables = [
        'company_role_assignments',
        'company_context_assignment_commands',
        'contract_models',
        'contract_model_versions',
        'contract_model_decisions',
        'contract_model_withdrawals',
        'contract_model_commands',
        'contract_model_events',
        'offers',
        'offer_versions',
        'offer_commands',
        'offer_events',
        'offer_quality_runs',
        'offer_decisions',
        'offer_transmissions',
        'offer_client_responses',
        'contracts',
        'contract_versions',
        'contract_commands',
        'contract_events',
        'contract_quality_runs',
        'contract_decisions',
        'contract_signatures',
        'contract_project_links',
        'contract_reference_counters',
        'projects',
      ] as const;
      const added = {
        contract_versions: [
          'model_source_id',
          'model_source_version_id',
          'model_source_version_number',
          'model_source_decision_id',
          'model_source_decision_outcome',
          'model_generation_snapshot',
        ],
        contract_decisions: ['review_basis'],
      };
      const before = new Map<string, unknown>();
      for (const table of tables)
        before.set(
          table,
          (
            await fixture.pool.query(
              `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`,
            )
          ).rows,
        );
      const generatedBefore = await fixture.read({
        path: flow.path,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
      });
      await fixture.applyCurrentMigrations();
      await fixture.restart();
      for (const table of tables) {
        const fields =
          table === 'contract_versions'
            ? added.contract_versions
            : table === 'contract_decisions'
              ? added.contract_decisions
              : [];
        const projection = fields.length
          ? `to_jsonb(t)-ARRAY[${fields.map((f) => "'" + f + "'").join(',')}]`
          : 'to_jsonb(t)';
        expect(
          (
            await fixture.pool.query(
              `SELECT ${projection} AS row FROM ${table} t ORDER BY ${projection}::text`,
            )
          ).rows,
          table,
        ).toEqual(before.get(table));
      }
      expect(
        await fixture.read({
          path: flow.path,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
        }),
      ).toEqual(generatedBefore);
      for (const agreement of agreements) {
        const path = `/contracts/opportunities/${agreement.opportunityId}${agreement.kind === 'CONTRACT' ? '' : '/agreements/' + agreement.contractId}/versions/${agreement.versionId}`;
        const detail = responseRecord(
          responseRecord(
            await fixture.read({
              path,
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
            }),
          ).contract,
        );
        expect(detail.kind).toBe(agreement.kind);
        if (agreement.representation)
          expect(
            responseRecord(
              await fixture.read({
                path: path + '/representation',
                companyId: source.companyId,
                headers: ESTIMATE_OFFER_PREPARER,
              }),
            ),
          ).toMatchObject(responseRecord(agreement.representation));
      }
      const replay = responseRecord(
        await fixture.command({
          path: `/contracts/opportunities/${directTarget.opportunityId}/direct`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          key: direct.key,
          body: direct.payload,
        }),
      );
      expect(replay).toMatchObject({
        id: direct.contractId,
        version: { id: direct.versionId },
      });
      for (const role of ['preparer', 'approver'])
        expect(
          await fixture.grant({
            path: `/company-contract-${role}-assignments`,
            companyId: source.companyId,
            membershipId: source.preparerMembershipId,
          }),
        ).toMatchObject({ permissionSetVersion: 'v1' });
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*)::int AS count FROM contract_versions WHERE provenance='COMPANY_MODEL_OFFER'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::int AS count FROM contract_versions WHERE model_generation_snapshot IS NOT NULL',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      await fixture.applyCurrentMigrations();
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  60_000,
);
