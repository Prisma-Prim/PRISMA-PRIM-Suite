import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { ClientDossierPanel } from './client/ClientDossierPanel';
import { ApplicationPresentation } from './production-shell/application-presentation';

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
}: {
  entities?: Entity[];
  route?: Route;
  dossierRoute?: Route;
  presentation?: Presentation;
  canUpdate?: boolean;
  clientAccountId?: string;
} = {}) {
  const server = {
    version: dossier.version,
    address: dossier.address,
    entities: [...entities],
  };
  const requests: EntityRequest[] = [];
  const dossierRequests: EntityRequest[] = [];
  const dossierCorrections: Record<string, unknown>[] = [];
  const activity = vi.fn(async () => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const method = init?.method ?? 'GET';
      if (path.endsWith('/access/current-actor'))
        return respond(directorActor());
      if (path.endsWith('/correction-history'))
        return respond({ corrections: [], nextCursor: null });
      if (path.includes('/legal-entities')) {
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
  const view = render(
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
    </ApplicationPresentation>,
  );
  return {
    server,
    requests,
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
});
