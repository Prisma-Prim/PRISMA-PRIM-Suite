import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { readCurrentActor } from '../access/current-actor';
import {
  createAuthenticatedApiClient,
  type AuthenticatedApiClient,
  type ApiResult,
} from './authenticated-api-client';

/**
 * Who cancels the request. A `signal` from `useScopedOperation().begin()`
 * leaves cancellation to that operation: the request adds no abort path and
 * settles only while the signal is live. The legacy `pending` slot aborts its
 * earlier request and settles while the request still owns the slot.
 */
type RequestOwner =
  | { signal: AbortSignal; pending?: never }
  | { pending: { current: AbortController | undefined }; signal?: never };

function claim(owner: RequestOwner): {
  signal: AbortSignal;
  release: () => boolean;
} {
  if (owner.signal) {
    const { signal } = owner;
    return { signal, release: () => !signal.aborted };
  }
  const { pending } = owner;
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  return {
    signal: controller.signal,
    release() {
      if (pending.current !== controller) return false;
      pending.current = undefined;
      return true;
    },
  };
}

export async function runLatestAuthenticatedRequest<T>(
  request: RequestOwner & {
    identity: BrowserIdentity;
    execute: (api: AuthenticatedApiClient, signal: AbortSignal) => Promise<T>;
    onResult: (result: T, signal: AbortSignal) => Promise<void> | void;
    onError: () => void;
    onSettled?: () => void;
  },
): Promise<T | undefined> {
  const { identity, execute, onResult, onError, onSettled } = request;
  const { signal, release } = claim(request);
  try {
    const api = await createAuthenticatedApiClient(identity);
    if (signal.aborted) return undefined;
    const result = await execute(api, signal);
    if (signal.aborted) return undefined;
    await onResult(result, signal);
    return signal.aborted ? undefined : result;
  } catch {
    if (!signal.aborted) onError();
    return undefined;
  } finally {
    if (release()) onSettled?.();
  }
}

export async function handleAuthenticatedAccessRejection({
  result,
  identity,
  companyContextId,
  onCompanyContextRejected,
  onActorRevalidated,
  onWorkspaceAccessRejected = () => undefined,
  signal,
  isCurrent,
}: {
  result: ApiResult<unknown>;
  identity: BrowserIdentity;
  companyContextId: string | undefined;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected?: () => Promise<void> | void;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}): Promise<'unauthorized' | 'forbidden' | undefined> {
  if (result.status !== 'unauthorized' && result.status !== 'forbidden')
    return undefined;
  const live = () => !signal?.aborted && (isCurrent?.() ?? true);
  if (result.status === 'unauthorized') {
    // Existing owners may retire their own signal before reporting401. Explicit
    // captured consumers additionally fence shared rejection against retirement.
    if (isCurrent && !live()) return 'unauthorized';
    await identity.rejectSession();
    return 'unauthorized';
  }
  if (!live()) return 'forbidden';
  const api = await createAuthenticatedApiClient(identity);
  if (!live()) return 'forbidden';
  let selectedContextWasForbidden = false;
  if (companyContextId) {
    const selectedContext = await readCurrentActor({
      api,
      companyContextId,
      signal,
    });
    if (!live()) return 'forbidden';
    if (selectedContext.status === 'unauthorized') {
      await identity.rejectSession();
      return 'unauthorized';
    }
    if (selectedContext.status === 'ok') {
      if (selectedContext.value.activeCompany?.id === companyContextId) {
        await onActorRevalidated(selectedContext.value);
        return 'forbidden';
      }
      onCompanyContextRejected(companyContextId);
      if (!live()) return 'forbidden';
      await onActorRevalidated(selectedContext.value);
      return 'forbidden';
    }
    selectedContextWasForbidden = selectedContext.status === 'forbidden';
  }

  const workspaceContext = await readCurrentActor({ api, signal });
  if (!live()) return 'forbidden';
  if (workspaceContext.status === 'unauthorized') {
    await identity.rejectSession();
    return 'unauthorized';
  }
  if (workspaceContext.status === 'forbidden') {
    await onWorkspaceAccessRejected();
    return 'forbidden';
  }
  if (workspaceContext.status === 'ok') {
    if (companyContextId && selectedContextWasForbidden) {
      onCompanyContextRejected(companyContextId);
      if (!live()) return 'forbidden';
      await onActorRevalidated(workspaceContext.value);
    } else if (!companyContextId) {
      await onActorRevalidated(workspaceContext.value);
    }
  }
  return 'forbidden';
}
