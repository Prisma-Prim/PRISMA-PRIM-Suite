import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { CompanyContextAccess } from './CompanyContextAccess';

const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerMembershipId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const companyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const administration = (bundle?: 'context' | 'director') => ({
  members: [
    {
      workspaceMembershipId: memberId,
      displayName: 'Ada Member',
      email: 'ada@example.test',
    },
    {
      workspaceMembershipId: ownerMembershipId,
      displayName: 'Workspace Owner',
      email: 'owner@example.test',
    },
  ],
  companies: [{ id: companyId, displayName: 'PRISMA-PRIM' }],
  assignments: bundle
    ? [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          workspaceMembershipId: memberId,
          companyId,
          bundle:
            bundle === 'director'
              ? 'Company Director Client Access'
              : 'Company Context Access',
          active: true,
        },
      ]
    : [],
});

describe('CompanyContextAccess', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads only human-readable member and Company choices without UUID entry fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(administration()), { status: 200 }),
      ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(await screen.findByLabelText('Workspace member')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Ada Member — ada@example.test' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'PRISMA-PRIM' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Workspace membership ID'),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Company ID')).not.toBeInTheDocument();

    chooseTargets();
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Not granted',
    );
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Revoke access' })).toBeDisabled();
  });

  it('grants Company Context Access and reloads the canonical server state before reporting success', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/company-context-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ workspaceMembershipId: memberId, companyId }),
        headers: expect.objectContaining({
          'idempotency-key': expect.any(String),
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/company-context-assignments/administration',
      expect.any(Object),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
    expect(
      screen.getByText('Access granted. Server state refreshed.'),
    ).toBeInTheDocument();
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('revokes Company Director Client Access and reloads the canonical server state', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('director')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Director Client Access',
              active: false,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.change(screen.getByLabelText('Access bundle'), {
      target: { value: 'director-client' },
    });
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Granted',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `/api/company-director-client-assignments/${memberId}/${companyId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(await screen.findByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Not granted',
    );
    expect(
      screen.getByText('Access revoked. Server state refreshed.'),
    ).toBeInTheDocument();
    expect(refreshActivity).toHaveBeenCalledOnce();
  });

  it('reloads state after a stale command denial instead of keeping the previous assignment state', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ message: 'Forbidden', statusCode: 403 }),
            { status: 403 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The access state could not be loaded or changed.',
    );
    expect(screen.getByText(/Current server state:/)).toHaveTextContent(
      'Current server state: Not granted',
    );
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
  });

  it('reuses the same idempotency key when a failed grant is retried and the server still reports it absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration()), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: memberId,
              companyId,
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(administration('context')), {
            status: 200,
          }),
        ),
    );

    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    await screen.findByLabelText('Workspace member');
    chooseTargets();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted. Server state refreshed.');

    const firstKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    const retryKey = new Headers(
      vi.mocked(fetch).mock.calls[3]?.[1]?.headers,
    ).get('idempotency-key');
    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);
  });

  it('revalidates the active actor after a self Company Director Client assignment', async () => {
    const selfActor: ActorContext = {
      ...ownerActor,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: [],
      },
    };
    const revalidatedActor: ActorContext = {
      ...selfActor,
      activeCompany: {
        ...selfActor.activeCompany!,
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    const state = {
      ...administration(),
      members: [
        {
          workspaceMembershipId: ownerMembershipId,
          displayName: 'Workspace Owner',
          email: 'owner@example.test',
        },
      ],
    };
    const grantedState = {
      ...state,
      assignments: [
        {
          id: 'assignment-1',
          workspaceMembershipId: ownerMembershipId,
          companyId,
          bundle: 'Company Director Client Access',
          active: true,
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(state), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: ownerMembershipId,
              companyId,
              bundle: 'Company Director Client Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(grantedState), { status: 200 }),
        ),
    );
    const acceptActor = vi.fn(async () => undefined);

    render(
      <CompanyContextAccess
        actor={selfActor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={acceptActor}
      />,
    );
    await screen.findByLabelText('Workspace member');
    fireEvent.change(screen.getByLabelText('Workspace member'), {
      target: { value: ownerMembershipId },
    });
    fireEvent.change(screen.getByLabelText('Company'), {
      target: { value: companyId },
    });
    fireEvent.change(screen.getByLabelText('Access bundle'), {
      target: { value: 'director-client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/access/current-actor',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-company-context-id': companyId,
        }),
      }),
    );
    expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);
  });

  it('rejects the session when the administration read is unauthorized', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Unauthorized', statusCode: 401 }),
          { status: 401 },
        ),
      ),
    );
    const rejectSession = vi.fn(async () => undefined);
    const identity = { ...deterministicBrowserIdentity(), rejectSession };

    render(<CompanyContextAccess actor={ownerActor} identity={identity} />);

    await waitFor(() => expect(rejectSession).toHaveBeenCalledOnce());
  });

  it('does not publish a stale administration read after identity replacement', async () => {
    const firstResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(() => firstResponse.promise)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              members: [
                {
                  workspaceMembershipId: memberId,
                  displayName: 'New Session Member',
                  email: 'new@example.test',
                },
              ],
              companies: [{ id: companyId, displayName: 'New Company' }],
              assignments: [],
            }),
            { status: 200 },
          ),
        ),
    );
    const firstIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'first',
    });
    const secondIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'second',
    });
    const { rerender } = render(
      <CompanyContextAccess actor={ownerActor} identity={firstIdentity} />,
    );

    rerender(
      <CompanyContextAccess actor={ownerActor} identity={secondIdentity} />,
    );
    expect(
      await screen.findByText('New Session Member — new@example.test'),
    ).toBeInTheDocument();

    await act(async () => {
      firstResponse.resolve(
        new Response(
          JSON.stringify({
            members: [
              {
                workspaceMembershipId: memberId,
                displayName: 'Stale Member',
                email: 'stale@example.test',
              },
            ],
            companies: [{ id: companyId, displayName: 'Stale Company' }],
            assignments: [],
          }),
          { status: 200 },
        ),
      );
      await firstResponse.promise;
    });

    expect(
      screen.queryByText('Stale Member — stale@example.test'),
    ).not.toBeInTheDocument();
  });
});

function chooseTargets() {
  fireEvent.change(screen.getByLabelText('Workspace member'), {
    target: { value: memberId },
  });
  fireEvent.change(screen.getByLabelText('Company'), {
    target: { value: companyId },
  });
}

const ownerActor: ActorContext = {
  internalUserId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  workspaceMembershipId: ownerMembershipId,
  workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Workspace Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: [
    'company.manage',
    'company.assignment.manage',
    'client.manage',
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
