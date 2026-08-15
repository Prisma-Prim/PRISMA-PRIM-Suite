import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

describe('App', () => {
  beforeEach(() => {
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
});
