import { render as renderWithoutLocale } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApplicationRoot } from './ApplicationRoot';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from './access-composition';
import type { ActorContext } from './access-types';
import { companyGrants } from './access/company-grants.test-fixture';
import { interfacePreferenceStorageKey } from './clarte/interface-preference';
import { interfaceLocaleStorageKey } from './localization/interface-locale';
import {
  paymentEvidenceActor,
  paymentEvidenceDocument,
  paymentEvidenceIds as ids,
} from './payment-evidence/payment-evidence.test-fixture';
import { appInterfaces, renderInInterface } from './test/app-interface';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { changeValue, selectOption } from './test/select-option';

type Company = Readonly<{ id: string; displayName: string }>;
type Request = Readonly<{
  method: string;
  path: string;
  companyId: string | null;
}>;

const prismaPrim: Company = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const bic: Company = { id: 'company-b', displayName: 'BIC' };
const recordName = 'Lumen Dairy SRL';
const datedEvents = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
].map((label, index) => ({
  id: `event-${label}`,
  action: 'company.registered',
  occurredAt: `2026-11-27T10:0${9 - index}:00.000Z`,
  actor: { internalUserId: 'ada', displayName: 'Ada Ionescu' },
  target: {
    type: 'company',
    companyId: `registered-${label}`,
    displayName: `Company ${label}`,
  },
}));

function actor(
  company: Company | undefined,
  workspacePermissions: ActorContext['workspacePermissions'],
  grants: ReturnType<typeof companyGrants>,
): ActorContext {
  return {
    internalUserId: 'ada',
    workspaceMembershipId: 'membership-ada',
    workspaceId: 'workspace-a',
    workspaceName: 'PRISMA Workspace',
    displayName: 'Ada Ionescu',
    email: 'ada@example.test',
    active: true,
    workspacePermissions,
    ...(company ? { activeCompany: { ...company, grants } } : {}),
  };
}

/** A Company director: Client access only. */
function directorIn(company: Company | undefined): ActorContext {
  return actor(
    company,
    [],
    companyGrants({
      bundle: 'company_director_client_access',
      version: 'v1',
      assignmentId: 'client-access',
    }),
  );
}

/** A Workspace administrator who also works on Clients, Projects, Tasks and improvement. */
function administratorIn(company: Company): ActorContext {
  return actor(
    company,
    ['company.manage', 'company.assignment.manage', 'member.invite'],
    companyGrants(
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: 'client-access',
      },
      {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'project-access',
      },
      {
        bundle: 'company_task_manager',
        version: 'v1',
        assignmentId: 'task-manager',
      },
      {
        bundle: 'company_ideas_reader',
        version: 'v1',
        assignmentId: 'ideas-reader',
      },
      {
        bundle: 'company_operational_risk_reader',
        version: 'v1',
        assignmentId: 'risk-reader',
      },
    ),
  );
}

function installServer({
  actorFor,
  activity = () => Response.json({ events: [] }),
}: Readonly<{
  actorFor: (companyId: string | null) => ActorContext;
  activity?: () => Response;
}>) {
  const requests: Request[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const method = init?.method ?? 'GET';
      const companyId = new Headers(init?.headers).get('x-company-context-id');
      requests.push({ method, path: url.pathname + url.search, companyId });
      if (url.pathname === '/api/access/current-actor')
        return Response.json(actorFor(companyId));
      if (url.pathname === '/api/companies')
        return Response.json([prismaPrim, bic]);
      if (url.pathname === '/api/activity-log') return activity();
      if (url.pathname === '/api/operational-home')
        return Response.json({
          companyId: companyId ?? prismaPrim.id,
          today: '2026-11-27',
          summaries: [{ kind: 'active_clients', count: 1 }],
        });
      if (url.pathname === '/api/clients')
        return Response.json([
          {
            id: 'client-1',
            displayName: recordName,
            relatedToActiveCompany: true,
          },
        ]);
      if (url.pathname === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      return new Response(null, { status: 404 });
    }),
  );
  return { requests };
}

function companyActor(companyId: string | null) {
  return directorIn(companyId === bic.id ? bic : prismaPrim);
}

async function clarteShown() {
  return screen.findByRole('button', { name: 'Go to a screen' });
}

function primaryNavigation() {
  return screen.getByRole('navigation', { name: 'Primary navigation' });
}

function names(container: HTMLElement, role: 'link' | 'option'): string[] {
  return within(container)
    .getAllByRole(role)
    .map((item) => item.textContent ?? '');
}

function openJumpList() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  return screen.getByRole('dialog', { name: 'Go to a screen' });
}

function openEntry(name: string) {
  fireEvent.click(within(primaryNavigation()).getByRole('link', { name }));
}

async function settle(requests: readonly Request[]) {
  let seen = -1;
  while (seen !== requests.length) {
    seen = requests.length;
    await act(async () => {
      for (let tick = 0; tick < 10; tick += 1)
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  Element.prototype.scrollIntoView = vi.fn();
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
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('tester switch', () => {
  it('shows the current interface with no Clarté control without the opt-in', async () => {
    installServer({ actorFor: companyActor });
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    renderWithoutLocale(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Hello, Ada Ionescu.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Interface language' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Go to a screen' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Clarté/u)).not.toBeInTheDocument();
    expect(document.querySelector('.clarte-frame')).toBeNull();
  });

  it('opens Clarté from the opt-in URL, keeps it across sign-in and reload, and leaves it from the user menu', async () => {
    installServer({ actorFor: companyActor });
    localStorage.setItem(interfaceLocaleStorageKey, 'en');
    window.history.replaceState(
      { recovery: 'kept' },
      '',
      '/?interface=clarte&source=kept#clients',
    );
    const view = renderWithoutLocale(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    await clarteShown();
    expect(window.location.search).toBe('?source=kept');
    expect(window.location.hash).toBe('#clients');
    expect(window.history.state).toEqual({ recovery: 'kept' });
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBe('clarte');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Clients' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Interface language' }),
    ).not.toBeInTheDocument();

    // A new sign-in renders App for a new identity under the same page.
    view.rerender(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    await clarteShown();
    // A reload starts a fresh page without the parameter.
    view.unmount();
    window.history.replaceState(null, '', '/#clients');
    renderWithoutLocale(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );
    await clarteShown();
    // Navigation keeps the choice.
    openEntry('Documents');
    expect(await clarteShown()).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave the Clarté interface' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Open navigation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Go to a screen' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Interface language' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBeNull();
  });

  it('falls back to the current interface when browser storage is unavailable', async () => {
    installServer({ actorFor: companyActor });
    const identity = deterministicBrowserIdentity();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    window.history.replaceState(null, '', '/?interface=clarte');
    renderWithoutLocale(<ApplicationRoot pathname="/" identity={identity} />);

    // Unavailable storage also keeps the Romanian default locale.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Bună, Ada Ionescu.',
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('.clarte-frame')).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('sends exactly the same API requests in both interfaces', async () => {
    const observed: string[][] = [];
    for (const appInterface of appInterfaces) {
      // Each run starts from the same browser state, without a stored Company.
      localStorage.clear();
      sessionStorage.clear();
      const { requests } = installServer({
        actorFor: () => administratorIn(prismaPrim),
        activity: () => Response.json({ events: datedEvents }),
      });
      window.history.replaceState(null, '', '/');
      const view = renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      await screen.findByRole('region', { name: 'Company summary' });
      await settle(requests);
      observed.push(
        requests
          .map(
            (request) =>
              `${request.method} ${request.path} ${request.companyId ?? '-'}`,
          )
          .sort(),
      );
      view.unmount();
    }

    const [current, clarte] = observed;
    expect(current?.length).toBeGreaterThan(5);
    expect(clarte).toEqual(current);
  });
});

describe('Clarté entries for actors with different grants', () => {
  it('offers a Workspace administrator only the entries, tabs and jump destinations granted', async () => {
    installServer({ actorFor: () => administratorIn(prismaPrim) });
    window.history.replaceState(null, '', '/#clients');
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();

    expect(names(primaryNavigation(), 'link')).toEqual([
      'Today',
      'Clients',
      'Missions and audits',
      'Tasks',
      'Documents',
      'Improvement',
      'Settings',
    ]);
    const views: ReadonlyArray<readonly [string, readonly string[]]> = [
      [
        'Tasks',
        ['My Tasks', 'Unassigned Tasks', 'Blocked Tasks', 'Team Tasks'],
      ],
      ['Improvement', ['Ideas', 'Operational risks']],
    ];
    for (const [entry, tabs] of views) {
      openEntry(entry);
      expect(
        names(
          screen.getByRole('navigation', { name: `${entry} views` }),
          'link',
        ),
      ).toEqual(tabs);
    }
    openEntry('Settings');
    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();
    expect(
      names(
        screen.getByRole('navigation', { name: 'Settings sections' }),
        'link',
      ),
    ).toEqual([
      'Language and region',
      'Companies',
      'Team & access',
      'Invitations',
      'Procedure deadlines',
      'Activity Log',
    ]);
    for (const single of ['Clients', 'Missions and audits', 'Documents']) {
      openEntry(single);
      expect(
        screen.queryByRole('navigation', { name: `${single} views` }),
      ).not.toBeInTheDocument();
    }

    const jump = openJumpList();
    expect(names(jump, 'option')).toEqual([
      'Today',
      'Clients',
      'ProjectsMissions and audits',
      'My TasksTasks',
      'Unassigned TasksTasks',
      'Blocked TasksTasks',
      'Team TasksTasks',
      'Working DocumentsDocuments',
      'IdeasImprovement',
      'Operational risksImprovement',
      'All settingsSettings',
      'Language and regionSettings',
      'CompaniesSettings',
      'Team & accessSettings',
      'InvitationsSettings',
      'Procedure deadlinesSettings',
      'Activity LogSettings',
    ]);
  });

  it('offers a Company director only Clients, Documents and the Activity Log, and searches no record', async () => {
    installServer({ actorFor: companyActor });
    window.history.replaceState(null, '', '/#clients');
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();
    expect(await screen.findByText(recordName)).toBeVisible();

    expect(names(primaryNavigation(), 'link')).toEqual([
      'Today',
      'Clients',
      'Documents',
      'Settings',
    ]);
    openEntry('Settings');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'All settings' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Settings views' }),
    ).not.toBeInTheDocument();
    expect(
      names(
        screen.getByRole('navigation', { name: 'Settings sections' }),
        'link',
      ),
    ).toEqual(['Language and region', 'Activity Log']);
    const phone = screen.getByRole('navigation', { name: 'Quick navigation' });
    expect(names(phone, 'link')).toEqual(['Today', 'Documents']);
    fireEvent.click(within(phone).getByRole('button', { name: 'More' }));
    expect(
      names(screen.getByRole('group', { name: 'More screens' }), 'link'),
    ).toEqual(['Clients', 'Settings']);

    const jump = openJumpList();
    expect(names(jump, 'option')).toEqual([
      'Today',
      'Clients',
      'Working DocumentsDocuments',
      'All settingsSettings',
      'Language and regionSettings',
      'Activity LogSettings',
    ]);
    const field = within(jump).getByRole('combobox', { name: 'Screen name' });
    fireEvent.change(field, { target: { value: 'Lumen' } });
    expect(within(jump).queryAllByRole('option')).toHaveLength(0);
    fireEvent.change(field, { target: { value: 'working doc' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(window.location.hash).toBe('#documents');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Documents' }),
    ).toBeInTheDocument();
  });
});

describe('Clarté top bar', () => {
  it('shows the five latest Activity Log changes from the bell and opens the full log', async () => {
    installServer({
      actorFor: companyActor,
      activity: () => Response.json({ events: datedEvents }),
    });
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();

    fireEvent.click(screen.getByRole('button', { name: 'Recent changes' }));
    const panel = await waitFor(() => {
      const element = document.getElementById('clarte-recent-changes');
      if (!element) throw new Error('Expected the recent changes panel.');
      return element;
    });
    const recent = within(panel).getByRole('region', {
      name: 'Recent changes',
    });
    await waitFor(() =>
      expect(within(recent).getAllByRole('listitem')).toHaveLength(5),
    );
    expect(recent).toHaveTextContent('Target: Company first');
    expect(recent).not.toHaveTextContent('Company sixth');

    fireEvent.click(
      within(recent).getByRole('button', { name: 'Open full Activity Log' }),
    );
    expect(window.location.hash).toBe('#activity');
    expect(document.getElementById('clarte-recent-changes')).toBeNull();
    expect(
      within(primaryNavigation()).getByRole('link', { name: 'Settings' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    [
      'empty',
      () => Response.json({ events: [] }),
      'No dated events to show in the current Activity context.',
    ],
    [
      'error',
      () => new Response(null, { status: 500 }),
      'Recent changes are unavailable. No events are shown.',
    ],
  ])(
    'shows the %s state of recent changes as the current overview does',
    async (_state, activity, message) => {
      installServer({ actorFor: companyActor, activity });
      renderInInterface(
        'clarte',
        <App identity={deterministicBrowserIdentity()} />,
      );
      await clarteShown();

      fireEvent.click(screen.getByRole('button', { name: 'Recent changes' }));

      const panel = document.getElementById('clarte-recent-changes');
      if (!panel) throw new Error('Expected the recent changes panel.');
      expect(await within(panel).findByText(message)).toBeInTheDocument();
    },
  );

  it.each(appInterfaces)(
    'offers no recent changes without a Client, Project or Task read in the %s interface',
    async (appInterface) => {
      installServer({
        actorFor: () => actor(prismaPrim, ['company.manage'], companyGrants()),
        activity: () => Response.json({ events: datedEvents }),
      });
      renderInInterface(
        appInterface,
        <App identity={deterministicBrowserIdentity()} />,
      );
      await screen.findByRole('heading', { level: 1 });
      await screen.findByRole('region', { name: 'Activity Log', hidden: true });

      expect(
        screen.queryByRole('button', { name: 'Recent changes' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Recent changes' }),
      ).not.toBeInTheDocument();
    },
  );

  it('signs out and changes the interface language from the user menu', async () => {
    installServer({ actorFor: companyActor });
    const signOut = vi.fn(async () => undefined);
    const identity: BrowserIdentity = {
      ...deterministicBrowserIdentity(),
      signOut,
    };
    renderInInterface('clarte', <App identity={identity} />);
    await clarteShown();

    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const menu = screen.getByRole('group', { name: 'User menu' });
    expect(within(menu).getByText('ada@example.test')).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('radio', { name: 'Русский' }));
    expect(
      within(
        screen.getByRole('navigation', { name: 'Основная навигация' }),
      ).getByRole('link', { name: 'Сегодня' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(menu).getByRole('group', { name: 'Язык интерфейса' }),
    ).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('radio', { name: 'English' }));
    fireEvent.click(within(menu).getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledOnce();
  });

  it('offers Romanian by default in the user menu and hides the floating language selector', async () => {
    installServer({ actorFor: companyActor });
    window.history.replaceState(null, '', '/?interface=clarte');
    renderWithoutLocale(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Astăzi' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Limba interfeței' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Meniul utilizatorului' }),
    );
    const languages = screen.getByRole('group', { name: 'Limba interfeței' });
    expect(
      within(languages).getByRole('radio', { name: 'Română' }),
    ).toBeChecked();
    fireEvent.click(within(languages).getByRole('radio', { name: 'Français' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Aujourd’hui' }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('group', { name: 'Langue de l’interface' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('combobox', { name: 'Langue de l’interface' }),
    ).not.toBeInTheDocument();
  });

  it('changes the active Company with the same remount and draft rules', async () => {
    installServer({ actorFor: companyActor });
    window.history.replaceState(null, '', '/#clients');
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();
    fireEvent.click(await screen.findByRole('button', { name: 'New Client' }));
    changeValue(screen.getByLabelText('Client display name'), 'Draft Client');

    selectOption(
      screen.getByRole('combobox', { name: 'Active Company' }),
      bic.id,
    );

    await waitFor(() =>
      expect(document.querySelector('.clarte-eyebrow')).toHaveTextContent(
        'BIC',
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'New Client' }));
    expect(screen.getByLabelText('Client display name')).toHaveValue('');
    expect(window.location.hash).toBe('#clients');
  });

  it('shows the no-active-Company state', async () => {
    installServer({ actorFor: () => directorIn(undefined) });
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();

    expect(document.querySelector('.clarte-eyebrow')).toHaveTextContent(
      'No active Company',
    );
    expect(
      await screen.findByRole('combobox', { name: 'Active Company' }),
    ).toHaveTextContent('Select a Company');
  });
});

describe('Clarté navigation during a protected source write', () => {
  function installPaymentEvidence() {
    const recorder = paymentEvidenceActor();
    const writes: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(input.toString(), 'http://localhost').pathname;
        if ((init?.method ?? 'GET') !== 'GET') {
          writes.push(path);
          // The write stays in flight for the whole test.
          return new Promise<Response>(() => undefined);
        }
        if (path === '/api/access/current-actor')
          return Response.json(recorder);
        if (path === '/api/companies')
          return Response.json([recorder.activeCompany, bic]);
        if (path === '/api/activity-log') return Response.json({ events: [] });
        if (path === '/api/client-duplicate-reviews')
          return Response.json({ items: [], next_cursor: null });
        if (path === '/api/clients')
          return Response.json([
            {
              id: ids.client,
              displayName: 'Fictional original Client',
              relatedToActiveCompany: true,
            },
          ]);
        if (path === `/api/clients/${ids.client}`)
          return Response.json({
            id: ids.client,
            displayName: 'Fictional original Client',
            taxId: null,
            address: null,
            version: 1,
            relatedToActiveCompany: true,
          });
        if (path === `/api/clients/${ids.client}/legal-entities`)
          return Response.json({ clientVersion: 1, legalEntities: [] });
        if (path === '/api/documents')
          return Response.json([paymentEvidenceDocument()]);
        return new Response(null, { status: 404 });
      }),
    );
    return { writes };
  }

  it('holds the menu, tabs, phone bar, jump list, history and Company until the write settles', async () => {
    const api = installPaymentEvidence();
    window.history.replaceState(null, '', '/#documents');
    renderInInterface(
      'clarte',
      <App identity={deterministicBrowserIdentity()} />,
    );
    await clarteShown();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Payment evidence' }),
    );
    const form = await screen.findByRole('form', {
      name: 'Register payment evidence',
    });
    const client = within(form).getByLabelText('Original Client');
    await waitFor(() => expect(client).not.toBeDisabled());
    changeValue(client, ids.client);
    const payer = within(form).getByLabelText('Exact payer');
    await waitFor(() => expect(payer).not.toBeDisabled());
    changeValue(payer, 'PRIMARY');
    const title = within(form).getByLabelText('Title');
    fireEvent.change(title, { target: { value: 'Held notice' } });
    fireEvent.change(within(form).getByLabelText('Purpose'), {
      target: { value: 'Preserve original source' },
    });
    fireEvent.change(within(form).getByLabelText('Declared source'), {
      target: { value: 'Fictional manual notice' },
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Preserve evidence source' }),
    );
    await waitFor(() => expect(api.writes).toHaveLength(1));
    await waitFor(() => expect(title).toBeDisabled());
    const held = async () => {
      await waitFor(() => expect(window.location.hash).toBe('#documents'));
      expect(title.isConnected).toBe(true);
    };

    openEntry('Clients');
    await held();
    openEntry('Settings');
    await held();
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'Quick navigation' }),
      ).getByRole('link', { name: 'Today' }),
    );
    await held();
    const field = within(openJumpList()).getByRole('combobox', {
      name: 'Screen name',
    });
    fireEvent.change(field, { target: { value: 'clients' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await held();
    act(() => {
      window.history.pushState(window.history.state, '', '/#clients');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await held();
    expect(
      screen.getByRole('combobox', { name: 'Active Company' }),
    ).toBeDisabled();
    // Leaving Clarté would unmount the owner of the uncertain write.
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }));
    const leave = screen.getByRole('button', {
      name: 'Leave the Clarté interface',
    });
    expect(leave).toBeDisabled();
    fireEvent.click(leave);
    expect(await clarteShown()).toBeInTheDocument();
    expect(title.isConnected).toBe(true);
    expect(localStorage.getItem(interfacePreferenceStorageKey)).toBe('clarte');
    expect(api.writes).toHaveLength(1);
  });
});
