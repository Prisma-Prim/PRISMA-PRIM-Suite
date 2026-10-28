import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  object,
  objects,
  text,
} from '../project-template/project-pilot-plan.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Configured mission current work through public REST', () => {
  let f: Awaited<ReturnType<typeof createPilotPlanFixture>>;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Missing disposable database');
    f = await createPilotPlanFixture(url);
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());

  async function configured(count = 26) {
    await f.grant('/company-mission-plan-configuration-assignments');
    await f.grant('/company-mission-plan-user-assignments');
    const content = {
      title: 'Synthetic current-work source',
      activities: Array.from({ length: count }, (_, i) => ({
        key: randomUUID(),
        title: `Original activity ${i + 1}`,
        activity: ` Original action ${i + 1}\n🌍 `,
        intendedResult: ` Preserved intended result ${i + 1}\nЖ / é `,
      })),
    };
    const version = object(
      (await f.command('/mission-plans', content)).version,
    );
    const project = await f.command('/projects/from-mission-plan', {
      title: 'Synthetic configured mission',
      clientAccountId: f.clientId,
      planId: version.planId,
      versionId: version.id,
      versionNumber: version.versionNumber,
    });
    const projectId = text(project.id);
    const copy = object(
      (await f.read(`/projects/${projectId}/mission-plan`)).plan,
    );
    return { content, version, projectId, copy, mappings: objects(copy.tasks) };
  }

  it('returns all26 exact ordered source mappings with current native Tasks and independently unavailable results, without effects', async () => {
    const source = await configured();
    const native = await Promise.all(
      source.mappings.map((m) => f.read(`/tasks/${text(m.taskId)}`)),
    );
    const before = (
      await f.harness.pool.query(
        'SELECT (SELECT count(*) FROM activity_log_events) events, (SELECT count(*) FROM task_commands) commands, (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM client_accounts c) clients',
      )
    ).rows;
    const reply = await f.read(
      `/projects/${source.projectId}/mission-plan/current-work`,
    );
    expect(reply).toEqual({
      overview: {
        workspaceId: f.workspaceId,
        companyId: f.companyId,
        project: {
          id: source.projectId,
          clientAccountId: f.clientId,
          status: 'preparatory',
        },
        plan: source.copy,
        activities: source.mappings.map((m, i) => ({
          activityKey: source.content.activities[i]?.key,
          position: i,
          task: native[i]?.task,
          result: { kind: 'unavailable' },
        })),
      },
    });
    expect(objects(object(reply.overview).activities)).toHaveLength(26);
    expect(
      (
        await f.harness.pool.query(
          'SELECT (SELECT count(*) FROM activity_log_events) events, (SELECT count(*) FROM task_commands) commands, (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM client_accounts c) clients',
        )
      ).rows,
    ).toEqual(before);
  });
  it('loads the50-row boundary, preserves the old source after a reordered successor and reads edited current facts while excluding extra Tasks', async () => {
    const source = await configured(50);
    const taskId = text(source.mappings[25]?.taskId);
    expect(
      (
        await f.request(`/tasks/${taskId}`, {
          method: 'PATCH',
          body: {
            expectedVersion: 1,
            title: 'Current literal Task26',
            priority: 'critical',
            assigneeMembershipId: f.membershipId,
            dueDate: '2026-11-07',
          },
        })
      ).status,
    ).toBe(200);
    await f.command(`/tasks/${taskId}/status`, {
      expectedVersion: 2,
      status: 'blocked',
      reason: ' Current blockage Ж / é '.trim(),
    });
    await f.command(`/projects/${source.projectId}/tasks`, {
      title: 'Extra ordinary Task',
    });
    await f.command(`/mission-plans/${text(source.version.planId)}/versions`, {
      ...source.content,
      title: 'Later reordered source',
      expectedHeadVersion: 1,
      activities: [...source.content.activities]
        .reverse()
        .map((a) => ({ ...a, intendedResult: 'Changed successor' })),
    });
    const overview = object(
      (await f.read(`/projects/${source.projectId}/mission-plan/current-work`))
        .overview,
    );
    expect(overview.plan).toEqual(source.copy);
    const current = objects(overview.activities);
    expect(current).toHaveLength(50);
    expect(current[25]).toMatchObject({
      activityKey: source.content.activities[25]?.key,
      position: 25,
      task: {
        id: taskId,
        title: 'Current literal Task26',
        status: 'blocked',
        priority: 'critical',
        dueDate: '2026-11-07',
        assignee: { workspaceMembershipId: f.membershipId },
        blockage: { reason: 'Current blockage Ж / é' },
      },
    });
    expect(current[49]).toMatchObject({
      position: 49,
      activityKey: source.content.activities[49]?.key,
      task: { title: 'Original activity 50' },
    });
  });

  it('distinguishes legitimate manual, legacy and pilot absence from base refusal, malformed requests and missing scoped targets', async () => {
    expect(
      (
        await f.request(
          '/projects/not-a-uuid/mission-plan/current-work?offset=0',
        )
      ).status,
    ).toBe(403);
    await f.grant('/company-mission-plan-configuration-assignments');
    for (const path of [
      '/projects/not-a-uuid/mission-plan/current-work',
      `/projects/${randomUUID()}/mission-plan/current-work?offset=0`,
      `/projects/${randomUUID()}/mission-plan/current-work?x=1&x=2`,
      `/projects/${randomUUID()}/mission-plan/current-work?x[]=1`,
    ])
      expect((await f.request(path)).status).toBe(400);
    expect(
      (await f.request(`/projects/${randomUUID()}/mission-plan/current-work`))
        .status,
    ).toBe(404);
    const manual = await f.command('/projects', {
      title: 'Manual',
      clientAccountId: f.clientId,
    });
    const legacy = await f.command(
      '/projects/from-template',
      f.intent({ templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE' }),
    );
    const pilot = await f.command('/projects/from-template', f.intent());
    for (const project of [manual, legacy, pilot])
      expect(
        await f.read(`/projects/${text(project.id)}/mission-plan/current-work`),
      ).toEqual({ overview: null });
    const absent = await fetch(
      `${f.harness.origin}/api/projects/${text(manual.id)}/mission-plan/current-work`,
    );
    expect(absent.status).toBe(401);
  });

  it('reads closed and superseded original-Client history but requires live source, Project, Task and Client authority', async () => {
    const source = await configured(1);
    await f.harness.pool.query(
      "UPDATE projects SET status='completed', lifecycle_revision=1 WHERE id=$1",
      [source.projectId],
    );
    await f.harness.pool.query(
      "UPDATE client_accounts SET status='superseded' WHERE id=$1",
      [f.clientId],
    );
    expect(
      object(
        (
          await f.read(
            `/projects/${source.projectId}/mission-plan/current-work`,
          )
        ).overview,
      ).project,
    ).toMatchObject({ status: 'completed', clientAccountId: f.clientId });
    for (const bundle of [
      'company_mission_plan_configuration',
      'company_mission_plan_user',
    ])
      await f.harness.pool.query(
        'UPDATE company_role_assignments SET revoked_at=now() WHERE bundle=$1',
        [bundle],
      );
    expect(
      (
        await f.request(
          `/projects/${source.projectId}/mission-plan/current-work`,
        )
      ).status,
    ).toBe(403);
    expect(
      (await f.request(`/tasks/${text(source.mappings[0]?.taskId)}`)).status,
    ).toBe(200);
  });

  it('fails the whole read for a missing final mapping instead of returning a trusted prefix or no copy', async () => {
    const source = await configured();
    await f.harness.pool.query(
      'ALTER TABLE mission_plan_task_copies DISABLE TRIGGER USER',
    );
    try {
      await f.harness.pool.query(
        'DELETE FROM mission_plan_task_copies WHERE project_id=$1 AND position=25',
        [source.projectId],
      );
    } finally {
      await f.harness.pool.query(
        'ALTER TABLE mission_plan_task_copies ENABLE TRIGGER USER',
      );
    }
    const response = await f.request(
      `/projects/${source.projectId}/mission-plan/current-work`,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Original activity');
  });

  it.each(['company_task_manager', 'company_project_access', 'client'])(
    're-establishes live %s base authority before malformed and scoped targets',
    async (bundle) => {
      const source = await configured(1),
        subject = 'pilot-colleague';
      const member = text(
        (await f.read('/access/current-actor', { subject, companyId: '' }))
          .workspaceMembershipId,
      );
      for (const path of [
        'company-context',
        'company-director-client',
        'company-project',
        'company-task-manager',
        'company-mission-plan-user',
      ])
        await f.grant('/' + path + '-assignments', member);
      await f.harness.pool.query(
        'UPDATE company_role_assignments SET revoked_at=now() WHERE bundle=$1 AND workspace_membership_id=$2',
        [
          bundle === 'client' ? 'company_director_client_access' : bundle,
          member,
        ],
      );
      expect(
        (
          await f.request(
            `/projects/${source.projectId}/mission-plan/current-work`,
            { subject },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await f.request(
            '/projects/not-an-id/mission-plan/current-work?offset=0',
            { subject },
          )
        ).status,
      ).toBe(403);
      if (bundle === 'company_task_manager')
        expect(
          (
            await f.request(`/projects/${source.projectId}/mission-plan`, {
              subject,
            })
          ).status,
        ).toBe(403);
    },
  );
  it('uses actual foreign Company and Workspace contexts without disclosing the configured target', async () => {
    const source = await configured(1),
      foreignCompany = text(
        (await f.command('/companies', { displayName: 'Foreign Company DEMO' }))
          .id,
      );
    for (const path of [
      'company-context',
      'company-director-client',
      'company-project',
      'company-task-manager',
      'company-mission-plan-user',
    ])
      await f.command('/' + path + '-assignments', {
        companyId: foreignCompany,
        workspaceMembershipId: f.membershipId,
      });
    const foreign = await f.request(
      `/projects/${source.projectId}/mission-plan/current-work`,
      { companyId: foreignCompany },
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.text()).not.toContain('Original activity');
    const workspaceId = randomUUID();
    await f.harness.pool.query(
      'INSERT INTO workspaces(id,name) VALUES($1,$2)',
      [workspaceId, 'Foreign Workspace DEMO'],
    );
    const wrongWorkspace = await f.request(
      `/projects/${source.projectId}/mission-plan/current-work`,
      { workspaceId },
    );
    expect(wrongWorkspace.status).toBe(403);
  });
  it('rejects corrupt immutable source literals before returning current facts', async () => {
    const source = await configured(1);
    await f.harness.pool.query(
      'ALTER TABLE mission_plan_activities DISABLE TRIGGER USER',
    );
    try {
      await f.harness.pool.query(
        "UPDATE mission_plan_activities SET activity=E'\\t' WHERE version_id=$1",
        [source.version.id],
      );
    } finally {
      await f.harness.pool.query(
        'ALTER TABLE mission_plan_activities ENABLE TRIGGER USER',
      );
    }
    const response = await f.request(
      `/projects/${source.projectId}/mission-plan/current-work`,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain('Original activity');
  });
  it('rejects a corrupt native Task title instead of silently normalizing current facts', async () => {
    const source = await configured(1),
      taskId = text(source.mappings[0]?.taskId);
    await f.harness.pool.query(
      "UPDATE tasks SET title=E'\\tCorrupt native title\\t' WHERE id=$1",
      [taskId],
    );
    const response = await f.request(
      `/projects/${source.projectId}/mission-plan/current-work`,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('Corrupt native title');
  });
});
