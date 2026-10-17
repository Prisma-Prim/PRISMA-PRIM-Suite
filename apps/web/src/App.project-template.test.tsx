import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { changeValue } from './test/select-option';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project/project-lifecycle.test-fixtures';
import {
  copiedPlanFixture,
  templateFixture,
} from './project/project-template.test-fixtures';

const companyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const projectId = '30000000-0000-4000-8000-000000000001';
const company = {
  id: companyId,
  displayName: 'Company Demo',
  clientPermissions: [],
  projectPermissions: ['project.read', 'project.create'],
  taskPermissions: ['task.read', 'task.manage'],
  taskPermissionAssignmentId: 'task-grant',
  taskPermissionSetVersion: 'v1',
} satisfies NonNullable<ActorContext['activeCompany']>;
const ordinaryActor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage', 'company.manage'],
  activeCompany: company,
};
const templateActor: ActorContext = {
  ...ordinaryActor,
  activeCompany: {
    ...company,
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.instantiate',
    ],
    projectTemplatePermissionAssignmentId: 'template-grant',
    projectTemplatePermissionSetVersion: 'v1',
  },
};
const project = {
  id: projectId,
  companyId,
  clientAccountId: clientId,
  clientDisplayName: 'Independent Client',
  title: 'Independent preparation',
  status: 'preparatory',
  createdAt: '2026-10-16T12:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#projects');
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

it('preserves ordinary Project and Task work when a real App actor revalidation changes only dedicated Template authority', async () => {
  let currentActor = templateActor;
  let returnedUpdatedActor = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor') {
        if (currentActor === ordinaryActor) returnedUpdatedActor = true;
        return Response.json(currentActor);
      }
      if (path === '/api/companies' && init?.method === 'POST') {
        // A failed public operation revalidates the selected Company actor.
        // No administration mutation or Client-authority callback is involved.
        currentActor = ordinaryActor;
        return new Response(null, { status: 403 });
      }
      if (path === '/api/companies')
        return Response.json([
          { id: companyId, displayName: company.displayName },
        ]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({
          companyId,
          today: '2026-10-16',
          summaries: [
            { kind: 'active_clients', count: 1 },
            { kind: 'open_projects', count: 1 },
            { kind: 'overdue_tasks', count: 0 },
          ],
        });
      if (path === '/api/clients')
        return Response.json([
          { id: clientId, displayName: project.clientDisplayName },
        ]);
      if (path === '/api/projects') return Response.json([project]);
      if (path === `/api/projects/${projectId}`) return Response.json(project);
      if (path === '/api/project-templates')
        return Response.json({ templates: [templateFixture] });
      if (path === `/api/projects/${projectId}/template`)
        return Response.json({ template: copiedPlanFixture });
      if (path === `/api/projects/${projectId}/tasks`)
        return Response.json({ mutable: true, tasks: [] });
      if (path === `/api/projects/${projectId}/eligible-task-assignees`)
        return Response.json({ members: [] });
      if (path === '/api/assigned-tasks') return Response.json({ tasks: [] });
      if (isLifecycleRead(path)) return Response.json(preparatoryLifecycle);
      return new Response(null, { status: 404 });
    }),
  );
  render(<App identity={deterministicBrowserIdentity()} />);
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const opened = await within(projects).findByRole('article', {
    name: project.title,
  });
  await within(opened).findByRole('region', {
    name: 'Plan copied from template',
  });
  const tasks = within(projects).getByRole('region', {
    name: 'Tasks',
  });
  const taskTitle = await within(tasks).findByRole('textbox', {
    name: 'Task title',
  });
  changeValue(taskTitle, 'Preserve this independent Task draft');
  changeValue(
    within(projects).getByRole('textbox', {
      name: 'Project title',
    }),
    'Preserve this manual Project draft',
  );
  changeValue(
    within(projects).getByRole('combobox', { name: 'Client' }),
    clientId,
  );

  const navigation = screen.getByRole('navigation', {
    name: 'Primary navigation',
  });
  fireEvent.click(within(navigation).getByRole('link', { name: 'Companies' }));
  const registration = await screen.findByRole('region', {
    name: 'Provider Company',
  });
  changeValue(
    within(registration).getByRole('textbox', { name: 'Company display name' }),
    'Attempted Company',
  );
  fireEvent.click(
    within(registration).getByRole('button', { name: 'Register Company' }),
  );
  await within(registration).findByText(
    'You do not have permission to register or view Companies in this Workspace.',
  );
  await waitFor(() => expect(returnedUpdatedActor).toBe(true));

  fireEvent.click(within(navigation).getByRole('link', { name: 'Projects' }));
  const retainedProjects = screen.getByRole('region', { name: 'Projects' });
  expect(
    within(retainedProjects).getByRole('article', { name: project.title }),
  ).toBe(opened);
  expect(taskTitle).toBeInTheDocument();
  expect(taskTitle).toHaveValue('Preserve this independent Task draft');
  expect(
    within(retainedProjects).getByRole('textbox', {
      name: 'Project title',
    }),
  ).toHaveValue('Preserve this manual Project draft');
  expect(
    within(retainedProjects).getByRole('combobox', {
      name: 'Client',
    }),
  ).toHaveTextContent(project.clientDisplayName);
  expect(
    within(retainedProjects).queryByRole('combobox', {
      name: 'Project template',
    }),
  ).not.toBeInTheDocument();
  expect(
    within(retainedProjects).queryByRole('region', {
      name: 'Plan copied from template',
    }),
  ).not.toBeInTheDocument();
});
