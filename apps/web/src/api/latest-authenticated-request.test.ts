import { afterEach, describe, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  handleAuthenticatedAccessRejection,
  runLatestAuthenticatedRequest,
} from './latest-authenticated-request';

describe('latest authenticated request', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('rejects an unauthorized session without changing Company context', async () => {
    const identity = deterministicBrowserIdentity();
    const rejectSession = vi.spyOn(identity, 'rejectSession');
    const rejectCompany = vi.fn();
    const acceptActor = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'unauthorized' },
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
        onActorRevalidated: acceptActor,
      }),
    ).resolves.toBe('unauthorized');
    expect(rejectSession).toHaveBeenCalledOnce();
    expect(rejectCompany).not.toHaveBeenCalled();
    expect(acceptActor).not.toHaveBeenCalled();
  });

  it('revalidates Company context before classifying a resource 403 as stale context', async () => {
    const revalidatedActor: ActorContext = {
      internalUserId: 'user-a',
      workspaceMembershipId: 'membership-a',
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      displayName: 'Ada',
      email: 'ada@example.test',
      active: true,
      workspacePermissions: [],
      activeCompany: {
        id: 'company-a',
        displayName: 'Company A',
        clientPermissions: [],
      },
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'Forbidden' }), {
            status: 403,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(revalidatedActor), { status: 200 }),
        ),
    );
    const identity = deterministicBrowserIdentity();
    const rejectCompany = vi.fn();
    const acceptActor = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
        onActorRevalidated: acceptActor,
      }),
    ).resolves.toBe('forbidden');
    expect(rejectCompany).not.toHaveBeenCalled();
    expect(acceptActor).toHaveBeenCalledWith(revalidatedActor);

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity,
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
        onActorRevalidated: acceptActor,
      }),
    ).resolves.toBe('forbidden');
    expect(rejectCompany).toHaveBeenCalledWith('company-a');
    expect(acceptActor).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rejects Workspace access after both Company and base actor revalidation are forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'Forbidden' }), {
            status: 403,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'Forbidden' }), {
            status: 403,
          }),
        ),
    );
    const rejectWorkspace = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity: deterministicBrowserIdentity(),
        companyContextId: 'company-a',
        onCompanyContextRejected: vi.fn(),
        onActorRevalidated: vi.fn(),
        onWorkspaceAccessRejected: rejectWorkspace,
      }),
    ).resolves.toBe('forbidden');

    expect(rejectWorkspace).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('preserves Company context when selected-context revalidation fails transiently', async () => {
    const workspaceActor: ActorContext = {
      internalUserId: 'user-a',
      workspaceMembershipId: 'membership-a',
      workspaceId: 'workspace-a',
      workspaceName: 'Workspace A',
      displayName: 'Ada',
      email: 'ada@example.test',
      active: true,
      workspacePermissions: [],
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 500 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify(workspaceActor), { status: 200 }),
        ),
    );
    const rejectCompany = vi.fn();
    const acceptActor = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity: deterministicBrowserIdentity(),
        companyContextId: 'company-a',
        onCompanyContextRejected: rejectCompany,
        onActorRevalidated: acceptActor,
      }),
    ).resolves.toBe('forbidden');

    expect(rejectCompany).not.toHaveBeenCalled();
    expect(acceptActor).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects Workspace access when a base-scoped protected request is forbidden', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Forbidden' }), {
          status: 403,
        }),
      ),
    );
    const rejectWorkspace = vi.fn();

    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'forbidden' },
        identity: deterministicBrowserIdentity(),
        companyContextId: undefined,
        onCompanyContextRejected: vi.fn(),
        onActorRevalidated: vi.fn(),
        onWorkspaceAccessRejected: rejectWorkspace,
      }),
    ).resolves.toBe('forbidden');

    expect(rejectWorkspace).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

it.each([false, true])(
  'preserves legacy401 after self-retirement but fences an explicitly retired full-Actor consumer: captured=%s',
  async (captured) => {
    const controller = new AbortController();
    controller.abort();
    const rejectSession = vi.fn(async () => undefined),
      identity = { ...deterministicBrowserIdentity(), rejectSession };
    await expect(
      handleAuthenticatedAccessRejection({
        result: { status: 'unauthorized' },
        identity,
        companyContextId: 'company-a',
        signal: controller.signal,
        onActorRevalidated: vi.fn(),
        onCompanyContextRejected: vi.fn(),
        ...(captured ? { isCurrent: () => false } : {}),
      }),
    ).resolves.toBe('unauthorized');
    expect(rejectSession).toHaveBeenCalledTimes(captured ? 0 : 1);
  },
);
