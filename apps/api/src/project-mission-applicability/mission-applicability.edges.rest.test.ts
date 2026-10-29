import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ProjectTemplateService } from '../project-template/project-template.service.js';
import { readTemplateSnapshot } from '../project-template/project-template.definition.js';
import {
  createMissionDocumentFixture,
  json,
  record,
  text,
  type MissionDocumentFixture,
} from '../documents/mission-document.test-support.js';
import {
  objects,
  pilotKey,
  legacyKey,
} from '../project-template/project-pilot-plan.test-support.js';
import {
  currentApplicability,
  demoProposal,
  observedApplicability,
  prepareApplicability,
} from './mission-applicability.test-support.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Applicability remaining public scope and state edges',
  () => {
    let fixture: MissionDocumentFixture;
    beforeAll(async () => {
      if (!url) throw new Error('PostgreSQL required');
      fixture = await createMissionDocumentFixture(url);
    });
    afterAll(async () => fixture?.close());
    afterEach(() => vi.restoreAllMocks());
    async function prepare() {
      const c = await prepareApplicability(fixture);
      await fixture.grant(
        '/company-mission-applicability-coordinator-assignments',
      );
      await fixture.grant(
        '/company-mission-applicability-approver-assignments',
      );
      return c;
    }
    async function state(clientId: string) {
      return (
        await fixture.pool.query(
          'SELECT (SELECT count(*)::int FROM mission_applicability_facts) AS facts,(SELECT count(*)::int FROM mission_applicability_events) AS events,(SELECT count(*)::int FROM mission_applicability_commands) AS receipts,(SELECT version FROM client_accounts WHERE id=$1) AS client_version',
          [clientId],
        )
      ).rows;
    }
    async function command(path: string, body: unknown, key?: string) {
      const response = await fixture.call(path, { method: 'POST', body, key });
      expect(response.status).toBe(201);
      return json(response);
    }
    it('conserves the last same-actor restoration under a fresh key at current observations even after another activity advances the stream', async () => {
      const c = await prepare();
      const proposal = await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
        agreement: {
          kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
          basis: 'DEMO reported scope',
        },
      });
      const approval = await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'DECIDE',
        proposalId: proposal.factId,
        outcome: 'APPROVE',
        basis: 'DEMO exact scope',
      });
      const restore = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          action: 'RESTORE',
          approvalId: approval.factId,
          basis: 'DEMO required again',
        },
        receipt = await command(c.path, restore, 'original-restoration-demo');
      const otherTask = text(c.activities[0]?.taskId);
      await command(c.path, {
        ...(await observedApplicability(fixture, c.path, otherTask)),
        ...demoProposal,
      });
      const before = await state(c.clientId),
        unchanged = await command(
          c.path,
          {
            ...restore,
            ...(await observedApplicability(fixture, c.path, c.taskId)),
          },
          'fresh-restoration-demo',
        );
      expect(unchanged).toEqual({ ...receipt, action: 'unchanged' });
      expect(unchanged.applicabilityRevision).toBe(3);
      expect((await currentApplicability(fixture, c.path)).revision).toBe(4);
      const after = await state(c.clientId);
      expect(record(after[0]).facts).toBe(record(before[0]).facts);
      expect(record(after[0]).events).toBe(record(before[0]).events);
      expect(record(after[0]).client_version).toBe(
        record(before[0]).client_version,
      );
      expect(record(after[0]).receipts).toBe(
        Number(record(before[0]).receipts) + 1,
      );
      expect(
        await command(c.path, restore, 'original-restoration-demo'),
      ).toEqual(receipt);
    });
    it.each(['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const)(
      'proposes and decides ordinary %s work without borrowing Result Reviewer or mutating its Task',
      async (status) => {
        const c = await prepare();
        if (status !== 'todo') {
          const path =
            status === 'done'
              ? `/tasks/${c.taskId}/complete`
              : status === 'cancelled'
                ? `/tasks/${c.taskId}/cancel`
                : `/tasks/${c.taskId}/status`;
          const body =
            status === 'done'
              ? { expectedVersion: 1 }
              : status === 'cancelled'
                ? { expectedVersion: 1, reason: 'Ordinary cancellation DEMO' }
                : {
                    expectedVersion: 1,
                    status,
                    ...(status === 'blocked'
                      ? { reason: 'Ordinary blockage DEMO' }
                      : {}),
                  };
          expect(
            (await fixture.call(path, { method: 'POST', body })).status,
          ).toBe(201);
        }
        const taskBefore = await json(await fixture.call(`/tasks/${c.taskId}`));
        const proposal = await command(c.path, {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
        });
        await command(c.path, {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          action: 'DECIDE',
          proposalId: proposal.factId,
          outcome: 'REJECT',
          basis: 'DEMO explicit rejection retains required work',
        });
        expect(await json(await fixture.call(`/tasks/${c.taskId}`))).toEqual(
          taskBefore,
        );
        const projection = await currentApplicability(fixture, c.path),
          row = objects(projection.activities).find(
            (row) => record(row.task).id === c.taskId,
          );
        if (!row) throw new Error('Missing mapped activity');
        expect(row.applicability).toBe('REQUIRED');
        expect(record(row.lastDecision).observedTask).toMatchObject({
          status,
          version: status === 'todo' ? 1 : 2,
        });
        const company = record(
          (await json(await fixture.call('/access/current-actor')))
            .activeCompany,
        );
        expect(company.missionResultReviewPermissions).toBeUndefined();
      },
    );
    it('keeps approved exclusion after ordinary Task cancellation/reopening/completion and permits restoration/reproposal/decision against fresh done observations', async () => {
      const c = await prepare();
      const proposal = await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
        agreement: {
          kind: 'NO_CONTRACTUAL_CHANGE_REPORTED',
          basis: 'DEMO reported basis',
        },
      });
      const approval = await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'DECIDE',
        proposalId: proposal.factId,
        outcome: 'APPROVE',
        basis: 'DEMO scope only',
      });
      for (const [action, body] of [
        [
          'cancel',
          { expectedVersion: 1, reason: 'Ordinary cancellation DEMO' },
        ],
        ['reopen', { expectedVersion: 2 }],
        ['complete', { expectedVersion: 3 }],
      ] satisfies Array<[string, unknown]>) {
        expect(
          (
            await fixture.call(`/tasks/${c.taskId}/${action}`, {
              method: 'POST',
              body,
            })
          ).status,
        ).toBe(201);
        const current = await currentApplicability(fixture, c.path),
          row = objects(current.activities).find(
            (row) => record(row.task).id === c.taskId,
          );
        expect(row?.applicability).toBe('EXCLUDED_BY_APPROVER');
        expect(record(row?.activeApproval).id).toBe(approval.factId);
        expect(current.revision).toBe(2);
        expect(current).not.toHaveProperty('fulfilled');
        expect(current).not.toHaveProperty('canComplete');
      }
      await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'RESTORE',
        approvalId: approval.factId,
        basis: 'DEMO explicit restoration',
      });
      const fresh = await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        ...demoProposal,
      });
      await command(c.path, {
        ...(await observedApplicability(fixture, c.path, c.taskId)),
        action: 'DECIDE',
        proposalId: fresh.factId,
        outcome: 'REJECT',
        basis: 'DEMO exact done work still separately required',
      });
      expect(
        record((await json(await fixture.call(`/tasks/${c.taskId}`))).task),
      ).toMatchObject({ status: 'done', version: 4 });
    });
    it('conflicts actor-key reuse across an independently readable Company without disclosing the original hidden target, while foreign Project reads remain404', async () => {
      const c = await prepare(),
        body = {
          ...(await observedApplicability(fixture, c.path, c.taskId)),
          ...demoProposal,
        };
      await command(c.path, body, 'company-key-demo');
      const createdCompany = await fixture.call('/companies', {
        method: 'POST',
        company: null,
        body: { displayName: 'Separate Company DEMO' },
      });
      expect(createdCompany.status).toBe(201);
      const companyId = text((await json(createdCompany)).id);
      for (const bundle of [
        'project',
        'task-manager',
        'project-template-user',
        'document-registrar',
        'mission-deliverable-access',
        'document-content-reader',
        'mission-applicability-coordinator',
      ])
        expect(
          (
            await fixture.call(`/company-${bundle}-assignments`, {
              method: 'POST',
              company: null,
              body: { companyId, workspaceMembershipId: c.membershipId },
            })
          ).status,
        ).toBe(201);
      const client = await fixture.call('/clients', {
        method: 'POST',
        company: companyId,
        body: { displayName: 'Separate Client DEMO' },
      });
      expect(client.status).toBe(201);
      const clientId = text((await json(client)).id);
      const project = await fixture.call('/projects/from-template', {
        method: 'POST',
        company: companyId,
        body: {
          clientAccountId: clientId,
          title: 'Separate Project DEMO',
          templateKey: pilotKey,
          templateVersion: 1,
        },
      });
      expect(project.status).toBe(201);
      const projectId = text((await json(project)).id),
        path = `/projects/${projectId}/mission-applicability`;
      const current = record(
          (await json(await fixture.call(path, { company: companyId })))
            .applicability,
        ),
        row = objects(current.activities)[0];
      if (!row) throw new Error('Missing independent mapped activity');
      const before = await state(c.clientId),
        response = await fixture.call(path, {
          method: 'POST',
          company: companyId,
          key: 'company-key-demo',
          body: {
            ...demoProposal,
            taskId: record(row.task).id,
            expectedApplicabilityRevision: 0,
            expectedTaskVersion: 1,
            expectedResultRevision: 0,
            expectedLifecycleRevision: 0,
          },
        });
      expect(response.status).toBe(409);
      const error = JSON.stringify(await json(response));
      for (const hidden of [c.projectId, c.taskId, c.clientId])
        expect(error).not.toContain(hidden);
      expect(await state(c.clientId)).toEqual(before);
      for (const suffix of ['', '/history?beforeRevision=1']) {
        const foreign = await fixture.call(c.path + suffix, {
          company: companyId,
        });
        expect(foreign.status).toBe(404);
        expect(JSON.stringify(await json(foreign))).not.toContain(c.projectId);
      }
    });
    it('keeps published configured legacy versions unsupported without substituting them for the preserved pilot', async () => {
      const c = await prepare();
      await fixture.grant(
        '/company-project-template-configuration-assignments',
      );
      await command(`/project-templates/${legacyKey}/versions`, {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: {
          clarify_request: 'Configured legacy clarification DEMO',
          confirm_scope: 'Confirmer le périmètre',
          collect_questionnaire: 'Recueillir le questionnaire',
          prepare_plan: 'Préparer le plan',
        },
      });
      const project = await command('/projects/from-template', {
          clientAccountId: c.clientId,
          title: 'Configured legacy Project DEMO',
          templateKey: legacyKey,
          templateVersion: 2,
        }),
        projectId = text(project.id),
        path = `/projects/${projectId}/mission-applicability`;
      expect(await json(await fixture.call(path))).toEqual({
        applicability: null,
      });
      expect(await json(await fixture.call(path + '/history'))).toEqual({
        history: null,
      });
      const copied = record(
          (await json(await fixture.call(`/projects/${projectId}/template`)))
            .template,
        ),
        taskId = text(objects(objects(copied.stages)[0]?.tasks)[0]?.taskId);
      const before = await state(c.clientId);
      expect(
        (
          await fixture.call(path, {
            method: 'POST',
            body: {
              ...demoProposal,
              taskId,
              expectedApplicabilityRevision: 0,
              expectedTaskVersion: 1,
              expectedResultRevision: 0,
              expectedLifecycleRevision: 0,
            },
          })
        ).status,
      ).toBe(409);
      expect(await state(c.clientId)).toEqual(before);
      expect(
        await json(await fixture.call(`/projects/${c.projectId}/template`)),
      ).toEqual(c.plan);
    });
    it.each(['snapshot', 'mapping'] as const)(
      'seals native supported %s against corruption, refuses unmapped Tasks, and sanitizes a source-reader boundary failure',
      async (kind) => {
        const c = await prepare(),
          body = {
            ...(await observedApplicability(fixture, c.path, c.taskId)),
            ...demoProposal,
          };
        const extra = await fixture.call(`/projects/${c.projectId}/tasks`, {
          method: 'POST',
          body: { title: 'Unmapped ordinary Task DEMO' },
        });
        expect(extra.status).toBe(201);
        const extraId = text((await json(extra)).id);
        const before = await state(c.clientId);
        expect(
          (
            await fixture.call(c.path, {
              method: 'POST',
              body: { ...body, taskId: extraId, expectedTaskVersion: 1 },
            })
          ).status,
        ).toBe(409);
        expect(await state(c.clientId)).toEqual(before);
        if (kind === 'snapshot') {
          await expect(
            fixture.pool.query(
              "UPDATE project_template_instances SET snapshot=jsonb_set(snapshot,'{activities}',(snapshot->'activities')-12) WHERE project_id=$1",
              [c.projectId],
            ),
          ).rejects.toThrow('Preserved pilot plan is immutable');
          const copied = record(c.plan.template);
          expect(() =>
            readTemplateSnapshot({
              ...copied,
              activities: objects(copied.activities).slice(0, 12),
            }),
          ).toThrow('Invalid stored pilot activity plan.');
        } else
          await expect(
            fixture.pool.query(
              'DELETE FROM project_template_task_copies WHERE project_id=$1 AND position=0',
              [c.projectId],
            ),
          ).rejects.toThrow('Preserved pilot Task mapping is immutable');
        expect(
          await json(await fixture.call(`/projects/${c.projectId}/template`)),
        ).toEqual(c.plan);
        // Native guards make UPDATE/DELETE corruption impossible. Inject only the owning
        // public source-reader failure; HTTP sanitization and rollback remain real.
        vi.spyOn(
          ProjectTemplateService.prototype,
          'readWithinTransaction',
        ).mockRejectedValue(
          new Error(`Invalid stored ${kind} DEMO protected detail`),
        );
        for (const suffix of ['', '/history']) {
          const response = await fixture.call(c.path + suffix);
          expect(response.status).toBe(500);
          expect(await json(response)).toMatchObject({
            message: 'The applicability operation failed.',
          });
        }
        expect(
          (await fixture.call(c.path, { method: 'POST', body })).status,
        ).toBe(500);
        expect(await state(c.clientId)).toEqual(before);
      },
    );
  },
);
