import { useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';

export type PaymentAccessProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
};
export function usePaymentLifetime(identity: BrowserIdentity, scope: string) {
  const owner = useRef({ identity, scope, generation: 0 });
  if (owner.current.identity !== identity || owner.current.scope !== scope)
    owner.current = {
      identity,
      scope,
      generation: owner.current.generation + 1,
    };
  return owner.current.generation;
}
type Result<T> = ApiResult<T> | { status: 'retired' };
export type PaymentAccessRecovery = (result: ApiResult<unknown>) => void;
/** Recovery may belong to a parent that survives a refused editor/source view. */
export function usePaymentOwner(
  props: PaymentAccessProps,
  companyId: string,
  scope: string,
  recoverThrough?: PaymentAccessRecovery,
) {
  const lifetime = usePaymentLifetime(props.identity, scope);
  const state = useRef({
    lifetime,
    mounted: true,
    pending: new Set<AbortController>(),
  });
  const recovery = useRef({
    actor: props.actor,
    generation: 0,
    pending: new Set<AbortController>(),
  });
  const latest = useRef(props);
  latest.current = props;
  const delegatedRecovery = useRef(recoverThrough);
  delegatedRecovery.current = recoverThrough;
  if (state.current.lifetime !== lifetime) {
    for (const controller of state.current.pending) controller.abort();
    for (const controller of recovery.current.pending) controller.abort();
    recovery.current.pending.clear();
    state.current = {
      lifetime,
      mounted: true,
      pending: new Set(),
    };
  }
  if (recovery.current.actor !== props.actor) {
    for (const controller of recovery.current.pending) controller.abort();
    recovery.current = {
      actor: props.actor,
      generation: recovery.current.generation + 1,
      pending: new Set(),
    };
  }
  useLayoutEffect(() => {
    state.current.mounted = true;
    return () => {
      state.current.mounted = false;
      for (const controller of state.current.pending) controller.abort();
      for (const controller of recovery.current.pending) controller.abort();
    };
  }, []);
  function live() {
    return state.current.mounted && state.current.lifetime === lifetime;
  }
  function recover(result: ApiResult<unknown>) {
    if (
      !live() ||
      (result.status !== 'forbidden' && result.status !== 'unauthorized')
    )
      return;
    const observed = recovery.current;
    if (observed.pending.size) return;
    const controller = new AbortController();
    observed.pending.add(controller);
    const current = () =>
      live() && recovery.current === observed && !controller.signal.aborted;
    void handleAuthenticatedAccessRejection({
      result,
      identity: props.identity,
      companyContextId: companyId,
      signal: controller.signal,
      isCurrent: current,
      onActorRevalidated: (actor) =>
        current() ? latest.current.onActorRevalidated(actor) : undefined,
      onCompanyContextRejected: (company) => {
        if (current()) latest.current.onCompanyContextRejected(company);
      },
      onWorkspaceAccessRejected: () =>
        current() ? latest.current.onWorkspaceAccessRejected() : undefined,
    })
      .catch(() => undefined)
      .finally(() => observed.pending.delete(controller));
  }
  async function run<T>(
    operation: (
      api: AuthenticatedApiClient,
      signal: AbortSignal,
      current: () => boolean,
    ) => Promise<ApiResult<T>>,
  ): Promise<Result<T>> {
    const observed = state.current;
    const controller = new AbortController();
    observed.pending.add(controller);
    const current = () =>
      live() && state.current === observed && !controller.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!current()) return { status: 'retired' };
      const result = await operation(api, controller.signal, current);
      if (!current()) return { status: 'retired' };
      (delegatedRecovery.current ?? recover)(result);
      return result;
    } catch {
      return current() ? { status: 'error' } : { status: 'retired' };
    } finally {
      observed.pending.delete(controller);
    }
  }
  function retireRequests() {
    for (const controller of state.current.pending) controller.abort();
    state.current.pending.clear();
  }
  function retire() {
    retireRequests();
    for (const controller of recovery.current.pending) controller.abort();
    recovery.current.pending.clear();
  }
  function request(path: string, options: ApiRequest = {}) {
    return run((api, signal) =>
      api.request(path, {
        ...options,
        signal,
        companyContextId: companyId,
        cache: 'no-store',
      }),
    );
  }
  return { request, run, recover, retire, retireRequests, isLive: live };
}
export function accessRejected(result: { status: string }) {
  return result.status === 'unauthorized' || result.status === 'forbidden';
}
