import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  InterfaceLocaleProvider,
  useInterfaceLocale,
} from '../localization/interface-locale';
import { ProjectDocuments } from './ProjectDocuments';
import { deferred } from '../production-shell/production-shell-context.test-fixtures';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read'],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.project.manage',
    ],
  },
};
const document = {
  id: 'document',
  companyId: 'company',
  clientId: 'client',
  clientDisplayName: 'Synthetic Client',
  title: 'Preparation questionnaire',
  purpose: 'Prepare the Client interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T00:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version',
    status: 'draft',
    representation: {
      id: 'representation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/questionnaire',
    },
  },
};

function LocaleControls() {
  const { changeLocale } = useInterfaceLocale();
  return (
    <>
      <button onClick={() => changeLocale('ro')}>Română</button>
      <button onClick={() => changeLocale('ru')}>Русский</button>
      <button onClick={() => changeLocale('fr')}>Français</button>
      <button onClick={() => changeLocale('en')}>English</button>
    </>
  );
}
const identity = deterministicBrowserIdentity();
type PanelProps = Parameters<typeof ProjectDocuments>[0];
function Harness(overrides: Partial<PanelProps>) {
  return (
    <InterfaceLocaleProvider>
      <LocaleControls />
      <ProjectDocuments
        actor={actor}
        identity={identity}
        projectId="project"
        projectStatus="preparatory"
        {...overrides}
      />
    </InterfaceLocaleProvider>
  );
}
function renderPanel(overrides: Partial<PanelProps> = {}) {
  return render(<Harness {...overrides} />);
}
function language(name: string) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function response(documents = [{ document, revision: 0 }], mutable = true) {
  return Response.json({ mutable, documents });
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
it('translates the open selector without remounting its input, changing its raw query, focus, server order or requests', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const firstEligible = {
    ...document,
    id: 'first-eligible',
    title: 'Chestionar {literal} — Архив',
    purpose: 'Client interview satellite',
  };
  const linked = {
    ...document,
    id: 'already-linked',
    title: 'Already linked {titre}',
  };
  const fetcher = vi.fn(async (url: string) =>
    Response.json({
      mutable: true,
      documents: url.endsWith('/eligible-documents')
        ? [
            { document: firstEligible, revision: 3 },
            { document, revision: 0 },
          ]
        : [{ document: linked, revision: 2 }],
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  renderPanel();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Attach working Document' }),
  );
  const input = await screen.findByRole('searchbox', {
    name: 'Search eligible working Documents',
  });
  fireEvent.change(input, { target: { value: '  CLIENT interview  ' } });
  input.focus();
  const calls = fetcher.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Română' }));
  expect(
    screen.getByRole('searchbox', {
      name: 'Căutați Documente de lucru eligibile',
    }),
  ).toBe(input);
  expect(input).toHaveValue('  CLIENT interview  ');
  expect(input).toHaveFocus();
  expect(screen.getByRole('heading', { name: document.title })).toBeVisible();
  for (const locale of [
    { name: 'Русский', search: 'Поиск подходящих рабочих Документов' },
    {
      name: 'Français',
      search: 'Rechercher des Documents de travail admissibles',
    },
    { name: 'English', search: 'Search eligible working Documents' },
  ]) {
    language(locale.name);
    expect(screen.getByRole('searchbox', { name: locale.search })).toBe(input);
    expect(input).toHaveValue('  CLIENT interview  ');
    expect(input).toHaveFocus();
    expect(screen.getByRole('heading', { name: document.title })).toBeVisible();
    expect(
      screen
        .getAllByRole('heading', { level: 5 })
        .map((heading) => heading.textContent),
    ).toEqual([linked.title, firstEligible.title, document.title]);
  }
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(calls));
});

const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Documente de lucru',
    loading: 'Se încarcă Documentele de lucru…',
    empty: 'Nu există Documente de lucru asociate.',
    choose: 'Asociați un Document de lucru',
    noEligible:
      'Nu există Documente de lucru eligibile pentru acest Client inițial.',
    uncertain:
      'Rezultatul este incert. Reîncercați aceeași comandă sau reîncărcați înainte de a alege altă acțiune.',
    retry: 'Reîncercați comanda neschimbată',
    confirmed: 'Comandă confirmată. Lista de mai jos se actualizează separat.',
    error:
      'Documentele de lucru nu au putut fi încărcate. Reîncărcați pentru a reîncerca.',
    denied:
      'Pentru a vedea aceste Documente sunt necesare drepturi de citire pentru Proiect, Documente și Client.',
    historical:
      'Clientul inițial nu mai este activ. Asocierile existente sunt doar pentru citire.',
    closed:
      'Acest Proiect este închis. Asocierile existente sunt doar pentru citire.',
    referenceDenied: 'Accesul la referința externă nu este acordat.',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Рабочие Документы',
    loading: 'Загрузка рабочих Документов…',
    empty: 'Нет связанных рабочих Документов.',
    choose: 'Прикрепить рабочий Документ',
    noEligible:
      'Нет подходящих рабочих Документов для этого исходного Клиента.',
    uncertain:
      'Результат неизвестен. Повторите ту же команду или обновите данные перед другим действием.',
    retry: 'Повторить неизменённую команду',
    confirmed: 'Команда подтверждена. Список ниже обновляется отдельно.',
    error:
      'Не удалось загрузить рабочие Документы. Обновите, чтобы повторить попытку.',
    denied:
      'Для просмотра этих Документов нужны права чтения Проекта, Документов и Клиента.',
    historical:
      'Исходный Клиент больше не активен. Существующие связи доступны только для чтения.',
    closed:
      'Этот Проект закрыт. Существующие связи доступны только для чтения.',
    referenceDenied: 'Доступ к внешней ссылке не предоставлен.',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Documents de travail',
    loading: 'Chargement des Documents de travail…',
    empty: 'Aucun Document de travail associé.',
    choose: 'Associer un Document de travail',
    noEligible: 'Aucun Document de travail admissible pour ce Client initial.',
    uncertain:
      'Le résultat est incertain. Réessayez la même commande ou rechargez avant de choisir une autre action.',
    retry: 'Réessayer la commande inchangée',
    confirmed:
      'Commande confirmée. La liste ci-dessous est actualisée séparément.',
    error:
      'Les Documents de travail n’ont pas pu être chargés. Rechargez pour réessayer.',
    denied:
      'Des droits de lecture sur le Projet, les Documents et le Client sont nécessaires pour consulter ces Documents.',
    historical:
      'Le Client initial n’est plus actif. Les associations existantes sont en lecture seule.',
    closed:
      'Ce Projet est fermé. Les associations existantes sont en lecture seule.',
    referenceDenied: 'L’accès à la référence externe n’est pas accordé.',
  },
  {
    code: 'en',
    name: 'English',
    title: 'Working Documents',
    loading: 'Loading working Documents…',
    empty: 'No working Documents attached.',
    choose: 'Attach working Document',
    noEligible: 'No eligible working Documents for this original Client.',
    uncertain:
      'The result is uncertain. Retry this same command or reload before choosing another action.',
    retry: 'Retry unchanged command',
    confirmed: 'Command confirmed. The list below is refreshed separately.',
    error: 'Working Documents could not be loaded. Reload to try again.',
    denied:
      'Project, Document and Client read access are required to view these Documents.',
    historical:
      'The original Client is no longer active. Existing attachments are read-only.',
    closed: 'This Project is closed. Existing attachments are read-only.',
    referenceDenied: 'External reference access is not granted.',
  },
];

it.each([null, 'unsupported'])(
  'defaults an absent or invalid saved choice %s to Romanian without exposing a translation key',
  async (saved) => {
    if (saved !== null)
      localStorage.setItem('prisma-prim.interface-locale', saved);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response([])),
    );
    renderPanel();
    expect(
      await screen.findByText('Nu există Documente de lucru asociate.'),
    ).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Documente de lucru' }),
    ).toBeVisible();
  },
);

it.each(locales)(
  'uses current $code for a late uncertain result, unchanged retry, historical confirmation and failed refresh',
  async (locale) => {
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const delayed = deferred<Response>();
    const commands: Array<{
      url: string;
      company: string | null;
      key: string | null;
      body: BodyInit | null | undefined;
    }> = [];
    let confirmed = false;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        const headers = new Headers(options.headers);
        commands.push({
          url,
          company: headers.get('x-company-context-id'),
          key: headers.get('idempotency-key'),
          body: options.body,
        });
        if (commands.length === 1) return delayed.promise;
        confirmed = true;
        return Response.json({
          documentId: 'document',
          projectId: 'project',
          action: 'unlink',
          revision: 1,
        });
      }
      return confirmed ? new Response(null, { status: 500 }) : response();
    });
    vi.stubGlobal('fetch', fetcher);
    const onProjectChanged = vi.fn();
    const onActivityRecorded = vi.fn();
    renderPanel({ onProjectChanged, onActivityRecorded });
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove Preparation questionnaire',
      }),
    );
    await waitFor(() => expect(commands).toHaveLength(1));
    const calls = fetcher.mock.calls.length;
    language(locale.name);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    expect(onProjectChanged).not.toHaveBeenCalled();
    expect(onActivityRecorded).not.toHaveBeenCalled();
    await act(async () => delayed.resolve(new Response(null, { status: 500 })));
    expect(await screen.findByText(locale.uncertain)).toBeVisible();
    language('English');
    expect(
      screen.getByText(
        'The result is uncertain. Retry this same command or reload before choosing another action.',
      ),
    ).toBeVisible();
    language(locale.name);
    expect(screen.getByText(locale.uncertain)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(calls);
    fireEvent.click(screen.getByRole('button', { name: locale.retry }));
    expect(await screen.findByText(locale.confirmed)).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent(locale.error);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]).toMatchObject({
      url: expect.stringContaining('/documents/document/project-association'),
      company: 'company',
      body: '{"projectId":"project","action":"unlink","expectedRevision":0}',
    });
    expect(commands[0]?.key).toEqual(expect.any(String));
    expect(
      screen.queryByRole('button', { name: locale.retry }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(document.title)).not.toBeInTheDocument();
    await waitFor(() => expect(onActivityRecorded).toHaveBeenCalledTimes(1));
    language('English');
    expect(
      screen.getByText(
        'Command confirmed. The list below is refreshed separately.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Working Documents could not be loaded. Reload to try again.',
    );
    expect(commands).toHaveLength(2);
  },
);

it.each(locales)(
  'translates $code loading, empty and no-eligible states with no locale-only requests',
  async (locale) => {
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const delayed = deferred<Response>();
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/eligible-documents') ? response([]) : delayed.promise,
    );
    vi.stubGlobal('fetch', fetcher);
    renderPanel();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    language(locale.name);
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    await act(async () => delayed.resolve(response([])));
    expect(await screen.findByText(locale.empty)).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: locale.choose }));
    expect(await screen.findByText(locale.noEligible)).toBeVisible();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

for (const state of ['metadata', 'historical', 'closed', 'denied'] as const) {
  it.each(locales)(
    `preserves ${state} privacy and read-only boundaries in $code`,
    async (locale) => {
      const metadata = {
        ...document,
        version: {
          ...document.version,
          representation: {
            id: 'representation',
            kind: 'external-reference',
            verification: 'unverified',
            access: 'denied',
          },
        },
      };
      const fetcher = vi.fn(async () =>
        Response.json({
          mutable: state !== 'historical' && state !== 'closed',
          documents: [{ document: metadata, revision: 3 }],
        }),
      );
      vi.stubGlobal('fetch', fetcher);
      const scopedActor: ActorContext = {
        ...actor,
        activeCompany: {
          ...actor.activeCompany,
          id: 'company',
          displayName: 'PRISMA-PRIM',
          documentPermissions:
            state === 'denied'
              ? ['document.project.manage']
              : state === 'metadata'
                ? ['document.read']
                : ['document.read', 'document.project.manage'],
        },
      };
      renderPanel({
        actor: scopedActor,
        projectStatus: state === 'closed' ? 'completed' : 'preparatory',
      });
      if (state === 'denied') await screen.findByRole('alert');
      else await screen.findByText(document.title);
      const calls = fetcher.mock.calls.length;
      language(locale.name);
      if (state === 'denied') {
        expect(screen.getByRole('alert')).toHaveTextContent(locale.denied);
        expect(screen.queryByText(document.title)).not.toBeInTheDocument();
        expect(screen.queryByText(locale.empty)).not.toBeInTheDocument();
        expect(fetcher).not.toHaveBeenCalled();
      } else {
        expect(screen.getByText(document.title)).toBeVisible();
        expect(screen.getByText(locale.referenceDenied)).toBeVisible();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: locale.choose }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryByRole('button', { name: new RegExp(document.title) }),
        ).not.toBeInTheDocument();
        if (state === 'historical')
          expect(screen.getByText(locale.historical)).toBeVisible();
        if (state === 'closed')
          expect(screen.getByText(locale.closed)).toBeVisible();
      }
      expect(
        screen.queryByText(document.version.representation.url),
      ).not.toBeInTheDocument();
      expect(fetcher).toHaveBeenCalledTimes(calls);
    },
  );
}

it.each([
  {
    status: 409,
    code: 'association_stale',
    expected:
      'L’association a changé ou cette commande n’est plus valide. Rechargez avant de choisir une autre action.',
  },
  {
    status: 400,
    code: 'invalid',
    expected:
      'L’association a changé ou cette commande n’est plus valide. Rechargez avant de choisir une autre action.',
  },
  {
    status: 409,
    code: 'project_closed',
    expected: 'Ce Projet a été fermé. Rechargez pour voir son état actuel.',
  },
])(
  'retains blocked intention while translating a known $status/$code refusal',
  async ({ status, code, expected }) => {
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    const delayed = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options?: RequestInit) =>
        options?.method === 'POST' ? delayed.promise : response(),
      ),
    );
    renderPanel();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove Preparation questionnaire',
      }),
    );
    language('Français');
    await act(async () =>
      delayed.resolve(
        Response.json(
          { statusCode: status, code, message: 'Contract refusal' },
          { status },
        ),
      ),
    );
    expect(await screen.findByText(expected)).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Retirer l’association avec Preparation questionnaire',
      }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Réessayer la commande inchangée' }),
    ).not.toBeInTheDocument();
    language('Русский');
    expect(screen.queryByText(expected)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Убрать связь с Preparation questionnaire',
      }),
    ).toBeDisabled();
  },
);

it('retires a pending request on genuine Company/read-authority change while a locale change leaves it live', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const delayed = deferred<Response>();
  const signals: Array<AbortSignal | null | undefined> = [];
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    signals.push(options?.signal);
    return delayed.promise;
  });
  vi.stubGlobal('fetch', fetcher);
  const view = renderPanel();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  language('Français');
  expect(signals[0]?.aborted).toBe(false);
  view.rerender(
    <Harness
      actor={{
        ...actor,
        activeCompany: { id: 'other-company', displayName: 'Other Company' },
      }}
    />,
  );
  expect(signals[0]?.aborted).toBe(true);
  await act(async () => delayed.resolve(response()));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Des droits de lecture sur le Projet, les Documents et le Client sont nécessaires pour consulter ces Documents.',
  );
  expect(screen.queryByText(document.title)).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('renders a late successful receipt and later refresh failure in the language current at each arrival', async () => {
  localStorage.setItem('prisma-prim.interface-locale', 'en');
  const command = deferred<Response>();
  const refresh = deferred<Response>();
  let reading = 0;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return command.promise;
    reading += 1;
    return reading === 1 ? response() : refresh.promise;
  });
  vi.stubGlobal('fetch', fetcher);
  renderPanel();
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Remove Preparation questionnaire',
    }),
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  language('Français');
  await act(async () =>
    command.resolve(
      Response.json({
        documentId: 'document',
        projectId: 'project',
        action: 'unlink',
        revision: 1,
      }),
    ),
  );
  expect(
    await screen.findByText(
      'Commande confirmée. La liste ci-dessous est actualisée séparément.',
    ),
  ).toBeVisible();
  expect(
    screen.getByText('Chargement des Documents de travail…'),
  ).toBeVisible();
  language('Русский');
  expect(
    screen.getByText('Команда подтверждена. Список ниже обновляется отдельно.'),
  ).toBeVisible();
  await act(async () => refresh.resolve(new Response(null, { status: 500 })));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Не удалось загрузить рабочие Документы. Обновите, чтобы повторить попытку.',
  );
  expect(
    screen.getByText('Команда подтверждена. Список ниже обновляется отдельно.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Повторить неизменённую команду' }),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
