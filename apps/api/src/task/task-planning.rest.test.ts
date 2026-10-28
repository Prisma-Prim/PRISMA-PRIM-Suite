import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createPilotPlanFixture,
  json,
  object,
  objects,
  text,
  type PilotPlanFixture,
} from '../project-template/project-pilot-plan.test-support.js';
import {
  assertOriginalPlanning,
  eligiblePlanningColleague,
  planningEffects,
  preparePlanning,
} from './task-planning.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Grouped native Task planning through public REST', () => {
  let f: PilotPlanFixture;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Disposable PostgreSQL required.');
    f = await createPilotPlanFixture(url);
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());

  it('plans selected native Tasks together and preserves their ordinary details and attributed history', async () => {
    const project = await f.command('/projects', {
      title: 'Planning DEMO',
      clientAccountId: f.clientId,
    });
    const projectId = text(project.id);
    const first = await f.command(`/projects/${projectId}/tasks`, {
      title: 'Collect agreed information',
    });
    const second = await f.command(`/projects/${projectId}/tasks`, {
      title: 'Prepare the agreed output',
    });
    const untouched = await f.command(`/projects/${projectId}/tasks`, {
      title: 'Leave this activity unchanged',
    });
    const response = await f.request(`/projects/${projectId}/tasks/planning`, {
      method: 'POST',
      key: 'plan-selected-once',
      body: {
        tasks: [
          {
            taskId: first.id,
            expectedVersion: 1,
            assigneeMembershipId: f.membershipId,
            dueDate: '2026-11-02',
          },
          {
            taskId: second.id,
            expectedVersion: 1,
            assigneeMembershipId: null,
            dueDate: '2026-11-09',
          },
        ],
      },
    });
    expect(response.status).toBe(201);
    const receipt = await json(response);
    expect(receipt).toMatchObject({ schema: 'task-planning/v1', projectId });
    expect(objects(receipt.tasks)).toMatchObject([
      {
        id: first.id,
        title: first.title,
        version: 2,
        status: 'todo',
        dueDate: '2026-11-02',
        assignee: { workspaceMembershipId: f.membershipId },
      },
      {
        id: second.id,
        title: second.title,
        version: 2,
        status: 'todo',
        dueDate: '2026-11-09',
        assignee: null,
      },
    ]);
    for (const planned of objects(receipt.tasks)) {
      expect(object((await f.read(`/tasks/${text(planned.id)}`)).task)).toEqual(
        planned,
      );
      const history = objects(
        (await f.read(`/tasks/${text(planned.id)}/history`)).events,
      );
      expect(history).toHaveLength(2);
      expect(history[1]).toMatchObject({
        action: 'task.updated',
        actor: { workspaceMembershipId: f.membershipId },
      });
    }
    expect(object((await f.read(`/tasks/${text(untouched.id)}`)).task)).toEqual(
      untouched,
    );
    expect(objects((await f.read('/assigned-tasks')).tasks)).toMatchObject([
      { id: first.id },
    ]);
  });

  it('saves the full fifty-Task boundary on an exact configured plan without changing its source copy', async () => {
    await f.grant('/company-mission-plan-configuration-assignments');
    await f.grant('/company-mission-plan-user-assignments');
    const published = await f.command('/mission-plans', {
      title: 'Fifty activities DEMO',
      activities: Array.from({ length: 50 }, (_, index) => ({
        key: randomUUID(),
        title: `Bounded activity ${index + 1}`,
        activity: 'Plan one explicit step',
        intendedResult: 'A declared intended outcome',
      })),
    });
    const version = object(published.version);
    const project = await f.command('/projects/from-mission-plan', {
      title: 'Fifty native Tasks DEMO',
      clientAccountId: f.clientId,
      planId: version.planId,
      versionId: version.id,
      versionNumber: 1,
    });
    const projectId = text(project.id),
      source = await f.read(`/projects/${projectId}/mission-plan`),
      originals = objects((await f.read(`/projects/${projectId}/tasks`)).tasks);
    expect(originals).toHaveLength(50);
    const result = await f.command(`/projects/${projectId}/tasks/planning`, {
      tasks: originals.map((task) => ({
        taskId: task.id,
        expectedVersion: 1,
        assigneeMembershipId: null,
        dueDate: '2026-11-02',
      })),
    });
    const tasks = objects(result.tasks);
    expect(tasks).toHaveLength(50);
    expect(tasks.map((task) => task.id)).toEqual(
      originals.map((task) => task.id),
    );
    for (const task of tasks)
      expect(task).toMatchObject({
        version: 2,
        dueDate: '2026-11-02',
        assignee: null,
        status: 'todo',
      });
    expect(await f.read(`/projects/${projectId}/mission-plan`)).toEqual(source);
  });

  it('keeps group key identity Workspace-wide across valid Company and Project targets without exposing or changing foreign Tasks', async () => {
    const first = await preparePlanning(f, 1);
    expect((await first.plan({ key: 'same-actor-key' })).status).toBe(201);
    const other = await preparePlanning(f, 1),
      before = await planningEffects(f);
    expect((await other.plan({ key: 'same-actor-key' })).status).toBe(409);
    expect(await planningEffects(f)).toEqual(before);
    const companyId = text(
      (
        await f.command('/companies', {
          displayName: 'Independent Company DEMO',
        })
      ).id,
    );
    for (const path of [
      '/company-project-assignments',
      '/company-task-manager-assignments',
    ])
      await f.command(path, {
        companyId,
        workspaceMembershipId: f.membershipId,
      });
    const client = await f.command(
      '/clients',
      { displayName: 'Other scoped Client DEMO' },
      { companyId },
    );
    const project = await f.command(
      '/projects',
      { title: 'Other scoped Project DEMO', clientAccountId: client.id },
      { companyId },
    );
    const projectId = text(project.id),
      task = await f.command(
        `/projects/${projectId}/tasks`,
        { title: 'Other scoped Task DEMO' },
        { companyId },
      );
    const body = {
      tasks: [
        {
          taskId: task.id,
          expectedVersion: 1,
          assigneeMembershipId: null,
          dueDate: '2026-11-09',
        },
      ],
    };
    const baseline = await planningEffects(f);
    expect(
      (
        await f.request(`/projects/${projectId}/tasks/planning`, {
          companyId,
          method: 'POST',
          body,
          key: 'same-actor-key',
        })
      ).status,
    ).toBe(409);
    expect((await first.plan({ body })).status).toBe(404);
    expect(await planningEffects(f)).toEqual(baseline);
    expect(
      (
        await f.request(`/projects/${projectId}/tasks/planning`, {
          companyId,
          method: 'POST',
          body,
          key: 'new-scoped-key',
        })
      ).status,
    ).toBe(201);
  });

  it('preserves open execution facts and historical ineligible assignments while clearing values and making no-op rows effect-free', async () => {
    const s = await preparePlanning(f);
    const first = s.body.tasks[0],
      second = s.body.tasks[1],
      third = s.body.tasks[2];
    if (!first || !second || !third)
      throw new Error('Three native Tasks required.');
    const colleague = await eligiblePlanningColleague(f);
    expect(
      (
        await f.request(`/tasks/${first.taskId}`, {
          method: 'PATCH',
          body: {
            expectedVersion: 1,
            assigneeMembershipId: colleague.member,
            dueDate: '2026-01-01',
            priority: 'critical',
          },
        })
      ).status,
    ).toBe(200);
    await f.command(`/tasks/${first.taskId}/status`, {
      expectedVersion: 2,
      status: 'blocked',
      reason: 'Waiting for declared input',
    });
    await f.command(`/tasks/${second.taskId}/status`, {
      expectedVersion: 1,
      status: 'in_progress',
    });
    expect(
      (
        await f.request(
          `/company-task-manager-assignments/${colleague.member}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    const before = (
      await f.harness.pool.query<{ version: number }>(
        'SELECT version FROM client_accounts WHERE id=$1',
        [f.clientId],
      )
    ).rows;
    const result = await f.command(s.path, {
      tasks: [
        {
          ...first,
          expectedVersion: 3,
          assigneeMembershipId: colleague.member,
          dueDate: null,
        },
        { ...second, expectedVersion: 2, dueDate: '0004-02-29' },
        { ...third, dueDate: null },
      ],
    });
    expect(objects(result.tasks)).toMatchObject([
      {
        id: first.taskId,
        version: 4,
        status: 'blocked',
        priority: 'critical',
        blockage: { reason: 'Waiting for declared input' },
        dueDate: null,
        assignee: { workspaceMembershipId: colleague.member },
      },
      {
        id: second.taskId,
        version: 3,
        status: 'in_progress',
        dueDate: '0004-02-29',
      },
      { id: third.taskId, version: 1, dueDate: null, assignee: null },
    ]);
    const after = (
      await f.harness.pool.query<{ version: number }>(
        'SELECT version FROM client_accounts WHERE id=$1',
        [f.clientId],
      )
    ).rows;
    expect(after[0]?.version).toBe((before[0]?.version ?? 0) + 2);
    expect(
      objects((await f.read(`/tasks/${third.taskId}/history`)).events),
    ).toHaveLength(1);
    const planned = objects(result.tasks);
    const noops = planned.map((task) => ({
      taskId: task.id,
      expectedVersion: task.version,
      assigneeMembershipId:
        task.assignee === null
          ? null
          : object(task.assignee).workspaceMembershipId,
      dueDate: task.dueDate,
    }));
    const nativeHistory = await Promise.all(
      s.body.tasks.map((task) => f.read(`/tasks/${task.taskId}/history`)),
    );
    await f.command(s.path, { tasks: noops });
    expect(
      await Promise.all(
        s.body.tasks.map((task) => f.read(`/tasks/${task.taskId}/history`)),
      ),
    ).toEqual(nativeHistory);
    expect(
      (
        await f.harness.pool.query<{ version: number }>(
          'SELECT version FROM client_accounts WHERE id=$1',
          [f.clientId],
        )
      ).rows,
    ).toEqual(after);
  });

  it('rejects strict malformed, missing, duplicate, oversized, foreign and stale rows without any group effects', async () => {
    const s = await preparePlanning(f);
    const row = s.body.tasks[0];
    if (!row) throw new Error('Native Task required.');
    const baseline = await planningEffects(f);
    const invalid: unknown[] = [
      null,
      {},
      { tasks: [] },
      { tasks: s.body.tasks, companyId: f.companyId },
      { tasks: [row, row] },
      { tasks: Array.from({ length: 51 }, () => row) },
      ...[
        { ...row, title: 'Unrequested field' },
        { taskId: row.taskId, expectedVersion: 1, dueDate: null },
        { taskId: row.taskId, expectedVersion: 1, assigneeMembershipId: null },
        { ...row, expectedVersion: 0 },
        { ...row, expectedVersion: 1.5 },
        { ...row, dueDate: '2026-02-29' },
        { ...row, dueDate: '0000-01-01' },
        { ...row, dueDate: '2026-11-02T00:00:00Z' },
        { ...row, taskId: 'not-a-task' },
      ].map((invalid) => ({ tasks: [invalid] })),
    ];
    for (const body of invalid) {
      expect((await s.plan({ body })).status).toBe(400);
      expect(await planningEffects(f)).toEqual(baseline);
    }
    for (const changed of [
      { ...row, expectedVersion: 99 },
      { ...row, assigneeMembershipId: '00000000-0000-4000-8000-000000009291' },
      { ...row, taskId: '00000000-0000-4000-8000-000000009292' },
    ]) {
      const response = await s.plan({
        body: { tasks: [s.body.tasks[1], changed] },
      });
      expect(response.status).toBe(
        changed.expectedVersion === 99
          ? 409
          : changed.taskId !== row.taskId
            ? 404
            : 400,
      );
      expect(await planningEffects(f)).toEqual(baseline);
    }
    const other = await preparePlanning(f, 1);
    const otherRow = other.body.tasks[0];
    expect((await s.plan({ body: { tasks: [otherRow] } })).status).toBe(404);
    await assertOriginalPlanning(f, s);
  });

  it('serializes identical retries, conflicts with changed ordered intent and keeps native single-Task command receipts compatible', async () => {
    const s = await preparePlanning(f);
    const replies = await Promise.all([
      s.plan({ key: 'group-once' }),
      s.plan({ key: 'group-once' }),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([201, 201]);
    const receipts = await Promise.all(replies.map(json));
    expect(receipts[0]).toEqual(receipts[1]);
    const baseline = await planningEffects(f);
    expect(
      (
        await s.plan({
          key: 'group-once',
          body: { tasks: [...s.body.tasks].reverse() },
        })
      ).status,
    ).toBe(409);
    expect(await planningEffects(f)).toEqual(baseline);
    const first = s.body.tasks[0];
    if (!first) throw new Error('Native Task required.');
    expect(
      (
        await f.request(`/tasks/${first.taskId}`, {
          method: 'PATCH',
          key: 'group-once',
          body: { expectedVersion: 2, title: 'Different intent' },
        })
      ).status,
    ).toBe(409);
    const single = { expectedVersion: 2, title: 'Native later edit' };
    const edited = await f.request(`/tasks/${first.taskId}`, {
      method: 'PATCH',
      key: 'single-once',
      body: single,
    });
    expect(edited.status).toBe(200);
    const originalSingle = await json(edited);
    expect(
      await json(
        await f.request(`/tasks/${first.taskId}`, {
          method: 'PATCH',
          key: 'single-once',
          body: single,
        }),
      ),
    ).toEqual(originalSingle);
    expect((await s.plan({ key: 'single-once' })).status).toBe(409);
    const after = await planningEffects(f);
    expect(await json(await s.plan({ key: 'group-once' }))).toEqual(
      receipts[0],
    );
    expect(await planningEffects(f)).toEqual(after);
    await f.command(`/tasks/${first.taskId}/complete`, { expectedVersion: 3 });
    const completed = await planningEffects(f);
    expect(await json(await s.plan({ key: 'group-once' }))).toEqual(
      receipts[0],
    );
    expect(await planningEffects(f)).toEqual(completed);
  });

  it('refuses new work on closed Tasks and Projects but confirms the complete earlier group after ordinary closure', async () => {
    const s = await preparePlanning(f, 2);
    const receipt = await json(await s.plan({ key: 'before-closure' }));
    for (const task of s.body.tasks)
      await f.command(`/tasks/${task.taskId}/complete`, { expectedVersion: 2 });
    const closedTasks = await planningEffects(f);
    expect(
      (
        await s.plan({
          body: {
            tasks: s.body.tasks.map((task) => ({
              ...task,
              expectedVersion: 3,
            })),
          },
        })
      ).status,
    ).toBe(409);
    expect(await planningEffects(f)).toEqual(closedTasks);
    await f.grant('/company-project-approver-assignments');
    expect(
      (
        await f.request(`/projects/${s.projectId}/lifecycle-transitions`, {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Synthetic ordinary closure',
          },
        })
      ).status,
    ).toBe(200);
    const baseline = await planningEffects(f);
    expect(await json(await s.plan({ key: 'before-closure' }))).toEqual(
      receipt,
    );
    expect((await s.plan()).status).toBe(409);
    expect(await planningEffects(f)).toEqual(baseline);
  });

  it('preserves the original complete receipt after governed Client union and denies fresh planning against the superseded original', async () => {
    const s = await preparePlanning(f, 2);
    const receipt = await json(await s.plan({ key: 'before-union' }));
    const canonical = text(
      (await f.command('/clients', { displayName: 'Canonical DEMO' })).id,
    );
    // Existing historical duplicates are fixture input, not a production matching shortcut.
    await f.harness.pool.query(
      "UPDATE client_accounts SET tax_id='PLANNING-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
      [[f.clientId, canonical]],
    );
    const review = await f.command(`/clients/${f.clientId}/union-reviews`, {});
    expect(review.outcome).toBe('comparison');
    await f.command(
      `/client-union-reviews/${text(review.reviewReference)}/confirm`,
      {
        canonicalClientId: canonical,
        fields: {
          displayName: f.clientId,
          taxId: f.clientId,
          address: f.clientId,
          telephone: f.clientId,
          generalEmail: f.clientId,
          businessActivity: f.clientId,
        },
        companyIds: [f.companyId],
        reviewedDifferences: true,
        reason: 'Synthetic historical duplicate',
      },
    );
    const baseline = await planningEffects(f);
    expect(await json(await s.plan({ key: 'before-union' }))).toEqual(receipt);
    expect(
      (
        await s.plan({
          body: {
            tasks: s.body.tasks.map((task) => ({
              ...task,
              expectedVersion: 2,
            })),
          },
        })
      ).status,
    ).toBe(404);
    expect(await planningEffects(f)).toEqual(baseline);
  });

  it('revalidates current Company and captured Task authority for both fresh and replay commands without revealing a receipt', async () => {
    const s = await preparePlanning(f, 1);
    await s.plan({ key: 'current-authority' });
    const colleague = await eligiblePlanningColleague(f);
    expect(
      (
        await f.request(
          `/company-task-manager-assignments/${colleague.member}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    const baseline = await planningEffects(f);
    expect(
      (await s.plan({ subject: colleague.subject, workspaceId: f.workspaceId }))
        .status,
    ).toBe(403);
    expect(
      (await s.plan({ companyId: '00000000-0000-4000-8000-000000009299' }))
        .status,
    ).toBe(403);
    expect(
      (await s.plan({ workspaceId: '00000000-0000-4000-8000-000000009298' }))
        .status,
    ).toBe(403);
    expect(await planningEffects(f)).toEqual(baseline);
    expect(
      (
        await f.request(
          `/company-task-manager-assignments/${f.membershipId}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    const revoked = await planningEffects(f);
    const denied = await s.plan({ key: 'current-authority' });
    expect(denied.status).toBe(403);
    expect(await json(denied)).not.toHaveProperty('tasks');
    expect(await planningEffects(f)).toEqual(revoked);
  });

  it.each(['row', 'event', 'receipt'])(
    'rolls every Task, history and Client fence back if the last %s fails',
    async (failure) => {
      const s = await preparePlanning(f, 2);
      const last = s.body.tasks
        .map((task) => task.taskId)
        .sort()
        .at(-1);
      if (!last) throw new Error('A final Task is required.');
      const table =
        failure === 'row'
          ? 'tasks'
          : failure === 'event'
            ? 'task_events'
            : 'task_commands';
      const condition =
        failure === 'row'
          ? `NEW.id='${last}'::uuid`
          : failure === 'event'
            ? `NEW.task_id='${last}'::uuid`
            : "NEW.result->>'schema'='task-planning/v1'";
      const baseline = await planningEffects(f);
      // Isolated fault injection proves actual transaction rollback through public REST, including the final receipt.
      await f.harness.pool.query(
        `CREATE FUNCTION reject_planning_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Synthetic final planning failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_planning_final BEFORE ${failure === 'row' ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION reject_planning_final();`,
      );
      try {
        expect((await s.plan({ key: 'atomic-attempt' })).status).toBe(500);
        expect(await planningEffects(f)).toEqual(baseline);
        await assertOriginalPlanning(f, s);
      } finally {
        await f.harness.pool.query(
          `DROP TRIGGER reject_planning_final ON ${table}; DROP FUNCTION reject_planning_final();`,
        );
      }
      expect((await s.plan({ key: 'atomic-attempt' })).status).toBe(201);
    },
  );
});
