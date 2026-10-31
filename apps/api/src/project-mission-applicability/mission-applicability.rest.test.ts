import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  pilotKey,
  objects,
} from '../project-template/project-pilot-plan.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  'Exact mission applicability through public PostgreSQL REST',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!databaseUrl) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(databaseUrl);
    });
    afterAll(async () => fixture?.close());

    it('reads thirteen required source activities and proposes exact todo work without changing its Task', async () => {
      const context = await fixture.reset();
      for (const route of [
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-project-template-user-assignments',
        '/company-mission-deliverable-access-assignments',
        '/company-document-content-reader-assignments',
      ])
        await fixture.grant(route);
      const created = await fixture.call('/projects/from-template', {
        method: 'POST',
        body: {
          clientAccountId: context.clientId,
          title: 'Applicability DEMO',
          templateKey: pilotKey,
          templateVersion: 1,
        },
      });
      expect(created.status).toBe(201);
      const projectId = text((await json(created)).id);
      const path = `/projects/${projectId}/mission-applicability`;
      const initial = await fixture.call(path);
      expect(initial.status).toBe(200);
      const projection = record((await json(initial)).applicability);
      expect(projection.revision).toBe(0);
      expect(projection.clarification).toEqual({
        state: 'BUSINESS_CLARIFICATION_PENDING',
        questionId: 'MISSION-CLOSE-01',
      });
      const activities = objects(projection.activities);
      expect(activities).toHaveLength(13);
      expect(activities.map((row) => row.applicability)).toEqual(
        Array(13).fill('REQUIRED'),
      );
      const activity = activities[6];
      if (!activity) throw new Error('Expected CT_AN07');
      expect(activity.key).toBe('CT_AN07');
      const task = record(activity.task);
      const beforeTask = await json(
        await fixture.call(`/tasks/${text(task.id)}`),
      );
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      const proposed = await fixture.call(path, {
        method: 'POST',
        key: 'applicability-first-demo',
        body: {
          action: 'PROPOSE',
          taskId: task.id,
          expectedApplicabilityRevision: 0,
          expectedTaskVersion: task.version,
          expectedResultRevision: 0,
          expectedLifecycleRevision: projection.lifecycleRevision,
          reason: 'DEMO scope excludes this activity',
          scopeBasis: 'DEMO agreed scope\nЖ / é / 🌍',
          agreement: {
            kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
            basis: 'DEMO no contractual change reported',
          },
        },
      });
      expect(proposed.status).toBe(201);
      const receipt = await json(proposed);
      expect(receipt).toEqual({
        action: 'recorded',
        projectId,
        factId: expect.any(String),
        applicabilityRevision: 1,
      });
      const current = record(
        (await json(await fixture.call(path))).applicability,
      );
      const row = objects(current.activities)[6];
      expect(row?.applicability).toBe('REQUIRED');
      expect(record(row?.pendingProposal).id).toBe(receipt.factId);
      expect(await json(await fixture.call(`/tasks/${text(task.id)}`))).toEqual(
        beforeTask,
      );
    });

    it('corrects exact pending text, refuses unavailable agreement, approves, restores and reproposes with preserved native history and receipts', async () => {
      const context = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      await fixture.grant(
        '/company-mission-applicability-approver-assignments',
      );
      const ordinaryPaths = [
        '/activity-log',
        '/operational-home',
        '/projects',
        `/projects/${context.projectId}/tasks`,
        `/tasks/${context.taskId}/history`,
      ];
      async function ordinaryViews() {
        return Promise.all(
          ordinaryPaths.map(async (path) => {
            const response = await fixture.call(path);
            expect(response.status).toBe(200);
            const body: unknown = await response.json();
            return body;
          }),
        );
      }
      const ordinaryBefore = await ordinaryViews();
      const beforeTask = await json(
        await fixture.call(`/tasks/${context.taskId}`),
      );
      const beforeResult = await json(
        await fixture.call(`/tasks/${context.taskId}/results`),
      );
      const beforeReview = await json(
        await fixture.call(
          `/projects/${context.projectId}/mission-result-reviews`,
        ),
      );
      const beforeLifecycle = await json(
        await fixture.call(`/projects/${context.projectId}/lifecycle`),
      );
      const proposal = {
        ...(await observedApplicability(fixture, context.path, context.taskId)),
        ...demoProposal,
      };
      const proposed = await fixture.call(context.path, {
        method: 'POST',
        key: 'journey-proposal-demo',
        body: proposal,
      });
      expect(proposed.status).toBe(201);
      const first = await json(proposed);
      let current = await currentApplicability(fixture, context.path);
      let row = objects(current.activities)[6];
      const pending = record(row?.pendingProposal);
      expect(pending).toMatchObject({
        id: first.factId,
        revision: 1,
        kind: 'PROPOSED',
        activityKey: 'CT_AN07',
        actor: { displayName: 'Mission Owner DEMO' },
        capture: { permissionSetVersion: 'v1' },
        intent: {
          reason: 'DEMO concrete scope\r\nЖ / é / 🌍',
          scopeBasis: 'DEMO literal agreed scope',
          agreement: {
            kind: 'PARTIES_AGREEMENT_UNAVAILABLE',
            basis: 'DEMO parties agreement not yet available',
          },
        },
      });
      expect(Number.isFinite(Date.parse(text(pending.occurredAt)))).toBe(true);
      const refused = await fixture.call(context.path, {
        method: 'POST',
        body: {
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
          action: 'DECIDE',
          proposalId: first.factId,
          outcome: 'APPROVE',
          basis: 'DEMO internal decision',
        },
      });
      expect(refused.status).toBe(409);
      expect((await currentApplicability(fixture, context.path)).revision).toBe(
        1,
      );
      const correction = {
        ...(await observedApplicability(fixture, context.path, context.taskId)),
        ...demoProposal,
        action: 'CORRECT_PROPOSAL',
        proposalId: first.factId,
        agreement: {
          kind: 'PARTIES_AGREEMENT_REPORTED',
          reference:
            ' DEMO paper agreement / version1\nParties unknown / <script>literal</script> ',
        },
        correctionReason: 'DEMO obtained a reported source',
      };
      const corrected = await fixture.call(context.path, {
        method: 'POST',
        key: 'journey-correction-demo',
        body: correction,
      });
      expect(corrected.status).toBe(201);
      const second = await json(corrected);
      expect(second.applicabilityRevision).toBe(2);
      current = await currentApplicability(fixture, context.path);
      row = objects(current.activities)[6];
      expect(record(row?.pendingProposal)).toMatchObject({
        id: second.factId,
        kind: 'PROPOSAL_CORRECTED',
        predecessorId: first.factId,
        activityPredecessorId: first.factId,
        intent: {
          proposalId: first.factId,
          agreement: {
            kind: 'PARTIES_AGREEMENT_REPORTED',
            reference:
              'DEMO paper agreement / version1\nParties unknown / <script>literal</script>',
          },
        },
      });
      const unchanged = await fixture.call(context.path, {
        method: 'POST',
        body: {
          ...correction,
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
          proposalId: second.factId,
          correctionReason: 'DEMO correction reason alone adds no content',
        },
      });
      expect(unchanged.status).toBe(201);
      expect(await json(unchanged)).toEqual({ ...second, action: 'unchanged' });
      const superseded = await fixture.call(context.path, {
        method: 'POST',
        body: {
          ...correction,
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
        },
      });
      expect(superseded.status).toBe(409);
      const decision = {
        ...(await observedApplicability(fixture, context.path, context.taskId)),
        action: 'DECIDE',
        proposalId: second.factId,
        outcome: 'APPROVE',
        basis: ' DEMO reviewed exact reported scope and source ',
      };
      const approved = await fixture.call(context.path, {
        method: 'POST',
        key: 'journey-approval-demo',
        body: decision,
      });
      expect(approved.status).toBe(201);
      const third = await json(approved);
      expect(third.applicabilityRevision).toBe(3);
      current = await currentApplicability(fixture, context.path);
      row = objects(current.activities)[6];
      expect(row?.applicability).toBe('EXCLUDED_BY_APPROVER');
      expect(row?.pendingProposal).toBeNull();
      expect(record(row?.activeApproval).id).toBe(third.factId);
      const restored = await fixture.call(context.path, {
        method: 'POST',
        key: 'journey-restore-demo',
        body: {
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
          action: 'RESTORE',
          approvalId: third.factId,
          basis: 'DEMO activity required again',
        },
      });
      expect(restored.status).toBe(201);
      const fourth = await json(restored);
      expect(fourth.applicabilityRevision).toBe(4);
      current = await currentApplicability(fixture, context.path);
      row = objects(current.activities)[6];
      expect(row?.applicability).toBe('REQUIRED');
      expect(record(row?.lastRestoration).id).toBe(fourth.factId);
      const reproposed = await fixture.call(context.path, {
        method: 'POST',
        body: {
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
          ...demoProposal,
        },
      });
      expect(reproposed.status).toBe(201);
      const fifth = await json(reproposed);
      expect(fifth.applicabilityRevision).toBe(5);
      const rejected = await fixture.call(context.path, {
        method: 'POST',
        body: {
          ...(await observedApplicability(
            fixture,
            context.path,
            context.taskId,
          )),
          action: 'DECIDE',
          proposalId: fifth.factId,
          outcome: 'REJECT',
          basis: 'DEMO retain required work',
        },
      });
      expect(rejected.status).toBe(201);
      const history = record(
        (await json(await fixture.call(context.path + '/history'))).history,
      );
      expect(objects(history.facts).map((fact) => fact.kind)).toEqual([
        'REJECTED',
        'PROPOSED',
        'RESTORED',
        'APPROVED',
        'PROPOSAL_CORRECTED',
        'PROPOSED',
      ]);
      expect(history).toMatchObject({
        hasMore: false,
        nextBeforeRevision: null,
      });
      for (const [key, body, receipt] of [
        ['journey-proposal-demo', proposal, first],
        ['journey-correction-demo', correction, second],
        ['journey-approval-demo', decision, third],
      ] satisfies Array<[string, unknown, Record<string, unknown>]>) {
        const replay = await fixture.call(context.path, {
          method: 'POST',
          key,
          body,
        });
        expect(replay.status).toBe(201);
        expect(await json(replay)).toEqual(receipt);
      }
      expect(await ordinaryViews()).toEqual(ordinaryBefore);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}`)),
      ).toEqual(beforeTask);
      expect(
        await json(await fixture.call(`/tasks/${context.taskId}/results`)),
      ).toEqual(beforeResult);
      expect(
        await json(
          await fixture.call(
            `/projects/${context.projectId}/mission-result-reviews`,
          ),
        ),
      ).toEqual(beforeReview);
      expect(
        await json(
          await fixture.call(`/projects/${context.projectId}/lifecycle`),
        ),
      ).toEqual(beforeLifecycle);
      expect(
        await json(
          await fixture.call(`/projects/${context.projectId}/template`),
        ),
      ).toEqual(context.plan);
      for (let restart = 0; restart < 2; restart++) {
        await fixture.restart();
        expect(
          await json(await fixture.call(context.path + '/history')),
        ).toEqual({ history });
      }
    }, 45000);
  },
);
