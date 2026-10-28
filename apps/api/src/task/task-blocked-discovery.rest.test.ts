import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  text,
  objects,
  type PilotPlanFixture,
} from '../project-template/project-pilot-plan.test-support.js';

import { randomUUID } from 'node:crypto';
import {
  eligiblePlanningColleague,
  planningEffects,
} from './task-planning.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Company blocked Tasks through public REST', () => {
  let f: PilotPlanFixture;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Disposable PostgreSQL required.');
    f = await createPilotPlanFixture(url);
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());

  async function mission(title = 'Blocked mission DEMO') {
    return text(
      (await f.command('/projects', { title, clientAccountId: f.clientId })).id,
    );
  }
  async function block(
    projectId: string,
    fields: {
      title: string;
      assigneeMembershipId?: string | null;
      dueDate?: string | null;
      priority?: 'normal' | 'important' | 'critical';
    },
    reason = 'Recorded blockage DEMO',
  ) {
    const task = await f.command(`/projects/${projectId}/tasks`, fields);
    return f.command(`/tasks/${text(task.id)}/status`, {
      expectedVersion: 1,
      status: 'blocked',
      reason,
    });
  }
  const ids = (page: Record<string, unknown>) =>
    objects(page.tasks).map((task) => task.id);

  it('discovers current native blockages across Projects with exact reasons, any responsible member and dates', async () => {
    const firstProject = await f.command('/projects', {
      title: 'First mission DEMO',
      clientAccountId: f.clientId,
    });
    const secondProject = await f.command('/projects', {
      title: 'Second mission DEMO',
      clientAccountId: f.clientId,
    });
    const firstId = text(firstProject.id),
      secondId = text(secondProject.id);
    const first = await f.command(`/projects/${firstId}/tasks`, {
      title: 'Await agreed evidence DEMO',
      assigneeMembershipId: f.membershipId,
      dueDate: '2099-11-02',
    });
    const second = await f.command(`/projects/${secondId}/tasks`, {
      title: 'Undated blockade DEMO',
    });
    await f.command(`/projects/${firstId}/tasks`, {
      title: 'Ordinary unblocked work DEMO',
    });
    const blockedFirst = await f.command(`/tasks/${text(first.id)}/status`, {
      expectedVersion: 1,
      status: 'blocked',
      reason: 'Lipsește documentul — Не хватает <script>literal</script>',
    });
    const blockedSecond = await f.command(`/tasks/${text(second.id)}/status`, {
      expectedVersion: 1,
      status: 'blocked',
      reason: 'Await a deliberate response DEMO',
    });
    const page = await f.read('/blocked-tasks');
    const project = (id: string, title: string) => ({
      id,
      title,
      clientDisplayName: 'Pilot Client DEMO',
    });
    expect(page).toEqual({
      companyId: f.companyId,
      offset: 0,
      pageSize: 25,
      hasNextPage: false,
      tasks: [
        { ...blockedFirst, project: project(firstId, 'First mission DEMO') },
        { ...blockedSecond, project: project(secondId, 'Second mission DEMO') },
      ],
    });
    expect((await f.read(`/tasks/${text(first.id)}`)).task).toEqual(
      blockedFirst,
    );
  });

  it('pages the entire unchanged blocked set at25/26/27, with dated-first ordering and no read effects', async () => {
    const first = await mission('First paged mission DEMO'),
      second = await mission('Other paged mission DEMO');
    const colleague = await eligiblePlanningColleague(f),
      expected: unknown[] = [];
    for (let index = 1; index <= 25; index++) {
      const task = await block(index % 2 ? first : second, {
        title: `Dated blocker ${index} DEMO`,
        dueDate: `2099-11-${String(index).padStart(2, '0')}`,
        assigneeMembershipId:
          index % 3 === 0
            ? colleague.member
            : index % 3 === 1
              ? f.membershipId
              : null,
        priority: index % 2 ? 'normal' : 'critical',
      });
      expected.push(task.id);
    }
    const exact = await f.read('/blocked-tasks');
    expect(ids(exact)).toEqual(expected);
    expect(exact.hasNextPage).toBe(false);
    const undated = await block(second, {
      title: 'First undated blocker DEMO',
      priority: 'critical',
    });
    const with26 = await f.read('/blocked-tasks');
    expect(ids(with26)).toEqual(expected);
    expect(with26.hasNextPage).toBe(true);
    expect(ids(await f.read('/blocked-tasks?offset=25'))).toEqual([undated.id]);
    const last = await block(first, {
      title: 'Last undated blocker DEMO',
      assigneeMembershipId: colleague.member,
    });
    const before = await planningEffects(f);
    expect(ids(await f.read('/blocked-tasks?offset=25'))).toEqual([
      undated.id,
      last.id,
    ]);
    expect(await f.read('/blocked-tasks?offset=50')).toMatchObject({
      offset: 50,
      hasNextPage: false,
      tasks: [],
    });
    expect(
      await f.read('/blocked-tasks?offset=9007199254740991'),
    ).toMatchObject({ hasNextPage: false, tasks: [] });
    expect(await planningEffects(f)).toEqual(before);
    const ordinary = await f.read(`/projects/${first}/tasks`);
    expect(objects(ordinary.tasks).length).toBeGreaterThan(0);
  });

  it('reflects only the current manual declaration after resume, reblock and completion while native history is preserved', async () => {
    const project = await mission(),
      task = await block(
        project,
        { title: 'Current declaration DEMO' },
        'Original reason DEMO',
      ),
      id = text(task.id);
    expect(ids(await f.read('/blocked-tasks'))).toEqual([id]);
    await f.command(`/tasks/${id}/status`, {
      expectedVersion: 2,
      status: 'in_progress',
    });
    expect(ids(await f.read('/blocked-tasks'))).toEqual([]);
    const next = await f.command(`/tasks/${id}/status`, {
      expectedVersion: 3,
      status: 'blocked',
      reason: 'New reason — motiv nou DEMO',
    });
    expect(objects((await f.read('/blocked-tasks')).tasks)[0]).toMatchObject(
      next,
    );
    expect(JSON.stringify(await f.read('/blocked-tasks'))).not.toContain(
      'Original reason DEMO',
    );
    expect(objects((await f.read(`/tasks/${id}/history`)).events)).toHaveLength(
      4,
    );
    await f.command(`/tasks/${id}/complete`, { expectedVersion: 4 });
    expect(ids(await f.read('/blocked-tasks'))).toEqual([]);
    expect(objects((await f.read(`/tasks/${id}/history`)).events)).toHaveLength(
      5,
    );
  });

  it('refuses unknown/repeated/unsafe query and foreign or missing context without leaking or changing native effects', async () => {
    await block(await mission(), { title: 'Protected blockade DEMO' });
    const before = await planningEffects(f);
    for (const query of [
      'offset=-1',
      'offset=1.5',
      'offset=9007199254740992',
      'offset=1&offset=2',
      'offset[]=0',
      'offset=',
      'companyId=x',
      'status=todo',
      'assignee=x',
      'pageSize=100',
    ]) {
      const response = await f.request(`/blocked-tasks?${query}`);
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain('Protected blockade');
    }
    for (const options of [
      { companyId: '' },
      { companyId: randomUUID() },
      { workspaceId: randomUUID() },
      { subject: 'unknown-member' },
    ]) {
      const response = await f.request('/blocked-tasks', options);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('Protected blockade');
    }
    expect((await fetch(`${f.harness.origin}/api/blocked-tasks`)).status).toBe(
      401,
    );
    expect(await planningEffects(f)).toEqual(before);
  });

  it.each(['task', 'project', 'client', 'suspension'] as const)(
    'revalidates live %s authority before disclosing a Company blockage',
    async (kind) => {
      await block(await mission(), { title: 'Live authority blockade DEMO' });
      const colleague = await eligiblePlanningColleague(f),
        options = { subject: colleague.subject, workspaceId: f.workspaceId };
      expect(ids(await f.read('/blocked-tasks', options))).toHaveLength(1);
      const paths = {
        task: 'company-task-manager-assignments',
        project: 'company-project-assignments',
        client: 'company-director-client-assignments',
      };
      if (kind === 'suspension')
        await f.command('/workspace-membership-suspensions', {
          workspaceMembershipId: colleague.member,
        });
      else
        expect(
          (
            await f.request(
              `/${paths[kind]}/${colleague.member}/${f.companyId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(200);
      const before = await planningEffects(f),
        response = await f.request('/blocked-tasks', options);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('Live authority blockade');
      expect(await planningEffects(f)).toEqual(before);
    },
  );

  it('retains a recorded responsible member after their eligibility is revoked, without turning the Task unassigned', async () => {
    const colleague = await eligiblePlanningColleague(f),
      task = await block(await mission(), {
        title: 'Recorded responsibility DEMO',
        assigneeMembershipId: colleague.member,
      });
    expect(
      (
        await f.request(
          `/company-task-manager-assignments/${colleague.member}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    expect(objects((await f.read('/blocked-tasks')).tasks)[0]).toMatchObject(
      task,
    );
    expect(ids(await f.read('/unassigned-tasks'))).toEqual([]);
  });

  it('keeps readable cancelled-Project blockages discoverable with their native read-only continuation', async () => {
    const project = await mission(),
      task = await block(project, { title: 'Closed Project blockade DEMO' }),
      id = text(task.id);
    await f.grant('/company-project-approver-assignments');
    expect(
      (
        await f.request(`/projects/${project}/lifecycle-transitions`, {
          method: 'POST',
          body: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Synthetic closure DEMO',
          },
        })
      ).status,
    ).toBe(409);
    // A historical persisted edge only: the real closure above correctly refuses open Tasks.
    await f.harness.pool.query(
      "UPDATE projects SET status='cancelled', lifecycle_revision=1 WHERE id=$1",
      [project],
    );
    const before = await planningEffects(f);
    expect(ids(await f.read('/blocked-tasks'))).toEqual([id]);
    expect(await f.read(`/tasks/${id}`)).toMatchObject({
      mutable: false,
      task,
    });
    expect(
      (
        await f.request(`/tasks/${id}/status`, {
          method: 'POST',
          body: { expectedVersion: 2, status: 'in_progress' },
        })
      ).status,
    ).toBe(409);
    expect(await planningEffects(f)).toEqual(before);
  });

  it('preserves original Client labels and blockage facts after governed union without enabling a new write', async () => {
    const task = await block(await mission(), {
        title: 'Historical blockage DEMO',
      }),
      id = text(task.id),
      canonical = text(
        (await f.command('/clients', { displayName: 'Canonical DEMO' })).id,
      );
    await f.harness.pool.query(
      "UPDATE client_accounts SET tax_id='BLOCKED-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
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
        reason: 'Synthetic historical duplicate DEMO',
      },
    );
    const before = await planningEffects(f),
      page = await f.read('/blocked-tasks');
    expect(objects(page.tasks)[0]).toMatchObject({
      ...task,
      project: { clientDisplayName: 'Pilot Client DEMO' },
    });
    expect(await f.read(`/tasks/${id}`)).toMatchObject({
      mutable: false,
      task,
    });
    expect(
      (
        await f.request(`/tasks/${id}/status`, {
          method: 'POST',
          body: { expectedVersion: 2, status: 'in_progress' },
        })
      ).status,
    ).toBe(404);
    expect(await planningEffects(f)).toEqual(before);
  });

  it('filters unreadable original Clients and other Companies before the first page is selected', async () => {
    const visible = await block(await mission(), {
      title: 'Visible blocker DEMO',
      dueDate: '2099-12-31',
    });
    const hiddenClient = text(
        (await f.command('/clients', { displayName: 'Hidden Client DEMO' })).id,
      ),
      hiddenProject = text(
        (
          await f.command('/projects', {
            title: 'Hidden Project DEMO',
            clientAccountId: hiddenClient,
          })
        ).id,
      );
    for (let i = 0; i < 26; i++)
      await block(hiddenProject, {
        title: `Hidden blocker ${i} DEMO`,
        dueDate: '2000-01-01',
      });
    await f.harness.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [hiddenClient, f.companyId],
    );
    const otherCompany = text(
      (await f.command('/companies', { displayName: 'Other Company DEMO' })).id,
    );
    for (const path of [
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
    ])
      await f.command(path, {
        companyId: otherCompany,
        workspaceMembershipId: f.membershipId,
      });
    const foreignClient = text(
        (
          await f.command(
            '/clients',
            { displayName: 'Foreign Client DEMO' },
            { companyId: otherCompany },
          )
        ).id,
      ),
      foreignProject = text(
        (
          await f.command(
            '/projects',
            { title: 'Foreign Project DEMO', clientAccountId: foreignClient },
            { companyId: otherCompany },
          )
        ).id,
      );
    const foreign = await f.command(
      `/projects/${foreignProject}/tasks`,
      { title: 'Foreign blocker DEMO', dueDate: '2000-01-01' },
      { companyId: otherCompany },
    );
    await f.command(
      `/tasks/${text(foreign.id)}/status`,
      { expectedVersion: 1, status: 'blocked', reason: 'Foreign reason DEMO' },
      { companyId: otherCompany },
    );
    const before = await planningEffects(f),
      page = await f.read('/blocked-tasks');
    expect(ids(page)).toEqual([visible.id]);
    expect(page.hasNextPage).toBe(false);
    expect(JSON.stringify(page)).not.toContain('Hidden');
    expect(JSON.stringify(page)).not.toContain('Foreign');
    expect(await planningEffects(f)).toEqual(before);
  });
});
