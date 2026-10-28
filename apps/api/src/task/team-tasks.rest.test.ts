import { AccessService } from '../access/access.service.js';
import { ProjectService } from '../project/project.service.js';
import {
  planningEffects,
  eligiblePlanningColleague,
} from './task-planning.test-support.js';
import { objects } from '../project-template/project-pilot-plan.test-support.js';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createPilotPlanFixture,
  text,
  type PilotPlanFixture,
} from '../project-template/project-pilot-plan.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Company team Tasks through public REST', () => {
  let f: PilotPlanFixture;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Disposable PostgreSQL required.');
    f = await createPilotPlanFixture(url);
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());

  it('returns complete bounded cross-Project assigned nonblocked work and normalized criteria before paging', async () => {
    const first = await f.command('/projects', {
      title: 'First team mission DEMO',
      clientAccountId: f.clientId,
    });
    const second = await f.command('/projects', {
      title: 'Second team mission DEMO',
      clientAccountId: f.clientId,
    });
    const expected: unknown[] = [];
    for (let index = 0; index < 26; index++) {
      const project = index % 2 ? first : second;
      const task = await f.command(`/projects/${text(project.id)}/tasks`, {
        title: `Assigned team work ${index} DEMO`,
        assigneeMembershipId: f.membershipId,
        dueDate: `2099-11-${String(index + 1).padStart(2, '0')}`,
      });
      expected.push({
        ...task,
        project: {
          id: project.id,
          title: project.title,
          clientDisplayName: 'Pilot Client DEMO',
        },
      });
      const excluded = await f.command(`/projects/${text(first.id)}/tasks`, {
        title: `Done nonmatch ${index} DEMO`,
        dueDate: '2000-01-01',
      });
      await f.command(`/tasks/${text(excluded.id)}/complete`, {
        expectedVersion: 1,
      });
    }
    const appliedFilters = {
      state: 'open',
      responsibility: 'all',
      assigneeName: null,
      dueFrom: null,
      dueThrough: null,
    };
    expect(await f.read('/team-tasks')).toEqual({
      companyId: f.companyId,
      offset: 0,
      pageSize: 25,
      hasNextPage: true,
      appliedFilters,
      tasks: expected.slice(0, 25),
    });
    expect(await f.read('/team-tasks?offset=1')).toEqual({
      companyId: f.companyId,
      offset: 1,
      pageSize: 25,
      hasNextPage: false,
      appliedFilters,
      tasks: expected.slice(1),
    });
    expect(await f.read('/team-tasks?offset=00025')).toEqual({
      companyId: f.companyId,
      offset: 25,
      pageSize: 25,
      hasNextPage: false,
      appliedFilters,
      tasks: expected.slice(25),
    });
  });
  async function project(title = 'Team mission DEMO') {
    return text(
      (await f.command('/projects', { title, clientAccountId: f.clientId })).id,
    );
  }
  async function task(projectId: string, fields: Record<string, unknown> = {}) {
    return f.command(`/projects/${projectId}/tasks`, {
      title: 'Team work DEMO',
      ...fields,
    });
  }
  const ids = (page: Record<string, unknown>) =>
    objects(page.tasks).map((t) => t.id);
  it('intersects all native states, stored responsibility and inclusive literal date bounds before paging', async () => {
    const p = await project(),
      colleague = await eligiblePlanningColleague(f);
    const todo = await task(p, {
      dueDate: '0001-01-01',
      assigneeMembershipId: f.membershipId,
    });
    const progress = await task(p, {
      dueDate: '2026-10-28',
      assigneeMembershipId: colleague.member,
    });
    await f.command(`/tasks/${text(progress.id)}/status`, {
      expectedVersion: 1,
      status: 'in_progress',
    });
    const blocked = await task(p, { dueDate: '2026-10-28' });
    await f.command(`/tasks/${text(blocked.id)}/status`, {
      expectedVersion: 1,
      status: 'blocked',
      reason: 'Literal blockage DEMO',
    });
    const done = await task(p, { dueDate: '9999-12-31' });
    await f.command(`/tasks/${text(done.id)}/complete`, { expectedVersion: 1 });
    const cancelled = await task(p);
    await f.command(`/tasks/${text(cancelled.id)}/cancel`, {
      expectedVersion: 1,
      reason: 'Literal cancellation DEMO',
    });
    expect(ids(await f.read('/team-tasks'))).toEqual([
      todo.id,
      progress.id,
      blocked.id,
    ]);
    expect(ids(await f.read('/team-tasks?state=all'))).toEqual([
      todo.id,
      progress.id,
      blocked.id,
      done.id,
      cancelled.id,
    ]);
    for (const [state, id] of [
      ['todo', todo.id],
      ['in_progress', progress.id],
      ['blocked', blocked.id],
      ['done', done.id],
      ['cancelled', cancelled.id],
    ])
      expect(ids(await f.read(`/team-tasks?state=${state}`))).toEqual([id]);
    expect(
      ids(await f.read('/team-tasks?state=all&responsibility=unassigned')),
    ).toEqual([blocked.id, done.id, cancelled.id]);
    expect(
      ids(await f.read('/team-tasks?dueFrom=2026-10-28&dueThrough=2026-10-28')),
    ).toEqual([progress.id, blocked.id]);
    expect(
      ids(await f.read('/team-tasks?state=all&dueThrough=0001-01-01')),
    ).toEqual([todo.id]);
    expect(
      ids(await f.read('/team-tasks?state=all&dueFrom=9999-12-31')),
    ).toEqual([done.id]);
    await f.request(
      `/company-task-manager-assignments/${colleague.member}/${f.companyId}`,
      { method: 'DELETE' },
    );
    expect(objects((await f.read('/team-tasks')).tasks)[1]).toMatchObject({
      id: progress.id,
      assignee: { workspaceMembershipId: colleague.member },
    });
    const changed = await f.request(`/tasks/${text(todo.id)}`, {
      method: 'PATCH',
      body: { expectedVersion: 1, dueDate: null, assigneeMembershipId: null },
    });
    expect(changed.status).toBe(200);
    expect(ids(await f.read('/team-tasks?dueThrough=2026-10-28'))).toEqual([
      progress.id,
      blocked.id,
    ]);
    await f.command(`/tasks/${text(done.id)}/reopen`, { expectedVersion: 2 });
    expect(ids(await f.read('/team-tasks?state=todo'))).toEqual([
      done.id,
      todo.id,
    ]);
  });
  it('uses exact NFC and finite Latin/Romanian/Russian case pairs and literal punctuation on PostgreSQL', async () => {
    const p = await project(),
      t = await task(p, { assigneeMembershipId: f.membershipId });
    for (const [label, needle, match] of [
      ['S\u0327TEFA\u0306N ȚÂÎ', '  stefan tai  ', true],
      ['ÀÖ ØÞ ŒŸ', 'àö øþ œÿ', true],
      ['РУССКИЙ ЁЖ', 'русский ёж', true],
      ['й', 'и', false],
      ['é', 'e', false],
      ['Ω', 'ω', false],
      ['𐐀', '𐐨', false],
      ['😀 supplementary', '😀', true],
      ['😀'.repeat(200), '😀'.repeat(200), true],
      ["Literal O'Neil \\ % _ ? suffix", "O'Neil \\ % _ ?", true],
      ['No wildcards here', '%', false],
      ['No wildcard here', '_', false],
    ] satisfies [string, string, boolean][]) {
      await f.harness.pool.query(
        'UPDATE tasks SET assignee_display_label=$1 WHERE id=$2',
        [label, t.id],
      );
      const page = await f.read(
        '/team-tasks?responsibility=name&assigneeName=' +
          encodeURIComponent(needle),
      );
      expect(ids(page), JSON.stringify({ label, needle })).toEqual(
        match ? [t.id] : [],
      );
      expect(page.appliedFilters).toEqual({
        state: 'open',
        responsibility: 'name',
        assigneeName: needle.trim(),
        dueFrom: null,
        dueThrough: null,
      });
    }
  });
  it('rejects raw repetitions, malformed encoding and every unsupported grammar before live read authority', async () => {
    const bad = [
      'state=',
      'state=OPEN',
      'state=unknown',
      'responsibility=',
      'responsibility=member',
      'assigneeName=',
      'assigneeName=x',
      'responsibility=unassigned&assigneeName=',
      'responsibility=name',
      'responsibility=name&assigneeName=%20',
      'responsibility=name&assigneeName=%00',
      'responsibility=name&assigneeName=' +
        encodeURIComponent('😀'.repeat(201)),
      'dueFrom=',
      'dueFrom=null',
      'dueFrom=0000-01-01',
      'dueFrom=1900-02-29',
      'dueFrom=2026-02-30',
      'dueFrom=2026-1-01',
      'dueFrom=2026-01-01T00:00:00Z',
      'dueFrom=%202026-01-01',
      'dueFrom=2026-11-01&dueThrough=2026-10-01',
      'offset=-1',
      'offset=+1',
      'offset=1.0',
      'offset=1e2',
      'offset=',
      'offset=9007199254740992',
      'offset=0&offset=0',
      'state=open&%73tate=open',
      'dueFrom=2026-01-01&dueFrom=2026-01-01',
      'state[]=open',
      'state[x]=open',
      'companyId=x',
      'limit=25',
      'pageSize=25',
      'sort=title',
      'priority=normal',
      'title=x',
      'memberId=x',
      '%ZZ=x',
      'state=%C0%AF',
      'responsibility=name&assigneeName=%ED%A0%80',
    ];
    await f.request(
      `/company-task-manager-assignments/${f.membershipId}/${f.companyId}`,
      { method: 'DELETE' },
    );
    for (const query of bad)
      expect((await f.request('/team-tasks?' + query)).status, query).toBe(400);
    expect((await f.request('/team-tasks')).status).toBe(403);
    expect(
      (await f.request('/team-tasks?state=bad', { companyId: '' })).status,
    ).toBe(403);
    expect(
      (await fetch(f.harness.origin + '/api/team-tasks?state=bad')).status,
    ).toBe(401);
  });
  it.each(['task', 'project', 'client', 'suspension'] as const)(
    'rechecks live %s authority and does not disclose held work',
    async (kind) => {
      const p = await project();
      await task(p);
      const colleague = await eligiblePlanningColleague(f),
        options = { subject: colleague.subject, workspaceId: f.workspaceId };
      expect(ids(await f.read('/team-tasks', options))).toHaveLength(1);
      if (kind === 'suspension')
        await f.command('/workspace-membership-suspensions', {
          workspaceMembershipId: colleague.member,
        });
      else {
        const paths = {
          task: 'company-task-manager',
          project: 'company-project',
          client: 'company-director-client',
        };
        expect(
          (
            await f.request(
              `/${paths[kind]}-assignments/${colleague.member}/${f.companyId}`,
              { method: 'DELETE' },
            )
          ).status,
        ).toBe(200);
      }
      const before = await planningEffects(f);
      expect((await f.request('/team-tasks', options)).status).toBe(403);
      expect(await planningEffects(f)).toEqual(before);
    },
  );
  it('excludes real other-Company work before lookahead and refuses foreign Workspace selection', async () => {
    const visible = await task(await project(), { dueDate: '2099-12-31' });
    const otherCompany = text(
      (
        await f.command('/companies', {
          displayName: 'Other team Company DEMO',
        })
      ).id,
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
    const options = { companyId: otherCompany };
    const client = await f.command(
      '/clients',
      { displayName: 'Other team Client DEMO' },
      options,
    );
    const otherProject = await f.command(
      '/projects',
      {
        title: 'Other team Project DEMO',
        clientAccountId: text(client.id),
      },
      options,
    );
    const otherTasks = [];
    for (let i = 0; i < 26; i++)
      otherTasks.push(
        await f.command(
          `/projects/${text(otherProject.id)}/tasks`,
          {
            title: `Other Company team Task ${i} DEMO`,
            dueDate: '2000-01-01',
          },
          options,
        ),
      );
    expect(ids(await f.read('/team-tasks', options))).toEqual(
      otherTasks.slice(0, 25).map((t) => t.id),
    );
    const before = await planningEffects(f);
    const page = await f.read('/team-tasks');
    expect(ids(page)).toEqual([visible.id]);
    expect(page.hasNextPage).toBe(false);
    const foreignWorkspace = '00000000-0000-4000-8000-000000000946';
    await f.harness.pool.query(
      'INSERT INTO workspaces (id, name) VALUES ($1,$2)',
      [foreignWorkspace, 'Foreign team Workspace DEMO'],
    );
    const denied = await f.request('/team-tasks', {
      workspaceId: foreignWorkspace,
    });
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain('Company team Task');
    expect(await planningEffects(f)).toEqual(before);
  });
  it('refuses missing, unknown and mismatched captured Client authority despite a live native grant', async () => {
    await task(await project());
    const colleague = await eligiblePlanningColleague(f);
    const options = { subject: colleague.subject, workspaceId: f.workspaceId };
    expect(ids(await f.read('/team-tasks', options))).toHaveLength(1);
    for (const kind of ['missing', 'unknown', 'mismatched'] as const) {
      const original = AccessService.prototype.resolveActor;
      const malformed = vi
        .spyOn(AccessService.prototype, 'resolveActor')
        .mockImplementationOnce(async function (this: AccessService, ...args) {
          const actor = await original.apply(this, args);
          const company = actor.activeCompany;
          if (company) {
            if (kind === 'missing') delete company.clientPermissionAssignmentId;
            else
              Object.defineProperty(company, 'clientPermissionSetVersion', {
                value:
                  kind === 'unknown'
                    ? 'unknown'
                    : company.clientPermissionSetVersion === 'v1'
                      ? 'v2'
                      : 'v1',
              });
          }
          return actor;
        });
      try {
        expect((await f.request('/team-tasks', options)).status, kind).toBe(
          403,
        );
      } finally {
        malformed.mockRestore();
      }
    }
    expect(ids(await f.read('/team-tasks', options))).toHaveLength(1);
  });
  it('uses one unlocked readonly repeatable-read snapshot through native Project/Client and bounds Task selection', async () => {
    await task(await project());
    const before = await planningEffects(f);
    const trace = await f.harness.measureApplicationQueries(() =>
      f.read('/team-tasks'),
    );
    const start = trace.queries.findIndex((q) =>
      /^begin isolation level repeatable read read only$/i.test(q),
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const read = trace.queries.slice(start);
    expect(read.at(-1)).toBe('commit');
    expect(read.filter((q) => /^begin/i.test(q))).toHaveLength(1);
    expect(read.join(' ')).not.toMatch(
      /for (?:key )?share|for update|advisory|insert into|delete from|update "/i,
    );
    expect(read.join(' ')).toMatch(/client_company_relationships/);
    expect(read.join(' ')).toMatch(/workspace_permission_grants/);
    const selections = read.filter((q) => /from "tasks"/i.test(q));
    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatch(/limit \$\d+/);
    expect(await planningEffects(f)).toEqual(before);
  });
  it('keeps one coherent page when native Task and live Client authority change between Project and Task composition', async () => {
    const t = await task(await project(), {
      assigneeMembershipId: f.membershipId,
    });
    let reached = () => {},
      release = () => {};
    const atProject = new Promise<void>((r) => {
        reached = r;
      }),
      continued = new Promise<void>((r) => {
        release = r;
      });
    const original = ProjectService.prototype.listWithinReadTransaction;
    const barrier = vi
      .spyOn(ProjectService.prototype, 'listWithinReadTransaction')
      .mockImplementationOnce(async function (this: ProjectService, actor) {
        const value = await original.call(this, actor);
        reached();
        await continued;
        return value;
      });
    const colleague = await eligiblePlanningColleague(f);
    const pending = f.read('/team-tasks', {
      subject: colleague.subject,
      workspaceId: f.workspaceId,
    });
    try {
      await Promise.race([
        atProject,
        pending.then(() => {
          throw new Error('Expected Project snapshot barrier');
        }),
      ]);
      expect(
        (
          await f.request(`/tasks/${text(t.id)}`, {
            method: 'PATCH',
            body: {
              expectedVersion: 1,
              title: 'Committed later work',
              dueDate: '2026-10-28',
            },
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await f.request(
            `/company-director-client-assignments/${colleague.member}/${f.companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      release();
      expect(objects((await pending).tasks)[0]).toMatchObject(t);
      expect(
        (
          await f.request('/team-tasks', {
            subject: colleague.subject,
            workspaceId: f.workspaceId,
          })
        ).status,
      ).toBe(403);
      expect(objects((await f.read('/team-tasks')).tasks)[0]).toMatchObject({
        title: 'Committed later work',
        version: 2,
        dueDate: '2026-10-28',
      });
    } finally {
      release();
      barrier.mockRestore();
    }
  });

  it('filters unreadable original Clients before lookahead and retains closed native facts and original labels', async () => {
    const p = await project(),
      visible = await task(p, { dueDate: '2099-12-31' });
    const hiddenClient = text(
      (await f.command('/clients', { displayName: 'Hidden team Client DEMO' }))
        .id,
    );
    const hidden = text(
      (
        await f.command('/projects', {
          title: 'Hidden team mission DEMO',
          clientAccountId: hiddenClient,
        })
      ).id,
    );
    for (let i = 0; i < 26; i++)
      await task(hidden, {
        dueDate: '2000-01-01',
        title: `Hidden team work ${i} DEMO`,
      });
    await f.harness.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1",
      [hiddenClient],
    );
    expect(ids(await f.read('/team-tasks'))).toEqual([visible.id]);
    expect((await f.read('/team-tasks')).hasNextPage).toBe(false);
    await f.command('/company-project-approver-assignments', {
      companyId: f.companyId,
      workspaceMembershipId: f.membershipId,
    });
    const closed = await f.request(`/projects/${p}/lifecycle-transitions`, {
      method: 'POST',
      body: {
        action: 'cancel',
        expectedLifecycleRevision: 0,
        reason: 'Closed synthetic team mission',
      },
    });
    expect(closed.status).toBe(409);
    await f.harness.pool.query(
      "UPDATE projects SET status='cancelled', lifecycle_revision=1 WHERE id=$1",
      [p],
    );
    expect(ids(await f.read('/team-tasks'))).toEqual([visible.id]);
    expect(await f.read(`/tasks/${text(visible.id)}`)).toMatchObject({
      mutable: false,
      task: visible,
    });
    const canonical = text(
      (
        await f.command('/clients', {
          displayName: 'Canonical team Client DEMO',
        })
      ).id,
    );
    await f.harness.pool.query(
      "UPDATE client_accounts SET tax_id='TEAM-LEGACY-DEMO' WHERE id=ANY($1::uuid[])",
      [[f.clientId, canonical]],
    );
    const review = await f.command(`/clients/${f.clientId}/union-reviews`, {});
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
        reason: 'Synthetic original team Client DEMO',
      },
    );
    expect(objects((await f.read('/team-tasks')).tasks)[0]).toMatchObject({
      ...visible,
      project: { clientDisplayName: 'Pilot Client DEMO' },
    });
  });
  it('uses Workspace client.manage without a Company Client grant, and fails closed on unknown captured Task/Project versions', async () => {
    await task(await project());
    expect(
      (
        await f.request(
          `/company-director-client-assignments/${f.membershipId}/${f.companyId}`,
          { method: 'DELETE' },
        )
      ).status,
    ).toBe(200);
    expect(ids(await f.read('/team-tasks'))).toHaveLength(1);
    for (const field of [
      'taskPermissionSetVersion',
      'projectPermissionSetVersion',
      'taskPermissionAssignmentId',
      'projectPermissionAssignmentId',
    ]) {
      const original = AccessService.prototype.resolveActor;
      const malformed = vi
        .spyOn(AccessService.prototype, 'resolveActor')
        .mockImplementationOnce(async function (this: AccessService, ...args) {
          const actor = await original.apply(this, args);
          if (actor.activeCompany)
            Object.defineProperty(actor.activeCompany, field, {
              value: field.endsWith('Version') ? 'unknown' : undefined,
            });
          return actor;
        });
      try {
        expect((await f.request('/team-tasks')).status).toBe(403);
      } finally {
        malformed.mockRestore();
      }
    }
    expect(ids(await f.read('/team-tasks'))).toHaveLength(1);
  });
  it('preserves full creation precision/id order when public timestamps round to one millisecond', async () => {
    const p = await project(),
      first = await task(p),
      second = await task(p),
      third = await task(p);
    await f.harness.pool.query('ALTER TABLE tasks DISABLE TRIGGER USER');
    try {
      await f.harness.pool.query(
        "UPDATE tasks SET created_at='2026-10-28 00:00:00.000002+00' WHERE id=$1",
        [first.id],
      );
      await f.harness.pool.query(
        "UPDATE tasks SET created_at='2026-10-28 00:00:00.000001+00' WHERE id=ANY($1::uuid[])",
        [[second.id, third.id]],
      );
    } finally {
      await f.harness.pool.query('ALTER TABLE tasks ENABLE TRIGGER USER');
    }
    const tied = [text(second.id), text(third.id)].sort();
    expect(ids(await f.read('/team-tasks'))).toEqual([...tied, first.id]);
  });
  it('refuses a corrupted later stored native label rather than returning a valid prefix', async () => {
    const p = await project();
    await task(p);
    const later = await task(p, { assigneeMembershipId: f.membershipId });
    await f.harness.pool.query(
      "UPDATE tasks SET assignee_display_label='' WHERE id=$1",
      [later.id],
    );
    const before = await planningEffects(f),
      response = await f.request('/team-tasks');
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('Team work DEMO');
    expect(await planningEffects(f)).toEqual(before);
  });
});
