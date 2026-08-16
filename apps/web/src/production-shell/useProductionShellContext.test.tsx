import { act, renderHook, waitFor } from '@testing-library/react';
import { flushSync } from 'react-dom';
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

  it('composes a newer Company selection before an older rejection in the same batch', async () => {
    const companyBSelection = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (url.endsWith('/access/current-actor') && selectedId === 'company-b')
          return companyBSelection.promise;
        if (url.endsWith('/access/current-actor') && selectedId)
          return Promise.resolve(
            jsonResponse(selectedActor(selectedId, 'Company A')),
          );
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

    let pendingSelection!: Promise<void>;
    act(() => {
      pendingSelection = result.current.selectCompany('company-b');
    });
    await waitFor(() => {
      if (result.current.shellContext.status !== 'active')
        throw new Error('Expected active shell context');
      expect(result.current.shellContext.companyContext).toMatchObject({
        selection: { status: 'pending', companyId: 'company-b' },
      });
    });
    await act(async () => {
      companyBSelection.resolve(
        jsonResponse(selectedActor('company-b', 'Company B')),
      );
      await Promise.resolve();
      await Promise.resolve();
      result.current.rejectCompanyContext('company-a');
      await pendingSelection;
    });

    expect(activeCompanyId(result.current.shellContext)).toBe('company-b');
  });

  it('ignores registration callbacks from previous active Company contexts', async () => {
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
    const includeFromNoCompany = result.current.includeCompany;
    await act(() => result.current.selectCompany('company-a'));
    const includeFromCompanyA = result.current.includeCompany;
    await act(() => result.current.selectCompany('company-b'));

    act(() => {
      includeFromNoCompany({
        id: 'company-from-no-context',
        displayName: 'No-context result',
      });
      includeFromCompanyA({
        id: 'company-from-a',
        displayName: 'Company A result',
      });
    });

    expect(readyCompanies(result.current.shellContext)).toEqual(companies);
  });

  it('does not restore a rejected Company when its pending selection succeeds', async () => {
    const repeatedCompanyASelection = deferred<Response>();
    let companyASelections = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (
          url.endsWith('/access/current-actor') &&
          selectedId === 'company-a'
        ) {
          companyASelections += 1;
          return companyASelections === 1
            ? Promise.resolve(
                jsonResponse(selectedActor('company-a', 'Company A')),
              )
            : repeatedCompanyASelection.promise;
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

    let pendingSelection!: Promise<void>;
    act(() => {
      pendingSelection = result.current.selectCompany('company-a');
    });
    await waitFor(() => expect(companyASelections).toBe(2));
    act(() => result.current.rejectCompanyContext('company-a'));
    repeatedCompanyASelection.resolve(
      jsonResponse(selectedActor('company-a', 'Company A')),
    );
    await act(() => pendingSelection);

    expect(activeCompanyId(result.current.shellContext)).toBeUndefined();
    expect(readyCompanies(result.current.shellContext)).toEqual([
      { id: 'company-b', displayName: 'Company B' },
    ]);
    expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
  });

  it.each(['HTTP error', 'network error'] as const)(
    'does not restore a rejected Company when its pending selection ends in an %s',
    async (failure) => {
      const repeatedCompanyASelection = deferred<Response>();
      let companyASelections = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
          const url = input.toString();
          const selectedId = new Headers(init?.headers).get(
            'x-company-context-id',
          );
          if (
            url.endsWith('/access/current-actor') &&
            selectedId === 'company-a'
          ) {
            companyASelections += 1;
            return companyASelections === 1
              ? Promise.resolve(
                  jsonResponse(selectedActor('company-a', 'Company A')),
                )
              : repeatedCompanyASelection.promise;
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

      let pendingSelection!: Promise<void>;
      act(() => {
        pendingSelection = result.current.selectCompany('company-a');
      });
      await waitFor(() => expect(companyASelections).toBe(2));
      act(() => result.current.rejectCompanyContext('company-a'));
      if (failure === 'HTTP error')
        repeatedCompanyASelection.resolve(new Response(null, { status: 500 }));
      else repeatedCompanyASelection.reject(new TypeError('network failed'));
      await act(() => pendingSelection);

      expect(activeCompanyId(result.current.shellContext)).toBeUndefined();
      expect(readyCompanies(result.current.shellContext)).toEqual([
        { id: 'company-b', displayName: 'Company B' },
      ]);
      expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
    },
  );

  it('does not restore an old Workspace when identity changes during Company denial recovery', async () => {
    const selection = deferred<Response>();
    const nextActor = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const headers = new Headers(init?.headers);
        const selectedId = headers.get('x-company-context-id');
        if (url.endsWith('/access/current-actor') && selectedId)
          return selection.promise;
        if (
          url.endsWith('/access/current-actor') &&
          headers.get('x-test-workspace') === 'next'
        )
          return nextActor.promise;
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse(companies));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const initialIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-workspace': 'initial' },
    };
    const nextIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-workspace': 'next' },
    };
    const { result, rerender } = renderHook(
      ({ identity }) => useProductionShellContext(identity),
      { initialProps: { identity: initialIdentity } },
    );
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
        selection: { status: 'pending', companyId: 'company-a' },
      });
    });

    await act(async () => {
      selection.resolve(new Response(null, { status: 403 }));
      await Promise.resolve();
      await Promise.resolve();
      flushSync(() => rerender({ identity: nextIdentity }));
      await pendingSelection;
    });

    expect(result.current.shellContext).toEqual({ status: 'checking' });
  });

  it('ignores Company inclusion from a previous actor context generation', async () => {
    const nextActor: ActorContext = {
      ...baseActor,
      internalUserId: 'user-2',
      workspaceMembershipId: 'membership-2',
      workspaceId: 'workspace-2',
      workspaceName: 'Next Workspace',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = input.toString();
        const actor =
          new Headers(init?.headers).get('x-test-workspace') === 'next'
            ? nextActor
            : baseActor;
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(actor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const initialIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-workspace': 'initial' },
    };
    const nextIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-workspace': 'next' },
    };
    const { result, rerender } = renderHook(
      ({ identity }) => useProductionShellContext(identity),
      { initialProps: { identity: initialIdentity } },
    );
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );
    const includeFromInitialContext = result.current.includeCompany;

    rerender({ identity: nextIdentity });
    await waitFor(() => {
      if (result.current.shellContext.status !== 'active')
        throw new Error('Expected active shell context');
      expect(result.current.shellContext.actor.workspaceId).toBe('workspace-2');
    });
    act(() =>
      includeFromInitialContext({
        id: 'company-secret',
        displayName: 'Confidential Company',
      }),
    );

    expect(readyCompanies(result.current.shellContext)).toEqual([]);
  });

  it('does not reuse registration callbacks after the same actor signs in again', async () => {
    let activityRequests = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();
        if (url.endsWith('/access/current-actor'))
          return Promise.resolve(jsonResponse(baseActor));
        if (url.endsWith('/companies'))
          return Promise.resolve(jsonResponse([]));
        activityRequests += 1;
        return Promise.resolve(jsonResponse({ events: [] }));
      }),
    );
    const initialIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-session': 'initial' },
    };
    const nextIdentity = {
      ...browserIdentity(),
      requestHeaders: { 'x-test-session': 'next' },
    };
    const { result, rerender } = renderHook(
      ({ identity }) => useProductionShellContext(identity),
      { initialProps: { identity: initialIdentity } },
    );
    await waitFor(() => expect(activityRequests).toBe(1));
    const includeFromInitialSession = result.current.includeCompany;

    rerender({ identity: nextIdentity });
    await waitFor(() => expect(activityRequests).toBe(2));
    act(() =>
      includeFromInitialSession({
        id: 'company-secret',
        displayName: 'Confidential Company',
      }),
    );

    expect(readyCompanies(result.current.shellContext)).toEqual([]);
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
        selection: { status: 'pending', companyId: 'company-a' },
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
        selection: { status: 'pending', companyId: 'company-a' },
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

  it('ignores selected Company Activity after registration rejection clears that context', async () => {
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

    act(() => result.current.rejectCompanyContext('company-a'));
    selectedActivity.resolve(
      jsonResponse({
        events: [
          {
            id: 'company-a-event',
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
    await act(() => pendingSelection);

    if (result.current.shellContext.status !== 'active')
      throw new Error('Expected active shell context');
    expect(result.current.shellContext.actor.activeCompany).toBeUndefined();
    expect(result.current.shellContext.activityLog).toEqual({
      status: 'loading',
    });
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
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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
