import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../test/render-with-interface-locale';
import { ClientWorkspace } from './ClientWorkspace';

const actor: ActorContext = {
  internalUserId: 'owner-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Iurie',
  email: 'iurie@example.test',
  active: true,
  workspacePermissions: [
    'company.manage',
    'company.assignment.manage',
    'client.manage',
  ],
  activeCompany: {
    id: 'company-a',
    displayName: 'PRISMA-PRIM',
    clientPermissions: ['client.read', 'client.create', 'client.update'],
  },
};

const validListedClient = {
  id: 'valid-client',
  displayName: 'Valid Client',
  relatedToActiveCompany: true,
};

describe('ClientWorkspace response contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects a malformed successful Client list without showing a partial list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'valid-client',
              displayName: 'Valid Client',
              relatedToActiveCompany: true,
            },
            {
              id: 'malformed-client',
              displayName: 'Malformed Client',
              relatedToActiveCompany: 'false',
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load Clients. Please try again.',
    );
    expect(
      screen.queryByRole('heading', { name: 'Valid Client' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Malformed Client' }),
    ).not.toBeInTheDocument();
  });

  it.each<{ description: string; payload: unknown }>([
    { description: 'a null envelope', payload: null },
    {
      description: 'an object envelope',
      payload: { clients: [validListedClient] },
    },
    {
      description: 'an array row',
      payload: [validListedClient, []],
    },
    {
      description: 'a numeric Client ID',
      payload: [
        validListedClient,
        {
          id: 7,
          displayName: 'Malformed Client',
          relatedToActiveCompany: true,
        },
      ],
    },
    {
      description: 'a null display name',
      payload: [
        validListedClient,
        {
          id: 'malformed-client',
          displayName: null,
          relatedToActiveCompany: true,
        },
      ],
    },
    {
      description: 'a missing Company relationship',
      payload: [
        validListedClient,
        { id: 'malformed-client', displayName: 'Malformed Client' },
      ],
    },
  ])(
    'rejects a successful Client list containing $description',
    async ({ payload }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            new Response(JSON.stringify(payload), { status: 200 }),
          ),
      );
      render(
        <ClientWorkspace
          actor={actor}
          identity={deterministicBrowserIdentity()}
          onCompanyContextRejected={vi.fn()}
          onActivityRecorded={vi.fn(async () => undefined)}
        />,
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not load Clients. Please try again.',
      );
      expect(
        screen.queryByRole('heading', { name: 'Valid Client' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Malformed Client' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('No Clients for PRISMA-PRIM yet.'),
      ).not.toBeInTheDocument();
    },
  );

  it('retains an unconfirmed registration draft and retries its exact command after malformed success', async () => {
    const registrations: Array<{
      body: unknown;
      idempotencyKey: string | null;
    }> = [];
    let listReads = 0;
    let registered = false;
    const registeredClient = {
      id: 'registered-client',
      displayName: 'Literal Client SRL',
      relatedToActiveCompany: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
        if (String(input) !== '/api/clients')
          throw new Error(`Unexpected request: ${String(input)}`);
        if (request?.method === 'POST') {
          registrations.push({
            body: request.body,
            idempotencyKey: new Headers(request.headers).get('idempotency-key'),
          });
          if (registrations.length === 1)
            return new Response(
              JSON.stringify({
                displayName: 'Literal Client SRL',
                relatedToActiveCompany: true,
              }),
              { status: 201 },
            );
          registered = true;
          return new Response(JSON.stringify(registeredClient), {
            status: 201,
          });
        }
        listReads += 1;
        return new Response(
          JSON.stringify(registered ? [registeredClient] : []),
          { status: 200 },
        );
      }),
    );
    const recordActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={recordActivity}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: '  Literal Client SRL  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load Clients. Please try again.',
    );
    expect(screen.getByLabelText('Client display name')).toHaveValue(
      '  Literal Client SRL  ',
    );
    expect(
      screen.queryByText('Client created and linked to the active Company.'),
    ).not.toBeInTheDocument();
    expect(recordActivity).not.toHaveBeenCalled();
    expect(listReads).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(
      await screen.findByRole('heading', { name: 'Literal Client SRL' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Client created and linked to the active Company.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Client display name')).toHaveValue('');
    expect(recordActivity).toHaveBeenCalledOnce();
    expect(listReads).toBe(2);
    expect(registrations).toHaveLength(2);
    expect(registrations[0]).toEqual({
      body: JSON.stringify({ displayName: 'Literal Client SRL' }),
      idempotencyKey: expect.any(String),
    });
    expect(registrations[0]?.idempotencyKey).toBeTruthy();
    expect(registrations[1]).toEqual(registrations[0]);
  });

  it('rejects malformed search results and retains the query for a successful retry', async () => {
    const searches: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const path = String(input);
        if (path === '/api/clients')
          return new Response(JSON.stringify([]), { status: 200 });
        if (path === '/api/clients/search?query=Literal%20Client') {
          searches.push(path);
          return new Response(
            JSON.stringify(
              searches.length === 1
                ? [
                    {
                      id: 'valid-search-client',
                      displayName: 'Valid Search Client',
                      relatedToActiveCompany: false,
                    },
                    {
                      id: 'malformed-search-client',
                      displayName: 'Malformed Search Client',
                      relatedToActiveCompany: 'false',
                    },
                  ]
                : [
                    {
                      id: 'valid-search-client',
                      displayName: 'Valid Search Client',
                      relatedToActiveCompany: false,
                    },
                  ],
            ),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Find a shared Client'), {
      target: { value: '  Literal Client  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load Clients. Please try again.',
    );
    expect(screen.getByLabelText('Find a shared Client')).toHaveValue(
      '  Literal Client  ',
    );
    expect(
      screen.queryByRole('heading', { name: 'Valid Search Client' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Malformed Search Client' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add to PRISMA-PRIM' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));

    expect(
      await screen.findByRole('heading', { name: 'Valid Search Client' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add to PRISMA-PRIM' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(searches).toEqual([
      '/api/clients/search?query=Literal%20Client',
      '/api/clients/search?query=Literal%20Client',
    ]);
  });

  it('does not confirm a malformed attachment and settles before a successful retry', async () => {
    let listReads = 0;
    let attachments = 0;
    let linked = false;
    const linkedClient = {
      id: 'attachment-client',
      displayName: 'Attachable Client',
      relatedToActiveCompany: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/clients') {
          listReads += 1;
          return new Response(JSON.stringify(linked ? [linkedClient] : []), {
            status: 200,
          });
        }
        if (path === '/api/clients/search?query=Attachable')
          return new Response(
            JSON.stringify([
              {
                id: 'attachment-client',
                displayName: 'Attachable Client',
                relatedToActiveCompany: false,
              },
            ]),
            { status: 200 },
          );
        if (
          path ===
            '/api/clients/attachment-client/active-company-relationship' &&
          request?.method === 'PUT'
        ) {
          attachments += 1;
          if (attachments === 1)
            return new Response(
              JSON.stringify({
                id: 'attachment-client',
                relatedToActiveCompany: true,
              }),
              { status: 200 },
            );
          linked = true;
          return new Response(JSON.stringify(linkedClient), { status: 200 });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const recordActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={recordActivity}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Find a shared Client'), {
      target: { value: 'Attachable' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add to PRISMA-PRIM' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load Clients. Please try again.',
    );
    expect(
      screen.queryByText('Available in PRISMA-PRIM'),
    ).not.toBeInTheDocument();
    expect(recordActivity).not.toHaveBeenCalled();
    expect(listReads).toBe(1);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Search Clients' }),
      ).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add to PRISMA-PRIM' }),
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Attachable Client',
        level: 3,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Available in PRISMA-PRIM')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recordActivity).toHaveBeenCalledOnce();
    expect(listReads).toBe(2);
    expect(attachments).toBe(2);
  });

  it('accepts additive response fields while listing, searching, attaching and registering Clients', async () => {
    const listedClient = {
      id: 'listed-client',
      displayName: 'Listed Client',
      relatedToActiveCompany: true,
      futureDirectoryData: { revision: 7 },
    };
    const sharedClient = {
      id: 'shared-client',
      displayName: 'Shared Client',
      relatedToActiveCompany: true,
      futureRelationshipData: ['additional information'],
    };
    const registeredClient = {
      id: 'registered-client',
      displayName: 'Registered Client',
      relatedToActiveCompany: true,
      futureRegistrationData: { accepted: true },
    };
    let linked = false;
    let registered = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, request?: RequestInit) => {
        const path = String(input);
        if (path === '/api/clients' && request?.method === 'POST') {
          registered = true;
          return new Response(JSON.stringify(registeredClient), {
            status: 201,
          });
        }
        if (path === '/api/clients')
          return new Response(
            JSON.stringify([
              listedClient,
              ...(linked ? [sharedClient] : []),
              ...(registered ? [registeredClient] : []),
            ]),
            { status: 200 },
          );
        if (path === '/api/clients/search?query=Shared')
          return new Response(
            JSON.stringify([
              {
                id: 'shared-client',
                displayName: 'Shared Client',
                relatedToActiveCompany: false,
                futureSearchData: { rank: 1 },
              },
            ]),
            { status: 200 },
          );
        if (
          path === '/api/clients/shared-client/active-company-relationship' &&
          request?.method === 'PUT'
        ) {
          linked = true;
          return new Response(JSON.stringify(sharedClient), { status: 200 });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );
    const recordActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={recordActivity}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Listed Client', level: 3 }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a shared Client'), {
      target: { value: 'Shared' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    expect(
      await screen.findByRole('heading', { name: 'Shared Client', level: 4 }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to PRISMA-PRIM' }));
    expect(
      await screen.findByRole('heading', { name: 'Shared Client', level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Available in PRISMA-PRIM')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Registered Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Registered Client',
        level: 3,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Client created and linked to the active Company.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Client display name')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(recordActivity).toHaveBeenCalledTimes(2);
  });
});
