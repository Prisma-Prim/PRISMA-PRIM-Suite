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
  interfaceLocaleStorageKey,
} from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { ApplicationPresentation } from '../production-shell/application-presentation';
import { ClientWorkspace } from './ClientWorkspace';
import { selectOption } from '../test/select-option';

const locales = [
  {
    code: 'ro',
    searchLabel: 'Găsește un Client comun',
    search: 'Caută Clienți',
    results: 'Rezultatele căutării',
    unavailable: 'Încă neasociat cu Companie {company}',
    link: 'Asociază cu Companie {company}',
    linking: 'Se asociază cu Companie {company}…',
    available: 'Disponibil în Companie {company}',
    error: 'Clienții nu au putut fi încărcați. Încercați din nou.',
    loading: 'Se încarcă Clienții…',
    empty: 'Nu există încă Clienți pentru Companie {company}.',
    required: 'Introduceți numele unui Client pentru căutare.',
    searching: 'Se caută…',
    noResults: 'Niciun Client comun nu corespunde acestei căutări.',
    back: 'Înapoi la Clienții Companiei',
    denied: 'Nu aveți permisiunea de a gestiona Clienți.',
    missingCompany: 'Selectați o Companie activă pentru a lucra cu Clienți.',
    context: 'Clienți în Companie {company}',
    oneResult: '1 Client afișat',
    clientId: 'ID Client: client-literal',
  },
  {
    code: 'ru',
    searchLabel: 'Найти общего Клиента',
    search: 'Искать Клиентов',
    results: 'Результаты поиска',
    unavailable: 'Ещё не связан с Companie {company}',
    link: 'Связать с Companie {company}',
    linking: 'Связывание с Companie {company}…',
    available: 'Доступен в Companie {company}',
    error: 'Не удалось загрузить Клиентов. Повторите попытку.',
    loading: 'Загрузка Клиентов…',
    empty: 'Пока нет Клиентов для Companie {company}.',
    required: 'Введите название Клиента для поиска.',
    searching: 'Поиск…',
    noResults: 'Ни один общий Клиент не соответствует этому поиску.',
    back: 'Назад к Клиентам Компании',
    denied: 'У вас нет разрешения на управление Клиентами.',
    missingCompany: 'Выберите активную Компанию для работы с Клиентами.',
    context: 'Клиенты в Companie {company}',
    oneResult: 'Показан 1 Клиент',
    clientId: 'ID Клиента: client-literal',
  },
  {
    code: 'fr',
    searchLabel: 'Chercher un Client partagé',
    search: 'Rechercher des Clients',
    results: 'Résultats de recherche',
    unavailable: 'Pas encore lié à Companie {company}',
    link: 'Ajouter à Companie {company}',
    linking: 'Ajout à Companie {company}…',
    available: 'Disponible dans Companie {company}',
    error: 'Impossible de charger les Clients. Réessayez.',
    loading: 'Chargement des Clients…',
    empty: 'Aucun Client pour Companie {company} pour le moment.',
    required: 'Saisissez un nom de Client pour lancer la recherche.',
    searching: 'Recherche…',
    noResults: 'Aucun Client partagé ne correspond à cette recherche.',
    back: 'Retour aux Clients de l’Entreprise',
    denied: 'Vous n’avez pas l’autorisation de gérer les Clients.',
    missingCompany:
      'Sélectionnez une Entreprise active pour travailler avec les Clients.',
    context: 'Clients de Companie {company}',
    oneResult: '1 Client affiché',
    clientId: 'ID Client : client-literal',
  },
  {
    code: 'en',
    searchLabel: 'Find a shared Client',
    search: 'Search Clients',
    results: 'Search results',
    unavailable: 'Not yet linked to Companie {company}',
    link: 'Add to Companie {company}',
    linking: 'Adding to Companie {company}…',
    available: 'Available in Companie {company}',
    error: 'We could not load Clients. Please try again.',
    loading: 'Loading Clients…',
    empty: 'No Clients for Companie {company} yet.',
    required: 'Enter a Client name to search.',
    searching: 'Searching…',
    noResults: 'No shared Client matches this search.',
    back: 'Back to Company Clients',
    denied: 'You do not have permission to manage Clients.',
    missingCompany: 'Select an active Company to work with Clients.',
    context: 'Clients in Companie {company}',
    oneResult: '1 Client shown',
    clientId: 'Client ID: client-literal',
  },
] as const;

function deferredResponse() {
  let resolve: (response: Response) => void = () => {
    throw new Error('Deferred response has not been initialized');
  };
  const promise = new Promise<Response>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

const actor: ActorContext = {
  internalUserId: 'user-client-directory',
  workspaceMembershipId: 'membership-client-directory',
  workspaceId: 'workspace-client-directory',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: { id: 'company-directory', displayName: 'Companie {company}' },
};

function renderWorkspace(workspaceActor: ActorContext = actor) {
  return render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ApplicationPresentation value="prisme">
        <ClientWorkspace
          actor={workspaceActor}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={vi.fn()}
          onActivityRecorded={vi.fn(async () => undefined)}
        />
      </ApplicationPresentation>
    </InterfaceLocaleProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it.each(locales)(
  'localizes loading, validation and empty search recovery in $code',
  async (locale) => {
    localStorage.setItem(interfaceLocaleStorageKey, locale.code);
    const directory = deferredResponse();
    const searchResults = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(directory.promise)
      .mockReturnValueOnce(searchResults.promise);
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    expect(screen.getByRole('status')).toHaveTextContent(locale.loading);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => directory.resolve(json([])));
    expect(await screen.findByText(locale.empty)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: locale.search }));
    const search = screen.getByRole('textbox', { name: locale.searchLabel });
    expect(await screen.findByRole('alert')).toHaveTextContent(locale.required);
    expect(search).toHaveAttribute('aria-invalid', 'true');
    expect(search).toHaveAttribute(
      'aria-describedby',
      'client-search-validation',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(search, { target: { value: 'Căutare {literal} Поиск' } });
    fireEvent.click(screen.getByRole('button', { name: locale.search }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status')).toHaveTextContent(locale.searching);
    expect(
      screen.getByRole('button', { name: locale.searching }),
    ).toBeDisabled();
    await act(async () => searchResults.resolve(json([])));
    expect(await screen.findByText(locale.noResults)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: locale.back }));
    expect(
      screen.getByRole('textbox', { name: locale.searchLabel }),
    ).toHaveValue('');
    expect(screen.getByText(locale.empty)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  },
);

it('keeps denied and missing-Company feedback safe and reactive in all locales', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const denied = renderWorkspace({ ...actor, workspacePermissions: [] });
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.denied);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  }
  denied.unmount();
  const withoutCompany: ActorContext = { ...actor };
  delete withoutCompany.activeCompany;
  renderWorkspace(withoutCompany);
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByText(locale.missingCompany)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  }
});

it('starts Client search in Romanian and accepts a literal mixed-language query', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
  );
  renderWorkspace();
  const search = await screen.findByRole('textbox', {
    name: 'Găsește un Client comun',
  });
  fireEvent.change(search, { target: { value: '  Știință {клиент} & Co  ' } });
  expect(search).toHaveValue('  Știință {клиент} & Co  ');
});

it('preserves the exact search and pending Company link through all locales and explicit failure recovery', async () => {
  const client = {
    id: 'client-literal',
    displayName: 'Știință {клиент} & Co',
    relatedToActiveCompany: false,
  };
  const query = '  Știință {клиент} & Co  ';
  const firstLink = deferredResponse();
  const secondLink = deferredResponse();
  let links = 0;
  let linked = false;
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === '/api/clients')
      return Promise.resolve(
        json(linked ? [{ ...client, relatedToActiveCompany: true }] : []),
      );
    if (path.startsWith('/api/clients/search?'))
      return Promise.resolve(json([client]));
    if (
      path === '/api/clients/client-literal/active-company-relationship' &&
      init?.method === 'PUT'
    ) {
      links += 1;
      return links === 1 ? firstLink.promise : secondLink.promise;
    }
    throw new Error(`Unexpected HTTP boundary: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  renderWorkspace();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  fireEvent.change(
    screen.getByRole('textbox', { name: locales[0].searchLabel }),
    {
      target: { value: query },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: locales[0].search }));
  await screen.findByRole('heading', { name: client.displayName });
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(
      screen.getByRole('textbox', { name: locale.searchLabel }),
    ).toHaveValue(query);
    expect(screen.getByRole('heading', { name: locale.results })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: client.displayName }),
    ).toBeVisible();
    expect(screen.getByText(locale.context)).toBeVisible();
    expect(screen.getByText(locale.oneResult)).toBeVisible();
    expect(screen.getByText(locale.clientId)).toBeVisible();
    expect(screen.getByText(locale.unavailable)).toBeVisible();
    expect(screen.getByRole('button', { name: locale.link })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }
  selectOption(screen.getByRole('combobox'), 'ro');
  fireEvent.click(screen.getByRole('button', { name: locales[0].link }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(screen.getByRole('button', { name: locale.linking })).toBeDisabled();
    expect(screen.getByRole('button', { name: locale.search })).toBeDisabled();
    expect(
      screen.getByRole('textbox', { name: locale.searchLabel }),
    ).toHaveValue(query);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }
  await act(async () =>
    firstLink.resolve(json({ message: 'Unavailable' }, 503)),
  );
  for (const locale of locales) {
    selectOption(screen.getByRole('combobox'), locale.code);
    expect(await screen.findByText(locale.error)).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: locale.searchLabel }),
    ).toHaveValue(query);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }
  fireEvent.click(screen.getByRole('button', { name: locales[3].search }));
  await screen.findByRole('heading', { name: client.displayName });
  fireEvent.click(screen.getByRole('button', { name: locales[3].link }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  linked = true;
  await act(async () =>
    secondLink.resolve(json({ ...client, relatedToActiveCompany: true })),
  );
  expect(await screen.findByText(locales[3].available)).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  for (const index of [1, 3]) {
    expect(fetchMock.mock.calls[index]).toEqual([
      '/api/clients/search?query=%C8%98tiin%C8%9B%C4%83%20%7B%D0%BA%D0%BB%D0%B8%D0%B5%D0%BD%D1%82%7D%20%26%20Co',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': 'company-directory',
        }),
      }),
    ]);
  }
  for (const index of [2, 4]) {
    const command = fetchMock.mock.calls[index];
    expect(command?.[0]).toBe(
      '/api/clients/client-literal/active-company-relationship',
    );
    expect(command?.[1]).toEqual(
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-directory',
        }),
      }),
    );
    expect(command?.[1]?.body).toBeUndefined();
    expect(command?.[1]?.headers).not.toHaveProperty('idempotency-key');
  }
});
