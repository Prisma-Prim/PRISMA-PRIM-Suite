import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from './access-composition';
import { ApplicationRoot } from './ApplicationRoot';

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it('clears the prior Workspace selection when the server rejects the session', async () => {
  sessionStorage.setItem(
    'prisma-workspace-context',
    'aaaaaaaa-0000-4000-8000-000000000163',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 })),
  );
  render(
    <ApplicationRoot pathname="/" identity={deterministicBrowserIdentity()} />,
  );
  expect(
    await screen.findByRole('heading', {
      name: 'Make every decision traceable.',
    }),
  ).toBeInTheDocument();
  expect(sessionStorage.getItem('prisma-workspace-context')).toBeNull();
});
