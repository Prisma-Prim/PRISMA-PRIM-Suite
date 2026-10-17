import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  interfaceLocales,
  type InterfaceLocale,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { changeValue } from '../test/select-option';
import { TariffVersionPanel } from './TariffVersionPanel';

const offeringId = '10000000-0000-4000-8000-000000000660';
const actor: ActorContext = {
  internalUserId: 'user-660',
  workspaceMembershipId: 'membership-660',
  workspaceId: 'workspace-660',
  workspaceName: 'Workspace {original}',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-660',
    displayName: 'Companie {originală} / Компания',
    clientPermissions: [],
    pricingConfigurationPermissions: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
  },
};

function LocaleControl() {
  const { changeLocale } = useInterfaceLocale();
  return interfaceLocales.map((locale) => (
    <button key={locale} onClick={() => changeLocale(locale)}>
      {locale}
    </button>
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

type CapturedRequest = {
  path: string;
  method: string;
  body: BodyInit | null | undefined;
  company: string | null;
  key: string | null;
};

function renderScenario(
  handle?: (
    url: URL,
    init?: RequestInit,
  ) => Response | Promise<Response> | undefined,
) {
  const requests: CapturedRequest[] = [];
  const rejectCompany = vi.fn();
  const acceptActor = vi.fn();
  const rejectWorkspace = vi.fn();
  const identity = deterministicBrowserIdentity();
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost');
      const headers = new Headers(init?.headers);
      requests.push({
        path: url.pathname + url.search,
        method: init?.method ?? 'GET',
        body: init?.body,
        company: headers.get('x-company-context-id'),
        key: headers.get('idempotency-key'),
      });
      const handled = handle?.(url, init);
      if (handled !== undefined) return Promise.resolve(handled);
      if (init?.method === 'POST')
        throw new Error(`Unexpected command ${url.pathname}`);
      if (url.pathname === '/api/commercial-catalogue/offerings')
        return Promise.resolve(
          Response.json({
            items: [
              {
                id: offeringId,
                serviceDefinition: {
                  code: 'CODE-{original}',
                  name: 'Serviciu / Услуга',
                },
                commercialLabel: 'Libellé {literal}',
              },
            ],
          }),
        );
      if (url.pathname.endsWith('/tariff-scope'))
        return Promise.resolve(
          Response.json({
            offeringId,
            current: null,
            headVersionNumber: null,
            provisional: true,
          }),
        );
      if (url.pathname.endsWith('/tariff-versions'))
        return Promise.resolve(Response.json({ items: [], provisional: true }));
      throw new Error(`Unexpected request ${url.pathname}`);
    }),
  );
  const ui = (currentActor: ActorContext) => (
    <InterfaceLocaleProvider>
      <LocaleControl />
      <TariffVersionPanel
        actor={currentActor}
        identity={identity}
        onCompanyContextRejected={rejectCompany}
        onActorRevalidated={acceptActor}
        onWorkspaceAccessRejected={rejectWorkspace}
      />
    </InterfaceLocaleProvider>
  );
  const view = render(ui(actor));
  return {
    requests,
    rejectCompany,
    acceptActor,
    rejectWorkspace,
    rerender: (currentActor: ActorContext) => view.rerender(ui(currentActor)),
  };
}

async function chooseInitialOffering() {
  changeValue(
    await screen.findByLabelText('Company Service Offering'),
    offeringId,
  );
  await screen.findByText(
    'The new version will be the first for this offering.',
  );
}

function fillValidDraft() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const [label, value] of [
    ['Unit', ' zi {unit} / день '],
    ['Unit amount', '123.4500'],
    ['Tax rate percent', '12.30'],
    ['Tax label', ' Taxă {tax} / Налог '],
    [`Effective from (${zone})`, '2027-06-01T09:00'],
    [`Effective until, optional (${zone})`, '2027-07-01T09:00'],
  ])
    changeValue(screen.getByLabelText(label), value);
  changeValue(screen.getByLabelText('Currency'), 'EUR');
}

function changeLocale(locale: InterfaceLocale) {
  fireEvent.click(screen.getByRole('button', { name: locale }));
}

function recordedVersion(versionNumber = 1) {
  return {
    id: `tariff-${versionNumber}`,
    offeringId,
    versionNumber,
    unit: ' zi {unit} / день ',
    unitAmount: '1234567.8900',
    currency: 'EUR',
    taxRatePercent: '100.00',
    taxLabel: ' Taxă {tax} / Налог ',
    effectiveFrom: '2027-06-01T09:00:00.000Z',
    effectiveTo: null,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state: 'CURRENT',
    supersession: null,
    createdByWorkspaceMembershipId: actor.workspaceMembershipId,
    createdAt: '2027-06-01T08:00:00.000Z',
  };
}

it('retains the captured uncertain publication through language changes, invalid edits and explicit reload, then resolves a named refusal before a new intention', async () => {
  vi.stubEnv('TZ', 'UTC');
  let finish: ((response: Response) => void) | undefined;
  const held = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let commandCount = 0;
  let advanced = false;
  const scenario = renderScenario((url, init) => {
    if (advanced && url.pathname.endsWith('/tariff-scope'))
      return Response.json({
        offeringId,
        current: recordedVersion(7),
        headVersionNumber: 7,
        provisional: true,
      });
    if (
      advanced &&
      url.pathname.endsWith('/tariff-versions') &&
      init?.method !== 'POST'
    )
      return Response.json({ items: [recordedVersion(7)], provisional: true });
    if (init?.method !== 'POST') return undefined;
    commandCount += 1;
    if (commandCount === 1) return held;
    if (commandCount === 2)
      return Response.json(
        {
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'Raw English server prose must never be the interface contract.',
        },
        { status: 409 },
      );
    return Response.json(
      {
        code: 'VALIDATION_ERROR',
        field: 'taxLabel',
        message: 'Raw English tax label prose.',
      },
      { status: 400 },
    );
  });
  await chooseInitialOffering();
  fillValidDraft();
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  await waitFor(() =>
    expect(scenario.requests.filter((r) => r.method === 'POST')).toHaveLength(
      1,
    ),
  );
  const first = scenario.requests.find((r) => r.method === 'POST');
  if (!first) throw new Error('Publication was not dispatched.');
  expect(first.path).toBe(
    `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
  );
  expect(first.company).toBe('company-660');
  expect(first.key).toEqual(expect.any(String));
  expect(first.key).not.toBe('');
  const expectedCommand = {
    unit: ' zi {unit} / день ',
    unitAmount: '123.4500',
    currency: 'EUR',
    taxRatePercent: '12.30',
    taxLabel: ' Taxă {tax} / Налог ',
    effectiveFrom: '2027-06-01T09:00:00.000Z',
    effectiveTo: '2027-07-01T09:00:00.000Z',
    expectedActiveVersionNumber: null,
  };
  expect(first.body).toBe(JSON.stringify(expectedCommand));
  const pendingBaseline = [...scenario.requests];
  changeLocale('fr');
  expect(
    screen.getByRole('button', { name: 'Publier la version de tarif' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Montant unitaire')).toHaveValue('123.4500');
  expect(scenario.requests).toEqual(pendingBaseline);
  await act(async () => {
    if (!finish) throw new Error('Held response was not captured.');
    finish(
      Response.json(
        { statusCode: 500, message: 'Internal server error' },
        { status: 500 },
      ),
    );
  });
  await screen.findByRole('button', {
    name: 'Réessayer la publication du tarif',
  });
  changeValue(screen.getByLabelText('Montant unitaire'), '00.50');
  const unresolvedBaseline = [...scenario.requests];
  changeLocale('ru');
  expect(screen.getByLabelText('Сумма за единицу')).toHaveValue('00.50');
  expect(
    screen.getByRole('button', { name: 'Опубликовать версию тарифа' }),
  ).toBeDisabled();
  expect(scenario.requests).toEqual(unresolvedBaseline);
  const form = screen
    .getByRole('button', { name: 'Опубликовать версию тарифа' })
    .closest('form');
  if (!form) throw new Error('Publication form is absent.');
  fireEvent.submit(form);
  expect(scenario.requests).toEqual(unresolvedBaseline);
  advanced = true;
  fireEvent.click(
    screen.getByRole('button', { name: 'Перезагрузить версии тарифа' }),
  );
  await screen.findByText(
    'Новая версия последует за последней опубликованной версией 7 этого предложения.',
  );
  expect(scenario.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  expect(screen.getByLabelText('Сумма за единицу')).toHaveValue('00.50');
  fireEvent.click(
    screen.getByRole('button', { name: 'Повторить публикацию тарифа' }),
  );
  await screen.findByText('По этому запросу ничего не опубликовано:', {
    exact: false,
  });
  const commands = scenario.requests.filter((r) => r.method === 'POST');
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(first);
  expect(
    screen.queryByRole('button', { name: 'Повторить публикацию тарифа' }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Опубликовать версию тарифа' }),
  ).toBeEnabled();
  const resolvedBaseline = [...scenario.requests];
  changeLocale('en');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Nothing was published with that request:',
  );
  expect(scenario.requests).toEqual(resolvedBaseline);
  changeValue(screen.getByLabelText('Unit amount'), '123.4500');
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  await screen.findByText('Enter a tax label of 1 to 60 characters.');
  const last = scenario.requests.filter((r) => r.method === 'POST').at(-1);
  expect(last?.key).not.toBe(first.key);
  expect(last?.body).toBe(
    JSON.stringify({ ...expectedCommand, expectedActiveVersionNumber: 7 }),
  );
  const refusedBaseline = [...scenario.requests];
  changeLocale('fr');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Saisissez un libellé de taxe de 1 à 60 caractères.',
  );
  expect(screen.getByLabelText('Libellé de taxe')).toHaveValue(
    ' Taxă {tax} / Налог ',
  );
  expect(screen.queryByText(/Raw English/u)).not.toBeInTheDocument();
  expect(scenario.requests).toEqual(refusedBaseline);
  expect(scenario.rejectCompany).not.toHaveBeenCalled();
  expect(scenario.acceptActor).not.toHaveBeenCalled();
  expect(scenario.rejectWorkspace).not.toHaveBeenCalled();
});

it('retranslates validated DST gap and fold feedback while retaining the original field, zone and wall-clock draft', async () => {
  vi.stubEnv('TZ', 'Europe/Bucharest');
  const scenario = renderScenario();
  await chooseInitialOffering();
  fillValidDraft();
  const from = screen.getByLabelText('Effective from (Europe/Bucharest)');
  const until = screen.getByLabelText(
    'Effective until, optional (Europe/Bucharest)',
  );
  changeValue(from, '2027-03-28T03:30');
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The start does not exist in Europe/Bucharest:',
  );
  const baseline = [...scenario.requests];
  changeLocale('ro');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Începutul nu există în Europe/Bucharest:',
  );
  expect(from).toHaveValue('2027-03-28T03:30');
  changeLocale('fr');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Le début n’existe pas dans le fuseau Europe/Bucharest',
  );
  changeLocale('en');
  changeValue(from, '2027-10-31T02:59:59');
  changeValue(until, '2027-10-31T03:30');
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The end is ambiguous in Europe/Bucharest:',
  );
  changeLocale('ru');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Окончание неоднозначно в часовом поясе Europe/Bucharest:',
  );
  expect(until).toHaveValue('2027-10-31T03:30');
  expect(from).toHaveValue('2027-10-31T02:59:59.000');
  expect(scenario.requests).toEqual(baseline);
});

it('localizes exact decimal and version presentation while retaining schedule, history order and canonical instants', async () => {
  vi.stubEnv('TZ', 'UTC');
  const current = recordedVersion(1000);
  const next = {
    ...recordedVersion(1001),
    state: 'SCHEDULED',
    effectiveFrom: '2027-07-01T09:00:00.000Z',
  };
  const head = {
    ...recordedVersion(1002),
    state: 'SCHEDULED',
    effectiveFrom: '2027-08-01T09:00:00.000Z',
  };
  const scenario = renderScenario((url) => {
    if (url.pathname.endsWith('/tariff-scope'))
      return Response.json({
        offeringId,
        current,
        headVersionNumber: 1002,
        provisional: true,
      });
    if (url.pathname.endsWith('/tariff-versions'))
      return Response.json(
        url.searchParams.has('cursor')
          ? { items: [next, current], provisional: true }
          : { items: [head], nextCursor: 'older-{literal}', provisional: true },
      );
    return undefined;
  });
  changeValue(
    await screen.findByLabelText('Company Service Offering'),
    offeringId,
  );
  await screen.findByText(
    'The new version will follow head version 1,002 of this offering.',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Show older Tariff Versions' }),
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByRole('list', { name: 'Tariff Versions' }),
      ).getAllByRole('listitem'),
    ).toHaveLength(3),
  );
  const baseline = [...scenario.requests];
  for (const [
    locale,
    title,
    currentTitle,
    scheduledTitle,
    amount,
    versionNames,
    month,
  ] of [
    [
      'ro',
      'Versiunile tarifului',
      'Versiunea curentă a tarifului',
      'Versiuni succesoare de tarif programate',
      '1.234.567,8900 EUR pe',
      ['Versiunea 1.002', 'Versiunea 1.001', 'Versiunea 1.000'],
      'iun.',
    ],
    [
      'ru',
      'Версии тарифа',
      'Текущая версия тарифа',
      'Запланированные последующие версии тарифа',
      '1\u00a0234\u00a0567,8900 EUR за',
      ['Версия 1\u00a0002', 'Версия 1\u00a0001', 'Версия 1\u00a0000'],
      'июн.',
    ],
    [
      'fr',
      'Versions du tarif',
      'Version courante du tarif',
      'Versions de tarif successives programmées',
      '1\u202f234\u202f567,8900 EUR par',
      ['Version 1\u202f002', 'Version 1\u202f001', 'Version 1\u202f000'],
      'juin',
    ],
    [
      'en',
      'Tariff Versions',
      'Current Tariff Version',
      'Scheduled Tariff successors',
      '1,234,567.8900 EUR per',
      ['Version 1,002', 'Version 1,001', 'Version 1,000'],
      'Jun',
    ],
  ] as const) {
    changeLocale(locale);
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    const region = screen.getByRole('region', { name: currentTitle });
    expect(region.textContent).toContain(amount);
    expect(region.textContent).toContain(' Taxă {tax} / Налог ');
    expect(region.querySelector('time')).toHaveAttribute(
      'datetime',
      '2027-06-01T09:00:00.000Z',
    );
    expect(region.querySelector('time')).toHaveTextContent(month);
    const versions = within(
      screen.getByRole('list', { name: title }),
    ).getAllByRole('listitem');
    expect(
      versions.map((item) => item.querySelector('strong')?.textContent),
    ).toEqual(versionNames);
    const scheduled = within(
      screen.getByRole('list', { name: scheduledTitle }),
    ).getAllByRole('listitem');
    expect(scheduled).toHaveLength(2);
    expect(
      scheduled.map((item) =>
        item.querySelector('time')?.getAttribute('datetime'),
      ),
    ).toEqual(['2027-07-01T09:00:00.000Z', '2027-08-01T09:00:00.000Z']);
    expect(scenario.requests).toEqual(baseline);
  }
});

it('retires a held publication when the Company changes after a locale switch and suppresses the late result', async () => {
  vi.stubEnv('TZ', 'UTC');
  let finish: ((response: Response) => void) | undefined;
  const held = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const scenario = renderScenario((url, init) => {
    if (init?.method === 'POST') return held;
    if (
      url.pathname === '/api/commercial-catalogue/offerings' &&
      new Headers(init?.headers).get('x-company-context-id') === 'company-new'
    )
      return Response.json({ items: [] });
    return undefined;
  });
  await chooseInitialOffering();
  fillValidDraft();
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  await waitFor(() =>
    expect(scenario.requests.filter((r) => r.method === 'POST')).toHaveLength(
      1,
    ),
  );
  changeLocale('fr');
  if (!actor.activeCompany)
    throw new Error('Synthetic Company fixture is absent.');
  scenario.rerender({
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      id: 'company-new',
      displayName: 'Nouvelle {literal} / Компания',
    },
  });
  await screen.findByText(
    'Aucune prestation n’est encore enregistrée pour cette Compagnie.',
    { exact: false },
  );
  await act(async () => {
    if (!finish) throw new Error('Held publication was not captured.');
    finish(
      Response.json(
        { outcome: 'PUBLISHED', version: recordedVersion() },
        { status: 201 },
      ),
    );
  });
  expect(
    screen.queryByText('Version de tarif 1 publiée.'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Réessayer la publication du tarif' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Montant unitaire')).not.toBeInTheDocument();
  expect(
    screen.getByText('Nouvelle {literal} / Компания', { exact: false }),
  ).toBeVisible();
  const commands = scenario.requests.filter((r) => r.method === 'POST');
  expect(commands).toHaveLength(1);
  expect(commands[0]?.company).toBe('company-660');
});

it.each([
  ['unit', 'Saisissez une unité de 1 à 24 caractères.'],
  ['unitAmount', 'Saisissez un montant unitaire strictement positif'],
  ['currency', 'Choisissez une devise : MDL, EUR, RON ou USD.'],
  ['taxRatePercent', 'Saisissez un taux de taxe de 0 à 100'],
  ['taxLabel', 'Saisissez un libellé de taxe de 1 à 60 caractères.'],
  [
    'effectiveFrom',
    'Saisissez un début et, facultativement, une fin postérieure au début.',
  ],
  [
    'effectiveTo',
    'Saisissez un début et, facultativement, une fin postérieure au début.',
  ],
])(
  'retranslates a validated API field refusal for %s without displaying raw server text',
  async (field, frenchMessage) => {
    vi.stubEnv('TZ', 'UTC');
    const scenario = renderScenario((_url, init) =>
      init?.method === 'POST'
        ? Response.json(
            {
              code: 'VALIDATION_ERROR',
              field,
              message: `Raw English server message for ${field}`,
            },
            { status: 400 },
          )
        : undefined,
    );
    await chooseInitialOffering();
    fillValidDraft();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish Tariff Version' }),
    );
    await screen.findByRole('alert');
    const baseline = [...scenario.requests];
    changeLocale('fr');
    expect(screen.getByRole('alert')).toHaveTextContent(frenchMessage);
    expect(
      screen.queryByText(/Raw English server message/u),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Publier la version de tarif' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Réessayer la publication du tarif',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Montant unitaire')).toHaveValue('123.4500');
    expect(scenario.requests).toEqual(baseline);
  },
);

it.each([
  [400, 'VALIDATION_ERROR', 'Vérifiez la version de tarif :'],
  [
    400,
    'EFFECTIVE_FROM_PAST',
    'Choisissez un début qui ne précède pas l’instant présent.',
  ],
  [
    400,
    'EFFECTIVE_FROM_NOT_ADVANCING',
    'Choisissez un début postérieur au début de la dernière version publiée.',
  ],
  [
    409,
    'EFFECTIVE_WINDOW_GAP',
    'La dernière version publiée se termine avant ce début.',
  ],
  [
    409,
    'VERSION_EXHAUSTED',
    'Aucun autre numéro de version de tarif ne peut être attribué.',
  ],
  [409, 'IDEMPOTENCY_CONFLICT', 'Rien n’a été publié avec cette requête :'],
] as const)(
  'preserves the definite classification of %i:%s while retranslating its named refusal',
  async (status, code, frenchMessage) => {
    vi.stubEnv('TZ', 'UTC');
    const scenario = renderScenario((_url, init) =>
      init?.method === 'POST'
        ? Response.json(
            { code, message: 'Untrusted English explanation' },
            { status },
          )
        : undefined,
    );
    await chooseInitialOffering();
    fillValidDraft();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish Tariff Version' }),
    );
    await screen.findByRole('alert');
    const baseline = [...scenario.requests];
    changeLocale('fr');
    expect(screen.getByRole('alert')).toHaveTextContent(frenchMessage);
    expect(
      screen.getByRole('button', { name: 'Publier la version de tarif' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', {
        name: 'Réessayer la publication du tarif',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Untrusted English explanation'),
    ).not.toBeInTheDocument();
    expect(scenario.requests).toEqual(baseline);
  },
);

it.each([
  {
    name: 'wrong status for validation',
    status: 409,
    body: { code: 'VALIDATION_ERROR', field: 'unit' },
  },
  {
    name: 'wrong status for version exhaustion',
    status: 400,
    body: { code: 'VERSION_EXHAUSTED' },
  },
  {
    name: 'server refusal-looking response',
    status: 500,
    body: { code: 'EFFECTIVE_FROM_PAST' },
  },
  { name: 'unknown conflict', status: 409, body: { code: 'UNKNOWN_CONFLICT' } },
  {
    name: 'malformed stale head',
    status: 409,
    body: { code: 'STALE_ACTIVE_VERSION', headVersionNumber: '4' },
  },
  {
    name: 'malformed publication',
    status: 201,
    body: { outcome: 'PUBLISHED', version: { versionNumber: 4 } },
  },
  {
    name: 'cross-offering publication',
    status: 201,
    body: {
      outcome: 'PUBLISHED',
      version: { ...recordedVersion(), offeringId: 'another-offering' },
    },
  },
])(
  'keeps $name uncertain and retries only the original bytes after a language change',
  async ({ status, body }) => {
    vi.stubEnv('TZ', 'UTC');
    const scenario = renderScenario((_url, init) =>
      init?.method === 'POST' ? Response.json(body, { status }) : undefined,
    );
    await chooseInitialOffering();
    fillValidDraft();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish Tariff Version' }),
    );
    await screen.findByRole('button', { name: 'Retry Tariff publication' });
    const baseline = [...scenario.requests];
    changeLocale('fr');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Le résultat de la publication est incertain.',
    );
    expect(
      screen.getByRole('button', { name: 'Publier la version de tarif' }),
    ).toBeDisabled();
    expect(scenario.requests).toEqual(baseline);
    fireEvent.click(
      screen.getByRole('button', { name: 'Réessayer la publication du tarif' }),
    );
    await waitFor(() =>
      expect(scenario.requests.filter((r) => r.method === 'POST')).toHaveLength(
        2,
      ),
    );
    const commands = scenario.requests.filter((r) => r.method === 'POST');
    expect(commands[1]).toEqual(commands[0]);
    await screen.findByRole('button', {
      name: 'Réessayer la publication du tarif',
    });
  },
);

it('retranslates the selected Tariff owner while preserving literal draft nodes, focus and authenticated reads', async () => {
  vi.stubEnv('TZ', 'UTC');
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const requests: { path: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      requests.push({ path, method: init?.method ?? 'GET' });
      if (path === '/api/commercial-catalogue/offerings')
        return Response.json({
          items: [
            {
              id: offeringId,
              serviceDefinition: {
                code: 'SERVICE-{original}',
                name: 'Serviciu {original} / Услуга',
              },
              commercialLabel: 'Libellé {literal}',
            },
          ],
        });
      if (path.endsWith('/tariff-scope'))
        return Response.json({
          offeringId,
          current: null,
          headVersionNumber: null,
          provisional: true,
        });
      if (path.endsWith('/tariff-versions'))
        return Response.json({ items: [], provisional: true });
      throw new Error(`Unexpected request ${path}`);
    }),
  );
  render(
    <InterfaceLocaleProvider>
      <LocaleControl />
      <TariffVersionPanel
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
  changeValue(
    await screen.findByLabelText('Company Service Offering'),
    offeringId,
  );
  // Both explicit scope/list reads have completed before the no-I/O baseline.
  await screen.findByText(
    'The new version will be the first for this offering.',
  );
  const fields = [
    { node: screen.getByLabelText('Unit'), value: ' zi {unit} / день ' },
    { node: screen.getByLabelText('Unit amount'), value: '123.4500' },
    { node: screen.getByLabelText('Tax rate percent'), value: '12.30' },
    { node: screen.getByLabelText('Tax label'), value: ' Taxă {tax} / Налог ' },
    {
      node: screen.getByLabelText('Effective from (UTC)'),
      value: '2027-06-01T09:00',
    },
    {
      node: screen.getByLabelText('Effective until, optional (UTC)'),
      value: '2027-07-01T09:00',
    },
  ];
  for (const { node, value } of fields) changeValue(node, value);
  changeValue(screen.getByLabelText('Currency'), 'EUR');
  const unit = screen.getByLabelText('Unit');
  unit.focus();
  const baseline = [...requests];
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));

  expect(
    screen.getByRole('heading', { name: 'Versions du tarif' }),
  ).toBeVisible();
  expect(screen.getByLabelText('Unité')).toBe(unit);
  expect(unit).toHaveFocus();
  for (const { node, value } of fields) expect(node).toHaveValue(value);
  expect(screen.getByLabelText('Devise')).toHaveTextContent('EUR');
  expect(requests).toEqual(baseline);
});

it('retranslates an already visible field refusal without changing its literal invalid draft or dispatching a request', async () => {
  vi.stubEnv('TZ', 'UTC');
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      requests.push(`${init?.method ?? 'GET'} ${path}`);
      if (init?.method === 'POST')
        throw new Error('An invalid draft must not be sent.');
      if (path === '/api/commercial-catalogue/offerings')
        return Response.json({
          items: [
            {
              id: offeringId,
              serviceDefinition: {
                code: 'CODE-{original}',
                name: 'Serviciu / Услуга',
              },
              commercialLabel: null,
            },
          ],
        });
      if (path.endsWith('/tariff-scope'))
        return Response.json({
          offeringId,
          current: null,
          headVersionNumber: null,
          provisional: true,
        });
      if (path.endsWith('/tariff-versions'))
        return Response.json({ items: [], provisional: true });
      throw new Error(`Unexpected request ${path}`);
    }),
  );
  render(
    <InterfaceLocaleProvider>
      <LocaleControl />
      <TariffVersionPanel
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
  changeValue(
    await screen.findByLabelText('Company Service Offering'),
    offeringId,
  );
  await screen.findByText(
    'The new version will be the first for this offering.',
  );
  changeValue(screen.getByLabelText('Unit'), ' zi / день ');
  const amount = screen.getByLabelText('Unit amount');
  changeValue(amount, '00.50');
  fireEvent.click(
    screen.getByRole('button', { name: 'Publish Tariff Version' }),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a unit amount greater than zero',
  );
  const baseline = [...requests];
  amount.focus();
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Saisissez un montant unitaire strictement positif',
  );
  expect(screen.getByLabelText('Montant unitaire')).toBe(amount);
  expect(amount).toHaveValue('00.50');
  expect(amount).toHaveFocus();
  expect(requests).toEqual(baseline);
});
