import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const atelier = { id: 'client-atelier', displayName: 'Atelier Demo SRL' };
const beta = { id: 'client-beta', displayName: 'Beta Demo SRL' };
const sharedTitle = 'Pregătire demo';
const project = (client: typeof atelier, id: string) => ({
  id,
  companyId: companyA.id,
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
const otherCompanyProject = {
  ...project(beta, 'project-other-company'),
  companyId: companyB.id,
  title: 'Other Company preparation',
};
const workingDocument = {
  id: 'document-demo',
  companyId: companyA.id,
  clientId: atelier.id,
  clientDossierId: atelier.id,
  clientDisplayName: atelier.displayName,
  title: 'Chestionar demo',
  purpose: 'Prepare the demonstration interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T09:00:00.000Z',
  workingRevision: 1,
  correction: 'read-only',
  version: {
    id: 'version-demo',
    status: 'draft',
    representation: {
      id: 'representation-demo',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'denied',
    },
  },
};
/** The title the Document response carries; Projects never presents it. */
const titleReadWithDocument = 'Pregătire demo, as read with the Document';
const linkedDocument = {
  ...workingDocument,
  projectAssociation: {
    state: 'linked',
    project: { id: atelierProject.id, title: titleReadWithDocument },
  },
};
const atelierRow = `${sharedTitle} Client: ${atelier.displayName}`;
const betaRow = `${sharedTitle} Client: ${beta.displayName}`;
const atelierDetailPath = `/api/projects/${atelierProject.id}`;
const betaTasksPath = `/api/projects/${betaProject.id}/tasks`;
const taskDraft = 'Collect the signed questionnaire';

type ProjectPermissions = NonNullable<
  NonNullable<ActorContext['activeCompany']>['projectPermissions']
>;
function actorFor(
  companyId: string,
  projectPermissions: ProjectPermissions,
): ActorContext {
  return {
    internalUserId: 'coordinator',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Coordinator',
    email: 'coordinator@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v2',
      projectPermissions,
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
      documentPermissions: ['document.read'],
    },
  };
}

type ServerRequest = {
  route: string;
  companyId: string | null;
  key: string | null;
  body: string | undefined;
  signal: AbortSignal | undefined;
};

/**
 * Two Companies' synthetic server. Company A holds two readable Projects with
 * the same title and one working Document linked to Atelier's Project. A held
 * route waits for an explicit release.
 */
function installServer() {
  let projectPermissions: ProjectPermissions = [
    'project.read',
    'project.create',
  ];
  const requests: ServerRequest[] = [];
  const holding = new Set<string>();
  const held: Array<ServerRequest & { answer: (response: Response) => void }> =
    [];
  function answer({ route, companyId }: ServerRequest): Response {
    const inB = companyId === companyB.id;
    if (route === 'GET /api/access/current-actor')
      return Response.json(
        actorFor(companyId ?? companyA.id, projectPermissions),
      );
    if (route === 'GET /api/companies')
      return Response.json([companyA, companyB]);
    if (route === 'GET /api/activity-log') return Response.json({ events: [] });
    if (route === 'GET /api/assigned-tasks')
      return Response.json({ tasks: [] });
    if (route === 'GET /api/clients')
      return Response.json(
        (inB ? [] : [atelier, beta]).map((client) => ({
          ...client,
          relatedToActiveCompany: true,
        })),
      );
    if (route === 'GET /api/projects')
      return Response.json(
        inB ? [otherCompanyProject] : [betaProject, atelierProject],
      );
    if (route === 'POST /api/projects')
      return Response.json(registeredProject, { status: 201 });
    const opened = [atelierProject, betaProject].find(
      (candidate) => route === `GET /api/projects/${candidate.id}`,
    );
    if (opened && !inB) return Response.json(opened);
    if (/^GET \/api\/projects\/[^/]+\/tasks$/.test(route))
      return Response.json({ mutable: true, tasks: [] });
    if (route.endsWith('/eligible-task-assignees'))
      return Response.json({ members: [] });
    if (route === `POST ${betaTasksPath}`)
      return new Response(null, { status: 500 });
    if (route === 'GET /api/documents')
      return Response.json(inB ? [] : [workingDocument]);
    if (route === `GET /api/documents/${workingDocument.id}` && !inB)
      return Response.json(linkedDocument);
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const headers = new Headers(init?.headers);
      const request: ServerRequest = {
        route: `${init?.method ?? 'GET'} ${url.pathname}`,
        companyId: headers.get('x-company-context-id'),
        key: headers.get('idempotency-key'),
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
    grantProjects: (permissions: ProjectPermissions) => {
      projectPermissions = permissions;
    },
    hold: (route: string) => holding.add(route),
    serve: (route: string) => holding.delete(route),
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
    },
  };
}

function navigateTo(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: label }),
  );
}
const projectsRegion = () => screen.getByRole('region', { name: 'Projects' });
/** The Documents section; Project detail also has a Working Documents panel. */
function documentsRegion() {
  const section = document.getElementById('documents');
  if (!section) throw new Error('Expected the Documents section.');
  return section;
}
const projectDetail = () =>
  within(projectsRegion()).queryByRole('article', { name: sharedTitle });
const visibleTaskTitle = () =>
  within(
    within(projectsRegion()).getByRole('region', { name: 'Tasks' }),
  ).getByLabelText('Task title');
/** Waits for a row of the currently mounted Projects owner. */
const projectRow = (row: string) =>
  waitFor(() => within(projectsRegion()).getByRole('button', { name: row }));
async function chooseProjectRow(row: string) {
  fireEvent.click(await projectRow(row));
  const client = row.slice(`${sharedTitle} `.length);
  return waitFor(() => {
    const detail = projectDetail();
    if (!detail) throw new Error('Expected an opened Project detail.');
    expect(within(detail).getByText(client)).toBeInTheDocument();
    return detail;
  });
}
async function openLinkedDocument() {
  fireEvent.click(
    await waitFor(() =>
      within(documentsRegion()).getByRole('button', {
        name: workingDocument.title,
      }),
    ),
  );
  return waitFor(() => within(documentsRegion()).getByRole('article'));
}
async function selectCompany(companyId: string) {
  const selector = () =>
    screen.getByLabelText('Active Company', { exact: true });
  changeValue(selector(), companyId);
  await waitFor(() => {
    expect(selector()).toHaveValue(companyId);
    expect(selector()).toBeEnabled();
  });
}

// jsdom does not implement scrolling; the browser specs prove the real scroll.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Opening the linked Project from a working Document through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('opens the linked one of two same-titled Projects by its own read and keeps the other Project’s Task draft', async () => {
    window.history.replaceState(null, '', '/?frame=prisme#projects');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    await chooseProjectRow(betaRow);
    changeValue(await waitFor(visibleTaskTitle), taskDraft);

    navigateTo('Working Documents');
    const documentDetail = await openLinkedDocument();
    expect(
      within(documentDetail).getByText(titleReadWithDocument),
    ).toBeVisible();
    server.hold(`GET ${atelierDetailPath}`);
    fireEvent.click(
      within(documentDetail).getByRole('button', { name: 'Open Project' }),
    );

    // The Projects section is shown and focused before its own read answers.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(document.activeElement).toBe(projectsRegion());
    expect(projectsRegion()).toBeVisible();
    expect(projectDetail()).not.toBeInTheDocument();
    // The member moves on; the later reply must not take focus back.
    const elsewhere = within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Projects' });
    elsewhere.focus();
    await server.release(`GET ${atelierDetailPath}`);

    const detail = projectDetail();
    if (!detail) throw new Error('Expected the linked Project to open.');
    expect(detail).toBeVisible();
    expect(
      within(detail).getByText(`Client: ${atelier.displayName}`),
    ).toBeVisible();
    expect(
      within(projectsRegion()).queryByText(titleReadWithDocument),
    ).not.toBeInTheDocument();
    expect(document.activeElement).toBe(elsewhere);
    expect(server.count(`GET ${atelierDetailPath}`)).toBe(1);
    // Nothing identifies the Project outside its owner's read.
    expect(window.location.href).not.toContain(atelierProject.id);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(
      atelierProject.id,
    );
    expect(document.body.textContent).not.toContain(atelierProject.id);

    expect(await chooseProjectRow(betaRow)).toBeVisible();
    expect(visibleTaskTitle()).toHaveValue(taskDraft);
    expect(server.count(`GET ${betaTasksPath}`)).toBe(1);
    expect(server.count('POST /api/projects')).toBe(0);
  });

  it('keeps an uncertain Task command in the previously opened Project for an unchanged retry', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    await chooseProjectRow(betaRow);
    changeValue(await waitFor(visibleTaskTitle), taskDraft);
    fireEvent.click(
      within(projectsRegion()).getByRole('button', { name: 'Create Task' }),
    );
    expect(
      await within(projectsRegion()).findByRole('button', {
        name: 'Retry pending Task change',
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(await openLinkedDocument()).getByRole('button', {
        name: 'Open Project',
      }),
    );
    await waitFor(() =>
      expect(
        within(projectsRegion()).getByText(`Client: ${atelier.displayName}`, {
          selector: 'article p',
        }),
      ).toBeInTheDocument(),
    );

    await chooseProjectRow(betaRow);
    const retry = await within(projectsRegion()).findByRole('button', {
      name: 'Retry pending Task change',
    });
    expect(visibleTaskTitle()).toHaveValue(taskDraft);
    expect(server.count(`GET ${betaTasksPath}`)).toBe(1);
    fireEvent.click(retry);
    await waitFor(() => expect(server.count(`POST ${betaTasksPath}`)).toBe(2));
    const [first, retried] = server.requests(`POST ${betaTasksPath}`);
    expect(first?.key).toBeTruthy();
    expect(retried?.key).toBe(first?.key);
    expect(retried?.body).toBe(first?.body);
  });

  it.each([
    {
      waiting: 'its read is in flight',
      prepare: (server: ReturnType<typeof installServer>) => {
        server.hold(`GET ${atelierDetailPath}`);
        return Promise.resolve();
      },
      atelierReads: 1,
    },
    {
      waiting: 'a Project registration is pending',
      prepare: async (server: ReturnType<typeof installServer>) => {
        await projectRow(betaRow);
        changeValue(
          within(projectsRegion()).getByLabelText('Project title'),
          registeredProject.title,
        );
        changeValue(within(projectsRegion()).getByLabelText('Client'), beta.id);
        server.hold('POST /api/projects');
        fireEvent.click(
          within(projectsRegion()).getByRole('button', {
            name: 'Create Project',
          }),
        );
        await server.requested('POST /api/projects');
      },
      atelierReads: 0,
    },
  ])(
    'retires the open requested while $waiting when the Company changes, and never replays it on return',
    async ({ prepare, atelierReads }) => {
      window.history.replaceState(null, '', '/?frame=classic');
      const server = installServer();
      render(<App identity={deterministicBrowserIdentity()} />);
      await prepare(server);
      fireEvent.click(
        within(await openLinkedDocument()).getByRole('button', {
          name: 'Open Project',
        }),
      );
      await act(
        async () => await new Promise((resolve) => setTimeout(resolve)),
      );
      expect(server.count(`GET ${atelierDetailPath}`)).toBe(atelierReads);

      await selectCompany(companyB.id);
      await projectRow(
        `${otherCompanyProject.title} Client: ${beta.displayName}`,
      );
      await selectCompany(companyA.id);
      await projectRow(atelierRow);
      server.serve(`GET ${atelierDetailPath}`);
      if (atelierReads === 1) await server.release(`GET ${atelierDetailPath}`);
      else await server.release('POST /api/projects');

      expect(projectDetail()).not.toBeInTheDocument();
      expect(
        within(projectsRegion()).queryByText(`Client: ${atelier.displayName}`, {
          selector: 'article p',
        }),
      ).not.toBeInTheDocument();
      expect(server.count(`GET ${atelierDetailPath}`)).toBe(atelierReads);
    },
  );

  it('hides the action while project.read is lost and never replays the earlier open when it returns', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    server.hold(`GET ${atelierDetailPath}`);
    fireEvent.click(
      within(await openLinkedDocument()).getByRole('button', {
        name: 'Open Project',
      }),
    );
    await server.requested(`GET ${atelierDetailPath}`);

    server.grantProjects([]);
    await selectCompany(companyB.id);
    await selectCompany(companyA.id);
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Projects' }),
      ).not.toBeInTheDocument(),
    );
    const readerDetail = await openLinkedDocument();
    expect(
      within(readerDetail).getByText(workingDocument.purpose),
    ).toBeVisible();
    expect(
      within(readerDetail).queryByText(titleReadWithDocument),
    ).not.toBeInTheDocument();
    expect(
      within(readerDetail).queryByRole('button', { name: 'Open Project' }),
    ).not.toBeInTheDocument();

    server.grantProjects(['project.read']);
    await selectCompany(companyB.id);
    await selectCompany(companyA.id);
    await projectRow(atelierRow);
    server.serve(`GET ${atelierDetailPath}`);
    await server.release(`GET ${atelierDetailPath}`);
    expect(projectDetail()).not.toBeInTheDocument();
    expect(server.count(`GET ${atelierDetailPath}`)).toBe(1);
  });
});
