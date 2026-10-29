import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAuthenticatedApiClient } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import { preferenceKey } from './company-context-preference';
import {
  baseActor,
  browserIdentity,
  companies,
  jsonResponse,
  selectedActor,
} from './production-shell-context.test-fixtures';
import { useProductionShellContext } from './useProductionShellContext';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

it.each([
  {
    name: 'incomplete selected and Workspace Actors',
    selected: 'incomplete',
    workspaceReadable: false,
  },
  {
    name: 'incomplete selected Actor and readable Workspace',
    selected: 'incomplete',
    workspaceReadable: true,
  },
  {
    name: 'malformed selected Actor still naming the Company',
    selected: 'same-company',
    workspaceReadable: true,
  },
  {
    name: 'forbidden selected Company and malformed Workspace',
    selected: 'forbidden',
    workspaceReadable: false,
  },
])(
  'keeps selected Company and valid identity through $name, then accepts later recovery',
  async (scenario) => {
    let unreadable = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = input.toString();
        if (path.endsWith('/protected'))
          return new Response(null, { status: 403 });
        if (path.endsWith('/companies')) return jsonResponse(companies);
        if (path.endsWith('/access/current-actor')) {
          if (unreadable) {
            const selected = new Headers(init?.headers).has(
              'x-company-context-id',
            );
            if (selected && scenario.selected === 'forbidden')
              return new Response(null, { status: 403 });
            if (!selected && scenario.workspaceReadable)
              return jsonResponse(baseActor);
            return jsonResponse({
              internalUserId: 'unproved-user',
              ...(selected && scenario.selected === 'same-company'
                ? {
                    activeCompany: { id: 'company-a', displayName: 'Unproved' },
                  }
                : {}),
            });
          }
          return jsonResponse(
            new Headers(init?.headers).has('x-company-context-id')
              ? selectedActor('company-a', 'Company A')
              : baseActor,
          );
        }
        return jsonResponse({ events: [] });
      }),
    );
    const identity = browserIdentity();
    const { result } = renderHook(() => useProductionShellContext(identity));
    await waitFor(() =>
      expect(result.current.shellContext.status).toBe('active'),
    );
    await act(() => result.current.selectCompany('company-a'));
    const selected = result.current.shellContext;

    async function rejectProtectedRequest() {
      const api = await createAuthenticatedApiClient(identity);
      const rejected = await api.request<unknown>('/protected', {
        companyContextId: 'company-a',
      });
      await handleAuthenticatedAccessRejection({
        result: rejected,
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: result.current.rejectCompanyContext,
        onActorRevalidated: result.current.acceptRevalidatedActor,
        onWorkspaceAccessRejected: result.current.rejectWorkspaceAccess,
      });
    }

    unreadable = true;
    await act(rejectProtectedRequest);

    expect(result.current.shellContext).toEqual(selected);
    expect(localStorage.getItem(preferenceKey(baseActor))).toBe('company-a');
    expect(identity.rejectSession).not.toHaveBeenCalled();
    expect(identity.signOut).not.toHaveBeenCalled();

    unreadable = false;
    await act(rejectProtectedRequest);
    expect(result.current.shellContext).toMatchObject({
      status: 'active',
      actor: selectedActor('company-a', 'Company A'),
      companyContext: { status: 'ready', companies },
    });
  },
);

it('keeps an unreadable initial Actor out of shell state without rejecting the session', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResponse({ internalUserId: 'unproved' })),
  );
  const identity = browserIdentity();
  const { result } = renderHook(() => useProductionShellContext(identity));
  await waitFor(() =>
    expect(result.current.shellContext).toEqual({ status: 'error' }),
  );
  expect(identity.rejectSession).not.toHaveBeenCalled();
});

it('retains the previous Actor when a new Company selection returns an unreadable success', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = input.toString();
      if (path.endsWith('/companies')) return jsonResponse(companies);
      if (path.endsWith('/access/current-actor')) {
        const selectedId = new Headers(init?.headers).get(
          'x-company-context-id',
        );
        if (selectedId === 'company-b')
          return jsonResponse({
            ...baseActor,
            activeCompany: { id: 'company-b' },
          });
        return jsonResponse(
          selectedId ? selectedActor('company-a', 'Company A') : baseActor,
        );
      }
      return jsonResponse({ events: [] });
    }),
  );
  const identity = browserIdentity();
  const { result } = renderHook(() => useProductionShellContext(identity));
  await waitFor(() =>
    expect(result.current.shellContext.status).toBe('active'),
  );
  await act(() => result.current.selectCompany('company-a'));
  await act(() => result.current.selectCompany('company-b'));
  expect(result.current.shellContext).toMatchObject({
    status: 'active',
    actor: selectedActor('company-a', 'Company A'),
    companyContext: { status: 'error' },
  });
  expect(identity.rejectSession).not.toHaveBeenCalled();
});
