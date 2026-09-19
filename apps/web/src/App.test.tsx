import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import { companyContextAccessCopy } from './access/company-context-access.copy';
import { workspaceMembershipSuspensionCopy } from './access/workspace-membership-suspension.copy';

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/?frame=classic');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = input.toString();
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.endsWith('/companies')
                ? []
                : url.endsWith('/activity-log')
                  ? {
                      events: [
                        {
                          id: 'event-1',
                          action: 'internal_user.provisioned',
                          occurredAt: '2026-08-15T09:00:00.000Z',
                          actor: {
                            internalUserId: 'user-1',
                            displayName: 'Ada Ionescu',
                          },
                          target: {
                            type: 'internal_user',
                            internalUserId: 'user-1',
                            displayName: 'Ada Ionescu',
                          },
                          metadata: {
                            identityProvider: 'deterministic-test',
                          },
                        },
                      ],
                    }
                  : {
                      displayName: 'Ada Ionescu',
                      email: 'ada@example.test',
                      workspaceName: 'PRISMA Workspace',
                      workspacePermissions: ['company.manage'],
                    },
            ),
            { status: 200 },
          ),
        );
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    window.history.replaceState(null, '', '/');
  });

  it('renders the production application shell', async () => {
    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to PRISMA-PRIM Suite',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).toBeInTheDocument();
  });

  it('exposes Clients to a Company Director without Workspace Client access', async () => {
    vi.mocked(fetch).mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const body = url.endsWith('/access/current-actor')
          ? {
              internalUserId: 'director-1',
              workspaceMembershipId: 'membership-1',
              workspaceId: 'workspace-1',
              workspaceName: 'PRISMA Workspace',
              displayName: 'Company Director',
              email: 'director@example.test',
              active: true,
              workspacePermissions: [],
              activeCompany: {
                id: 'company-1',
                displayName: 'PRISMA-PRIM',
                clientPermissions: [
                  'client.read',
                  'client.create',
                  'client.update',
                ],
              },
            }
          : url.endsWith('/activity-log')
            ? { events: [] }
            : [];
        if (url.endsWith('/clients')) {
          expect(init?.headers).toMatchObject({
            'x-company-context-id': 'company-1',
          });
        }
        return Promise.resolve(
          new Response(JSON.stringify(body), { status: 200 }),
        );
      },
    );

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByRole('region', { name: 'Clients' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Clients' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create Client' }),
    ).toBeInTheDocument();
  });

  it('renders the shell when Company preference storage is unavailable', async () => {
    const identity = deterministicBrowserIdentity();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    render(<App identity={identity} />);

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Company context' }),
    ).toBeInTheDocument();
  });

  it('shows the current Workspace Activity Log in canonical language', async () => {
    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByRole('heading', { name: 'Activity Log' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Ionescu was provisioned')).toBeInTheDocument();
    expect(screen.getByText('Target: Ada Ionescu')).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-08-15T09:00:00.000Z',
    );
  });

  it('renders a canonical Company registration Activity Log event', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            input.toString().endsWith('/companies')
              ? []
              : input.toString().endsWith('/activity-log')
                ? {
                    events: [
                      {
                        id: 'event-company',
                        action: 'company.registered',
                        occurredAt: '2026-08-15T10:30:00.000Z',
                        actor: {
                          internalUserId: 'user-1',
                          displayName: 'Ada Ionescu',
                        },
                        target: {
                          type: 'company',
                          companyId: 'company-1',
                          displayName: 'North Star Consulting',
                        },
                        metadata: {},
                      },
                    ],
                  }
                : {
                    internalUserId: 'user-1',
                    displayName: 'Ada Ionescu',
                    email: 'ada@example.test',
                    workspaceName: 'PRISMA Workspace',
                    workspacePermissions: ['company.manage'],
                  },
          ),
          { status: 200 },
        ),
      ),
    );

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText('Ada Ionescu registered a Company'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Target: North Star Consulting'),
    ).toBeInTheDocument();
  });

  it.each([
    ['company_context_assignment.granted', 'granted Company Context Access'],
    ['company_context_assignment.revoked', 'revoked Company Context Access'],
  ] as const)(
    'renders the localized %s Activity Log label',
    async (action, label) => {
      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.toString().endsWith('/companies')
                ? []
                : input.toString().endsWith('/activity-log')
                  ? {
                      events: [
                        {
                          id: `event-${action}`,
                          action,
                          occurredAt: '2026-08-15T10:30:00.000Z',
                          actor: {
                            internalUserId: 'owner-1',
                            displayName: 'Workspace Owner',
                          },
                          target: {
                            type: 'company_role_assignment',
                            assignmentId: 'assignment-1',
                            internalUserId: 'member-1',
                            internalUserDisplayName: 'Workspace Member',
                            workspaceMembershipId: 'membership-1',
                            companyId: 'company-1',
                            companyDisplayName: 'North Star Consulting',
                          },
                          metadata: { bundle: 'Company Context Access' },
                        },
                      ],
                    }
                  : {
                      internalUserId: 'owner-1',
                      displayName: 'Workspace Owner',
                      email: 'owner@example.test',
                      workspaceName: 'PRISMA Workspace',
                      workspacePermissions: ['company.manage'],
                    },
            ),
            { status: 200 },
          ),
        ),
      );

      render(<App identity={deterministicBrowserIdentity()} />);

      expect(
        await screen.findByText(`Workspace Owner ${label}`),
      ).toBeInTheDocument();
    },
  );

  it.each([
    [
      'client.created',
      'created a Client',
      {
        type: 'client_account',
        clientAccountId: 'client-1',
        displayName: 'Exemplu Client SRL',
      },
      'Target: Exemplu Client SRL',
    ],
    [
      'client_company_relationship.established',
      'linked a Client to a Company',
      {
        type: 'client_company_relationship',
        relationshipId: 'relationship-1',
        clientAccountId: 'client-1',
        clientDisplayName: 'Exemplu Client SRL',
        companyId: 'company-1',
        companyDisplayName: 'BIC',
      },
      'Target: Exemplu Client SRL — BIC',
    ],
  ] as const)(
    'renders the canonical %s Activity Log event',
    async (action, label, target, targetLabel) => {
      vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              input.toString().endsWith('/companies')
                ? []
                : input.toString().endsWith('/activity-log')
                  ? {
                      events: [
                        {
                          id: `event-${action}`,
                          action,
                          occurredAt: '2026-08-22T12:00:00.000Z',
                          actor: {
                            internalUserId: 'owner-1',
                            displayName: 'Workspace Owner',
                          },
                          target,
                          metadata: {},
                        },
                      ],
                    }
                  : {
                      internalUserId: 'owner-1',
                      displayName: 'Workspace Owner',
                      email: 'owner@example.test',
                      workspaceName: 'PRISMA Workspace',
                      workspacePermissions: ['company.manage'],
                    },
            ),
            { status: 200 },
          ),
        ),
      );

      render(<App identity={deterministicBrowserIdentity()} />);

      expect(
        await screen.findByText(`Workspace Owner ${label}`),
      ).toBeInTheDocument();
      expect(screen.getByText(targetLabel)).toBeInTheDocument();
    },
  );

  it('shows the responsible Company on a Client correction event', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            input.toString().endsWith('/companies')
              ? []
              : input.toString().endsWith('/activity-log')
                ? {
                    events: [
                      {
                        id: 'event-client-corrected',
                        action: 'client.corrected',
                        occurredAt: '2026-08-22T12:00:00.000Z',
                        actor: {
                          internalUserId: 'director-1',
                          displayName: 'Company Director',
                        },
                        target: {
                          type: 'client_account',
                          clientAccountId: 'client-1',
                          displayName: 'Exemplu Client SRL',
                          companyId: 'company-1',
                          companyDisplayName: 'BIC',
                        },
                        metadata: {
                          changes: {
                            telephone: {
                              before: null,
                              after: '+373 60 000 000',
                            },
                          },
                        },
                      },
                    ],
                  }
                : {
                    internalUserId: 'owner-1',
                    displayName: 'Workspace Owner',
                    email: 'owner@example.test',
                    workspaceName: 'PRISMA Workspace',
                    workspacePermissions: ['company.manage'],
                  },
          ),
          { status: 200 },
        ),
      ),
    );

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText('Company Director corrected a Client dossier'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Target: Exemplu Client SRL — BIC'),
    ).toBeInTheDocument();
  });

  it('keeps access-administration Activity Log labels in copy resources', () => {
    expect(companyContextAccessCopy.activityActionLabels).toEqual({
      'company_task_manager_assignment.granted': 'granted Company Task Manager',
      'company_task_manager_assignment.revoked': 'revoked Company Task Manager',
      'company_document_project_organizer_assignment.granted':
        'granted Company Document Project Organizer',
      'company_document_project_organizer_assignment.revoked':
        'revoked Company Document Project Organizer',
      'company_document_registrar_assignment.granted':
        'granted Company Document Registrar',
      'company_document_registrar_assignment.revoked':
        'revoked Company Document Registrar',
      'company_project_assignment.granted': 'granted Company Project Access',
      'company_project_assignment.revoked': 'revoked Company Project Access',
      'company_context_assignment.granted': 'granted Company Context Access',
      'company_context_assignment.revoked': 'revoked Company Context Access',
      'company_director_client_assignment.granted':
        'granted Company Director Client Access',
      'company_director_client_assignment.revoked':
        'revoked Company Director Client Access',
    });
    expect(workspaceMembershipSuspensionCopy.activityActionLabels).toEqual({
      'workspace_sessions.revoked': 'revoked existing provider sessions for',
      'workspace_sessions.revocation_retry_required':
        'recorded a required provider-session retry for',
      'workspace_membership.suspended': 'suspended Workspace access for',
    });
  });

  it('shows the Activity Log empty state', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            input.toString().endsWith('/companies')
              ? []
              : input.toString().endsWith('/activity-log')
                ? { events: [] }
                : {
                    displayName: 'Ada Ionescu',
                    email: 'ada@example.test',
                    workspaceName: 'PRISMA Workspace',
                    workspacePermissions: ['company.manage'],
                  },
          ),
          { status: 200 },
        ),
      ),
    );

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText(
        'No activity has been recorded in this workspace yet.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the protected shell visible when Activity Log loading fails', async () => {
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) =>
      input.toString().endsWith('/companies')
        ? Promise.resolve(
            new Response(JSON.stringify([]), {
              status: 200,
            }),
          )
        : input.toString().endsWith('/activity-log')
          ? Promise.reject(new TypeError('network unavailable'))
          : Promise.resolve(
              new Response(
                JSON.stringify({
                  displayName: 'Ada Ionescu',
                  email: 'ada@example.test',
                  workspaceName: 'PRISMA Workspace',
                  workspacePermissions: ['company.manage'],
                }),
                { status: 200 },
              ),
            ),
    );

    render(<App identity={deterministicBrowserIdentity()} />);

    expect(
      await screen.findByText(
        'We could not load the Activity Log. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('does not attach deterministic identity headers in a normal build mode', async () => {
    render(<App identity={deterministicBrowserIdentity()} />);

    await screen.findByRole('banner');
    expect(fetch).toHaveBeenCalledWith(
      '/api/access/current-actor',
      expect.objectContaining({ headers: undefined }),
    );
  });
  it('sends the Clerk session token through the identity composition boundary', async () => {
    const identity = {
      ...deterministicBrowserIdentity(),
      getToken: async () => 'verified-session-token',
    };
    render(<App identity={identity} />);
    await screen.findByRole('banner');
    expect(fetch).toHaveBeenCalledWith(
      '/api/access/current-actor',
      expect.objectContaining({
        headers: { Authorization: 'Bearer verified-session-token' },
      }),
    );
  });

  it('renders no protected content while the identity composition is signed out', () => {
    const identity = { ...deterministicBrowserIdentity(), signedIn: false };
    render(<App identity={identity} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Sign in is required');
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('returns a rejected session to the provider sign-in flow', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 401 }));
    const rejectSession = vi.fn().mockResolvedValue(undefined);
    const identity = { ...deterministicBrowserIdentity(), rejectSession };

    render(<App identity={identity} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sign in is required',
    );
    expect(rejectSession).toHaveBeenCalledOnce();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('records deterministic rejected sessions through the identity boundary', async () => {
    const identity = deterministicBrowserIdentity();

    await identity.rejectSession();

    expect(sessionStorage.getItem('deterministic-auth-state')).toBe(
      'signed-out',
    );
  });

  it('does not expose a late Company registration from a previous Workspace', async () => {
    sessionStorage.clear();
    const oldRegistration = deferred<Response>();
    const newActorResponse = deferred<Response>();
    const oldActor = {
      internalUserId: 'old-user',
      workspaceMembershipId: 'old-membership',
      workspaceId: 'old-workspace',
      workspaceName: 'Old Workspace',
      displayName: 'Old Owner',
      email: 'old@example.test',
      active: true,
      workspacePermissions: ['company.manage'],
    };
    const newActor = {
      internalUserId: 'new-user',
      workspaceMembershipId: 'new-membership',
      workspaceId: 'new-workspace',
      workspaceName: 'New Workspace',
      displayName: 'New Owner',
      email: 'new@example.test',
      active: true,
      workspacePermissions: ['company.manage'],
    };
    const oldCompany = {
      id: 'old-company',
      workspaceId: oldActor.workspaceId,
      displayName: 'Confidential Old Company',
      status: 'active',
      createdAt: '2026-08-15T12:00:00.000Z',
      createdByInternalUserId: oldActor.internalUserId,
    };
    vi.mocked(fetch).mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const workspace = new Headers(init?.headers).get('x-test-workspace');
        if (url.endsWith('/companies') && init?.method === 'POST')
          return oldRegistration.promise;
        if (url.endsWith(`/companies/${oldCompany.id}`))
          return Promise.resolve(jsonResponse(oldCompany));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        if (url.endsWith('/activity-log'))
          return Promise.resolve(jsonResponse({ events: [] }));
        return workspace === 'old'
          ? Promise.resolve(jsonResponse(oldActor))
          : newActorResponse.promise;
      },
    );
    const oldIdentity = deterministicBrowserIdentity({
      'x-test-workspace': 'old',
    });
    const newIdentity = deterministicBrowserIdentity({
      'x-test-workspace': 'new',
    });
    const { rerender } = render(<App identity={oldIdentity} />);
    await screen.findAllByText('Old Workspace');
    fireEvent.change(screen.getByLabelText('Company display name'), {
      target: { value: oldCompany.displayName },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register Company' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/companies',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    rerender(<App identity={newIdentity} />);
    expect(screen.queryByText('Old Workspace')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Company context' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Company display name'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Activity Log' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Verifying your access',
    );
    newActorResponse.resolve(jsonResponse(newActor));
    await screen.findAllByText('New Workspace');
    expect(screen.getByLabelText('Company display name')).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Register Company' }),
    ).toBeEnabled();
    await act(async () => {
      oldRegistration.resolve(jsonResponse(oldCompany));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByText(oldCompany.displayName)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith(
      `/api/companies/${oldCompany.id}`,
      expect.anything(),
    );
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
