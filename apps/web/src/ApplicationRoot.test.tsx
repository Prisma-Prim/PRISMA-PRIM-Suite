import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import { ApplicationRoot } from './ApplicationRoot';

describe('ApplicationRoot', () => {
  beforeEach(() => {
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

  it('renders the protected production shell with local identity', async () => {
    render(
      <ApplicationRoot
        pathname="/"
        identity={deterministicBrowserIdentity()}
      />,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Welcome to PRISMA-PRIM Suite',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByText('Ada Ionescu')).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getAllByText('PRISMA Workspace')).toHaveLength(2);
  });
});
