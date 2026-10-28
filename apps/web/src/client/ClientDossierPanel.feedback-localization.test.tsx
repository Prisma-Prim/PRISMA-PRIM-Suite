import type { ActorContext } from '../access-types';
import { baseActor } from '../production-shell/production-shell-context.test-fixtures';
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
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientDossierPanel } from './ClientDossierPanel';

const locales = [
  {
    code: 'ro',
    form: 'Corectează dosarul Clientului',
    name: 'Numele afișat al Clientului',
    save: 'Salvează corectarea',
    pending: 'Se salvează…',
    required: 'Numele afișat al Clientului este obligatoriu.',
    retry: 'Corectarea nu a putut fi salvată. Reîncearcă în siguranță.',
    saved: 'Corectarea Clientului a fost salvată cu istoric atribuibil.',
    stale:
      'Acest dosar s-a modificat înainte de salvarea corectării tale. Reîncarcă versiunea curentă înainte de a reîncerca.',
    reload: 'Reîncarcă dosarul',
    duplicate:
      'Acest Client poate exista deja. Niciun Client nu a fost creat sau modificat. O persoană autorizată poate compara dosarele în siguranță.',
    missing: 'Dosarul Clientului nu este disponibil în această Companie.',
    forbidden: 'Nu ai permisiunea de a gestiona Clienți.',
    error: 'Nu am putut încărca dosarul acestui Client. Încearcă din nou.',
    loading: 'Se încarcă dosarul Clientului…',
    projects: 'Deschide Proiectele Clientului',
    documents: 'Deschide Documentele de lucru ale Clientului',
    requests: 'Deschide Cererile Clientului',
  },
  {
    code: 'ru',
    form: 'Исправить досье Клиента',
    name: 'Отображаемое название Клиента',
    save: 'Сохранить исправление',
    pending: 'Сохранение…',
    required: 'Укажите отображаемое название Клиента.',
    retry: 'Не удалось сохранить исправление. Безопасно повторите попытку.',
    saved: 'Исправление Клиента сохранено с указанием автора в истории.',
    stale:
      'Это досье изменилось до сохранения вашего исправления. Перед повторной попыткой загрузите текущую версию.',
    reload: 'Перезагрузить досье',
    duplicate:
      'Этот Клиент, возможно, уже существует. Ни один Клиент не был создан или изменён. Уполномоченный проверяющий может безопасно сравнить записи.',
    missing: 'Досье Клиента недоступно в этой Компании.',
    forbidden: 'У вас нет разрешения на управление Клиентами.',
    error: 'Не удалось загрузить досье этого Клиента. Повторите попытку.',
    loading: 'Загрузка досье Клиента…',
    projects: 'Открыть Проекты Клиента',
    documents: 'Открыть рабочие Документы Клиента',
    requests: 'Открыть Запросы Клиента',
  },
  {
    code: 'fr',
    form: 'Corriger le dossier du Client',
    name: 'Nom affiché du Client',
    save: 'Enregistrer la correction',
    pending: 'Enregistrement…',
    required: 'Le nom affiché du Client est obligatoire.',
    retry:
      'La correction n’a pas pu être enregistrée. Réessayez en toute sécurité.',
    saved: 'Correction du Client enregistrée avec un historique attribuable.',
    stale:
      'Ce dossier a changé avant l’enregistrement de votre correction. Rechargez la version actuelle avant de réessayer.',
    reload: 'Recharger le dossier',
    duplicate:
      'Ce Client existe peut-être déjà. Aucun Client n’a été créé ou modifié. Une personne autorisée peut comparer les dossiers en toute sécurité.',
    missing: 'Le dossier du Client n’est pas disponible dans cette Entreprise.',
    forbidden: 'Vous n’avez pas l’autorisation de gérer les Clients.',
    error: 'Impossible de charger le dossier de ce Client. Réessayez.',
    loading: 'Chargement du dossier du Client…',
    projects: 'Ouvrir les Projets du Client',
    documents: 'Ouvrir les Documents de travail du Client',
    requests: 'Ouvrir les Demandes du Client',
  },
  {
    code: 'en',
    form: 'Correct Client dossier',
    name: 'Client display name',
    save: 'Save correction',
    pending: 'Saving…',
    required: 'Client display name is required.',
    retry: 'The correction could not be saved. Retry safely.',
    saved: 'Client correction saved with attributable history.',
    stale:
      'This dossier changed before your correction was saved. Reload the current version before retrying.',
    reload: 'Reload dossier',
    duplicate:
      'This Client may already exist. No Client was created or changed. An authorized reviewer can compare the records safely.',
    missing: 'The Client dossier is not available in this Company.',
    forbidden: 'You do not have permission to manage Clients.',
    error: 'We could not load this Client dossier. Please try again.',
    loading: 'Loading Client dossier…',
    projects: 'Open Client Projects',
    documents: 'Open Client working Documents',
    requests: 'Open Client Requests',
  },
] satisfies ReadonlyArray<{
  code: InterfaceLocale;
  form: string;
  name: string;
  save: string;
  pending: string;
  required: string;
  retry: string;
  saved: string;
  stale: string;
  reload: string;
  duplicate: string;
  missing: string;
  forbidden: string;
  error: string;
  loading: string;
  projects: string;
  documents: string;
  requests: string;
}>;

const dossier = {
  id: 'client-feedback',
  displayName: 'Client {literal} Я Ș',
  relatedToActiveCompany: true,
  taxId: 'TAX {literal}',
  address: 'Rue {адрес}',
  telephone: '+373 123',
  generalEmail: 'client@example.test',
  businessActivity: 'Conseil {literal}',
  contacts: [
    {
      name: 'Ana {literal}',
      telephone: '+33 456',
      email: 'ana@example.test',
      position: 'Directrice {literal}',
      decisionRoles: ['financial', 'technical'],
      communicationPreferences: 'Română; русский\nemail {dimineața}',
    },
  ],
  version: 7,
  involvedCompanyDisplayNames: ['Company {literal}'],
};

function LocaleButtons() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      {locales.map((locale) => (
        <button key={locale.code} onClick={() => changeLocale(locale.code)}>
          {locale.code}
        </button>
      ))}
    </>
  );
}

function heldResponse() {
  let finish: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    release(response: Response) {
      if (!finish) throw new Error('Expected a held response.');
      finish(response);
    },
  };
}

function mount({
  correction,
  read,
  canUpdate = true,
  status = 200,
  initialLocale = 'en',
}: {
  initialLocale?: string | null;
  correction?: (request: RequestInit) => Response | Promise<Response>;
  read?: Promise<Response>;
  canUpdate?: boolean;
  status?: number;
} = {}) {
  if (initialLocale === null)
    localStorage.removeItem(interfaceLocaleStorageKey);
  else localStorage.setItem(interfaceLocaleStorageKey, initialLocale);
  const activity = vi.fn(async () => undefined);
  const clients = vi.fn(async () => undefined);
  const companyRejected = vi.fn();
  const actorRevalidated = vi.fn();
  const workspaceRejected = vi.fn();
  const duplicate = vi.fn();
  const projects = vi.fn();
  const documents = vi.fn();
  const requests = vi.fn();
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), 'http://localhost').pathname;
      expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
        'company-feedback',
      );
      if (init?.method === 'PATCH') {
        expect(path).toBe('/api/clients/client-feedback');
        if (!correction) throw new Error('Unexpected correction.');
        return correction(init);
      }
      if (path === '/api/clients/client-feedback')
        return (
          read ??
          Response.json(
            status === 200 ? dossier : { message: 'private failure metadata' },
            { status },
          )
        );
      if (path.endsWith('/legal-entities'))
        return Response.json({ clientVersion: 7, legalEntities: [] });
      if (path === '/api/access/current-actor')
        return Response.json({
          ...baseActor,
          workspacePermissions: [],
          activeCompany: {
            id: 'company-feedback',
            displayName: 'Synthetic Company',
          },
        } satisfies ActorContext);
      throw new Error(`Unexpected request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <InterfaceLocaleProvider>
      <LocaleButtons />
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId={dossier.id}
          companyContextId="company-feedback"
          canUpdate={canUpdate}
          identity={deterministicBrowserIdentity()}
          onActivityRecorded={activity}
          onClientsChanged={clients}
          onCompanyContextRejected={companyRejected}
          onActorRevalidated={actorRevalidated}
          onWorkspaceAccessRejected={workspaceRejected}
          onDuplicateReviewRequired={duplicate}
          onOpenProjects={projects}
          onOpenDocuments={documents}
          onOpenRequests={requests}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>,
  );
  return {
    fetcher,
    activity,
    clients,
    companyRejected,
    actorRevalidated,
    workspaceRejected,
    duplicate,
    projects,
    documents,
    requests,
  };
}

function changeLocale(code: InterfaceLocale) {
  fireEvent.click(screen.getByRole('button', { name: code }));
}
async function openCorrection() {
  await screen.findByRole('heading', { name: dossier.displayName });
  fireEvent.click(
    screen.getByRole('button', { name: 'Correct Client dossier' }),
  );
  return screen.getByRole('form', { name: 'Correct Client dossier' });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('keeps pending and uncertain correction semantics in every locale and explicitly retries the exact full Contact command', async () => {
  const held = heldResponse();
  const commands: RequestInit[] = [];
  const view = mount({
    correction(request) {
      commands.push(request);
      return commands.length === 1
        ? held.promise
        : Response.json({
            ...dossier,
            displayName: 'Draft {literal} Ș Я',
            version: 8,
          });
    },
  });
  const form = await openCorrection();
  const name = within(form).getByLabelText('Client display name');
  fireEvent.change(name, { target: { value: '  Draft {literal} Ș Я  ' } });
  const nodes = within(form).getAllByRole('textbox');
  const checkboxes = within(form).getAllByRole('checkbox');
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save correction' }),
  );
  await waitFor(() => expect(commands).toHaveLength(1));
  const baseline = view.fetcher.mock.calls.length;
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(screen.getByRole('form', { name: locale.form })).toBe(form);
    expect(within(form).getByLabelText(locale.name)).toBe(name);
    expect(
      within(form).getByRole('button', { name: locale.pending }),
    ).toBeDisabled();
    expect(name).toHaveValue('  Draft {literal} Ș Я  ');
    expect(within(form).getAllByRole('textbox')).toEqual(nodes);
    expect(within(form).getAllByRole('checkbox')).toEqual(checkboxes);
    expect(view.fetcher).toHaveBeenCalledTimes(baseline);
    expect(view.activity).not.toHaveBeenCalled();
    expect(view.clients).not.toHaveBeenCalled();
  }
  changeLocale('fr');
  await act(async () => held.release(Response.json({}, { status: 503 })));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'La correction n’a pas pu être enregistrée. Réessayez en toute sécurité.',
  );
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.retry);
    expect(view.fetcher).toHaveBeenCalledTimes(baseline);
    expect(commands).toHaveLength(1);
  }
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save correction' }),
  );
  await waitFor(() => expect(view.clients).toHaveBeenCalledTimes(1));
  expect(commands).toHaveLength(2);
  const [first, retry] = commands;
  if (!first || !retry) throw new Error('Expected the explicit retry.');
  expect(first.method).toBe('PATCH');
  expect(retry.method).toBe(first.method);
  expect(first.body).toBe(
    JSON.stringify({
      expectedVersion: 7,
      displayName: 'Draft {literal} Ș Я',
      taxId: 'TAX {literal}',
      address: 'Rue {адрес}',
      telephone: '+373 123',
      generalEmail: 'client@example.test',
      contacts: [
        {
          name: 'Ana {literal}',
          telephone: '+33 456',
          email: 'ana@example.test',
          position: 'Directrice {literal}',
          decisionRoles: ['financial', 'technical'],
          communicationPreferences: 'Română; русский\nemail {dimineața}',
        },
      ],
      businessActivity: 'Conseil {literal}',
    }),
  );
  expect(retry.body).toBe(first.body);
  const key = new Headers(first.headers).get('idempotency-key');
  expect(key).toBeTruthy();
  expect(new Headers(retry.headers).get('idempotency-key')).toBe(key);
  expect(new Headers(retry.headers).get('x-company-context-id')).toBe(
    'company-feedback',
  );
  await waitFor(() => expect(view.fetcher).toHaveBeenCalledTimes(baseline + 2));
  const afterSuccess = view.fetcher.mock.calls.length;
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(screen.getByText(locale.saved)).toBeVisible();
    expect(view.fetcher).toHaveBeenCalledTimes(afterSuccess);
    expect(view.activity).toHaveBeenCalledTimes(1);
    expect(view.clients).toHaveBeenCalledTimes(1);
  }
});

it('translates visible required-name feedback without changing field associations, draft nodes or sending commands', async () => {
  const view = mount();
  const form = await openCorrection();
  const name = within(form).getByLabelText('Client display name');
  fireEvent.change(name, { target: { value: '   ' } });
  fireEvent.submit(form);
  const description = name.getAttribute('aria-describedby');
  const baseline = view.fetcher.mock.calls.length;
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(within(form).getByLabelText(locale.name)).toBe(name);
    expect(name).toHaveValue('   ');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', description);
    expect(name).toHaveAccessibleDescription(locale.required);
    expect(view.fetcher).toHaveBeenCalledTimes(baseline);
  }
});

it.each(['stale', 'duplicate'] as const)(
  'renders a late %s conflict in the current language while retaining the unchanged draft',
  async (kind) => {
    const held = heldResponse();
    const view = mount({ correction: () => held.promise });
    const form = await openCorrection();
    const name = within(form).getByLabelText('Client display name');
    fireEvent.change(name, { target: { value: 'Retained {literal} Я' } });
    fireEvent.submit(form);
    await waitFor(() => expect(view.fetcher).toHaveBeenCalledTimes(3));
    changeLocale('fr');
    await act(async () =>
      held.release(
        Response.json(
          kind === 'duplicate'
            ? {
                code: 'possible_duplicate_review_required',
                duplicate_review_reference: 'private-reference',
              }
            : { message: 'The Client dossier has changed.' },
          { status: 409 },
        ),
      ),
    );
    await screen.findByRole('alert');
    const baseline = view.fetcher.mock.calls.length;
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByRole('alert')).toHaveTextContent(locale[kind]);
      expect(name).toHaveValue('Retained {literal} Я');
      expect(screen.getByRole('form', { name: locale.form })).toBe(form);
      expect(view.fetcher).toHaveBeenCalledTimes(baseline);
      expect(screen.queryByText('private-reference')).not.toBeInTheDocument();
      if (kind === 'stale')
        expect(
          screen.getByRole('button', { name: locale.reload }),
        ).toBeVisible();
    }
    expect(view.activity).not.toHaveBeenCalled();
    expect(view.clients).not.toHaveBeenCalled();
    expect(view.duplicate).toHaveBeenCalledTimes(kind === 'duplicate' ? 1 : 0);
    if (kind === 'stale') {
      fireEvent.click(screen.getByRole('button', { name: 'Reload dossier' }));
      await waitFor(() =>
        expect(screen.getByLabelText('Client display name')).toHaveValue(
          dossier.displayName,
        ),
      );
      await waitFor(() =>
        expect(view.fetcher).toHaveBeenCalledTimes(baseline + 2),
      );
    }
  },
);

it('translates a pending dossier read and renders its late business values without another request', async () => {
  const held = heldResponse();
  const view = mount({ read: held.promise });
  await waitFor(() => expect(view.fetcher).toHaveBeenCalledTimes(1));
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    expect(view.fetcher).toHaveBeenCalledTimes(1);
  }
  changeLocale('ro');
  await act(async () => held.release(Response.json(dossier)));
  expect(
    await screen.findByRole('heading', { name: dossier.displayName }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Corectează dosarul Clientului' }),
  ).toBeVisible();
});

it.each([
  { status: 404, label: 'missing' },
  { status: 403, label: 'forbidden' },
  { status: 503, label: 'error' },
] as const)(
  'keeps $status safe dossier refusal reactive without exposing payload metadata or adding reads',
  async ({ status, label }) => {
    const view = mount({ status });
    await screen.findByRole('alert');
    const baseline = view.fetcher.mock.calls.length;
    const revalidations = view.actorRevalidated.mock.calls.length;
    for (const locale of locales) {
      changeLocale(locale.code);
      expect(screen.getByRole('alert')).toHaveTextContent(locale[label]);
      expect(
        screen.queryByText('private failure metadata'),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(view.fetcher).toHaveBeenCalledTimes(baseline);
      expect(view.actorRevalidated).toHaveBeenCalledTimes(revalidations);
      expect(view.activity).not.toHaveBeenCalled();
      expect(view.clients).not.toHaveBeenCalled();
    }
  },
);

it('preserves read-only dossier authority and independently granted navigation through all interface locales', async () => {
  const view = mount({ canUpdate: false });
  await screen.findByRole('heading', { name: dossier.displayName });
  await waitFor(() => expect(view.fetcher).toHaveBeenCalledTimes(2));
  for (const locale of locales) {
    changeLocale(locale.code);
    expect(
      screen.queryByRole('button', { name: locale.form }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: locale.projects })).toBeVisible();
    expect(
      screen.getByRole('button', { name: locale.documents }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: locale.requests })).toBeVisible();
    expect(view.fetcher).toHaveBeenCalledTimes(2);
    expect(view.projects).not.toHaveBeenCalled();
    expect(view.documents).not.toHaveBeenCalled();
    expect(view.requests).not.toHaveBeenCalled();
  }
});

it.each([null, 'unsupported-locale'])(
  'uses Romanian dossier fallback for interface choice %s',
  async (initialLocale) => {
    mount({ initialLocale });
    expect(
      await screen.findByRole('button', {
        name: 'Corectează dosarul Clientului',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { name: dossier.displayName }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe('ro');
  },
);

it('localizes absent values, empty Contacts and version numbers while preserving the displayed dossier', async () => {
  const view = mount({
    read: Promise.resolve(
      Response.json({
        ...dossier,
        taxId: null,
        address: null,
        telephone: null,
        generalEmail: null,
        businessActivity: null,
        contacts: [],
        version: 12345,
      }),
    ),
  });
  await screen.findByRole('heading', { name: dossier.displayName });
  await waitFor(() => expect(view.fetcher).toHaveBeenCalledTimes(3));
  const versions = [
    'Versiunea 12.345',
    'Версия 12\u00a0345',
    'Version 12\u202f345',
    'Version 12,345',
  ];
  const absent = ['Nefurnizat', 'Не указано', 'Non renseigné', 'Not provided'];
  const noContacts = [
    'Nu sunt înregistrate Contacte comune.',
    'Общие Контакты не зарегистрированы.',
    'Aucun Contact partagé enregistré.',
    'No shared Contacts recorded.',
  ];
  for (const [index, locale] of locales.entries()) {
    changeLocale(locale.code);
    const version = versions[index];
    const missing = absent[index];
    const empty = noContacts[index];
    if (!version || !missing || !empty)
      throw new Error('Expected locale examples.');
    expect(
      screen.getByText(version, { normalizer: (text) => text }),
    ).toBeVisible();
    expect(screen.getAllByText(missing)).toHaveLength(5);
    expect(screen.getByText(empty)).toBeVisible();
    expect(
      screen.getByRole('heading', { name: dossier.displayName }),
    ).toBeVisible();
    expect(view.fetcher).toHaveBeenCalledTimes(3);
  }
});
