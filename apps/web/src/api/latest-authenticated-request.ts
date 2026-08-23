import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
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
  signal,
}: {
  result: ApiResult<unknown>;
  identity: BrowserIdentity;
  companyContextId: string | undefined;
  onCompanyContextRejected: (companyContextId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  signal?: AbortSignal;
}): Promise<'unauthorized' | 'forbidden' | undefined> {
  if (result.status === 'unauthorized') {
    await identity.rejectSession();
    return 'unauthorized';
  }
  if (result.status !== 'forbidden') return undefined;
  if (!companyContextId) return 'forbidden';
  const api = await createAuthenticatedApiClient(identity);
  if (signal?.aborted) return 'forbidden';
  const context = await api.request<ActorContext>('/access/current-actor', {
    companyContextId,
    signal,
  });
  if (signal?.aborted) return 'forbidden';
  if (context.status === 'unauthorized') {
    await identity.rejectSession();
    return 'unauthorized';
  }
  if (context.status === 'forbidden') {
    onCompanyContextRejected(companyContextId);
  }
  if (context.status === 'ok') {
    if (context.value.activeCompany?.id !== companyContextId) {
      onCompanyContextRejected(companyContextId);
    } else {
      await onActorRevalidated(context.value);
    }
  }
  return 'forbidden';
}
