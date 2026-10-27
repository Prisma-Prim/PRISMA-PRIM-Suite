import { content } from './mission-plan.test-fixtures.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  object,
  text,
  objects,
  json,
} from '../project-template/project-pilot-plan.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Company mission plans through public REST', () => {
  let f: Awaited<ReturnType<typeof createPilotPlanFixture>>;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Missing disposable database');
    f = await createPilotPlanFixture(url, {
      serverClock: { now: () => new Date('2026-10-27T12:00:00.000Z') },
    });
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());
  it('publishes and reopens an immutable plan through a dedicated configurator without Project, Task or Client read', async () => {
    const subject = 'pilot-colleague';
    const who = { subject, workspaceId: f.workspaceId };
    const member = text(
      (await f.read('/access/current-actor', { ...who, companyId: '' }))
        .workspaceMembershipId,
    );
    await f.grant('/company-context-assignments', member);
    await f.grant('/company-mission-plan-configuration-assignments', member);
    expect(
      object((await f.read('/access/current-actor', who)).activeCompany)
        .missionPlanGrants,
    ).toMatchObject([
      {
        bundle: 'company_mission_plan_configuration',
        permissionSetVersion: 'v1',
        permissions: [
          'project.mission_plan.read',
          'project.mission_plan.publish',
        ],
      },
    ]);
    const published = await f.command('/mission-plans', content, {
      ...who,
      key: 'publish-first-plan',
    });
    const version = object(published.version);
    expect(version).toMatchObject({
      ...content,
      versionNumber: 1,
      workspaceId: f.workspaceId,
      companyId: f.companyId,
    });
    const exact = await f.read(
      `/mission-plans/${text(version.planId)}/versions/${text(version.id)}`,
      who,
    );
    expect(exact).toEqual(published);
    expect((await f.request('/clients/' + f.clientId, who)).status).toBe(403);
    expect((await f.request('/projects', who)).status).toBe(403);
    expect(
      (
        await f.request(
          '/projects/00000000-0000-4000-8000-000000000920/tasks',
          who,
        )
      ).status,
    ).toBe(403);
  });
  async function setup() {
    await f.grant('/company-mission-plan-configuration-assignments');
    await f.grant('/company-mission-plan-user-assignments');
    return object(
      (await f.command('/mission-plans', content, { key: 'first' })).version,
    );
  }
  function creation(
    v: Record<string, unknown>,
    fields: Record<string, unknown> = {},
  ) {
    return {
      title: 'Synthetic configurable mission',
      clientAccountId: f.clientId,
      planId: v.planId,
      versionId: v.id,
      versionNumber: v.versionNumber,
      ...fields,
    };
  }
  function successor(
    v: Record<string, unknown>,
    fields: Record<string, unknown> = {},
  ) {
    return f.command(`/mission-plans/${text(v.planId)}/versions`, {
      ...content,
      expectedHeadVersion: v.versionNumber,
      ...fields,
    });
  }
  async function effects() {
    return (
      await f.harness.pool.query(`SELECT
      (SELECT count(*)::int FROM mission_plan_versions) versions,
      (SELECT count(*)::int FROM mission_plan_commands) publications,
      (SELECT count(*)::int FROM mission_plan_instances) instances,
      (SELECT count(*)::int FROM projects) projects,
      (SELECT count(*)::int FROM tasks) tasks,
      (SELECT count(*)::int FROM activity_log_events) events,
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM client_accounts c) clients`)
    ).rows;
  }
  it('creates the exact source Tasks once, preserves source after native edits and successors, and leaves reads and retries effect-free', async () => {
    const v = await setup();
    const intent = creation(v),
      opts = { key: 'copy-once' };
    const project = await f.command(
      '/projects/from-mission-plan',
      intent,
      opts,
    );
    const id = text(project.id);
    expect(project.status).toBe('preparatory');
    const original = await f.read(`/projects/${id}/mission-plan`);
    const plan = object(original.plan);
    expect(plan.version).toEqual(v);
    const rows = objects(plan.tasks);
    expect(rows).toHaveLength(1);
    const taskId = text(rows[0]?.taskId);
    const task = await f.read(`/tasks/${taskId}`);
    expect(object(task.task)).toMatchObject({
      title: content.activities[0]?.title,
      status: 'todo',
      priority: 'normal',
      assignee: null,
      dueDate: null,
    });
    await f
      .request(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          expectedVersion: 1,
          title: 'Edited ordinary Task',
          priority: 'important',
          assigneeMembershipId: null,
          dueDate: null,
        },
      })
      .then((r) => expect(r.status).toBe(200));
    await successor(v, {
      title: 'Different new head',
      activities: [
        { ...content.activities[0], key: randomUUID(), title: 'New activity' },
      ],
    });
    const baseline = await effects();
    expect(await f.read(`/projects/${id}/mission-plan`)).toEqual(original);
    expect(
      await f.command('/projects/from-mission-plan', intent, opts),
    ).toMatchObject({ id });
    expect(await effects()).toEqual(baseline);
    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: creation(v, { title: 'Changed intent' }),
          key: 'copy-once',
        })
      ).status,
    ).toBe(409);
  });
  it('replays the original publication after a successor, with one outcome for concurrent identical keys and a conflict for changed intent', async () => {
    await f.grant('/company-mission-plan-configuration-assignments');
    const opts = { method: 'POST', body: content, key: 'shared-publication' };
    const replies = await Promise.all([
      f.request('/mission-plans', opts),
      f.request('/mission-plans', opts),
    ]);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
    const [firstReply, secondReply] = replies;
    if (!firstReply || !secondReply)
      throw new Error('Missing concurrent replies');
    const a = await json(firstReply),
      b = await json(secondReply);
    expect(a).toEqual(b);
    const v = object(a.version);
    await successor(v);
    expect(
      await f.command('/mission-plans', content, { key: 'shared-publication' }),
    ).toEqual(a);
    expect(
      (
        await f.request('/mission-plans', {
          ...opts,
          body: { ...content, title: 'Other' },
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request(`/mission-plans/${text(v.planId)}/versions`, {
          ...opts,
          body: { ...content, expectedHeadVersion: 2 },
        })
      ).status,
    ).toBe(409);
  });
  it('serializes two different successors from one observed head and keeps exact old Versions readable', async () => {
    const v = await setup();
    const path = `/mission-plans/${text(v.planId)}/versions`;
    const replies = await Promise.all([
      f.request(path, {
        method: 'POST',
        key: 'next-a',
        body: { ...content, title: 'A', expectedHeadVersion: 1 },
      }),
      f.request(path, {
        method: 'POST',
        key: 'next-b',
        body: { ...content, title: 'B', expectedHeadVersion: 1 },
      }),
    ]);
    expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
    const failed = replies.find((r) => r.status === 409);
    if (!failed) throw new Error('Expected conflict');
    expect((await json(failed)).code).toBe('STALE_VERSION');
    expect(
      (await f.read(`/mission-plans/${text(v.planId)}/versions/${text(v.id)}`))
        .version,
    ).toEqual(v);
  });
  it('paginates more than25 plans and Versions without hidden caps or source text, with scoped strict boundaries', async () => {
    const first = await setup();
    for (let n = 0; n < 26; n++)
      await f.command('/mission-plans', {
        ...content,
        title: `Catalogue ${n}`,
      });
    for (let n = 1; n < 27; n++)
      await successor({ ...first, versionNumber: n });
    const baseline = await effects();
    const page = await f.read('/mission-plans');
    expect(objects(page.items)).toHaveLength(25);
    const next = await f.read(
      '/mission-plans?cursor=' + encodeURIComponent(text(page.nextCursor)),
    );
    expect(objects(next.items)).toHaveLength(2);
    expect(
      new Set(
        [...objects(page.items), ...objects(next.items)].map((r) => r.planId),
      ).size,
    ).toBe(27);
    expect(JSON.stringify(page)).not.toContain('Literal activity');
    const hist = await f.read(`/mission-plans/${text(first.planId)}/versions`);
    expect(objects(hist.items).map((r) => r.versionNumber)).toEqual(
      Array.from({ length: 25 }, (_, n) => 27 - n),
    );
    expect(
      objects(
        (
          await f.read(
            `/mission-plans/${text(first.planId)}/versions?beforeVersion=${text(hist.nextBeforeVersion)}`,
          )
        ).items,
      ).map((r) => r.versionNumber),
    ).toEqual([2, 1]);
    expect(
      objects(
        (
          await f.read(
            `/mission-plans/${text(first.planId)}/versions?beforeVersion=1`,
          )
        ).items,
      ),
    ).toEqual([]);
    for (const query of [
      '?limit=1',
      '?cursor=x',
      '?cursor=',
      '?cursor=a&cursor=b',
      '?cursor[]=x',
    ])
      expect((await f.request('/mission-plans' + query)).status).toBe(400);
    for (const query of [
      '?beforeVersion=0',
      '?beforeVersion=01',
      '?beforeVersion=1&beforeVersion=2',
      '?cursor=x',
      '?beforeVersion=2147483648',
    ])
      expect(
        (
          await f.request(
            `/mission-plans/${text(first.planId)}/versions` + query,
          )
        ).status,
      ).toBe(400);
    const cursor = object(
      JSON.parse(Buffer.from(text(page.nextCursor), 'base64url').toString()),
    );
    for (const replacement of [
      { companyId: randomUUID() },
      { workspaceId: randomUUID() },
      { createdAt: '0000-01-01T00:00:00.000000Z' },
      { createdAt: '2026-02-30T00:00:00.000000Z' },
      { format: 'estimate' },
    ]) {
      const bad = Buffer.from(
        JSON.stringify({ ...cursor, ...replacement }),
      ).toString('base64url');
      expect((await f.request('/mission-plans?cursor=' + bad)).status).toBe(
        400,
      );
    }
    expect(await effects()).toEqual(baseline);
  });
  it.each([
    { activities: [] },
    {
      activities: Array.from({ length: 51 }, () => ({
        ...content.activities[0],
        key: randomUUID(),
      })),
    },
    { activities: [content.activities[0], content.activities[0]] },
    { activities: [{ ...content.activities[0], key: 'not-a-key' }] },
    { activities: [{ ...content.activities[0], activity: ' \n\t' }] },
    {
      activities: [
        { ...content.activities[0], intendedResult: '🌍'.repeat(2001) },
      ],
    },
    { extra: 'unknown' },
  ])(
    'rejects invalid complete content without partial source or events: %j',
    async (fields) => {
      await f.grant('/company-mission-plan-configuration-assignments');
      const baseline = await effects();
      expect(
        (
          await f.request('/mission-plans', {
            method: 'POST',
            body: { ...content, ...fields },
          })
        ).status,
      ).toBe(400);
      expect(await effects()).toEqual(baseline);
    },
  );
  it('retains all50 ordered literal Unicode activities and native normalized titles', async () => {
    await f.grant('/company-mission-plan-configuration-assignments');
    const activities = Array.from({ length: 50 }, (_, n) => ({
      key: randomUUID(),
      title: `  Activity ${n}  `,
      activity: '🌍'.repeat(2000),
      intendedResult: ' \n Résultat\t ',
    }));
    const v = object(
      (await f.command('/mission-plans', { title: '  Model  ', activities }))
        .version,
    );
    expect(v.title).toBe('Model');
    expect(objects(v.activities)).toEqual(
      activities.map((a) => ({ ...a, title: a.title.trim() })),
    );
  });
  it('denies implicit Owner, partial and unknown captures, User publication and foreign exact reads with no receipt disclosure', async () => {
    expect((await f.request('/mission-plans')).status).toBe(403);
    await f.grant('/company-mission-plan-user-assignments');
    expect((await f.read('/mission-plans')).items).toEqual([]);
    expect(
      (await f.request('/mission-plans', { method: 'POST', body: content }))
        .status,
    ).toBe(403);
    await expect(
      f.harness.pool.query(
        "UPDATE company_role_assignments SET permission_set_version=NULL WHERE bundle='company_mission_plan_user'",
      ),
    ).rejects.toThrow();
    expect((await f.request('/mission-plans')).status).toBe(200);
    await expect(
      f.harness.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v999' WHERE bundle='company_mission_plan_user'",
      ),
    ).rejects.toThrow();
    expect((await f.request('/mission-plans')).status).toBe(200);
    const v = await setup();
    expect(
      (await f.request(`/mission-plans/${randomUUID()}/versions/${text(v.id)}`))
        .status,
    ).toBe(404);
    expect(
      (
        await f.request(
          `/mission-plans/${text(v.planId)}/versions/${randomUUID()}`,
        )
      ).status,
    ).toBe(404);
    const second = text(
      (await f.command('/companies', { displayName: 'Other Company DEMO' })).id,
    );
    await f.command('/company-mission-plan-configuration-assignments', {
      companyId: second,
      workspaceMembershipId: f.membershipId,
    });
    await f.command('/company-context-assignments', {
      companyId: second,
      workspaceMembershipId: f.membershipId,
    });
    expect(
      (
        await f.request(
          `/mission-plans/${text(v.planId)}/versions/${text(v.id)}`,
          { companyId: second },
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request('/mission-plans', {
          method: 'POST',
          companyId: second,
          body: content,
          key: 'first',
        })
      ).status,
    ).toBe(409);
  });
  it('refuses Project intent collisions in both directions while preserving manual and legacy receipts', async () => {
    const v = await setup();
    const manual = { title: 'Shared Project', clientAccountId: f.clientId };
    const project = await f.command('/projects', manual, { key: 'manual' });
    expect(await f.command('/projects', manual, { key: 'manual' })).toEqual(
      project,
    );
    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: creation(v, manual),
          key: 'manual',
        })
      ).status,
    ).toBe(409);
    await f.command('/projects/from-mission-plan', creation(v, manual), {
      key: 'new-copy',
    });
    expect(
      (
        await f.request('/projects', {
          method: 'POST',
          body: manual,
          key: 'new-copy',
        })
      ).status,
    ).toBe(409);
    const legacy = f.intent({
      title: manual.title,
      templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
    });
    const old = await f.command('/projects/from-template', legacy, {
      key: 'legacy',
    });
    expect(
      await f.command('/projects/from-template', legacy, { key: 'legacy' }),
    ).toEqual(old);
    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: creation(v, manual),
          key: 'legacy',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.request('/projects/from-template', {
          method: 'POST',
          body: legacy,
          key: 'new-copy',
        })
      ).status,
    ).toBe(409);
  });
  it('rolls back the final copy and publication receipt failures including all native effects', async () => {
    const v = await setup(),
      baseline = await effects();
    await f.harness.pool.query(
      "CREATE FUNCTION fail_mp_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic final copy failure'; END; $$; CREATE TRIGGER fail_mp_copy BEFORE INSERT ON mission_plan_task_copies FOR EACH ROW EXECUTE FUNCTION fail_mp_copy()",
    );
    try {
      expect(
        (
          await f.request('/projects/from-mission-plan', {
            method: 'POST',
            body: creation(v),
            key: 'rollback-copy',
          })
        ).status,
      ).toBe(500);
    } finally {
      await f.harness.pool.query(
        'DROP TRIGGER fail_mp_copy ON mission_plan_task_copies; DROP FUNCTION fail_mp_copy()',
      );
    }
    expect(await effects()).toEqual(baseline);
    await f.harness.pool.query(
      "CREATE FUNCTION fail_mp_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END; $$; CREATE TRIGGER fail_mp_receipt BEFORE INSERT ON mission_plan_commands FOR EACH ROW EXECUTE FUNCTION fail_mp_receipt()",
    );
    try {
      expect(
        (await f.request('/mission-plans', { method: 'POST', body: content }))
          .status,
      ).toBe(500);
    } finally {
      await f.harness.pool.query(
        'DROP TRIGGER fail_mp_receipt ON mission_plan_commands; DROP FUNCTION fail_mp_receipt()',
      );
    }
    expect(await effects()).toEqual(baseline);
  });
  it('database guards reject source edits, extra sealed rows and incomplete new sources or copied mappings', async () => {
    const v = await setup();
    await f.command('/projects/from-mission-plan', creation(v));
    for (const table of [
      'mission_plans',
      'mission_plan_versions',
      'mission_plan_activities',
      'mission_plan_commands',
      'mission_plan_instances',
      'mission_plan_task_copies',
    ]) {
      await expect(
        f.harness.pool.query(`DELETE FROM ${table}`),
      ).rejects.toThrow();
      await expect(
        f.harness.pool.query(`UPDATE ${table} SET workspace_id=workspace_id`),
      ).rejects.toThrow();
    }
    await expect(
      f.harness.pool.query(
        `INSERT INTO mission_plan_activities SELECT workspace_id,company_id,version_id,$1,1,title,activity,intended_result FROM mission_plan_activities LIMIT 1`,
        [randomUUID()],
      ),
    ).rejects.toThrow();
    await expect(
      f.harness.pool.query(
        'INSERT INTO mission_plans(workspace_id,company_id,created_at) VALUES($1,$2,now())',
        [f.workspaceId, f.companyId],
      ),
    ).rejects.toThrow();
    await expect(
      f.harness.pool.query(
        'INSERT INTO mission_plan_task_copies SELECT workspace_id,company_id,project_id,version_id,activity_key,1,task_id FROM mission_plan_task_copies',
      ),
    ).rejects.toThrow();
  });
  it('confirms a historical custom mission plan after original Client supersession while refusing new creation against that original identity', async () => {
    const sourceVersion = await setup();
    const key = randomUUID(),
      body = creation(sourceVersion),
      project = await f.command('/projects/from-mission-plan', body, {
        key,
      }),
      path = `/projects/${text(project.id)}/mission-plan`,
      copy = await f.read(path);
    const second = text(
      (
        await f.command('/clients', {
          displayName: 'Canonical Client DEMO',
        })
      ).id,
    );
    // A historical duplicate is fixture input; governed reconciliation uses REST.
    await f.harness.pool.query(
      "UPDATE client_accounts SET tax_id='PILOT-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
      [[f.clientId, second]],
    );
    const review = await f.command(`/clients/${f.clientId}/union-reviews`, {});
    expect(review.outcome).toBe('comparison');
    await f.command(
      `/client-union-reviews/${text(review.reviewReference)}/confirm`,
      {
        canonicalClientId: second,
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
        reason: 'Historical duplicate DEMO',
      },
    );
    const before = (
      await f.harness.pool.query(
        'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM task_events) events,(SELECT version FROM client_accounts WHERE id=$1) fence',
        [f.clientId],
      )
    ).rows;
    expect(
      await f.command('/projects/from-mission-plan', body, { key }),
    ).toMatchObject({ id: project.id });
    expect(await f.read(path)).toEqual(copy);
    expect(
      (await f.read(`/projects/${text(project.id)}/mission-readiness`))
        .assessment,
    ).toBeNull();

    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await f.harness.pool.query(
          'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM task_events) events,(SELECT version FROM client_accounts WHERE id=$1) fence',
          [f.clientId],
        )
      ).rows,
    ).toEqual(before);
  });
  it('retains the native100kb transport limit on unrelated commands and a finite1mb plan limit', async () => {
    expect(
      (
        await f.request('/companies', {
          method: 'POST',
          body: { displayName: 'x'.repeat(110000) },
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await f.request('/mission-plans', {
          method: 'POST',
          body: { title: 'x'.repeat(1100000) },
        })
      ).status,
    ).toBe(413);
  });
  it('projects one minimal publication Activity per immutable Version and hides it after loss of current plan read', async () => {
    const version = await setup();
    const events = objects((await f.read('/activity-log')).events).filter(
      (e) => e.action === 'mission_plan.version.published',
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: version.id,
      target: {
        type: 'mission_plan_version',
        companyId: f.companyId,
        planId: version.planId,
        versionId: version.id,
      },
      metadata: { versionNumber: 1, activityCount: 1 },
    });
    expect(Object.keys(object(events[0]?.metadata)).sort()).toEqual([
      'activityCount',
      'versionNumber',
    ]);
    for (const secret of [
      'Literal activity',
      'Literal expected result',
      content.title,
      '@example.test',
      'first',
    ])
      expect(JSON.stringify(events)).not.toContain(secret);
    await f.command('/mission-plans', content, { key: 'first' });
    expect(
      objects((await f.read('/activity-log')).events).filter(
        (e) => e.action === 'mission_plan.version.published',
      ),
    ).toEqual(events);
    for (const role of ['configuration', 'user'])
      expect(
        (
          await f.request(
            `/company-mission-plan-${role}-assignments/${f.membershipId}/${f.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
    expect(
      objects((await f.read('/activity-log')).events).filter(
        (e) => e.action === 'mission_plan.version.published',
      ),
    ).toEqual([]);
  });
  it('separates copied-plan read from instantiation and requires the native Task authority independently', async () => {
    const v = await setup(),
      intent = creation(v),
      project = await f.command('/projects/from-mission-plan', intent, {
        key: 'separate-rights',
      });
    expect(
      (
        await f.request(
          `/company-mission-plan-user-assignments/${f.membershipId}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    expect(
      object((await f.read(`/projects/${text(project.id)}/mission-plan`)).plan)
        .version,
    ).toEqual(v);
    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: intent,
          key: 'separate-rights',
        })
      ).status,
    ).toBe(403);
    await f.grant('/company-mission-plan-user-assignments');
    expect(
      (
        await f.request(
          `/company-task-manager-assignments/${f.membershipId}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    expect(
      (await f.request(`/projects/${text(project.id)}/mission-plan`)).status,
    ).toBe(403);
    expect(
      (
        await f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: intent,
        })
      ).status,
    ).toBe(403);
  });

  it('recovers one creation from concurrent identical keys with one native Task/event/fence outcome', async () => {
    const v = await setup(),
      intent = creation(v),
      opts = { method: 'POST', key: 'concurrent-copy', body: intent };
    const replies = await Promise.all([
      f.request('/projects/from-mission-plan', opts),
      f.request('/projects/from-mission-plan', opts),
    ]);
    expect(replies.map((r) => r.status)).toEqual([201, 201]);
    const values = await Promise.all(replies.map(json));
    expect(values[0]).toEqual(values[1]);
    const counts = await f.harness.pool.query(
      'SELECT (SELECT count(*)::int FROM projects) projects,(SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM task_events) events,(SELECT count(*)::int FROM mission_plan_instances) instances',
    );
    expect(counts.rows).toEqual([
      { projects: 1, tasks: 1, events: 1, instances: 1 },
    ]);
  });
  it('replays the original readable copy after ordinary Project closure with no repeated native effects', async () => {
    const v = await setup(),
      intent = creation(v),
      opts = { key: 'closed-copy' },
      project = await f.command('/projects/from-mission-plan', intent, opts),
      projectId = text(project.id),
      copy = await f.read(`/projects/${projectId}/mission-plan`);
    for (const task of objects(object(copy.plan).tasks))
      await f.command(`/tasks/${text(task.taskId)}/complete`, {
        expectedVersion: 1,
      });
    await f.grant('/company-project-approver-assignments');
    expect(
      (
        await f.request(`/projects/${projectId}/lifecycle-transitions`, {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Synthetic ordinary closure',
          },
        })
      ).status,
    ).toBe(200);
    const baseline = await effects();
    expect(
      await f.command('/projects/from-mission-plan', intent, opts),
    ).toMatchObject({ id: projectId, status: 'cancelled' });
    expect(await f.read(`/projects/${projectId}/mission-plan`)).toEqual(copy);
    expect(await effects()).toEqual(baseline);
  });
});
