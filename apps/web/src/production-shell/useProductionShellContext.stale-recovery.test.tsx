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
    { outcome: 'HTTP error', rejection: 'before' },
    { outcome: 'network error', rejection: 'before' },
    { outcome: 'denial', rejection: 'before' },
    { outcome: 'HTTP error', rejection: 'after' },
    { outcome: 'network error', rejection: 'after' },
    { outcome: 'denial', rejection: 'after' },
  ] as const)(
    'keeps recovery when active Company rejection settles $rejection newer-Company $outcome',
    async ({ outcome, rejection }) => {
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
      const rejectCompanyA = result.current.rejectCompanyContext;

      let pendingSelection!: Promise<void>;
      act(() => {
        pendingSelection = result.current.selectCompany('company-b');
      });
      await waitFor(() => expect(companyBRequests).toBe(1));
      if (rejection === 'before') act(() => rejectCompanyA('company-a'));
      if (outcome === 'HTTP error')
        companyBSelection.resolve(new Response(null, { status: 500 }));
      else if (outcome === 'denial')
        companyBSelection.resolve(new Response(null, { status: 403 }));
      else companyBSelection.reject(new TypeError('network failed'));
      await act(() => pendingSelection);
      if (rejection === 'after') {
        expect(result.current.shellContext).toMatchObject({
          status: 'active',
          companyContext:
            outcome === 'denial'
              ? {
                  status: 'ready',
                  companies: [{ id: 'company-a' }],
                  recoveryMessage: 'selection-failed',
                }
              : { status: 'error' },
        });
        act(() => rejectCompanyA('company-a'));
      }

      if (outcome === 'denial')
        expectZeroCompanyRecovery(
          result.current.shellContext,
          rejection === 'before' ? 'selection-failed' : 'stale',
        );
      else expectRejectedCompanyARecovery(result.current.shellContext);
    },
  );

  it.each(['denial', 'HTTP error', 'network error'] as const)(
    'preserves delayed Company rejection through an intervening selection %s',
    async (outcome) => {
      const visibleCompanies = [
        ...companies,
        { id: 'company-c', displayName: 'Company C' },
      ];
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
          )
            return Promise.resolve(new Response(null, { status: 403 }));
          if (
            url.endsWith('/access/current-actor') &&
            selectedId === 'company-c'
          ) {
            if (outcome === 'denial')
              return Promise.resolve(new Response(null, { status: 403 }));
            if (outcome === 'HTTP error')
              return Promise.resolve(new Response(null, { status: 500 }));
            return Promise.reject(new TypeError('network failed'));
          }
          if (url.endsWith('/access/current-actor'))
            return Promise.resolve(jsonResponse(baseActor));
          if (url.endsWith('/companies'))
            return Promise.resolve(jsonResponse(visibleCompanies));
          return Promise.resolve(jsonResponse({ events: [] }));
        }),
      );
      const identity = browserIdentity();
      const { result } = renderHook(() => useProductionShellContext(identity));
      await waitFor(() =>
        expect(result.current.shellContext.status).toBe('active'),
      );
      await act(() => result.current.selectCompany('company-a'));
      const rejectCompanyA = result.current.rejectCompanyContext;

      await act(() => result.current.selectCompany('company-b'));
      await act(() => result.current.selectCompany('company-c'));
      act(() => rejectCompanyA('company-a'));

      expectCompanyRecovery(
        result.current.shellContext,
        outcome === 'denial'
          ? []
          : [{ id: 'company-c', displayName: 'Company C' }],
        'stale',
      );
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

function expectZeroCompanyRecovery(
  shellContext: ProductionShellContext,
  recoveryMessage: 'stale' | 'selection-failed',
): void {
  expect(activeCompanyId(shellContext)).toBeUndefined();
  expect(readyCompanies(shellContext)).toEqual([]);
  if (
    shellContext.status !== 'active' ||
    shellContext.companyContext.status !== 'ready'
  )
    throw new Error('Expected ready zero-Company recovery context');
  expect(shellContext.companyContext).toMatchObject({
    cardinality: 'zero',
    selection: { status: 'idle' },
    recoveryMessage,
  });
  expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
}

function expectCompanyRecovery(
  shellContext: ProductionShellContext,
  expectedCompanies: { id: string; displayName: string }[],
  recoveryMessage: 'stale' | 'selection-failed',
): void {
  expect(activeCompanyId(shellContext)).toBeUndefined();
  expect(readyCompanies(shellContext)).toEqual(expectedCompanies);
  if (
    shellContext.status !== 'active' ||
    shellContext.companyContext.status !== 'ready'
  )
    throw new Error('Expected ready Company recovery context');
  expect(shellContext.companyContext).toMatchObject({
    selection: { status: 'idle' },
    recoveryMessage,
  });
  expect(localStorage.getItem(preferenceKey(baseActor))).toBeNull();
}
