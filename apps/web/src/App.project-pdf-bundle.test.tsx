import { useInterfaceLocale } from './localization/interface-locale';
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
import {
  isLifecycleRead,
  preparatoryLifecycle,
} from './project/project-lifecycle.test-fixtures';
import { changeValue } from './test/select-option';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { id: id(1), displayName: 'Company A' };
const companyB = { id: id(2), displayName: 'Company B' };
const project = {
  id: id(3),
  companyId: company.id,
  clientAccountId: id(4),
  clientDisplayName: 'Client DEMO',
  title: 'Project DEMO',
  status: 'preparatory',
  createdAt: '2026-10-28T08:00:00.000Z',
};
const document = {
  id: id(5),
  companyId: company.id,
  clientId: id(4),
  clientDisplayName: 'Client DEMO',
  title: 'Literal Șablon DEMO',
  purpose: 'Known originals',
  type: 'mission-deliverable',
  confidentiality: 'company-confidential',
  createdAt: '2026-10-28T08:00:00.000Z',
  workingRevision: 2,
  correction: 'allowed',
  version: { id: id(6), status: 'draft', representation: null },
};
const pdf = {
  state: 'stored',
  access: 'granted',
  representationId: id(7),
  revision: 2,
  fileName: 'original-șablon.pdf',
  mediaType: 'application/pdf',
  size: 405,
  sha256: 'b'.repeat(64),
  storedAt: '2026-10-28T08:00:00.000Z',
  storedBy: { displayName: 'Ada' },
  scan: {
    outcome: 'clean',
    engine: 'fixture',
    scannedAt: '2026-10-28T08:00:00.000Z',
  },
};
const versions = {
  workingRevision: 2,
  mutable: true,
  versions: [
    {
      id: id(6),
      number: 1,
      status: 'draft',
      createdAt: '2026-10-28T08:00:00.000Z',
      createdBy: { displayName: 'Ada' },
      representations: [],
      pdfContent: pdf,
    },
  ],
};
function actorFor(companyId = company.id): ActorContext {
  return {
    internalUserId: id(8),
    workspaceMembershipId: id(9),
    workspaceId: id(10),
    workspaceName: 'Workspace',
    displayName: 'Ada',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: ['client.manage', 'company.assignment.manage'],
    activeCompany: {
      ...(companyId === company.id ? company : companyB),
      clientPermissions: ['client.read'],
      projectPermissions: ['project.read'],
      projectPermissionAssignmentId: id(11),
      projectPermissionSetVersion: 'v2',
      documentPermissions: [
        'document.read',
        'document.reference.read',
        'document.content.read',
        'document.mission_deliverable.access',
      ],
      documentPermissionAssignmentId: id(12),
      documentPermissionSetVersion: 'v3',
      documentContentReaderAssignmentId: id(13),
      documentContentReaderPermissionSetVersion: 'v1',
      missionDeliverableAccessAssignmentId: id(14),
      missionDeliverableAccessPermissionSetVersion: 'v1',
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: id(15),
      taskPermissionSetVersion: 'v1',
    },
  };
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function requestedItems(payload: string): Record<string, unknown>[] {
  const value: unknown = JSON.parse(payload);
  if (
    !value ||
    typeof value !== 'object' ||
    !('items' in value) ||
    !Array.isArray(value.items)
  )
    throw new Error('Expected selection');
  return value.items.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Expected selected item');
    return Object.fromEntries(Object.entries(item));
  });
}
function deferred() {
  let resolve: (r: Response) => void = () => {
    throw new Error('Not initialized');
  };
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function install() {
  const state: {
    reads: number;
    downloads: string[];
    versionValue: unknown;
    held: ReturnType<typeof deferred> | undefined;
    status: number;
    versionStatus: number;
    associationValue: unknown;
    malformedArchive: boolean;
    readerId: string;
    taskPosts: Array<{ body: string; key: string | null }>;
    taskHold: ReturnType<typeof deferred> | undefined;
  } = {
    reads: 0,
    downloads: [],
    versionValue: versions,
    held: undefined,
    status: 200,
    versionStatus: 200,
    associationValue: undefined,
    malformedArchive: false,
    readerId: id(13),
    taskPosts: [],
    taskHold: undefined,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const companyId =
        new Headers(init?.headers).get('x-company-context-id') ?? company.id;
      if (path.endsWith('/access/current-actor')) {
        const actor = actorFor(companyId);
        if (actor.activeCompany)
          actor.activeCompany.documentContentReaderAssignmentId =
            state.readerId;
        return response(actor);
      }
      if (path.endsWith('/company-context-assignments/administration'))
        return response({
          members: [
            {
              workspaceMembershipId: id(9),
              displayName: 'Ada',
              email: 'ada@example.test',
            },
          ],
          companies: [company, companyB],
          assignments: [],
        });
      if (path.endsWith('/company-document-content-reader-assignments'))
        return response({ id: state.readerId }, 201);
      if (path.endsWith('/companies')) return response([company, companyB]);
      if (path.endsWith('/activity-log')) return response({ events: [] });
      if (path.endsWith('/assigned-tasks')) return response({ tasks: [] });
      if (isLifecycleRead(path)) return response(preparatoryLifecycle);
      if (path.endsWith('/clients'))
        return response([
          {
            id: id(4),
            displayName: 'Client DEMO',
            relatedToActiveCompany: true,
          },
        ]);
      if (path.endsWith('/projects'))
        return response([
          project,
          { ...project, id: id(30), title: 'Other Project DEMO' },
        ]);
      if (path.endsWith(`/projects/${id(30)}`))
        return response({
          ...project,
          id: id(30),
          title: 'Other Project DEMO',
        });
      if (path.endsWith(`/projects/${project.id}`)) return response(project);
      if (path.endsWith('/tasks') && init?.method === 'POST') {
        state.taskPosts.push({
          body: String(init.body),
          key: new Headers(init.headers).get('idempotency-key'),
        });
        return state.taskHold ? state.taskHold.promise : response({}, 500);
      }
      if (path.endsWith('/tasks'))
        return response({ mutable: true, tasks: [] });
      if (path.endsWith('/eligible-task-assignees'))
        return response({ members: [] });
      if (
        path.endsWith(`/projects/${project.id}/documents`) ||
        path.endsWith(`/projects/${id(30)}/documents`)
      )
        return response(
          state.associationValue === undefined
            ? { mutable: true, documents: [{ document, revision: 1 }] }
            : state.associationValue,
        );
      if (path.endsWith(`/documents/${document.id}/versions`)) {
        state.reads++;
        return state.held
          ? state.held.promise
          : response(state.versionValue, state.versionStatus);
      }
      if (path.endsWith('/pdf-bundle')) {
        state.downloads.push(String(init?.body));
        return state.held
          ? state.held.promise
          : state.status === 200
            ? new Response(new Uint8Array([80, 75, 3, 4, 1]), {
                headers: {
                  'content-type': state.malformedArchive
                    ? 'application/json'
                    : 'application/zip',
                },
              })
            : response({}, state.status);
      }
      throw new Error('Unexpected request ' + path);
    }),
  );
  return state;
}
function LocaleProbe() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] as const).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Change to {locale}
        </button>
      ))}
    </>
  );
}
async function open() {
  const nav = await screen.findByRole('navigation', {
    name: 'Primary navigation',
  });
  fireEvent.click(within(nav).getByRole('link', { name: 'Projects' }));
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: 'Project DEMO Client: Client DEMO',
    }),
  );
  await within(projects).findByRole('article', { name: 'Project DEMO' });
  const tab = within(projects).queryByRole('tab', {
    name: 'Working Documents',
  });
  if (tab) fireEvent.click(tab);
  return screen.findByRole('region', { name: 'Selected Project PDFs' });
}
async function choose(panel: HTMLElement) {
  fireEvent.click(within(panel).getByRole('button', { name: 'Choose PDFs' }));
  fireEvent.click(
    await within(panel).findByRole('button', { name: /Load PDF Versions/ }),
  );
  fireEvent.click(
    await within(panel).findByRole('button', { name: /Select.*Version 1/ }),
  );
}
const scrolling: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScroll = scrolling.scrollIntoView;
describe('Selected Project PDFs through actual App HTTP', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/?frame=classic#projects');
    scrolling.scrollIntoView = vi.fn();
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
    scrolling.scrollIntoView = nativeScroll;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('requires deliberate Version discovery and exact selection before an explicit download', async () => {
    const state = install();
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    expect(state.reads).toBe(0);
    expect(state.downloads).toHaveLength(0);
    await choose(panel);
    expect(state.reads).toBe(1);
    const urls = vi.fn(() => 'blob:selected');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: urls,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    );
    await waitFor(() => expect(urls).toHaveBeenCalledOnce());
    expect(JSON.parse(state.downloads[0] ?? '')).toEqual({
      items: [
        {
          documentId: document.id,
          versionId: id(6),
          representationId: id(7),
          expectedProjectRevision: 1,
        },
      ],
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Clear PDF selection' }),
    );
    expect(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    ).toBeDisabled();
  });
  it.each([500, 413, 409] as const)(
    'preserves deliberate retry intent and reports %s safely',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await open();
      await choose(panel);
      state.status = status;
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Download selected PDFs' }),
      );
      await within(panel).findByRole('alert');
      expect(state.downloads).toHaveLength(1);
      if (status === 409) {
        expect(
          within(panel).getByRole('button', { name: 'Download selected PDFs' }),
        ).toBeDisabled();
        fireEvent.click(
          within(panel).getByRole('button', { name: 'Reload PDF choices' }),
        );
        await within(panel).findByRole('button', { name: /Load PDF Versions/ });
        expect(
          within(panel).getByRole('button', { name: 'Download selected PDFs' }),
        ).toBeDisabled();
      } else {
        fireEvent.click(
          within(panel).getByRole('button', { name: 'Download selected PDFs' }),
        );
        await waitFor(() => expect(state.downloads).toHaveLength(2));
        expect(state.downloads[1]).toBe(state.downloads[0]);
      }
    },
  );
  it('rejects the entire malformed Versions read before showing any selectable good prefix', async () => {
    const state = install();
    state.versionValue = {
      ...versions,
      versions: [versions.versions[0], { ...versions.versions[0], number: 0 }],
    };
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Choose PDFs' }));
    fireEvent.click(
      await within(panel).findByRole('button', { name: /Load PDF Versions/ }),
    );
    await within(panel).findByText(
      'The PDF choices could not be validated. Reload to try again.',
    );
    expect(
      within(panel).queryByRole('button', { name: /Select.*Version/ }),
    ).toBeNull();
  });
  it('keeps literal selection, focus and held reads through every locale without I/O', async () => {
    const state = install();
    render(
      <>
        <LocaleProbe />
        <App identity={deterministicBrowserIdentity()} />
      </>,
    );
    const panel = await open();
    await choose(panel);
    const selected = within(panel).getByRole('button', {
      name: 'Clear PDF selection',
    });
    selected.focus();
    const calls = vi.mocked(fetch).mock.calls.length;
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      fireEvent.click(
        screen.getByRole('button', { name: `Change to ${locale}` }),
      );
      expect(selected).toHaveFocus();
      expect(panel.textContent).toContain('original-șablon.pdf');
      expect(panel.textContent).toContain('Literal Șablon DEMO');
      expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
    }
    state.held = deferred();
    fireEvent.click(
      within(panel).getByRole('button', { name: /Load PDF Versions/ }),
    );
    await waitFor(() => expect(state.reads).toBe(2));
    const heldCalls = vi.mocked(fetch).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Change to fr' }));
    expect(vi.mocked(fetch).mock.calls).toHaveLength(heldCalls);
    await act(async () => state.held?.resolve(response(versions)));
    expect(
      await within(panel).findByRole('button', {
        name: /Sélectionner.*Version 1/,
      }),
    ).toBeDisabled();
  });
  it.each([200, 403] as const)(
    'never clicks a held late%s download after Company A→B→A',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      let panel = await open();
      await choose(panel);
      state.held = deferred();
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Download selected PDFs' }),
      );
      await waitFor(() => expect(state.downloads).toHaveLength(1));
      const selector = screen.getByLabelText('Active Company', { exact: true });
      changeValue(selector, companyB.id);
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Selected Project PDFs' }),
        ).toBeNull(),
      );
      changeValue(selector, company.id);
      panel = await open();
      await act(async () =>
        state.held?.resolve(
          status === 200
            ? new Response(new Uint8Array([80, 75, 3, 4, 1]), {
                headers: { 'content-type': 'application/zip' },
              })
            : response({}, 403),
        ),
      );
      expect(clicked).not.toHaveBeenCalled();
      expect(
        within(panel).getByRole('button', { name: 'Choose PDFs' }),
      ).toBeEnabled();
    },
  );
  it.each(['pending', 'uncertain'] as const)(
    'preserves an independent native Task %s exact intent while collecting',
    async (mode) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await open();
      const title = await screen.findByLabelText('Task title');
      changeValue(title, 'Independent exact Task DEMO');
      if (mode === 'pending') state.taskHold = deferred();
      fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
      await waitFor(() => expect(state.taskPosts).toHaveLength(1));
      await choose(panel);
      expect(title).toHaveValue('Independent exact Task DEMO');
      expect(state.taskPosts).toHaveLength(1);
      if (mode === 'pending')
        await act(async () => state.taskHold?.resolve(response({}, 500)));
      const retry = await screen.findByRole('button', {
        name: 'Retry pending Task change',
      });
      fireEvent.click(retry);
      await waitFor(() => expect(state.taskPosts).toHaveLength(2));
      expect(state.taskPosts[1]).toEqual(state.taskPosts[0]);
    },
  );
  it.each([200, 403] as const)(
    'retires a held late%s response permanently across a consumed grant A→B→A',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      let panel = await open();
      await choose(panel);
      state.held = deferred();
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Download selected PDFs' }),
      );
      await waitFor(() => expect(state.downloads).toHaveLength(1));
      const access = await screen.findByRole('region', {
        name: 'Company access',
      });
      changeValue(within(access).getByLabelText('Workspace member'), id(9));
      changeValue(
        within(access).getByLabelText('Company', { exact: true }),
        company.id,
      );
      changeValue(
        within(access).getByLabelText('Access bundle'),
        'document-content-reader',
      );
      for (const readerId of [id(90), id(13)]) {
        state.readerId = readerId;
        fireEvent.click(
          within(access).getByRole('button', { name: 'Grant access' }),
        );
        await waitFor(() =>
          expect(
            within(access).getByRole('button', { name: 'Grant access' }),
          ).toBeEnabled(),
        );
        await screen.findByText('Access granted. Server state refreshed.');
        panel = await open();
        expect(
          within(panel).getByRole('button', { name: 'Choose PDFs' }),
        ).toBeEnabled();
      }
      await act(async () =>
        state.held?.resolve(
          status === 200
            ? new Response(new Uint8Array([80, 75, 3, 4, 1]), {
                headers: { 'content-type': 'application/zip' },
              })
            : response({}, 403),
        ),
      );
      expect(clicked).not.toHaveBeenCalled();
      expect(
        within(panel).getByRole('button', { name: 'Choose PDFs' }),
      ).toBeEnabled();
    },
  );
  it.each([200, 403] as const)(
    'retires a held late%s response across Project A→B→A',
    async (status) => {
      const state = install();
      render(<App identity={deterministicBrowserIdentity()} />);
      let panel = await open();
      await choose(panel);
      state.held = deferred();
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Download selected PDFs' }),
      );
      await waitFor(() => expect(state.downloads).toHaveLength(1));
      fireEvent.click(
        screen.getByRole('button', {
          name: 'Other Project DEMO Client: Client DEMO',
        }),
      );
      await screen.findByRole('article', { name: 'Other Project DEMO' });
      panel = await open();
      await act(async () =>
        state.held?.resolve(
          status === 200
            ? new Response(new Uint8Array([80, 75, 3, 4, 1]), {
                headers: { 'content-type': 'application/zip' },
              })
            : response({}, 403),
        ),
      );
      expect(clicked).not.toHaveBeenCalled();
      expect(
        within(panel).getByRole('button', { name: 'Choose PDFs' }),
      ).toBeEnabled();
    },
  );
  it.each([200, 403] as const)(
    'retires a held late%s response across an identity/session A→B→A',
    async (status) => {
      const state = install();
      const identity = deterministicBrowserIdentity();
      const view = render(<App identity={identity} />);
      let panel = await open();
      await choose(panel);
      state.held = deferred();
      const clicked = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Download selected PDFs' }),
      );
      await waitFor(() => expect(state.downloads).toHaveLength(1));
      view.rerender(<App identity={{ ...identity, signedIn: false }} />);
      await waitFor(() =>
        expect(
          screen.queryByRole('region', { name: 'Selected Project PDFs' }),
        ).toBeNull(),
      );
      view.rerender(<App identity={identity} />);
      panel = await open();
      await act(async () =>
        state.held?.resolve(
          status === 200
            ? new Response(new Uint8Array([80, 75, 3, 4, 1]), {
                headers: { 'content-type': 'application/zip' },
              })
            : response({}, 403),
        ),
      );
      expect(clicked).not.toHaveBeenCalled();
      expect(
        within(panel).getByRole('button', { name: 'Choose PDFs' }),
      ).toBeEnabled();
    },
  );
  it.each(['empty', 'absent', 'denied'] as const)(
    'distinguishes %s choices and exposes no invented selection',
    async (kind) => {
      const state = install();
      if (kind === 'empty')
        state.associationValue = { mutable: true, documents: [] };
      else
        state.versionValue = {
          ...versions,
          versions: [
            {
              ...versions.versions[0],
              pdfContent:
                kind === 'absent'
                  ? { state: 'absent' }
                  : { state: 'stored', access: 'denied' },
            },
          ],
        };
      render(<App identity={deterministicBrowserIdentity()} />);
      const panel = await open();
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Choose PDFs' }),
      );
      if (kind === 'empty')
        await within(panel).findByText('No associated Documents.');
      else {
        fireEvent.click(
          await within(panel).findByRole('button', {
            name: /Load PDF Versions/,
          }),
        );
        await within(panel).findByText(
          kind === 'absent'
            ? 'No preserved PDF in these Versions.'
            : 'Current Project, Document, Client, family and PDF read access is required.',
        );
      }
      expect(
        within(panel).queryByRole('button', { name: /Select.*Version/ }),
      ).toBeNull();
      expect(state.downloads).toHaveLength(0);
    },
  );
  it('rejects a malformed later association before exposing the good prefix for selection', async () => {
    const state = install();
    state.associationValue = {
      mutable: true,
      documents: [
        { document, revision: 1 },
        {
          document: { ...document, id: id(55), clientId: id(56) },
          revision: 1,
        },
      ],
    };
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Choose PDFs' }));
    await within(panel).findByText(
      'The PDF choices could not be validated. Reload to try again.',
    );
    expect(
      within(panel).queryByRole('button', { name: /Load PDF Versions/ }),
    ).toBeNull();
    expect(state.reads).toBe(0);
  });
  it('retains the exact earlier draft Representation after a deliberate fresh Version read, until explicitly removed', async () => {
    const state = install();
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    await choose(panel);
    state.versionValue = {
      ...versions,
      workingRevision: 3,
      versions: [
        {
          ...versions.versions[0],
          pdfContent: {
            ...pdf,
            representationId: id(17),
            revision: 3,
            fileName: 'later-original.pdf',
          },
        },
      ],
    };
    fireEvent.click(
      within(panel).getByRole('button', { name: /Load PDF Versions/ }),
    );
    await within(panel).findByText('later-original.pdf');
    state.status = 500;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    );
    await within(panel).findByRole('alert');
    expect(requestedItems(state.downloads[0] ?? '')[0]?.representationId).toBe(
      id(7),
    );
    fireEvent.click(
      within(panel).getByRole('button', {
        name: /Remove selected original-șablon.pdf/,
      }),
    );
    expect(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    ).toBeDisabled();
  });
  it('refuses a malformed ZIP success before creating any download URL and retains explicit retry selection', async () => {
    const state = install();
    state.malformedArchive = true;
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    await choose(panel);
    const created = vi.fn(() => 'blob:unsafe');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: created,
    });
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    );
    await within(panel).findByRole('alert');
    expect(created).not.toHaveBeenCalled();
    expect(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    ).toBeEnabled();
  });
  it('bounds selection to 20 exact Versions and requires an explicit retry after a read server failure', async () => {
    const state = install();
    state.versionStatus = 503;
    render(<App identity={deterministicBrowserIdentity()} />);
    const panel = await open();
    fireEvent.click(within(panel).getByRole('button', { name: 'Choose PDFs' }));
    fireEvent.click(
      await within(panel).findByRole('button', { name: /Load PDF Versions/ }),
    );
    await within(panel).findByText(
      'PDF choices could not be loaded. Reload to try again.',
    );
    expect(state.reads).toBe(1);
    state.versionStatus = 200;
    state.versionValue = {
      workingRevision: 90,
      mutable: true,
      versions: Array.from({ length: 21 }, (_, index) => {
        const number = 21 - index;
        return {
          ...versions.versions[0],
          id: id(200 + number),
          number,
          status:
            number === 21 ? 'draft' : number === 20 ? 'official' : 'superseded',
          designatedAt: pdf.storedAt,
          designatedBy: { displayName: 'Ada' },
          frozen: { title: document.title, purpose: document.purpose },
          supersededAt: pdf.storedAt,
          supersededByVersionNumber: number + 1,
          pdfContent: {
            ...pdf,
            revision: number + 2,
            representationId: id(100 + number),
            fileName: `file-${number}.pdf`,
          },
        };
      }),
    };
    fireEvent.click(
      within(panel).getByRole('button', { name: /Load PDF Versions/ }),
    );
    const choices = await within(panel).findAllByRole('button', {
      name: /Select.*Version/,
    });
    expect(choices).toHaveLength(21);
    for (const choice of choices) fireEvent.click(choice);
    await within(panel).findByText('Select at most 20 Document Versions.');
    expect(
      within(panel).getByRole('heading', { name: 'Selected PDFs (20/20)' }),
    ).toBeVisible();
    state.status = 500;
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Download selected PDFs' }),
    );
    await waitFor(() => expect(state.downloads).toHaveLength(1));
    const payload: unknown = JSON.parse(state.downloads[0] ?? '');
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('items' in payload) ||
      !Array.isArray(payload.items)
    )
      throw new Error('Expected selection');
    expect(payload.items).toHaveLength(20);
    expect(payload.items[0]).toMatchObject({
      versionId: id(221),
      representationId: id(121),
    });
    expect(payload.items.at(-1)).toMatchObject({
      versionId: id(202),
      representationId: id(102),
    });
  });
});
