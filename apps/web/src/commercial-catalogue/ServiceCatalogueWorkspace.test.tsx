import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deterministicBrowserIdentity,
  type BrowserIdentity,
} from '../access-composition';
import type { ActorContext } from '../access-types';
import { ServiceCatalogueWorkspace } from './ServiceCatalogueWorkspace';

const actor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Iurie',
  email: 'iurie@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'PRISMA-PRIM',
    clientPermissions: [],
    serviceCataloguePermissions: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
  },
};

const secondCompanyActor: ActorContext = {
  ...actor,
  activeCompany: {
    id: 'company-2',
    displayName: 'Second Company',
    clientPermissions: [],
    serviceCataloguePermissions: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
  },
};

const definition = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ISO-9001_GAP',
  name: 'ISO 9001 gap analysis',
  description: 'Illustrative shared definition.',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: 'membership-1',
  createdAt: '2026-09-20T10:00:00.000Z',
};

const offering = {
  id: '00000000-0000-4000-8000-000000000002',
  companyId: 'company-1',
  serviceDefinitionId: definition.id,
  serviceDefinition: { code: definition.code, name: definition.name },
  commercialLabel: 'Gap analysis for our Clients',
  availability: 'AVAILABLE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: 'membership-1',
  createdAt: '2026-09-20T10:05:00.000Z',
};

// One supplementary code point is two UTF-16 code units in a JavaScript string.
const supplementary = '😀';

type Responder = (call: number) => Response | Promise<Response>;

function requestKey(input: RequestInfo | URL, init?: RequestInit): string {
  const url = typeof input === 'string' ? input : input.toString();
  return `${init?.method ?? 'GET'} ${url.replace(/\?.*$/u, '')}`;
}

function stubApi(routes: Record<string, Responder>) {
  const calls = new Map<string, number>();
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = requestKey(input, init);
    const responder = routes[key];
    if (!responder) throw new Error(`Unexpected request ${key}`);
    const call = (calls.get(key) ?? 0) + 1;
    calls.set(key, call);
    return Promise.resolve(responder(call));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const route = (method: string, path: string): string =>
  `${method} /api/commercial-catalogue/${path}`;

function requestsTo(
  fetchMock: ReturnType<typeof stubApi>,
  key: string,
): (RequestInit | undefined)[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => requestKey(input, init) === key)
    .map(([, init]) => init);
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

// Resolves a held response after the command that superseded it.
async function settleLate(
  held: ReturnType<typeof deferredResponse>,
  response: Response,
) {
  await act(async () => {
    held.resolve(response);
    await held.promise;
  });
}

function renderWorkspace(
  props: {
    identity?: BrowserIdentity;
    onWorkspaceAccessRejected?: () => void;
    onCompanyContextRejected?: (companyId: string) => void;
  } = {},
) {
  return render(
    <ServiceCatalogueWorkspace
      actor={actor}
      identity={props.identity ?? deterministicBrowserIdentity()}
      onCompanyContextRejected={props.onCompanyContextRejected ?? vi.fn()}
      onWorkspaceAccessRejected={props.onWorkspaceAccessRejected}
    />,
  );
}

// Browser label queries match a label's full text, including option and
// textarea content, which getByLabelText ignores.
function labelTexts(control: HTMLElement): (string | null)[] {
  if (!(
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ))
    throw new Error('Expected a labelable form control.');
  return Array.from(control.labels ?? [], (label) => label.textContent);
}

function fillDefinition(code: string, name: string) {
  fireEvent.change(screen.getByLabelText('Service code'), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText('Service name'), {
    target: { value: name },
  });
}

describe('ServiceCatalogueWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the permanent illustrative marker, the ability-to-perform statement and both empty states', async () => {
    stubApi({
      [route('GET', 'service-definitions')]: () => Response.json({ items: [] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
    });
    renderWorkspace();

    expect(
      await screen.findByText('No Service Definitions in this Workspace yet.'),
    ).toBeVisible();
    expect(
      await screen.findByText('No offerings for PRISMA-PRIM yet.'),
    ).toBeVisible();
    expect(
      screen.getByText('Illustrative catalogue: provisional records'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'This illustrative offering is non-operational: it is not evidence that the Company may perform, certify, sell or contract the service. A real offering requires a separately reviewed governed transition.',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('Define a Service before recording an offering.'),
    ).toBeVisible();
    expect(screen.getByText('Company: PRISMA-PRIM')).toBeVisible();
  });

  it('defines a Service, preselects it, records the Company offering and lists both with illustrative badges', async () => {
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        Response.json({ items: call === 1 ? [] : [definition] }),
      [route('GET', 'offerings')]: (call) =>
        Response.json({ items: call === 1 ? [] : [offering] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
      [route('POST', 'offerings')]: () =>
        Response.json({ outcome: 'CREATED', offering }, { status: 201 }),
    });
    renderWorkspace();
    await screen.findByText('No offerings for PRISMA-PRIM yet.');

    fillDefinition('iso-9001_gap', definition.name);
    expect(screen.getByLabelText('Service code')).toHaveValue('ISO-9001_GAP');
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: definition.description },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Service Definition ISO-9001_GAP recorded.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/commercial-catalogue/service-definitions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          code: 'ISO-9001_GAP',
          name: definition.name,
          description: definition.description,
        }),
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-1',
        }),
      }),
    );
    const definitions = await screen.findByRole('list', {
      name: 'Service Definitions',
    });
    expect(within(definitions).getByText('ISO-9001_GAP')).toBeVisible();
    expect(within(definitions).getByText('Illustrative')).toBeVisible();
    expect(screen.getByLabelText('Service code')).toHaveValue('');
    expect(screen.getByLabelText('Service Definition')).toHaveValue(
      definition.id,
    );

    fireEvent.change(screen.getByLabelText('Commercial label'), {
      target: { value: offering.commercialLabel },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
    expect(
      await screen.findByText(
        'Offering for ISO 9001 gap analysis recorded as available.',
      ),
    ).toBeVisible();
    const offerings = await screen.findByRole('list', {
      name: 'Company Service Offerings',
    });
    expect(
      within(offerings).getByText('Gap analysis for our Clients'),
    ).toBeVisible();
    expect(within(offerings).getByText('Available')).toBeVisible();
    expect(within(offerings).getByText('Illustrative')).toBeVisible();
    expect(within(offerings).queryByText(/AVAILABLE|ILLUSTRATIVE/u)).toBeNull();
  });

  it('names every form control by its label copy alone once options and values are present', async () => {
    stubApi({
      [route('GET', 'service-definitions')]: () =>
        Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
    });
    renderWorkspace();
    await screen.findByRole('list', { name: 'Service Definitions' });
    fillDefinition(definition.code, definition.name);
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: definition.description },
    });
    fireEvent.change(screen.getByLabelText('Commercial label'), {
      target: { value: offering.commercialLabel },
    });

    for (const label of [
      'Service code',
      'Service name',
      'Description',
      'Service Definition',
      'Commercial label',
    ])
      expect(labelTexts(screen.getByLabelText(label))).toEqual([label]);
  });

  it('explains an UNCHANGED outcome without pretending a new record exists', async () => {
    stubApi({
      [route('GET', 'service-definitions')]: () =>
        Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'UNCHANGED', definition }, { status: 201 }),
    });
    renderWorkspace();
    await screen.findByRole('list', { name: 'Service Definitions' });
    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Service Definition ISO-9001_GAP already existed with identical content. Nothing changed.',
    );
  });

  it('keeps entered values after a correctable validation error and sends nothing', async () => {
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: () => Response.json({ items: [] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
    });
    renderWorkspace();
    await screen.findByText('No offerings for PRISMA-PRIM yet.');
    fillDefinition('ISO 9001', 'Spaced code');
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a service code of 1 to 40 characters',
    );
    expect(screen.getByLabelText('Service code')).toHaveValue('ISO 9001');
    expect(screen.getByLabelText('Service name')).toHaveValue('Spaced code');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
    expect(
      screen.getByText(
        'Select a Service Definition and keep the commercial label at most 160 characters.',
      ),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('counts each supplementary character once and sends values at every limit', async () => {
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: () =>
        Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
      [route('POST', 'offerings')]: () =>
        Response.json({ outcome: 'CREATED', offering }, { status: 201 }),
    });
    renderWorkspace();
    await screen.findByRole('list', { name: 'Service Definitions' });
    // A browser maxLength counts UTF-16 code units and would truncate
    // supplementary characters before the server's code point limit.
    for (const label of ['Service name', 'Description', 'Commercial label'])
      expect(screen.getByLabelText(label)).not.toHaveAttribute('maxlength');

    const name = supplementary.repeat(160);
    const description = supplementary.repeat(2_000);
    fillDefinition('EMOJI', name);
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: description },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Service Definition ISO-9001_GAP recorded.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/commercial-catalogue/service-definitions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'EMOJI', name, description }),
      }),
    );

    const commercialLabel = supplementary.repeat(160);
    fireEvent.change(screen.getByLabelText('Commercial label'), {
      target: { value: commercialLabel },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
    expect(
      await screen.findByText(
        'Offering for ISO 9001 gap analysis recorded as available.',
      ),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/commercial-catalogue/offerings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          serviceDefinitionId: definition.id,
          commercialLabel,
        }),
      }),
    );
  });

  it('rejects one supplementary character over each limit before sending and keeps the entered values', async () => {
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: () =>
        Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
    });
    renderWorkspace();
    await screen.findByRole('list', { name: 'Service Definitions' });

    fillDefinition('EMOJI', supplementary.repeat(161));
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a service code of 1 to 40 characters',
    );
    expect(screen.getByLabelText('Service name')).toHaveValue(
      supplementary.repeat(161),
    );

    fillDefinition('EMOJI', supplementary.repeat(160));
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: supplementary.repeat(2_001) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a service code of 1 to 40 characters',
    );
    expect(screen.getByLabelText('Description')).toHaveValue(
      supplementary.repeat(2_001),
    );

    fireEvent.change(screen.getByLabelText('Service Definition'), {
      target: { value: definition.id },
    });
    fireEvent.change(screen.getByLabelText('Commercial label'), {
      target: { value: supplementary.repeat(161) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));
    expect(
      screen.getByText(
        'Select a Service Definition and keep the commercial label at most 160 characters.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Commercial label')).toHaveValue(
      supplementary.repeat(161),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('names a Service code conflict and keeps the entered definition', async () => {
    stubApi({
      [route('GET', 'service-definitions')]: () => Response.json({ items: [] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ code: 'SERVICE_CODE_CONFLICT' }, { status: 409 }),
    });
    renderWorkspace();
    await screen.findByText('No offerings for PRISMA-PRIM yet.');
    fillDefinition('ISO-9001_GAP', 'A different name');
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Service code ISO-9001_GAP already exists in this Workspace with different content.',
    );
    expect(screen.getByLabelText('Service name')).toHaveValue(
      'A different name',
    );
  });

  it('names a duplicate offering for the active Company', async () => {
    stubApi({
      [route('GET', 'service-definitions')]: () =>
        Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [offering] }),
      [route('POST', 'offerings')]: () =>
        Response.json({ code: 'OFFERING_CONFLICT' }, { status: 409 }),
    });
    renderWorkspace();
    await screen.findByRole('list', { name: 'Company Service Offerings' });
    fireEvent.change(screen.getByLabelText('Service Definition'), {
      target: { value: definition.id },
    });
    fireEvent.change(screen.getByLabelText('Commercial label'), {
      target: { value: 'Another label' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record offering' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Company already offers ISO 9001 gap analysis with a different commercial label.',
    );
    expect(screen.getByLabelText('Commercial label')).toHaveValue(
      'Another label',
    );
  });

  it('aborts a delayed command and ignores its response after unmount', async () => {
    let resolveCommand: (response: Response) => void = () => undefined;
    const delayedCommand = new Promise<Response>((resolve) => {
      resolveCommand = resolve;
    });
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        init?.method === 'POST'
          ? delayedCommand
          : Promise.resolve(Response.json({ items: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);
    const view = renderWorkspace();
    await screen.findByText('No offerings for PRISMA-PRIM yet.');

    fillDefinition('ISO-9001_GAP', definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const commandSignal = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'POST',
    )?.[1]?.signal;
    view.unmount();

    expect(commandSignal?.aborted).toBe(true);
    await act(async () => {
      resolveCommand(
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
      );
      await delayedCommand;
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reads the Company offerings once a definition created during the first read has refreshed the definitions', async () => {
    const firstRead = deferredResponse();
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        call === 1 ? firstRead.promise : Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [offering] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
    });
    renderWorkspace();
    expect(screen.getByText('Loading offerings…')).toBeVisible();

    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Service Definition ISO-9001_GAP recorded.',
    );
    const offerings = await screen.findByRole('list', {
      name: 'Company Service Offerings',
    });
    expect(
      within(offerings).getByText('Gap analysis for our Clients'),
    ).toBeVisible();

    await settleLate(firstRead, Response.json({ items: [] }));
    expect(
      within(
        screen.getByRole('list', { name: 'Service Definitions' }),
      ).getByText('ISO-9001_GAP'),
    ).toBeVisible();
    expect(requestsTo(fetchMock, route('GET', 'offerings'))).toHaveLength(1);
  });

  it('settles a denial of the refresh that superseded the first read without reading offerings', async () => {
    const firstRead = deferredResponse();
    const rejectedWorkspace = vi.fn();
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        call === 1 ? firstRead.promise : new Response(null, { status: 403 }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
      'GET /api/access/current-actor': () =>
        new Response(null, { status: 403 }),
    });
    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });
    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access the Service Catalogue.',
    );
    await settleLate(firstRead, Response.json({ items: [definition] }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You do not have permission to access the Service Catalogue.',
    );
    expect(rejectedWorkspace).toHaveBeenCalledOnce();
    expect(requestsTo(fetchMock, route('GET', 'offerings'))).toEqual([]);
  });

  it('rejects the session from the refresh that superseded the first read without reading offerings', async () => {
    const firstRead = deferredResponse();
    const rejectSession = vi.fn(() => Promise.resolve());
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        call === 1 ? firstRead.promise : new Response(null, { status: 401 }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
    });
    renderWorkspace({
      identity: { ...deterministicBrowserIdentity(), rejectSession },
    });
    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));

    await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
    await settleLate(firstRead, Response.json({ items: [definition] }));
    expect(rejectSession).toHaveBeenCalledOnce();
    expect(requestsTo(fetchMock, route('GET', 'offerings'))).toEqual([]);
  });

  it('reads offerings only for the current Company after a switch during the superseding refresh', async () => {
    const firstRead = deferredResponse();
    const refresh = deferredResponse();
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        call === 1
          ? firstRead.promise
          : call === 2
            ? refresh.promise
            : Response.json({ items: [definition] }),
      [route('GET', 'offerings')]: () => Response.json({ items: [] }),
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
    });
    const identity = deterministicBrowserIdentity();
    const view = render(
      <ServiceCatalogueWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    await waitFor(() =>
      expect(
        requestsTo(fetchMock, route('GET', 'service-definitions')),
      ).toHaveLength(2),
    );

    view.rerender(
      <ServiceCatalogueWorkspace
        actor={secondCompanyActor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
      />,
    );
    expect(
      await screen.findByText('No offerings for Second Company yet.'),
    ).toBeVisible();
    await settleLate(refresh, Response.json({ items: [definition] }));
    await settleLate(firstRead, Response.json({ items: [] }));
    expect(requestsTo(fetchMock, route('GET', 'offerings'))).toEqual([
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': 'company-2',
        }),
      }),
    ]);
  });

  it('reads no offerings after unmount during the superseding refresh', async () => {
    const firstRead = deferredResponse();
    const refresh = deferredResponse();
    const fetchMock = stubApi({
      [route('GET', 'service-definitions')]: (call) =>
        call === 1 ? firstRead.promise : refresh.promise,
      [route('POST', 'service-definitions')]: () =>
        Response.json({ outcome: 'CREATED', definition }, { status: 201 }),
    });
    const view = renderWorkspace();
    fillDefinition(definition.code, definition.name);
    fireEvent.click(screen.getByRole('button', { name: 'Define Service' }));
    await waitFor(() =>
      expect(
        requestsTo(fetchMock, route('GET', 'service-definitions')),
      ).toHaveLength(2),
    );

    view.unmount();
    await settleLate(refresh, Response.json({ items: [definition] }));
    await settleLate(firstRead, Response.json({ items: [] }));
    expect(requestsTo(fetchMock, route('GET', 'offerings'))).toEqual([]);
  });

  it('shows one denied state and notifies the shell when Workspace access is rejected', async () => {
    const rejectedWorkspace = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    renderWorkspace({ onWorkspaceAccessRejected: rejectedWorkspace });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to access the Service Catalogue.',
    );
    await waitFor(() => expect(rejectedWorkspace).toHaveBeenCalled());
    expect(screen.queryByLabelText('Service code')).not.toBeInTheDocument();
  });
});
