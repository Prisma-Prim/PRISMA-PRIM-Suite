import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { readCurrentActor } from '../access/current-actor';
import {
  createAuthenticatedApiClient,
  type AuthenticatedApiClient,
  type ApiResult,
} from './authenticated-api-client';

export async function runLatestAuthenticatedRequest<T>({
  pending,
  identity,
  execute,
  onResult,
  onError,
  onSettled,
}: {
  pending: { current: AbortController | undefined };
  identity: BrowserIdentity;
  execute: (api: AuthenticatedApiClient, signal: AbortSignal) => Promise<T>;
  onResult: (result: T, signal: AbortSignal) => Promise<void> | void;
  onError: () => void;
  onSettled?: () => void;
}): Promise<T | undefined> {
  pending.current?.abort();
  const controller = new AbortController();
  pending.current = controller;
  try {
    const api = await createAuthenticatedApiClient(identity);
    if (controller.signal.aborted) return undefined;
    const result = await execute(api, controller.signal);
    if (controller.signal.aborted) return undefined;
    await onResult(result, controller.signal);
    return controller.signal.aborted ? undefined : result;
  } catch {
    if (!controller.signal.aborted) onError();
    return undefined;
  } finally {
    if (pending.current === controller) {
      pending.current = undefined;
      onSettled?.();
    }
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
