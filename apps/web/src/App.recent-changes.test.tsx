import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  activityEventsByAction,
  activityLocaleActor,
  activityLocaleIds,
  activityLiteral,
  activityDetailPath,
  activityOfferPath,
  activityContractPath,
  readActivityJourneyFixture,
} from './test/activity-localization-fixture';
import type { ActorContext } from './access-types';
import { changeValue } from './test/select-option';
import { deterministicBrowserIdentity } from './access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from './localization/interface-locale';

const company = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const datedEvents = [
  ['first', '2026-10-19T10:06:00.000Z'],
  ['second', '2026-10-19T10:05:00.000Z'],
  ['third', '2026-10-19T10:04:00.000Z'],
  ['fourth', '2026-10-19T10:03:00.000Z'],
  ['fifth', '2026-10-19T10:02:00.000Z'],
  ['sixth', '2026-10-19T10:01:00.000Z'],
].map(([label, occurredAt]) => ({
  id: `event-${label}`,
  action: 'company.registered',
  occurredAt,
  actor: { internalUserId: 'ana', displayName: 'Ana' },
  target: {
    type: 'company',
    companyId: `registered-${label}`,
    displayName: `Company ${label}`,
  },
}));
const undatedEvent = {
  action: 'client.union_confirmed',
  projectionReference: 'union-projection-a',
  companyId: company.id,
  actor: { kind: 'authorized_resolver' },
  target: {
    type: 'client_union_operation',
    projectionReference: 'union-projection-a',
    companyId: company.id,
  },
};

const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
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

it('shows the latest five publicly dated changes in server order and opens full Activity', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      if (path === '/api/access/current-actor')
        return Response.json({
          internalUserId: 'ana',
          workspaceMembershipId: 'membership-ana',
          workspaceId: 'workspace-a',
          workspaceName: 'Workspace',
          displayName: 'Ana',
          email: 'ana@example.test',
          active: true,
          workspacePermissions: ['company.manage'],
          activeCompany: { ...company, clientPermissions: ['client.read'] },
        });
      if (path === '/api/companies') return Response.json([company]);
      if (path === '/api/activity-log')
        return Response.json({ events: [...datedEvents, undatedEvent] });
      if (path === '/api/operational-home')
        return Response.json({
          companyId: company.id,
          today: '2026-10-19',
          summaries: [{ kind: 'active_clients', count: 0 }],
        });
      if (path === '/api/clients' || path === '/api/clients/search')
        return Response.json([]);
      if (path === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      return new Response(null, { status: 404 });
    }),
  );
  render(
    <InterfaceLocaleProvider>
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );
  await screen.findByRole('region', { name: 'Company summary' });
  // The real hidden full Activity must have admitted every fixture before
  // the missing new Home presentation is treated as the behavior RED.
  const admittedSixth = await screen.findByText('Target: Company sixth');
  const fullActivity = admittedSixth.closest('section');
  if (fullActivity === null)
    throw new Error('Expected the real full Activity region.');
  expect(
    within(fullActivity).getAllByRole('listitem', { hidden: true }),
  ).toHaveLength(7);
  expect(
    within(fullActivity).getByText('Target: Company sixth'),
  ).toBeInTheDocument();
  await screen.findByRole('heading', { name: 'Recent changes' });
  const recent = screen.getByRole('region', { name: 'Recent changes' });
  const rows = within(recent).getAllByRole('listitem');
  expect(rows).toHaveLength(5);
  expect(
    rows.map((row) => row.querySelector('time')?.getAttribute('datetime')),
  ).toEqual([
    '2026-10-19T10:06:00.000Z',
    '2026-10-19T10:05:00.000Z',
    '2026-10-19T10:04:00.000Z',
    '2026-10-19T10:03:00.000Z',
    '2026-10-19T10:02:00.000Z',
  ]);
  expect(rows.map((row) => row.querySelector('span')?.textContent)).toEqual([
    'Target: Company first',
    'Target: Company second',
    'Target: Company third',
    'Target: Company fourth',
    'Target: Company fifth',
  ]);
  expect(recent).not.toHaveTextContent('Company sixth');
  expect(recent).not.toHaveTextContent('union-projection-a');
  expect(recent).not.toHaveTextContent('authorized resolver');
  fireEvent.click(
    within(recent).getByRole('button', { name: 'Open full Activity Log' }),
  );
  expect(window.location.hash).toBe('#activity');
  expect(screen.getByRole('region', { name: 'Activity Log' })).toBeVisible();
  expect(screen.getByText('Target: Company sixth')).toBeVisible();
});

function installServer(initialCompany = company) {
  const otherCompany = { id: 'company-b', displayName: 'BIC' };
  const noExtraResponse: (
    path: string,
    companyId: string | null,
  ) => unknown = () => undefined;
  const defaultActivityRead: (
    companyId: string | null,
  ) => Response | Promise<Response> = () =>
    Response.json({ events: [...datedEvents, undatedEvent] });
  const state = {
    summaryRead: true,
    actorStatus: 200,
    searchStatus: 200,
    membershipId: 'membership-ana',
    extendActor: (actor: ActorContext): ActorContext => actor,
    extra: noExtraResponse,
    activity: defaultActivityRead,
  };
  const requests: Array<{
    path: string;
    companyId: string | null;
    method: string;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname;
      const companyId = new Headers(init?.headers).get('x-company-context-id');
      requests.push({ path, companyId, method: init?.method ?? 'GET' });
      if (path === '/api/access/current-actor') {
        if (state.actorStatus !== 200)
          return new Response(null, { status: state.actorStatus });
        const selected =
          companyId === otherCompany.id ? otherCompany : initialCompany;
        const actor: ActorContext = {
          internalUserId: 'ana',
          workspaceMembershipId: state.membershipId,
          workspaceId: 'workspace-a',
          workspaceName: 'Workspace',
          displayName: 'Ana',
          email: 'ana@example.test',
          active: true,
          workspacePermissions: ['company.manage'],
          activeCompany: {
            ...selected,
            clientPermissions: state.summaryRead ? ['client.read'] : [],
          },
        };
        return Response.json(state.extendActor(actor));
      }
      if (path === '/api/companies')
        return Response.json([initialCompany, otherCompany]);
      if (path === '/api/activity-log') return state.activity(companyId);
      if (path === '/api/operational-home')
        return Response.json({
          companyId: companyId ?? initialCompany.id,
          today: '2026-10-19',
          summaries: [{ kind: 'active_clients', count: 0 }],
        });
      if (path === '/api/clients') return Response.json([]);
      if (path === '/api/clients/search')
        return state.searchStatus === 200
          ? Response.json([])
          : new Response(null, { status: state.searchStatus });
      if (path === '/api/client-duplicate-reviews')
        return Response.json({ items: [], next_cursor: null });
      const extra = state.extra(path, companyId);
      return extra === undefined
        ? new Response(null, { status: 404 })
        : Response.json(extra);
    }),
  );
  return { state, requests };
}

function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {(['ro', 'ru', 'fr', 'en'] satisfies InterfaceLocale[]).map((locale) => (
        <button key={locale} onClick={() => changeLocale(locale)}>
          Use {locale}
        </button>
      ))}
    </>
  );
}
function renderApp() {
  return render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );
}
function deferredResponse() {
  let answer: (response: Response) => void = () => {
    throw new Error('Reply was not initialized.');
  };
  const promise = new Promise<Response>((resolve) => {
    answer = resolve;
  });
  return {
    promise,
    async release(response: Response) {
      await act(async () => {
        answer(response);
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    },
  };
}
const recentRegion = () =>
  screen.getByRole('region', { name: 'Recent changes' });

it.each([
  ['empty', []],
  ['undated-only', [undatedEvent]],
])(
  'shows the same honest no-dated state for an %s authorized page',
  async (_name, events) => {
    const server = installServer();
    server.state.activity = () => Response.json({ events });
    renderApp();
    const recent = await screen.findByRole('region', {
      name: 'Recent changes',
    });
    await within(recent).findByText(
      'No dated events to show in the current Activity context.',
    );
    expect(within(recent).queryAllByRole('listitem')).toHaveLength(0);
    expect(recent).not.toHaveTextContent('union');
    expect(recent).not.toHaveTextContent('resolver');
    expect(recent).not.toHaveTextContent('0 events');
  },
);

it('distinguishes initial loading, failure and explicit successful retry through the existing Activity owner', async () => {
  const server = installServer();
  const pending = deferredResponse();
  server.state.activity = () => pending.promise;
  renderApp();
  const recent = await screen.findByRole('region', { name: 'Recent changes' });
  expect(within(recent).getByRole('status')).toHaveTextContent(
    'Loading recent changes…',
  );
  expect(
    within(recent).queryByText(
      'No dated events to show in the current Activity context.',
    ),
  ).toBeNull();
  await pending.release(new Response(null, { status: 500 }));
  expect(await within(recent).findByRole('alert')).toHaveTextContent(
    'Recent changes are unavailable. No events are shown.',
  );
  expect(within(recent).queryAllByRole('listitem')).toHaveLength(0);
  server.state.activity = () => Response.json({ events: datedEvents });
  fireEvent.click(
    within(recent).getByRole('button', {
      name: 'Retry loading recent changes',
    }),
  );
  await within(recent).findByText('Target: Company first');
  expect(within(recent).getAllByRole('listitem')).toHaveLength(5);
  expect(
    server.requests.filter(({ path }) => path === '/api/activity-log'),
  ).toHaveLength(2);
  expect(server.requests.every(({ method }) => method === 'GET')).toBe(true);
});

it('removes previously successful rows on failed or malformed refresh instead of showing an empty page', async () => {
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  const recent = recentRegion();
  expect(within(recent).getAllByRole('listitem')).toHaveLength(5);
  server.state.activity = () =>
    Response.json({
      events: [{ ...datedEvents[0], action: 'unknown.future.action' }],
    });
  fireEvent.click(
    within(recent).getByRole('button', { name: 'Refresh recent changes' }),
  );
  await within(recent).findByRole('alert');
  expect(within(recent).queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.queryByText('Target: Company sixth')).toBeNull();
  expect(recent).not.toHaveTextContent('No dated events to show');
  server.state.activity = () => new Response(null, { status: 503 });
  fireEvent.click(
    within(recent).getByRole('button', {
      name: 'Retry loading recent changes',
    }),
  );
  await waitFor(() =>
    expect(
      server.requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(3),
  );
  expect(within(recent).queryAllByRole('listitem')).toHaveLength(0);
});

it('retains full Activity for an Activity-readable actor without widening the Home summary gate', async () => {
  const server = installServer();
  server.state.summaryRead = false;
  renderApp();
  await screen.findByText('Target: Company sixth');
  expect(screen.queryByRole('region', { name: 'Recent changes' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Company summary' })).toBeNull();
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: 'Activity Log' }),
  );
  expect(screen.getByRole('region', { name: 'Activity Log' })).toBeVisible();
  expect(screen.getByText('Target: Company sixth')).toBeVisible();
  expect(
    server.requests.filter(({ path }) => path === '/api/operational-home'),
  ).toHaveLength(0);
});

it('discards a held old-Company Activity response after a real Company switch', async () => {
  const server = installServer();
  const pendingA = deferredResponse();
  server.state.activity = (companyId) =>
    companyId === 'company-b'
      ? Response.json({
          events: [
            {
              ...datedEvents[0],
              id: 'event-company-b',
              target: {
                type: 'company',
                companyId: 'company-b',
                displayName: 'Only BIC event',
              },
            },
          ],
        })
      : pendingA.promise;
  renderApp();
  await screen.findByRole('region', { name: 'Recent changes' });
  await waitFor(() =>
    expect(
      server.requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(1),
  );
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    'company-b',
  );
  await waitFor(() =>
    expect(
      within(recentRegion()).getByText('Target: Only BIC event'),
    ).toBeVisible(),
  );
  await pendingA.release(
    Response.json({ events: [...datedEvents, undatedEvent] }),
  );
  expect(within(recentRegion()).getAllByRole('listitem')).toHaveLength(1);
  expect(recentRegion()).not.toHaveTextContent('Company first');
  expect(screen.queryByText('Target: Company sixth')).toBeNull();
});

it('retires the Home preview on real authority loss and cannot revive a held response', async () => {
  window.history.replaceState(null, '', '/?frame=classic');
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  const pending = deferredResponse();
  server.state.activity = () => pending.promise;
  fireEvent.click(
    within(recentRegion()).getByRole('button', {
      name: 'Refresh recent changes',
    }),
  );
  await waitFor(() =>
    expect(
      server.requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(2),
  );
  server.state.summaryRead = false;
  server.state.activity = () => Response.json({ events: [] });
  server.state.searchStatus = 403;
  changeValue(screen.getByLabelText('Find a shared Client'), 'synthetic');
  fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Recent changes' })).toBeNull(),
  );
  await pending.release(Response.json({ events: datedEvents }));
  expect(screen.queryByRole('region', { name: 'Recent changes' })).toBeNull();
  expect(screen.queryByText('Target: Company first')).toBeNull();
});

it('removes successful preview and target controls when the actual session is rejected', async () => {
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  server.state.activity = () => new Response(null, { status: 401 });
  fireEvent.click(
    within(recentRegion()).getByRole('button', {
      name: 'Refresh recent changes',
    }),
  );
  await waitFor(() =>
    expect(sessionStorage.getItem('deterministic-auth-state')).toBe(
      'signed-out',
    ),
  );
  expect(screen.queryByRole('region', { name: 'Recent changes' })).toBeNull();
  expect(screen.queryByText('Target: Company first')).toBeNull();
});

it('changes four-locale narration in place without HTTP, refresh, navigation or focus theft', async () => {
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  const recent = recentRegion();
  const rows = within(recent).getAllByRole('listitem');
  const refresh = within(recent).getByRole('button', {
    name: 'Refresh recent changes',
  });
  refresh.focus();
  const reads = server.requests.length;
  const url = window.location.href;
  for (const [locale, title, refreshLabel] of [
    ['ro', 'Modificări recente', 'Actualizați modificările recente'],
    ['ru', 'Последние изменения', 'Обновить последние изменения'],
    ['fr', 'Changements récents', 'Actualiser les changements récents'],
    ['en', 'Recent changes', 'Refresh recent changes'],
  ]) {
    fireEvent.click(screen.getByRole('button', { name: `Use ${locale}` }));
    expect(screen.getByRole('region', { name: title })).toBe(recent);
    expect(within(recent).getAllByRole('listitem')).toEqual(rows);
    expect(within(recent).getByRole('button', { name: refreshLabel })).toBe(
      refresh,
    );
    expect(refresh).toHaveFocus();
    expect(recent).toHaveTextContent('Company first');
    expect(rows[0]?.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-10-19T10:06:00.000Z',
    );
    expect(server.requests).toHaveLength(reads);
    expect(window.location.href).toBe(url);
  }
});

it('keeps truthfully dated old events without a browser-clock cutoff or Company-only filter', async () => {
  const server = installServer();
  server.state.activity = () =>
    Response.json({
      events: [{ ...datedEvents[0], occurredAt: '2000-01-01T12:00:00.000Z' }],
    });
  renderApp();
  const recent = await screen.findByRole('region', { name: 'Recent changes' });
  await within(recent).findByText('Target: Company first');
  expect(within(recent).getAllByRole('listitem')).toHaveLength(1);
  expect(recent.querySelector('time')).toHaveAttribute(
    'datetime',
    '2000-01-01T12:00:00.000Z',
  );
  expect(recent).toHaveTextContent('Their dates may be old.');
});

function installCommercialServer(requests = true) {
  const server = installServer({
    id: activityLocaleIds.company,
    displayName: activityLiteral,
  });
  server.state.extendActor = () => {
    const actor = activityLocaleActor({ requests });
    return {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        id: activityLocaleIds.company,
        displayName: activityLiteral,
        clientPermissions: ['client.read'],
      },
    };
  };
  server.state.extra = (path) => readActivityJourneyFixture({ path, requests });
  server.state.activity = () =>
    Response.json({
      events: [
        activityEventsByAction['offer.created'],
        activityEventsByAction['contract.created'],
        activityEventsByAction['client_request.created'],
        activityEventsByAction['project.created'],
        {
          ...activityEventsByAction['client_request.created'],
          id: 'request-other-company',
          target: {
            type: 'client_request',
            clientRequestId: 'other-company-request',
            companyId: activityLocaleIds.otherCompany,
          },
        },
      ],
    });
  return server;
}

it.each([
  ['Open Request', activityDetailPath],
  [
    'Open Offer Version',
    `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`,
  ],
  [
    'Open agreement version',
    `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
  ],
])(
  'opens the existing exact target through %s and keeps mounted DOM identities unique',
  async (label, expectedPath) => {
    const server = installCommercialServer();
    renderApp();
    const recent = await screen.findByRole('region', {
      name: 'Recent changes',
    });
    await within(recent).findByText(
      'Target: Client Request: other-company-request',
    );
    await waitFor(() =>
      expect(within(recent).getAllByRole('listitem')).toHaveLength(5),
    );
    const rows = within(recent).getAllByRole('listitem');
    expect(within(rows[3] ?? recent).queryByRole('button')).toBeNull();
    expect(within(rows[4] ?? recent).queryByRole('button')).toBeNull();
    const ids = Array.from(
      document.querySelectorAll('[id]'),
      (node) => node.id,
    );
    expect(new Set(ids).size).toBe(ids.length);
    const target = within(recent).getByRole('button', { name: label });
    const describedBy = target.getAttribute('aria-describedby');
    if (describedBy === null)
      throw new Error('Expected an exact target description.');
    expect(recent).toContainElement(document.getElementById(describedBy));
    fireEvent.click(target);
    await waitFor(() =>
      expect(server.requests.some(({ path }) => path === expectedPath)).toBe(
        true,
      ),
    );
    expect(window.location.hash).toBe('#requests');
    expect(server.requests.every(({ method }) => method === 'GET')).toBe(true);
  },
);

it('offers no Request or version action when current Request navigation is unavailable', async () => {
  installCommercialServer(false);
  renderApp();
  const recent = await screen.findByRole('region', { name: 'Recent changes' });
  await within(recent).findByText(
    'Target: Client Request: other-company-request',
  );
  expect(
    within(recent).queryByRole('button', { name: 'Open Request' }),
  ).toBeNull();
  expect(
    within(recent).queryByRole('button', { name: 'Open Offer Version' }),
  ).toBeNull();
  expect(
    within(recent).queryByRole('button', { name: 'Open agreement version' }),
  ).toBeNull();
  expect(
    within(recent).getByRole('button', { name: 'Open full Activity Log' }),
  ).toBeEnabled();
});

it('suppresses an old identity reply after a real identity and Membership replacement', async () => {
  const server = installServer();
  const pending = deferredResponse();
  server.state.activity = () => pending.promise;
  const view = render(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );
  await screen.findByRole('region', { name: 'Recent changes' });
  await waitFor(() =>
    expect(
      server.requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(1),
  );
  server.state.membershipId = 'membership-replacement';
  server.state.activity = () =>
    Response.json({
      events: [
        {
          ...datedEvents[0],
          id: 'replacement-event',
          target: {
            type: 'company',
            companyId: company.id,
            displayName: 'Current Membership event',
          },
        },
      ],
    });
  view.rerender(
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );
  await waitFor(() =>
    expect(
      within(recentRegion()).getByText('Target: Current Membership event'),
    ).toBeVisible(),
  );
  await pending.release(Response.json({ events: datedEvents }));
  expect(within(recentRegion()).getAllByRole('listitem')).toHaveLength(1);
  expect(recentRegion()).not.toHaveTextContent('Company first');
  expect(
    server.requests.filter(({ path }) => path === '/api/activity-log'),
  ).toHaveLength(2);
});

it('retires old rows after an actual forbidden Activity read without leaking a false empty state', async () => {
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  server.state.activity = () => new Response(null, { status: 403 });
  fireEvent.click(
    within(recentRegion()).getByRole('button', {
      name: 'Refresh recent changes',
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('region', { name: 'Recent changes' })).toBeNull(),
  );
  expect(screen.queryByText('Target: Company first')).toBeNull();
  expect(screen.queryByText('Target: Company sixth')).toBeNull();
  expect(
    screen.queryByText(
      'No dated events to show in the current Activity context.',
    ),
  ).toBeNull();
});

it('uses the current locale for late failed refresh feedback without a locale-only read', async () => {
  const server = installServer();
  renderApp();
  await screen.findByText('Target: Company sixth');
  const recent = recentRegion();
  const pending = deferredResponse();
  server.state.activity = () => pending.promise;
  fireEvent.click(
    within(recent).getByRole('button', { name: 'Refresh recent changes' }),
  );
  await waitFor(() =>
    expect(
      server.requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(2),
  );
  const reads = server.requests.length;
  fireEvent.click(screen.getByRole('button', { name: 'Use fr' }));
  expect(screen.getByRole('region', { name: 'Changements récents' })).toBe(
    recent,
  );
  expect(server.requests).toHaveLength(reads);
  await pending.release(new Response(null, { status: 500 }));
  expect(await within(recent).findByRole('alert')).toHaveTextContent(
    'Les changements récents sont indisponibles. Aucun événement n’est affiché.',
  );
  expect(
    within(recent).getByRole('button', {
      name: 'Réessayer le chargement des changements récents',
    }),
  ).toBeEnabled();
  expect(recent).not.toHaveTextContent('Recent changes are unavailable');
  expect(within(recent).queryAllByRole('listitem')).toHaveLength(0);
  expect(server.requests).toHaveLength(reads);
});
