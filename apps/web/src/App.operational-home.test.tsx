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
import { operationalHomeCopy as copy } from './operational-home/operational-home.copy';

const companyA = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const companyB = { id: 'company-b', displayName: 'BIC' };
const today = '2026-09-27';
const project = {
  id: 'project-iso',
  companyId: companyA.id,
  clientAccountId: 'client-grup',
  clientDossierId: 'client-grup',
  clientDisplayName: 'GRUP Demo SA',
  title: 'ISO 9001 — GRUP Demo SA',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const attribution = {
  internalUserId: 'ana',
  workspaceMembershipId: 'membership-ana',
  displayName: 'Ana',
};
const overdueTask = {
  description: null,
  id: 'task-collect',
  companyId: companyA.id,
  projectId: project.id,
  clientAccountId: project.clientAccountId,
  title: 'Collect procedures',
  assignee: {
    workspaceMembershipId: 'membership-ana',
    displayLabel: 'Ana · 1',
  },
  dueDate: '2026-09-20',
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: attribution,
};
/** Counts distinct per Company, so a stray reply is recognizable. */
const counts = {
  [companyA.id]: { active_clients: 3, open_projects: 2, overdue_tasks: 1 },
  [companyB.id]: { active_clients: 71, open_projects: 72, overdue_tasks: 0 },
};

function actorFor(
  companyId: string,
  clientPermissionSetVersion: 'v1' | 'v2' = 'v1',
): ActorContext {
  return {
    internalUserId: attribution.internalUserId,
    workspaceMembershipId: attribution.workspaceMembershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: attribution.displayName,
    email: 'ana@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion,
      projectPermissions: ['project.read'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
}

type ServerRequest = {
  route: string;
  companyId: string | null;
  search: string;
};

/** A two-Company server; a held route waits for an explicit release. */
function installServer(
  initial: {
    actor?: (companyId: string) => ActorContext;
    overdueTasks?: readonly (typeof overdueTask)[];
  } = {},
) {
  const state = {
    actor: initial.actor ?? ((companyId: string) => actorFor(companyId)),
    refuseSearch: false,
    clientsInA: counts[companyA.id]?.active_clients ?? 0,
    showProjectSummaries: true,
    showAttention: false,
    showNoRuleAttentionTask: false,
    overdueTasks: initial.overdueTasks ?? [overdueTask],
    showTaskSummary: true,
  };
  const requests: ServerRequest[] = [];
  const holding = new Set<string>();
  const held: Array<ServerRequest & { answer: (response: Response) => void }> =
    [];
  function answer({ route, companyId, search }: ServerRequest): Response {
    const company = companyId ?? companyA.id;
    if (route === 'GET /api/access/current-actor')
      return Response.json(state.actor(company));
    if (route === 'GET /api/companies')
      return Response.json([companyA, companyB]);
    if (route === 'GET /api/activity-log') return Response.json({ events: [] });
    if (route === 'GET /api/operational-home') {
      const current = counts[company] ?? {};
      return Response.json({
        companyId: company,
        today,
        summaries: [
          {
            kind: 'active_clients',
            count:
              company === companyA.id
                ? state.clientsInA
                : current.active_clients,
          },
          { kind: 'open_projects', count: current.open_projects },
          {
            kind: 'overdue_tasks',
            count:
              company === companyA.id
                ? state.overdueTasks.length
                : current.overdue_tasks,
          },
        ].filter(
          (entry) =>
            (state.showProjectSummaries || entry.kind === 'active_clients') &&
            (state.showTaskSummary || entry.kind !== 'overdue_tasks'),
        ),
        ...(state.showAttention
          ? {
              attention:
                company === companyA.id
                  ? {
                      matchingCount: 1,
                      tasks: [
                        {
                          ...overdueTask,
                          dueDate: state.showNoRuleAttentionTask
                            ? null
                            : overdueTask.dueDate,
                          project: {
                            id: project.id,
                            title: project.title,
                            clientDisplayName: project.clientDisplayName,
                          },
                          rules: state.showNoRuleAttentionTask
                            ? []
                            : ['overdue'],
                          dueInDays: state.showNoRuleAttentionTask ? null : -7,
                        },
                      ],
                    }
                  : { matchingCount: 0, tasks: [] },
            }
          : {}),
      });
    }
    if (route === 'GET /api/overdue-tasks') {
      const offset = Number(new URLSearchParams(search).get('offset') ?? 0);
      const rows = company === companyA.id ? state.overdueTasks : [];
      return Response.json({
        companyId: company,
        today,
        total: rows.length,
        offset,
        pageSize: 25,
        tasks: rows.slice(offset, offset + 25).map((task) => ({
          ...task,
          project: {
            id: project.id,
            title: project.title,
            clientDisplayName: project.clientDisplayName,
          },
          daysOverdue: 7,
        })),
      });
    }
    if (route === 'GET /api/assigned-tasks')
      return Response.json({ tasks: [] });
    if (route === 'GET /api/clients') return Response.json([]);
    if (route === 'GET /api/clients/search')
      return state.refuseSearch
        ? new Response(null, { status: 403 })
        : Response.json([]);
    if (route === 'GET /api/client-duplicate-reviews')
      return Response.json({ items: [], next_cursor: null });
    if (route === 'GET /api/projects')
      return Response.json(company === companyA.id ? [project] : []);
    if (route === `GET /api/projects/${project.id}`)
      return Response.json(project);
    if (route === `GET /api/projects/${project.id}/tasks`)
      return Response.json({ mutable: true, tasks: state.overdueTasks });
    if (route === `GET /api/projects/${project.id}/eligible-task-assignees`)
      return Response.json({ members: [] });
    for (const task of state.overdueTasks) {
      if (route === `GET /api/tasks/${task.id}`)
        return Response.json({ mutable: true, task });
      if (route === `GET /api/tasks/${task.id}/history`)
        return Response.json({ events: [] });
    }
    return new Response(null, { status: 404 });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const request: ServerRequest = {
        route: `${init?.method ?? 'GET'} ${url.pathname}`,
        companyId: new Headers(init?.headers).get('x-company-context-id'),
        search: url.search,
      };
      requests.push(request);
      if (!holding.has(`${request.route}@${request.companyId}`))
        return answer(request);
      return new Promise<Response>((resolve) => {
        held.push({ ...request, answer: resolve });
      });
    }),
  );
  return {
    state,
    requests,
    count: (route: string, companyId?: string) =>
      requests.filter(
        (request) =>
          request.route === route &&
          (companyId === undefined || request.companyId === companyId),
      ).length,
    hold: (route: string, companyId: string) =>
      holding.add(`${route}@${companyId}`),
    /** Answers the held request and serves that route normally from then on. */
    async release(route: string, companyId: string) {
      holding.delete(`${route}@${companyId}`);
      const request = await waitFor(() => {
        const found = held.find(
          (candidate) =>
            candidate.route === route && candidate.companyId === companyId,
        );
        if (!found) throw new Error(`Nothing is held for ${route}`);
        return found;
      });
      held.splice(held.indexOf(request), 1);
      await act(async () => {
        request.answer(answer(request));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}

const overdueRoute = 'GET /api/overdue-tasks';
const nextPageTasks = Array.from({ length: 26 }, (_, index) => ({
  ...overdueTask,
  id: `overdue-page-${String(index + 1).padStart(2, '0')}`,
  title: `Overdue page Task ${index + 1}`,
}));
const homeRoute = 'GET /api/operational-home';
const summary = () => screen.getByRole('region', { name: copy.title });
const cardName = (kind: keyof typeof copy.summaries, count: number) =>
  copy.cardName({
    label: copy.summaries[kind].label,
    count: String(count),
    destination: copy.summaries[kind].destination,
  });
const overduePanel = (company: { displayName: string }) =>
  screen.queryByRole('region', {
    name: copy.overdue.title({ company: company.displayName }),
  });
async function selectCompany(companyId: string) {
  const selector = () =>
    screen.getByLabelText('Active Company', { exact: true });
  changeValue(selector(), companyId);
  await waitFor(() => {
    expect(selector()).toHaveValue(companyId);
    expect(selector()).toBeEnabled();
  });
}
/** The counts the region currently shows, by their cards' accessible names. */
function shownCards(): string[] {
  return within(summary())
    .queryAllByRole('listitem')
    .map(
      (item) =>
        within(item).getByRole('button').getAttribute('aria-label') ?? '',
    );
}

// jsdom does not implement scrolling; the browser specs prove the real scroll.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Operational home through App', () => {
  let language: string;
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    language = document.documentElement.lang;
    document.documentElement.lang = 'en-US';
    scrollable.scrollIntoView = vi.fn();
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.lang = language;
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('opens the exact Task from the next overdue page through the real App Project intent', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer({ overdueTasks: nextPageTasks });
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: cardName('overdue_tasks', 26),
      }),
    );
    const panel = await screen.findByRole('region', {
      name: copy.overdue.title({ company: companyA.displayName }),
    });
    await within(panel).findByRole('heading', { name: 'Overdue page Task 1' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }));
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: copy.overdue.openTask({
          task: 'Overdue page Task 26',
          project: project.title,
          client: project.clientDisplayName,
        }),
      }),
    );
    await waitFor(() =>
      expect(server.count('GET /api/tasks/overdue-page-26')).toBe(1),
    );
    const projectsRegion = await screen.findByRole('region', {
      name: 'Projects',
    });
    const taskRegion = await within(projectsRegion).findByRole('region', {
      name: 'Tasks',
    });
    const openedTask = await within(taskRegion).findByRole('heading', {
      name: 'Overdue page Task 26',
    });
    expect(openedTask).toBeVisible();
    await waitFor(() => expect(openedTask).toHaveFocus());
    expect(server.count(`GET /api/projects/${project.id}`)).toBe(1);
    expect(
      server.requests
        .filter((request) => request.route === overdueRoute)
        .map((request) => request.search),
    ).toEqual(['?offset=0', '?offset=25']);
    expect(window.location.href).not.toContain('overdue-page-26');
  });

  it('ignores a held next-page response after switching Company and restarts from zero on return', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer({ overdueTasks: nextPageTasks });
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: cardName('overdue_tasks', 26),
      }),
    );
    const panel = await screen.findByRole('region', {
      name: copy.overdue.title({ company: companyA.displayName }),
    });
    await within(panel).findByRole('heading', { name: 'Overdue page Task 1' });
    server.hold(overdueRoute, companyA.id);
    fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(server.count(overdueRoute, companyA.id)).toBe(2),
    );
    try {
      await selectCompany(companyB.id);
      await screen.findByRole('button', {
        name: cardName('active_clients', 71),
      });
      expect(overduePanel(companyA)).toBeNull();
      expect(overduePanel(companyB)).toBeNull();
      screen.getByLabelText('Active Company', { exact: true }).focus();
    } finally {
      await server.release(overdueRoute, companyA.id);
    }
    expect(
      screen.getByLabelText('Active Company', { exact: true }),
    ).toHaveFocus();
    expect(shownCards()).toEqual([
      cardName('active_clients', 71),
      cardName('open_projects', 72),
      cardName('overdue_tasks', 0),
    ]);
    expect(
      screen.queryByRole('heading', { name: 'Overdue page Task 26' }),
    ).toBeNull();
    expect(overduePanel(companyA)).toBeNull();
    await selectCompany(companyA.id);
    fireEvent.click(
      await screen.findByRole('button', {
        name: cardName('overdue_tasks', 26),
      }),
    );
    const returned = await screen.findByRole('region', {
      name: copy.overdue.title({ company: companyA.displayName }),
    });
    await within(returned).findByRole('heading', {
      name: 'Overdue page Task 1',
    });
    expect(
      within(returned).getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    expect(
      server.requests
        .filter(
          (request) =>
            request.route === overdueRoute && request.companyId === companyA.id,
        )
        .map((request) => request.search),
    ).toEqual(['?offset=0', '?offset=25', '?offset=0']);
  });

  it('retires a held overdue page when live actor revalidation removes Task read', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer({ overdueTasks: nextPageTasks });
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: cardName('overdue_tasks', 26),
      }),
    );
    const panel = await screen.findByRole('region', {
      name: copy.overdue.title({ company: companyA.displayName }),
    });
    await within(panel).findByRole('heading', { name: 'Overdue page Task 1' });
    server.hold(overdueRoute, companyA.id);
    fireEvent.click(within(panel).getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(server.count(overdueRoute, companyA.id)).toBe(2),
    );
    server.state.actor = (companyId) => ({
      ...actorFor(companyId),
      activeCompany: {
        ...(companyId === companyB.id ? companyB : companyA),
        clientPermissions: ['client.read'],
        clientPermissionAssignmentId: 'client-grant',
        clientPermissionSetVersion: 'v1',
        projectPermissions: ['project.read'],
        taskPermissions: [],
      },
    });
    server.state.showTaskSummary = false;
    server.state.refuseSearch = true;
    try {
      changeValue(screen.getByLabelText('Find a shared Client'), 'Demo');
      fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      await waitFor(() => expect(server.count(homeRoute)).toBe(2));
      await waitFor(() => expect(overduePanel(companyA)).toBeNull());
    } finally {
      await server.release(overdueRoute, companyA.id);
    }
    expect(
      screen.queryByRole('button', { name: cardName('overdue_tasks', 26) }),
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Overdue page Task 26' }),
    ).toBeNull();
    expect(shownCards()).toEqual([
      cardName('active_clients', 3),
      cardName('open_projects', 2),
    ]);
    expect(server.count(overdueRoute, companyA.id)).toBe(2);
  });

  it('renders the region in the Classic home surface below the welcome text', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    await within(
      await screen.findByRole('region', { name: copy.title }),
    ).findByRole('button', { name: cardName('active_clients', 3) });
    const welcome = screen.getByRole('heading', {
      name: 'Welcome to PRISMA-PRIM Suite',
    });
    const surface = welcome.closest('.production-content-surface');
    expect(surface).toContainElement(summary());
    expect(shownCards()).toEqual([
      cardName('active_clients', 3),
      cardName('open_projects', 2),
      cardName('overdue_tasks', 1),
    ]);
    expect(summary()).toHaveTextContent(
      'Counted on Sep 27, 2026 from the records you can open in PRISMA-PRIM.',
    );
    expect(server.count(homeRoute)).toBe(1);
    expect(server.count('GET /api/overdue-tasks')).toBe(0);
  });

  it('places the region between the Prisme hero and capabilities and re-reads it on returning to the overview', async () => {
    window.history.replaceState(null, '', '/');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    const clients = await screen.findByRole('button', {
      name: cardName('active_clients', 3),
    });
    const hero = screen.getByRole('region', {
      name: 'Clarity to move forward.',
    });
    const capabilities = screen.getByRole('region', { name: 'Your workspace' });
    expect(
      hero.compareDocumentPosition(summary()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      summary().compareDocumentPosition(capabilities) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(clients);
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    expect(screen.queryByRole('region', { name: copy.title })).toBeNull();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Primary navigation' }),
      ).getByRole('link', { name: 'Overview' }),
    );
    await screen.findByRole('button', { name: cardName('active_clients', 3) });
    expect(server.count(homeRoute)).toBe(2);
  });

  it('never renders a previous Company reply after a switch and closes the overdue panel', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    server.state.showAttention = true;
    server.hold(homeRoute, companyA.id);
    render(<App identity={deterministicBrowserIdentity()} />);
    await waitFor(() => expect(server.count(homeRoute, companyA.id)).toBe(1));

    await selectCompany(companyB.id);
    await screen.findByRole('button', { name: cardName('active_clients', 71) });
    await server.release(homeRoute, companyA.id);
    expect(shownCards()).toEqual([
      cardName('active_clients', 71),
      cardName('open_projects', 72),
      cardName('overdue_tasks', 0),
    ]);
    expect(summary()).toHaveTextContent('records you can open in BIC.');
    expect(summary()).not.toHaveTextContent('PRISMA-PRIM');
    expect(summary()).toHaveTextContent(
      'Nothing needs your attention in BIC on Sep 27, 2026.',
    );
    expect(summary()).not.toHaveTextContent(overdueTask.title);

    await selectCompany(companyA.id);
    fireEvent.click(
      await screen.findByRole('button', { name: cardName('overdue_tasks', 1) }),
    );
    expect(
      await within(overduePanel(companyA) ?? summary()).findByRole('heading', {
        name: overdueTask.title,
      }),
    ).toBeVisible();
    await selectCompany(companyB.id);
    await screen.findByRole('button', { name: cardName('active_clients', 71) });
    expect(overduePanel(companyA)).toBeNull();
    expect(overduePanel(companyB)).toBeNull();
    expect(screen.queryByText(overdueTask.title)).toBeNull();
  });

  it('remounts the region when the captured Client permission version changes', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('button', { name: cardName('active_clients', 3) });
    expect(server.count(homeRoute)).toBe(1);

    // A refused read revalidates the actor, who now holds captured v2.
    server.state.actor = (companyId) => actorFor(companyId, 'v2');
    server.state.refuseSearch = true;
    server.state.clientsInA = 4;
    changeValue(screen.getByLabelText('Find a shared Client'), 'Demo');
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    await screen.findByRole('button', { name: cardName('active_clients', 4) });
    expect(server.count(homeRoute)).toBe(2);
  });

  it('opens the Project list and an overdue Task in its Project through the App intents', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    render(<App identity={deterministicBrowserIdentity()} />);
    const projectsRegion = () =>
      screen.getByRole('region', { name: 'Projects' });

    fireEvent.click(
      await screen.findByRole('button', { name: cardName('open_projects', 2) }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#projects'));
    expect(
      await within(projectsRegion()).findByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: cardName('overdue_tasks', 1) }),
    );
    const panel = await waitFor(() => {
      const found = overduePanel(companyA);
      if (!found) throw new Error('Expected the overdue panel.');
      return found;
    });
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: copy.overdue.openTask({
          task: overdueTask.title,
          project: project.title,
          client: project.clientDisplayName,
        }),
      }),
    );
    await waitFor(() =>
      expect(server.count(`GET /api/tasks/${overdueTask.id}`)).toBe(1),
    );
    expect(server.count(`GET /api/projects/${project.id}`)).toBe(1);
    expect(window.location.href).not.toContain(overdueTask.id);
  });

  it('rejects an attention Task that does not belong to the admitted reader', async () => {
    const server = installServer({
      actor: (companyId) => ({
        ...actorFor(companyId),
        workspaceMembershipId: 'membership-other',
      }),
    });
    server.state.showAttention = true;
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(await screen.findByText(copy.error)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: copy.attention.title }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(overdueTask.title)).not.toBeInTheDocument();
  });

  it('rejects an attention Task that matches no attention rule', async () => {
    const server = installServer();
    server.state.showAttention = true;
    server.state.showNoRuleAttentionTask = true;
    render(<App identity={deterministicBrowserIdentity()} />);
    expect(await screen.findByText(copy.error)).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: copy.attention.title }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(overdueTask.title)).not.toBeInTheDocument();
  });

  it('opens an attention Task in its Project and ordinary My Tasks through App intents', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer();
    server.state.showAttention = true;
    render(<App identity={deterministicBrowserIdentity()} />);
    const attention = await screen.findByRole('region', {
      name: copy.attention.title,
    });

    fireEvent.click(
      within(attention).getByRole('button', {
        name: copy.attention.openTask({
          task: overdueTask.title,
          project: project.title,
          client: project.clientDisplayName,
        }),
      }),
    );
    await waitFor(() =>
      expect(server.count(`GET /api/tasks/${overdueTask.id}`)).toBe(1),
    );
    expect(window.location.href).not.toContain(overdueTask.id);

    fireEvent.click(
      within(attention).getByRole('button', {
        name: copy.attention.openMyTasks,
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#my-tasks'));
    expect(screen.getByRole('region', { name: 'My Tasks' })).toBeVisible();
  });

  it.each(['classic', 'prisme'])(
    'focuses the My Tasks region from My attention in %s',
    async (frame) => {
      window.history.replaceState(null, '', `/?frame=${frame}`);
      const server = installServer();
      server.state.showAttention = true;
      render(<App identity={deterministicBrowserIdentity()} />);
      const attention = await screen.findByRole('region', {
        name: copy.attention.title,
      });

      fireEvent.click(
        within(attention).getByRole('button', {
          name: copy.attention.openMyTasks,
        }),
      );

      const myTasks = await screen.findByRole('region', { name: 'My Tasks' });
      expect(window.location.hash).toBe('#my-tasks');
      expect(myTasks).toBeVisible();
      await waitFor(() => expect(myTasks).toHaveFocus());
      expect(document.querySelectorAll('#my-tasks')).toHaveLength(1);
      expect(myTasks).toHaveAttribute('id', 'my-tasks');
    },
  );
  it('revalidates newly granted Project and Task destinations before exposing refreshed cards', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const server = installServer({
      actor: () => ({
        ...actorFor(companyA.id),
        activeCompany: {
          ...companyA,
          clientPermissions: ['client.read'],
        },
      }),
    });
    server.state.showProjectSummaries = false;
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('button', { name: cardName('active_clients', 3) });
    expect(screen.queryByRole('region', { name: 'Projects' })).toBeNull();

    server.state.actor = (companyId) => actorFor(companyId);
    server.state.showProjectSummaries = true;
    server.hold('GET /api/access/current-actor', companyA.id);
    fireEvent.click(screen.getByRole('button', { name: copy.refresh }));
    await waitFor(() =>
      expect(server.count('GET /api/access/current-actor', companyA.id)).toBe(
        1,
      ),
    );
    expect(
      screen.queryByRole('button', { name: cardName('open_projects', 2) }),
    ).toBeNull();
    await server.release('GET /api/access/current-actor', companyA.id);

    fireEvent.click(
      await screen.findByRole('button', { name: cardName('open_projects', 2) }),
    );
    expect(
      await screen.findByRole('region', { name: 'Projects' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: cardName('overdue_tasks', 1) }),
    );
    const panel = await screen.findByRole('region', {
      name: copy.overdue.title({ company: companyA.displayName }),
    });
    fireEvent.click(
      await within(panel).findByRole('button', {
        name: copy.overdue.openTask({
          task: overdueTask.title,
          project: project.title,
          client: project.clientDisplayName,
        }),
      }),
    );
    await waitFor(() =>
      expect(server.count(`GET /api/tasks/${overdueTask.id}`)).toBe(1),
    );
  });

  it.each([
    [
      'no active Company',
      { ...actorFor(companyA.id), activeCompany: undefined },
    ],
    [
      'none of the three reads',
      {
        ...actorFor(companyA.id),
        activeCompany: { ...companyA, clientPermissions: [] },
      },
    ],
  ] satisfies Array<[string, ActorContext]>)(
    'requests nothing and renders no region with %s',
    async (_case, actor) => {
      window.history.replaceState(null, '', '/?frame=classic');
      const server = installServer({ actor: () => actor });
      render(<App identity={deterministicBrowserIdentity()} />);
      await screen.findByRole('heading', {
        name: 'Welcome to PRISMA-PRIM Suite',
      });
      await act(
        async () => await new Promise((resolve) => setTimeout(resolve)),
      );
      expect(screen.queryByRole('region', { name: copy.title })).toBeNull();
      expect(server.count(homeRoute)).toBe(0);
    },
  );
});
