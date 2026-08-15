import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { preferenceKey } from './company-context-preference';
import { useProductionShellContext } from './useProductionShellContext';

const baseActor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'membership-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
};
const companies = [
  { id: 'company-a', displayName: 'Company A' },
  { id: 'company-b', displayName: 'Company B' },
];

describe('useProductionShellContext request coordination', () => {
  beforeEach(() => localStorage.clear());

  it('does not let an older selection response overwrite a newer selection', async () => {
    const selections = new Map<string, ReturnType<typeof deferred<Response>>>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId) {
          const response = deferred<Response>();
          selections.set(selectedId, response);
          return response.promise;
        }
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity: BrowserIdentity = {
      loaded: true,
      signedIn: true,
      getToken: async () => 'token',
      rejectSession: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      signedOutView: null,
    };
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    let older!: Promise<void>;
    act(() => {
      older = result.current.selectCompany('company-a');
    });
    await waitFor(() => expect(selections.size).toBe(1));
    let newer!: Promise<void>;
    act(() => {
      newer = result.current.selectCompany('company-b');
    });
    await waitFor(() => expect(selections.size).toBe(2));
    selections
      .get('company-b')!
      .resolve(jsonResponse(selectedActor('company-b', 'Company B')));
    await act(() => newer);
    selections
      .get('company-a')!
      .resolve(jsonResponse(selectedActor('company-a', 'Company A')));
    await act(() => older);

    expect(activeCompanyId(result.current.shellContext)).toBe('company-b');
    expect(localStorage.getItem(preferenceKey(baseActor))).toBe('company-b');
  });

  it('does not let an older Activity response overwrite a newer Company selection', async () => {
    const olderActivity = deferred<Response>();
    let activityRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId) {
          return Promise.resolve(
            jsonResponse(selectedActor(selectedId, 'Company B')),
          );
        }
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        activityRequests += 1;
        return activityRequests === 1
          ? olderActivity.promise
          : Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity: BrowserIdentity = {
      loaded: true,
      signedIn: true,
      getToken: async () => 'token',
      rejectSession: vi.fn().mockResolvedValue(undefined),
      signOut: vi.fn().mockResolvedValue(undefined),
      signedOutView: null,
    };
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() => {
      expect(result.current.shellContext.status).toBe('active');
      expect(activityRequests).toBe(1);
    });

    await act(() => result.current.selectCompany('company-b'));
    olderActivity.resolve(
      jsonResponse({
        events: [
          {
            id: 'old-event',
            action: 'company.registered',
            occurredAt: '2026-08-15T10:00:00.000Z',
            actor: { internalUserId: 'user-1', displayName: 'Ada' },
            target: {
              type: 'company',
              companyId: 'company-a',
              displayName: 'Company A',
            },
            metadata: {},
          },
        ],
      }),
    );
    await act(async () => Promise.resolve());

    expect(activeCompanyId(result.current.shellContext)).toBe('company-b');
    if (result.current.shellContext.status !== 'active')
      throw new Error('Expected active shell context');
    expect(result.current.shellContext.activityLog).toEqual({
      status: 'ready',
      events: [],
    });
  });

  it('ignores a rejection from a Company that is no longer current', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId) {
          const company = companies.find(({ id }) => id === selectedId)!;
          return Promise.resolve(
            jsonResponse(selectedActor(company.id, company.displayName)),
          );
        }
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );
    await act(() => result.current.selectCompany('company-a'));
    const rejectFromCompanyA = result.current.rejectCompanyContext;

    await act(() => result.current.selectCompany('company-b'));
    act(() => rejectFromCompanyA('company-a'));

    expect(activeCompanyId(result.current.shellContext)).toBe('company-b');
  });

  it('adds a newly registered active Company to the visible choices', async () => {
    const initialActivity = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        return initialActivity.promise;
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    act(() =>
      result.current.includeCompany({
        id: 'company-new',
        displayName: 'New Company',
      }),
    );
    initialActivity.resolve(jsonResponse({ events: [] }));
    await act(async () => Promise.resolve());

    if (result.current.shellContext.status !== 'active')
      throw new Error('Expected active shell context');
    expect(result.current.shellContext.companyContext).toMatchObject({
      status: 'ready',
      companies: [{ id: 'company-new', displayName: 'New Company' }],
    });
  });

  it('preserves a queued Activity result when a Company is included in the same batch', async () => {
    const initialActivity = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        return initialActivity.promise;
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    await act(async () => {
      initialActivity.resolve(
        jsonResponse({
          events: [
            {
              id: 'new-event',
              action: 'company.registered',
              occurredAt: '2026-08-15T10:00:00.000Z',
              actor: { internalUserId: 'user-1', displayName: 'Ada' },
              target: {
                type: 'company',
                companyId: 'company-new',
                displayName: 'New Company',
              },
              metadata: {},
            },
          ],
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      result.current.includeCompany({
        id: 'company-new',
        displayName: 'New Company',
      });
    });

    if (result.current.shellContext.status !== 'active')
      throw new Error('Expected active shell context');
    expect(result.current.shellContext.companyContext).toMatchObject({
      status: 'ready',
      companies: [{ id: 'company-new', displayName: 'New Company' }],
    });
    expect(result.current.shellContext.activityLog).toMatchObject({
      status: 'ready',
      events: [{ id: 'new-event' }],
    });
  });

  it('composes multiple Company inclusions queued in one batch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    act(() => {
      result.current.includeCompany({ id: 'company-a', displayName: 'A' });
      result.current.includeCompany({ id: 'company-b', displayName: 'B' });
    });

    expect(readyCompanies(result.current.shellContext)).toEqual([
      { id: 'company-a', displayName: 'A' },
      { id: 'company-b', displayName: 'B' },
    ]);
  });

  it('preserves a newly registered Company when an older selection completes', async () => {
    const selection = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId)
          return selection.promise;
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    let pendingSelection!: Promise<void>;
    act(() => {
      pendingSelection = result.current.selectCompany('company-a');
    });
    await waitFor(() => {
      if (result.current.shellContext.status !== 'active')
        throw new Error('Expected active shell context');
      expect(result.current.shellContext.companyContext).toMatchObject({
        selecting: true,
      });
    });
    act(() =>
      result.current.includeCompany({
        id: 'company-new',
        displayName: 'New Company',
      }),
    );
    selection.resolve(jsonResponse(selectedActor('company-a', 'Company A')));
    await act(() => pendingSelection);

    if (
      result.current.shellContext.status !== 'active' ||
      result.current.shellContext.companyContext.status !== 'ready'
    )
      throw new Error('Expected ready Company context');
    expect(result.current.shellContext.companyContext.companies).toContainEqual(
      {
        id: 'company-new',
        displayName: 'New Company',
      },
    );
  });

  it('preserves a newly registered Company when an older selection is rejected', async () => {
    const selection = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId)
          return selection.promise;
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    let pendingSelection!: Promise<void>;
    act(() => {
      pendingSelection = result.current.selectCompany('company-a');
    });
    await waitFor(() => {
      if (result.current.shellContext.status !== 'active')
        throw new Error('Expected active shell context');
      expect(result.current.shellContext.companyContext).toMatchObject({
        selecting: true,
      });
    });
    act(() =>
      result.current.includeCompany({
        id: 'company-new',
        displayName: 'New Company',
      }),
    );
    selection.resolve(new Response(null, { status: 403 }));
    await act(() => pendingSelection);

    expect(readyCompanies(result.current.shellContext)).toEqual([
      { id: 'company-b', displayName: 'Company B' },
      { id: 'company-new', displayName: 'New Company' },
    ]);
  });

  it('preserves a newly registered Company when selected Activity is rejected', async () => {
    const selectedActivity = deferred<Response>();
    let activityRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId)
          return Promise.resolve(
            jsonResponse(selectedActor(selectedId, 'Company A')),
          );
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        activityRequests += 1;
        return activityRequests === 1
          ? Promise.resolve(jsonResponse({ events: [] }))
          : selectedActivity.promise;
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );

    let pendingSelection!: Promise<void>;
    act(() => {
      pendingSelection = result.current.selectCompany('company-a');
    });
    await waitFor(() =>
      expect(activeCompanyId(result.current.shellContext)).toBe('company-a'),
    );
    act(() =>
      result.current.includeCompany({
        id: 'company-new',
        displayName: 'New Company',
      }),
    );
    selectedActivity.resolve(new Response(null, { status: 403 }));
    await act(() => pendingSelection);

    expect(activeCompanyId(result.current.shellContext)).toBeUndefined();
    expect(readyCompanies(result.current.shellContext)).toEqual([
      { id: 'company-b', displayName: 'Company B' },
      { id: 'company-new', displayName: 'New Company' },
    ]);
  });
});

function browserIdentity(): BrowserIdentity {
  return {
    loaded: true,
    signedIn: true,
    getToken: async () => 'token',
    rejectSession: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    signedOutView: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200 });
}

function selectedActor(id: string, displayName: string): ActorContext {
  return { ...baseActor, activeCompany: { id, displayName } };
}

function activeCompanyId(
  context: ReturnType<typeof useProductionShellContext>['shellContext'],
): string | undefined {
  return context.status === 'active'
    ? context.actor.activeCompany?.id
    : undefined;
}

function readyCompanies(
  context: ReturnType<typeof useProductionShellContext>['shellContext'],
) {
  if (context.status !== 'active' || context.companyContext.status !== 'ready')
    throw new Error('Expected ready Company context');
  return context.companyContext.companies;
}
