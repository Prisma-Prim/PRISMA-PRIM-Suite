import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
afterEach(() => {
  document.documentElement.lang = '';
  vi.unstubAllGlobals();
});
const applicationDateTime = (value: string) =>
  new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const loadOrSaveError =
  'The Project could not be loaded or saved. Please try again.';
const validProject = {
  id: 'project',
  title: 'ISO preparation',
  status: 'preparatory',
  companyId: 'company',
  clientAccountId: 'client',
  clientDisplayName: 'Synthetic Client',
  createdAt: '2026-09-19T08:00:00.000Z',
};

it('reports the existing load error when a listed Project carries a malformed registration time', async () => {
  document.documentElement.lang = 'en';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url === '/api/clients'
          ? [{ id: 'client', displayName: 'Synthetic Client' }]
          : [{ ...validProject, createdAt: 'not-a-timestamp' }],
      ),
    ),
  );

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );

  expect(await screen.findByText(loadOrSaveError)).toBeInTheDocument();
  expect(screen.queryByText(/Registered:/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      'Project access and Client read access are required for this Company.',
    ),
  ).not.toBeInTheDocument();
});

it('keeps the loaded Projects and reports the existing error when a reopened Project carries a malformed registration time', async () => {
  document.documentElement.lang = 'en';
  let malformed = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (url === '/api/projects/project')
        return Response.json(
          malformed
            ? { ...validProject, createdAt: '2026-13-45T99:00:00.000Z' }
            : validProject,
        );
      return Response.json([validProject]);
    }),
  );

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const row = await screen.findByRole('button', {
    name: 'ISO preparation Client: Synthetic Client',
  });
  fireEvent.click(row);

  expect(await screen.findByText(loadOrSaveError)).toBeInTheDocument();
  expect(
    screen.queryByRole('article', { name: validProject.title }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', {
      name: 'ISO preparation Client: Synthetic Client',
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByText(
      'Project access and Client read access are required for this Company.',
    ),
  ).not.toBeInTheDocument();

  malformed = false;
  fireEvent.click(
    screen.getByRole('button', {
      name: 'ISO preparation Client: Synthetic Client',
    }),
  );
  const detail = await screen.findByRole('article', {
    name: validProject.title,
  });
  expect(detail).toHaveTextContent(
    `Registered: ${applicationDateTime(validProject.createdAt)}`,
  );
});

it('keeps the create draft and the request key when the created Project carries a malformed registration time', async () => {
  document.documentElement.lang = 'en';
  const keys: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const key = new Headers(options.headers).get('idempotency-key');
        if (key) keys.push(key);
        return Response.json(
          keys.length === 1 ? { ...validProject, createdAt: '' } : validProject,
          { status: 201 },
        );
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
  fireEvent.change(await screen.findByLabelText('Project title'), {
    target: { value: validProject.title },
  });
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));

  expect(await screen.findByText(loadOrSaveError)).toBeInTheDocument();
  expect(screen.getByLabelText('Project title')).toHaveValue(
    validProject.title,
  );
  expect(screen.getByLabelText('Client')).toHaveValue('client');
  expect(screen.queryByText(/Registered:/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  const detail = await screen.findByRole('article', {
    name: validProject.title,
  });
  expect(detail).toHaveTextContent(
    `Registered: ${applicationDateTime(validProject.createdAt)}`,
  );
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

it('shows the persisted registration time of each loaded Project row and of the reopened detail', async () => {
  document.documentElement.lang = 'en';
  const listedProject = {
    id: 'project',
    title: 'ISO preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Synthetic Client',
    createdAt: '2026-09-19T08:00:00.000Z',
  };
  const reopenedProject = {
    ...listedProject,
    createdAt: '2026-09-20T15:45:00.000Z',
  };
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url === '/api/clients'
        ? [{ id: 'client', displayName: 'Synthetic Client' }]
        : url === '/api/projects/project'
          ? reopenedProject
          : [listedProject],
    ),
  );
  vi.stubGlobal('fetch', fetch);

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );

  const row = within(
    await screen.findByRole('list', { name: 'Projects' }),
  ).getByRole('listitem');
  expect(row).toHaveTextContent(
    `Registered: ${applicationDateTime(listedProject.createdAt)}`,
  );
  expect(row).not.toHaveTextContent(listedProject.createdAt);
  expect(row.querySelector('time')).toHaveAttribute(
    'datetime',
    listedProject.createdAt,
  );
  expect(within(row).getByRole('button').textContent).toBe(
    'ISO preparation Client: Synthetic Client',
  );
  const readsAfterLoad = fetch.mock.calls.length;

  fireEvent.click(
    within(row).getByRole('button', {
      name: 'ISO preparation Client: Synthetic Client',
    }),
  );

  const detail = await screen.findByRole('article', {
    name: listedProject.title,
  });
  expect(detail).toHaveTextContent(
    `Registered: ${applicationDateTime(reopenedProject.createdAt)}`,
  );
  expect(detail.querySelector('time')).toHaveAttribute(
    'datetime',
    reopenedProject.createdAt,
  );
  expect(fetch).toHaveBeenCalledTimes(readsAfterLoad + 1);
});

it('filters loaded Projects by visible title or Client without requesting again or changing server order', async () => {
  const projects = [
    {
      id: 'project-first',
      title: 'ISO preparation',
      status: 'preparatory',
      companyId: 'company',
      clientAccountId: 'client-first',
      clientDisplayName: 'Alpha Advisory',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
    {
      id: 'project-second',
      title: 'ISO preparation',
      status: 'preparatory',
      companyId: 'company',
      clientAccountId: 'client-second',
      clientDisplayName: 'Beta Certification',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  ];
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url === '/api/clients'
        ? [
            { id: 'client-first', displayName: 'Alpha Advisory' },
            { id: 'client-second', displayName: 'Beta Certification' },
          ]
        : projects,
    ),
  );
  vi.stubGlobal('fetch', fetch);

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );

  const projectList = await screen.findByRole('list', { name: 'Projects' });
  expect(
    within(projectList)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'ISO preparation Client: Alpha Advisory',
    'ISO preparation Client: Beta Certification',
  ]);
  expect(within(projectList).getByText(/Alpha Advisory/)).toBeInTheDocument();
  expect(
    within(projectList).getByText(/Beta Certification/),
  ).toBeInTheDocument();
  const readsAfterLoad = fetch.mock.calls.length;

  fireEvent.change(screen.getByRole('searchbox', { name: 'Find Projects' }), {
    target: { value: 'bEtA' },
  });
  expect(
    within(projectList).getByRole('button', {
      name: 'ISO preparation Client: Beta Certification',
    }),
  ).toBeInTheDocument();
  expect(within(projectList).getAllByRole('button')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledTimes(readsAfterLoad);

  fireEvent.change(screen.getByRole('searchbox', { name: 'Find Projects' }), {
    target: { value: 'missing' },
  });
  expect(
    screen.getByText('No Project matches this search.'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('No preparatory Projects for this Company yet.'),
  ).not.toBeInTheDocument();
});

it('uses an authorized dossier identity for navigation and an exact loaded filter', async () => {
  const openDossier = vi.fn();
  const projects = [
    {
      id: 'historical-project',
      title: 'Historical preparation',
      status: 'preparatory',
      companyId: 'company',
      clientAccountId: 'historical-client',
      clientDossierId: 'canonical-client',
      clientDisplayName: 'Canonical Client',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
    {
      id: 'other-project',
      title: 'Other preparation',
      status: 'preparatory',
      companyId: 'company',
      clientAccountId: 'other-client',
      clientDossierId: 'other-client',
      clientDisplayName: 'Canonical Client',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients') return Response.json([]);
      if (url === '/api/projects/historical-project')
        return Response.json(projects[0]);
      return Response.json(projects);
    }),
  );

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
      clientFilter={{
        clientDossierId: 'canonical-client',
        displayName: 'Canonical Client',
      }}
      onOpenClientDossier={openDossier}
    />,
  );

  expect(
    await screen.findByRole('button', {
      name: 'Historical preparation Client: Canonical Client',
    }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', {
      name: 'Other preparation Client: Canonical Client',
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Historical preparation Client: Canonical Client',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Client dossier' }),
  );
  expect(openDossier).toHaveBeenCalledWith('canonical-client');

  fireEvent.click(screen.getByRole('button', { name: 'Reload Projects' }));
  await waitFor(() =>
    expect(
      screen.getByRole('searchbox', { name: 'Find Projects' }),
    ).toHaveValue(''),
  );
  expect(
    within(screen.getByRole('list', { name: 'Projects' })).getAllByRole(
      'button',
    ),
  ).toHaveLength(2);
});

it('does not expose Project-to-dossier navigation without a derived authorized dossier', async () => {
  const project = {
    id: 'project',
    title: 'Preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'historical-client',
    clientDisplayName: 'Visible Client',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url === '/api/clients'
          ? []
          : url.endsWith('/project')
            ? project
            : [project],
      ),
    ),
  );
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
      onOpenClientDossier={vi.fn()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Preparation Client: Visible Client',
    }),
  );
  await screen.findByRole('heading', { name: 'Preparation' });
  expect(
    screen.queryByRole('button', { name: 'Open Client dossier' }),
  ).not.toBeInTheDocument();
});

it('keeps an opened detail while filtering and reflects its authoritative reopen response', async () => {
  const listedProject = {
    id: 'project',
    title: 'ISO preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: 'client',
    clientDisplayName: 'Alpha Advisory',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  const reopenedProject = {
    ...listedProject,
    title: 'Food safety preparation',
    clientDisplayName: 'Beta Certification',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients')
        return Response.json([{ id: 'client', displayName: 'Alpha Advisory' }]);
      return Response.json(
        url === '/api/projects/project' ? reopenedProject : [listedProject],
      );
    }),
  );

  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.change(
    await screen.findByRole('searchbox', { name: 'Find Projects' }),
    { target: { value: 'ISO' } },
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: `${listedProject.title} Client: ${listedProject.clientDisplayName}`,
    }),
  );

  expect(
    await screen.findByRole('heading', { name: reopenedProject.title }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('No Project matches this search.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find Projects' }), {
    target: { value: 'nothing' },
  });
  expect(
    screen.getByRole('heading', { name: reopenedProject.title }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find Projects' }), {
    target: { value: 'beta' },
  });
  expect(
    screen.getByRole('button', {
      name: `${reopenedProject.title} Client: ${reopenedProject.clientDisplayName}`,
    }),
  ).toBeInTheDocument();
});

it('resets the local Project filter when the active Company changes', async () => {
  let activeCompanyId: 'company' | 'company-two' = 'company';
  const projectsByCompany = {
    company: {
      id: 'project-one',
      title: 'First Company Project',
      status: 'preparatory',
      companyId: 'company',
      clientAccountId: 'client-one',
      clientDisplayName: 'Alpha Advisory',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
    'company-two': {
      id: 'project-two',
      title: 'Second Company Project',
      status: 'preparatory',
      companyId: 'company-two',
      clientAccountId: 'client-two',
      clientDisplayName: 'Beta Certification',
      createdAt: '2026-09-19T00:00:00.000Z',
    },
  } satisfies Record<string, object>;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url === '/api/clients'
          ? [{ id: 'client', displayName: 'Synthetic Client' }]
          : [projectsByCompany[activeCompanyId]],
      ),
    ),
  );
  const identity = deterministicBrowserIdentity();
  const view = render(<ProjectWorkspace actor={actor} identity={identity} />);
  const search = await screen.findByRole('searchbox', {
    name: 'Find Projects',
  });
  fireEvent.change(search, { target: { value: 'first' } });
  expect(search).toHaveValue('first');

  activeCompanyId = 'company-two';
  view.rerender(
    <ProjectWorkspace
      actor={{
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company-two',
          displayName: 'BIC',
        },
      }}
      identity={identity}
    />,
  );

  expect(
    await screen.findByRole('button', {
      name: 'Second Company Project Client: Beta Certification',
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'Find Projects' })).toHaveValue(
    '',
  );
});

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
    await screen.findByRole('button', {
      name: 'ISO preparation Client: Synthetic Client',
    }),
  );
  expect(
    await screen.findByRole('heading', { name: 'ISO preparation' }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole('article', { name: 'ISO preparation' })).getByText(
      'Client: Synthetic Client',
    ),
  ).toBeInTheDocument();
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
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
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
          : [
              {
                ...project,
                id: 'existing-project',
                title: 'Existing preparation',
              },
            ],
      );
    }),
  );
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const search = await screen.findByRole('searchbox', {
    name: 'Find Projects',
  });
  fireEvent.change(screen.getByLabelText('Project title'), {
    target: { value: project.title },
  });
  fireEvent.change(screen.getByLabelText('Client'), {
    target: { value: 'client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByRole('alert');
  fireEvent.change(search, { target: { value: 'retry' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  await screen.findByRole('heading', { name: project.title });
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

it('presents the existing preparatory Project detail in Prisme without changing its public controls', async () => {
  document.documentElement.lang = 'en';
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
    within(workspace).getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const detail = await within(workspace).findByRole('article', {
    name: project.title,
  });
  expect(detail).toHaveClass('project-detail-card');
  expect(detail).toHaveTextContent(
    `Registered: ${applicationDateTime(project.createdAt)}`,
  );
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
