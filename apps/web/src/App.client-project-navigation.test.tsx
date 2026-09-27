import { changeValue } from './test/select-option';
import {
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
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
    window.history.replaceState(null, '', '/?frame=classic#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('lists the superseded Client’s Project from the canonical dossier and returns there, keeping the Task draft', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();
    expect(transport.projectListReads).toBe(1);

    const dossier = await openDossier(firstClient.displayName);
    const canonical = await uniteFirstIntoSecond(dossier);
    openClientProjects(canonical);

    expect(projectSearch()).toHaveValue(secondClient.displayName);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    expect(taskTitle()).toHaveValue(taskDraft);
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

    const canonical = await openDossier(secondClient.displayName);
    await reverseUnion(canonical);
    const restored = await openDossier(firstClient.displayName);
    openClientProjects(restored);

    expect(projectSearch()).toHaveValue(firstClient.displayName);
    await waitFor(() => expect(projectRows()).toEqual([historicalRow]));
    expect(taskTitle()).toHaveValue(taskDraft);
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
});
