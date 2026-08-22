import { describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from './latest-authenticated-request';

describe('latest authenticated request', () => {
  it('aborts an older request owned by the same resource', async () => {
    const pending = { current: undefined as AbortController | undefined };
    const first = deferred<string>();
    const firstRun = runLatestAuthenticatedRequest({
      pending,
      identity: deterministicBrowserIdentity(),
      execute: async (_api, signal) => {
        await first.promise;
        return signal.aborted ? 'stale' : 'first';
      },
      onResult: vi.fn(),
      onError: vi.fn(),
    });
    await vi.waitFor(() => expect(pending.current).toBeDefined());

    const latestRun = runLatestAuthenticatedRequest({
      pending,
      identity: deterministicBrowserIdentity(),
      execute: async () => 'latest',
      onResult: vi.fn(),
      onError: vi.fn(),
    });
    first.resolve('done');

    await expect(latestRun).resolves.toBe('latest');
    await expect(firstRun).resolves.toBeUndefined();
  });

  it('retains ownership through asynchronous result publication', async () => {
    const pending = { current: undefined as AbortController | undefined };
    const publication = deferred<string>();
    let ownedDuringPublication = false;

    const run = runLatestAuthenticatedRequest({
      pending,
      identity: deterministicBrowserIdentity(),
      execute: async () => 'result',
      async onResult() {
        ownedDuringPublication = pending.current !== undefined;
        await publication.promise;
      },
      onError: vi.fn(),
    });
    await vi.waitFor(() => expect(ownedDuringPublication).toBe(true));
    expect(pending.current).toBeDefined();

    publication.resolve('published');
    await expect(run).resolves.toBe('result');
    expect(pending.current).toBeUndefined();
  });

  it('handles unauthorized and forbidden outcomes through one policy', async () => {
    const identity = deterministicBrowserIdentity();
    const rejectSession = vi.spyOn(identity, 'rejectSession');
    const rejectCompany = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'unauthorized' },
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
      }),
    ).resolves.toBe('unauthorized');
    expect(rejectSession).toHaveBeenCalledOnce();
    expect(rejectCompany).not.toHaveBeenCalled();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
      }),
    ).resolves.toBe('forbidden');
    expect(rejectCompany).toHaveBeenCalledWith('company-a');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
