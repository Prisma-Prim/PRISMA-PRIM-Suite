import { StrictMode, useEffect } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import { useCompanyModelCommandAttempt } from './use-company-model-command-attempt';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!settle) throw new Error('Deferred was not initialized.');
      settle(value);
    },
  };
}

it('holds one command slot through authentication, POST and complete confirmation', async () => {
  const token = deferred<string>();
  const post = deferred<Response>();
  const confirmation = deferred<{ key: 'saved'; number: number }>();
  const getToken = vi.fn(() => token.promise);
  const fetch = vi.fn(() => post.promise);
  vi.stubGlobal('fetch', fetch);
  const onConfirmed = vi.fn();
  const prepare = vi.fn(() => ({
    path: '/model/versions',
    body: '{"literal":" original "}',
    confirm: () => confirmation.promise,
  }));
  const { result } = renderHook(() =>
    useCompanyModelCommandAttempt({
      identity: {
        ...deterministicBrowserIdentity(),
        requestHeaders: undefined,
        getToken,
      },
      companyId: 'company-a',
      onStart: vi.fn(),
      onConfirmed,
      onDenied: vi.fn(),
    }),
  );
  const first = result.current;
  act(() => {
    first.start(prepare);
    first.start(prepare);
    first.retry();
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(getToken).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(result.current.state.kind).toBe('pending');
  await act(async () => token.resolve('synthetic-token'));
  expect(fetch).toHaveBeenCalledTimes(1);
  act(() => first.start(prepare));
  await act(async () => post.resolve(Response.json({ accepted: true })));
  act(() => {
    first.start(prepare);
    first.retry();
  });
  expect(result.current.blocked).toBe(true);
  expect(onConfirmed).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => confirmation.resolve({ key: 'saved', number: 7 }));
  expect(result.current.state).toEqual({
    kind: 'idle',
    notice: { key: 'saved', number: 7 },
    error: null,
  });
  expect(onConfirmed).toHaveBeenCalledTimes(1);
});

it('retains the original request and confirmation for a synchronous identical retry', async () => {
  const requests: { path: string; init: RequestInit | undefined }[] = [];
  const retried = deferred<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: input.toString(), init });
      return requests.length === 1
        ? Promise.resolve(Response.json({ malformed: true }))
        : retried.promise;
    }),
  );
  const identity = deterministicBrowserIdentity();
  const firstConfirmed = vi.fn();
  const latestConfirmed = vi.fn();
  const confirm = vi.fn(({ receipt }: { receipt: unknown }) => {
    if (
      typeof receipt !== 'object' ||
      receipt === null ||
      !('accepted' in receipt)
    )
      throw new Error('Unprovable receipt.');
    return { key: 'decisionSaved', number: 3 } satisfies {
      key: 'decisionSaved';
      number: number;
    };
  });
  const original = vi.fn(() => ({
    path: '/model/exact/decision',
    body: '{"basis":"  original\\n intent  "}',
    confirm,
  }));
  const replacement = vi.fn(() => ({
    path: '/model/other/decision',
    body: '{}',
    confirm,
  }));
  const { result, rerender } = renderHook(
    ({ onConfirmed }) =>
      useCompanyModelCommandAttempt({
        identity,
        companyId: 'company-a',
        onStart: vi.fn(),
        onConfirmed,
        onDenied: vi.fn(),
      }),
    { initialProps: { onConfirmed: firstConfirmed } },
  );
  await act(async () => result.current.start(original));
  expect(result.current.state.kind).toBe('uncertain');
  rerender({ onConfirmed: latestConfirmed });
  const uncertain = result.current;
  await act(async () => {
    uncertain.start(replacement);
    uncertain.retry();
    uncertain.retry();
    uncertain.start(replacement);
  });
  expect(result.current.state.kind).toBe('pending');
  expect(replacement).not.toHaveBeenCalled();
  expect(original).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(2);
  expect(requests[1]?.path).toBe('/api/model/exact/decision');
  expect(requests[1]?.init?.body).toBe('{"basis":"  original\\n intent  "}');
  expect(requests[1]?.init?.body).toBe(requests[0]?.init?.body);
  const firstHeaders = new Headers(requests[0]?.init?.headers);
  const retryHeaders = new Headers(requests[1]?.init?.headers);
  expect(firstHeaders.get('idempotency-key')).toBeTruthy();
  expect(retryHeaders.get('idempotency-key')).toBe(
    firstHeaders.get('idempotency-key'),
  );
  expect(retryHeaders.get('x-company-context-id')).toBe('company-a');
  await act(async () => retried.resolve(Response.json({ accepted: true })));
  expect(result.current.state).toEqual({
    kind: 'idle',
    notice: { key: 'decisionSaved', number: 3 },
    error: null,
  });
  expect(firstConfirmed).not.toHaveBeenCalled();
  expect(latestConfirmed).toHaveBeenCalledTimes(1);
});

it.each([
  { stage: 'identity', status: 200 },
  { stage: 'POST', status: 200 },
  { stage: 'POST', status: 403 },
  { stage: 'confirmation', status: 200 },
  { stage: 'confirmation', status: 403 },
])(
  'permanently retires $stage with late HTTP $status even when cancellation is ignored',
  async ({ stage, status }) => {
    const token = deferred<string>();
    const post = deferred<Response>();
    const detail = deferred<Response>();
    let signal: AbortSignal | null | undefined;
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal;
      return input.toString().endsWith('/detail')
        ? detail.promise
        : post.promise;
    });
    vi.stubGlobal('fetch', fetch);
    const onStart = vi.fn();
    const onConfirmed = vi.fn();
    const onDenied = vi.fn();
    const identity =
      stage === 'identity'
        ? {
            ...deterministicBrowserIdentity(),
            requestHeaders: undefined,
            getToken: () => token.promise,
          }
        : deterministicBrowserIdentity();
    const { result, unmount } = renderHook(() =>
      useCompanyModelCommandAttempt({
        identity,
        companyId: 'company-a',
        onStart,
        onConfirmed,
        onDenied,
      }),
    );
    const retained = result.current;
    await act(async () =>
      retained.start(() => ({
        path: '/model',
        body: '{}',
        confirm: async ({ read }) => {
          await read('/model/detail');
          return { key: 'saved', number: 1 };
        },
      })),
    );
    if (stage === 'confirmation')
      await act(async () => post.resolve(Response.json({ accepted: true })));
    unmount();
    expect(signal?.aborted ?? stage === 'identity').toBe(true);
    await act(async () => {
      token.resolve('synthetic-token');
      post.resolve(Response.json({ accepted: true }, { status }));
      detail.resolve(Response.json({ accepted: true }, { status }));
    });
    act(() => {
      retained.start(() => {
        throw new Error('Retired preparation ran.');
      });
      retained.retry();
    });
    expect(fetch).toHaveBeenCalledTimes(
      stage === 'identity' ? 0 : stage === 'POST' ? 1 : 2,
    );
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  },
);

it('does not revive a former run during StrictMode effect replay', async () => {
  const firstToken = deferred<string>();
  const secondToken = deferred<string>();
  const getToken = vi
    .fn()
    .mockImplementationOnce(() => firstToken.promise)
    .mockImplementationOnce(() => secondToken.promise);
  const identity = {
    ...deterministicBrowserIdentity(),
    requestHeaders: undefined,
    getToken,
  };
  const fetch = vi.fn(async () => Response.json({ accepted: true }));
  vi.stubGlobal('fetch', fetch);
  const onConfirmed = vi.fn();
  const { result } = renderHook(
    () => {
      const attempt = useCompanyModelCommandAttempt({
        identity,
        companyId: 'company-a',
        onStart: vi.fn(),
        onConfirmed,
        onDenied: vi.fn(),
      });
      useEffect(() => {
        attempt.start(() => ({
          path: '/model',
          body: '{}',
          confirm: () => ({ key: 'saved', number: 1 }),
        }));
        // Deliberately model a consumer starting work on mount, including replay.
      }, []);
      return attempt;
    },
    { wrapper: StrictMode },
  );
  expect(getToken).toHaveBeenCalledTimes(2);
  await act(async () => firstToken.resolve('retired-token'));
  expect(fetch).not.toHaveBeenCalled();
  expect(result.current.state.kind).toBe('pending');
  await act(async () => secondToken.resolve('current-token'));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(onConfirmed).toHaveBeenCalledTimes(1);
});

it('suppresses a complete confirmer that finishes after unmount without another read', async () => {
  const confirmation = deferred<{ key: 'saved'; number: number }>();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ accepted: true })),
  );
  const onConfirmed = vi.fn();
  const { result, unmount } = renderHook(() =>
    useCompanyModelCommandAttempt({
      identity: deterministicBrowserIdentity(),
      companyId: 'company-a',
      onStart: vi.fn(),
      onConfirmed,
      onDenied: vi.fn(),
    }),
  );
  await act(async () =>
    result.current.start(() => ({
      path: '/model',
      body: '{}',
      confirm: () => confirmation.promise,
    })),
  );
  unmount();
  await act(async () => confirmation.resolve({ key: 'saved', number: 1 }));
  expect(onConfirmed).not.toHaveBeenCalled();
});

it.each([
  { status: 400, error: 'invalid' },
  { status: 404, error: 'stale' },
  { status: 409, error: 'stale' },
  { status: 503, error: null },
  { status: 401, error: null },
  { status: 403, error: null },
])(
  'classifies the POST HTTP $status without attempting domain confirmation',
  async ({ status, error }) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({}, { status })),
    );
    const confirm = vi.fn(
      () =>
        ({ key: 'saved', number: 1 }) satisfies {
          key: 'saved';
          number: number;
        },
    );
    const onConfirmed = vi.fn();
    const onDenied = vi.fn();
    const { result } = renderHook(() =>
      useCompanyModelCommandAttempt({
        identity: deterministicBrowserIdentity(),
        companyId: 'company-a',
        onStart: vi.fn(),
        onConfirmed,
        onDenied,
      }),
    );
    await act(async () =>
      result.current.start(() => ({ path: '/model', body: '{}', confirm })),
    );
    expect(result.current.state).toEqual(
      status === 503
        ? { kind: 'uncertain' }
        : { kind: 'idle', notice: null, error },
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledTimes(
      status === 401 || status === 403 ? 1 : 0,
    );
  },
);

it.each([401, 403, 404, 503])(
  'classifies confirmation GET HTTP %s within the same Company and cancellation span',
  async (status) => {
    const requests: { path: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ path: input.toString(), init });
        return Response.json(
          {},
          { status: init?.method === 'POST' ? 200 : status },
        );
      }),
    );
    const onConfirmed = vi.fn();
    const onDenied = vi.fn();
    const { result } = renderHook(() =>
      useCompanyModelCommandAttempt({
        identity: deterministicBrowserIdentity(),
        companyId: 'company-a',
        onStart: vi.fn(),
        onConfirmed,
        onDenied,
      }),
    );
    await act(async () =>
      result.current.start(() => ({
        path: '/model',
        body: '{}',
        confirm: async ({ read }) => {
          await read('/model/exact-version');
          return { key: 'withdrawalSaved', number: 4 };
        },
      })),
    );
    expect(requests).toHaveLength(2);
    expect(requests[1]?.path).toBe('/api/model/exact-version');
    expect(requests[1]?.init?.method).toBeUndefined();
    expect(requests[1]?.init?.signal).toBe(requests[0]?.init?.signal);
    expect(
      new Headers(requests[1]?.init?.headers).get('x-company-context-id'),
    ).toBe('company-a');
    expect(result.current.state).toEqual(
      status === 401 || status === 403
        ? { kind: 'idle', notice: null, error: null }
        : { kind: 'uncertain' },
    );
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledTimes(
      status === 401 || status === 403 ? 1 : 0,
    );
    if (status === 401 || status === 403)
      expect(onDenied).toHaveBeenCalledWith({
        status: status === 401 ? 'unauthorized' : 'forbidden',
      });
  },
);
