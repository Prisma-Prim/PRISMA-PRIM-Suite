import { render, screen, within } from './test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { readCurrentActor } from './access/current-actor';
import { taskCopy } from './project/task.copy';
import {
  companyGrants,
  withoutCompanyGrants,
} from './access/company-grants.test-fixture';

const company = {
  id: 'company-1',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read'],
  clientPermissions: ['client.read'],
  grants: companyGrants(
    {
      bundle: 'company_director_client_access',
      version: 'v1',
      assignmentId: 'client-grant',
    },
    {
      bundle: 'company_task_manager',
      version: 'v1',
      assignmentId: 'task-grant',
    },
    {
      bundle: 'company_project_access',
      version: 'v1',
      assignmentId: 'project-grant',
    },
  ),
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
  description: null,
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

it('offers My Tasks when the active Company satisfies the Task-read predicate', async () => {
  const paths = serve(actor);
  window.history.replaceState(null, '', '/#my-tasks');
  render(<App identity={deterministicBrowserIdentity()} />);
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
});

it.each([
  [
    'Workspace Company and Client management without a Task Manager grant',
    {
      ...actor,
      workspacePermissions: ['company.manage', 'client.manage'],
      activeCompany: {
        ...company,
        grants: withoutCompanyGrants(company.grants, 'company_task_manager'),
      },
    },
  ],
  [
    'no project.read',
    {
      ...actor,
      activeCompany: {
        ...company,
        projectPermissions: [],
        grants: withoutCompanyGrants(company.grants, 'company_project_access'),
      },
    },
  ],
  [
    'no Client read',
    {
      ...actor,
      activeCompany: {
        ...company,
        clientPermissions: [],
        grants: withoutCompanyGrants(
          company.grants,
          'company_director_client_access',
        ),
      },
    },
  ],
  ['no active Company', { ...actor, activeCompany: undefined }],
] satisfies Array<[string, ActorContext]>)(
  'neither offers nor reads My Tasks with %s',
  async (_case, current) => {
    const paths = serve(current);
    window.history.replaceState(null, '', '/');
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

// A Task Manager grant with an unsupported version or a blank assignment
// fails closed for the whole current Actor (#1332), so nothing offers My Tasks.
it.each([
  { field: 'permissionSetVersion', value: undefined },
  { field: 'permissionSetVersion', value: 'v2' },
  { field: 'assignmentId', value: undefined },
  { field: 'assignmentId', value: ' ' },
])(
  'refuses the whole current Actor when the Task Manager grant has $field $value',
  async ({ field, value }) => {
    const read = (current: unknown) =>
      readCurrentActor({
        api: { request: async () => ({ status: 'ok', value: current }) },
      });
    expect((await read(actor)).status).toBe('ok');
    expect(
      await read({
        ...actor,
        activeCompany: {
          ...company,
          grants: company.grants.map((grant) =>
            grant.bundle === 'company_task_manager'
              ? { ...grant, [field]: value }
              : grant,
          ),
        },
      }),
    ).toEqual({ status: 'error' });
  },
);
