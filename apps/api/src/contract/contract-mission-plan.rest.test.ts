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
  'Configured mission creation from a Contract through public REST',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => fixture.reset());
    afterAll(async () => fixture?.close());

    it('creates the native Project, exact ordinary Tasks, immutable copy and Contract link together', async () => {
      const { ready, contract, path, source, target, create } =
        await prepareContractMissionPlan(fixture);
      const result = await create();
      expect(result.status).toBe(201);
      const created = responseRecord(await result.json());
      expect(created).toMatchObject({
        project: {
          title: 'Synthetic configured Contract mission',
          status: 'preparatory',
          companyId: ready.source.companyId,
          clientAccountId: ready.source.clientId,
        },
        link: {
          contractId: responseString(contract, 'id'),
          revision: 4,
          created: true,
        },
      });
      const projectId = responseString(responseRecord(created.project), 'id');
      const listing = responseRecord(
        await fixture.read({
          ...target,
          path: `/projects/${projectId}/tasks`,
        }),
      );
      if (!Array.isArray(listing.tasks))
        throw new Error('Expected the native Task list.');
      const tasks = listing.tasks.map((value: unknown) =>
        responseRecord(value),
      );
      expect(tasks).toHaveLength(2);
      const copied = responseRecord(
        responseRecord(
          await fixture.read({
            ...target,
            path: `/projects/${projectId}/mission-plan`,
          }),
        ).plan,
      );
      expect(copied.projectId).toBe(projectId);
      expect(copied.version).toEqual(source);
      if (!Array.isArray(copied.tasks))
        throw new Error('Expected the preserved Task mapping.');
      const mappings = copied.tasks.map((value: unknown) =>
        responseRecord(value),
      );
      expect(mappings).toEqual([
        {
          activityKey: '00000000-0000-4000-8000-000000000925',
          position: 0,
          taskId: expect.any(String),
        },
        {
          activityKey: '00000000-0000-4000-8000-000000000926',
          position: 1,
          taskId: expect.any(String),
        },
      ]);
      const taskIds = mappings.map((row) => responseString(row, 'taskId'));
      expect(new Set(taskIds).size).toBe(2);
      expect(tasks.map((row) => responseString(row, 'id')).toSorted()).toEqual(
        taskIds.toSorted(),
      );
      const expectedTitles = [
        'Review the initial situation',
        'Prepare the agreed work',
      ];
      for (const [index, taskId] of taskIds.entries()) {
        const task = responseRecord(
          await fixture.read({ ...target, path: `/tasks/${taskId}` }),
        );
        expect(task.task).toMatchObject({
          projectId,
          clientAccountId: ready.source.clientId,
          title: expectedTitles[index],
          status: 'todo',
          priority: 'normal',
          assignee: null,
          dueDate: null,
        });
      }
      expect(
        responseRecord(await fixture.read({ ...target, path })).contract,
      ).toMatchObject({
        revision: 4,
        linkedProjects: [expect.objectContaining({ id: projectId })],
      });
    });
    it('recovers concurrent identical intent once and conflicts on changed mode, source and body in the native namespace', async () => {
      const f = await prepareContractMissionPlan(fixture);
      const replies = await Promise.all([f.create(), f.create()]);
      expect(replies.map((r) => r.status)).toEqual([201, 201]);
      const results: unknown[] = await Promise.all(
        replies.map((r) => r.json()),
      );
      expect(results[0]).toEqual(results[1]);
      const before = await contractMissionEffects(fixture);
      for (const body of [
        { ...f.body, title: 'Changed mission' },
        { ...f.body, missionPlan: { ...f.body.missionPlan, versionNumber: 2 } },
        { ...f.body, expectedContractRevision: 4 },
      ]) {
        const response = await f.create(body);
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      const manual = {
        title: f.body.title,
        expectedContractRevision: f.body.expectedContractRevision,
        acknowledgedCandidateProjectIds: f.body.acknowledgedCandidateProjectIds,
      };
      const changedMode = await fixture.post({
        ...f.target,
        path: f.path + '/projects/create',
        body: manual,
        key: 'configured-mission',
      });
      expect(changedMode.status).toBe(409);
      expect(await changedMode.json()).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
      expect(await contractMissionEffects(fixture)).toEqual(before);
      expect(before).toMatchObject([
        { projects: 1, tasks: 2, instances: 1, copies: 2, links: 1 },
      ]);
    });
    it('rejects malformed, mixed and foreign source identities and a Client override without effects', async () => {
      const f = await prepareContractMissionPlan(fixture),
        before = await contractMissionEffects(fixture);
      for (const body of [
        { ...f.body, clientAccountId: f.ready.source.clientId },
        { ...f.body, missionPlan: null },
        { ...f.body, missionPlan: { ...f.body.missionPlan, unexpected: true } },
        { ...f.body, missionPlan: { ...f.body.missionPlan, versionNumber: 0 } },
        {
          ...f.body,
          missionPlan: { ...f.body.missionPlan, versionId: 'invalid' },
        },
      ])
        expect((await f.create(body, 'invalid-source')).status).toBe(400);
      for (const missionPlan of [
        {
          ...f.body.missionPlan,
          planId: '00000000-0000-4000-8000-000000000999',
        },
        {
          ...f.body.missionPlan,
          versionId: '00000000-0000-4000-8000-000000000999',
        },
      ])
        expect(
          (await f.create({ ...f.body, missionPlan }, 'missing-source')).status,
        ).toBe(404);
      expect(
        (
          await f.create(
            {
              ...f.body,
              missionPlan: { ...f.body.missionPlan, versionNumber: 2 },
            },
            'mixed-number',
          )
        ).status,
      ).toBe(400);
      expect(await contractMissionEffects(fixture)).toEqual(before);
    });
    it.each(['contract_project_links', 'contract_events', 'contract_commands'])(
      'rolls back all native effects and the Client fence when the final %s write fails',
      async (table) => {
        const f = await prepareContractMissionPlan(fixture),
          before = await contractMissionEffects(fixture);
        await fixture.pool.query(
          `CREATE FUNCTION fail_configured_contract() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic final Contract write'; END; $$; CREATE TRIGGER fail_configured_contract BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_configured_contract()`,
        );
        try {
          const failed = await f.create();
          expect(failed.status).toBe(500);
          expect(await failed.json()).toMatchObject({
            code: 'CONTRACT_PROJECT_CREATE_UNCERTAIN',
          });
          expect(await contractMissionEffects(fixture)).toEqual(before);
        } finally {
          await fixture.pool.query(
            `DROP TRIGGER fail_configured_contract ON ${table}; DROP FUNCTION fail_configured_contract()`,
          );
        }
        expect((await f.create()).status).toBe(201);
        expect(await contractMissionEffects(fixture)).toMatchObject([
          { projects: 1, tasks: 2, instances: 1, copies: 2, links: 1 },
        ]);
      },
    );
    it.each([
      'company_mission_plan_user',
      'company_project_access',
      'company_task_manager',
      'company_contract_preparer',
      'company_commercial_intake',
      'company_director_client_access',
    ])(
      'denies a new command and committed replay without live %s authority',
      async (bundle) => {
        const f = await prepareContractMissionPlan(fixture);
        expect((await f.create()).status).toBe(201);
        const before = await contractMissionEffects(fixture);
        const changed = await fixture.pool.query(
          'UPDATE company_role_assignments SET revoked_at=now() WHERE bundle=$1 AND company_id=$2 AND workspace_membership_id=$3 AND revoked_at IS NULL RETURNING id',
          [
            bundle,
            f.ready.source.companyId,
            f.ready.source.preparerMembershipId,
          ],
        );
        expect(changed.rowCount).toBe(1);
        expect((await f.create()).status).toBe(403);
        expect((await f.create(f.body, 'new-after-revocation')).status).toBe(
          403,
        );
        expect(await contractMissionEffects(fixture)).toEqual(before);
      },
    );
    it('preserves manual creation and its replay without plan or Task authority', async () => {
      const f = await prepareContractMissionPlan(fixture);
      await fixture.pool.query(
        "UPDATE company_role_assignments SET revoked_at=now() WHERE bundle IN ('company_mission_plan_user','company_task_manager') AND company_id=$1",
        [f.ready.source.companyId],
      );
      const manual = {
        title: f.body.title,
        expectedContractRevision: 3,
        acknowledgedCandidateProjectIds: [],
      };
      const request = () =>
        fixture.post({
          ...f.target,
          path: f.path + '/projects/create',
          body: manual,
          key: 'native-manual',
        });
      const first = await request();
      expect(first.status).toBe(201);
      const outcome: unknown = await first.json();
      const replay = await request();
      expect(replay.status).toBe(201);
      expect(await replay.json()).toEqual(outcome);
      expect(await contractMissionEffects(fixture)).toMatchObject([
        { projects: 1, tasks: 0, instances: 0, copies: 0, links: 1 },
      ]);
    });
  },
);
