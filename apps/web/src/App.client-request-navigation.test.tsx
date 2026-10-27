import { changeValue } from './test/select-option';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import {
  buildClientRequest,
  buildRequestListItem,
} from './test/commercial-intake-responses';

const companyA = { id: 'company-a', displayName: 'Company A' };
const companyB = { id: 'company-b', displayName: 'Company B' };
const membershipId = 'membership-1';
const projectionReference = 'projection-345';
const sharedName = 'Shared display name';
const firstClient = {
  id: 'client-first',
  version: 2,
  displayName: sharedName,
  taxId: 'UNION-345',
  address: null,
  telephone: null,
  generalEmail: null,
  businessActivity: null,
  contacts: [{ name: 'Alex' }],
};
const secondClient = {
  ...firstClient,
  id: 'client-second',
  version: 4,
  contacts: [{ name: 'Dana' }],
};
const comparison = {
  outcome: 'comparison',
  reviewReference: 'review-345',
  clients: [firstClient, secondClient],
  companies: [companyA],
};

type Transport = {
  united: boolean;
  companyClientRead: boolean;
  intakeAssignment: string | undefined;
  forbidDossier: boolean;
  missingDossier: string | undefined;
  forbidRequestDetail: boolean;
  requestListReads: number;
  dossierReads: string[];
  mutations: string[];
};

function actorFor(companyId: string, state: Transport): ActorContext {
  return {
    internalUserId: 'resolver',
    workspaceMembershipId: membershipId,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    displayName: 'Resolver',
    email: 'resolver@example.test',
    active: true,
    workspacePermissions: ['client.manage'],
    activeCompany: {
      ...(companyId === companyB.id ? companyB : companyA),
      clientPermissions: state.companyClientRead
        ? [
            'client.read',
            'client.create',
            'client.update',
            'client.duplicate.resolve',
          ]
        : [],
      clientPermissionAssignmentId: 'assignment-1',
      clientPermissionSetVersion: 'v2',
      ...(state.intakeAssignment
        ? {
            commercialIntakePermissions: [
              'commercial.request.read',
              'commercial.request.create',
              'commercial.opportunity.read',
              'commercial.opportunity.create',
            ],
            commercialIntakePermissionAssignmentId: state.intakeAssignment,
            commercialIntakePermissionSetVersion: 'v1',
          }
        : {}),
    },
  };
}

function requestRow(id: string, subject: string, clientDossierId?: string) {
  const row = buildRequestListItem({
    id,
    subject,
    capturedAt: '2026-09-20T10:00:00.000Z',
    initialOpportunity: {
      title: `${subject} Opportunity`,
      nextAction: `Follow up ${subject}`,
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Resolver',
      },
    },
  });
  return clientDossierId === undefined
    ? row
    : { ...row, clientDossierId, clientDisplayName: sharedName };
}

function requestDetail(
  id: string,
  subject: string,
  clientReference?: { originalClientId: string; currentClientId?: string },
) {
  return buildClientRequest({
    id,
    companyId: companyA.id,
    subject,
    originalText: `Original source of ${subject}`,
    capturedByWorkspaceMembershipId: membershipId,
    capturedAt: '2026-09-20T10:00:00.000Z',
    clientAssociationStatus: clientReference ? 'visible' : 'absent',
    ...(clientReference
      ? { clientReference: { ...clientReference, displayName: sharedName } }
      : {}),
    initialOpportunity: {
      id: `opportunity-${id}`,
      title: `${subject} Opportunity`,
      nextAction: `Follow up ${subject}`,
      responsibleActor: {
        workspaceMembershipId: membershipId,
        displayName: 'Resolver',
      },
    },
  });
}

function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function installTransport(
  options: {
    united?: boolean;
    personalEmpty?: boolean;
    readFirstRequest?: (init: RequestInit | undefined) => Promise<Response>;
  } = {},
): Transport {
  const state: Transport = {
    united: options.united ?? false,
    companyClientRead: true,
    intakeAssignment: 'intake-1',
    forbidDossier: false,
    missingDossier: undefined,
    forbidRequestDetail: false,
    requestListReads: 0,
    dossierReads: [],
    mutations: [],
  };
  const firstCurrent = () => (state.united ? secondClient.id : firstClient.id);
  // The server derives a dossier identity only for a current Company Client
  // reader; this transport mirrors that projection.
  const derived = (clientId: string) =>
    state.companyClientRead ? clientId : undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      const companyContextId = new Headers(init?.headers).get(
        'x-company-context-id',
      );
      if ((init?.method ?? 'GET') !== 'GET')
        state.mutations.push(`${init?.method} ${path}`);
      if (path.endsWith('/access/current-actor'))
        return respond(actorFor(companyContextId ?? companyA.id, state));
      if (path.endsWith('/companies')) return respond([companyA, companyB]);
      if (path.endsWith('/activity-log')) return respond({ events: [] });
      if (path.includes('/client-duplicate-reviews?'))
        return respond({ items: [], next_cursor: null });
      if (path.includes('/commercial-intake/requests?')) {
        const dossierId = new URL(path, 'http://localhost').searchParams.get(
          'clientDossierId',
        );
        if (dossierId !== null)
          return respond({
            items: [
              requestRow(
                'request-second',
                'Second Client Request',
                derived(secondClient.id),
              ),
              requestRow(
                'request-first',
                'First Client Request',
                derived(firstCurrent()),
              ),
            ].filter((item) => item.clientDossierId === dossierId),
          });
        state.requestListReads += 1;
        // A fresh read after reassignment may omit an already opened detail.
        if (
          options.personalEmpty &&
          new URL(path, 'http://localhost').searchParams.get('view') ===
            'mine_open'
        )
          return respond({ items: [] });
        return respond({
          items:
            companyContextId === companyB.id
              ? [requestRow('request-other', 'Company B Request', 'client-b')]
              : [
                  requestRow('request-unlinked', 'Request without Client'),
                  requestRow(
                    'request-second',
                    'Second Client Request',
                    derived(secondClient.id),
                  ),
                  requestRow(
                    'request-first',
                    'First Client Request',
                    derived(firstCurrent()),
                  ),
                ],
        });
      }
      if (
        path.endsWith('/commercial-intake/requests/request-first') &&
        options.readFirstRequest
      )
        return options.readFirstRequest(init);
      if (path.endsWith('/commercial-intake/requests/request-first'))
        return state.forbidRequestDetail
          ? respond({}, 403)
          : respond(
              requestDetail('request-first', 'First Client Request', {
                originalClientId: firstClient.id,
                currentClientId: firstCurrent(),
              }),
            );
      if (path.endsWith('/union-reviews')) return respond(comparison, 201);
      if (path.endsWith('/confirm')) {
        state.united = true;
        return respond(
          {
            outcome: 'united',
            canonicalClientId: secondClient.id,
            projectionReference,
          },
          201,
        );
      }
      if (path.endsWith('/union-history'))
        return respond({
          events: [
            {
              action: 'client.union_confirmed',
              projectionReference,
              companyId: companyA.id,
            },
          ],
          detailReferences: [projectionReference],
        });
      if (path.endsWith(`/client-union-operations/${projectionReference}`))
        return respond({
          state: 'united',
          projectionReference,
          canonicalClientId: secondClient.id,
          originals: [firstClient, secondClient],
          companies: [companyA],
          reason: 'Same verified legal identity.',
          occurredAt: '2026-09-20T12:00:00.000Z',
          actor: { displayName: 'Resolver' },
          reversal: null,
          canReverse: true,
        });
      if (path.endsWith(`/${projectionReference}/reversal`)) {
        state.united = false;
        return respond(
          { outcome: 'reversed', clientIds: [firstClient.id, secondClient.id] },
          201,
        );
      }
      if (path.endsWith('/clients'))
        return respond(
          (state.united ? [secondClient] : [firstClient, secondClient]).map(
            (client) => ({ ...client, relatedToActiveCompany: true }),
          ),
        );
      const dossier = [firstClient, secondClient].find((client) =>
        path.endsWith(`/clients/${client.id}`),
      );
      if (dossier) {
        state.dossierReads.push(dossier.id);
        if (state.missingDossier === dossier.id) return respond({}, 404);
        return state.forbidDossier
          ? respond({}, 403)
          : respond({
              ...dossier,
              relatedToActiveCompany: true,
              involvedCompanyDisplayNames: [companyA.displayName],
            });
      }
      if (path.endsWith('/legal-entities'))
        return respond({ clientVersion: 1, legalEntities: [] });
      throw new Error('Unexpected API request: ' + path);
    }),
  );
  return state;
}

function navigateTo(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: label }),
  );
}
function requestsRegion() {
  return screen.getByRole('region', { name: 'Client Requests' });
}
function listedRequests(): string[] {
  const list = within(requestsRegion()).queryByRole('list', {
    name: 'Client Requests',
  });
  if (!list) return [];
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('strong')?.textContent ?? '');
}
function restrictionScope() {
  return within(requestsRegion()).queryByRole('group', {
    name: `Loaded Client Requests for ${sharedName}`,
  });
}
async function openLoadedRequests(count = 3) {
  await screen.findByRole('navigation', { name: 'Primary navigation' });
  navigateTo('Client Requests');
  await waitFor(() => expect(listedRequests()).toHaveLength(count));
}
/** Same-named dossiers are told apart by their stable identity only. */
async function openDossier(clientId: string, contactName: string) {
  await screen.findByRole('navigation', { name: 'Primary navigation' });
  navigateTo('Clients');
  await screen.findByText(`Client ID: ${clientId}`);
  openDirectoryRow(clientId);
  return dossierShowing(contactName);
}
function dossierShowing(contactName: string): Promise<HTMLElement> {
  return waitFor(() => {
    const dossier = screen
      .getAllByText(contactName, { selector: 'strong' })
      .map((contact) => contact.closest('section.client-dossier-detail'))
      .find((section) => section instanceof HTMLElement);
    if (!(dossier instanceof HTMLElement))
      throw new Error(`Expected the dossier of ${contactName}`);
    return dossier;
  });
}
function openDirectoryRow(clientId: string) {
  const row = screen.getByText(`Client ID: ${clientId}`).closest('li');
  if (!row) throw new Error(`Expected a directory row for ${clientId}`);
  fireEvent.click(within(row).getByRole('button', { name: 'Open dossier' }));
}
function openClientRequests(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier).getByRole('button', { name: 'Open Client Requests' }),
  );
}
async function openRequest(subject: string) {
  fireEvent.click(
    within(requestsRegion()).getByRole('button', {
      name: new RegExp(`^${subject}`, 'u'),
    }),
  );
  await within(requestsRegion()).findByText(`Original source of ${subject}`);
}
async function uniteFirstIntoSecond(dossier: HTMLElement) {
  fireEvent.click(
    within(dossier.parentElement ?? dossier).getByRole('button', {
      name: 'Review existing duplicates',
    }),
  );
  const form = await screen.findByRole('form', { name: 'Confirm union' });
  for (const select of within(form).getAllByRole('combobox'))
    changeValue(select, secondClient.id);
  changeValue(
    within(form).getByLabelText('Reason for this union'),
    'Reviewed both saved dossiers.',
  );
  for (const checkbox of within(form).getAllByRole('checkbox'))
    fireEvent.click(checkbox);
  fireEvent.submit(form);
  await waitFor(() =>
    expect(screen.queryByText(`Client ID: ${firstClient.id}`)).toBeNull(),
  );
  return dossierShowing('Dana');
}

// jsdom implements neither scrolling nor motion media queries. The real
// scroll, focus and frame behaviour is proven by the browser journey.
const scrollable: {
  scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
} = Element.prototype;
const nativeScrollIntoView = scrollable.scrollIntoView;

function holdSectionFrames() {
  const scheduledFrames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  });
  return async () => {
    await act(async () => {
      for (const callback of scheduledFrames.splice(0))
        callback(performance.now());
    });
  };
}

describe('Client dossier and Client Request navigation through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    scrollable.scrollIntoView = vi.fn();
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
    window.history.replaceState(null, '', '/?frame=prisme#clients');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scrollable.scrollIntoView = nativeScrollIntoView;
    window.history.replaceState(null, '', '/');
  });

  it.each(['section-first', 'detail-first'] as const)(
    'shows Client commercial affairs inline and opens the exact existing Request (%s)',
    async (ordering) => {
      const flushFrames = holdSectionFrames();
      const transport = installTransport();
      render(<App identity={deterministicBrowserIdentity()} />);
      const dossier = await openDossier(firstClient.id, 'Alex');
      const commercial = await within(dossier).findByRole('region', {
        name: 'Commercial affairs',
      });
      expect(within(commercial).getByText('Company A')).toBeVisible();
      expect(
        await within(commercial).findByText('Follow up First Client Request'),
      ).toBeVisible();
      expect(within(commercial).getByText('Resolver')).toBeVisible();
      expect(
        within(commercial).queryByText('Second Client Request'),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(commercial).getByRole('button', {
          name: 'Open Request: First Client Request',
        }),
      );
      if (ordering === 'section-first') await flushFrames();
      expect(
        await within(requestsRegion()).findByText(
          'Original source of First Client Request',
        ),
      ).toBeVisible();
      if (ordering === 'detail-first') await flushFrames();
      expect(
        within(requestsRegion()).getByRole('heading', {
          name: 'First Client Request',
        }),
      ).toHaveFocus();
      expect(transport.mutations).toEqual([]);
    },
  );

  it('focuses the visible Requests section while its exact detail is still loading', async () => {
    const flushFrames = holdSectionFrames();
    let release: ((response: Response) => void) | undefined;
    const held = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const read = vi.fn(() => held);
    installTransport({ readFirstRequest: read });
    render(<App identity={deterministicBrowserIdentity()} />);
    const dossier = await openDossier(firstClient.id, 'Alex');
    fireEvent.click(
      await within(dossier).findByRole('button', {
        name: 'Open Request: First Client Request',
      }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await flushFrames();
    expect(requestsRegion()).toHaveFocus();
    if (!release) throw new Error('Missing held Request response');
    await act(async () =>
      release?.(
        respond(requestDetail('request-first', 'First Client Request')),
      ),
    );
    await within(requestsRegion()).findByText(
      'Original source of First Client Request',
    );
    expect(
      within(requestsRegion()).getByRole('heading', {
        name: 'First Client Request',
      }),
    ).toHaveFocus();
  });

  it.each(['Company', 'Company return', 'session'] as const)(
    'ignores an old section frame after %s retirement',
    async (retirement) => {
      const flushFrames = holdSectionFrames();
      installTransport();
      const { rerender } = render(
        <App identity={deterministicBrowserIdentity()} />,
      );
      const dossier = await openDossier(firstClient.id, 'Alex');
      openClientRequests(dossier);
      await waitFor(() =>
        expect(listedRequests()).toEqual(['First Client Request']),
      );
      if (retirement !== 'session') {
        changeValue(
          screen.getByLabelText('Active Company', { exact: true }),
          companyB.id,
        );
        await waitFor(() =>
          expect(listedRequests()).toEqual(['Company B Request']),
        );
        if (retirement === 'Company return') {
          changeValue(
            screen.getByLabelText('Active Company', { exact: true }),
            companyA.id,
          );
          await waitFor(() => expect(listedRequests()).toHaveLength(3));
        }
      } else {
        rerender(<App identity={deterministicBrowserIdentity()} />);
        await waitFor(() => expect(listedRequests()).toHaveLength(3));
      }
      const currentControl = screen.getByLabelText('Active Company', {
        exact: true,
      });
      currentControl.focus();
      await flushFrames();
      expect(currentControl).toHaveFocus();
    },
  );

  it('does not restore queued focus after the originating Client dossier is replaced', async () => {
    const flushFrames = holdSectionFrames();
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    const dossier = await openDossier(firstClient.id, 'Alex');
    fireEvent.click(
      await within(dossier).findByRole('button', {
        name: 'Open Request: First Client Request',
      }),
    );
    await within(requestsRegion()).findByText(
      'Original source of First Client Request',
    );
    await openDossier(secondClient.id, 'Dana');
    navigateTo('Client Requests');
    const currentControl = screen.getByLabelText('Active Company', {
      exact: true,
    });
    currentControl.focus();
    await flushFrames();
    expect(currentControl).toHaveFocus();
  });

  it.each([200, 403])(
    'retires a held inline Request reply after Client union (%s)',
    async (status) => {
      let release: ((response: Response) => void) | undefined;
      let readSignal: AbortSignal | null | undefined;
      const held = new Promise<Response>((resolve) => {
        release = resolve;
      });
      const read = vi.fn((init: RequestInit | undefined) => {
        readSignal = init?.signal;
        return held;
      });
      installTransport({ readFirstRequest: read });
      render(<App identity={deterministicBrowserIdentity()} />);
      const dossier = await openDossier(firstClient.id, 'Alex');
      const commercial = await within(dossier).findByRole('region', {
        name: 'Commercial affairs',
      });
      try {
        fireEvent.click(
          await within(commercial).findByRole('button', {
            name: 'Open Request: First Client Request',
          }),
        );
        await waitFor(() => expect(read).toHaveBeenCalledOnce());
        navigateTo('Clients');
        await uniteFirstIntoSecond(dossier);
        await waitFor(() => expect(readSignal?.aborted).toBe(true));
      } finally {
        await act(async () => {
          release?.(
            respond(
              status === 200
                ? requestDetail('request-first', 'First Client Request', {
                    originalClientId: firstClient.id,
                    currentClientId: firstClient.id,
                  })
                : {},
              status,
            ),
          );
          await held;
        });
      }
      navigateTo('Client Requests');
      await waitFor(() => expect(listedRequests()).toHaveLength(3));
      expect(
        within(requestsRegion()).queryByText(
          'Original source of First Client Request',
        ),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps the exact readable v1 Request mounted when a fresh personal list no longer contains it', async () => {
    const transport = installTransport({ personalEmpty: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    await openRequest('First Client Request');
    const region = within(requestsRegion());
    expect(
      await region.findByText('Original source of First Client Request'),
    ).toBeVisible();
    changeValue(
      region.getByRole('combobox', { name: 'Request view' }),
      'mine_open',
    );
    await waitFor(() => expect(transport.requestListReads).toBe(2));
    expect(
      region.getByText('Original source of First Client Request'),
    ).toBeVisible();
    expect(
      region.queryByRole('button', { name: 'Edit next action' }),
    ).not.toBeInTheDocument();
    expect(transport.mutations).toEqual([]);
    fireEvent.click(region.getByRole('button', { name: 'Back to Requests' }));
    expect(
      await region.findByText(
        'No open cases are assigned to you in Company A.',
      ),
    ).toBeVisible();
    changeValue(region.getByRole('combobox', { name: 'Request view' }), 'all');
    await waitFor(() => expect(listedRequests()).toHaveLength(3));
    expect(transport.requestListReads).toBe(3);
    expect(transport.mutations).toEqual([]);
  });

  it('opens one dossier its loaded Requests by identity and returns to that dossier', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();

    openClientRequests(await openDossier(firstClient.id, 'Alex'));
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );
    expect(window.location.hash).toBe('#requests');
    expect(restrictionScope()).toBeVisible();
    // The Requests workspace is its own navigation destination.
    expect(document.getElementById('requests')).toBe(requestsRegion());
    expect(requestsRegion()).toHaveAttribute('tabindex', '-1');

    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: 'Show loaded Requests for every Client',
      }),
    );
    expect(listedRequests()).toEqual([
      'Request without Client',
      'Second Client Request',
      'First Client Request',
    ]);

    // With the same-named other dossier open, returning must switch to the
    // Request's own dossier.
    await openDossier(secondClient.id, 'Dana');
    navigateTo('Client Requests');
    await openRequest('First Client Request');
    transport.dossierReads.length = 0;
    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(await dossierShowing('Alex')).toBeVisible();
    expect(window.location.hash).toBe('#clients');
    expect(transport.dossierReads).toEqual([firstClient.id]);
    expect(transport.mutations).toEqual([]);
  });

  it('follows a union to the canonical dossier and never keeps the superseded restriction', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    const dossier = await openDossier(firstClient.id, 'Alex');
    openClientRequests(dossier);
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );
    const readsBeforeUnion = transport.requestListReads;

    navigateTo('Clients');
    const canonical = await uniteFirstIntoSecond(dossier);
    await waitFor(() =>
      expect(transport.requestListReads).toBe(readsBeforeUnion + 1),
    );
    navigateTo('Client Requests');
    expect(restrictionScope()).not.toBeInTheDocument();
    await waitFor(() => expect(listedRequests()).toHaveLength(3));

    navigateTo('Clients');
    openClientRequests(canonical);
    await waitFor(() =>
      expect(listedRequests()).toEqual([
        'Second Client Request',
        'First Client Request',
      ]),
    );
    await openRequest('First Client Request');
    transport.dossierReads.length = 0;
    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    await waitFor(() => expect(window.location.hash).toBe('#clients'));
    expect(await dossierShowing('Dana')).toBeVisible();
    // The canonical dossier was already open; the superseded one is never read.
    await act(async () => {
      await new Promise((settle) => setTimeout(settle, 0));
    });
    expect(transport.dossierReads).not.toContain(firstClient.id);
    expect(screen.queryByText('Alex', { selector: 'strong' })).toBeNull();
  });

  it('follows a reversal back to the original dossier', async () => {
    const transport = installTransport({ united: true });
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();

    const canonical = await openDossier(secondClient.id, 'Dana');
    fireEvent.click(
      within(canonical.parentElement ?? canonical).getByRole('button', {
        name: 'Union history',
      }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'View authorized union details',
      }),
    );
    const reversal = await screen.findByRole('form', { name: 'Reverse union' });
    changeValue(
      within(reversal).getByLabelText('Reason for reversal'),
      'Restore the separate dossiers deliberately.',
    );
    fireEvent.click(within(reversal).getByRole('checkbox'));
    fireEvent.click(
      within(reversal).getByRole('button', { name: 'Reverse union' }),
    );

    openClientRequests(await openDossier(firstClient.id, 'Alex'));
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );
    await openDossier(secondClient.id, 'Dana');
    navigateTo('Client Requests');
    await openRequest('First Client Request');
    transport.dossierReads.length = 0;
    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(await dossierShowing('Alex')).toBeVisible();
    expect(transport.dossierReads).toEqual([firstClient.id]);
  });

  it('does not restore a previous Company restriction when the member returns to that Company', async () => {
    installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    openClientRequests(await openDossier(firstClient.id, 'Alex'));
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );

    const company = screen.getByLabelText('Active Company', { exact: true });
    changeValue(company, companyB.id);
    await waitFor(() =>
      expect(listedRequests()).toEqual(['Company B Request']),
    );
    expect(restrictionScope()).not.toBeInTheDocument();
    changeValue(company, companyA.id);

    await waitFor(() => expect(listedRequests()).toHaveLength(3));
    expect(restrictionScope()).not.toBeInTheDocument();
  });

  it('retires the restriction and both actions when Company Client read is lost', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    const dossier = await openDossier(firstClient.id, 'Alex');
    openClientRequests(dossier);
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );

    // A rejected dossier read revalidates the actor, which lost Client read.
    transport.companyClientRead = false;
    transport.forbidDossier = true;
    navigateTo('Clients');
    openDirectoryRow(secondClient.id);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Open dossier' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: 'Open Client Requests' }),
    ).not.toBeInTheDocument();

    navigateTo('Client Requests');
    expect(restrictionScope()).not.toBeInTheDocument();
    expect(listedRequests()).toHaveLength(3);
    await openRequest('First Client Request');
    expect(within(requestsRegion()).getByText(sharedName)).toBeVisible();
    expect(
      within(requestsRegion()).queryByRole('button', {
        name: 'Open Client dossier',
      }),
    ).not.toBeInTheDocument();
  });

  it('does not reapply a restriction after Commercial Intake read is lost and granted again', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    openClientRequests(await openDossier(firstClient.id, 'Alex'));
    await waitFor(() =>
      expect(listedRequests()).toEqual(['First Client Request']),
    );

    // A rejected Request read revalidates the actor, which lost the bundle.
    transport.intakeAssignment = undefined;
    transport.forbidRequestDetail = true;
    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: /^First Client Request/u,
      }),
    );
    const navigation = screen.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await waitFor(() =>
      expect(
        within(navigation).queryByRole('link', { name: 'Client Requests' }),
      ).not.toBeInTheDocument(),
    );

    // A fresh grant becomes visible through the next revalidation.
    transport.intakeAssignment = 'intake-2';
    transport.forbidRequestDetail = false;
    transport.forbidDossier = true;
    navigateTo('Clients');
    openDirectoryRow(secondClient.id);
    await openLoadedRequests();
    expect(restrictionScope()).not.toBeInTheDocument();
  });

  it('shows the existing unavailable dossier state when the returned dossier cannot be read', async () => {
    const transport = installTransport();
    render(<App identity={deterministicBrowserIdentity()} />);
    await openLoadedRequests();
    await openRequest('First Client Request');

    transport.missingDossier = firstClient.id;
    fireEvent.click(
      within(requestsRegion()).getByRole('button', {
        name: 'Open Client dossier',
      }),
    );
    expect(
      await screen.findByText(
        'The Client dossier is not available in this Company.',
      ),
    ).toBeVisible();
    expect(transport.dossierReads).toEqual([firstClient.id]);
    expect(transport.mutations).toEqual([]);
  });

  it('offers no dossier action without Commercial Intake', async () => {
    const transport = installTransport();
    transport.intakeAssignment = undefined;
    render(<App identity={deterministicBrowserIdentity()} />);
    const dossier = await openDossier(firstClient.id, 'Alex');
    expect(
      within(dossier).queryByRole('button', { name: 'Open Client Requests' }),
    ).not.toBeInTheDocument();
  });
});
