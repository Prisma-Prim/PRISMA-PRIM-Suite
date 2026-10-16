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
  useInterfaceLocale,
} from '../localization/interface-locale';
import { PricingConfigurationWorkspace } from './PricingConfigurationWorkspace';

const actor: ActorContext = {
  internalUserId: 'user-649',
  workspaceMembershipId: 'membership-649',
  workspaceId: 'workspace-649',
  workspaceName: 'Workspace {original}',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-649',
    displayName: 'Companie {originală} / Компания',
    clientPermissions: [],
    pricingConfigurationPermissions: [
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
  },
};
const version = {
  id: 'version-649',
  versionNumber: 1,
  label: 'Regulă {versionNumber} / Правило',
  effectiveFrom: '2027-06-01T09:00:00.000Z',
  effectiveTo: null,
  ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
  roundingMode: 'HALF_UP',
  roundingScale: 2,
  taxApplication: 'PER_LINE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  state: 'CURRENT',
  supersession: null,
  createdByWorkspaceMembershipId: actor.workspaceMembershipId,
  createdAt: '2027-06-01T08:00:00.000Z',
};

function LocaleControls() {
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

function renderWorkspace(currentActor: ActorContext = actor) {
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  render(
    <InterfaceLocaleProvider>
      <LocaleControls />
      <PricingConfigurationWorkspace
        actor={currentActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
}

function serveEmptyScope(refusal?: {
  status: number;
  code: string;
  headVersionNumber?: number | null;
}) {
  const commands: RequestInit[] = [];
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (init?.method === 'POST') {
        commands.push(init);
        if (!refusal) throw new Error('No publication was expected.');
        return Response.json(
          {
            code: refusal.code,
            ...(refusal.headVersionNumber !== undefined
              ? { headVersionNumber: refusal.headVersionNumber }
              : {}),
          },
          { status: refusal.status },
        );
      }
      reads.push(path);
      return Response.json(
        path.endsWith('rule-scope')
          ? { current: null, headVersionNumber: null, provisional: true }
          : { items: [], provisional: true },
      );
    }),
  );
  return { commands, reads };
}

function fillPublication({
  from,
  until = '',
}: {
  from: string;
  until?: string;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  fireEvent.change(screen.getByLabelText('Label'), {
    target: { value: version.label },
  });
  fireEvent.change(screen.getByLabelText(`Effective from (${zone})`), {
    target: { value: from },
  });
  fireEvent.change(
    screen.getByLabelText(`Effective until, optional (${zone})`),
    { target: { value: until } },
  );
}

it('preserves literal drafts and the exact pending or uncertain command while the interface language changes', async () => {
  vi.stubEnv('TZ', 'UTC');
  localStorage.setItem(interfaceLocaleStorageKey, 'en');
  const commands: { body: BodyInit | null | undefined; key: string | null }[] =
    [];
  const reads: string[] = [];
  let published = false;
  let finishPublication: ((response: Response) => void) | undefined;
  const firstPublication = new Promise<Response>((resolve) => {
    finishPublication = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (init?.method === 'POST') {
        commands.push({
          body: init.body,
          key: new Headers(init.headers).get('idempotency-key'),
        });
        if (commands.length === 1) return firstPublication;
        published = true;
        return Promise.resolve(
          Response.json({ outcome: 'PUBLISHED', version }, { status: 201 }),
        );
      }
      reads.push(path);
      return Promise.resolve(
        Response.json(
          path.endsWith('rule-scope')
            ? {
                current: published ? version : null,
                headVersionNumber: published ? 1 : null,
                provisional: true,
              }
            : { items: published ? [version] : [], provisional: true },
        ),
      );
    }),
  );
  const rejectCompany = vi.fn();
  const revalidateActor = vi.fn();
  const rejectWorkspace = vi.fn();
  render(
    <InterfaceLocaleProvider>
      <LocaleControls />
      <PricingConfigurationWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={rejectCompany}
        onActorRevalidated={revalidateActor}
        onWorkspaceAccessRejected={rejectWorkspace}
      />
    </InterfaceLocaleProvider>,
  );
  await screen.findByText(
    'The new version will be the first for this Company.',
  );
  fireEvent.change(screen.getByLabelText('Label'), {
    target: { value: version.label },
  });
  fireEvent.change(screen.getByLabelText('Effective from (UTC)'), {
    target: { value: '2027-06-01T09:00' },
  });
  fireEvent.change(screen.getByLabelText('Effective until, optional (UTC)'), {
    target: { value: '2027-07-01T09:00' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
  expect(
    screen.getByRole('button', { name: 'Publish version' }),
  ).toBeDisabled();
  await waitFor(() => expect(commands).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));

  expect(
    screen.getByRole('heading', {
      name: 'Configuration des règles de tarification',
    }),
  ).toBeVisible();
  expect(screen.getByLabelText('Libellé')).toHaveValue(version.label);
  expect(screen.getByLabelText('Applicable à partir du (UTC)')).toHaveValue(
    '2027-06-01T09:00',
  );
  expect(
    screen.getByLabelText('Applicable jusqu’au, facultatif (UTC)'),
  ).toHaveValue('2027-07-01T09:00');
  expect(reads).toHaveLength(2);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toEqual({
    body: JSON.stringify({
      label: version.label,
      effectiveFrom: '2027-06-01T09:00:00.000Z',
      effectiveTo: '2027-07-01T09:00:00.000Z',
      expectedActiveVersionNumber: null,
    }),
    key: expect.any(String),
  });
  expect(commands[0]?.key).toBeTruthy();
  const finish = finishPublication;
  if (!finish) throw new Error('The pending HTTP command is missing.');
  await act(async () => finish(Response.json({}, { status: 503 })));
  await screen.findByRole('button', { name: 'Réessayer la publication' });
  fireEvent.click(screen.getByRole('button', { name: 'ro' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Rezultatul publicării este incert.',
  );
  expect(screen.getByLabelText('Denumire')).toHaveValue(version.label);
  expect(reads).toHaveLength(2);
  expect(commands).toHaveLength(1);
  expect(rejectCompany).not.toHaveBeenCalled();
  expect(revalidateActor).not.toHaveBeenCalled();
  expect(rejectWorkspace).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Reîncearcă publicarea' }),
  );
  await waitFor(() => expect(commands).toHaveLength(2));
  expect(commands[1]).toEqual(commands[0]);
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Versiunea 1 a fost publicată.',
  );
});

it('retranslates an existing local validation refusal and keeps the literal draft without I/O', async () => {
  const calls = serveEmptyScope();
  renderWorkspace();
  await screen.findByText(
    'The new version will be the first for this Company.',
  );
  fireEvent.change(screen.getByLabelText('Label'), {
    target: { value: version.label },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a label of 1 to 120 characters, a start, and an optional end later than the start.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'ru' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Введите название длиной от 1 до 120 символов, начало и, при необходимости, окончание позже начала.',
  );
  expect(screen.getByLabelText('Название')).toHaveValue(version.label);
  expect(calls.commands).toHaveLength(0);
  expect(calls.reads).toHaveLength(2);
});

const namedRefusals = [
  {
    code: 'VALIDATION_ERROR',
    status: 400,
    english:
      'Enter a label of 1 to 120 characters, a start, and an optional end later than the start.',
    russian:
      'Введите название длиной от 1 до 120 символов, начало и, при необходимости, окончание позже начала.',
  },
  {
    code: 'EFFECTIVE_FROM_PAST',
    status: 400,
    english: 'Choose a start that is not earlier than now.',
    russian: 'Выберите начало не раньше текущего момента.',
  },
  {
    code: 'EFFECTIVE_FROM_NOT_ADVANCING',
    status: 400,
    english: 'Choose a start later than the start of the head version.',
    russian: 'Выберите начало позже начала последней опубликованной версии.',
  },
  {
    code: 'EFFECTIVE_WINDOW_GAP',
    status: 409,
    english:
      'The head version ends before this start. Choose a start no later than its end, or wait until it has ended.',
    russian:
      'Последняя опубликованная версия заканчивается раньше этого начала. Выберите начало не позже её окончания или дождитесь, пока она закончится.',
  },
  {
    code: 'VERSION_EXHAUSTED',
    status: 409,
    english: 'No further Pricing Rule Version number can be allocated.',
    russian:
      'Невозможно выделить следующий номер версии правила ценообразования.',
  },
  {
    code: 'IDEMPOTENCY_CONFLICT',
    status: 409,
    english:
      'Nothing was published with that request: its identifier had already been used for a different request. Your draft is kept and can be published again.',
    russian:
      'По этому запросу ничего не опубликовано: его идентификатор уже использовался для другого запроса. Черновик сохранён, его можно опубликовать снова.',
  },
];

it.each(namedRefusals)(
  'retranslates the existing $code API refusal without repeating a publication',
  async (refusal) => {
    const calls = serveEmptyScope(refusal);
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillPublication({ from: '2027-06-01T09:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal.english);
    fireEvent.click(screen.getByRole('button', { name: 'ru' }));
    expect(screen.getByRole('alert')).toHaveTextContent(refusal.russian);
    expect(screen.getByLabelText('Название')).toHaveValue(version.label);
    expect(calls.commands).toHaveLength(1);
    expect(calls.reads).toHaveLength(2);
  },
);

const clockRefusals = [
  {
    name: 'skipped start',
    from: '2026-03-08T02:30',
    until: '',
    english:
      'The start does not exist in America/New_York: a clock change skips that time.',
    french:
      'Le début n’existe pas dans le fuseau America/New_York : le changement d’heure saute cet instant.',
  },
  {
    name: 'skipped end',
    from: '2026-03-08T01:30',
    until: '2026-03-08T02:30',
    english:
      'The end does not exist in America/New_York: a clock change skips that time.',
    french:
      'La fin n’existe pas dans le fuseau America/New_York : le changement d’heure saute cet instant.',
  },
  {
    name: 'repeated start',
    from: '2026-11-01T01:30',
    until: '',
    english:
      'The start is ambiguous in America/New_York: a clock change repeats that time.',
    french:
      'Le début est ambigu dans le fuseau America/New_York : le changement d’heure répète cet instant.',
  },
  {
    name: 'repeated end',
    from: '2026-11-01T00:30',
    until: '2026-11-01T01:30',
    english:
      'The end is ambiguous in America/New_York: a clock change repeats that time.',
    french:
      'La fin est ambiguë dans le fuseau America/New_York : le changement d’heure répète cet instant.',
  },
];

it.each(clockRefusals)(
  'retranslates the existing $name refusal without shifting or submitting the local time',
  async (example) => {
    vi.stubEnv('TZ', 'America/New_York');
    const calls = serveEmptyScope();
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillPublication(example);
    fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
    expect(screen.getByRole('alert')).toHaveTextContent(example.english);
    fireEvent.click(screen.getByRole('button', { name: 'fr' }));
    expect(screen.getByRole('alert')).toHaveTextContent(example.french);
    expect(screen.getByLabelText('Libellé')).toHaveValue(version.label);
    expect(
      screen.getByLabelText('Applicable à partir du (America/New_York)'),
    ).toHaveValue(example.from);
    expect(
      screen.getByLabelText(
        'Applicable jusqu’au, facultatif (America/New_York)',
      ),
    ).toHaveValue(example.until);
    expect(calls.commands).toHaveLength(0);
    expect(calls.reads).toHaveLength(2);
  },
);

const localeStates = [
  {
    locale: 'ro',
    title: 'Configurarea regulilor de tarifare',
    loading: 'Se încarcă versiunea curentă a regulii de tarifare…',
    historyLoading: 'Se încarcă versiunile regulii de tarifare…',
    empty: 'Nu a fost publicată încă nicio versiune a regulii de tarifare.',
    noCurrent:
      'Nicio versiune curentă: nicio versiune a regulii de tarifare nu este curentă în acest moment.',
    noHead:
      'Nu a fost publicată încă nicio versiune a regulii de tarifare pentru această Companie.',
  },
  {
    locale: 'ru',
    title: 'Настройка правил ценообразования',
    loading: 'Загрузка текущей версии правила ценообразования…',
    historyLoading: 'Загрузка версий правила ценообразования…',
    empty: 'Ещё не опубликовано ни одной версии правила ценообразования.',
    noCurrent:
      'Нет текущей версии: в данный момент ни одна версия правила ценообразования не действует.',
    noHead:
      'Для этой Компании ещё не опубликовано ни одной версии правила ценообразования.',
  },
  {
    locale: 'fr',
    title: 'Configuration des règles de tarification',
    loading: 'Chargement de la version actuelle de la règle de tarification…',
    historyLoading: 'Chargement des versions de règle de tarification…',
    empty: 'Aucune version de règle de tarification n’a encore été publiée.',
    noCurrent:
      'Aucune version actuelle : aucune version de règle de tarification n’est en vigueur à cet instant.',
    noHead:
      'Aucune version de règle de tarification n’a encore été publiée pour cette Société.',
  },
  {
    locale: 'en',
    title: 'Pricing Configuration',
    loading: 'Loading the current Pricing Rule Version…',
    historyLoading: 'Loading Pricing Rule Versions…',
    empty: 'No Pricing Rule Version has been published yet.',
    noCurrent:
      'No current version: no Pricing Rule Version is current at this instant.',
    noHead: 'No Pricing Rule Version has been published for this Company yet.',
  },
];

it.each(localeStates)(
  'renders loading and the empty configuration in $locale without reading again on language selection',
  async (example) => {
    const reads: string[] = [];
    let finishScope: ((response: Response) => void) | undefined;
    const pendingScope = new Promise<Response>((resolve) => {
      finishScope = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const path = new URL(input.toString(), 'http://localhost').pathname;
        reads.push(path);
        return path.endsWith('rule-scope')
          ? pendingScope
          : Promise.resolve(Response.json({ items: [], provisional: true }));
      }),
    );
    renderWorkspace();
    await waitFor(() => expect(reads).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: example.locale }));
    expect(screen.getByRole('heading', { name: example.title })).toBeVisible();
    expect(screen.getByText(example.loading, { exact: true })).toBeVisible();
    expect(
      screen.getByText(example.historyLoading, { exact: true }),
    ).toBeVisible();
    expect(reads).toHaveLength(1);
    const finish = finishScope;
    if (!finish) throw new Error('The pending scope HTTP request is missing.');
    await act(async () =>
      finish(
        Response.json({
          current: null,
          headVersionNumber: null,
          provisional: true,
        }),
      ),
    );
    expect(
      await screen.findByText(example.empty, { exact: true }),
    ).toBeVisible();
    expect(screen.getByText(example.noCurrent, { exact: true })).toBeVisible();
    expect(screen.getByText(example.noHead, { exact: true })).toBeVisible();
    expect(reads).toHaveLength(2);
  },
);

it.each([
  {
    headVersionNumber: 1000,
    french:
      'La configuration a changé : la version 1\u202f000 est maintenant la dernière publiée. Rechargez avant de publier à nouveau.',
  },
  {
    headVersionNumber: null,
    french:
      'La configuration a changé : il n’y a plus de dernière version publiée. Rechargez avant de publier à nouveau.',
  },
])(
  'retranslates a stale head $headVersionNumber and reloads only on explicit request',
  async (example) => {
    const calls = serveEmptyScope({
      status: 409,
      code: 'STALE_ACTIVE_VERSION',
      headVersionNumber: example.headVersionNumber,
    });
    renderWorkspace();
    await screen.findByText(
      'The new version will be the first for this Company.',
    );
    fillPublication({ from: '2027-06-01T09:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'fr' }));
    expect(screen.getByRole('alert').textContent).toBe(example.french);
    expect(screen.getByLabelText('Libellé')).toHaveValue(version.label);
    expect(calls.reads).toHaveLength(2);
    expect(calls.commands).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Recharger les versions de règle de tarification',
      }),
    );
    await waitFor(() => expect(calls.reads).toHaveLength(4));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls.commands).toHaveLength(1);
  },
);

it('retranslates unchanged success while preserving the recorded rule and without an extra reload', async () => {
  const reads: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Response.json({ outcome: 'UNCHANGED', version });
      const path = new URL(input.toString(), 'http://localhost').pathname;
      reads.push(path);
      return Response.json(
        path.endsWith('rule-scope')
          ? { current: version, headVersionNumber: 1, provisional: true }
          : { items: [version], provisional: true },
      );
    }),
  );
  renderWorkspace();
  await screen.findByText('The new version will follow head version 1.');
  fillPublication({ from: '2027-06-01T09:00' });
  fireEvent.click(screen.getByRole('button', { name: 'Publish version' }));
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Version 1 already has this content. Nothing changed.',
  );
  await waitFor(() => expect(reads).toHaveLength(4));
  fireEvent.click(screen.getByRole('button', { name: 'ru' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Версия 1 уже содержит эти данные. Ничего не изменилось.',
  );
  expect(screen.getAllByText(version.label, { exact: true })).toHaveLength(2);
  expect(reads).toHaveLength(4);
});

it('retranslates scheduled history, dates, numbers and pending or failed older pages without replacing records', async () => {
  vi.stubEnv('TZ', 'UTC');
  const scheduled = {
    ...version,
    id: 'scheduled-1000',
    versionNumber: 1000,
    label: 'Programată {versionNumber} / Запись',
    state: 'SCHEDULED',
  };
  const reads: string[] = [];
  let finishOlder: ((response: Response) => void) | undefined;
  const pendingOlder = new Promise<Response>((resolve) => {
    finishOlder = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = new URL(input.toString(), 'http://localhost');
      reads.push(url.pathname + url.search);
      if (url.searchParams.has('cursor')) return pendingOlder;
      return Promise.resolve(
        Response.json(
          url.pathname.endsWith('rule-scope')
            ? { current: version, headVersionNumber: 1000, provisional: true }
            : {
                items: [scheduled, version],
                nextCursor: 'opaque-649',
                provisional: true,
              },
        ),
      );
    }),
  );
  renderWorkspace();
  await screen.findByRole('list', { name: 'Pricing Rule Versions' });
  fireEvent.click(screen.getByRole('button', { name: 'ru' }));
  const history = screen.getByRole('list', {
    name: 'Версии правила ценообразования',
  });
  expect(within(history).getByText(/^Версия 1\s000$/u)).toBeVisible();
  expect(
    within(history).getByText(scheduled.label, { exact: true }),
  ).toBeVisible();
  expect(
    within(history).getByText('Запланирована', { exact: true }),
  ).toBeVisible();
  const instant = history.querySelector('time');
  expect(instant).toHaveAttribute('dateTime', version.effectiveFrom);
  expect(instant).toHaveTextContent('июн.');
  fireEvent.click(
    screen.getByRole('button', { name: 'Показать более ранние версии' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'Загрузка более ранних версий…',
  );
  await waitFor(() => expect(reads).toHaveLength(3));
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));
  expect(screen.getByRole('status')).toHaveTextContent(
    'Chargement des versions antérieures…',
  );
  expect(instant).toHaveAttribute('dateTime', version.effectiveFrom);
  expect(instant).toHaveTextContent('juin');
  expect(reads).toHaveLength(3);
  const finish = finishOlder;
  if (!finish) throw new Error('The pending history HTTP request is missing.');
  await act(async () => finish(Response.json({}, { status: 503 })));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Les versions antérieures n’ont pas pu être chargées. Réessayez.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'ro' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Versiunile mai vechi nu au putut fi încărcate. Reîncercați.',
  );
  expect(screen.getAllByText(scheduled.label, { exact: true })).toHaveLength(2);
  expect(reads).toHaveLength(3);
});

it.each([
  {
    changing: false,
    russian:
      'Не удалось загрузить версии правила ценообразования. Повторите попытку.',
    reads: 2,
  },
  {
    changing: true,
    russian:
      'Версии правила ценообразования менялись во время загрузки. Перезагрузите данные, чтобы увидеть последние версии.',
    reads: 6,
  },
])(
  'retranslates an initial failure or incoherent read (changing=$changing) without silently retrying',
  async (example) => {
    const reads: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(input.toString(), 'http://localhost').pathname;
        reads.push(path);
        if (!example.changing) return Response.json({}, { status: 503 });
        return Response.json(
          path.endsWith('rule-scope')
            ? { current: null, headVersionNumber: null, provisional: true }
            : { items: [version], provisional: true },
        );
      }),
    );
    renderWorkspace();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'ru' }));
    expect(screen.getByRole('alert')).toHaveTextContent(example.russian);
    expect(reads).toHaveLength(example.reads);
  },
);

it('keeps publication unavailable for a read-only actor when the interface language changes', async () => {
  const calls = serveEmptyScope();
  renderWorkspace({
    ...actor,
    activeCompany: {
      id: 'company-649',
      displayName: 'Companie {originală} / Компания',
      clientPermissions: [],
      pricingConfigurationPermissions: [
        'commercial.pricing.configuration.read',
      ],
    },
  });
  await screen.findByText('No Pricing Rule Version has been published yet.');
  fireEvent.click(screen.getByRole('button', { name: 'fr' }));
  expect(
    screen.getByRole('heading', {
      name: 'Configuration des règles de tarification',
    }),
  ).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Publier la version' }),
  ).not.toBeInTheDocument();
  expect(calls.commands).toHaveLength(0);
  expect(calls.reads).toHaveLength(2);
});

it('retranslates denial without a Company without reading or exposing configuration metadata', () => {
  const calls = serveEmptyScope();
  renderWorkspace({ ...actor, activeCompany: undefined });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'You do not have permission to access Pricing Configuration.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'ro' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Nu aveți permisiunea de a accesa configurarea tarifării.',
  );
  expect(screen.queryByText(version.label)).not.toBeInTheDocument();
  expect(calls.reads).toHaveLength(0);
  expect(calls.commands).toHaveLength(0);
});
