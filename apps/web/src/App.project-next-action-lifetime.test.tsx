import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import {
  nextActionActor,
  nextActionPath,
  firstNextAction,
  installNextActionPublication,
  openNextActionApp,
  publishNextActionActor,
} from './test/project-next-action-app';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});
it.each([200, 403])(
  'retires held Company-only Client-read HTTP %s after an exact replacement without borrowing Workspace management',
  async (status) => {
    const initial = {
      ...nextActionActor,
      workspacePermissions: ['company.assignment.manage'],
      activeCompany: {
        ...nextActionActor.activeCompany,
        clientPermissions: ['client.read'],
        clientPermissionAssignmentId: 'exact-client-read',
        clientPermissionSetVersion: 'v1',
      },
    };
    const fresh = {
      ...initial,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...initial.activeCompany,
        clientPermissionAssignmentId: 'replacement-client-read',
      },
    };
    let hold = false,
      finish: ((response: Response) => void) | undefined;
    const server = installNextActionPublication(
      fresh,
      async (path, init) => {
        if (path === nextActionPath && hold && init?.method !== 'POST') {
          hold = false;
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
        return undefined;
      },
      initial,
    );
    const { panel } = await openNextActionApp();
    hold = true;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Reload current next action' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishNextActionActor();
    const next = await screen.findByRole('region', {
      name: 'Project next action',
    });
    await within(next).findByText('No next action recorded.');
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(firstNextAction('RETIRED CLIENT READ SENTINEL')),
      );
    });
    expect(screen.queryAllByText('RETIRED CLIENT READ SENTINEL')).toHaveLength(
      0,
    );
    expect(server.counts()).toEqual(before);
  },
);
it.each(
  [
    'projectPermissionAssignmentId',
    'projectNextActionCoordinatorAssignmentId',
  ].flatMap((field) => [200, 403].map((status) => ({ field, status }))),
)(
  'retires a held HTTP $status after exact $field replacement through the real administration parent',
  async ({ field, status }) => {
    const fresh = {
      ...nextActionActor,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...nextActionActor.activeCompany,
        [field]: 'replacement-capture',
      },
    };
    let hold = false,
      finish: ((value: Response) => void) | undefined;
    const server = installNextActionPublication(fresh, async (path, init) => {
      if (path === nextActionPath && hold && init?.method === 'POST') {
        hold = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const { panel, editor, projects } = await openNextActionApp();
    const missing = within(panel).getByText('No next action recorded.');
    fireEvent.change(editor, { target: { value: 'RETIRED WRITER SENTINEL' } });
    hold = true;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save next action' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishNextActionActor();
    const before = server.counts();
    if (field === 'projectNextActionCoordinatorAssignmentId')
      expect(within(panel).getByText('No next action recorded.')).toBe(missing);
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json({
              format: 'project-next-action-command-v1',
              outcome: 'changed',
              record: firstNextAction('RETIRED WRITER SENTINEL').current,
            }),
      );
    });
    expect(
      screen.queryByText('RETIRED WRITER SENTINEL'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Next action saved.')).not.toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
  },
);
it.each([200, 403])(
  'preserves independent next-action work after an unrelated Task capture changes, fencing old HTTP %s shared recovery',
  async (status) => {
    const fresh = {
      ...nextActionActor,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...nextActionActor.activeCompany,
        taskPermissionAssignmentId: 'fresh-task-only',
      },
    };
    let hold = false,
      finish: ((value: Response) => void) | undefined;
    const server = installNextActionPublication(fresh, async (path, init) => {
      if (path === nextActionPath && hold && init?.method === 'POST') {
        hold = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const { panel, editor } = await openNextActionApp();
    fireEvent.change(editor, { target: { value: 'Independent held action' } });
    hold = true;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Save next action' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishNextActionActor();
    expect(within(panel).getByRole('textbox', { name: 'Next action' })).toBe(
      editor,
    );
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json({
              format: 'project-next-action-command-v1',
              outcome: 'changed',
              record: firstNextAction('Independent held action').current,
            }),
      );
    });
    if (status === 200)
      expect(
        await within(panel).findByText('Next action saved.'),
      ).toBeInTheDocument();
    expect(server.counts().actorReads).toBe(before.actorReads);
    expect(server.counts().activityReads).toBe(before.activityReads);
    expect(screen.getByText('Fresh parent Actor DEMO')).toBeInTheDocument();
  },
);
it.each(
  ['selected', 'workspace'].flatMap((recovery) =>
    [200, 403].map((status) => ({ recovery, status })),
  ),
)(
  'ignores already-started $recovery recovery HTTP $status after a full Actor change through actual administration',
  async ({ recovery, status }) => {
    const fresh = {
      ...nextActionActor,
      displayName: 'Fresh parent Actor DEMO',
      activeCompany: {
        ...nextActionActor.activeCompany,
        missionResultReviewerAssignmentId: 'recovery-only-new-capture',
      },
    };
    let deny = false,
      recovering = false,
      finish: ((value: Response) => void) | undefined;
    const server = installNextActionPublication(fresh, async (path, init) => {
      if (path === nextActionPath && deny) {
        deny = false;
        recovering = true;
        return new Response(null, { status: 403 });
      }
      if (path === '/api/access/current-actor' && recovering) {
        if (
          recovery === 'workspace' &&
          new Headers(init?.headers).has('x-company-context-id')
        )
          return new Response(null, { status: 403 });
        recovering = false;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }
      return undefined;
    });
    const { panel, projects } = await openNextActionApp();
    deny = true;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Reload current next action' }),
    );
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    await publishNextActionActor();
    const before = server.counts();
    await act(async () => {
      finish?.(
        status === 403
          ? new Response(null, { status })
          : Response.json(nextActionActor),
      );
    });
    expect(screen.getByText('Fresh parent Actor DEMO')).toBeInTheDocument();
    expect(server.counts()).toEqual(before);
    expect(
      within(projects).getByRole('textbox', { name: 'Project title' }),
    ).toHaveValue('Independent parent Project draft DEMO');
  },
);
