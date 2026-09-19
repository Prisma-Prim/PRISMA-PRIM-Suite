import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import { ApplicationRoot } from './ApplicationRoot';

describe('ApplicationRoot', () => {
  beforeEach(() => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) =>
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
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('shows the public welcome at the root without requesting protected data', () => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Make every decision traceable.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Continue to sign in' }),
    ).toHaveAttribute('href', '/sign-in');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a server-rejected root session to the public welcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Make every decision traceable.',
      }),
    ).toBeInTheDocument();
  });

  it('renders the protected production shell with local identity', async () => {
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Hello, Ada Ionescu.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Ada Ionescu')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('PRISMA Workspace')).toHaveLength(4);
  });
});
