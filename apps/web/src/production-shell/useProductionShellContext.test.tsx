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
});

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
