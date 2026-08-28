import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
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

describe('ClientWorkspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and lists a minimal Client in the active Company', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'client-1',
              displayName: 'Exemplu Client SRL',
              relatedToActiveCompany: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-1',
                displayName: 'Exemplu Client SRL',
                relatedToActiveCompany: true,
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

    expect(
      await screen.findByText('No Clients for PRISMA-PRIM yet.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Exemplu Client SRL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(
      await screen.findByRole('heading', { name: 'Exemplu Client SRL' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Client ID: client-1')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/clients',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-a',
        }),
        body: JSON.stringify({ displayName: 'Exemplu Client SRL' }),
      }),
    );
  });

  it('creates an enriched Client with an ordered Contact list', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'client-contacts',
              displayName: 'Ordered Contacts Client',
              relatedToActiveCompany: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-contacts',
                displayName: 'Ordered Contacts Client',
                relatedToActiveCompany: true,
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

    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Ordered Contacts Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    const contactOne = screen.getByRole('group', { name: 'Contact 1' });
    const contactTwo = screen.getByRole('group', { name: 'Contact 2' });
    fireEvent.change(within(contactOne).getByLabelText('Contact name'), {
      target: { value: 'Ana Popescu' },
    });
    fireEvent.change(within(contactOne).getByLabelText('Contact telephone'), {
      target: { value: '+373 60 111 111' },
    });
    fireEvent.change(within(contactTwo).getByLabelText('Contact name'), {
      target: { value: 'Ion Ionescu' },
    });
    fireEvent.change(within(contactTwo).getByLabelText('Contact email'), {
      target: { value: 'ion@example.test' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    await screen.findByRole('heading', { name: 'Ordered Contacts Client' });
    const body = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body),
    ) as { contacts: unknown[] };
    expect(body.contacts).toEqual([
      { name: 'Ana Popescu', telephone: '+373 60 111 111' },
      { name: 'Ion Ionescu', email: 'ion@example.test' },
    ]);
  });

  it('does not discard entered contact details when the contact name is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
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

    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Exemplu Client SRL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Contact' }));
    fireEvent.change(screen.getByLabelText('Contact telephone'), {
      target: { value: '+373 69 111 222' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Each Contact must have a name.',
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Contact name')).toBeInvalid();
    expect(screen.getByLabelText('Client display name')).toBeValid();
    expect(screen.getByLabelText('Contact telephone')).toHaveValue(
      '+373 69 111 222',
    );
  });

  it('opens and corrects the enriched dossier with a versioned idempotent command', async () => {
    const initialDossier = {
      id: 'client-1',
      displayName: 'Exemplu Client SRL',
      relatedToActiveCompany: true,
      taxId: '1003600123456',
      address: 'Chișinău',
      telephone: null,
      generalEmail: 'office@example.test',
      contacts: [
        {
          name: 'Ana | Popescu\nOperations',
          email: 'ana@example.test',
        },
      ],
      businessActivity: 'Consulting',
      version: 1,
      involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
    };
    const correctedDossier = {
      ...initialDossier,
      telephone: '+373 69 111 222',
      version: 2,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: initialDossier.id,
                displayName: initialDossier.displayName,
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(initialDossier), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(correctedDossier), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: initialDossier.id,
                displayName: initialDossier.displayName,
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const refreshActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={refreshActivity}
      />,
    );

    await screen.findByRole('heading', { name: 'Exemplu Client SRL' });
    fireEvent.click(screen.getByRole('button', { name: 'Open dossier' }));
    expect(await screen.findByText('Version 1')).toBeInTheDocument();
    expect(screen.getByText('BIC, PRISMA-PRIM')).toBeInTheDocument();

    const correctionForm = screen.getByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correctionForm).getByLabelText('Telephone'), {
      target: { value: '+373 69 111 222' },
    });
    fireEvent.click(
      within(correctionForm).getByRole('button', { name: 'Save correction' }),
    );

    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(
      screen.getByText('Client correction saved with attributable history.'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/clients/client-1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
          'x-company-context-id': 'company-a',
        }),
        body: expect.stringContaining('"expectedVersion":1'),
      }),
    );
    const correctionBody = JSON.parse(
      String(vi.mocked(fetch).mock.calls[2]?.[1]?.body),
    ) as { contacts: Array<{ name: string; email?: string }> };
    expect(correctionBody.contacts).toEqual(initialDossier.contacts);
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('keeps legacy client.manage on the minimal Client interface', async () => {
    const client = {
      id: 'legacy-client',
      displayName: 'Legacy Managed Client',
      relatedToActiveCompany: true,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([client]), { status: 200 }),
        ),
    );

    render(
      <ClientWorkspace
        actor={{
          ...actor,
          activeCompany: {
            ...actor.activeCompany!,
            clientPermissions: [],
          },
        }}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    await screen.findByRole('heading', { name: client.displayName });
    expect(
      screen.getByRole('textbox', { name: 'Client display name' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Find a shared Client' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open dossier' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('IDNO / tax code')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Address')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('General email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Contact name')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Business activity'),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('surfaces a stale correction and reloads the current dossier before retry', async () => {
    const dossier = {
      id: 'client-stale-version',
      displayName: 'Concurrent Client',
      relatedToActiveCompany: true,
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      contacts: [],
      businessActivity: null,
      version: 1,
      involvedCompanyDisplayNames: ['PRISMA-PRIM'],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: dossier.id,
                displayName: dossier.displayName,
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(dossier), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'Conflict' }), {
            status: 409,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ...dossier,
              version: 2,
              telephone: '+373 22 222 222',
            }),
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

    await screen.findByRole('heading', { name: dossier.displayName });
    fireEvent.click(screen.getByRole('button', { name: 'Open dossier' }));
    const correctionForm = await screen.findByRole('form', {
      name: 'Correct Client dossier',
    });
    fireEvent.change(within(correctionForm).getByLabelText('Telephone'), {
      target: { value: '+373 60 000 000' },
    });
    fireEvent.click(
      within(correctionForm).getByRole('button', { name: 'Save correction' }),
    );

    expect(
      await screen.findByText(/changed before your correction was saved/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload dossier' }));
    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(
      within(
        screen.getByRole('form', { name: 'Correct Client dossier' }),
      ).getByLabelText('Telephone'),
    ).toHaveValue('+373 22 222 222');
  });

  it('supersedes an older Client list after a successful creation', async () => {
    const initialList = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(initialList.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'client-new',
              displayName: 'New Client',
              relatedToActiveCompany: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-new',
                displayName: 'New Client',
                relatedToActiveCompany: true,
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
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const initialSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;

    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'New Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));

    expect(
      await screen.findByRole('heading', { name: 'New Client' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(initialSignal?.aborted).toBe(true);

    await act(async () => {
      initialList.resolve(
        new Response(
          JSON.stringify([
            {
              id: 'client-stale',
              displayName: 'Stale Client',
              relatedToActiveCompany: true,
            },
          ]),
          { status: 200 },
        ),
      );
      await initialList.promise;
    });
    expect(screen.getByText('New Client')).toBeInTheDocument();
    expect(screen.queryByText('Stale Client')).not.toBeInTheDocument();
  });

  it('searches and attaches an existing shared Client to the active Company', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-1',
                displayName: 'Exemplu Client SRL',
                relatedToActiveCompany: false,
              },
            ]),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'client-1',
              displayName: 'Exemplu Client SRL',
              relatedToActiveCompany: true,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-1',
                displayName: 'Exemplu Client SRL',
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const bicActor: ActorContext = {
      ...actor,
      activeCompany: { id: 'company-b', displayName: 'BIC' },
    };

    render(
      <ClientWorkspace
        actor={bicActor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    await screen.findByText('No Clients for BIC yet.');

    fireEvent.change(screen.getByLabelText('Find a shared Client'), {
      target: { value: 'Exemplu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));

    expect(
      await screen.findByRole('heading', { name: 'Exemplu Client SRL' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to BIC' }));

    expect(await screen.findByText('Available in BIC')).toBeInTheDocument();
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/clients/client-1/active-company-relationship',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'x-company-context-id': 'company-b',
        }),
      }),
    );
  });

  it('validates blank creation and search without sending a mutation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })),
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

    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Client display name is required.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(
      screen.getByText('Enter a Client name to search.'),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects revoked Workspace access through the shell interface', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    const rejectCompany = vi.fn();
    const rejectWorkspace = vi.fn();

    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={rejectCompany}
        onWorkspaceAccessRejected={rejectWorkspace}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to manage Clients.',
    );
    expect(rejectWorkspace).toHaveBeenCalledOnce();
    expect(rejectCompany).not.toHaveBeenCalled();
  });

  it('keeps a valid Company context when only the Client resource is forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 403 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              ...actor,
              activeCompany: {
                ...actor.activeCompany,
                clientPermissions: [],
              },
            }),
            { status: 200 },
          ),
        ),
    );
    const rejectCompany = vi.fn();
    const acceptActor = vi.fn();

    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={rejectCompany}
        onActorRevalidated={acceptActor}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to manage Clients.',
    );
    expect(rejectCompany).not.toHaveBeenCalled();
    expect(acceptActor).toHaveBeenCalledWith(
      expect.objectContaining({
        activeCompany: expect.objectContaining({
          id: 'company-a',
          clientPermissions: [],
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not publish a late Client list from a previous Company', async () => {
    const oldList = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockReturnValueOnce(oldList.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-b',
                displayName: 'BIC Client',
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const identity = deterministicBrowserIdentity();
    const { rerender } = render(
      <ClientWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender(
      <ClientWorkspace
        actor={{
          ...actor,
          activeCompany: { id: 'company-b', displayName: 'BIC' },
        }}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText('BIC Client')).toBeInTheDocument();

    await act(async () => {
      oldList.resolve(
        new Response(
          JSON.stringify([
            {
              id: 'client-a',
              displayName: 'Stale PRISMA Client',
              relatedToActiveCompany: true,
            },
          ]),
          { status: 200 },
        ),
      );
      await oldList.promise;
    });
    expect(screen.queryByText('Stale PRISMA Client')).not.toBeInTheDocument();
  });

  it('aborts and suppresses a late registration after active Company replacement', async () => {
    const staleRegistration = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockReturnValueOnce(staleRegistration.promise)
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        ),
    );
    const identity = deterministicBrowserIdentity();
    const refreshActivity = vi.fn(async () => undefined);
    const { rerender } = render(
      <ClientWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Stale Registration' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const registrationSignal = vi.mocked(fetch).mock.calls[1]?.[1]?.signal;

    rerender(
      <ClientWorkspace
        actor={{
          ...actor,
          activeCompany: { id: 'company-b', displayName: 'BIC' },
        }}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={refreshActivity}
      />,
    );
    expect(await screen.findByText('No Clients for BIC yet.')).toBeVisible();
    expect(registrationSignal?.aborted).toBe(true);

    await act(async () => {
      staleRegistration.resolve(
        new Response(
          JSON.stringify({
            id: 'stale-client',
            displayName: 'Stale Registration',
            relatedToActiveCompany: true,
          }),
          { status: 201 },
        ),
      );
      await staleRegistration.promise;
    });
    expect(screen.queryByText('Stale Registration')).not.toBeInTheDocument();
    expect(refreshActivity).not.toHaveBeenCalled();
  });

  it('preserves a pending mutation across callback-only shell updates', async () => {
    const registration = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockReturnValueOnce(registration.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-stable',
                displayName: 'Stable Client',
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const identity = deterministicBrowserIdentity();
    const { rerender } = render(
      <ClientWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Stable Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const registrationSignal = vi.mocked(fetch).mock.calls[1]?.[1]?.signal;

    rerender(
      <ClientWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );
    expect(registrationSignal?.aborted).toBe(false);

    registration.resolve(
      new Response(
        JSON.stringify({
          id: 'client-stable',
          displayName: 'Stable Client',
          relatedToActiveCompany: true,
        }),
        { status: 201 },
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'Stable Client' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('settles initial loading as retryable error when identity token resolution fails', async () => {
    const identity = {
      ...deterministicBrowserIdentity(),
      getToken: vi.fn(async () => {
        throw new Error('token unavailable');
      }),
    };
    vi.stubGlobal('fetch', vi.fn());

    render(
      <ClientWorkspace
        actor={actor}
        identity={identity}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading Clients…');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not load Clients. Please try again.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reuses the registration command key after a retryable failure and refreshes activity after success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'client-retry',
              displayName: 'Retry Client',
              relatedToActiveCompany: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-retry',
                displayName: 'Retry Client',
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const refreshActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: 'Retry Client' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Create Client' }));
    await screen.findByRole('heading', { name: 'Retry Client' });

    const firstHeaders = vi.mocked(fetch).mock.calls[1]?.[1]?.headers;
    const retryHeaders = vi.mocked(fetch).mock.calls[2]?.[1]?.headers;
    expect(firstHeaders).toMatchObject({
      'idempotency-key': expect.any(String),
    });
    expect(retryHeaders).toMatchObject({
      'idempotency-key': (firstHeaders as Record<string, string>)[
        'idempotency-key'
      ],
    });
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('keeps attachment ownership separate from search and refreshes activity on completion', async () => {
    const attachment = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify([]), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-pending',
                displayName: 'Pending Client',
                relatedToActiveCompany: false,
              },
            ]),
            { status: 200 },
          ),
        )
        .mockReturnValueOnce(attachment.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify([
              {
                id: 'client-pending',
                displayName: 'Pending Client',
                relatedToActiveCompany: true,
              },
            ]),
            { status: 200 },
          ),
        ),
    );
    const refreshActivity = vi.fn(async () => undefined);
    render(
      <ClientWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onCompanyContextRejected={vi.fn()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByText('No Clients for PRISMA-PRIM yet.');
    fireEvent.change(screen.getByLabelText('Find a shared Client'), {
      target: { value: 'Pending' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search Clients' }));
    await screen.findByRole('heading', { name: 'Pending Client' });
    fireEvent.click(screen.getByRole('button', { name: 'Add to PRISMA-PRIM' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

    const attachSignal = vi.mocked(fetch).mock.calls[2]?.[1]?.signal;
    expect(
      screen.getByRole('button', { name: 'Search Clients' }),
    ).toBeDisabled();
    expect(attachSignal?.aborted).toBe(false);

    attachment.resolve(
      new Response(
        JSON.stringify({
          id: 'client-pending',
          displayName: 'Pending Client',
          relatedToActiveCompany: true,
        }),
        { status: 200 },
      ),
    );
    expect(
      await screen.findByText('Available in PRISMA-PRIM'),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(refreshActivity).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
