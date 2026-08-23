import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { CompanyContextAccess } from './CompanyContextAccess';

describe('CompanyContextAccess', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('grants and revokes access through the canonical endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'assignment-1',
            workspaceMembershipId: 'member-1',
            companyId: 'company-1',
            bundle: 'Company Context Access',
            active: true,
          }),
          { status: 201 },
        ),
      ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-context-assignments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'idempotency-key': expect.any(String),
          }),
        }),
      ),
    );
    const grantKey = new Headers(
      vi.mocked(fetch).mock.calls[0]?.[1]?.headers,
    ).get('idempotency-key');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-context-assignments/member-1/company-1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'idempotency-key': expect.any(String),
          }),
        }),
      ),
    );
    const revokeKey = new Headers(
      vi.mocked(fetch).mock.calls[1]?.[1]?.headers,
    ).get('idempotency-key');
    expect(grantKey).toBeTruthy();
    expect(revokeKey).toBeTruthy();
    expect(revokeKey).not.toBe(grantKey);
  });

  it('grants and revokes the fixed Company Director Client Access bundle', async () => {
    const refreshActivity = vi.fn(async () => undefined);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: 'member-1',
              companyId: 'company-1',
              bundle: 'Company Director Client Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: 'member-1',
              companyId: 'company-1',
              bundle: 'Company Director Client Access',
              active: false,
            }),
            { status: 200 },
          ),
        ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
        onActivityRecorded={refreshActivity}
      />,
    );
    fireEvent.change(screen.getByLabelText('Access bundle'), {
      target: { value: 'director-client' },
    });
    fillAssignment();

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-director-client-assignments',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    await waitFor(() => expect(refreshActivity).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-director-client-assignments/member-1/company-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(refreshActivity).toHaveBeenCalledTimes(2));
  });

  it.each([
    {
      submission: 'grant',
      buttonName: 'Grant access',
      assignmentStatus: 201,
      permissions: ['client.read', 'client.create', 'client.update'],
    },
    {
      submission: 'revoke',
      buttonName: 'Revoke access',
      assignmentStatus: 200,
      permissions: [],
    },
  ] as const)(
    'revalidates the active actor after a self-$submission',
    async ({ buttonName, assignmentStatus, permissions }) => {
      const revalidatedActor: ActorContext = {
        ...ownerActor,
        activeCompany: {
          id: 'company-1',
          displayName: 'PRISMA-PRIM',
          clientPermissions: [...permissions],
        },
      };
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                id: 'self-assignment',
                workspaceMembershipId: ownerActor.workspaceMembershipId,
                companyId: 'company-1',
                bundle: 'Company Director Client Access',
                active: assignmentStatus === 201,
              }),
              { status: assignmentStatus },
            ),
          )
          .mockResolvedValueOnce(
            new Response(JSON.stringify(revalidatedActor), { status: 200 }),
          ),
      );
      const acceptActor = vi.fn(async () => undefined);
      const refreshActivity = vi.fn(async () => undefined);
      render(
        <CompanyContextAccess
          actor={{
            ...ownerActor,
            activeCompany: {
              id: 'company-1',
              displayName: 'PRISMA-PRIM',
              clientPermissions:
                assignmentStatus === 201
                  ? []
                  : ['client.read', 'client.create', 'client.update'],
            },
          }}
          identity={deterministicBrowserIdentity()}
          onActorRevalidated={acceptActor}
          onActivityRecorded={refreshActivity}
        />,
      );
      fireEvent.change(screen.getByLabelText('Access bundle'), {
        target: { value: 'director-client' },
      });
      fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
        target: { value: ownerActor.workspaceMembershipId },
      });
      fireEvent.change(screen.getByLabelText('Company ID'), {
        target: { value: 'company-1' },
      });

      fireEvent.click(screen.getByRole('button', { name: buttonName }));

      await waitFor(() =>
        expect(fetch).toHaveBeenNthCalledWith(
          2,
          '/api/access/current-actor',
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-company-context-id': 'company-1',
            }),
          }),
        ),
      );
      expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);
      expect(refreshActivity).toHaveBeenCalledOnce();
    },
  );

  it('revalidates a self-assignment submitted with uppercase UUIDs', async () => {
    const workspaceMembershipId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const companyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const actor: ActorContext = {
      ...ownerActor,
      workspaceMembershipId,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: [],
      },
    };
    const revalidatedActor: ActorContext = {
      ...actor,
      activeCompany: {
        id: companyId,
        displayName: 'PRISMA-PRIM',
        clientPermissions: ['client.read', 'client.create', 'client.update'],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'self-assignment',
              workspaceMembershipId,
              companyId,
              bundle: 'Company Director Client Access',
              active: true,
            }),
            { status: 201 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        ),
    );
    const acceptActor = vi.fn(async () => undefined);
    render(
      <CompanyContextAccess
        actor={actor}
        identity={deterministicBrowserIdentity()}
        onActorRevalidated={acceptActor}
      />,
    );
    fireEvent.change(screen.getByLabelText('Access bundle'), {
      target: { value: 'director-client' },
    });
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: workspaceMembershipId.toUpperCase() },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: companyId.toUpperCase() },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);
  });

  it('grants access through native keyboard form submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'assignment-1',
            workspaceMembershipId: 'member-1',
            companyId: 'company-1',
            bundle: 'Company Context Access',
            active: true,
          }),
          { status: 201 },
        ),
      ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fillAssignment();

    fireEvent.submit(
      screen.getByRole('button', { name: 'Grant access' }).closest('form')!,
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/company-context-assignments',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByText('Access granted.')).toBeInTheDocument();
  });

  it('recovers when authentication fails before the request is created', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'assignment-1',
            workspaceMembershipId: 'member-1',
            companyId: 'company-1',
            bundle: 'Company Context Access',
            active: true,
          }),
          { status: 201 },
        ),
      ),
    );
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error('token unavailable'))
      .mockResolvedValue('verified-session-token');
    const identity = { ...deterministicBrowserIdentity(), getToken };

    render(<CompanyContextAccess actor={ownerActor} identity={identity} />);
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: 'company-1' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted.');
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reuses the idempotency key when the same command is retried after a lost response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('response lost'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'assignment-1',
              workspaceMembershipId: 'member-1',
              companyId: 'company-1',
              bundle: 'Company Context Access',
              active: true,
            }),
            { status: 201 },
          ),
        ),
    );
    render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: '  member-1  ' },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: ' company-1 ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
      target: { value: 'member-1' },
    });
    fireEvent.change(screen.getByLabelText('Company ID'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await screen.findByText('Access granted.');

    const keys = vi
      .mocked(fetch)
      .mock.calls.map((call) =>
        new Headers(call[1]?.headers).get('idempotency-key'),
      );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('does not send a grant after the identity changes while authentication is pending', async () => {
    const token = deferred<string | null>();
    const oldIdentity = {
      ...deterministicBrowserIdentity(),
      getToken: vi.fn(() => token.promise),
    };
    const newIdentity = deterministicBrowserIdentity({
      'x-test-identity': 'new',
    });
    vi.stubGlobal('fetch', vi.fn());

    const { rerender } = render(
      <CompanyContextAccess actor={ownerActor} identity={oldIdentity} />,
    );
    fillAssignment();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeDisabled();

    rerender(
      <CompanyContextAccess actor={ownerActor} identity={newIdentity} />,
    );
    expect(screen.getByRole('button', { name: 'Grant access' })).toBeEnabled();
    await act(async () => {
      token.resolve('old-session-token');
      await token.promise;
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('Access granted.')).not.toBeInTheDocument();
  });

  it.each([
    ['grant', 'Grant access'],
    ['revoke', 'Revoke access'],
  ] as const)(
    'aborts an in-flight %s when the actor changes',
    async (_, buttonName) => {
      let requestSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
          requestSignal = init?.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            requestSignal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          });
        }),
      );
      const { rerender } = render(
        <CompanyContextAccess
          actor={ownerActor}
          identity={deterministicBrowserIdentity()}
        />,
      );
      fillAssignment();
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

      rerender(
        <CompanyContextAccess
          actor={{ ...ownerActor, internalUserId: 'replacement-owner' }}
          identity={deterministicBrowserIdentity()}
        />,
      );

      expect(requestSignal?.aborted).toBe(true);
      expect(screen.getByRole('button', { name: buttonName })).toBeEnabled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    },
  );

  it('keeps a Workspace-scoped revocation alive while the active Company is restored', async () => {
    const response = deferred<Response>();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return response.promise;
      }),
    );
    const identity = deterministicBrowserIdentity();
    const { rerender } = render(
      <CompanyContextAccess actor={ownerActor} identity={identity} />,
    );
    fireEvent.change(screen.getByLabelText('Access bundle'), {
      target: { value: 'director-client' },
    });
    fillAssignment();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    rerender(
      <CompanyContextAccess
        actor={{
          ...ownerActor,
          activeCompany: { id: 'company-2', displayName: 'BIC' },
        }}
        identity={identity}
      />,
    );
    await act(async () => {
      response.resolve(
        new Response(
          JSON.stringify({
            workspaceMembershipId: 'member-1',
            companyId: 'company-1',
            bundle: 'Company Director Client Access',
            active: false,
          }),
          { status: 200 },
        ),
      );
      await response.promise;
    });

    expect(requestSignal?.aborted).toBe(false);
    expect(await screen.findByText('Access revoked.')).toBeInTheDocument();
  });

  it('aborts an in-flight mutation when unmounted', async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    );
    const { unmount } = render(
      <CompanyContextAccess
        actor={ownerActor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    fillAssignment();
    fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });
});

function fillAssignment() {
  fireEvent.change(screen.getByLabelText('Workspace membership ID'), {
    target: { value: 'member-1' },
  });
  fireEvent.change(screen.getByLabelText('Company ID'), {
    target: { value: 'company-1' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const ownerActor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'owner-membership',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['company.manage', 'company.assignment.manage'],
};
