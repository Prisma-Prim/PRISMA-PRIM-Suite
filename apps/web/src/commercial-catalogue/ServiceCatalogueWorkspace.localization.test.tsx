import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { InterfaceLocaleProvider } from '../localization/interface-locale';
import { InterfaceLocaleSelect } from '../localization/InterfaceLocaleSelect';
import { changeValue, selectOption } from '../test/select-option';
import { ServiceCatalogueWorkspace } from './ServiceCatalogueWorkspace';

const actor: ActorContext = {
  internalUserId: 'user-catalogue',
  workspaceMembershipId: 'membership-catalogue',
  workspaceId: 'workspace-catalogue',
  workspaceName: 'Workspace {original}',
  displayName: 'Ana',
  email: 'ana@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-catalogue',
    displayName: 'Companie {originală}',
    clientPermissions: [],
    serviceCataloguePermissions: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
  },
};

function renderWorkspace(context = actor) {
  return render(
    <InterfaceLocaleProvider>
      <InterfaceLocaleSelect />
      <ServiceCatalogueWorkspace
        actor={context}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
      />
    </InterfaceLocaleProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('starts the complete Catalogue journey in Romanian', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ items: [] })),
  );
  renderWorkspace();

  expect(
    screen.getByRole('heading', { name: 'Catalogul serviciilor' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Definește serviciul' }),
  ).toBeVisible();
  expect(
    await screen.findByText(
      'Nu există încă definiții de servicii în acest Spațiu de lucru.',
    ),
  ).toBeVisible();
});

const locales = [
  {
    code: 'ro',
    title: 'Catalogul serviciilor',
    codeLabel: 'Codul serviciului',
    name: 'Denumirea serviciului',
    description: 'Descriere',
    define: 'Definește serviciul',
    label: 'Denumire comercială',
    selected: 'Definiția serviciului',
    offer: 'Înregistrează oferta de serviciu',
    error: 'Catalogul nu a putut fi încărcat sau salvat. Reîncercați.',
    created: 'Definiția serviciului ORIGINAL-637 a fost înregistrată.',
    offered:
      'Oferta pentru Serviciu {name} / Услуга a fost înregistrată ca disponibilă.',
  },
  {
    code: 'ru',
    title: 'Каталог услуг',
    codeLabel: 'Код услуги',
    name: 'Название услуги',
    description: 'Описание',
    define: 'Определить услугу',
    label: 'Коммерческое название',
    selected: 'Определение услуги',
    offer: 'Зарегистрировать предложение услуги',
    error: 'Не удалось загрузить или сохранить каталог. Повторите попытку.',
    created: 'Определение услуги ORIGINAL-637 зарегистрировано.',
    offered:
      'Предложение для Serviciu {name} / Услуга зарегистрировано как доступное.',
  },
  {
    code: 'fr',
    title: 'Catalogue des services',
    codeLabel: 'Code du service',
    name: 'Nom du service',
    description: 'Description',
    define: 'Définir le service',
    label: 'Libellé commercial',
    selected: 'Définition de service',
    offer: 'Enregistrer la prestation',
    error: 'Le catalogue n’a pas pu être chargé ou enregistré. Réessayez.',
    created: 'Définition de service ORIGINAL-637 enregistrée.',
    offered:
      'Prestation pour Serviciu {name} / Услуга enregistrée comme disponible.',
  },
  {
    code: 'en',
    title: 'Service Catalogue',
    codeLabel: 'Service code',
    name: 'Service name',
    description: 'Description',
    define: 'Define Service',
    label: 'Commercial label',
    selected: 'Service Definition',
    offer: 'Record offering',
    error: 'The catalogue could not be loaded or saved. Please try again.',
    created: 'Service Definition ORIGINAL-637 recorded.',
    offered: 'Offering for Serviciu {name} / Услуга recorded as available.',
  },
] as const;

function chooseLocale(value: string) {
  selectOption(
    screen.getByRole('combobox', {
      name: /^(Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language)$/u,
    }),
    value,
  );
}

const definition = {
  id: 'definition-637',
  code: 'ORIGINAL-637',
  name: 'Serviciu {name} / Услуга',
  description: 'Dovadă {code} / Доказательство',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actor.workspaceMembershipId,
  createdAt: '2026-10-16T10:00:00.000Z',
};
const offering = {
  id: 'offering-637',
  companyId: 'company-catalogue',
  serviceDefinitionId: definition.id,
  serviceDefinition: { code: definition.code, name: definition.name },
  commercialLabel: 'Etichetă {name} / Название',
  availability: 'AVAILABLE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actor.workspaceMembershipId,
  createdAt: '2026-10-16T10:05:00.000Z',
};

it.each(locales)(
  'preserves both exact command retries and reactive feedback in $code',
  async (locale) => {
    const definitions: RequestInit[] = [];
    const offerings: RequestInit[] = [];
    let definitionSaved = false;
    let offeringSaved = false;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (init?.method === 'POST') {
          if (path.endsWith('/service-definitions')) {
            definitions.push(init);
            if (definitions.length === 1)
              return new Response(null, { status: 503 });
            definitionSaved = true;
            return Response.json(
              { outcome: 'CREATED', definition },
              { status: 201 },
            );
          }
          offerings.push(init);
          if (offerings.length === 1)
            return new Response(null, { status: 503 });
          offeringSaved = true;
          return Response.json(
            { outcome: 'CREATED', offering },
            { status: 201 },
          );
        }
        return Response.json({
          items: path.includes('/service-definitions')
            ? definitionSaved
              ? [definition]
              : []
            : offeringSaved
              ? [offering]
              : [],
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    chooseLocale(locale.code);
    expect(screen.getByRole('heading', { name: locale.title })).toBeVisible();
    changeValue(screen.getByLabelText(locale.codeLabel), definition.code);
    changeValue(screen.getByLabelText(locale.name), definition.name);
    changeValue(
      screen.getByLabelText(locale.description),
      definition.description,
    );
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    chooseLocale(alternate.code);
    expect(screen.getByLabelText(alternate.codeLabel)).toHaveValue(
      definition.code,
    );
    expect(screen.getByLabelText(alternate.name)).toHaveValue(definition.name);
    expect(screen.getByLabelText(alternate.description)).toHaveValue(
      definition.description,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: alternate.define }));
    expect(await screen.findByRole('alert')).toHaveTextContent(alternate.error);
    chooseLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(definitions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: locale.define }));
    expect(await screen.findByText(locale.created)).toBeVisible();
    expect(definitions).toHaveLength(2);
    expect(definitions[1]?.body).toBe(definitions[0]?.body);
    expect(definitions[0]?.body).toBe(
      JSON.stringify({
        code: definition.code,
        name: definition.name,
        description: definition.description,
      }),
    );
    const firstHeaders = new Headers(definitions[0]?.headers);
    expect(firstHeaders.get('idempotency-key')).toBeTruthy();
    expect(new Headers(definitions[1]?.headers).get('idempotency-key')).toBe(
      firstHeaders.get('idempotency-key'),
    );
    expect(firstHeaders.get('x-company-context-id')).toBe('company-catalogue');
    await waitFor(() =>
      expect(screen.getByLabelText(locale.selected)).toHaveTextContent(
        definition.name,
      ),
    );
    changeValue(screen.getByLabelText(locale.label), offering.commercialLabel);
    const readsBeforeLocale = fetchMock.mock.calls.length;
    chooseLocale(alternate.code);
    expect(screen.getByText(alternate.created)).toBeVisible();
    expect(screen.getByLabelText(alternate.selected)).toHaveTextContent(
      definition.name,
    );
    expect(screen.getByLabelText(alternate.label)).toHaveValue(
      offering.commercialLabel,
    );
    expect(fetchMock).toHaveBeenCalledTimes(readsBeforeLocale);
    fireEvent.click(screen.getByRole('button', { name: alternate.offer }));
    expect(await screen.findByRole('alert')).toHaveTextContent(alternate.error);
    chooseLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(locale.error);
    expect(offerings).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: locale.offer }));
    expect(await screen.findByText(locale.offered)).toBeVisible();
    expect(offerings).toHaveLength(2);
    expect(offerings[1]?.body).toBe(offerings[0]?.body);
    expect(offerings[0]?.body).toBe(
      JSON.stringify({
        serviceDefinitionId: definition.id,
        commercialLabel: offering.commercialLabel,
      }),
    );
    const offeringHeaders = new Headers(offerings[0]?.headers);
    expect(offeringHeaders.get('idempotency-key')).toBeTruthy();
    expect(new Headers(offerings[1]?.headers).get('idempotency-key')).toBe(
      offeringHeaders.get('idempotency-key'),
    );
    expect(offeringHeaders.get('x-company-context-id')).toBe(
      'company-catalogue',
    );
    expect(offeringHeaders.get('idempotency-key')).not.toBe(
      firstHeaders.get('idempotency-key'),
    );
    chooseLocale(alternate.code);
    expect(screen.getByText(alternate.offered)).toBeVisible();
    expect(await screen.findByText(offering.commercialLabel)).toBeVisible();
  },
);

const pageCopy = {
  ro: {
    definitions: 'Definiții de servicii',
    offerings: 'Oferte de servicii ale Companiei',
    olderDefinitions: 'Arată definițiile de servicii mai vechi',
    olderOfferings: 'Arată ofertele de servicii mai vechi',
    definitionsError:
      'Definițiile de servicii mai vechi nu au putut fi încărcate. Reîncercați.',
    offeringsError:
      'Ofertele de servicii mai vechi nu au putut fi încărcate. Reîncercați.',
    denied: 'Nu aveți permisiunea de a accesa Catalogul serviciilor.',
  },
  ru: {
    definitions: 'Определения услуг',
    offerings: 'Предложения услуг Компании',
    olderDefinitions: 'Показать более ранние определения услуг',
    olderOfferings: 'Показать более ранние предложения услуг',
    definitionsError:
      'Не удалось загрузить более ранние определения услуг. Повторите попытку.',
    offeringsError:
      'Не удалось загрузить более ранние предложения услуг. Повторите попытку.',
    denied: 'У вас нет разрешения на доступ к Каталогу услуг.',
  },
  fr: {
    definitions: 'Définitions de services',
    offerings: 'Prestations de la Compagnie',
    olderDefinitions: 'Afficher les Définitions de services plus anciennes',
    olderOfferings: 'Afficher les prestations plus anciennes',
    definitionsError:
      'Les Définitions de services plus anciennes n’ont pas pu être chargées. Réessayez.',
    offeringsError:
      'Les prestations plus anciennes n’ont pas pu être chargées. Réessayez.',
    denied:
      'Vous n’avez pas l’autorisation d’accéder au Catalogue des services.',
  },
  en: {
    definitions: 'Service Definitions',
    offerings: 'Company Service Offerings',
    olderDefinitions: 'Show older Service Definitions',
    olderOfferings: 'Show older offerings',
    definitionsError:
      'Older Service Definitions could not be loaded. Please try again.',
    offeringsError: 'Older offerings could not be loaded. Please try again.',
    denied: 'You do not have permission to access the Service Catalogue.',
  },
};

it.each(locales)(
  'retains both older-page failures, rows and cursors across $code changes',
  async (locale) => {
    let definitionAttempts = 0;
    let offeringAttempts = 0;
    const olderDefinition = {
      ...definition,
      id: 'older-definition',
      code: 'OLDER-637',
      name: 'Vechi {code} / Старый',
    };
    const olderOffering = {
      ...offering,
      id: 'older-offering',
      commercialLabel: 'Vechi {name} / Старый',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString(), 'http://localhost');
      const definitions = url.pathname.endsWith('/service-definitions');
      if (url.searchParams.has('cursor')) {
        expect(url.searchParams.get('cursor')).toBe(
          definitions ? 'definitions/+older' : 'offerings/+older',
        );
        const attempt = definitions ? ++definitionAttempts : ++offeringAttempts;
        return attempt === 1
          ? new Response(null, { status: 503 })
          : Response.json({
              items: [definitions ? olderDefinition : olderOffering],
            });
      }
      return Response.json({
        items: [definitions ? definition : offering],
        nextCursor: definitions ? 'definitions/+older' : 'offerings/+older',
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWorkspace();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    chooseLocale(locale.code);
    const copy = pageCopy[locale.code];
    expect(
      await screen.findByRole('list', { name: copy.offerings }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: copy.olderDefinitions }),
    );
    expect(await screen.findByText(copy.definitionsError)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: copy.olderOfferings }));
    expect(await screen.findByText(copy.offeringsError)).toBeVisible();
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    const alternateCopy = pageCopy[alternate.code];
    chooseLocale(alternate.code);
    expect(screen.getByText(alternateCopy.definitionsError)).toBeVisible();
    expect(screen.getByText(alternateCopy.offeringsError)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      within(
        screen.getByRole('list', { name: alternateCopy.definitions }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(
      within(
        screen.getByRole('list', { name: alternateCopy.offerings }),
      ).getAllByRole('listitem'),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: alternateCopy.olderDefinitions }),
    );
    expect(await screen.findByText(olderDefinition.name)).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: alternateCopy.olderOfferings }),
    );
    expect(
      await screen.findByText(olderOffering.commercialLabel),
    ).toBeVisible();
    chooseLocale(locale.code);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      within(screen.getByRole('list', { name: copy.definitions })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole('list', { name: copy.offerings })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: copy.olderDefinitions }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.olderOfferings }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  },
);

it('translates denial without fetching metadata or adding commands', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  renderWorkspace({ ...actor, activeCompany: undefined });
  for (const locale of locales) {
    chooseLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(
      pageCopy[locale.code].denied,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps validation and immutable-record conflicts reactive without losing original drafts', async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const definitions = input.toString().includes('/service-definitions');
      return init?.method === 'POST'
        ? Response.json(
            {
              code: definitions ? 'SERVICE_CODE_CONFLICT' : 'OFFERING_CONFLICT',
            },
            { status: 409 },
          )
        : Response.json({ items: definitions ? [definition] : [] });
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  renderWorkspace();
  expect(await screen.findByText(definition.name)).toBeVisible();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button', { name: locales[0].define }));
  const validation = [
    'Introduceți un cod de serviciu de 1–40 de caractere',
    'Введите код услуги длиной 1–40 символов',
    'Saisissez un code de service de 1 à 40 caractères',
    'Enter a service code of 1 to 40 characters',
  ];
  for (const [index, locale] of locales.entries()) {
    chooseLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(
      validation[index] ?? 'missing expected validation',
    );
  }
  expect(fetchMock).toHaveBeenCalledTimes(2);
  changeValue(screen.getByLabelText('Service code'), definition.code);
  changeValue(screen.getByLabelText('Service name'), definition.name);
  fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Service code ORIGINAL-637 already exists',
    ),
  );
  const conflicts = [
    'Codul serviciului ORIGINAL-637 există deja în acest Spațiu de lucru cu un conținut diferit.',
    'Код услуги ORIGINAL-637 уже существует в этом Рабочем пространстве с другим содержимым.',
    'Le code de service ORIGINAL-637 existe déjà dans cet Espace de travail avec un contenu différent.',
    'Service code ORIGINAL-637 already exists in this Workspace with different content.',
  ];
  for (const [index, locale] of locales.entries()) {
    chooseLocale(locale.code);
    expect(screen.getByRole('alert')).toHaveTextContent(
      conflicts[index] ?? 'missing expected conflict',
    );
    expect(screen.getByLabelText(locale.name)).toHaveValue(definition.name);
  }
  expect(fetchMock).toHaveBeenCalledTimes(3);
  selectOption(screen.getByLabelText('Service Definition'), definition.id);
  changeValue(
    screen.getByLabelText('Commercial label'),
    offering.commercialLabel,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
  await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  const duplicates = [
    'Această Companie oferă deja Serviciu {name} / Услуга cu o altă denumire comercială.',
    'Эта Компания уже предлагает Serviciu {name} / Услуга с другим коммерческим названием.',
    'Cette Compagnie propose déjà Serviciu {name} / Услуга avec un autre libellé commercial.',
    'This Company already offers Serviciu {name} / Услуга with a different commercial label.',
  ];
  for (const [index, locale] of locales.entries()) {
    chooseLocale(locale.code);
    expect(
      screen.getByText((value) =>
        value.startsWith(duplicates[index] ?? 'missing expected duplicate'),
      ),
    ).toBeVisible();
    expect(screen.getByLabelText(locale.selected)).toHaveTextContent(
      definition.name,
    );
    expect(screen.getByLabelText(locale.label)).toHaveValue(
      offering.commercialLabel,
    );
  }
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
