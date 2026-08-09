import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            displayName: 'Ada Ionescu',
            email: 'ada@example.test',
            workspaceName: 'PRISMA Workspace',
          }),
          { status: 200 },
        ),
      ),
    );
  });

  afterEach(() => {
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
