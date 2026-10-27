import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareContractMissionPlan,
  contractMissionEffects,
} from './contract-mission-plan.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Configured Contract mission existing agreement and bounded candidate rules',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => fixture.reset());
    afterAll(async () => fixture?.close());
    it('retains unexecuted and Addendum refusal and supports an eligible native Precontract', async () => {
      const f = await prepareContractMissionPlan(fixture),
        pending = await f.ready.newOpportunity('Synthetic unexecuted Contract');
      await f.ready.direct(pending);
      const pendingPath = `/contracts/opportunities/${pending.opportunityId}`;
      const before = await contractMissionEffects(fixture);
      const refused = await fixture.post({
        ...f.target,
        path: pendingPath + '/projects/create-from-mission-plan',
        body: { ...f.body, expectedContractRevision: 1 },
      });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({
        code: 'CONTRACT_NOT_EXECUTED',
      });
      expect(await contractMissionEffects(fixture)).toEqual(before);
      const addendum = responseRecord(
        await f.ready.invoke(
          `${f.path}/agreements/${responseString(f.contract, 'id')}/addenda`,
          {
            expectedContractRevision: 3,
            changeSummary: 'Synthetic bounded amendment',
          },
        ),
      );
      const denied = await fixture.post({
        ...f.target,
        path: `${f.path}/agreements/${responseString(addendum, 'id')}/projects/create-from-mission-plan`,
        body: { ...f.body, expectedContractRevision: 1 },
      });
      expect(denied.status).toBe(409);
      expect(await denied.json()).toMatchObject({
        code: 'CONTRACT_KIND_NOT_LINKABLE',
      });
      const preliminary = await f.ready.newOpportunity(
          'Synthetic eligible Precontract',
        ),
        offerVersion = await f.ready.offer(preliminary, true);
      const created = responseRecord(
        await f.ready.invoke(
          `/contracts/opportunities/${preliminary.opportunityId}`,
          {
            acceptedOfferVersionId: offerVersion,
            kind: 'PRECONTRACT',
            preliminaryWorkScope: 'Synthetic preliminary work',
            preliminaryFinancialConditions: 'Synthetic bounded cost',
            preliminaryLimits: 'Synthetic temporary limits',
            termEndsOn: '2026-12-31',
          },
        ),
      );
      const path = `/contracts/opportunities/${preliminary.opportunityId}/agreements/${responseString(created, 'id')}`,
        versionId = responseString(responseRecord(created.version), 'id');
      await f.ready.invoke(`${path}/versions/${versionId}/approve`, {
        expectedContractRevision: 1,
        acknowledgedWarningCodes: ['ADDED_CONDITIONS_CONFIRMED'],
      });
      await f.ready.invoke(`${path}/versions/${versionId}/signature`, {
        expectedContractRevision: 2,
        providerSignatoryLabel: 'Synthetic provider',
        clientSignatoryLabel: 'Synthetic Client',
        providerSignedOn: '2026-10-24',
        clientSignedOn: '2026-10-24',
        note: null,
        acknowledgedWarningCodes: [],
      });
      const mission = await fixture.post({
        ...f.target,
        path: path + '/projects/create-from-mission-plan',
        body: f.body,
      });
      expect(mission.status).toBe(201);
      expect(await mission.json()).toMatchObject({
        link: { contractId: created.id, revision: 4, created: true },
      });
    });
    it.each(['candidates', 'capacity'])(
      'preserves the native fifty-Project %s refusal without any partial configured work',
      async (kind) => {
        const f = await prepareContractMissionPlan(fixture),
          ids: string[] = [];
        for (let n = 0; n < (kind === 'candidates' ? 51 : 50); n++) {
          const project = responseRecord(
            await fixture.command({
              ...f.target,
              path: '/projects',
              body: {
                title: 'Synthetic existing work ' + n,
                clientAccountId: f.ready.source.clientId,
              },
            }),
          );
          const id = responseString(project, 'id');
          ids.push(id);
          if (kind === 'capacity')
            await fixture.command({
              ...f.target,
              path: f.path + '/projects',
              body: { projectId: id, expectedContractRevision: 3 + n },
            });
        }
        const before = await contractMissionEffects(fixture),
          refused = await f.create({
            ...f.body,
            expectedContractRevision: kind === 'capacity' ? 53 : 3,
            acknowledgedCandidateProjectIds: ids.slice(0, 50),
          });
        expect(refused.status).toBe(409);
        expect(await refused.json()).toMatchObject({
          code:
            kind === 'capacity'
              ? 'CONTRACT_PROJECT_LINK_CAPACITY_EXCEEDED'
              : 'PROJECT_CANDIDATE_LIMIT',
        });
        expect(await contractMissionEffects(fixture)).toEqual(before);
      },
      30_000,
    );
    it('fails closed for an unknown or absent captured User version before creation or replay', async () => {
      const f = await prepareContractMissionPlan(fixture);
      expect((await f.create()).status).toBe(201);
      const before = await contractMissionEffects(fixture),
        definition = (
          await fixture.pool.query<{ definition: string }>(
            "SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
          )
        ).rows[0]?.definition;
      if (!definition) throw new Error('Missing captured version constraint.');
      await fixture.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        for (const version of [null, 'v2']) {
          await fixture.pool.query(
            "UPDATE company_role_assignments SET permission_set_version=$1 WHERE bundle='company_mission_plan_user' AND company_id=$2",
            [version, f.target.companyId],
          );
          expect((await f.create()).status).toBe(403);
          expect((await f.create(f.body, 'unknown-new')).status).toBe(403);
          expect(await contractMissionEffects(fixture)).toEqual(before);
        }
      } finally {
        await fixture.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE bundle='company_mission_plan_user' AND company_id=$1",
          [f.target.companyId],
        );
        await fixture.pool.query(
          'ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ' +
            definition,
        );
      }
    });
  },
);
