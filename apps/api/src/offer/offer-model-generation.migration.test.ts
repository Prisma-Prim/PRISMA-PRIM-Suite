import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_DIRECTOR,
  ESTIMATE_OFFER_READER,
  estimateOfferIntent,
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from './offer-estimate-preparation.test-support.js';
import {
  seedHistoricalInternalOffer,
  seedLegacyOffer,
} from './offer-historical.test-fixture.js';
import {
  generatedOfferIntent,
  generatedOfferModelContent,
  prepareGeneratedOfferSource,
} from './offer-model-generation.test-fixture.js';

it.skipIf(!process.env.TEST_DATABASE_URL)(
  'upgrades genuine 0079 approved configuration, old captures and immutable commercial/Project history before explicit new-model opt-in',
  async () => {
    const previous = await mkdtemp(join(tmpdir(), 'model-offer-0079-'));
    let fixture:
      Awaited<ReturnType<typeof openEstimateOfferFixture>> | undefined;
    try {
      const journal = responseRecord(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      if (!Array.isArray(journal.entries)) throw new Error('Invalid journal.');
      const entries = journal.entries.map(responseRecord);
      const index = entries.findIndex(
        (entry) => entry.tag === '0080_model_offer_generation',
      );
      expect(index).toBe(80);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const entry of entries.slice(0, index)) {
        const tag = responseString(entry, 'tag');
        if (!/^\d{4}_[a-z0-9_-]+$/u.test(tag))
          throw new Error('Invalid migration tag.');
        await cp(join('drizzle', `${tag}.sql`), join(previous, `${tag}.sql`));
      }
      fixture = await openEstimateOfferFixture({
        migrationsFolder: previous,
        historicalOfferCaptures: { preparer: 'v2', approver: 'v1' },
      });
      const source = await prepareGeneratedOfferSource(fixture);
      const version2 = responseRecord(
        responseRecord(
          responseRecord(
            await fixture.command({
              path: '/offer-models/consulting-ro/versions',
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
              body: {
                expectedModelRevision: 2,
                content: {
                  ...generatedOfferModelContent,
                  serviceTitle: 'Synthetic old withdrawn version',
                },
              },
            }),
          ).model,
        ).head,
      );
      const version2Id = responseString(version2, 'id');
      await fixture.command({
        path: `/offer-models/consulting-ro/versions/${version2Id}/decision`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_DIRECTOR,
        body: {
          expectedModelRevision: 3,
          versionNumber: 2,
          outcome: 'APPROVE',
          basis: 'Synthetic historical approval',
        },
      });
      await fixture.command({
        path: `/offer-models/consulting-ro/versions/${version2Id}/withdrawal`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_DIRECTOR,
        body: {
          expectedModelRevision: 4,
          versionNumber: 2,
          reason: 'Synthetic historical withdrawal',
        },
      });
      const pendingModel = responseRecord(
        responseRecord(
          responseRecord(
            await fixture.command({
              path: '/offer-models/consulting-ro/versions',
              companyId: source.companyId,
              headers: ESTIMATE_OFFER_PREPARER,
              body: {
                expectedModelRevision: 5,
                content: {
                  ...generatedOfferModelContent,
                  serviceTitle: 'Synthetic pending historical version',
                },
              },
            }),
          ).model,
        ).head,
      );
      const pendingModelVersionId = responseString(pendingModel, 'id');
      const internal = await seedHistoricalInternalOffer({
        ...source,
        pool: fixture.pool,
        key: '0079-internal',
        payload: estimateOfferIntent(source),
      });
      const other = responseRecord(
        await fixture.command({
          path: '/commercial-intake/requests',
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: {
            clientAccountId: source.clientId,
            originalText: 'Synthetic old accepted commercial history',
            opportunity: {
              title: 'Synthetic old Contract',
              nextAction: 'Keep prior evidence',
            },
          },
        }),
      );
      const opportunityId = responseString(
        responseRecord(other.initialOpportunity),
        'id',
      );
      const snapshot = await fixture.illustrativeSnapshot(
        { ...source, opportunityId },
        true,
      );
      const { rows } = await fixture.pool.query<{
        userId: string;
        readerUserId: string;
      }>(
        `SELECT m.internal_user_id AS "userId",r.internal_user_id AS "readerUserId" FROM workspace_memberships m JOIN workspace_memberships r ON r.id=$2 WHERE m.id=$1`,
        [source.preparerMembershipId, source.readerMembershipId],
      );
      const actors = rows[0];
      if (!actors) throw new Error('Missing historical actors.');
      const legacy = await seedLegacyOffer({
        ...source,
        ...actors,
        pool: fixture.pool,
        opportunityId,
        requestId: responseString(other, 'id'),
        snapshot,
        reference: 2,
        accepted: true,
        contract: true,
      });
      // Exercise both historical origins and real constrained Project links.
      for (const accepted of [true, false]) {
        const request = responseRecord(
          await fixture.command({
            path: '/commercial-intake/requests',
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: {
              clientAccountId: source.clientId,
              originalText: 'Synthetic historical linked Contract',
              opportunity: {
                title: accepted
                  ? 'Synthetic ordinary Contract'
                  : 'Synthetic early-prepared Contract',
                nextAction: 'Preserve prior linked Project',
              },
            },
          }),
        );
        const linkedOpportunityId = responseString(
          responseRecord(request.initialOpportunity),
          'id',
        );
        const plainSnapshot = responseRecord(
          await fixture.command({
            path: `/pricing/opportunities/${linkedOpportunityId}/snapshots`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            body: {
              pricingRuleVersionNumber: snapshot.catalogue.ruleVersionNumber,
              lines: [
                {
                  offeringId: snapshot.catalogue.offeringId,
                  tariffVersionNumber: snapshot.catalogue.tariffVersionNumber,
                  quantity: '1',
                },
              ],
            },
          }),
        );
        await seedLegacyOffer({
          ...source,
          ...actors,
          pool: fixture.pool,
          opportunityId: linkedOpportunityId,
          requestId: responseString(request, 'id'),
          snapshot: plainSnapshot,
          reference: accepted ? 3 : 4,
          accepted,
          contract: true,
          linkedProject: true,
        });
      }
      expect(
        (
          await fixture.pool.query(
            'SELECT count(*)::integer AS count FROM contract_project_links',
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
      await fixture.pool.query(
        `INSERT INTO projects (workspace_id,company_id,client_account_id,title,created_by_internal_user_id,created_by_workspace_membership_id,idempotency_key) SELECT workspace_id,$2,$3,'Synthetic prior Project',internal_user_id,id,'0079-prior-project' FROM workspace_memberships WHERE id=$1`,
        [source.preparerMembershipId, source.companyId, source.clientId],
      );
      const tables = [
        'company_role_assignments',
        'company_context_assignment_commands',
        'offer_models',
        'offer_model_versions',
        'offer_model_decisions',
        'offer_model_withdrawals',
        'offer_model_events',
        'offer_model_commands',
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
        'projects',
      ] as const;
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
      await fixture.restart();
      for (const table of tables) {
        const projection =
          table === 'offer_versions'
            ? "to_jsonb(t) - ARRAY['model_source_id','model_source_version_id','model_source_version_number','model_source_decision_id','model_source_decision_outcome','model_generation_snapshot']::text[]"
            : table === 'contract_versions'
              ? "to_jsonb(t)-ARRAY['model_source_id','model_source_version_id','model_source_version_number','model_source_decision_id','model_source_decision_outcome','model_generation_snapshot']"
              : table === 'contract_decisions'
                ? "to_jsonb(t)-ARRAY['review_basis']"
                : 'to_jsonb(t)';
        expect(
          (
            await fixture.pool.query(
              `SELECT ${projection} AS row FROM ${table} t ORDER BY id`,
            )
          ).rows,
          table,
        ).toEqual(before.get(table));
      }
      const path = `/offers/opportunities/${source.opportunityId}`;
      const read = responseRecord(
        responseRecord(
          await fixture.read({
            path,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ).offer,
      );
      expect(read).toMatchObject({
        id: internal.offerId,
        version: {
          id: internal.versionId,
          provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT',
          priceSource: { taxTreatment: 'UNSPECIFIED' },
        },
      });
      const old = responseRecord(
        responseRecord(
          await fixture.read({
            path: `/offers/opportunities/${opportunityId}`,
            companyId: source.companyId,
            headers: ESTIMATE_OFFER_READER,
          }),
        ).offer,
      );
      expect(responseRecord(old.version).representation).toEqual(
        legacy.representation,
      );
      expect(old).toMatchObject({
        version: {
          decisionState: 'APPROVED',
          transmissionState: 'TRANSMITTED',
          clientResponseState: 'ACCEPTED',
        },
      });
      expect(
        await fixture.command({
          path: `${path}/from-approved-estimate`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          key: '0079-internal',
          body: estimateOfferIntent(source),
        }),
      ).toMatchObject({
        id: internal.offerId,
        version: { id: internal.versionId },
      });
      const command = {
        path: `${path}/versions/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          ...generatedOfferIntent({
            ...source,
            modelVersionId: pendingModelVersionId,
            modelVersionNumber: 3,
          }),
          expectedOfferRevision: 1,
        },
      };
      expect((await fixture.post(command)).status).toBe(403);
      expect(
        await fixture.grant({
          path: '/company-offer-preparer-assignments',
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        }),
      ).toMatchObject({ permissionSetVersion: 'v2' });
      expect((await fixture.post(command)).status).toBe(403);
      const revoked = await fixture.request({
        path: `/company-offer-preparer-assignments/${source.preparerMembershipId}/${source.companyId}`,
        init: {
          method: 'DELETE',
          headers: { 'idempotency-key': '0079-explicit-revoke' },
        },
      });
      expect(revoked.status).toBe(200);
      expect(
        await fixture.grant({
          path: '/company-offer-preparer-assignments',
          companyId: source.companyId,
          membershipId: source.preparerMembershipId,
        }),
      ).toMatchObject({ permissionSetVersion: 'v3' });
      await fixture.command({
        path: `/offer-models/consulting-ro/versions/${pendingModelVersionId}/decision`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_DIRECTOR,
        body: {
          expectedModelRevision: 6,
          versionNumber: 3,
          outcome: 'APPROVE',
          basis: 'Synthetic explicit post-upgrade approval',
        },
      });
      const generated = responseRecord(await fixture.command(command));
      expect(generated).toMatchObject({
        id: internal.offerId,
        revision: 2,
        version: {
          versionNumber: 2,
          provenance: 'COMPANY_MODEL_ESTIMATE',
          modelSource: { versionId: pendingModelVersionId, versionNumber: 3 },
          financialDeclaration: { netAmount: '125.00', grossAmount: '150.00' },
        },
      });
      await fixture.applyCurrentMigrations();
    } finally {
      await fixture?.close();
      await rm(previous, { recursive: true, force: true });
    }
  },
  30_000,
);
