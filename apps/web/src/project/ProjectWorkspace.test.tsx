import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ProjectWorkspace } from './ProjectWorkspace';
const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read', 'project.create'],
  },
};
afterEach(() => vi.unstubAllGlobals());
it('creates, reloads and reopens a preparatory Project in the selected Company', async () => {
  const project = {
    id: 'project',
    title: 'ISO preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Synthetic Client',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  let created = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (options?.method === 'POST') {
        created = true;
        return Response.json(project, { status: 201 });
      }
      if (url === '/api/projects/project') return Response.json(project);
      return Response.json(created ? [project] : []);
    }),
  );
  const props = { actor, identity: deterministicBrowserIdentity() };
  const view = render(<ProjectWorkspace {...props} />);
  expect(
    await screen.findByText('No preparatory Projects for this Company yet.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Project title'), {
    target: { value: 'ISO preparation' },
  });
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  expect(
    await screen.findByRole('heading', { name: 'ISO preparation' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeInTheDocument();
  const projectDetail = screen.getByRole('article', {
    name: 'ISO preparation',
  });
  expect(projectDetail.firstElementChild).toBe(
    screen.getByRole('heading', { name: 'ISO preparation' }),
  );
  view.unmount();
  render(<ProjectWorkspace {...props} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'ISO preparation' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'ISO preparation' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Client: Synthetic Client')).toBeInTheDocument();
});

it('clears a previously opened Project when the server revokes access', async () => {
  const project = {
    id: 'project',
    title: 'Confidential preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Synthetic Client',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  let denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (denied) return new Response(null, { status: 403 });
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      return Response.json(
        url === '/api/projects/project' ? project : [project],
      );
    }),
  );
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: project.title }));
  expect(
    await screen.findByRole('heading', { name: project.title }),
  ).toBeInTheDocument();
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Reload Projects' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Project access and Client read access are required for this Company.',
  );
  expect(
    screen.queryByRole('heading', { name: project.title }),
  ).not.toBeInTheDocument();
});

it('reuses a stable request key after an uncertain create result', async () => {
  const keys: string[] = [];
  const project = {
    id: 'project',
    title: 'Retry preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Synthetic Client',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const key = new Headers(options.headers).get('idempotency-key');
        if (key) keys.push(key);
        return keys.length === 1
          ? new Response(null, { status: 500 })
          : Response.json(project, { status: 201 });
      }
      return Response.json(
        url === '/api/clients'
          ? [{ id: 'client', displayName: 'Synthetic Client' }]
          : [],
      );
    }),
  );
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  await screen.findByText('No preparatory Projects for this Company yet.');
  fireEvent.change(screen.getByLabelText('Project title'), {
    target: { value: project.title },
  });
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByRole('heading', { name: project.title });
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

it('presents the existing preparatory Project detail in Prisme without changing its public controls', async () => {
  const project = {
    id: 'project',
    title: 'ISO preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Synthetic Client',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (url === '/api/projects') return Response.json([project]);
      if (url === '/api/projects/project') return Response.json(project);
      return new Response(null, { status: 403 });
    }),
  );
  render(
    <ApplicationPresentation value="prisme">
      <ProjectWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />
    </ApplicationPresentation>,
  );
  const workspace = await screen.findByRole('region', { name: 'Projects' });
  expect(workspace).toHaveClass('project-workspace--prisme');
  fireEvent.click(
    within(workspace).getByRole('button', { name: project.title }),
  );
  expect(
    await within(workspace).findByRole('article', { name: project.title }),
  ).toHaveClass('project-detail-card');
  const tasksPanel = await within(workspace).findByRole('tabpanel', {
    name: 'Tasks',
  });
  const documentsPanel = workspace.querySelector<HTMLElement>(
    '#project-documents-panel',
  );
  expect(documentsPanel).not.toBeNull();
  if (!documentsPanel) throw new Error('Working Documents panel is missing.');
  expect(within(tasksPanel).getByRole('region', { name: 'Tasks' })).toHaveClass(
    'project-tasks--prisme',
  );
  expect(tasksPanel).toBeVisible();
  expect(documentsPanel).not.toBeVisible();

  fireEvent.click(
    within(workspace).getByRole('tab', { name: 'Working Documents' }),
  );
  expect(tasksPanel).not.toBeVisible();
  expect(documentsPanel).toBeVisible();
  expect(tasksPanel).toBeInTheDocument();
  expect(documentsPanel).toBeInTheDocument();
});
