import { render, screen, within } from './test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { taskCopy } from './project/task.copy';

const company = {
  id: 'company-1',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read'],
  taskPermissions: ['task.read'],
  taskPermissionAssignmentId: 'task-grant',
  taskPermissionSetVersion: 'v1',
  clientPermissions: ['client.read'],
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const project = {
  id: 'project-1',
  title: 'ISO preparation',
  clientDisplayName: 'Synthetic Client',
};
const assigned = {
  id: 'task-1',
  companyId: company.id,
  projectId: project.id,
  clientAccountId: 'client-1',
  title: 'Collect preparation notes',
  assignee: {
    workspaceMembershipId: actor.workspaceMembershipId,
    displayLabel: 'Ada Ionescu · 1',
  },
  dueDate: '2026-09-30',
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  createdBy: {
    internalUserId: actor.internalUserId,
    workspaceMembershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  },
  project,
};

function serve(current: ActorContext) {
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      paths.push(path);
      if (path === '/api/access/current-actor') return Response.json(current);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/assigned-tasks')
        return Response.json({ tasks: [assigned] });
      // The Company summary the home mounts for this reader.
      if (path === '/api/operational-home')
        return Response.json({
          companyId: current.activeCompany?.id,
          today: '2026-09-27',
          summaries: [{ kind: 'active_clients', count: 1 }],
        });
      return Response.json([]);
    }),
  );
  return paths;
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  // The Prisme overview renders the motion hero before a section is selected.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('offers My Tasks in both frames when the active Company satisfies the Task-read predicate', async () => {
  const paths = serve(actor);
  window.history.replaceState(null, '', '/?frame=prisme#my-tasks');
  const view = render(<App identity={deterministicBrowserIdentity()} />);
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  expect(
    await within(navigation).findByRole('link', {
      name: taskCopy.myTasks.title,
    }),
  ).toHaveAttribute('aria-current', 'page');
  const prisme = screen.getByRole('region', { name: taskCopy.myTasks.title });
  expect(
    await within(prisme).findByRole('heading', { name: assigned.title }),
  ).toBeInTheDocument();
  expect(within(prisme).getByText(project.clientDisplayName)).toBeVisible();
  expect(paths).toContain('/api/assigned-tasks');
  view.unmount();

  window.history.replaceState(null, '', '/?frame=classic');
  render(<App identity={deterministicBrowserIdentity()} />);
  const classic = await screen.findByRole('region', {
    name: taskCopy.myTasks.title,
  });
  expect(
    await within(classic).findByRole('heading', { name: assigned.title }),
  ).toBeInTheDocument();
});

it.each([
  [
    'Workspace Company and Client management without a Task Manager grant',
    {
      ...actor,
      workspacePermissions: ['company.manage', 'client.manage'],
      activeCompany: {
        ...company,
        taskPermissions: undefined,
        taskPermissionAssignmentId: undefined,
        taskPermissionSetVersion: undefined,
      },
    },
  ],
  [
    'an unsupported Task permission version',
    {
      ...actor,
      activeCompany: { ...company, taskPermissionSetVersion: undefined },
    },
  ],
  [
    'no project.read',
    { ...actor, activeCompany: { ...company, projectPermissions: [] } },
  ],
  [
    'no Client read',
    { ...actor, activeCompany: { ...company, clientPermissions: [] } },
  ],
  ['no active Company', { ...actor, activeCompany: undefined }],
] satisfies Array<[string, ActorContext]>)(
  'neither offers nor reads My Tasks with %s',
  async (_case, current) => {
    const paths = serve(current);
    window.history.replaceState(null, '', '/?frame=prisme');
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(
      await screen.findByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByRole('link', { name: taskCopy.myTasks.title }),
    ).toHaveLength(0);
    await new Promise((settle) => setTimeout(settle, 0));
    expect(paths).not.toContain('/api/assigned-tasks');
  },
);
