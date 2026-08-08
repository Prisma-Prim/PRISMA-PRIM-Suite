import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

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
    render(<App />);

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
    render(<App />);

    await screen.findByRole('banner');
    expect(fetch).toHaveBeenCalledWith(
      '/api/access/current-actor',
      expect.objectContaining({ headers: undefined }),
    );
  });

  it('fails closed before requesting access when local-demo identity is incomplete', async () => {
    vi.stubEnv('MODE', 'local-demo');
    vi.stubEnv('VITE_ACCESS_IDENTITY_MODE', 'local-demo');
    vi.stubEnv('VITE_DEMO_EXTERNAL_PROVIDER', 'local-demo');
    vi.stubEnv('VITE_DEMO_EXTERNAL_SUBJECT', '');
    vi.stubEnv('VITE_DEMO_DISPLAY_NAME', 'Local demonstration user');
    vi.stubEnv('VITE_DEMO_EMAIL', 'local-demo@example.test');

    render(<App />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not verify your access. Please try again.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
