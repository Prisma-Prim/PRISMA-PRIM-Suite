import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preferenceKey } from './company-context-preference';
import {
  activeCompanyId,
  baseActor,
  browserIdentity,
  companies,
  deferred,
  jsonResponse,
  readyCompanies,
  selectedActor,
} from './production-shell-context.test-fixtures';
import {
  type ProductionShellContext,
  useProductionShellContext,
} from './useProductionShellContext';

describe('useProductionShellContext stale recovery', () => {
  beforeEach(() => localStorage.clear());

  it.each(['success', 'denial', 'HTTP error', 'network error'] as const)(
    'settles a rejected Company selection before its later %s',
    async (outcome) => {
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
      if (outcome === 'success')
        repeatedCompanyASelection.resolve(
          jsonResponse(selectedActor('company-a', 'Company A')),
        );
      else if (outcome === 'denial')
        repeatedCompanyASelection.resolve(new Response(null, { status: 403 }));
      else if (outcome === 'HTTP error')
        repeatedCompanyASelection.resolve(new Response(null, { status: 500 }));
      else repeatedCompanyASelection.reject(new TypeError('network failed'));
      await act(() => pendingSelection);

      expectRejectedCompanyARecovery(result.current.shellContext);
    },
  );

  it.each([
    { failure: 'HTTP error', rejection: 'before' },
    { failure: 'network error', rejection: 'before' },
    { failure: 'HTTP error', rejection: 'after' },
    { failure: 'network error', rejection: 'after' },
  ] as const)(
    'keeps stale recovery when active Company rejection settles $rejection newer-Company $failure',
    async ({ failure, rejection }) => {
      const companyBSelection = deferred<Response>();
      let companyBRequests = 0;
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
          )
            return Promise.resolve(
              jsonResponse(selectedActor('company-a', 'Company A')),
            );
          if (
            url.endsWith('/access/current-actor') &&
            selectedId === 'company-b'
          ) {
            companyBRequests += 1;
            return companyBSelection.promise;
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
        pendingSelection = result.current.selectCompany('company-b');
      });
      await waitFor(() => expect(companyBRequests).toBe(1));
      if (rejection === 'before')
        act(() => result.current.rejectCompanyContext('company-a'));
      if (failure === 'HTTP error')
        companyBSelection.resolve(new Response(null, { status: 500 }));
      else companyBSelection.reject(new TypeError('network failed'));
      await act(() => pendingSelection);
      if (rejection === 'after') {
        expect(result.current.shellContext).toMatchObject({
          status: 'active',
          companyContext: { status: 'error' },
        });
        act(() => result.current.rejectCompanyContext('company-a'));
      }

      expectRejectedCompanyARecovery(result.current.shellContext);
    },
  );
});

function expectRejectedCompanyARecovery(
  shellContext: ProductionShellContext,
): void {
  expect(activeCompanyId(shellContext)).toBeUndefined();
  expect(readyCompanies(shellContext)).toEqual([
    { id: 'company-b', displayName: 'Company B' },
  ]);
  if (
    shellContext.status !== 'active' ||
    shellContext.companyContext.status !== 'ready'
  )
    throw new Error('Expected ready stale-recovery context');
  expect(shellContext.companyContext).toMatchObject({
    selection: { status: 'idle' },
    recoveryMessage: 'stale',
  });
  expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
}
