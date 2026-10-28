import {
  fireEvent,
  render,
  screen,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import type { TaskView } from './project/task-response';

const company = {
  id: 'company-unassigned',
  displayName: 'PRISMA-PRIM',
  projectPermissions: ['project.read'],
  taskPermissions: ['task.read'],
  taskPermissionAssignmentId: 'task-reader-grant',
  taskPermissionSetVersion: 'v1',
  clientPermissions: ['client.read'],
} satisfies ActorContext['activeCompany'];
const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'reader-membership',
  workspaceId: 'workspace',
  workspaceName: 'Preparation Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
};
const client = { id: 'client-original', displayName: 'Original Client' };
const project = {
  id: 'project-preparation',
  companyId: company.id,
  clientAccountId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: 'Company preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const secondProject = {
  ...project,
  id: 'project-undated',
  title: 'Undated Company preparation',
};
function task(
  owner: typeof project,
  id: string,
  title: string,
  dueDate: string | null,
): TaskView {
  return {
    description: null,
    id,
    companyId: company.id,
    projectId: owner.id,
    clientAccountId: client.id,
    title,
    assignee: null,
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: {
      internalUserId: actor.internalUserId,
      workspaceMembershipId: actor.workspaceMembershipId,
      displayName: actor.displayName,
    },
  };
}
const future = task(
  project,
  'task-future',
  'Prepare next year questionnaire',
  '2099-01-01',
);
const undated = task(
  secondProject,
  'task-undated',
  'Collect undated preparation notes',
  null,
);
const assigned = {
  ...task(project, 'task-assigned', 'My assigned preparation', null),
  assignee: {
    workspaceMembershipId: actor.workspaceMembershipId,
    displayLabel: actor.displayName,
  },
};
const projection = {
  id: project.id,
  title: project.title,
  clientDisplayName: project.clientDisplayName,
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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

it('discovers future and undated unassigned Tasks through the real Company navigation while My Tasks stays personal', async () => {
  const requests: string[] = [];
  const unexpectedRequests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const route = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
      requests.push(route);
      if (url.pathname === '/api/access/current-actor')
        return Response.json(actor);
      if (url.pathname === '/api/companies') return Response.json([company]);
      if (url.pathname === '/api/operational-home')
        return Response.json({
          companyId: company.id,
          today: '2026-10-21',
          summaries: [
            { kind: 'active_clients', count: 1 },
            { kind: 'open_projects', count: 2 },
            { kind: 'overdue_tasks', count: 0 },
          ],
          attention: { total: 0, tasks: [] },
        });
      if (url.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      if (url.pathname === '/api/clients')
        return Response.json([{ ...client, relatedToActiveCompany: true }]);
      if (url.pathname === '/api/projects')
        return Response.json([project, secondProject]);
      if (url.pathname === '/api/assigned-tasks')
        return Response.json({ tasks: [{ ...assigned, project: projection }] });
      if (url.pathname === '/api/unassigned-tasks')
        return Response.json({
          companyId: company.id,
          offset: 0,
          pageSize: 25,
          hasNextPage: false,
          tasks: [future, undated].map((row) => ({
            ...row,
            project:
              row.projectId === project.id
                ? projection
                : {
                    id: secondProject.id,
                    title: secondProject.title,
                    clientDisplayName: secondProject.clientDisplayName,
                  },
          })),
        });
      unexpectedRequests.push(route);
      throw new Error(`Unexpected HTTP boundary request: ${route}`);
    }),
  );
  window.history.replaceState(null, '', '/?frame=prisme#projects');
  render(<App identity={deterministicBrowserIdentity()} />);

  // Establish live actor, active Company, readable Projects and real navigation
  // before asserting the new capability. Failure here is fixture/readiness failure.
  const navigation = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  const projects = await screen.findByRole('region', { name: 'Projects' });
  expect(
    await within(projects).findByRole('button', {
      name: `${project.title} Client: ${client.displayName}`,
    }),
  ).toBeVisible();
  expect(
    within(projects).getByRole('button', {
      name: `${secondProject.title} Client: ${client.displayName}`,
    }),
  ).toBeVisible();
  expect(screen.getByLabelText('Active Company', { exact: true })).toHaveValue(
    company.id,
  );
  expect(requests).toContain('GET /api/access/current-actor');
  expect(requests).toContain('GET /api/projects');
  fireEvent.click(within(navigation).getByRole('link', { name: 'My Tasks' }));
  const personal = await screen.findByRole('region', { name: 'My Tasks' });
  expect(
    await within(personal).findByRole('heading', { name: assigned.title }),
  ).toBeVisible();
  expect(within(personal).queryByText(future.title)).not.toBeInTheDocument();
  expect(within(personal).queryByText(undated.title)).not.toBeInTheDocument();

  expect(unexpectedRequests).toEqual([]);

  // First RED must stop here: the existing App has no accessible discovery entry.
  fireEvent.click(
    within(navigation).getByRole('link', { name: 'Unassigned Tasks' }),
  );
  const queue = await screen.findByRole('region', { name: 'Unassigned Tasks' });
  expect(
    await within(queue).findByRole('heading', { name: future.title }),
  ).toBeVisible();
  expect(
    within(queue).getByRole('heading', { name: undated.title }),
  ).toBeVisible();
  expect(within(queue).getByText('No due date')).toBeVisible();
  expect(within(queue).queryByText(assigned.title)).not.toBeInTheDocument();
  expect(
    requests.some((route) => route.includes('eligible-task-assignees')),
  ).toBe(false);
  expect(requests.filter((route) => !route.startsWith('GET '))).toEqual([]);
});
