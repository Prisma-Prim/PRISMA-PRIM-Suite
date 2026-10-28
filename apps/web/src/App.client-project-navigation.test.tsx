import {
  deferred,
  resetCurrentWorkApp,
} from './mission-plan/current-work-app.test-support';
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
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project/project-lifecycle.test-fixtures';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const membershipId = 'membership-1';
const projectionReference = 'projection-344';
const firstClient = {
  id: 'client-first',
  version: 2,
  displayName: 'First saved Client',
  taxId: 'UNION-344',
  address: null,
  telephone: '+373 60 111 222',
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const secondClient = {
  ...firstClient,
  id: 'client-second',
  version: 4,
  displayName: 'Second saved Client',
  address: '14 Example Avenue',
  contacts: [{ name: 'Dana' }],
};
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-344',
  clients: [firstClient, secondClient],
  companies: [companyA],
};
const historicalProject = {
  id: 'project-first',
  companyId: companyA.id,
  clientAccountId: firstClient.id,
  clientDisplayName: firstClient.displayName,
  title: 'First preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const otherCompanyProject = {
  ...historicalProject,
  id: 'project-other-company',
  companyId: companyB.id,
  clientAccountId: 'client-other-company',
  clientDossierId: 'client-other-company',
  clientDisplayName: 'Other Company Client',
  title: 'Other Company preparation',
};
const historicalRow = `${historicalProject.title} Client: ${historicalProject.clientDisplayName}`;
const taskDraft = 'Keep this Task draft across the union';

function actorFor(companyId: string): ActorContext {
  return {
    internalUserId: 'resolver',
    workspaceMembershipId: membershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Resolver',
    email: 'resolver@example.test',
    active: true,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
      projectPermissions: ['project.read'],
      projectPermissionAssignmentId: 'project-assignment-1',
      projectPermissionSetVersion: 'v2',
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-assignment-1',
      taskPermissionSetVersion: 'v1',
    },
  };
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function installTransport(options: { united?: boolean } = {}) {
  const state = {
    united: options.united ?? false,
    projectListReads: 0,
    clientProjectListReads: 0,
    projectDetailReads: 0,
  };
  const projectsFor = (companyId: string | null) =>
    companyId === companyB.id
      ? [otherCompanyProject]
      : [
          {
            ...historicalProject,
            clientDossierId: state.united ? secondClient.id : firstClient.id,
          },
        ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const companyContextId = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      if (path.endsWith('/access/current-actor'))
        return respond(actorFor(companyContextId ?? companyA.id));
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log')) return respond({ events: [] });
      if (path.endsWith('/operational-home'))
        return respond({
          companyId: companyContextId ?? companyA.id,
          today: '2026-09-27',
          summaries: [
            { kind: 'active_clients', count: state.united ? 1 : 2 },
            { kind: 'open_projects', count: 1 },
            { kind: 'overdue_tasks', count: 0 },
          ],
        });
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.endsWith('/projects')) {
        state.projectListReads += 1;
        return respond(projectsFor(companyContextId));
      }
      if (path.includes('/projects?clientDossierId=')) {
        state.clientProjectListReads += 1;
        const url = new URL(path, 'http://localhost');
        const clientDossierId = url.searchParams.get('clientDossierId');
        return respond({
          companyId: companyContextId,
          clientDossierId,
          offset: Number(url.searchParams.get('offset') ?? 0),
          pageSize: 25,
          hasMore: false,
          items: projectsFor(companyContextId)
            .filter(
              (project) =>
                (project.clientDossierId ?? project.clientAccountId) ===
                clientDossierId,
            )
            .map((project) => ({
              ...project,
              clientDossierId,
              responsible: {
                workspaceMembershipId: membershipId,
                displayLabel: 'Recorded mission coordinator',
              },
            })),
        });
      }
      if (path.endsWith('/projects?view=mine_open')) {
        state.projectListReads += 1;
        return respond(projectsFor(companyContextId));
      }
      if (isLifecycleRead(path)) return respond(preparatoryLifecycle);
      if (path.endsWith('/tasks')) return respond({ mutable: true, tasks: [] });
      if (path.endsWith('/eligible-task-assignees'))
        return respond({ members: [] });
      const openedProject = projectsFor(companyContextId).find((project) =>
        path.endsWith(`/projects/${project.id}`),
      );
      if (openedProject) {
        state.projectDetailReads += 1;
        return respond(openedProject);
      }
      if (path.endsWith('/union-reviews')) return respond(comparison, 201);
      if (path.endsWith('/confirm')) {
        state.united = true;
        return respond(
          {
            outcome: 'united',
            canonicalClientId: secondClient.id,
            projectionReference,
          },
          201,
        );
      }
      if (path.endsWith('/union-history'))
        return respond({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference,
              companyId: companyA.id,
            },
          ],
          detailReferences: [projectionReference],
        });
      if (path.endsWith(`/client-union-operations/${projectionReference}`))
        return respond({
          state: 'united',
          projectionReference,
          canonicalClientId: secondClient.id,
          originals: [firstClient, secondClient],
          companies: [companyA],
          reason: 'Same verified legal identity.',
          occurredAt: '2026-09-20T12:00:00.000Z',
          actor: { displayName: 'Resolver' },
          reversal: null,
          canReverse: true,
        });
      if (path.endsWith(`/${projectionReference}/reversal`)) {
        state.united = false;
        return respond(
          { outcome: 'reversed', clientIds: [firstClient.id, secondClient.id] },
          201,
        );
      }
      if (path.endsWith('/clients'))
        return respond(
          (state.united ? [secondClient] : [firstClient, secondClient]).map(
            (client) => ({ ...client, relatedToActiveCompany: true }),
          ),
        );
      const dossier = [firstClient, secondClient].find((client) =>
        path.endsWith(`/clients/${client.id}`),
      );
      if (dossier)
        return respond({
          ...dossier,
          relatedToActiveCompany: true,
          involvedCompanyDisplayNames: [companyA.displayName],
        });
      if (path.endsWith('/legal-entities'))
        return respond({ clientVersion: 1, legalEntities: [] });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

function navigation() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}
function navigateTo(label: string) {
  fireEvent.click(within(navigation()).getByRole('link', { name: label }));
}
function projectsRegion() {
  return screen.getByRole('region', { name: 'Projects' });
}
function projectRows() {
  return within(
    within(projectsRegion()).getByRole('list', { name: 'Projects' }),
  )
    .queryAllByRole('button')
    .map((button) => button.textContent);
}
function projectSearch() {
  return within(projectsRegion()).getByRole('searchbox', {
    name: 'Find Projects',
  });
}
function taskTitle() {
  return within(
    within(projectsRegion()).getByRole('region', { name: 'Tasks' }),
  ).getByLabelText('Task title');
}
async function openProjectWithTaskDraft() {
  await screen.findByRole('navigation', { name: 'Primary navigation' });
  navigateTo('Projects');
  fireEvent.click(
    await within(projectsRegion()).findByRole('button', {
      name: historicalRow,
    }),
  );
  await within(projectsRegion()).findByRole('article', {
    name: historicalProject.title,
  });
  changeValue(await waitFor(taskTitle), taskDraft);
}
async function openDossier(displayName: string) {
  navigateTo('Clients');
  const heading = await screen.findByRole('heading', { name: displayName });
  const row = heading.closest('li');
  if (!row) throw new Error(`Expected a directory row for ${displayName}`);
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
  return screen.findByRole('region', { name: displayName });
}
function openClientProjects(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier).getByRole('button', { name: 'Open Client Projects' }),
  );
}
async function uniteFirstIntoSecond(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier.parentElement ?? dossier).getByRole('button', {
      name: 'Review existing duplicates',
    }),
  );
  const form = await screen.findByRole('form', { name: 'Confirm union' });
  for (const select of within(form).getAllByRole('combobox'))
    changeValue(select, secondClient.id);
  changeValue(
    within(form).getByLabelText('Reason for this union'),
    'Reviewed both saved dossiers.',
  );
  for (const checkbox of within(form).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
  fireEvent.submit(form);
  return screen.findByRole('region', { name: secondClient.displayName });
}
async function reverseUnion(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier.parentElement ?? dossier).getByRole('button', {
      name: 'Union history',
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'View authorized union details',
    }),
  );
  const reversal = await screen.findByRole('form', { name: 'Reverse union' });
  changeValue(
    within(reversal).getByLabelText('Reason for reversal'),
    'Restore the separate dossiers deliberately.',
  );
  fireEvent.click(within(reversal).getByRole('checkbox'));
  fireEvent.click(
    within(reversal).getByRole('button', { name: 'Reverse union' }),
  );
}
async function returnToCurrentDossier(displayName: string) {
  const projects = projectsRegion();
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: 'Open Client dossier',
    }),
  );
  return screen.findByRole('region', { name: displayName });
}

// jsdom does not implement scrolling. The real scroll, focus and Prisme frame
// behaviour is proven by the browser specs; the lighter Classic frame keeps
// these long journeys within the default test timeout.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Client dossier and Project navigation through App', () => {
  beforeEach(() => {
    resetCurrentWorkApp();
    scrollable.scrollIntoView = vi.fn();
    window.history.replaceState(null, '', '/?frame=classic#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it.each(
    ['directory', 'Task preview'].flatMap((owner) =>
      ['company', 'workspace', 'workspace denial'].map((recovery) => ({
        owner,
        recovery,
      })),
    ),
  )(
    'completes current $owner $recovery recovery under the actual StrictMode root',
    async ({ owner, recovery }) => {
      installTransport();
      const original = fetch;
      let denied = false;
      const recoveries: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
          const url = new URL(String(input), window.location.origin);
          if (denied && url.pathname.endsWith('/access/current-actor')) {
            const selected = new Headers(init.headers).has(
              'x-company-context-id',
            );
            recoveries.push(selected ? 'company' : 'workspace');
            if (selected && recovery !== 'company') return respond({}, 403);
            if (recovery === 'workspace denial') return respond({}, 403);
            const actor = actorFor(companyA.id);
            actor.displayName = 'Current Client recovery Actor';
            if (recovery === 'company' && actor.activeCompany)
              actor.activeCompany.taskPermissions = [];
            else delete actor.activeCompany;
            return respond(actor);
          }
          if (
            denied &&
            recovery === 'company' &&
            url.pathname.endsWith('/operational-home')
          )
            return respond({
              companyId: companyA.id,
              today: '2026-09-27',
              summaries: [
                { kind: 'active_clients', count: 2 },
                { kind: 'open_projects', count: 1 },
              ],
            });
          if (
            denied &&
            (owner === 'directory'
              ? url.pathname === '/api/projects' &&
                url.searchParams.has('clientDossierId')
              : url.pathname === `/api/projects/${historicalProject.id}/tasks`)
          )
            return respond({}, 403);
          return original(input, init);
        }),
      );
      render(<App identity={deterministicBrowserIdentity()} />, {
        reactStrictMode: true,
      });
      await screen.findByRole('navigation', { name: 'Primary navigation' });
      const dossier = await openDossier(firstClient.displayName);
      const missions = await within(dossier).findByRole('region', {
        name: 'Client missions',
      });
      if (owner === 'Task preview') {
        fireEvent.click(
          await within(missions).findByRole('button', {
            name: `View Tasks: ${historicalProject.title}`,
          }),
        );
        await within(missions).findByText(
          'No manual Tasks for this Project yet.',
        );
      }
      denied = true;
      fireEvent.click(
        within(missions).getByRole('button', {
          name:
            owner === 'directory'
              ? 'Refresh missions from beginning'
              : 'Reload Tasks',
        }),
      );
      if (recovery === 'workspace denial') {
        await screen.findByText('Your access to this workspace is inactive.');
        expect(
          screen.queryByRole('navigation', { name: 'Primary navigation' }),
        ).toBeNull();
      } else {
        if (recovery === 'company') {
          await screen.findAllByText('Current Client recovery Actor');
          expect(
            within(missions).queryByRole('region', {
              name: `Tasks for: ${historicalProject.title}`,
            }),
          ).toBeNull();
        } else {
          await waitFor(() =>
            expect(
              screen.queryByRole('region', { name: firstClient.displayName }),
            ).toBeNull(),
          );
          // The selected-origin shell rejects a Workspace-only Actor; its
          // established Company rejection still removes Company-bound work.
          expect(
            screen.getByText('Select an active Company to work with Clients.'),
          ).toBeVisible();
        }
      }
      expect(recoveries).toEqual(
        recovery === 'company' ? ['company'] : ['company', 'workspace'],
      );
    },
  );

  it.each(
    ['company', 'workspace'].flatMap((phase) =>
      [200, 403].map((status) => ({ phase, status })),
    ),
  )(
    'retires held Client Task-preview $phase recovery$status after actual unrelated administration without losing native instructions',
    async ({ phase, status }) => {
      installTransport();
      const original = fetch,
        selected = deferred(),
        workspace = deferred();
      let taskStatus = 200,
        holdSelected = false,
        holdWorkspace = false,
        recoveryStarted = false,
        actorReads = 0,
        activityReads = 0,
        selectedSeen = false,
        workspaceSeen = false,
        capture = 'old-content-reader';
      const latestActor = () => {
        const actor = actorFor(companyA.id);
        actor.workspacePermissions = [
          'client.manage',
          'company.assignment.manage',
        ];
        if (actor.activeCompany) {
          actor.activeCompany.documentContentReaderAssignmentId = capture;
          actor.activeCompany.documentContentReaderPermissionSetVersion = 'v1';
          actor.activeCompany.documentPermissions = ['document.content.read'];
        }
        return actor;
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
          const path = new URL(String(input), window.location.origin).pathname;
          if (path.endsWith('/access/current-actor')) {
            actorReads++;
            const company = new Headers(init.headers).has(
              'x-company-context-id',
            );
            if (company && holdSelected) {
              holdSelected = false;
              selectedSeen = true;
              return selected.promise;
            }
            if (!company && holdWorkspace) {
              holdWorkspace = false;
              workspaceSeen = true;
              return workspace.promise;
            }
            const actor = latestActor();
            if (!company && recoveryStarted) delete actor.activeCompany;
            return respond(actor);
          }
          if (path.endsWith('/company-context-assignments/administration'))
            return respond({
              members: [
                {
                  workspaceMembershipId: membershipId,
                  displayName: 'Resolver',
                  email: 'resolver@example.test',
                },
              ],
              companies: [companyA, companyB],
              assignments: [],
            });
          if (
            path.endsWith('/company-document-content-reader-assignments') &&
            init.method === 'POST'
          ) {
            capture = 'new-content-reader';
            return respond({ id: capture }, 201);
          }
          if (path.endsWith('/activity-log')) {
            activityReads++;
            return respond({ events: [] });
          }
          if (path === `/api/projects/${historicalProject.id}/tasks`)
            return respond({ mutable: true, tasks: [] }, taskStatus);
          return original(input, init);
        }),
      );
      render(<App identity={deterministicBrowserIdentity()} />);
      await openProjectWithTaskDraft();
      const instructions = within(projectsRegion()).getByLabelText(
        'Task instructions (optional)',
      );
      changeValue(
        instructions,
        'Independent literal instructions during preview recovery\n  Ș / Я / 😀',
      );
      navigateTo('Clients');
      const dossier = await openDossier(firstClient.displayName);
      fireEvent.click(
        await within(dossier).findByRole('button', {
          name: `View Tasks: ${historicalProject.title}`,
        }),
      );
      const preview = await within(dossier).findByRole('region', {
        name: `Tasks for: ${historicalProject.title}`,
      });
      await within(preview).findByText('No manual Tasks for this Project yet.');
      taskStatus = 403;
      holdSelected = true;
      holdWorkspace = phase === 'workspace';
      recoveryStarted = true;
      fireEvent.click(
        within(preview).getByRole('button', { name: 'Reload Tasks' }),
      );
      await waitFor(() => expect(selectedSeen).toBe(true));
      if (phase === 'workspace') {
        await act(async () => selected.resolve(respond({}, 403)));
        await waitFor(() => expect(workspaceSeen).toBe(true));
      }
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(
        within(access).getByLabelText('Workspace member'),
        membershipId,
      );
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        companyA.id,
      );
      changeValue(
        within(access).getByLabelText('Access bundle'),
        'document-content-reader',
      );
      fireEvent.click(
        within(access).getByRole('button', { name: 'Grant access' }),
      );
      await waitFor(() =>
        expect(
          within(access).getByRole('button', { name: 'Grant access' }),
        ).toBeEnabled(),
      );
      expect(capture).toBe('new-content-reader');
      expect(instructions).toBeInTheDocument();
      const before = { actorReads, activityReads };
      const stale = latestActor();
      stale.displayName = 'Retired instructions preview recovery Actor';
      if (phase === 'workspace') delete stale.activeCompany;
      await act(async () => {
        (phase === 'company' ? selected : workspace).resolve(
          respond(status === 200 ? stale : {}, status),
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
      expect({ actorReads, activityReads }).toEqual(before);
      expect(
        screen.queryAllByText(/Retired instructions preview recovery Actor/),
      ).toHaveLength(0);
      expect(instructions).toBeInTheDocument();
      expect(instructions).toHaveValue(
        'Independent literal instructions during preview recovery\n  Ș / Я / 😀',
      );
    },
  );

  it('discovers recorded Client missions inline and opens the exact existing Project', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    const dossier = await openDossier(firstClient.displayName);
    const missions = await within(dossier).findByRole('region', {
      name: 'Client missions',
    });
    expect(
      await within(missions).findByText('Recorded mission coordinator'),
    ).toBeVisible();
    fireEvent.click(
      within(missions).getByRole('button', {
        name: `Open Project: ${historicalProject.title}`,
      }),
    );
    await within(projectsRegion()).findByRole('article', {
      name: historicalProject.title,
    });
    await waitFor(() =>
      expect(
        within(projectsRegion()).getByRole('heading', {
          name: historicalProject.title,
        }),
      ).toHaveFocus(),
    );
    expect(transport.clientProjectListReads).toBe(1);
    expect(transport.projectDetailReads).toBe(1);
    expect(window.location.hash).toBe('#projects');
  });

  it.each([200, 403])(
    'retires the actual inline opening on union before a late %s can affect the newer dossier',
    async (status) => {
      installTransport();
      const originalFetch = globalThis.fetch;
      const held: Array<{
        answer: (value: Response) => void;
        signal: AbortSignal | null | undefined;
      }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          if (input.toString().endsWith(`/projects/${historicalProject.id}`))
            return new Promise<Response>((answer) =>
              held.push({ answer, signal: init?.signal }),
            );
          return originalFetch(input, init);
        }),
      );
      render(<App identity={deterministicBrowserIdentity()} />);
      await screen.findByRole('navigation', { name: 'Primary navigation' });
      const dossier = await openDossier(firstClient.displayName);
      fireEvent.click(
        await within(dossier).findByRole('button', {
          name: `Open Project: ${historicalProject.title}`,
        }),
      );
      await waitFor(() => expect(held).toHaveLength(1));
      navigateTo('Clients');
      const canonical = await uniteFirstIntoSecond(dossier);
      const current = held[0];
      if (!current) throw new Error('Expected held exact opening.');
      expect(current.signal?.aborted).toBe(true);
      await act(async () =>
        current.answer(
          status === 200
            ? respond(historicalProject)
            : new Response(null, { status }),
        ),
      );
      expect(canonical).toBeVisible();
      navigateTo('Projects');
      await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
      expect(
        within(projectsRegion()).queryByRole('article', {
          name: historicalProject.title,
        }),
      ).not.toBeInTheDocument();
    },
  );

  it('lists the superseded Client’s Project from the canonical dossier and returns there, keeping the Task draft', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();
    const instructions = within(projectsRegion()).getByLabelText(
      'Task instructions (optional)',
    );
    changeValue(
      instructions,
      'Independent instructions through union\n  Ș / Я / 😀',
    );
    expect(transport.projectListReads).toBe(1);

    const dossier = await openDossier(firstClient.displayName);
    const canonical = await uniteFirstIntoSecond(dossier);
    openClientProjects(canonical);

    expect(projectSearch()).toHaveValue(secondClient.displayName);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    expect(taskTitle()).toHaveValue(taskDraft);
    expect(instructions).toHaveValue(
      'Independent instructions through union\n  Ș / Я / 😀',
    );
    await returnToCurrentDossier(secondClient.displayName);
    expect(transport.projectListReads).toBe(2);
    expect(transport.projectDetailReads).toBe(2);

    navigateTo('Projects');
    expect(taskTitle()).toHaveValue(taskDraft);
  });

  it('lists the Project again under the restored Client after a reversal, keeping the Task draft', async () => {
    const transport = installTransport({ united: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();
    const instructions = within(projectsRegion()).getByLabelText(
      'Task instructions (optional)',
    );
    changeValue(
      instructions,
      'Independent instructions through reversal\n  Ș / Я / 😀',
    );

    const canonical = await openDossier(secondClient.displayName);
    await reverseUnion(canonical);
    const restored = await openDossier(firstClient.displayName);
    openClientProjects(restored);

    expect(projectSearch()).toHaveValue(firstClient.displayName);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    expect(taskTitle()).toHaveValue(taskDraft);
    expect(instructions).toHaveValue(
      'Independent instructions through reversal\n  Ș / Я / 😀',
    );
    await returnToCurrentDossier(firstClient.displayName);
    expect(transport.projectListReads).toBe(2);
    expect(transport.projectDetailReads).toBe(2);
  });

  it('retires a Project restriction applied before the union and adds no read for navigation alone', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    const dossier = await openDossier(firstClient.displayName);
    openClientProjects(dossier);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    navigateTo('Clients');
    openClientProjects(dossier);
    expect(transport.projectListReads).toBe(1);

    navigateTo('Clients');
    await uniteFirstIntoSecond(dossier);
    navigateTo('Projects');

    expect(projectSearch()).toHaveValue('');
    await waitFor(() => expect(transport.projectListReads).toBe(2));
    expect(projectRows()).toEqual([historicalRow]);
  });

  it('opens the Project list from the Company summary without the Client restriction App holds', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    const dossier = await openDossier(firstClient.displayName);
    openClientProjects(dossier);
    expect(projectSearch()).toHaveValue(firstClient.displayName);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Open Projects: 1. Open the Project list',
      }),
    );
    await waitFor(() => expect(projectSearch()).toHaveValue(''));
    expect(projectRows()).toEqual([historicalRow]);
    expect(transport.projectListReads).toBe(1);
  });

  it('does not restore a previous Company’s Project restriction when the member returns to that Company', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('navigation', { name: 'Primary navigation' });
    const dossier = await openDossier(firstClient.displayName);
    openClientProjects(dossier);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));

    const company = screen.getByLabelText('Active Company', { exact: true });
    changeValue(company, companyB.id);
    await waitFor(() =>
      expect(projectRows()).toEqual([
        `${otherCompanyProject.title} Client: ${otherCompanyProject.clientDisplayName}`,
      ]),
    );
    expect(projectSearch()).toHaveValue('');
    changeValue(company, companyA.id);

    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    expect(projectSearch()).toHaveValue('');
  });

  it.each(['Home', 'Client'] as const)(
    'returns Mine to All and open-only through the actual %s directory intent',
    async (source) => {
      installTransport();
      render(<App identity={deterministicBrowserIdentity()} />);
      await screen.findByRole('navigation', { name: 'Primary navigation' });
      const dossier = await openDossier(firstClient.displayName);
      openClientProjects(dossier);
      await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
      const view = within(projectsRegion()).getByRole('combobox', {
        name: 'Project view',
      });
      const closed = within(projectsRegion()).getByRole('checkbox', {
        name: 'Include closed Projects',
      });
      fireEvent.click(closed);
      expect(closed).toBeChecked();
      changeValue(view, 'mine_open');
      await waitFor(() => expect(view).toHaveTextContent('My open Projects'));
      if (source === 'Home')
        fireEvent.click(
          await screen.findByRole('button', {
            name: 'Open Projects: 1. Open the Project list',
          }),
        );
      else {
        navigateTo('Clients');
        openClientProjects(dossier);
      }
      await waitFor(() => expect(view).toHaveTextContent('All Projects'));
      expect(
        within(projectsRegion()).getByRole('checkbox', {
          name: 'Include closed Projects',
        }),
      ).not.toBeChecked();
      expect(projectSearch()).toHaveValue(
        source === 'Home' ? '' : firstClient.displayName,
      );
      await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    },
  );
});
