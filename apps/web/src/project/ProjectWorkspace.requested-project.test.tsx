import { changeValue } from '../test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../test/render-with-interface-locale';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
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
const atelier = { id: 'client-atelier', displayName: 'Atelier Demo SRL' };
const beta = { id: 'client-beta', displayName: 'Beta Demo SRL' };
const canonical = { id: 'client-canonical', displayName: 'Canonical SRL' };
const sharedTitle = 'Pregătire demo';
const project = (client: typeof atelier, id: string) => ({
  id,
  companyId: 'company',
  clientAccountId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: sharedTitle,
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
});
const atelierProject = project(atelier, 'project-atelier');
const betaProject = project(beta, 'project-beta');
const registeredProject = {
  ...project(beta, 'project-registered'),
  title: 'Registered preparation',
};
const completedProject = {
  ...project(atelier, 'project-completed'),
  title: 'Completed assessment',
  status: 'completed',
};
const completedLifecycle = {
  status: 'completed',
  lifecycleRevision: 1,
  mutable: false,
  start: null,
  transitions: [
    {
      action: 'complete',
      lifecycleRevision: 1,
      from: 'active',
      to: 'completed',
      occurredAt: '2026-09-20T08:00:00.000Z',
      actor: { displayName: 'Owner' },
      note: 'All agreed outcomes were delivered.',
    },
  ],
};
const atelierRow = `${sharedTitle} Client: ${atelier.displayName}`;
const betaRow = `${sharedTitle} Client: ${beta.displayName}`;
const atelierDetail = `GET /api/projects/${atelierProject.id}`;
const betaDetail = `GET /api/projects/${betaProject.id}`;
const deniedMessage =
  'Project access and Client read access are required for this Company.';
const loadOrSaveError =
  'The Project could not be loaded or saved. Please try again.';
type ServerRequest = {
  route: string;
  key: string | null;
  body: string | undefined;
  signal: AbortSignal | undefined;
};
type ProjectRequest = {
  projectId: string;
  requestId: number;
  sourceSignal?: AbortSignal;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * One Company's Project server with two same-titled readable Projects. A held
 * route waits for an explicit release; a command is processed when received.
 */
function projectServer() {
  let united = false;
  const requests: ServerRequest[] = [];
  const holding = new Set<string>();
  const held: Array<ServerRequest & { answer: (response: Response) => void }> =
    [];
  const projected = (row: typeof atelierProject) =>
    united && row.clientAccountId === atelier.id
      ? { ...row, clientDossierId: canonical.id }
      : row;
  function answer({ route }: ServerRequest): Response {
    if (route === 'GET /api/clients') return Response.json([atelier, beta]);
    if (route === 'GET /api/projects')
      return Response.json(
        [betaProject, atelierProject, completedProject].map(projected),
      );
    if (route === 'POST /api/projects')
      return Response.json(registeredProject, { status: 201 });
    const opened = [
      atelierProject,
      betaProject,
      registeredProject,
      completedProject,
    ].find((row) => route === `GET /api/projects/${row.id}`);
    if (opened) return Response.json(projected(opened));
    if (route === `GET /api/projects/${completedProject.id}/lifecycle`)
      return Response.json(completedLifecycle);
    if (route.startsWith('GET ') && isLifecycleRead(route.slice(4)))
      return Response.json(preparatoryLifecycle);
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const request: ServerRequest = {
        route: `${init?.method ?? 'GET'} ${url}`,
        key: new Headers(init?.headers).get('idempotency-key'),
        body: typeof init?.body === 'string' ? init.body : undefined,
        signal: init?.signal ?? undefined,
      };
      requests.push(request);
      if (!holding.has(request.route)) return answer(request);
      return new Promise<Response>((resolve) => {
        held.push({ ...request, answer: resolve });
      });
    }),
  );
  function heldRequest(route: string) {
    const found = held.find((candidate) => candidate.route === route);
    if (!found) throw new Error(`Nothing is held for ${route}`);
    return found;
  }
  return {
    unite: () => {
      united = true;
    },
    hold: (route: string) => holding.add(route),
    count: (route: string) =>
      requests.filter((request) => request.route === route).length,
    requests: (route: string) =>
      requests.filter((request) => request.route === route),
    requested: (route: string) => waitFor(() => heldRequest(route)),
    async release(route: string, response?: Response) {
      const request = await waitFor(() => heldRequest(route));
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(response ?? answer(request));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      return request;
    },
  };
}

function renderWorkspace(
  options: {
    identity?: BrowserIdentity;
    initialRequest?: ProjectRequest;
    prisme?: boolean;
  } = {},
) {
  const identity = options.identity ?? deterministicBrowserIdentity();
  const openDossier = vi.fn();
  const workspace = (revision: number, requestedProject?: ProjectRequest) => {
    const owner = (
      <ProjectWorkspace
        actor={actor}
        identity={identity}
        clientIdentityRevision={revision}
        onOpenClientDossier={openDossier}
        requestedProject={requestedProject}
      />
    );
    return options.prisme ? (
      <ApplicationPresentation value="prisme">{owner}</ApplicationPresentation>
    ) : (
      owner
    );
  };
  let revision = 0;
  let current = options.initialRequest;
  const view = render(workspace(revision, current));
  return {
    openDossier,
    request(projectId: string, requestId: number, sourceSignal?: AbortSignal) {
      current = { projectId, requestId, sourceSignal };
      view.rerender(workspace(revision, current));
    },
    deliver(nextRevision: number) {
      revision = nextRevision;
      view.rerender(workspace(revision, current));
    },
    rerenderSameRequest() {
      current = current ? { ...current } : undefined;
      view.rerender(workspace(revision, current));
    },
  };
}
const openedDetail = () => screen.queryByRole('article', { name: sharedTitle });
const detailClient = () =>
  openedDetail()?.querySelector('.project-detail-client')?.textContent ?? null;
const listedRows = () =>
  within(screen.getByRole('list', { name: 'Projects' }))
    .queryAllByRole('button')
    .map((button) => button.textContent);
const settle = () =>
  act(async () => await new Promise((resolve) => setTimeout(resolve)));
async function startRegistration(server: ReturnType<typeof projectServer>) {
  await screen.findByRole('button', { name: betaRow });
  changeValue(screen.getByLabelText('Project title'), registeredProject.title);
  changeValue(screen.getByLabelText('Client'), beta.id);
  server.hold('POST /api/projects');
  fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
  return server.requested('POST /api/projects');
}

describe('Requested Project opens', () => {
  it('keeps current detail when identity revalidation returns the same Project id under a foreign Company', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    fireEvent.click(await screen.findByRole('button', { name: betaRow }));
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${beta.displayName}`),
    );
    server.hold(betaDetail);
    workspace.deliver(1);
    await server.release(
      betaDetail,
      Response.json({
        ...betaProject,
        companyId: 'other-company',
        clientDisplayName: 'Foreign confidential Client',
      }),
    );
    await screen.findByText(loadOrSaveError);
    expect(detailClient()).toBe(`Client: ${beta.displayName}`);
    expect(
      screen.queryByText('Foreign confidential Client'),
    ).not.toBeInTheDocument();
  });

  it.each([200, 403])(
    'retires a pending inline opening before its late %s response can affect Project state',
    async (status) => {
      const server = projectServer();
      const workspace = renderWorkspace();
      await screen.findByRole('button', { name: betaRow });
      const source = new AbortController();
      server.hold(atelierDetail);
      workspace.request(atelierProject.id, 1, source.signal);
      const held = await server.requested(atelierDetail);
      await act(async () => source.abort());
      expect(held.signal?.aborted).toBe(true);
      await server.release(
        atelierDetail,
        status === 200
          ? Response.json(atelierProject)
          : new Response(null, { status }),
      );
      expect(openedDetail()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: betaRow })).toBeInTheDocument();
      expect(screen.queryByText(deniedMessage)).not.toBeInTheDocument();
    },
  );

  it('abandons a queued inline target without cancelling registration or changing its uncertain retry', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    const registration = await startRegistration(server);
    const source = new AbortController();
    workspace.request(atelierProject.id, 1, source.signal);
    await act(async () => source.abort());
    expect(registration.signal?.aborted).toBe(false);
    await server.release(
      'POST /api/projects',
      new Response(null, { status: 500 }),
    );
    await settle();
    expect(server.count(atelierDetail)).toBe(0);
    expect(screen.getByLabelText('Project title')).toHaveValue(
      registeredProject.title,
    );
    expect(screen.getByLabelText('Client')).toHaveValue(beta.id);
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(server.count('POST /api/projects')).toBe(2));
    const [first, retry] = server.requests('POST /api/projects');
    expect(first?.key).toBeTruthy();
    expect(retry?.key).toBe(first?.key);
    expect(retry?.body).toBe(first?.body);
  });

  it('opens a directly requested closed Project while its row stays hidden by the default filter', async () => {
    projectServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: betaRow });
    expect(
      screen.queryByRole('button', {
        name: `${completedProject.title} Client: ${atelier.displayName}`,
      }),
    ).toBeNull();

    workspace.request(completedProject.id, 1);
    const detail = await screen.findByRole('article', {
      name: completedProject.title,
    });
    expect(detail).toHaveTextContent(
      'This Project is completed. Its Tasks, Documents and responsible member are read-only; its history remains available.',
    );
    expect(
      await within(detail).findByText('All agreed outcomes were delivered.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Include closed Projects')).not.toBeChecked();
    expect(
      screen.queryByRole('button', {
        name: `${completedProject.title} Client: ${atelier.displayName}`,
      }),
    ).toBeNull();
  });

  it('opens the requested one of two same-titled Projects on its Tasks panel, updating its row and keeping the search', async () => {
    const server = projectServer();
    const workspace = renderWorkspace({ prisme: true });
    fireEvent.click(await screen.findByRole('button', { name: betaRow }));
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${beta.displayName}`),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Working Documents' }));
    const search = screen.getByRole('searchbox', { name: 'Find Projects' });
    changeValue(search, 'demo');

    const renamedClient = 'Atelier Demo SRL (current name)';
    server.hold(atelierDetail);
    workspace.request(atelierProject.id, 1);
    await server.release(
      atelierDetail,
      Response.json({ ...atelierProject, clientDisplayName: renamedClient }),
    );

    expect(detailClient()).toBe(`Client: ${renamedClient}`);
    expect(screen.getByRole('tab', { name: 'Tasks' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(listedRows()).toEqual([
      betaRow,
      `${sharedTitle} Client: ${renamedClient}`,
    ]);
    expect(search).toHaveValue('demo');
    expect(server.count(atelierDetail)).toBe(1);
    expect(server.count('GET /api/projects')).toBe(1);
  });

  it('waits for a pending registration to settle, keeping its request, retry key and draft, then opens', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    const registration = await startRegistration(server);

    workspace.request(atelierProject.id, 1);
    await settle();
    expect(server.count(atelierDetail)).toBe(0);
    expect(registration.signal?.aborted).toBe(false);
    expect(screen.getByLabelText('Project title')).toHaveValue(
      registeredProject.title,
    );

    // The registration's outcome is lost; its retry must stay unchanged.
    await server.release(
      'POST /api/projects',
      new Response(null, { status: 500 }),
    );
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${atelier.displayName}`),
    );
    expect(server.count(atelierDetail)).toBe(1);
    expect(screen.getByLabelText('Project title')).toHaveValue(
      registeredProject.title,
    );
    expect(screen.getByLabelText('Client')).toHaveValue(beta.id);

    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(server.count('POST /api/projects')).toBe(2));
    const [first, retried] = server.requests('POST /api/projects');
    expect(first?.key).toBeTruthy();
    expect(retried?.key).toBe(first?.key);
    expect(retried?.body).toBe(first?.body);
  });

  it.each([
    { inFlight: 'the first list read', refresh: false },
    { inFlight: 'a Client identity refresh', refresh: true },
  ])('neither cancels nor strands $inFlight', async ({ refresh }) => {
    const server = projectServer();
    if (!refresh) server.hold('GET /api/projects');
    const workspace = renderWorkspace();
    if (refresh) {
      await screen.findByRole('button', { name: betaRow });
      server.unite();
      server.hold('GET /api/projects');
      workspace.deliver(1);
    }
    const listRead = await server.requested('GET /api/projects');

    workspace.request(atelierProject.id, 1);
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${atelier.displayName}`),
    );
    expect(listRead.signal?.aborted).toBe(false);

    await server.release('GET /api/projects');
    expect(listedRows()).toEqual([betaRow, atelierRow]);
    expect(screen.queryByText('Loading Projects…')).not.toBeInTheDocument();
    expect(server.count(atelierDetail)).toBe(1);
    expect(server.count('GET /api/projects')).toBe(refresh ? 2 : 1);
  });

  it('lets a newer request supersede an earlier open whose reply arrives late', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: betaRow });
    server.hold(atelierDetail);
    workspace.request(atelierProject.id, 1);
    const earlier = await server.requested(atelierDetail);

    workspace.request(betaProject.id, 2);
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${beta.displayName}`),
    );
    expect(earlier.signal?.aborted).toBe(true);
    await server.release(atelierDetail);

    expect(detailClient()).toBe(`Client: ${beta.displayName}`);
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('lets a newer request replace one still waiting for a registration', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    await startRegistration(server);
    workspace.request(atelierProject.id, 1);
    workspace.request(betaProject.id, 2);

    await server.release('POST /api/projects');
    await waitFor(() =>
      expect(detailClient()).toBe(`Client: ${beta.displayName}`),
    );
    expect(server.count(atelierDetail)).toBe(0);
    expect(server.count(betaDetail)).toBe(1);
  });

  it('re-reads the same Project for each new request, and only once per request', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: betaRow });
    workspace.request(atelierProject.id, 1);
    await waitFor(() => expect(openedDetail()).toBeInTheDocument());
    workspace.request(atelierProject.id, 2);
    await waitFor(() => expect(server.count(atelierDetail)).toBe(2));
    await waitFor(() => expect(openedDetail()).toBeInTheDocument());

    workspace.rerenderSameRequest();
    await settle();
    expect(server.count(atelierDetail)).toBe(2);
  });

  it.each([
    {
      reply: 'forbidden',
      status: 403,
      message: deniedMessage,
      rowsKept: false,
    },
    {
      reply: 'not found',
      status: 404,
      message: loadOrSaveError,
      rowsKept: true,
    },
    {
      reply: 'failed',
      status: 500,
      message: loadOrSaveError,
      rowsKept: true,
    },
  ])(
    'shows the existing state for a $reply read and no detail',
    async ({ status, message, rowsKept }) => {
      const server = projectServer();
      const workspace = renderWorkspace();
      fireEvent.click(await screen.findByRole('button', { name: betaRow }));
      await waitFor(() => expect(openedDetail()).toBeInTheDocument());
      server.hold(atelierDetail);

      workspace.request(atelierProject.id, 1);
      await server.release(atelierDetail, new Response(null, { status }));

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(openedDetail()).not.toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Projects' }) !== null).toBe(
        rowsKept,
      );
      expect(server.count(atelierDetail)).toBe(1);
    },
  );

  it('rejects the session for an unauthorized read without opening a detail', async () => {
    const server = projectServer();
    const rejectSession = vi.fn(async () => undefined);
    const workspace = renderWorkspace({
      identity: { ...deterministicBrowserIdentity(), rejectSession },
    });
    await screen.findByRole('button', { name: betaRow });
    server.hold(atelierDetail);

    workspace.request(atelierProject.id, 1);
    await server.release(atelierDetail, new Response(null, { status: 401 }));

    expect(rejectSession).toHaveBeenCalledTimes(1);
    expect(openedDetail()).not.toBeInTheDocument();
  });

  it('issues no read and stays denied when the owner is already denied', async () => {
    const server = projectServer();
    server.hold('GET /api/projects');
    const workspace = renderWorkspace();
    await server.release(
      'GET /api/projects',
      new Response(null, { status: 403 }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(deniedMessage);

    workspace.request(atelierProject.id, 1);
    await settle();

    expect(server.count(atelierDetail)).toBe(0);
    expect(screen.getByRole('alert')).toHaveTextContent(deniedMessage);
    expect(openedDetail()).not.toBeInTheDocument();
  });

  it('opens across a Client union and offers the dossier only after a current-generation read', async () => {
    const server = projectServer();
    const workspace = renderWorkspace();
    await screen.findByRole('button', { name: betaRow });
    server.hold(atelierDetail);
    workspace.request(atelierProject.id, 1);
    await server.requested(atelierDetail);

    server.unite();
    workspace.deliver(1);
    // The read started before the union resolved the superseded dossier.
    await server.release(atelierDetail, Response.json(atelierProject));
    const detail = openedDetail();
    if (!detail) throw new Error('Expected the requested Project to open.');
    expect(
      within(detail).queryByRole('button', { name: 'Open Client dossier' }),
    ).not.toBeInTheDocument();

    await server.release(atelierDetail);
    fireEvent.click(
      await within(detail).findByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(workspace.openDossier).toHaveBeenLastCalledWith(canonical.id);
    expect(server.count(atelierDetail)).toBe(2);
  });

  it('never replays a request that was already present when the owner mounted', async () => {
    const server = projectServer();
    renderWorkspace({
      initialRequest: { projectId: atelierProject.id, requestId: 1 },
    });
    await screen.findByRole('button', { name: betaRow });
    await settle();
    expect(server.count(atelierDetail)).toBe(0);
    expect(openedDetail()).not.toBeInTheDocument();
  });
});
