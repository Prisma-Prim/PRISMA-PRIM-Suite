import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ProjectWorkspace } from './ProjectWorkspace';
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project-lifecycle.test-fixtures';
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
/** Serves each opened Project's lifecycle section before the test's own stub. */
function stubFetch(
  name: 'fetch',
  serve: (url: string, init?: RequestInit) => Promise<Response>,
) {
  vi.stubGlobal(name, (url: string, init?: RequestInit) =>
    isLifecycleRead(url)
      ? Promise.resolve(Response.json(preparatoryLifecycle))
      : serve(url, init),
  );
}
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

it('reports the existing load error when a listed Project carries a non-instant registration time', async () => {
  document.documentElement.lang = 'en';
  stubFetch(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url === '/api/clients'
          ? [{ id: 'client', displayName: 'Synthetic Client' }]
          : [{ ...validProject, createdAt: '0' }],
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

it('keeps the loaded Projects and reports the existing error when a reopened Project carries an impossible registration time', async () => {
  document.documentElement.lang = 'en';
  let malformed = true;
  stubFetch(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (url === '/api/projects/project')
        return Response.json(
          malformed
            ? { ...validProject, createdAt: '2026-02-30T08:00:00.000Z' }
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

it('keeps the create draft and the request key when the created Project carries a non-instant registration time', async () => {
  document.documentElement.lang = 'en';
  const keys: string[] = [];
  stubFetch(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const key = new Headers(options.headers).get('idempotency-key');
        if (key) keys.push(key);
        return Response.json(
          keys.length === 1
            ? { ...validProject, createdAt: '2026' }
            : validProject,
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
  stubFetch('fetch', fetch);

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
  // The responsible member and lifecycle sections read their own sub-resources.
  expect(
    fetch.mock.calls
      .slice(readsAfterLoad)
      .filter(([url]) => !url.endsWith('/responsible')),
  ).toEqual([['/api/projects/project', expect.anything()]]);
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
  stubFetch('fetch', fetch);

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
    screen.queryByText('No Projects for this Company yet.'),
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
  stubFetch(
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
  stubFetch(
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
  stubFetch(
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
  stubFetch(
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
  stubFetch(
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
    await screen.findByText('No Projects for this Company yet.'),
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
  const projectDetail = screen.getByRole('article', {
    name: 'ISO preparation',
  });
  // The notice stays beside the registration form and on the preparatory Project.
  expect(
    screen.getAllByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toHaveLength(2);
  expect(
    within(projectDetail).getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeInTheDocument();
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
  stubFetch(
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
  stubFetch(
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
  stubFetch(
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
it('passes Open Document unchanged to the opened Project’s linked Documents', async () => {
  const linked = {
    id: 'document-linked',
    companyId: 'company',
    clientId: 'client',
    clientDisplayName: 'Synthetic Client',
    title: 'Linked questionnaire',
    purpose: 'Prepare the linked interview',
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: '2026-09-19T00:00:00.000Z',
    workingRevision: 1,
    correction: 'allowed',
    version: {
      id: 'version',
      status: 'draft',
      representation: {
        id: 'representation',
        kind: 'external-reference',
        verification: 'unverified',
        access: 'denied',
      },
    },
  };
  stubFetch(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (url === '/api/projects') return Response.json([validProject]);
      if (url === '/api/projects/project') return Response.json(validProject);
      if (url === '/api/projects/project/documents')
        return Response.json({
          mutable: true,
          documents: [{ document: linked, revision: 1 }],
        });
      return new Response(null, { status: 403 });
    }),
  );
  const onOpenDocument = vi.fn();
  render(
    <ProjectWorkspace
      actor={{
        ...actor,
        activeCompany: {
          id: 'company',
          displayName: 'PRISMA-PRIM',
          projectPermissions: ['project.read'],
          documentPermissions: ['document.read'],
        },
      }}
      identity={deterministicBrowserIdentity()}
      onOpenDocument={onOpenDocument}
    />,
  );
  const workspace = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(workspace).findByRole('button', {
      name: `${validProject.title} Client: ${validProject.clientDisplayName}`,
    }),
  );
  const documents = await within(workspace).findByRole('region', {
    name: 'Working Documents',
  });
  await within(documents).findByRole('heading', { name: linked.title });

  fireEvent.click(
    within(documents).getByRole('button', { name: 'Open Document' }),
  );
  expect(onOpenDocument).toHaveBeenCalledExactlyOnceWith(linked.id);
});

describe('Client identity changes', () => {
  const supersededClient = {
    id: 'superseded-client',
    displayName: 'Superseded Client',
  };
  const canonicalClient = {
    id: 'canonical-client',
    displayName: 'Canonical Client',
  };
  const historicalProject = {
    id: 'historical-project',
    title: 'Historical preparation',
    status: 'preparatory',
    companyId: 'company',
    clientAccountId: supersededClient.id,
    clientDisplayName: supersededClient.displayName,
    createdAt: '2026-09-19T08:00:00.000Z',
  };
  const registeredProject = {
    ...historicalProject,
    id: 'registered-project',
    title: 'Registered preparation',
    createdAt: '2026-09-20T08:00:00.000Z',
  };
  const historicalRow = `${historicalProject.title} Client: ${historicalProject.clientDisplayName}`;
  const registeredRow = `${registeredProject.title} Client: ${registeredProject.clientDisplayName}`;
  const detailPath = `/api/projects/${historicalProject.id}`;
  const taskPath = `/api/projects/${historicalProject.id}/tasks`;
  const createdTask = {
    id: 'task',
    companyId: 'company',
    projectId: historicalProject.id,
    clientAccountId: supersededClient.id,
    title: 'Keep this Task draft',
    assignee: null,
    dueDate: null,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-20T09:00:00.000Z',
    updatedAt: '2026-09-20T09:00:00.000Z',
    createdBy: {
      internalUserId: 'owner',
      workspaceMembershipId: 'member',
      displayName: 'Owner',
    },
  };
  const taskActor: ActorContext = {
    ...actor,
    activeCompany: {
      id: 'company',
      displayName: 'PRISMA-PRIM',
      projectPermissions: ['project.read', 'project.create'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
  type ClientFilter = { clientDossierId: string; displayName: string };
  const canonicalFilter: ClientFilter = {
    clientDossierId: canonicalClient.id,
    displayName: canonicalClient.displayName,
  };
  type ServerRequest = {
    route: string;
    key: string | null;
    body: string | undefined;
    signal: AbortSignal | undefined;
  };

  /**
   * One Company's Project server. A union moves only the derived dossier
   * identity of the superseded Client's Projects; `clientAccountId` stays the
   * historical relationship. A held route waits for an explicit release. A
   * command is processed when it is received; a held read answers from the
   * server state at its release unless a response is given.
   */
  function identityServer() {
    let united = false;
    let taskCreated = false;
    const registered: Array<typeof registeredProject> = [];
    const holding = new Set<string>();
    const requests: ServerRequest[] = [];
    const held: Array<
      ServerRequest & { answer: (response?: Response) => void }
    > = [];
    const projected = (project: typeof historicalProject) => ({
      ...project,
      clientDossierId:
        united && project.clientAccountId === supersededClient.id
          ? canonicalClient.id
          : project.clientAccountId,
    });
    function answer({ route }: ServerRequest): Response {
      if (route === 'POST /api/projects') {
        registered.push(registeredProject);
        return Response.json(projected(registeredProject), { status: 201 });
      }
      if (route === `POST ${taskPath}`) {
        taskCreated = true;
        return Response.json(createdTask, { status: 201 });
      }
      if (route === 'GET /api/clients')
        return Response.json(
          united ? [canonicalClient] : [supersededClient, canonicalClient],
        );
      if (route === 'GET /api/projects')
        return Response.json([historicalProject, ...registered].map(projected));
      const opened = [historicalProject, ...registered].find(
        (project) => route === `GET /api/projects/${project.id}`,
      );
      if (opened) return Response.json(projected(opened));
      if (route === `GET ${taskPath}`)
        return Response.json({
          mutable: true,
          tasks: taskCreated ? [createdTask] : [],
        });
      if (route === `GET /api/tasks/${createdTask.id}`)
        return Response.json({ mutable: true, task: createdTask });
      if (route === `GET /api/tasks/${createdTask.id}/history`)
        return Response.json({ events: [] });
      if (route.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      return new Response(null, { status: 404 });
    }
    function heldRequest(route: string) {
      const found = held.find((candidate) => candidate.route === route);
      if (!found) throw new Error(`Nothing is held for ${route}`);
      return found;
    }
    stubFetch(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const request: ServerRequest = {
          route: `${init?.method ?? 'GET'} ${url}`,
          key: new Headers(init?.headers).get('idempotency-key'),
          body: typeof init?.body === 'string' ? init.body : undefined,
          signal: init?.signal ?? undefined,
        };
        requests.push(request);
        const processed = request.route.startsWith('GET ')
          ? undefined
          : answer(request);
        if (!holding.has(request.route)) return processed ?? answer(request);
        return new Promise<Response>((resolve) => {
          held.push({
            ...request,
            answer: (response) =>
              resolve(response ?? processed ?? answer(request)),
          });
        });
      }),
    );
    return {
      unite: () => {
        united = true;
      },
      reverse: () => {
        united = false;
      },
      hold: (route: string) => holding.add(route),
      serve: (route: string) => holding.delete(route),
      count: (route: string) =>
        requests.filter((request) => request.route === route).length,
      requests: (route: string) =>
        requests.filter((request) => request.route === route),
      /** Waits until a route is held, without answering it. */
      requested: (route: string) => waitFor(() => heldRequest(route)),
      /** Waits for the oldest held request of a route, then answers it. */
      async release(route: string, response?: Response) {
        const request = await waitFor(() => heldRequest(route));
        held.splice(held.indexOf(request), 1);
        await act(async () => {
          request.answer(response);
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        return request;
      },
    };
  }
  function renderWorkspace(options: { actor?: ActorContext } = {}) {
    const identity = deterministicBrowserIdentity();
    const openDossier = vi.fn();
    const workspace = (revision: number, clientFilter?: ClientFilter) => (
      <ProjectWorkspace
        actor={options.actor ?? actor}
        identity={identity}
        clientIdentityRevision={revision}
        clientFilter={clientFilter}
        onOpenClientDossier={openDossier}
      />
    );
    const view = render(workspace(0));
    return {
      openDossier,
      deliver: (revision: number, clientFilter?: ClientFilter) =>
        view.rerender(workspace(revision, clientFilter)),
    };
  }
  async function openHistoricalDetail() {
    fireEvent.click(await screen.findByRole('button', { name: historicalRow }));
    return screen.findByRole('article', { name: historicalProject.title });
  }
  const dossierAction = (detail: HTMLElement) =>
    within(detail).queryByRole('button', { name: 'Open Client dossier' });
  const listedRows = () =>
    within(screen.getByRole('list', { name: 'Projects' }))
      .queryAllByRole('button')
      .map((button) => button.textContent);

  it('lists a superseded Client’s historical Project under the canonical dossier and offers its dossier only after a current read', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    const detail = await openHistoricalDetail();
    expect(dossierAction(detail)).toBeInTheDocument();

    server.unite();
    server.hold('GET /api/projects');
    server.hold(`GET ${detailPath}`);
    workspace.deliver(1, canonicalFilter);

    // Not even the first commit after the change offers the superseded target
    // or compares the canonical dossier with rows resolved before it.
    expect(dossierAction(detail)).not.toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Find Projects' }),
    ).toHaveValue(canonicalClient.displayName);
    expect(
      screen.queryByText('No Project matches this search.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Loading Projects…')).toBeInTheDocument();

    await server.release('GET /api/projects');
    expect(listedRows()).toEqual([historicalRow]);
    expect(dossierAction(detail)).not.toBeInTheDocument();

    await server.release(`GET ${detailPath}`);
    fireEvent.click(
      await within(detail).findByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(workspace.openDossier).toHaveBeenLastCalledWith(canonicalClient.id);
    expect(server.count('GET /api/projects')).toBe(2);
    expect(server.count('GET /api/clients')).toBe(2);
    expect(server.count(`GET ${detailPath}`)).toBe(2);
  });

  it('applies a dossier restriction without any read while the Client identity is unchanged', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    const detail = await openHistoricalDetail();
    const reads = server.count('GET /api/projects');

    workspace.deliver(0, {
      clientDossierId: supersededClient.id,
      displayName: supersededClient.displayName,
    });

    expect(listedRows()).toEqual([historicalRow]);
    expect(dossierAction(detail)).toBeInTheDocument();
    await act(async () => await new Promise((resolve) => setTimeout(resolve)));
    expect(server.count('GET /api/projects')).toBe(reads);
    expect(server.count('GET /api/clients')).toBe(reads);
    expect(server.count(`GET ${detailPath}`)).toBe(1);
  });

  it('retires a dossier restriction applied before the change instead of remapping it', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: historicalRow });
    workspace.deliver(0, {
      clientDossierId: supersededClient.id,
      displayName: supersededClient.displayName,
    });
    expect(
      screen.getByRole('searchbox', { name: 'Find Projects' }),
    ).toHaveValue(supersededClient.displayName);

    server.unite();
    server.hold('GET /api/projects');
    workspace.deliver(1);

    const search = screen.getByRole('searchbox', { name: 'Find Projects' });
    expect(search).toHaveValue('');
    expect(listedRows()).toEqual([historicalRow]);
    await server.release('GET /api/projects');
    expect(search).toHaveValue('');
    expect(listedRows()).toEqual([historicalRow]);
  });

  it('supersedes a list read still in flight under the previous Client identity', async () => {
    const server = identityServer();
    server.hold('GET /api/projects');
    const workspace = renderWorkspace();
    const first = await server.requested('GET /api/projects');

    server.unite();
    workspace.deliver(1, canonicalFilter);
    await waitFor(() => expect(server.count('GET /api/projects')).toBe(2));
    expect(first.signal?.aborted).toBe(true);

    // The superseded read resolved the dossier before the union.
    await server.release(
      'GET /api/projects',
      Response.json([
        { ...historicalProject, clientDossierId: supersededClient.id },
      ]),
    );
    expect(screen.getByText('Loading Projects…')).toBeInTheDocument();
    await server.release('GET /api/projects');
    expect(listedRows()).toEqual([historicalRow]);
    expect(server.count('GET /api/projects')).toBe(2);
  });

  it('never lets a detail read started before the change replace the current row or offer its dossier', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    server.hold(`GET ${detailPath}`);
    fireEvent.click(await screen.findByRole('button', { name: historicalRow }));
    await server.requested(`GET ${detailPath}`);

    server.unite();
    workspace.deliver(1, canonicalFilter);
    await waitFor(() => expect(listedRows()).toEqual([historicalRow]));
    await server.release(
      `GET ${detailPath}`,
      Response.json({
        ...historicalProject,
        clientDossierId: supersededClient.id,
      }),
    );

    const detail = screen.getByRole('article', {
      name: historicalProject.title,
    });
    expect(dossierAction(detail)).not.toBeInTheDocument();
    expect(listedRows()).toEqual([historicalRow]);
    await server.release(`GET ${detailPath}`);
    fireEvent.click(
      await within(detail).findByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(workspace.openDossier).toHaveBeenLastCalledWith(canonicalClient.id);
    expect(server.count(`GET ${detailPath}`)).toBe(2);
  });

  it('keeps the loaded rows when the refresh fails and never presents an empty dossier match', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    const detail = await openHistoricalDetail();

    server.unite();
    server.hold('GET /api/projects');
    workspace.deliver(1, canonicalFilter);
    await server.release(
      'GET /api/projects',
      new Response(null, { status: 500 }),
    );

    expect(screen.getByText(loadOrSaveError)).toBeInTheDocument();
    expect(
      screen.queryByText('No Project matches this search.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Loading Projects…')).not.toBeInTheDocument();
    expect(listedRows()).toEqual([]);
    expect(detail).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find Projects' }), {
      target: { value: '' },
    });
    expect(listedRows()).toEqual([historicalRow]);
    expect(server.count('GET /api/projects')).toBe(2);
  });

  it('withholds the dossier action while the current detail read is pending and after it fails', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    const detail = await openHistoricalDetail();

    server.unite();
    server.hold(`GET ${detailPath}`);
    workspace.deliver(1, canonicalFilter);
    await waitFor(() => expect(listedRows()).toEqual([historicalRow]));
    expect(dossierAction(detail)).not.toBeInTheDocument();

    await server.release(
      `GET ${detailPath}`,
      new Response(null, { status: 500 }),
    );
    expect(screen.getByText(loadOrSaveError)).toBeInTheDocument();
    expect(detail).toBeInTheDocument();
    expect(dossierAction(detail)).not.toBeInTheDocument();
    await act(async () => await new Promise((resolve) => setTimeout(resolve)));
    expect(server.count(`GET ${detailPath}`)).toBe(2);
  });

  it.each([
    ['list', 'GET /api/projects'],
    ['detail', `GET ${detailPath}`],
  ])(
    'keeps the current denial reset when the %s read after the change is denied',
    async (_read, route) => {
      const server = identityServer();
      const workspace = renderWorkspace();
      await openHistoricalDetail();

      server.unite();
      server.hold(route);
      workspace.deliver(1, canonicalFilter);
      await server.release(route, new Response(null, { status: 403 }));

      expect(
        screen.getByText(
          'Project access and Client read access are required for this Company.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('article', { name: historicalProject.title }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Open Client dossier' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Projects' }),
      ).not.toBeInTheDocument();
    },
  );

  const deniedMessage =
    'Project access and Client read access are required for this Company.';
  const inFlightCommands = [
    {
      inFlight: 'an opened detail read',
      route: `GET ${detailPath}`,
      title: historicalProject.title,
      taskRoute: `GET ${taskPath}`,
      start: () =>
        fireEvent.click(screen.getByRole('button', { name: historicalRow })),
    },
    {
      inFlight: 'a registration',
      route: 'POST /api/projects',
      title: registeredProject.title,
      taskRoute: `GET /api/projects/${registeredProject.id}/tasks`,
      start: () => {
        fireEvent.change(screen.getByLabelText('Project title'), {
          target: { value: registeredProject.title },
        });
        fireEvent.change(screen.getByLabelText('Client'), {
          target: { value: supersededClient.id },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
      },
    },
  ];
  /**
   * Starts a detail read or registration that the server holds, then denies
   * the list refresh started by the next Client identity change.
   */
  async function denyRefreshWhile({
    route,
    start,
  }: (typeof inFlightCommands)[number]) {
    const server = identityServer();
    const workspace = renderWorkspace({ actor: taskActor });
    await screen.findByRole('button', { name: historicalRow });
    server.hold(route);
    start();
    const inFlight = await server.requested(route);

    server.unite();
    server.hold('GET /api/projects');
    workspace.deliver(1, canonicalFilter);
    await server.requested('GET /api/projects');
    // The change alone neither cancels the pending request nor offers a reload.
    expect(inFlight.signal?.aborted).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Reload Projects' }),
    ).toBeDisabled();

    await server.release(
      'GET /api/projects',
      new Response(null, { status: 403 }),
    );
    expect(screen.getByText(deniedMessage)).toBeInTheDocument();
    return { server, inFlight };
  }

  it.each(inFlightCommands)(
    'never lets $inFlight that succeeds after the refresh is denied repopulate the Project, its Tasks or its Documents',
    async (command) => {
      const { server, inFlight } = await denyRefreshWhile(command);

      await server.release(command.route);

      expect(
        screen.queryByRole('article', { name: command.title }),
      ).not.toBeInTheDocument();
      expect(server.count(command.taskRoute)).toBe(0);
      expect(screen.getByText(deniedMessage)).toBeInTheDocument();
      expect(inFlight.signal?.aborted).toBe(true);
      expect(
        screen.getByRole('button', { name: 'Reload Projects' }),
      ).toBeEnabled();
    },
  );

  it.each(inFlightCommands)(
    'offers the reload after a denied refresh while $inFlight never settles',
    async (command) => {
      const { server, inFlight } = await denyRefreshWhile(command);

      const reload = screen.getByRole('button', { name: 'Reload Projects' });
      expect(reload).toBeEnabled();
      expect(inFlight.signal?.aborted).toBe(true);

      server.serve('GET /api/projects');
      fireEvent.click(reload);
      expect(
        await screen.findByRole('button', { name: historicalRow }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('article', { name: command.title }),
      ).not.toBeInTheDocument();
      expect(server.count('GET /api/projects')).toBe(3);
      expect(server.count(command.route)).toBe(1);
    },
  );

  it('leaves a failed first read to the member’s reload instead of reading on the change', async () => {
    const server = identityServer();
    server.hold('GET /api/projects');
    const workspace = renderWorkspace();
    await server.release(
      'GET /api/projects',
      new Response(null, { status: 500 }),
    );
    expect(await screen.findByText(loadOrSaveError)).toBeInTheDocument();

    server.unite();
    workspace.deliver(1, canonicalFilter);
    await act(async () => await new Promise((resolve) => setTimeout(resolve)));
    expect(server.count('GET /api/projects')).toBe(1);

    server.serve('GET /api/projects');
    fireEvent.click(screen.getByRole('button', { name: 'Reload Projects' }));
    expect(
      await screen.findByRole('button', { name: historicalRow }),
    ).toBeInTheDocument();
    expect(server.count('GET /api/projects')).toBe(2);
  });

  it('keeps a pending registration across the change without publishing the dossier target it resolved earlier', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: historicalRow });
    fireEvent.change(screen.getByLabelText('Project title'), {
      target: { value: registeredProject.title },
    });
    fireEvent.change(screen.getByLabelText('Client'), {
      target: { value: supersededClient.id },
    });
    server.hold('POST /api/projects');
    server.hold('GET /api/projects');
    server.hold(`GET /api/projects/${registeredProject.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    // The server resolves the new Project's dossier before the union.
    const registration = await server.requested('POST /api/projects');

    server.unite();
    workspace.deliver(1);
    await server.requested('GET /api/projects');
    expect(registration.signal?.aborted).toBe(false);
    expect(screen.getByLabelText('Project title')).toHaveValue(
      registeredProject.title,
    );
    expect(
      screen.getByRole('button', { name: 'Create Project' }),
    ).toBeDisabled();

    await server.release('POST /api/projects');
    const detail = await screen.findByRole('article', {
      name: registeredProject.title,
    });
    expect(dossierAction(detail)).not.toBeInTheDocument();
    // The list read started before the confirmation cannot know the new row.
    await server.release(
      'GET /api/projects',
      Response.json([
        { ...historicalProject, clientDossierId: canonicalClient.id },
      ]),
    );
    expect(listedRows()).toEqual([historicalRow, registeredRow]);

    workspace.deliver(1, canonicalFilter);
    expect(listedRows()).toEqual([historicalRow]);
    expect(dossierAction(detail)).not.toBeInTheDocument();
    await server.release(`GET /api/projects/${registeredProject.id}`);
    expect(listedRows()).toEqual([historicalRow, registeredRow]);
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Open Client dossier' }),
    );
    expect(workspace.openDossier).toHaveBeenLastCalledWith(canonicalClient.id);
    expect(server.count('POST /api/projects')).toBe(1);
    expect(server.count('GET /api/projects')).toBe(2);
    expect(server.count(`GET /api/projects/${registeredProject.id}`)).toBe(1);
  });

  it('never matches the canonical dossier with a registration resolved under a union that lands after its reversal', async () => {
    const server = identityServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: historicalRow });
    fireEvent.change(screen.getByLabelText('Project title'), {
      target: { value: registeredProject.title },
    });
    fireEvent.change(screen.getByLabelText('Client'), {
      target: { value: supersededClient.id },
    });
    server.hold('POST /api/projects');
    server.hold(`GET /api/projects/${registeredProject.id}`);
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await server.requested('POST /api/projects');

    server.unite();
    workspace.deliver(1);
    await waitFor(() => expect(server.count('GET /api/projects')).toBe(2));
    server.reverse();
    workspace.deliver(2, canonicalFilter);
    await waitFor(() => expect(server.count('GET /api/projects')).toBe(3));
    // The server processed the registration while the union was in effect.
    await server.release(
      'POST /api/projects',
      Response.json(
        { ...registeredProject, clientDossierId: canonicalClient.id },
        { status: 201 },
      ),
    );
    const detail = await screen.findByRole('article', {
      name: registeredProject.title,
    });
    expect(listedRows()).toEqual([]);
    expect(dossierAction(detail)).not.toBeInTheDocument();

    await server.release(`GET /api/projects/${registeredProject.id}`);
    expect(listedRows()).toEqual([]);
    workspace.deliver(2, {
      clientDossierId: supersededClient.id,
      displayName: supersededClient.displayName,
    });
    expect(listedRows()).toEqual([historicalRow, registeredRow]);
    fireEvent.click(
      within(detail).getByRole('button', { name: 'Open Client dossier' }),
    );
    expect(workspace.openDossier).toHaveBeenLastCalledWith(supersededClient.id);
  });

  it('keeps the selected Project, its Task draft and the exact pending Task command across the change', async () => {
    const server = identityServer();
    const workspace = renderWorkspace({ actor: taskActor });
    const detail = await openHistoricalDetail();
    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    fireEvent.change(await within(tasks).findByLabelText('Task title'), {
      target: { value: createdTask.title },
    });
    server.hold(`POST ${taskPath}`);
    fireEvent.click(within(tasks).getByRole('button', { name: 'Create Task' }));
    const pendingCommand = await server.requested(`POST ${taskPath}`);

    server.unite();
    workspace.deliver(1, canonicalFilter);
    await waitFor(() => expect(dossierAction(detail)).toBeInTheDocument());
    expect(listedRows()).toEqual([historicalRow]);
    expect(pendingCommand.signal?.aborted).toBe(false);
    expect(within(tasks).getByLabelText('Task title')).toHaveValue(
      createdTask.title,
    );

    // The response is lost after the server created the Task.
    await server.release(
      `POST ${taskPath}`,
      new Response(null, { status: 500 }),
    );
    expect(within(tasks).getByLabelText('Task title')).toHaveValue(
      createdTask.title,
    );
    server.serve(`POST ${taskPath}`);
    fireEvent.click(
      await within(tasks).findByRole('button', {
        name: 'Retry pending Task change',
      }),
    );
    expect(
      await within(tasks).findByRole('heading', { name: createdTask.title }),
    ).toBeInTheDocument();
    const commands = server.requests(`POST ${taskPath}`);
    expect(commands).toHaveLength(2);
    expect(commands[1]?.key).toBe(commands[0]?.key);
    expect(commands[1]?.body).toBe(commands[0]?.body);
    expect(screen.getByRole('article', { name: historicalProject.title })).toBe(
      detail,
    );
  });
});
