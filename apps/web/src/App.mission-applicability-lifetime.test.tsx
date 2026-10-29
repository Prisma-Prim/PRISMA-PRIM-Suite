import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue } from './test/select-option';
import {
  actor,
  companyId,
  projectId,
  project,
  plan,
  snapshot,
  installParentServer,
} from './test/mission-applicability-app-fixture';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
const administrator = {
  ...actor,
  workspacePermissions: ['client.manage', 'company.assignment.manage'],
};
function installActorPublication(
  fresh: unknown,
  override: (
    path: string,
    init: RequestInit | undefined,
  ) => Promise<Response | undefined>,
  initial: unknown = administrator,
) {
  let current: unknown = initial,
    granted = false,
    actorReads = 0,
    activityReads = 0;
  installParentServer(
    () => current,
    async (path, init) => {
      if (path === '/api/access/current-actor') actorReads++;
      if (path === '/api/activity-log') activityReads++;
      const result = await override(path, init);
      if (result) return result;
      if (path === '/api/company-context-assignments/administration')
        return Response.json({
          members: [
            {
              workspaceMembershipId: actor.workspaceMembershipId,
              displayName: actor.displayName,
              email: actor.email,
            },
          ],
          companies: [{ id: companyId, displayName: 'Company DEMO' }],
          assignments: granted
            ? [
                {
                  id: 'admin-reviewer-demo',
                  workspaceMembershipId: actor.workspaceMembershipId,
                  companyId,
                  bundle: 'Company Mission Result Reviewer',
                  permissionSetVersion: 'v1',
                  active: true,
                },
              ]
            : [],
        });
      if (
        path === '/api/company-mission-result-reviewer-assignments' &&
        init?.method === 'POST'
      ) {
        current = fresh;
        granted = true;
        return Response.json(
          {
            id: 'admin-reviewer-demo',
            workspaceMembershipId: actor.workspaceMembershipId,
            companyId,
            bundle: 'Company Mission Result Reviewer',
            permissionSetVersion: 'v1',
            active: true,
          },
          { status: 201 },
        );
      }
      return undefined;
    },
  );
  return { counts: () => ({ actorReads, activityReads }) };
}
async function mount() {
  render(
    <StrictMode>
      <App identity={deterministicBrowserIdentity()} />
    </StrictMode>,
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.change(
    await within(projects).findByRole('textbox', { name: 'Project title' }),
    { target: { value: 'Independent parent Project draft DEMO' } },
  );
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: new RegExp(project.title),
    }),
  );
  const panel = await screen.findByRole('region', {
    name: 'Mission activity applicability',
  });
  await within(panel).findByRole('combobox', { name: 'Source activity' });
  return { projects, panel };
}
async function publishFresh(bundle = 'mission-result-reviewer') {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: /Access/i }),
  );
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(
    await within(access).findByRole('combobox', { name: 'Workspace member' }),
    actor.workspaceMembershipId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Company' }),
    companyId,
  );
  changeValue(
    within(access).getByRole('combobox', { name: 'Access bundle' }),
    bundle,
  );
  fireEvent.click(within(access).getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Fresh parent Actor DEMO');
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Projects' }),
  );
}
async function prepareProposal(panel: HTMLElement) {
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Proposal reason (1–1000 characters)',
    }),
    { target: { value: 'Exact held proposal DEMO' } },
  );
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Reported scope basis (1–2000 characters)',
    }),
    { target: { value: 'Exact scope DEMO' } },
  );
  fireEvent.change(
    within(panel).getByRole('textbox', {
      name: 'Reported agreement basis (1–2000 characters)',
    }),
    { target: { value: 'No contractual change reported DEMO' } },
  );
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Review exact proposal' }),
  );
}

const readCaptures = [
  'clientPermissionAssignmentId',
  'projectPermissionAssignmentId',
  'taskPermissionAssignmentId',
  'projectTemplatePermissionAssignmentId',
  'documentPermissionAssignmentId',
  'documentContentReaderAssignmentId',
  'missionDeliverableAccessAssignmentId',
] as const;
it.each(
  readCaptures.flatMap((field) =>
    [200, 403].map((status) => ({ field, status })),
  ),
)(
  'retires original HTTP $status after actual App accepts an equal-permission replacement $field, without stale render or Actor/Company/Activity effects',
  async ({ field, status }) => {
    const initial =
      field === 'clientPermissionAssignmentId'
        ? {
            ...administrator,
            workspacePermissions: ['company.assignment.manage'],
            activeCompany: {
              ...actor.activeCompany,
              clientPermissions: ['client.read'],
              clientPermissionAssignmentId: 'client-capture-demo',
              clientPermissionSetVersion: 'v1',
            },
          }
        : administrator;
    const fresh = {
      ...initial,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...initial.activeCompany,
        [field]: 'replacement-live-capture',
      },
    };
    let hold = false,
      finish: ((response: Response) => void) | undefined;
    const server = installActorPublication(
      fresh,
      async (path, init) => {
        if (
          path === `/api/projects/${projectId}/mission-applicability` &&
          init?.method !== 'POST' &&
          hold
        ) {
          hold = false;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
        return undefined;
      },
      initial,
    );
    const { panel } = await mount();
    hold = true;
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Reload current applicability',
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishFresh();
    const before = server.counts(),
      previous = snapshot();
    const stale = {
      ...previous,
      applicability: {
        ...previous.applicability,
        activities: previous.applicability.activities.map((row, index) =>
          index === 0
            ? {
                ...row,
                task: { ...row.task, title: 'RETIRED PROTECTED TASK SENTINEL' },
              }
            : row,
        ),
      },
    };
    await act(async () => {
      finish?.(
        status === 200 ? Response.json(stale) : new Response(null, { status }),
      );
    });
    expect(
      screen.queryByText(/RETIRED PROTECTED TASK SENTINEL/u),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Fresh parent Actor DEMO')).toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(
      await screen.findByRole('region', {
        name: 'Mission activity applicability',
      }),
    ).toBeInTheDocument();
  },
  20_000,
);

it.each([200, 403])(
  'retires an already-started original proposal HTTP %s after Coordinator capture replacement while independently readable history remains',
  async (status) => {
    const fresh = {
      ...administrator,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...actor.activeCompany,
        missionApplicabilityCoordinatorAssignmentId: 'coordinator-regrant-demo',
      },
    };
    let finish: ((response: Response) => void) | undefined;
    const server = installActorPublication(fresh, async (path, init) => {
      if (
        path === `/api/projects/${projectId}/mission-applicability` &&
        init?.method === 'POST'
      )
        return new Promise((resolve) => {
          finish = resolve;
        });
      return undefined;
    });
    const { panel, projects } = await mount();
    await prepareProposal(panel);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record proposal' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishFresh();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 200
          ? Response.json(
              {
                action: 'recorded',
                projectId,
                factId: 'retired-fact-demo',
                applicabilityRevision: 1,
              },
              { status: 201 },
            )
          : new Response(null, { status }),
      );
    });
    const current = screen.getByRole('region', {
      name: 'Mission activity applicability',
    });
    expect(
      within(current).queryByText('Applicability fact confirmed.'),
    ).not.toBeInTheDocument();
    expect(
      within(current).getByRole('region', {
        name: 'Project-wide applicability history',
      }),
    ).toBeInTheDocument();
    expect(
      within(current).getByRole('textbox', {
        name: 'Proposal reason (1–1000 characters)',
      }),
    ).toHaveValue('');
    expect(server.counts()).toEqual(before);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
  },
  20_000,
);

it.each(
  ['selected', 'workspace'].flatMap((recovery) =>
    [200, 403].map((status) => ({ recovery, status })),
  ),
)(
  'ignores already-started $recovery recovery HTTP $status after a recovery-only full Actor change accepted through actual administration',
  async ({ recovery, status }) => {
    const fresh = {
      ...administrator,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...actor.activeCompany,
        missionResultReviewPermissions: ['project.mission_result.review'],
        missionResultReviewerAssignmentId: 'reviewer-fresh-demo',
        missionResultReviewerPermissionSetVersion: 'v1',
      },
    };
    let denied = false,
      recovering = false,
      finish: ((response: Response) => void) | undefined;
    const server = installActorPublication(fresh, async (path, init) => {
      if (
        path === `/api/projects/${projectId}/mission-applicability` &&
        denied
      ) {
        denied = false;
        recovering = true;
        return new Response(null, { status: 403 });
      }
      if (path === '/api/access/current-actor' && recovering) {
        const selected = new Headers(init?.headers).has('x-company-context-id');
        if (recovery === 'workspace' && selected)
          return new Response(null, { status: 403 });
        recovering = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const { panel, projects } = await mount();
    denied = true;
    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'Reload current applicability',
      }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishFresh();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 200
          ? Response.json(administrator)
          : new Response(null, { status }),
      );
    });
    expect(screen.getByText('Fresh parent Actor DEMO')).toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
  },
  20_000,
);

it.each([200, 403])(
  'retires pending decision HTTP %s after only Approver replacement, preserving Coordinator correction draft and independently readable history',
  async (status) => {
    const fresh = {
      ...administrator,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...actor.activeCompany,
        missionApplicabilityApproverAssignmentId: 'approver-regrant-demo',
      },
    };
    let finish: ((response: Response) => void) | undefined,
      pending: unknown = null,
      current: unknown = administrator,
      actorReads = 0,
      activityReads = 0;
    const row = plan.activities[0];
    if (!row) throw new Error('Missing first preserved activity');
    installParentServer(
      () => current,
      async (path, init) => {
        if (path === '/api/access/current-actor') actorReads++;
        if (path === '/api/activity-log') activityReads++;
        if (path === '/api/company-context-assignments/administration')
          return Response.json({
            members: [
              {
                workspaceMembershipId: actor.workspaceMembershipId,
                displayName: actor.displayName,
                email: actor.email,
              },
            ],
            companies: [{ id: companyId, displayName: 'Company DEMO' }],
            assignments: [],
          });
        if (
          path === '/api/company-mission-applicability-approver-assignments' &&
          init?.method === 'POST'
        ) {
          current = fresh;
          return Response.json(
            {
              id: 'approver-regrant-demo',
              workspaceMembershipId: actor.workspaceMembershipId,
              companyId,
              bundle: 'Company Mission Applicability Approver',
              permissionSetVersion: 'v1',
              active: true,
            },
            { status: 201 },
          );
        }
        if (path === `/api/projects/${projectId}/mission-applicability`) {
          if (init?.method === 'POST') {
            const intent: unknown = JSON.parse(
              typeof init.body === 'string' ? init.body : 'null',
            );
            if (!intent || typeof intent !== 'object' || Array.isArray(intent))
              throw new Error('Expected public command body');
            if ('action' in intent && intent.action === 'DECIDE')
              return new Promise((resolve) => {
                finish = resolve;
              });
            pending = {
              id: 'pending-proposal-demo',
              revision: 1,
              kind: 'PROPOSED',
              predecessorId: null,
              activityPredecessorId: null,
              activityKey: row.key,
              source: {
                templateKey: plan.templateKey,
                version: 1,
                title: row.title,
                activity: row.activity,
                intendedResult: row.intendedResult,
              },
              intent,
              observedTask: {
                id: row.taskId,
                title: row.title,
                status: 'todo',
                version: 1,
              },
              observedResult: null,
              observedResultRevision: 0,
              observedLifecycleRevision: 0,
              actor: {
                internalUserId: actor.internalUserId,
                workspaceMembershipId: actor.workspaceMembershipId,
                displayName: actor.displayName,
              },
              capture: {
                assignmentId: 'coordinator-grant',
                permissionSetVersion: 'v1',
              },
              occurredAt: '2026-10-29T00:00:00.000Z',
            };
            return Response.json(
              {
                action: 'recorded',
                projectId,
                factId: 'pending-proposal-demo',
                applicabilityRevision: 1,
              },
              { status: 201 },
            );
          }
          const initial = snapshot();
          return Response.json({
            ...initial,
            applicability: {
              ...initial.applicability,
              revision: pending ? 1 : 0,
              activities: initial.applicability.activities.map(
                (activity, index) =>
                  index === 0
                    ? {
                        ...activity,
                        pendingProposal: pending,
                        lastProposal: pending,
                      }
                    : activity,
              ),
            },
          });
        }
        if (path.endsWith('/mission-applicability/history'))
          return Response.json({
            history: {
              kind: 'available',
              facts: pending ? [pending] : [],
              hasMore: false,
              nextBeforeRevision: null,
            },
          });
        return undefined;
      },
    );
    const { panel, projects } = await mount();
    await prepareProposal(panel);
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record proposal' }),
    );
    await within(panel).findByText('Applicability fact confirmed.');
    const correction = await within(panel).findByRole('textbox', {
      name: 'Proposal reason (1–1000 characters)',
    });
    fireEvent.change(correction, {
      target: { value: 'Independent Coordinator correction draft DEMO' },
    });
    fireEvent.change(
      within(panel).getByRole('textbox', {
        name: 'Decision basis (1–2000 characters)',
      }),
      { target: { value: 'Exact Approver basis DEMO' } },
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Review exact decision' }),
    );
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Record decision' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishFresh('mission-applicability-approver');
    const before = { actorReads, activityReads };
    await act(async () => {
      finish?.(
        status === 200
          ? Response.json(
              {
                action: 'recorded',
                projectId,
                factId: 'retired-decision-demo',
                applicabilityRevision: 2,
              },
              { status: 201 },
            )
          : new Response(null, { status }),
      );
    });
    const resumed = screen.getByRole('region', {
      name: 'Mission activity applicability',
    });
    expect(
      within(resumed).getByRole('textbox', {
        name: 'Proposal reason (1–1000 characters)',
      }),
    ).toHaveValue('Independent Coordinator correction draft DEMO');
    expect(
      within(resumed).getByRole('textbox', {
        name: 'Decision basis (1–2000 characters)',
      }),
    ).toHaveValue('');
    expect(
      within(resumed).getByRole('region', {
        name: 'Project-wide applicability history',
      }),
    ).toHaveTextContent('Exact held proposal DEMO');
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
    expect({ actorReads, activityReads }).toEqual(before);
    expect(screen.getByText('Fresh parent Actor DEMO')).toBeInTheDocument();
  },
  20_000,
);

it('conserves a pending proposal through an unrelated Reviewer grant, accepts its own held200, and suppresses stale full-Actor Activity effects', async () => {
  const fresh = {
    ...administrator,
    displayName: 'Fresh parent Actor DEMO',
    activeCompany: {
      ...actor.activeCompany,
      missionResultReviewPermissions: ['project.mission_result.review'],
      missionResultReviewerAssignmentId: 'unrelated-reviewer-demo',
      missionResultReviewerPermissionSetVersion: 'v1',
    },
  };
  let finish: ((response: Response) => void) | undefined,
    confirmed = false;
  const server = installActorPublication(fresh, async (path, init) => {
    if (path === `/api/projects/${projectId}/mission-applicability`) {
      if (init?.method === 'POST')
        return new Promise((resolve) => {
          finish = resolve;
        });
      if (confirmed) return new Response(null, { status: 503 });
    }
    return undefined;
  });
  const { panel, projects } = await mount();
  await prepareProposal(panel);
  fireEvent.click(
    within(panel).getByRole('button', { name: 'Record proposal' }),
  );
  await waitFor(() => expect(finish).toBeTypeOf('function'));
  await publishFresh();
  const before = server.counts();
  confirmed = true;
  await act(async () => {
    finish?.(
      Response.json(
        {
          action: 'recorded',
          projectId,
          factId: 'conserved-proposal-demo',
          applicabilityRevision: 1,
        },
        { status: 201 },
      ),
    );
  });
  const resumed = screen.getByRole('region', {
    name: 'Mission activity applicability',
  });
  await within(resumed).findByText('Applicability fact confirmed.');
  await within(resumed).findByText(
    'Current applicability could not be loaded.',
  );
  expect(server.counts()).toEqual(before);
  expect(
    within(projects).getByRole('textbox', { name: 'Project title' }),
  ).toHaveValue('Independent parent Project draft DEMO');
}, 20_000);
