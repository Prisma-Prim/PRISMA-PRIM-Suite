import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { createProductionShellSession } from './production-shell-session';
import { baseActor } from './production-shell-context.test-fixtures';
import { createAuthenticatedProductionShellTransport } from './authenticated-production-shell-transport';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('rejects an unreadable Company list rather than promising visible choices', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ companies: [] })),
  );
  const transport = await createAuthenticatedProductionShellTransport(
    deterministicBrowserIdentity(),
  );
  expect(
    await transport.loadCompanies({ signal: new AbortController().signal }),
  ).toEqual({ status: 'error' });
});

it.each([
  null,
  [null],
  [{ id: '', displayName: 'Provider' }],
  [{ id: 'company-a', displayName: 42 }],
  [{ id: 'company-a', displayName: '' }],
  [{ id: 'company-a', displayName: 'Provider' }, null],
  [
    { id: 'company-a', displayName: 'Provider' },
    { id: 'company-a', displayName: 'Duplicate' },
  ],
])('rejects the entire unreadable Company list %j', async (value) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(value)),
  );
  const transport = await createAuthenticatedProductionShellTransport(
    deterministicBrowserIdentity(),
  );
  expect(
    await transport.loadCompanies({ signal: new AbortController().signal }),
  ).toEqual({ status: 'error' });
});

it.each([
  { value: [], expected: [] },
  {
    value: [{ id: 'company-a', displayName: 'Provider', future: true }],
    expected: [{ id: 'company-a', displayName: 'Provider' }],
  },
])(
  'accepts empty and additive minimal visible Company projections %j',
  async ({ value, expected }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(value)),
    );
    const transport = await createAuthenticatedProductionShellTransport(
      deterministicBrowserIdentity(),
    );
    expect(
      await transport.loadCompanies({ signal: new AbortController().signal }),
    ).toEqual({ status: 'ok', value: expected });
  },
);

it.each([
  { http: 401, status: 'unauthorized' },
  { http: 403, status: 'forbidden' },
  { http: 404, status: 'notFound' },
  { http: 500, status: 'error' },
])(
  'preserves HTTP $http without trying to decode a Company list',
  async ({ http, status }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status: http })),
    );
    const transport = await createAuthenticatedProductionShellTransport(
      deterministicBrowserIdentity(),
    );
    expect(
      await transport.loadCompanies({ signal: new AbortController().signal }),
    ).toEqual({ status });
  },
);

it('keeps a malformed singleton out of the real initial Company selector and never selects its unproved identity', async () => {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const path = new URL(input.toString(), 'http://localhost').pathname;
      if (path === '/api/access/current-actor') return Response.json(baseActor);
      if (path === '/api/companies')
        return Response.json([{ id: 'company-a', displayName: null }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      throw new Error(`Unexpected request: ${path}`);
    },
  );
  vi.stubGlobal('fetch', fetcher);
  const identity = deterministicBrowserIdentity();
  const session = createProductionShellSession({
    createTransport: () =>
      createAuthenticatedProductionShellTransport(identity),
    rejectSession: identity.rejectSession,
    shouldInitialize: true,
  });
  const unsubscribe = session.subscribe(() => undefined);
  try {
    await vi.waitFor(() =>
      expect(session.getSnapshot().shellContext).toMatchObject({
        status: 'active',
        companyContext: { status: 'error' },
      }),
    );
    expect(
      fetcher.mock.calls.some(([, init]) =>
        new Headers(init?.headers).has('x-company-context-id'),
      ),
    ).toBe(false);
  } finally {
    unsubscribe();
  }
});
