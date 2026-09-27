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
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project/project-lifecycle.test-fixtures';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const membershipId = 'membership-1';
const client = {
  id: 'client-demo',
  version: 1,
  displayName: 'Synthetic demo Client',
  taxId: 'DEMO-363',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const project = {
  id: 'project-demo',
  companyId: companyA.id,
  clientAccountId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: 'Pregătire demo',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const projectRow = `${project.title} Client: ${project.clientDisplayName}`;
const sharedTitle = 'Chestionar demo';
const unlinkedDocument = {
  id: 'document-unlinked',
  companyId: companyA.id,
  clientId: client.id,
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: sharedTitle,
  purpose: 'Prepare a different interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-18T08:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version-unlinked',
    status: 'draft',
    representation: {
      id: 'representation-unlinked',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'denied',
    },
  },
};
const linkedDocument = {
  ...unlinkedDocument,
  id: 'document-linked',
  purpose: 'Prepare the linked demo interview',
  createdAt: '2026-09-20T09:30:00.000Z',
  version: {
    ...unlinkedDocument.version,
    id: 'version-linked',
    representation: {
      ...unlinkedDocument.version.representation,
      id: 'representation-linked',
    },
  },
};
/** What the Project read carried; the Documents section must never show it. */
const projectResponsePurpose = 'Purpose as read by the Project';
const taskDraft = 'Keep this Task draft across the Document open';

function actorFor(companyId: string, administrator: boolean): ActorContext {
  return {
    internalUserId: 'preparer',
    workspaceMembershipId: membershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Preparer',
    email: 'preparer@example.test',
    active: true,
    workspacePermissions: administrator
      ? ['client.manage', 'company.assignment.manage']
      : ['client.manage'],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
      projectPermissions: ['project.read'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-assignment-1',
      taskPermissionSetVersion: 'v1',
      documentPermissions: ['document.read'],
    },
  };
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function installTransport(
  options: { administrator?: boolean; holdLinkedRead?: boolean } = {},
) {
  const state = {
    detailReads: new Map<string, number>(),
    heldLinkedReads: [] as Array<ReturnType<typeof deferredResponse>>,
    grants: 0,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const companyContextId = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      const inCompanyA = companyContextId !== companyB.id;
      if (path.endsWith('/access/current-actor'))
        return respond(
          actorFor(companyContextId ?? companyA.id, !!options.administrator),
        );
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log')) return respond({ events: [] });
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.endsWith('/company-context-assignments/administration'))
        return respond({
          members: [
            {
              workspaceMembershipId: membershipId,
              displayName: 'Preparer',
              email: 'preparer@example.test',
            },
          ],
          companies: [companyA],
          assignments: [],
        });
      if (path.endsWith('/company-director-client-assignments')) {
        state.grants += 1;
        return respond({ id: `assignment-grant-${state.grants}` }, 201);
      }
      if (path.endsWith('/assigned-tasks')) return respond({ tasks: [] });
      if (isLifecycleRead(path)) return respond(preparatoryLifecycle);
      if (path.endsWith('/clients'))
        return respond([{ ...client, relatedToActiveCompany: true }]);
      if (path.endsWith('/projects'))
        return respond(inCompanyA ? [project] : []);
      if (path.endsWith(`/projects/${project.id}`)) return respond(project);
      if (path.endsWith(`/projects/${project.id}/tasks`))
        return respond({ mutable: true, tasks: [] });
      if (path.endsWith(`/projects/${project.id}/eligible-task-assignees`))
        return respond({ members: [] });
      if (path.endsWith(`/projects/${project.id}/documents`))
        return respond({
          mutable: true,
          documents: [
            {
              document: { ...linkedDocument, purpose: projectResponsePurpose },
              revision: 1,
            },
          ],
        });
      if (path.endsWith('/documents'))
        return respond(inCompanyA ? [unlinkedDocument, linkedDocument] : []);
      const opened = [unlinkedDocument, linkedDocument].find((candidate) =>
        path.endsWith(`/documents/${candidate.id}`),
      );
      if (opened) {
        state.detailReads.set(
          opened.id,
          (state.detailReads.get(opened.id) ?? 0) + 1,
        );
        if (opened === linkedDocument && options.holdLinkedRead) {
          const held = deferredResponse();
          state.heldLinkedReads.push(held);
          return held.promise;
        }
        return respond(opened);
      }
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
/** The Documents section, not the Project's panel sharing its accessible name. */
function documentsSection() {
  const section = screen
    .getAllByRole('region', { name: 'Working Documents' })
    .find((region) => region.id === 'documents');
  if (!section) throw new Error('Expected the Documents section.');
  return section;
}
function taskTitle() {
  return within(
    within(projectsRegion()).getByRole('region', { name: 'Tasks' }),
  ).getByLabelText('Task title');
}
async function openProjectWithTaskDraft() {
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', { name: projectRow }),
  );
  await within(projectsRegion()).findByRole('article', { name: project.title });
  changeValue(await waitFor(taskTitle), taskDraft);
}
async function openLinkedDocument() {
  const panel = within(projectsRegion()).getByRole('region', {
    name: 'Working Documents',
  });
  const row = (
    await within(panel).findByRole('heading', { name: sharedTitle })
  ).closest('li');
  if (!row) throw new Error('Expected the linked Document row.');
  fireEvent.click(within(row).getByRole('button', { name: 'Open Document' }));
}

// jsdom does not implement scrolling; the browser specs prove the real
// scroll, focus and frame behaviour.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

describe('Project detail and working Document navigation through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
    // The Prisme overview renders the motion hero once the frame is left.
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
    window.history.replaceState(null, '', '/?frame=classic#projects');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it('opens the exact linked Document from its own read and keeps the Task draft', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();

    await openLinkedDocument();

    const detail = await within(documentsSection()).findByRole('article');
    expect(
      within(detail).getByRole('heading', { name: sharedTitle }),
    ).toBeInTheDocument();
    expect(within(detail).getByText(linkedDocument.purpose)).toBeVisible();
    expect(within(detail).getByText('Registration time')).toBeVisible();
    expect(
      within(documentsSection()).queryByText(projectResponsePurpose),
    ).not.toBeInTheDocument();
    expect(
      within(documentsSection()).queryByText(unlinkedDocument.purpose),
    ).not.toBeInTheDocument();
    expect(transport.detailReads.get(linkedDocument.id)).toBe(1);
    expect(transport.detailReads.has(unlinkedDocument.id)).toBe(false);
    await waitFor(() => expect(documentsSection()).toHaveFocus());
    // The target travels only through the shell's in-memory intent.
    expect(window.location.hash).toBe('#documents');
    expect(window.location.href).not.toContain(linkedDocument.id);
    expect(JSON.stringify(window.history.state ?? null)).not.toContain(
      linkedDocument.id,
    );
    expect(documentsSection().textContent).not.toContain(linkedDocument.id);

    navigateTo('Projects');
    expect(taskTitle()).toHaveValue(taskDraft);
    expect(
      within(projectsRegion()).getByRole('article', { name: project.title }),
    ).toBeInTheDocument();

    // Activating the same Document again reads it afresh.
    await openLinkedDocument();
    await waitFor(() =>
      expect(transport.detailReads.get(linkedDocument.id)).toBe(2),
    );
    expect(transport.detailReads.has(unlinkedDocument.id)).toBe(false);
  });

  it('never applies a request its Company retired, even after returning to that Company', async () => {
    const transport = installTransport({ holdLinkedRead: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();
    await openLinkedDocument();
    await waitFor(() => expect(transport.heldLinkedReads).toHaveLength(1));

    const company = screen.getByLabelText('Active Company', { exact: true });
    changeValue(company, companyB.id);
    // Each Company mounts its own Documents section; query it afresh.
    await waitFor(() =>
      expect(
        within(documentsSection()).getByText(
          'No working references registered yet.',
        ),
      ).toBeInTheDocument(),
    );
    expect(within(projectsRegion()).queryByRole('article')).toBeNull();
    transport.heldLinkedReads[0]?.resolve(respond(linkedDocument));
    changeValue(company, companyA.id);

    await waitFor(() =>
      expect(
        within(documentsSection()).getAllByRole('button', {
          name: sharedTitle,
        }),
      ).toHaveLength(2),
    );
    expect(within(documentsSection()).queryByRole('article')).toBeNull();
    expect(transport.detailReads.get(linkedDocument.id)).toBe(1);
  });

  it('never applies a request after a Client authority change', async () => {
    const transport = installTransport({
      administrator: true,
      holdLinkedRead: true,
    });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openProjectWithTaskDraft();
    await openLinkedDocument();
    await waitFor(() => expect(transport.heldLinkedReads).toHaveLength(1));

    const access = screen.getByRole('region', { name: 'Company access' });
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
      'director-client',
    );
    fireEvent.click(
      within(access).getByRole('button', { name: 'Grant access' }),
    );
    await screen.findByText('Access granted. Server state refreshed.');
    transport.heldLinkedReads[0]?.resolve(respond(linkedDocument));

    await waitFor(() =>
      expect(
        within(documentsSection()).getAllByRole('button', {
          name: sharedTitle,
        }),
      ).toHaveLength(2),
    );
    expect(within(documentsSection()).queryByRole('article')).toBeNull();
    expect(transport.detailReads.get(linkedDocument.id)).toBe(1);
  });
});
