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
import { changeValue } from './test/select-option';
import { commercialIntakeCopy as copy } from './commercial-intake/commercial-intake.copy';

const company = { id: 'company-1', displayName: 'Company One' };
const otherCompany = { id: 'company-2', displayName: 'Company Two' };
const client = {
  id: 'client-1',
  displayName: 'Selected Client',
  relatedToActiveCompany: true,
};
const detail = {
  id: 'request-1',
  companyId: company.id,
  sourceKind: 'MANUAL_TEXT',
  sourceLabel: null,
  reportedReceivedAt: null,
  subject: 'Saved Request',
  originalText: 'Original captured text',
  capturedByWorkspaceMembershipId: 'member-1',
  capturedAt: '2026-10-03T06:00:00.000Z',
  version: 1,
  clientAssociationStatus: 'absent',
  initialOpportunity: {
    id: 'opportunity-1',
    title: 'Saved Opportunity',
    scope: null,
    nextAction: 'Original next action',
    status: 'OPEN',
    responsibleWorkspaceMembershipId: 'member-1',
    responsibleActor: { workspaceMembershipId: 'member-1', displayName: 'Ada' },
    createdAt: '2026-10-03T06:00:00.000Z',
    version: 1,
  },
};
const associated = {
  receipt: { requestId: detail.id, version: 2, outcome: 'associated' },
  request: {
    ...detail,
    version: 2,
    clientAssociationStatus: 'visible',
    clientReference: {
      originalClientId: client.id,
      currentClientId: client.id,
      displayName: client.displayName,
    },
  },
};
function actor(assignmentId: string): ActorContext {
  return {
    internalUserId: 'user-1',
    workspaceMembershipId: 'member-1',
    workspaceId: 'workspace-1',
    workspaceName: 'Workspace',
    displayName: 'Ada',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: ['company.assignment.manage'],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: assignmentId,
      clientPermissionSetVersion: 'v2',
      commercialIntakePermissions: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
        'commercial.request.client.associate',
      ],
      commercialIntakePermissionAssignmentId: 'intake-1',
      commercialIntakePermissionSetVersion: 'v3',
    },
  };
}
function deferredReply() {
  let resolve: (value: Response) => void = () => undefined;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return {
    response: () => promise,
    async settle(value: unknown) {
      await act(async () => {
        resolve(Response.json(value));
        await promise;
      });
    },
  };
}
function transport() {
  let currentActor = actor('client-assignment-1');
  const commands: {
    body: BodyInit | null | undefined;
    key: string | null;
    signal: AbortSignal | null | undefined;
  }[] = [];
  const searches: (AbortSignal | null | undefined)[] = [];
  const unexpected: string[] = [];
  let searchResponse = () => Promise.resolve(Response.json([client]));
  let commandResponse = () =>
    Promise.resolve(Response.json({}, { status: 503 }));
  let detailResponse = () => Promise.resolve(Response.json(detail));
  let listClient:
    { clientDisplayName: string; clientDossierId: string } | undefined;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path.endsWith('/access/current-actor'))
        return Response.json(currentActor);
      if (path.endsWith('/companies'))
        return Response.json([company, otherCompany]);
      if (path.endsWith('/activity-log')) return Response.json({ events: [] });
      if (path.endsWith('/company-context-assignments/administration'))
        return Response.json({
          members: [
            {
              workspaceMembershipId: 'member-1',
              displayName: 'Ada',
              email: 'ada@example.test',
            },
          ],
          companies: [company, otherCompany],
          assignments: [],
        });
      if (path.endsWith('/company-director-client-assignments'))
        return Response.json({ id: 'other-client-grant' }, { status: 201 });
      if (path.endsWith('/clients')) return Response.json([]);
      if (path.includes('/clients/search?query=Revalidate'))
        return Response.json({}, { status: 403 });
      if (path.includes('/clients/search?')) {
        searches.push(init?.signal);
        return searchResponse();
      }
      if (path.includes('/commercial-intake/requests?'))
        return Response.json({
          items: [
            {
              id: detail.id,
              subject: detail.subject,
              capturedAt: detail.capturedAt,
              ...listClient,
              initialOpportunity: {
                title: detail.initialOpportunity.title,
                nextAction: detail.initialOpportunity.nextAction,
                responsibleActor: detail.initialOpportunity.responsibleActor,
              },
            },
          ],
        });
      if (path.endsWith('/commercial-intake/requests/request-1'))
        return detailResponse();
      if (
        path.endsWith(
          '/commercial-intake/requests/request-1/client-association',
        )
      ) {
        commands.push({
          body: init?.body,
          key: new Headers(init?.headers).get('idempotency-key'),
          signal: init?.signal,
        });
        return commandResponse();
      }
      unexpected.push(path);
      return Response.json({}, { status: 599 });
    }),
  );
  return {
    commands,
    searches,
    unexpected,
    searchWith(next: () => Promise<Response>) {
      searchResponse = next;
    },
    commandWith(next: () => Promise<Response>) {
      commandResponse = next;
    },
    detailWith(next: () => Promise<Response>) {
      detailResponse = next;
    },
    loadAssociated() {
      detailResponse = () => Promise.resolve(Response.json(associated.request));
      listClient = {
        clientDisplayName: client.displayName,
        clientDossierId: client.id,
      };
    },
    loseClientRead() {
      const activeCompany = currentActor.activeCompany;
      if (!activeCompany) throw new Error('Expected active Company');
      currentActor = {
        ...currentActor,
        activeCompany: { ...activeCompany, clientPermissions: [] },
      };
    },
    replaceAssignment() {
      currentActor = actor('client-assignment-2');
    },
  };
}
function navigate(label: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name: label }),
  );
}
async function openRequest() {
  render(<App identity={deterministicBrowserIdentity()} />);
  fireEvent.click(
    await screen.findByRole('button', { name: /^Saved Request/u }),
  );
  return screen.findByRole('article', { name: detail.subject });
}
async function selectClient() {
  fireEvent.change(screen.getByLabelText(copy.clientSearch), {
    target: { value: 'Selected' },
  });
  fireEvent.click(screen.getByRole('button', { name: copy.searchClients }));
  changeValue(
    await screen.findByRole('combobox', { name: copy.existingClient }),
    client.id,
  );
}
// A real 403 revalidation publishes the replacement assignment through App.
// Company, session, Intake grant and effective Client read stay unchanged.
async function revalidate() {
  navigate('Clients');
  changeValue(screen.getByLabelText('Find a shared Client'), 'Revalidate');
  fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
  await waitFor(() => {
    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText('Find a shared Client')?.getAttribute('value') ??
        '',
    ).toBe('');
  });
  navigate('Client Requests');
}

async function refreshAuthority() {
  navigate('Team & access');
  const access = await screen.findByRole('region', { name: 'Company access' });
  changeValue(within(access).getByLabelText('Workspace member'), 'member-1');
  changeValue(
    within(access).getByLabelText('Company', { exact: true }),
    otherCompany.id,
  );
  changeValue(
    within(access).getByLabelText('Access bundle'),
    'director-client',
  );
  fireEvent.click(within(access).getByRole('button', { name: 'Grant access' }));
  await screen.findByText('Access granted. Server state refreshed.');
  navigate('Client Requests');
}

describe('Request Client association authority through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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
    window.history.replaceState(null, '', '/?frame=prisme#requests');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('withdraws loaded Client identity immediately on read loss while keeping Request evidence and the Opportunity draft', async () => {
    const api = transport();
    api.loadAssociated();
    await openRequest();
    expect(screen.getByText(client.displayName)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: copy.editNextAction }));
    changeValue(screen.getByLabelText(copy.nextAction), 'Preserved draft');
    const freshProjection = deferredReply();
    api.detailWith(freshProjection.response);
    api.loseClientRead();
    await revalidate();
    expect(screen.queryByText(client.displayName)).not.toBeInTheDocument();
    expect(screen.getByText(copy.clientAssociationHidden)).toBeVisible();
    expect(screen.getByText(detail.originalText)).toBeVisible();
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Preserved draft',
    );
    expect(
      screen.queryByRole('button', { name: copy.openClientDossier }),
    ).not.toBeInTheDocument();
    await freshProjection.settle({
      ...associated.request,
      clientAssociationStatus: 'hidden',
      clientReference: undefined,
    });
    expect(screen.queryByText(client.displayName)).not.toBeInTheDocument();
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Preserved draft',
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelNextAction }),
    );
    fireEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(
      screen.queryByText(new RegExp(client.displayName)),
    ).not.toBeInTheDocument();
    expect(api.unexpected).toEqual([]);
  });

  it('withdraws loaded Client projections through the App authority signal until a fresh read settles', async () => {
    const api = transport();
    api.loadAssociated();
    await openRequest();
    const current = deferredReply();
    api.detailWith(current.response);
    await refreshAuthority();
    expect(screen.queryByText(client.displayName)).not.toBeInTheDocument();
    expect(screen.getByText(copy.clientAssociationHidden)).toBeVisible();
    await current.settle({
      ...associated.request,
      clientReference: {
        ...associated.request.clientReference,
        displayName: 'Fresh authorized Client',
      },
    });
    expect(screen.getByText('Fresh authorized Client')).toBeVisible();
    expect(api.unexpected).toEqual([]);
  });

  it('clears a selected Client on replacement read authority while preserving the Request and Opportunity draft', async () => {
    const api = transport();
    await openRequest();
    await selectClient();
    fireEvent.click(screen.getByRole('button', { name: copy.editNextAction }));
    changeValue(
      screen.getByLabelText(copy.nextAction),
      'Preserved Opportunity draft',
    );
    api.replaceAssignment();
    await revalidate();
    expect(screen.getByRole('article', { name: detail.subject })).toBeVisible();
    expect(screen.getByLabelText(copy.nextAction)).toHaveValue(
      'Preserved Opportunity draft',
    );
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
    expect(
      screen.queryByRole('combobox', { name: copy.existingClient }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: copy.cancelNextAction }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationValidation);
    expect(api.commands).toHaveLength(0);
    expect(api.unexpected).toEqual([]);
  });

  it('retains exact uncertain retry under unchanged authority, then retires it on a still-readable replacement', async () => {
    const api = transport();
    await openRequest();
    await selectClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationUncertain);
    fireEvent.click(
      screen.getByRole('button', { name: copy.retryClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationUncertain);
    expect(api.commands).toHaveLength(2);
    expect(api.commands[1]?.key).toBe(api.commands[0]?.key);
    expect(api.commands[1]?.body).toBe(api.commands[0]?.body);
    api.replaceAssignment();
    await revalidate();
    expect(
      screen.queryByText(copy.clientAssociationUncertain),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.retryClientAssociation }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationValidation);
    expect(api.commands).toHaveLength(2);
    api.commandWith(() => Promise.resolve(Response.json(associated)));
    await selectClient();
    fireEvent.click(
      screen.getByRole('button', { name: copy.confirmClientAssociation }),
    );
    await screen.findByText(copy.clientAssociationSuccess);
    expect(api.commands).toHaveLength(3);
    expect(api.commands[2]?.key).toBeTruthy();
    expect(api.commands[2]?.key).not.toBe(api.commands[0]?.key);
    expect(api.unexpected).toEqual([]);
  });

  it.each<'search' | 'command'>(['search', 'command'])(
    'aborts and suppresses a late %s response from the replaced Client assignment',
    async (operation) => {
      const api = transport();
      const late = deferredReply();
      await openRequest();
      if (operation === 'command') {
        await selectClient();
        api.commandWith(late.response);
        fireEvent.click(
          screen.getByRole('button', { name: copy.confirmClientAssociation }),
        );
        await waitFor(() => expect(api.commands).toHaveLength(1));
      } else {
        api.searchWith(late.response);
        changeValue(screen.getByLabelText(copy.clientSearch), 'Selected');
        fireEvent.click(
          screen.getByRole('button', { name: copy.searchClients }),
        );
        await waitFor(() => expect(api.searches).toHaveLength(1));
      }
      const signal =
        operation === 'command' ? api.commands[0]?.signal : api.searches[0];
      api.replaceAssignment();
      await revalidate();
      expect(signal?.aborted).toBe(true);
      await late.settle(operation === 'command' ? associated : [client]);
      expect(
        screen.getByRole('article', { name: detail.subject }),
      ).toBeVisible();
      expect(screen.getByText(copy.noClientAssociated)).toBeVisible();
      expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
      expect(
        screen.queryByRole('combobox', { name: copy.existingClient }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(copy.clientAssociationSuccess),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(copy.clientAssociationUncertain),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: copy.editNextAction }),
      ).toBeEnabled();
      expect(api.unexpected).toEqual([]);
    },
  );

  it('retires selection through the existing App authority signal without replacing the Requests workspace', async () => {
    const api = transport();
    await openRequest();
    await selectClient();
    navigate('Team & access');
    const access = await screen.findByRole('region', {
      name: 'Company access',
    });
    changeValue(within(access).getByLabelText('Workspace member'), 'member-1');
    changeValue(
      within(access).getByLabelText('Company', { exact: true }),
      otherCompany.id,
    );
    changeValue(
      within(access).getByLabelText('Access bundle'),
      'director-client',
    );
    fireEvent.click(
      within(access).getByRole('button', { name: 'Grant access' }),
    );
    await screen.findByText('Access granted. Server state refreshed.');
    navigate('Client Requests');
    expect(screen.getByRole('article', { name: detail.subject })).toBeVisible();
    expect(screen.getByLabelText(copy.clientSearch)).toHaveValue('');
    expect(
      screen.queryByRole('combobox', { name: copy.existingClient }),
    ).not.toBeInTheDocument();
    expect(api.commands).toHaveLength(0);
    expect(api.unexpected).toEqual([]);
  });
});
