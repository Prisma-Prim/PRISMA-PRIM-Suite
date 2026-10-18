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
import { deterministicBrowserIdentity } from './access-composition';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from './localization/interface-locale';

import { changeValue } from './test/select-option';
import {
  activityLocaleIds,
  activityLiteral,
  heterogeneousActivityEvents,
  activityDetailPath,
  activityOfferPath,
  activityContractPath,
  activityNextActionPath,
  activityDraft,
  activitySavedRequest,
  readActivityJourneyFixture,
} from './test/activity-localization-fixture';

const companyId = '00000000-0000-4000-8000-000000000313';
const requestId = '00000000-0000-4000-8000-000000000314';
const reader = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: companyId,
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    commercialIntakePermissions: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    commercialActivityPermissions: ['commercial.activity.read'],
  },
};

function RomanianChoice() {
  const { changeLocale } = useInterfaceLocale();
  return <button onClick={() => changeLocale('ro')}>Use ro</button>;
}

const nativeScrollIntoView = Element.prototype.scrollIntoView;
beforeEach(() => {
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
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  window.history.replaceState(null, '', '/?frame=classic#activity');
});

afterEach(() => {
  Element.prototype.scrollIntoView = nativeScrollIntoView;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('localizes loaded Activity narration without replacing its rows or reading again', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    const body = url.endsWith('/access/current-actor')
      ? reader
      : url.endsWith('/activity-log')
        ? {
            events: [
              {
                id: 'event-locale-703',
                action: 'client_request.created',
                occurredAt: '2026-09-21T10:05:00.000Z',
                actor: {
                  internalUserId: 'user-1',
                  displayName: 'Ada Ionescu',
                },
                target: {
                  type: 'client_request',
                  clientRequestId: requestId,
                  companyId,
                },
                metadata: {},
              },
            ],
          }
        : [];
    return Response.json(body);
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <InterfaceLocaleProvider>
      <RomanianChoice />
      <App identity={deterministicBrowserIdentity()} />
    </InterfaceLocaleProvider>,
  );

  const description = await screen.findByText(
    'Ada Ionescu captured a Client Request',
  );
  const row = description.closest('li');
  if (row === null) throw new Error('Expected the admitted Activity row.');
  const ledger = screen.getByRole('region', { name: 'Activity Log' });
  expect(within(ledger).getAllByRole('listitem')).toEqual([row]);
  expect(row).toHaveTextContent(`Target: Client Request: ${requestId}`);
  expect(
    within(row).getByRole('button', { name: 'Open Request' }),
  ).toBeVisible();
  const time = row.querySelector('time');
  expect(time).toHaveAttribute('datetime', '2026-09-21T10:05:00.000Z');
  const reads = fetch.mock.calls.length;

  fireEvent.click(screen.getByRole('button', { name: 'Use ro' }));

  expect(within(ledger).getAllByRole('listitem')).toEqual([row]);
  expect(row.querySelector('strong')).toBe(description);
  expect(row.querySelector('time')).toBe(time);
  expect(time).toHaveAttribute('datetime', '2026-09-21T10:05:00.000Z');
  expect(fetch).toHaveBeenCalledTimes(reads);
  expect(
    within(ledger).getByRole('heading', { name: 'Jurnal de activitate' }),
  ).toBeVisible();
  expect(row).toHaveTextContent(
    'Ada Ionescu a înregistrat o cerere a clientului',
  );
  expect(row).toHaveTextContent(`Țintă: Cerere a clientului: ${requestId}`);
});

const journeyLocales = [
  {
    code: 'ro',
    title: 'Jurnal de activitate',
    loading: 'Se încarcă activitatea…',
    error: 'Jurnalul de activitate nu a putut fi încărcat. Încercați din nou.',
    empty:
      'În acest spațiu de lucru nu este încă înregistrată nicio activitate.',
    created: 'a înregistrat o cerere a clientului',
    open: 'Deschideți cererea',
    offer: 'Deschideți versiunea ofertei',
    contract: 'Deschideți versiunea acordului',
    next: 'Acțiunea următoare',
    uncertain:
      'Actualizarea acțiunii următoare nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    held: 'Solicitarea cerută se va deschide după salvarea sau anularea editării acțiunii următoare.',
  },
  {
    code: 'ru',
    title: 'Журнал действий',
    loading: 'Загрузка действий…',
    error: 'Не удалось загрузить журнал действий. Повторите попытку.',
    empty: 'В этом рабочем пространстве пока нет записанных действий.',
    created: '— регистрация запроса Клиента',
    open: 'Открыть запрос',
    offer: 'Открыть версию Оферты',
    contract: 'Открыть версию соглашения',
    next: 'Следующее действие',
    uncertain:
      'Обновление следующего действия не завершено. Повторите попытку, чтобы подтвердить результат.',
    held: 'Запрошенный Запрос откроется после сохранения или отмены редактирования следующего действия.',
  },
  {
    code: 'fr',
    title: 'Journal d’activité',
    loading: 'Chargement de l’activité…',
    error: 'Le journal d’activité n’a pas pu être chargé. Veuillez réessayer.',
    empty:
      'Aucune activité n’est encore enregistrée dans cet espace de travail.',
    created: 'a enregistré une Demande Client',
    open: 'Ouvrir la demande',
    offer: 'Ouvrir la Version de l’Offre',
    contract: 'Ouvrir la version de l’accord',
    next: 'Prochaine action',
    uncertain:
      'La mise à jour de la prochaine action n’a pas abouti. Réessayez pour confirmer le résultat.',
    held: 'La Demande demandée s’ouvrira après l’enregistrement ou l’annulation de la prochaine action.',
  },
  {
    code: 'en',
    title: 'Activity Log',
    loading: 'Loading activity…',
    error: 'We could not load the Activity Log. Please try again.',
    empty: 'No activity has been recorded in this workspace yet.',
    created: 'captured a Client Request',
    open: 'Open Request',
    offer: 'Open Offer Version',
    contract: 'Open agreement version',
    next: 'Next action',
    uncertain:
      'The next action update did not complete. Retry to confirm the result.',
    held: 'The requested Client Request opens after the next-action edit is saved or cancelled.',
  },
] satisfies Array<{
  code: InterfaceLocale;
  title: string;
  loading: string;
  error: string;
  empty: string;
  created: string;
  open: string;
  offer: string;
  contract: string;
  next: string;
  uncertain: string;
  held: string;
}>;
function LocaleChoices() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {journeyLocales.map(({ code }) => (
        <button key={code} onClick={() => changeLocale(code)}>
          Use {code}
        </button>
      ))}
    </>
  );
}
function deferredResponse() {
  let settle: (value: Response) => void = () => {
    throw new Error('No deferred boundary resolver');
  };
  const promise = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    settle: async (body: unknown, status = 200) => {
      await act(async () => {
        settle(Response.json(body, { status }));
      });
    },
  };
}
type RecordedCommand = {
  path: string;
  body: BodyInit | null | undefined;
  key: string | null;
  companyId: string | null;
};
function installJourney() {
  const state: {
    activityReply?: Promise<Response>;
    activityStatus: number;
    events: unknown[];
    requests: boolean;
    forbidDetail: boolean;
    detailReplies: Array<Promise<Response>>;
    exactReplies: Map<string, Promise<Response>>;
    signals: Map<string, AbortSignal | null | undefined>;
    gets: Array<{ path: string; companyId: string }>;
    commands: RecordedCommand[];
    nextActionReply?: Promise<Response>;
    saved: boolean;
  } = {
    activityStatus: 200,
    events: heterogeneousActivityEvents,
    requests: true,
    forbidDetail: false,
    detailReplies: [],
    exactReplies: new Map(),
    signals: new Map(),
    gets: [],
    commands: [],
    saved: false,
  };
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = new URL(input.toString(), 'http://localhost').pathname;
    const company =
      new Headers(init?.headers).get('x-company-context-id') ??
      activityLocaleIds.company;
    if ((init?.method ?? 'GET') !== 'GET') {
      state.commands.push({
        path,
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
        companyId: company,
      });
      if (path !== activityNextActionPath || init?.method !== 'POST')
        throw new Error('Unexpected Activity journey mutation');
      if (state.commands.length === 1)
        return state.nextActionReply ?? new Response(null, { status: 503 });
      state.saved = true;
      return Response.json({
        receipt: {
          opportunityId: activityLocaleIds.opportunity,
          nextAction: activityDraft,
          version: 3,
          outcome: 'updated',
        },
        request: activitySavedRequest(),
      });
    }
    state.gets.push({ path, companyId: company });
    state.signals.set(path, init?.signal);
    if (path === '/api/activity-log')
      return (
        state.activityReply ??
        Response.json(
          { events: company === activityLocaleIds.company ? state.events : [] },
          { status: state.activityStatus },
        )
      );
    if (path === activityDetailPath) {
      if (state.forbidDetail) return Response.json({}, { status: 403 });
      const pending = state.detailReplies.shift();
      if (pending) return pending;
    }
    const pending = state.exactReplies.get(path);
    if (pending) return pending;
    return Response.json(
      readActivityJourneyFixture({
        path,
        companyId: company,
        requests: state.requests,
        saved: state.saved,
      }),
    );
  });
  vi.stubGlobal('fetch', fetch);
  return { state, fetch };
}
function renderJourney(identity = deterministicBrowserIdentity()) {
  window.history.replaceState(null, '', '/?frame=prisme#activity');
  return render(journeyUi(identity));
}
function journeyUi(identity = deterministicBrowserIdentity()) {
  return (
    <InterfaceLocaleProvider>
      <LocaleChoices />
      <App identity={identity} />
    </InterfaceLocaleProvider>
  );
}
async function goTo(section: 'activity' | 'requests') {
  let link: HTMLElement | undefined;
  await waitFor(() => {
    link = screen
      .getAllByRole('link')
      .find((candidate) => candidate.getAttribute('href') === '#' + section);
    expect(
      link,
      'The navigation must be offered after Company revalidation',
    ).toBeDefined();
  });
  if (!link) throw new Error('Expected the currently offered navigation.');
  fireEvent.click(link);
}
function switchJourneyLocale(code: InterfaceLocale) {
  fireEvent.click(screen.getByRole('button', { name: 'Use ' + code }));
}
function latestActivityRows(title: string) {
  return within(screen.getByRole('region', { name: title })).getAllByRole(
    'listitem',
  );
}

it.each(journeyLocales)(
  'renders a delayed admitted page in the currently selected $code language without another read',
  async (locale) => {
    const boundary = installJourney();
    const late = deferredResponse();
    boundary.state.activityReply = late.promise;
    renderJourney();
    await screen.findByText('Loading activity…');
    const before = boundary.fetch.mock.calls.length;
    switchJourneyLocale(locale.code);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    expect(boundary.fetch).toHaveBeenCalledTimes(before);
    await late.settle({ events: heterogeneousActivityEvents });
    const rows = latestActivityRows(locale.title);
    expect(rows).toHaveLength(11);
    expect(rows[0]).toHaveTextContent(
      `Alex {literal} — Știință / Имя ${locale.created}`,
    );
    expect(rows[0]).toHaveTextContent(activityLocaleIds.request);
    expect(rows[6]).toHaveTextContent(activityLiteral);
    expect(rows[7]?.querySelector('time')).toBeNull();
    expect(rows[7]?.querySelector('button')).toBeNull();
    expect(rows[7]).not.toHaveTextContent('Alex');
    expect(rows[7]).not.toHaveTextContent('2026');
    expect(rows[7]).not.toHaveTextContent('projection-client.union_confirmed');
    expect(boundary.fetch).toHaveBeenCalledTimes(before);
    expect(boundary.state.commands).toEqual([]);
  },
);

it.each([200, 503])(
  'preserves a loaded empty/error state without a locale-triggered retry (%s)',
  async (status) => {
    const boundary = installJourney();
    boundary.state.events = [];
    boundary.state.activityStatus = status;
    renderJourney();
    await screen.findByText(
      status === 200
        ? 'No activity has been recorded in this workspace yet.'
        : 'We could not load the Activity Log. Please try again.',
    );
    const before = boundary.fetch.mock.calls.length;
    for (const locale of journeyLocales) {
      switchJourneyLocale(locale.code);
      const region = screen.getByRole('region', { name: locale.title });
      expect(
        within(region).getByText(status === 200 ? locale.empty : locale.error),
      ).toBeVisible();
      expect(within(region).queryByRole('button')).toBeNull();
      expect(boundary.fetch).toHaveBeenCalledTimes(before);
    }
    expect(boundary.state.commands).toEqual([]);
  },
);

it.each(['offer', 'contract'] as const)(
  'keeps the exact historical %s intent through locale changes and a delayed read',
  async (kind) => {
    const boundary = installJourney();
    const exactPath =
      kind === 'offer'
        ? `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`
        : `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`;
    const late = deferredResponse();
    boundary.state.exactReplies.set(exactPath, late.promise);
    renderJourney();
    fireEvent.click(
      await screen.findByRole('button', {
        name:
          kind === 'offer' ? 'Open Offer Version' : 'Open agreement version',
      }),
    );
    await waitFor(() =>
      expect(boundary.state.signals.has(exactPath)).toBe(true),
    );
    const before = boundary.fetch.mock.calls.length;
    for (const locale of journeyLocales) {
      switchJourneyLocale(locale.code);
      expect(boundary.fetch).toHaveBeenCalledTimes(before);
      expect(boundary.state.signals.get(exactPath)?.aborted).toBe(false);
    }
    await late.settle(readActivityJourneyFixture({ path: exactPath }));
    expect(
      await screen.findByText(
        kind === 'offer'
          ? 'Historical Offer conditions {original} — Оферта'
          : 'Historical Contract conditions {original} — Договор',
      ),
    ).toBeVisible();
    expect(
      boundary.state.gets.filter(({ path }) => path === exactPath),
    ).toHaveLength(1);
    expect(
      boundary.state.gets.some(({ path }) =>
        path.endsWith(
          kind === 'offer'
            ? '/versions/offer-successor-703'
            : '/versions/contract-successor-703',
        ),
      ),
    ).toBe(false);
    expect(boundary.state.commands).toEqual([]);
  },
);

it.each(['offer', 'contract'] as const)(
  'keeps safe unavailable feedback for an unreadable exact %s Version after locale change',
  async (kind) => {
    const boundary = installJourney();
    const exactPath =
      kind === 'offer'
        ? `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`
        : `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`;
    const late = deferredResponse();
    boundary.state.exactReplies.set(exactPath, late.promise);
    renderJourney();
    fireEvent.click(
      await screen.findByRole('button', {
        name:
          kind === 'offer' ? 'Open Offer Version' : 'Open agreement version',
      }),
    );
    await waitFor(() =>
      expect(boundary.state.signals.has(exactPath)).toBe(true),
    );
    const reads = boundary.fetch.mock.calls.length;
    switchJourneyLocale('fr');
    expect(boundary.fetch).toHaveBeenCalledTimes(reads);
    await late.settle({}, 404);
    expect(
      await screen.findByText(
        kind === 'offer'
          ? 'L’Offre n’a pas pu être chargée. Réessayez.'
          : 'Le contrat n’a pas pu être chargé. Réessayez.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Historical Offer conditions {original} — Оферта'),
    ).toBeNull();
    expect(
      screen.queryByText('Historical Contract conditions {original} — Договор'),
    ).toBeNull();
    expect(
      boundary.state.gets.filter(({ path }) => path === exactPath),
    ).toHaveLength(1);
    expect(boundary.state.commands).toEqual([]);
  },
);

it('preserves a literal protected draft and pending/uncertain command while the latest held Version intent wins', async () => {
  const boundary = installJourney();
  const pendingWrite = deferredResponse();
  boundary.state.nextActionReply = pendingWrite.promise;
  renderJourney();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Open Request',
      description: `Target: Client Request: ${activityLocaleIds.request}`,
    }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit next action' }),
  );
  changeValue(screen.getByLabelText('Next action'), activityDraft);
  await goTo('activity');
  fireEvent.click(screen.getByRole('button', { name: 'Open Offer Version' }));
  expect(
    await screen.findByText(
      'The requested Client Request opens after the next-action edit is saved or cancelled.',
      { selector: '[role="status"]' },
    ),
  ).toBeVisible();
  const draftNode = screen.getByLabelText('Next action');
  const before = boundary.fetch.mock.calls.length;
  for (const locale of journeyLocales) {
    switchJourneyLocale(locale.code);
    expect(screen.getByLabelText(locale.next)).toBe(draftNode);
    expect(draftNode).toHaveValue(activityDraft);
    expect(
      screen.getByText(locale.held, { selector: '[role="status"]' }),
    ).toBeVisible();
    expect(boundary.fetch).toHaveBeenCalledTimes(before);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save next action' }));
  await waitFor(() => expect(boundary.state.commands).toHaveLength(1));
  const pendingReads = boundary.fetch.mock.calls.length;
  switchJourneyLocale('ro');
  expect(screen.getByLabelText('Acțiunea următoare')).toBe(draftNode);
  expect(draftNode).toBeDisabled();
  expect(boundary.fetch).toHaveBeenCalledTimes(pendingReads);
  await pendingWrite.settle({}, 503);
  for (const locale of journeyLocales) {
    const count = boundary.fetch.mock.calls.length;
    switchJourneyLocale(locale.code);
    expect(
      screen.getByText(locale.uncertain, { selector: '[role="alert"]' }),
    ).toBeVisible();
    expect(screen.getByLabelText(locale.next)).toBe(draftNode);
    expect(draftNode).toHaveValue(activityDraft);
    expect(draftNode).toBeDisabled();
    expect(boundary.fetch).toHaveBeenCalledTimes(count);
    expect(boundary.state.commands).toHaveLength(1);
  }
  await goTo('activity');
  fireEvent.click(
    screen.getByRole('button', { name: 'Open agreement version' }),
  );
  expect(
    await screen.findByText(
      'The requested Client Request opens after the next-action edit is saved or cancelled.',
      { selector: '[role="status"]' },
    ),
  ).toBeVisible();
  expect(
    boundary.state.gets.some(
      ({ path }) =>
        path ===
          `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}` ||
        path ===
          `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
    ),
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry update' }));
  expect(
    await screen.findByText(
      'Historical Contract conditions {original} — Договор',
    ),
  ).toBeVisible();
  expect(boundary.state.commands).toHaveLength(2);
  expect(boundary.state.commands[0]).toEqual(boundary.state.commands[1]);
  expect(boundary.state.commands[0]?.key).toBeTruthy();
  expect(boundary.state.commands[0]?.path).toBe(activityNextActionPath);
  expect(boundary.state.commands[0]?.companyId).toBe(activityLocaleIds.company);
  expect(boundary.state.commands[0]?.body).toBe(
    JSON.stringify({ expectedVersion: 2, nextAction: activityDraft }),
  );
  expect(
    boundary.state.gets.filter(
      ({ path }) =>
        path ===
        `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
    ),
  ).toHaveLength(1);
  expect(
    boundary.state.gets.filter(
      ({ path }) =>
        path ===
        `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`,
    ),
  ).toEqual([]);
});

it('retires a delayed exact Version on Company change and never revives it after the Company returns', async () => {
  const boundary = installJourney();
  const exact = `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`;
  const late = deferredResponse();
  boundary.state.exactReplies.set(exact, late.promise);
  renderJourney();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open agreement version' }),
  );
  await waitFor(() => expect(boundary.state.signals.has(exact)).toBe(true));
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    activityLocaleIds.otherCompany,
  );
  await screen.findByText(
    'No activity has been recorded in this workspace yet.',
  );
  expect(boundary.state.signals.get(exact)?.aborted).toBe(true);
  const before = boundary.fetch.mock.calls.length;
  switchJourneyLocale('fr');
  expect(boundary.fetch).toHaveBeenCalledTimes(before);
  await late.settle(readActivityJourneyFixture({ path: exact }));
  expect(
    screen.queryByText('Historical Contract conditions {original} — Договор'),
  ).toBeNull();
  switchJourneyLocale('en');
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    activityLocaleIds.company,
  );
  await goTo('requests');
  await screen.findByRole('button', { name: /Activity Request \{literal\}/u });
  expect(
    screen.queryByText('Historical Contract conditions {original} — Договор'),
  ).toBeNull();
  expect(boundary.state.gets.filter(({ path }) => path === exact)).toHaveLength(
    1,
  );
  expect(boundary.state.commands).toEqual([]);
});

it('retires target actions when real Requests authority is lost and does not replay on regrant', async () => {
  const boundary = installJourney();
  renderJourney();
  await screen.findByRole('button', {
    name: 'Open Request',
    description: `Target: Client Request: ${activityLocaleIds.request}`,
  });
  boundary.state.requests = false;
  boundary.state.forbidDetail = true;
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Open Request',
      description: `Target: Client Request: ${activityLocaleIds.request}`,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole('button', {
        name: 'Open Request',
        description: `Target: Client Request: ${activityLocaleIds.request}`,
      }),
    ).toBeNull(),
  );
  const before = boundary.fetch.mock.calls.length;
  switchJourneyLocale('ro');
  expect(
    screen.queryByRole('button', { name: 'Deschideți cererea' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Deschideți versiunea ofertei' }),
  ).toBeNull();
  expect(boundary.fetch).toHaveBeenCalledTimes(before);
  boundary.state.requests = true;
  boundary.state.forbidDetail = false;
  switchJourneyLocale('en');
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    activityLocaleIds.otherCompany,
  );
  await screen.findByText(
    'No activity has been recorded in this workspace yet.',
  );
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    activityLocaleIds.company,
  );
  await goTo('requests');
  await screen.findByRole('button', { name: /Activity Request \{literal\}/u });
  expect(
    screen.queryByText('Original Request evidence {literal} — Источник'),
  ).toBeNull();
  expect(
    boundary.state.gets.filter(({ path }) => path === activityDetailPath),
  ).toHaveLength(1);
  expect(boundary.state.commands).toEqual([]);
});

it('aborts a locale-preserved exact read on session loss and ignores its late content', async () => {
  const boundary = installJourney();
  const exact = `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`;
  const late = deferredResponse();
  boundary.state.exactReplies.set(exact, late.promise);
  const identity = deterministicBrowserIdentity();
  const view = renderJourney(identity);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Open Offer Version' }),
  );
  await waitFor(() => expect(boundary.state.signals.has(exact)).toBe(true));
  const before = boundary.fetch.mock.calls.length;
  switchJourneyLocale('fr');
  expect(boundary.fetch).toHaveBeenCalledTimes(before);
  view.rerender(journeyUi({ ...identity, signedIn: false }));
  expect(boundary.state.signals.get(exact)?.aborted).toBe(true);
  await late.settle(readActivityJourneyFixture({ path: exact }));
  expect(
    screen.queryByText('Historical Offer conditions {original} — Оферта'),
  ).toBeNull();
  expect(screen.queryByText(activityLiteral)).toBeNull();
  expect(boundary.state.commands).toEqual([]);
});
