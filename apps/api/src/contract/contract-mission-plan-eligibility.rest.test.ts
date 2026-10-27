import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareContractMissionPlan,
  publishContractMissionPlan,
  contractMissionEffects,
} from './contract-mission-plan.test-support.js';
import { prepareReportedSigning } from './reported-contract-signing.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres(
  'Configured Contract mission native eligibility and history',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
      });
    });
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });
    it('uses Company-model signing qualification and creates only after the native declaration', async () => {
      const f = await prepareReportedSigning(fixture),
        ready = f.f.ready;
      const source = await publishContractMissionPlan({
        fixture,
        companyId: ready.source.companyId,
        membershipId: ready.source.preparerMembershipId,
      });
      const body = {
        title: 'Synthetic signed model mission',
        expectedContractRevision: 2,
        acknowledgedCandidateProjectIds: [],
        missionPlan: {
          planId: responseString(source, 'planId'),
          versionId: responseString(source, 'id'),
          versionNumber: 1,
        },
      };
      const path = ready.path + '/projects/create-from-mission-plan';
      const before = await contractMissionEffects(fixture);
      const denied = await fixture.post({ ...f.target, path, body });
      expect(denied.status).toBe(409);
      expect(await denied.json()).toMatchObject({
        code: 'CONTRACT_EXECUTION_MODE_UNSUPPORTED',
      });
      expect(await contractMissionEffects(fixture)).toEqual(before);
      await fixture.command({ ...f.target, path: f.path, body: f.body });
      const created = await fixture.post({
        ...f.target,
        path,
        body: { ...body, expectedContractRevision: 3 },
      });
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({
        project: { clientAccountId: ready.source.clientId },
        link: { revision: 4, created: true },
      });
    });
    it('requires exact current candidates and Contract revision before creating', async () => {
      const f = await prepareContractMissionPlan(fixture);
      const existing = responseRecord(
        await fixture.command({
          ...f.target,
          path: '/projects',
          body: {
            title: 'Existing synthetic work',
            clientAccountId: f.ready.source.clientId,
          },
        }),
      );
      const id = responseString(existing, 'id'),
        before = await contractMissionEffects(fixture);
      const changed = await f.create();
      expect(changed.status).toBe(409);
      expect(await changed.json()).toMatchObject({
        code: 'PROJECT_CANDIDATES_CHANGED',
      });
      const stale = await f.create({
        ...f.body,
        acknowledgedCandidateProjectIds: [id],
        expectedContractRevision: 2,
      });
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({
        code: 'STALE_CONTRACT_REVISION',
      });
      expect(await contractMissionEffects(fixture)).toEqual(before);
      expect(
        (await f.create({ ...f.body, acknowledgedCandidateProjectIds: [id] }))
          .status,
      ).toBe(201);
    });
    it('replays the original source and link after native Project closure without fresh candidate or revision gates', async () => {
      const f = await prepareContractMissionPlan(fixture),
        first = await f.create();
      expect(first.status).toBe(201);
      const created = responseRecord(await first.json()),
        id = responseString(responseRecord(created.project), 'id');
      const copy = await fixture.read({
        ...f.target,
        path: `/projects/${id}/mission-plan`,
      });
      const copied = responseRecord(responseRecord(copy).plan);
      if (!Array.isArray(copied.tasks))
        throw new Error('Missing exact native Tasks.');
      for (const row of copied.tasks)
        await fixture.command({
          ...f.target,
          path: `/tasks/${responseString(responseRecord(row), 'taskId')}/complete`,
          body: { expectedVersion: 1 },
        });
      await fixture.grant({
        path: '/company-project-approver-assignments',
        companyId: f.target.companyId,
        membershipId: f.ready.source.preparerMembershipId,
      });
      const closed = await fixture.post({
        ...f.target,
        path: `/projects/${id}/lifecycle-transitions`,
        body: {
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Synthetic closure',
        },
      });
      expect(closed.status).toBe(200);
      const before = await contractMissionEffects(fixture),
        replayed = await f.create();
      expect(replayed.status).toBe(201);
      expect(await replayed.json()).toEqual(created);
      expect(
        await fixture.read({
          ...f.target,
          path: `/projects/${id}/mission-plan`,
        }),
      ).toEqual(copy);
      expect(await contractMissionEffects(fixture)).toEqual(before);
    });
    it('does not disclose a real foreign Company source and preserves the native manual command namespace', async () => {
      const f = await prepareContractMissionPlan(fixture),
        other = await fixture.prepare({ clientTaxId: 'SYNTHETIC-FOREIGN-925' });
      const foreign = await publishContractMissionPlan({
        fixture,
        companyId: other.companyId,
        membershipId: other.preparerMembershipId,
      });
      const before = await contractMissionEffects(fixture),
        denied = await f.create({
          ...f.body,
          missionPlan: {
            planId: responseString(foreign, 'planId'),
            versionId: responseString(foreign, 'id'),
            versionNumber: 1,
          },
        });
      expect(denied.status).toBe(404);
      expect(await contractMissionEffects(fixture)).toEqual(before);
      const body = {
        title: f.body.title,
        expectedContractRevision: 3,
        acknowledgedCandidateProjectIds: [],
      };
      expect(
        (
          await fixture.post({
            ...f.target,
            path: f.path + '/projects/create',
            body,
            key: 'native-first',
          })
        ).status,
      ).toBe(201);
      const conflict = await f.create(f.body, 'native-first');
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      // Unrelated standalone Project commands deliberately retain their own key namespace.
      expect(
        (
          await fixture.post({
            ...f.target,
            path: '/projects/from-mission-plan',
            key: 'native-first',
            body: {
              title: 'Standalone independent key',
              clientAccountId: f.ready.source.clientId,
              ...f.body.missionPlan,
            },
          })
        ).status,
      ).toBe(201);
    });
    it('recovers the historical Project and Client after public Client union without retargeting the stored source or link', async () => {
      const f = await prepareContractMissionPlan(fixture),
        first = await f.create();
      expect(first.status).toBe(201);
      const created = responseRecord(await first.json()),
        id = responseString(responseRecord(created.project), 'id');
      const copy = await fixture.read({
        ...f.target,
        path: `/projects/${id}/mission-plan`,
      });
      const duplicate = responseRecord(
          await fixture.command({
            ...f.target,
            path: '/clients',
            body: { displayName: 'Synthetic canonical Client' },
          }),
        ),
        canonical = responseString(duplicate, 'id');
      // Deliberate historical duplicate identity; the union itself uses only public commands.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='SYNTHETIC-842' WHERE id=$1",
        [canonical],
      );
      const review = responseRecord(
        await fixture.command({
          ...f.target,
          path: `/clients/${f.ready.source.clientId}/union-reviews`,
          body: {},
        }),
      );
      expect(review.outcome).toBe('comparison');
      await fixture.command({
        ...f.target,
        path: `/client-union-reviews/${responseString(review, 'reviewReference')}/confirm`,
        body: {
          canonicalClientId: canonical,
          fields: {
            displayName: canonical,
            taxId: canonical,
            address: canonical,
            telephone: canonical,
            generalEmail: canonical,
            businessActivity: canonical,
          },
          companyIds: [f.target.companyId],
          reviewedDifferences: true,
          reason: 'Synthetic historical duplicate consolidation',
        },
      });
      const before = await contractMissionEffects(fixture),
        replay = await f.create();
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(created);
      expect(
        await fixture.read({
          ...f.target,
          path: `/projects/${id}/mission-plan`,
        }),
      ).toEqual(copy);
      expect(await contractMissionEffects(fixture)).toEqual(before);
      const current = responseRecord(
        await fixture.read({ ...f.target, path: `/projects/${id}` }),
      );
      expect(current).toMatchObject({
        id,
        clientAccountId: f.ready.source.clientId,
        clientDossierId: canonical,
      });
      const next = await f.create(
        {
          ...f.body,
          title: 'Synthetic canonical Client mission',
          expectedContractRevision: 4,
          acknowledgedCandidateProjectIds: [id],
        },
        'fresh-after-union',
      );
      expect(next.status).toBe(201);
      expect(await next.json()).toMatchObject({
        project: { clientAccountId: canonical },
        link: { revision: 5, created: true },
      });
      expect(
        responseRecord(
          responseRecord(await fixture.read({ ...f.target, path: f.path }))
            .contract,
        ).originalClientAccountId,
      ).toBe(f.ready.source.clientId);
    });
  },
);
