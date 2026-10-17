import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { ClientDossierPanel } from './client/ClientDossierPanel';
import { ApplicationPresentation } from './production-shell/application-presentation';
import {
  InterfaceLocaleProvider,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from './localization/interface-locale';
import { InterfaceLocaleSelect } from './localization/InterfaceLocaleSelect';
import { selectOption } from './test/select-option';

const locales = [
  {
    code: 'ro',
    title: 'Entități juridice și sucursale',
    add: 'Adaugă o entitate juridică sau sucursală',
    addTitle: 'Adăugarea unei entități juridice sau sucursale',
    name: 'Denumirea juridică exactă',
    tax: 'IDNO / cod fiscal',
    address: 'Adresa juridică',
    save: 'Salvează entitatea juridică',
    saving: 'Se salvează entitatea juridică…',
    cancel: 'Anulează',
    correct: 'Corectează',
    required: 'Introduceți denumirea juridică exactă.',
    recorded: 'Entitatea juridică sau sucursala a fost înregistrată.',
    corrected: 'Entitatea juridică sau sucursala a fost corectată.',
    unchanged: 'Modificați cel puțin o valoare înainte de salvare.',
    uncertain:
      'Nu am putut confirma dacă această modificare a fost salvată. Salvați din nou pentru a reîncerca în siguranță exact aceeași modificare.',
    stale:
      'Acest dosar al Clientului s-a modificat înainte de salvarea modificării dvs. Reîncărcați entitățile juridice și sucursalele înainte de a încerca din nou.',
    reload: 'Reîncarcă entitățile juridice și sucursalele',
    capacity:
      'Acest Client are deja numărul maxim de 50 de entități juridice sau sucursale suplimentare. Nu s-a adăugat nimic.',
    nameLong: 'Denumirea juridică trebuie să aibă cel mult 200 de caractere.',
    taxLong: 'IDNO / codul fiscal trebuie să aibă cel mult 500 de caractere.',
    addressLong: 'Adresa juridică trebuie să aibă cel mult 2.000 de caractere.',
    loading: 'Se încarcă entitățile juridice și sucursalele…',
    error:
      'Entitățile juridice și sucursalele nu au putut fi încărcate. Dosarul rămâne disponibil.',
    retry: 'Reîncearcă încărcarea entităților juridice și sucursalelor',
    unavailable:
      'Entitățile juridice și sucursalele nu sunt disponibile cu accesul dvs. actual.',
    invalid: 'Verificați valorile entității juridice și încercați din nou.',
  },
  {
    code: 'ru',
    title: 'Юридические лица и филиалы',
    add: 'Добавить юридическое лицо или филиал',
    addTitle: 'Добавление юридического лица или филиала',
    name: 'Точное юридическое наименование',
    tax: 'IDNO / налоговый код',
    address: 'Юридический адрес',
    save: 'Сохранить юридическое лицо',
    saving: 'Сохранение юридического лица…',
    cancel: 'Отмена',
    correct: 'Исправить',
    required: 'Введите точное юридическое наименование.',
    recorded: 'Юридическое лицо или филиал зарегистрированы.',
    corrected: 'Юридическое лицо или филиал исправлены.',
    unchanged: 'Перед сохранением измените хотя бы одно значение.',
    uncertain:
      'Не удалось подтвердить, сохранено ли это изменение. Сохраните снова, чтобы безопасно повторить точно такое же изменение.',
    stale:
      'Досье этого Клиента изменилось до сохранения вашего изменения. Перезагрузите юридические лица и филиалы перед повторной попыткой.',
    reload: 'Перезагрузить юридические лица и филиалы',
    capacity:
      'У этого Клиента уже зарегистрировано максимально допустимое количество дополнительных юридических лиц или филиалов: 50. Ничего не добавлено.',
    nameLong:
      'Юридическое наименование должно содержать не более 200 символов.',
    taxLong: 'IDNO / налоговый код должен содержать не более 500 символов.',
    addressLong: 'Юридический адрес должен содержать не более 2 000 символов.',
    loading: 'Загрузка юридических лиц и филиалов…',
    error:
      'Не удалось загрузить юридические лица и филиалы. Досье остаётся доступным.',
    retry: 'Повторить загрузку юридических лиц и филиалов',
    unavailable:
      'Юридические лица и филиалы недоступны при вашем текущем доступе.',
    invalid: 'Проверьте данные юридического лица и повторите попытку.',
  },
  {
    code: 'fr',
    title: 'Entités juridiques et succursales',
    add: 'Ajouter une entité juridique ou une succursale',
    addTitle: 'Ajout d’une entité juridique ou d’une succursale',
    name: 'Dénomination juridique exacte',
    tax: 'IDNO / code fiscal',
    address: 'Adresse juridique',
    save: 'Enregistrer l’entité juridique',
    saving: 'Enregistrement de l’entité juridique…',
    cancel: 'Annuler',
    correct: 'Corriger',
    required: 'Saisissez la dénomination juridique exacte.',
    recorded: 'Entité juridique ou succursale enregistrée.',
    corrected: 'Entité juridique ou succursale corrigée.',
    unchanged: 'Modifiez au moins une valeur avant d’enregistrer.',
    uncertain:
      'Nous n’avons pas pu confirmer si cette modification a été enregistrée. Enregistrez à nouveau pour réessayer exactement la même modification en toute sécurité.',
    stale:
      'Le dossier de ce Client a changé avant l’enregistrement de votre modification. Rechargez les entités juridiques et succursales avant de réessayer.',
    reload: 'Recharger les entités juridiques et succursales',
    capacity:
      'Ce Client a déjà atteint le maximum de 50 entités juridiques ou succursales supplémentaires. Aucun ajout n’a été effectué.',
    nameLong: 'La dénomination juridique doit contenir au plus 200 caractères.',
    taxLong: 'L’IDNO / code fiscal doit contenir au plus 500 caractères.',
    addressLong: 'L’adresse juridique doit contenir au plus 2 000 caractères.',
    loading: 'Chargement des entités juridiques et succursales…',
    error:
      'Impossible de charger les entités juridiques et succursales. Le dossier reste disponible.',
    retry: 'Réessayer le chargement des entités juridiques et succursales',
    unavailable:
      'Les entités juridiques et succursales ne sont pas disponibles avec votre accès actuel.',
    invalid: 'Vérifiez les valeurs de l’entité juridique et réessayez.',
  },
  {
    code: 'en',
    title: 'Legal entities and branches',
    add: 'Add legal entity or branch',
    addTitle: 'Add a legal entity or branch',
    name: 'Exact legal name',
    tax: 'IDNO / tax code',
    address: 'Legal address',
    save: 'Save legal entity',
    saving: 'Saving legal entity…',
    cancel: 'Cancel',
    correct: 'Correct',
    required: 'Enter the exact legal name.',
    recorded: 'Legal entity or branch recorded.',
    corrected: 'Legal entity or branch corrected.',
    unchanged: 'Change at least one value before saving.',
    uncertain:
      'We could not confirm whether this change was saved. Save again to retry exactly the same change safely.',
    stale:
      'This Client dossier changed before your change was saved. Reload the legal entities and branches before trying again.',
    reload: 'Reload legal entities and branches',
    capacity:
      'This Client already records the maximum of 50 additional legal entities or branches. Nothing was added.',
    nameLong: 'The legal name must be 200 characters or fewer.',
    taxLong: 'The IDNO / tax code must be 500 characters or fewer.',
    addressLong: 'The legal address must be 2,000 characters or fewer.',
    loading: 'Loading legal entities and branches…',
    error:
      'Legal entities and branches could not be loaded. The dossier remains available.',
    retry: 'Retry legal entities and branches',
    unavailable:
      'Legal entities and branches are not available with your current access.',
    invalid: 'Check the legal entity values and try again.',
  },
] as const;

const companyA = { id: 'company-a', displayName: 'PRISMA-PRIM' };
const dossier = {
  id: 'client-one',
  displayName: 'GRUP Demo SA',
  relatedToActiveCompany: true,
  taxId: '1002600000001',
  address: 'Str. Demo 1, Chișinău',
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Ana Demo', email: 'ana.demo@example.test' }],
  version: 3,
  involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
};
interface Entity {
  id: string;
  legalName: string;
  taxId: string | null;
  legalAddress: string | null;
  createdAt: string;
}
const branch: Entity = {
  id: 'legal-entity-1',
  legalName: 'GRUP Demo SA — Sucursala Bălți',
  taxId: '1002600000001',
  legalAddress: null,
  createdAt: '2026-09-26T08:00:00.000Z',
};
const logistic: Entity & { legalAddress: string } = {
  id: 'legal-entity-2',
  legalName: 'Demo Logistic SRL',
  taxId: null,
  legalAddress: 'Str. Industrială 1, Chișinău',
  createdAt: '2026-09-26T08:05:00.000Z',
};
type Presentation = 'prisme' | 'classic';

function directorActor(): ActorContext {
  return {
    internalUserId: 'director',
    workspaceMembershipId: 'membership-1',
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Director',
    email: 'director@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...companyA,
      clientPermissions: ['client.read', 'client.create', 'client.update'],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
    },
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}

interface EntityRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | undefined;
  key: string | null;
}
type Route = (
  request: EntityRequest,
) => Response | Promise<Response> | undefined;

/**
 * Serves one dossier through a small in-memory API. `route` may answer any
 * legal-entity request first; otherwise the server applies the command.
 */
function renderDossier({
  entities = [],
  route = () => undefined,
  dossierRoute = () => undefined,
  presentation = 'prisme',
  canUpdate = true,
  clientAccountId = dossier.id,
  locale = 'en',
  application = false,
}: {
  entities?: Entity[];
  route?: Route;
  dossierRoute?: Route;
  presentation?: Presentation;
  canUpdate?: boolean;
  clientAccountId?: string;
  locale?: InterfaceLocale | null;
  application?: boolean;
} = {}) {
  const server = {
    version: dossier.version,
    address: dossier.address,
    entities: [...entities],
    actor: directorActor(),
    activityReads: 0,
  };
  const requests: EntityRequest[] = [];
  const wireCommands: {
    method: string;
    path: string;
    body: string;
    key: string | null;
    company: string | null;
  }[] = [];
  const dossierRequests: EntityRequest[] = [];
  const dossierCorrections: Record<string, unknown>[] = [];
  const activity = vi.fn(async () => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';
      if (path.endsWith('/access/current-actor')) {
        if (
          new Headers(init?.headers).get('x-company-context-id') === 'company-b'
        )
          server.actor = {
            ...server.actor,
            activeCompany: {
              ...server.actor.activeCompany,
              id: 'company-b',
              displayName: 'Company B',
            },
          };
        return respond(server.actor);
      }
      if (path.endsWith('/companies'))
        return respond([
          companyA,
          { id: 'company-b', displayName: 'Company B' },
        ]);
      if (path.endsWith('/activity-log')) {
        server.activityReads += 1;
        return respond({ events: [] });
      }
      if (path.includes('/clients/search?')) return respond({}, 403);
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.endsWith('/union-history')) return respond([]);
      if (path.endsWith('/clients'))
        return respond([
          dossier,
          { ...dossier, id: 'client-two', displayName: 'Other Demo SRL' },
        ]);
      if (path.endsWith('/correction-history'))
        return respond({ corrections: [], nextCursor: null });
      if (path.includes('/legal-entities')) {
        if (!application)
          expect(new Headers(init?.headers).get('x-company-context-id')).toBe(
            companyA.id,
          );
        const request: EntityRequest = {
          method,
          path: path.replace(/^\/api/u, ''),
          body:
            init?.body === undefined
              ? undefined
              : record(JSON.parse(String(init.body))),
          key: new Headers(init?.headers).get('idempotency-key'),
        };
        if (init?.body !== undefined)
          wireCommands.push({
            method,
            path,
            body: String(init.body),
            key: request.key,
            company: new Headers(init.headers).get('x-company-context-id'),
          });
        requests.push(request);
        const answered = await route(request);
        if (answered) return answered;
        return serve(request);
      }
      if (path.endsWith('/clients/client-one')) {
        const request: EntityRequest = {
          method,
          path,
          key: new Headers(init?.headers).get('idempotency-key'),
          body:
            init?.body === undefined
              ? undefined
              : record(JSON.parse(String(init.body))),
        };
        dossierRequests.push(request);
        const answered = await dossierRoute(request);
        if (answered) return answered;
      }
      if (path.endsWith('/clients/client-one') && method === 'PATCH') {
        const body = record(JSON.parse(String(init?.body)));
        dossierCorrections.push(body);
        if (body.expectedVersion !== server.version)
          return respond(
            {
              statusCode: 409,
              error: 'Conflict',
              message: 'The Client dossier has changed.',
            },
            409,
          );
        server.version += 1;
        return respond({ ...dossier, ...body, version: server.version });
      }
      if (path.endsWith('/clients/client-one'))
        return respond({
          ...dossier,
          address: server.address,
          version: server.version,
        });
      if (path.endsWith('/clients/client-two'))
        return respond({
          ...dossier,
          id: 'client-two',
          displayName: 'Other Demo SRL',
        });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  function serve(request: EntityRequest): Response {
    if (request.method === 'GET')
      return respond({
        clientVersion: server.version,
        legalEntities: server.entities,
      });
    const body = request.body ?? {};
    if (body.expectedClientVersion !== server.version)
      return respond(
        {
          statusCode: 409,
          error: 'Conflict',
          message: 'The Client dossier has changed.',
        },
        409,
      );
    server.version += 1;
    if (request.method === 'POST') {
      const created = {
        id: `legal-entity-${server.entities.length + 1}`,
        legalName: String(body.legalName),
        taxId: typeof body.taxId === 'string' ? body.taxId : null,
        legalAddress:
          typeof body.legalAddress === 'string' ? body.legalAddress : null,
        createdAt: `2026-09-26T09:0${server.entities.length}:00.000Z`,
      };
      server.entities.push(created);
      return respond(
        { clientVersion: server.version, legalEntity: created },
        201,
      );
    }
    const id = request.path.split('/').at(-1);
    const current = server.entities.find((entity) => entity.id === id);
    if (!current) return respond({ statusCode: 404 }, 404);
    const corrected = { ...current, ...record(body.changes) };
    server.entities = server.entities.map((entity) =>
      entity.id === id ? corrected : entity,
    );
    return respond({ clientVersion: server.version, legalEntity: corrected });
  }
  if (locale === null) localStorage.removeItem(interfaceLocaleStorageKey);
  else localStorage.setItem(interfaceLocaleStorageKey, locale);
  if (application)
    window.history.replaceState(null, '', '/?frame=prisme#clients');
  const view = render(
    application ? (
      <App identity={deterministicBrowserIdentity()} />
    ) : (
      <ApplicationPresentation value={presentation}>
        <ClientDossierPanel
          clientAccountId={clientAccountId}
          companyContextId={companyA.id}
          canUpdate={canUpdate}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={activity}
          onClientsChanged={async () => undefined}
        />
      </ApplicationPresentation>
    ),
    {
      wrapper: ({ children }) => (
        <InterfaceLocaleProvider>
          <InterfaceLocaleSelect />
          {children}
        </InterfaceLocaleProvider>
      ),
    },
  );
  return {
    server,
    requests,
    wireCommands,
    dossierRequests,
    dossierCorrections,
    activity,
    view,
  };
}

async function section() {
  return screen.findByRole('region', { name: 'Legal entities and branches' });
}
function mutations(requests: EntityRequest[]) {
  return requests.filter((request) => request.method !== 'GET');
}
async function openAdd() {
  const region = await section();
  const add = await within(region).findByRole('button', {
    name: 'Add legal entity or branch',
  });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  return within(region).getByRole('form', {
    name: 'Add a legal entity or branch',
  });
}
function fill(form: HTMLElement, values: Partial<Record<string, string>>) {
  for (const [label, value] of Object.entries(values))
    fireEvent.change(within(form).getByLabelText(label), {
      target: { value },
    });
}
function save(form: HTMLElement) {
  fireEvent.click(
    within(form).getByRole('button', { name: 'Save legal entity' }),
  );
}

describe('Client legal entities and branches', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('starts the public legal-entity panel in Romanian without an explicit choice', async () => {
    renderDossier({ locale: null });
    const region = await screen.findByRole('region', {
      name: 'Entități juridice și sucursale',
    });
    expect(
      await within(region).findByText(
        'Nu sunt înregistrate entități juridice sau sucursale suplimentare. Identitatea din dosarul de mai sus este organizația principală.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('button', {
        name: 'Adaugă o entitate juridică sau sucursală',
      }),
    ).toBeEnabled();
  });

  it.each(['prisme', 'classic'] as const)(
    'shows the empty state once, after the shared fields and apart from Contacts (%s)',
    async (presentation) => {
      renderDossier({ presentation });
      const region = await section();
      expect(
        await within(region).findByText(
          'No additional legal entities or branches recorded. The dossier identity above is the main organization.',
        ),
      ).toBeVisible();
      expect(
        screen.getAllByRole('region', { name: 'Legal entities and branches' }),
      ).toHaveLength(1);
      const shared = screen.getByRole('heading', { name: 'Shared details' });
      const contacts = screen.getByRole('heading', { name: 'Contacts' });
      expect(
        shared.compareDocumentPosition(region) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(contacts.closest('section')?.contains(region)).toBe(false);
      expect(within(region).queryByText('Ana Demo')).not.toBeInTheDocument();
    },
  );

  it('lists each entity with its IDNO and address or not recorded', async () => {
    const long = {
      ...logistic,
      id: 'legal-entity-3',
      legalName: 'N'.repeat(200),
      legalAddress: 'Str. '.repeat(400),
    };
    renderDossier({ entities: [branch, logistic, long] });
    const region = await section();
    const list = await within(region).findByRole('list', {
      name: 'Recorded legal entities and branches',
    });
    const items = within(list).getAllByRole('listitem');
    expect(
      items.map((item) => item.querySelector('strong')?.textContent),
    ).toEqual([branch.legalName, logistic.legalName, long.legalName]);
    const [first, second] = items;
    if (!first || !second) throw new Error('Expected two entities.');
    expect(within(first).getByText('1002600000001')).toBeVisible();
    expect(within(first).getByText('Not recorded')).toBeVisible();
    expect(within(second).getByText('Not recorded')).toBeVisible();
    expect(within(second).getByText(logistic.legalAddress)).toBeVisible();
    expect(within(first).getAllByText('IDNO / tax code')).toHaveLength(1);
    expect(within(first).getAllByText('Legal address')).toHaveLength(1);
  });

  it('keeps the dossier usable when the list fails and retries on request', async () => {
    let attempts = 0;
    renderDossier({
      entities: [branch],
      route: (request) => {
        if (request.method !== 'GET') return undefined;
        attempts += 1;
        return attempts === 1
          ? respond({}, 503)
          : attempts === 2
            ? respond({ clientVersion: 3, legalEntities: [{ id: 'x' }] })
            : undefined;
      },
    });
    const region = await section();
    expect(await within(region).findByRole('alert')).toHaveTextContent(
      'Legal entities and branches could not be loaded. The dossier remains available.',
    );
    expect(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('heading', { name: dossier.displayName }),
    ).toBeVisible();
    fireEvent.click(
      within(region).getByRole('button', {
        name: 'Retry legal entities and branches',
      }),
    );
    // A malformed response is an error too, never a partial list.
    expect(await within(region).findByRole('alert')).toBeVisible();
    fireEvent.click(
      within(region).getByRole('button', {
        name: 'Retry legal entities and branches',
      }),
    );
    expect(await within(region).findByText(branch.legalName)).toBeVisible();
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([403, 404])(
    'shows only a safe unavailable state without counts for a %s refusal',
    async (status) => {
      renderDossier({
        entities: [branch],
        route: (request) =>
          request.method === 'GET' ? respond({}, status) : undefined,
      });
      const region = await section();
      expect(
        await within(region).findByText(
          'Legal entities and branches are not available with your current access.',
        ),
      ).toBeVisible();
      expect(within(region).queryByRole('list')).not.toBeInTheDocument();
      expect(
        within(region).queryByRole('button', {
          name: 'Add legal entity or branch',
        }),
      ).not.toBeInTheDocument();
      expect(within(region).queryByText(/\d/u)).not.toBeInTheDocument();
    },
  );

  it('loads coherent current fields and version when opening a new correction after an entity change', async () => {
    const { server, dossierCorrections } = renderDossier();
    const form = await openAdd();
    fill(form, { 'Exact legal name': branch.legalName });
    save(form);
    await screen.findByText('Version 4');
    // A later shared-field correction must not be overwritten by the old draft.
    server.address = 'Current shared address';
    server.version = 5;
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Address')).toHaveValue(
        'Current shared address',
      ),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correction).getByLabelText('Telephone'), {
      target: { value: '+373 22 000 393' },
    });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Save correction' }),
    );
    await waitFor(() =>
      expect(dossierCorrections).toEqual([
        expect.objectContaining({
          expectedVersion: 5,
          address: 'Current shared address',
          telephone: '+373 22 000 393',
        }),
      ]),
    );
    expect(await screen.findByText('Version 6')).toBeVisible();
  });

  it('loads coherent current fields and version after the entity list observes a newer dossier', async () => {
    const list = deferred<Response>();
    const { server, dossierCorrections, dossierRequests } = renderDossier({
      route: (request) => (request.method === 'GET' ? list.promise : undefined),
    });
    const region = await section();
    server.address = 'Current shared address';
    server.version = 4;
    list.resolve(respond({ clientVersion: 4, legalEntities: [] }));
    await within(region).findByText(
      'No additional legal entities or branches recorded. The dossier identity above is the main organization.',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Address')).toHaveValue(
        'Current shared address',
      ),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correction).getByLabelText('Telephone'), {
      target: { value: '+373 22 000 393' },
    });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Save correction' }),
    );

    await waitFor(() =>
      expect(dossierCorrections).toEqual([
        expect.objectContaining({
          expectedVersion: 4,
          address: 'Current shared address',
          telephone: '+373 22 000 393',
        }),
      ]),
    );
    expect(await screen.findByText('Version 5')).toBeVisible();
    expect(
      dossierRequests.filter((request) => request.method === 'GET'),
    ).toHaveLength(2);
  });

  it.each([403, 404, 503])(
    'does not expose or submit a fresh draft when its required refresh returns %s',
    async (status) => {
      let reads = 0;
      const { dossierRequests } = renderDossier({
        dossierRoute: (request) => {
          if (request.method === 'GET' && ++reads > 1)
            return respond({ statusCode: status }, status);
          return undefined;
        },
      });
      const form = await openAdd();
      fill(form, { 'Exact legal name': branch.legalName });
      save(form);
      await screen.findByText('Version 4');
      fireEvent.click(
        screen.getByRole('button', { name: 'Correct Client dossier' }),
      );
      await screen.findByRole('alert');
      expect(
        screen.queryByRole('form', { name: 'Correct Client dossier' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(dossier.address)).not.toBeInTheDocument();
      expect(
        dossierRequests.filter((request) => request.method === 'PATCH'),
      ).toEqual([]);
      expect(reads).toBe(2);
    },
  );

  it.each([false, true])(
    'preserves a closed edited dossier draft and uncertain retry=%s through entity changes',
    async (uncertain) => {
      const { dossierRequests } = renderDossier({
        dossierRoute: (request) =>
          uncertain && request.method === 'PATCH'
            ? respond({}, 503)
            : undefined,
      });
      await screen.findByText('Version 3');
      fireEvent.click(
        screen.getByRole('button', { name: 'Correct Client dossier' }),
      );
      const correction = screen.getByRole('form', {
        name: 'Correct Client dossier',
      });
      fireEvent.change(within(correction).getByLabelText('Telephone'), {
        target: { value: '+373 22 000 393' },
      });
      if (uncertain) {
        fireEvent.click(
          within(correction).getByRole('button', { name: 'Save correction' }),
        );
        await screen.findByRole('alert');
      }
      fireEvent.click(screen.getByRole('button', { name: 'Close correction' }));
      const form = await openAdd();
      fill(form, { 'Exact legal name': branch.legalName });
      save(form);
      await screen.findByText('Version 4');
      fireEvent.click(
        screen.getByRole('button', { name: 'Correct Client dossier' }),
      );
      expect(within(correction).getByLabelText('Telephone')).toHaveValue(
        '+373 22 000 393',
      );
      fireEvent.click(
        within(correction).getByRole('button', { name: 'Save correction' }),
      );
      await waitFor(() =>
        expect(
          dossierRequests.filter((request) => request.method === 'PATCH'),
        ).toHaveLength(uncertain ? 2 : 1),
      );
      const commands = dossierRequests.filter(
        (request) => request.method === 'PATCH',
      );
      expect(commands[0]?.body).toMatchObject({
        expectedVersion: 3,
        telephone: '+373 22 000 393',
      });
      if (uncertain) expect(commands[1]).toEqual(commands[0]);
      else
        expect(
          await screen.findByText(/changed before your correction was saved/iu),
        ).toBeVisible();
      expect(
        dossierRequests.filter((request) => request.method === 'GET'),
      ).toHaveLength(1);
    },
  );

  it('records an entity after field validation, refreshes the displayed version and never rebases an open correction draft', async () => {
    const { requests, dossierCorrections, activity } = renderDossier();
    await screen.findByText('Version 3');
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correction).getByLabelText('Telephone'), {
      target: { value: '+373 22 000 393' },
    });

    const form = await openAdd();
    const legalName = within(form).getByLabelText('Exact legal name');
    await waitFor(() => expect(legalName).toHaveFocus());
    save(form);
    expect(legalName).toHaveAttribute('aria-invalid', 'true');
    expect(legalName).toHaveAccessibleDescription(
      'Enter the exact legal name.',
    );
    expect(mutations(requests)).toEqual([]);

    fill(form, {
      'Exact legal name': '  GRUP Demo SA — Sucursala Bălți ',
      'IDNO / tax code': ' 1002600000001 ',
      'Legal address': '   ',
    });
    save(form);
    const region = await section();
    expect(
      await within(region).findByText('Legal entity or branch recorded.'),
    ).toBeVisible();
    expect(mutations(requests)).toEqual([
      {
        method: 'POST',
        path: '/clients/client-one/legal-entities',
        body: {
          expectedClientVersion: 3,
          legalName: 'GRUP Demo SA — Sucursala Bălți',
          taxId: '1002600000001',
          legalAddress: null,
        },
        key: expect.any(String),
      },
    ]);
    expect(within(region).getByText(branch.legalName)).toBeVisible();
    expect(within(region).queryByRole('form')).not.toBeInTheDocument();
    expect(screen.getByText('Version 4')).toBeVisible();
    expect(activity).toHaveBeenCalledOnce();

    // The open dossier correction keeps the version it observed.
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Save correction' }),
    );
    expect(
      await screen.findByText(/changed before your correction was saved/iu),
    ).toBeVisible();
    expect(dossierCorrections).toEqual([
      expect.objectContaining({
        expectedVersion: 3,
        telephone: '+373 22 000 393',
      }),
    ]);
  });

  it('retries an uncertain outcome with the exact body and key, and offers an explicit reload after a stale conflict', async () => {
    let posts = 0;
    const { requests } = renderDossier({
      route: (request) => {
        if (request.method !== 'POST') return undefined;
        posts += 1;
        if (posts === 1) return respond({}, 503);
        if (posts === 3)
          return respond(
            {
              statusCode: 409,
              error: 'Conflict',
              message: 'The Client dossier has changed.',
            },
            409,
          );
        return undefined;
      },
    });
    const form = await openAdd();
    fill(form, { 'Exact legal name': logistic.legalName });
    save(form);
    expect(
      await within(form).findByText(
        'We could not confirm whether this change was saved. Save again to retry exactly the same change safely.',
      ),
    ).toBeVisible();
    save(form);
    const region = await section();
    expect(
      await within(region).findByText('Legal entity or branch recorded.'),
    ).toBeVisible();
    const [uncertain, retried] = mutations(requests);
    expect(retried?.body).toEqual(uncertain?.body);
    expect(retried?.key).toBe(uncertain?.key);

    const next = await openAdd();
    fill(next, { 'Exact legal name': 'Filiala Orhei' });
    save(next);
    expect(
      await within(next).findByText(
        'This Client dossier changed before your change was saved. Reload the legal entities and branches before trying again.',
      ),
    ).toBeVisible();
    expect(mutations(requests).at(-1)?.key).not.toBe(uncertain?.key);
    const reads = requests.filter((request) => request.method === 'GET');
    fireEvent.click(
      within(next).getByRole('button', {
        name: 'Reload legal entities and branches',
      }),
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'GET'),
      ).toHaveLength(reads.length + 1),
    );
    expect(within(region).queryByRole('form')).not.toBeInTheDocument();
  });

  it('shows its own message when the Client reached the entity capacity', async () => {
    renderDossier({
      route: (request) =>
        request.method === 'POST'
          ? respond(
              {
                statusCode: 409,
                error: 'Conflict',
                code: 'client_legal_entity_capacity_exceeded',
              },
              409,
            )
          : undefined,
    });
    const form = await openAdd();
    fill(form, { 'Exact legal name': 'Filiala 51' });
    save(form);
    expect(
      await within(form).findByText(
        'This Client already records the maximum of 50 additional legal entities or branches. Nothing was added.',
      ),
    ).toBeVisible();
    expect(within(form).queryByText(/changed before/u)).not.toBeInTheDocument();
  });

  it('corrects only the changed values and refuses an unchanged draft without a request', async () => {
    const { requests } = renderDossier({ entities: [branch, logistic] });
    const region = await section();
    fireEvent.click(
      await within(region).findByRole('button', {
        name: `Correct ${logistic.legalName}`,
      }),
    );
    const form = within(region).getByRole('form', {
      name: `Correct ${logistic.legalName}`,
    });
    expect(within(form).getByLabelText('Exact legal name')).toHaveValue(
      logistic.legalName,
    );
    expect(within(form).getByLabelText('Legal address')).toHaveValue(
      logistic.legalAddress,
    );
    save(form);
    expect(
      await within(form).findByText('Change at least one value before saving.'),
    ).toBeVisible();
    expect(mutations(requests)).toEqual([]);

    fill(form, {
      'Legal address': ' Str. Industrială 5, Chișinău ',
      'IDNO / tax code': '1012600000002',
    });
    save(form);
    expect(
      await within(region).findByText('Legal entity or branch corrected.'),
    ).toBeVisible();
    expect(mutations(requests)).toEqual([
      {
        method: 'PATCH',
        path: `/clients/client-one/legal-entities/${logistic.id}`,
        body: {
          expectedClientVersion: 3,
          changes: {
            taxId: '1012600000002',
            legalAddress: 'Str. Industrială 5, Chișinău',
          },
        },
        key: expect.any(String),
      },
    ]);
    expect(
      within(region).getByText('Str. Industrială 5, Chișinău'),
    ).toBeVisible();
    expect(screen.getByText('Version 4')).toBeVisible();
  });

  it('observes the dossier version of its own confirmed correction before the next registration', async () => {
    const { requests, dossierCorrections } = renderDossier({
      entities: [branch],
    });
    const region = await section();
    await within(region).findByText(branch.legalName);
    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correction).getByLabelText('Telephone'), {
      target: { value: '+373 22 000 393' },
    });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Save correction' }),
    );
    expect(
      await screen.findByText(
        'Client correction saved with attributable history.',
      ),
    ).toBeVisible();
    expect(dossierCorrections).toEqual([
      expect.objectContaining({ expectedVersion: 3 }),
    ]);
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'GET'),
      ).toHaveLength(2),
    );

    const form = await openAdd();
    fill(form, { 'Exact legal name': logistic.legalName });
    save(form);
    expect(
      await within(region).findByText('Legal entity or branch recorded.'),
    ).toBeVisible();
    expect(mutations(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ expectedClientVersion: 4 }),
      }),
    ]);
    expect(screen.getByText('Version 5')).toBeVisible();
    // One refresh per observed dossier version, never a fetch storm.
    expect(requests.filter((request) => request.method === 'GET')).toHaveLength(
      2,
    );
  });

  it('keeps an open entity draft on its observed version after a dossier correction', async () => {
    const { requests } = renderDossier({ entities: [branch] });
    const region = await section();
    await within(region).findByText(branch.legalName);
    const form = await openAdd();
    fill(form, { 'Exact legal name': logistic.legalName });

    fireEvent.click(
      screen.getByRole('button', { name: 'Correct Client dossier' }),
    );
    const correction = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correction).getByLabelText('Telephone'), {
      target: { value: '+373 22 000 393' },
    });
    fireEvent.click(
      within(correction).getByRole('button', { name: 'Save correction' }),
    );
    expect(await screen.findByText('Version 4')).toBeVisible();
    expect(within(form).getByLabelText('Exact legal name')).toHaveValue(
      logistic.legalName,
    );
    expect(requests.filter((request) => request.method === 'GET')).toHaveLength(
      1,
    );

    save(form);
    expect(
      await within(form).findByText(
        'This Client dossier changed before your change was saved. Reload the legal entities and branches before trying again.',
      ),
    ).toBeVisible();
    expect(mutations(requests)).toEqual([
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ expectedClientVersion: 3 }),
      }),
    ]);
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Reload legal entities and branches',
      }),
    );
    await waitFor(() =>
      expect(
        requests.filter((request) => request.method === 'GET'),
      ).toHaveLength(2),
    );
    const next = await openAdd();
    fill(next, { 'Exact legal name': logistic.legalName });
    save(next);
    expect(
      await within(region).findByText('Legal entity or branch recorded.'),
    ).toBeVisible();
    expect(mutations(requests).at(-1)?.body).toMatchObject({
      expectedClientVersion: 4,
    });
  });

  it('never renders a list response for a previous Client', async () => {
    const late = deferred<Response>();
    const { view } = renderDossier({
      route: (request) =>
        request.method === 'GET' && request.path.includes('client-one')
          ? late.promise
          : request.method === 'GET'
            ? respond({
                clientVersion: 1,
                legalEntities: [
                  { ...branch, legalName: 'Other Demo — Filiala' },
                ],
              })
            : undefined,
    });
    await section();
    view.rerender(
      <ApplicationPresentation value="prisme">
        <ClientDossierPanel
          clientAccountId="client-two"
          companyContextId={companyA.id}
          canUpdate
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={() => undefined}
          onActivityRecorded={async () => undefined}
          onClientsChanged={async () => undefined}
        />
      </ApplicationPresentation>,
    );
    expect(await screen.findByText('Other Demo — Filiala')).toBeVisible();
    late.resolve(respond({ clientVersion: 3, legalEntities: [branch] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(branch.legalName)).not.toBeInTheDocument();
    expect(screen.getByText('Other Demo — Filiala')).toBeVisible();
  });
  it.each(locales)(
    'preserves literal drafts, validation, list order and exact commands through locale changes in $code',
    async (locale) => {
      let attempts = 0;
      const pending = deferred<Response>();
      const { requests, wireCommands, dossierRequests, activity } =
        renderDossier({
          locale: locale.code,
          entities: [branch, logistic],
          route: (request) =>
            request.method === 'POST' && ++attempts === 1
              ? pending.promise
              : undefined,
        });
      const region = await screen.findByRole('region', { name: locale.title });
      await within(region).findByText(logistic.legalName);
      const names = () =>
        within(region)
          .getAllByRole('listitem')
          .map((item) => item.querySelector('strong')?.textContent);
      expect(names()).toEqual([branch.legalName, logistic.legalName]);
      fireEvent.click(within(region).getByRole('button', { name: locale.add }));
      const form = within(region).getByRole('form', { name: locale.addTitle });
      const name = within(form).getByLabelText(locale.name);
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(name).toHaveAccessibleDescription(locale.required);
      const literalName = '  Филиал {legalName} — Știință  ';
      const literalTax = '  Налог {taxId}  ';
      const literalAddress = '  Str. Științei {address}\nКорпус Б, etaj 2  ';
      fill(form, {
        [locale.name]: literalName,
        [locale.tax]: literalTax,
        [locale.address]: literalAddress,
      });
      const control = screen.getByRole('combobox');
      const reads = requests.length;
      const dossierReads = dossierRequests.length;
      for (const next of locales) {
        selectOption(control, next.code);
        expect(screen.getByRole('region', { name: next.title })).toBe(region);
        expect(within(region).getByRole('form', { name: next.addTitle })).toBe(
          form,
        );
        expect(within(form).getByLabelText(next.name)).toBe(name);
        expect(name).toHaveValue(literalName);
        expect(name).toHaveAccessibleDescription(next.required);
        expect(within(form).getByLabelText(next.tax)).toHaveValue(literalTax);
        expect(within(form).getByLabelText(next.address)).toHaveValue(
          literalAddress,
        );
        expect(control).toHaveFocus();
        expect(names()).toEqual([branch.legalName, logistic.legalName]);
        expect(requests).toHaveLength(reads);
        expect(dossierRequests).toHaveLength(dossierReads);
        expect(activity).not.toHaveBeenCalled();
      }
      selectOption(control, locale.code);
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(form).findByRole('status')).toHaveTextContent(
        locale.saving,
      );
      expect(
        within(form).getByRole('button', { name: locale.saving }),
      ).toBeDisabled();
      selectOption(control, 'fr');
      expect(within(form).getByRole('status')).toHaveTextContent(
        'Enregistrement de l’entité juridique…',
      );
      pending.resolve(respond({}, 503));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Nous n’avons pas pu confirmer si cette modification a été enregistrée.',
      );
      selectOption(control, locale.code);
      expect(within(form).getByRole('alert')).toHaveTextContent(
        locale.uncertain,
      );
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(region).findByText(locale.recorded)).toBeVisible();
      expect(wireCommands).toHaveLength(2);
      expect(wireCommands[1]).toEqual(wireCommands[0]);
      expect(wireCommands[0]).toMatchObject({
        method: 'POST',
        path: '/api/clients/client-one/legal-entities',
        company: companyA.id,
        body: '{"expectedClientVersion":3,"legalName":"Филиал {legalName} — Știință","taxId":"Налог {taxId}","legalAddress":"Str. Științei {address}\\nКорпус Б, etaj 2"}',
        key: expect.any(String),
      });
      expect(wireCommands[0]?.key).toBeTruthy();
      const afterSaveReads = requests.length;
      selectOption(control, 'fr');
      expect(
        within(region).getByText('Entité juridique ou succursale enregistrée.'),
      ).toBeVisible();
      expect(requests).toHaveLength(afterSaveReads);
      selectOption(control, locale.code);
      const exactName = 'Филиал {legalName} — Știință';
      fireEvent.click(
        within(region).getByRole('button', {
          name: `${locale.correct} ${exactName}`,
        }),
      );
      const correction = within(region).getByRole('form', {
        name: `${locale.correct} ${exactName}`,
      });
      fireEvent.click(
        within(correction).getByRole('button', { name: locale.save }),
      );
      expect(within(correction).getByRole('alert')).toHaveTextContent(
        locale.unchanged,
      );
      selectOption(control, 'fr');
      expect(within(correction).getByRole('alert')).toHaveTextContent(
        'Modifiez au moins une valeur avant d’enregistrer.',
      );
      expect(wireCommands).toHaveLength(2);
      selectOption(control, locale.code);
      fill(correction, { [locale.tax]: '   ' });
      const correctionReads = requests.length;
      selectOption(control, 'ru');
      expect(
        within(correction).getByLabelText('IDNO / налоговый код'),
      ).toHaveValue('   ');
      expect(
        within(correction).getByLabelText('Юридический адрес'),
      ).toHaveValue(literalAddress.trim());
      expect(requests).toHaveLength(correctionReads);
      selectOption(control, locale.code);
      fireEvent.click(
        within(correction).getByRole('button', { name: locale.save }),
      );
      expect(await within(region).findByText(locale.corrected)).toBeVisible();
      expect(wireCommands[2]).toMatchObject({
        method: 'PATCH',
        path: '/api/clients/client-one/legal-entities/legal-entity-3',
        company: companyA.id,
        body: '{"expectedClientVersion":4,"changes":{"taxId":null}}',
      });
      expect(wireCommands[2]?.key).not.toBe(wireCommands[0]?.key);
      expect(activity).toHaveBeenCalledTimes(2);
      expect(names()).toEqual([
        branch.legalName,
        logistic.legalName,
        exactName,
      ]);
      selectOption(control, 'fr');
      expect(
        within(region).getByText('Entité juridique ou succursale corrigée.'),
      ).toBeVisible();
    },
  );

  it.each(locales)(
    'keeps field bounds and changed-intention retry semantics in $code',
    async (locale) => {
      const { requests, wireCommands } = renderDossier({
        locale: locale.code,
        route: (request) =>
          request.method === 'POST' ? respond({}, 503) : undefined,
      });
      const region = await screen.findByRole('region', { name: locale.title });
      fireEvent.click(
        await within(region).findByRole('button', { name: locale.add }),
      );
      const form = within(region).getByRole('form', { name: locale.addTitle });
      for (const failure of [
        {
          values: { [locale.name]: 'N'.repeat(201) },
          label: locale.name,
          message: locale.nameLong,
        },
        {
          values: {
            [locale.name]: 'N'.repeat(200),
            [locale.tax]: 'T'.repeat(501),
          },
          label: locale.tax,
          message: locale.taxLong,
        },
        {
          values: {
            [locale.tax]: 'T'.repeat(500),
            [locale.address]: 'A'.repeat(2001),
          },
          label: locale.address,
          message: locale.addressLong,
        },
      ]) {
        fill(form, failure.values);
        fireEvent.click(
          within(form).getByRole('button', { name: locale.save }),
        );
        expect(
          within(form).getByLabelText(failure.label),
        ).toHaveAccessibleDescription(failure.message);
        expect(mutations(requests)).toHaveLength(0);
      }
      fill(form, { [locale.address]: 'A'.repeat(2000) });
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        locale.uncertain,
      );
      selectOption(screen.getByRole('combobox'), 'fr');
      fill(form, {
        'Dénomination juridique exacte': 'Nouvelle intention {клиент}',
      });
      fireEvent.click(
        within(form).getByRole('button', {
          name: 'Enregistrer l’entité juridique',
        }),
      );
      await waitFor(() => expect(wireCommands).toHaveLength(2));
      expect(wireCommands[1]?.body).not.toBe(wireCommands[0]?.body);
      expect(wireCommands[1]?.key).not.toBe(wireCommands[0]?.key);
      expect(mutations(requests).at(-1)?.body).toMatchObject({
        expectedClientVersion: 3,
        legalName: 'Nouvelle intention {клиент}',
        taxId: 'T'.repeat(500),
        legalAddress: 'A'.repeat(2000),
      });
    },
  );

  it.each(locales)(
    'retains the observed version until explicit stale reload in $code',
    async (locale) => {
      const { server, requests } = renderDossier({
        locale: locale.code,
        entities: [branch],
      });
      const region = await screen.findByRole('region', { name: locale.title });
      fireEvent.click(
        await within(region).findByRole('button', {
          name: `${locale.correct} ${branch.legalName}`,
        }),
      );
      const form = within(region).getByRole('form');
      fill(form, { [locale.address]: 'Черновик {address}\nEtaj 2' });
      server.version = 4;
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        locale.stale,
      );
      const beforeLocale = requests.length;
      for (const next of locales) {
        selectOption(screen.getByRole('combobox'), next.code);
        expect(within(form).getByRole('alert')).toHaveTextContent(next.stale);
        expect(within(form).getByLabelText(next.address)).toHaveValue(
          'Черновик {address}\nEtaj 2',
        );
        expect(
          within(form).getByRole('button', { name: next.reload }),
        ).toBeVisible();
        expect(requests).toHaveLength(beforeLocale);
      }
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(mutations(requests)[0]?.body).toEqual({
        expectedClientVersion: 3,
        changes: { legalAddress: 'Черновик {address}\nEtaj 2' },
      });
      fireEvent.click(
        within(form).getByRole('button', { name: locale.reload }),
      );
      await waitFor(() =>
        expect(
          requests.filter((request) => request.method === 'GET'),
        ).toHaveLength(2),
      );
      expect(within(region).queryByRole('form')).not.toBeInTheDocument();
      fireEvent.click(
        await within(region).findByRole('button', {
          name: `${locale.correct} ${branch.legalName}`,
        }),
      );
      const fresh = within(region).getByRole('form');
      fill(fresh, { [locale.address]: 'Saved after reload' });
      fireEvent.click(within(fresh).getByRole('button', { name: locale.save }));
      expect(await within(region).findByText(locale.corrected)).toBeVisible();
      expect(mutations(requests).at(-1)).toMatchObject({
        path: `/clients/client-one/legal-entities/${branch.id}`,
        body: {
          expectedClientVersion: 4,
          changes: { legalAddress: 'Saved after reload' },
        },
      });
    },
  );

  it.each(locales)(
    'translates capacity and every server validation result reactively in $code',
    async (locale) => {
      let posts = 0;
      const { requests } = renderDossier({
        locale: locale.code,
        route: (request) => {
          if (request.method !== 'POST') return undefined;
          posts += 1;
          return posts === 1
            ? respond({ code: 'client_legal_entity_capacity_exceeded' }, 409)
            : posts === 2
              ? respond({}, 400)
              : respond({ message: 'Server {message} Кириллица' }, 400);
        },
      });
      const region = await screen.findByRole('region', { name: locale.title });
      fireEvent.click(
        await within(region).findByRole('button', { name: locale.add }),
      );
      const form = within(region).getByRole('form');
      fill(form, { [locale.name]: 'Synthetic branch' });
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        locale.capacity,
      );
      const control = screen.getByRole('combobox');
      selectOption(control, 'fr');
      expect(within(form).getByRole('alert')).toHaveTextContent(
        'Ce Client a déjà atteint le maximum de 50 entités juridiques ou succursales supplémentaires. Aucun ajout n’a été effectué.',
      );
      expect(mutations(requests)).toHaveLength(1);
      selectOption(control, locale.code);
      fireEvent.click(within(form).getByRole('button', { name: locale.save }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        locale.invalid,
      );
      selectOption(control, 'fr');
      expect(within(form).getByRole('alert')).toHaveTextContent(
        'Vérifiez les valeurs de l’entité juridique et réessayez.',
      );
      fireEvent.click(
        within(form).getByRole('button', {
          name: 'Enregistrer l’entité juridique',
        }),
      );
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Vérifiez les valeurs de l’entité juridique et réessayez.',
      );
      selectOption(control, locale.code);
      expect(within(form).getByRole('alert')).toHaveTextContent(locale.invalid);
      expect(mutations(requests)).toHaveLength(3);
    },
  );

  it.each(locales)(
    'keeps loading, retry, refusal and read-only states safe in $code',
    async (locale) => {
      const pending = deferred<Response>();
      let reads = 0;
      const { requests } = renderDossier({
        locale: locale.code,
        canUpdate: false,
        entities: [branch],
        route: (request) => {
          if (request.method !== 'GET')
            throw new Error('Read-only panel must not mutate');
          reads += 1;
          return reads === 1 ? pending.promise : respond({}, 404);
        },
      });
      const region = await screen.findByRole('region', { name: locale.title });
      expect(within(region).getByRole('status')).toHaveTextContent(
        locale.loading,
      );
      selectOption(screen.getByRole('combobox'), 'fr');
      expect(within(region).getByRole('status')).toHaveTextContent(
        'Chargement des entités juridiques et succursales…',
      );
      await waitFor(() => expect(requests).toHaveLength(1));
      pending.resolve(respond({}, 503));
      expect(await within(region).findByRole('alert')).toHaveTextContent(
        'Impossible de charger les entités juridiques et succursales. Le dossier reste disponible.',
      );
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(within(region).getByRole('alert')).toHaveTextContent(locale.error);
      fireEvent.click(
        within(region).getByRole('button', { name: locale.retry }),
      );
      expect(await within(region).findByText(locale.unavailable)).toBeVisible();
      expect(within(region).queryByRole('list')).not.toBeInTheDocument();
      expect(within(region).queryByRole('button')).not.toBeInTheDocument();
      expect(
        within(region).queryByText(branch.legalName),
      ).not.toBeInTheDocument();
      expect(mutations(requests)).toHaveLength(0);
    },
  );

  it.each([
    'Company',
    'session',
    'assignment',
    'version',
    'permission',
    'Client',
  ] as const)(
    'retires an uncertain legal-entity command and suppresses late mutation success at the real App %s boundary',
    async (boundary) => {
      const pending = deferred<Response>();
      let posts = 0;
      const { server, wireCommands, view } = renderDossier({
        application: true,
        route: (request) => {
          if (request.method !== 'POST') return undefined;
          posts += 1;
          return posts === 2 ? pending.promise : respond({}, 503);
        },
      });
      const fetchBoundary = vi.mocked(fetch);
      async function openClient(displayName = dossier.displayName) {
        const heading = (
          await screen.findAllByRole('heading', {
            name: displayName,
          })
        ).find((candidate) => candidate.closest('li'));
        const row = heading?.closest('li');
        if (!row) throw new Error('Expected the public Client directory row');
        fireEvent.click(
          within(row).getByRole('button', {
            name: 'Open dossier',
          }),
        );
        return section();
      }
      await openClient();
      const form = await openAdd();
      fill(form, {
        'Exact legal name': 'Private {черновик}',
        'Legal address': 'Private line 1\nСтрока 2',
      });
      save(form);
      await within(form).findByRole('alert');
      selectOption(screen.getByLabelText('Interface language'), 'ru');
      expect(within(form).getByRole('alert')).toHaveTextContent(
        'Не удалось подтвердить, сохранено ли это изменение.',
      );
      selectOption(screen.getByLabelText('Язык интерфейса'), 'en');
      save(form);
      await waitFor(() => expect(wireCommands).toHaveLength(2));
      expect(wireCommands[1]).toEqual(wireCommands[0]);
      const pendingSignal = fetchBoundary.mock.calls
        .filter(
          ([input, init]) =>
            input.toString().includes('/legal-entities') &&
            init?.method === 'POST',
        )
        .at(-1)?.[1]?.signal;
      expect(pendingSignal?.aborted).toBe(false);
      if (boundary === 'Company')
        selectOption(
          screen.getByLabelText('Active Company', { exact: true }),
          'company-b',
        );
      else if (boundary === 'session')
        view.rerender(<App identity={deterministicBrowserIdentity()} />);
      else if (boundary === 'Client') await openClient('Other Demo SRL');
      else {
        server.actor = {
          ...server.actor,
          activeCompany: {
            ...server.actor.activeCompany,
            ...companyA,
            ...(boundary === 'assignment'
              ? { clientPermissionAssignmentId: 'assignment-2' }
              : { clientPermissionSetVersion: 'v1' }),
            ...(boundary === 'permission'
              ? { clientPermissions: ['client.read'] }
              : {}),
          },
        };
        fireEvent.change(screen.getByLabelText('Find a shared Client'), {
          target: { value: 'Refresh authority' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
      }
      await waitFor(() => expect(pendingSignal?.aborted).toBe(true));
      expect(
        screen.queryByDisplayValue('Private {черновик}'),
      ).not.toBeInTheDocument();
      const readsAfterRetirement = server.activityReads;
      await act(async () =>
        pending.resolve(
          respond(
            {
              clientVersion: 99,
              legalEntity: { ...branch, legalName: 'Confidential late entity' },
            },
            201,
          ),
        ),
      );
      expect(
        screen.queryByText('Confidential late entity'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Legal entity or branch recorded.'),
      ).not.toBeInTheDocument();
      expect(server.activityReads).toBe(readsAfterRetirement);
      await openClient();
      if (boundary === 'permission') {
        expect(
          screen.queryByRole('button', { name: 'Add legal entity or branch' }),
        ).not.toBeInTheDocument();
        return;
      }
      const fresh = await openAdd();
      expect(within(fresh).getByLabelText('Exact legal name')).toHaveValue('');
      expect(within(fresh).getByLabelText('Legal address')).toHaveValue('');
      fill(fresh, {
        'Exact legal name': 'Private {черновик}',
        'Legal address': 'Private line 1\nСтрока 2',
      });
      save(fresh);
      await within(fresh).findByRole('alert');
      expect(wireCommands).toHaveLength(3);
      expect(wireCommands[2]?.body).toBe(wireCommands[0]?.body);
      expect(wireCommands[2]?.key).not.toBe(wireCommands[0]?.key);
    },
  );
  it('retranslates real-shaped server validation in every locale while preserving the literal draft and command contract', async () => {
    const { requests, wireCommands, activity } = renderDossier({
      locale: null,
      route: (request) =>
        request.method === 'POST'
          ? respond(
              {
                statusCode: 400,
                error: 'Bad Request',
                message:
                  'Client legal entity address must not contain NUL characters.',
              },
              400,
            )
          : undefined,
    });
    const region = await screen.findByRole('region', {
      name: 'Entități juridice și sucursale',
    });
    fireEvent.click(
      await within(region).findByRole('button', {
        name: 'Adaugă o entitate juridică sau sucursală',
      }),
    );
    const form = within(region).getByRole('form');
    const literalName = '  Филиал {legalName}  ';
    const literalAddress = '  Str. Științei\nCorp\u0000{address}  ';
    fill(form, {
      'Denumirea juridică exactă': literalName,
      'Adresa juridică': literalAddress,
    });
    fireEvent.click(
      within(form).getByRole('button', { name: 'Salvează entitatea juridică' }),
    );
    await within(form).findByRole('alert');
    const reads = requests.length;
    for (const locale of locales) {
      selectOption(screen.getByRole('combobox'), locale.code);
      expect(within(form).getByRole('alert')).toHaveTextContent(locale.invalid);
      expect(
        within(form).queryByText(
          'Client legal entity address must not contain NUL characters.',
        ),
      ).not.toBeInTheDocument();
      expect(within(form).getByLabelText(locale.name)).toHaveValue(literalName);
      expect(within(form).getByLabelText(locale.address)).toHaveValue(
        literalAddress,
      );
      expect(requests).toHaveLength(reads);
      expect(activity).not.toHaveBeenCalled();
    }
    expect(wireCommands).toHaveLength(1);
    expect(wireCommands[0]).toEqual({
      method: 'POST',
      path: '/api/clients/client-one/legal-entities',
      company: companyA.id,
      body: '{"expectedClientVersion":3,"legalName":"Филиал {legalName}","taxId":null,"legalAddress":"Str. Științei\\nCorp\\u0000{address}"}',
      key: expect.any(String),
    });
    expect(wireCommands[0]?.key).toBeTruthy();
    fireEvent.click(
      within(form).getByRole('button', { name: 'Save legal entity' }),
    );
    await waitFor(() => expect(wireCommands).toHaveLength(2));
    expect(wireCommands[1]?.body).toBe(wireCommands[0]?.body);
    expect(wireCommands[1]?.key).not.toBe(wireCommands[0]?.key);
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Check the legal entity values and try again.',
    );
  });
});
