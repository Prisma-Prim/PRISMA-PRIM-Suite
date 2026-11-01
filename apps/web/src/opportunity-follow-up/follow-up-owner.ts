import { useEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { opportunityFollowUpAuthority } from '../access/opportunity-follow-up-authority';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';

export type FollowUpAccessProps = {
  actor: ActorContext;
  identity: BrowserIdentity;
  onCompanyContextRejected: (companyId: string) => void;
  onActorRevalidated: (actor: ActorContext) => Promise<void> | void;
  onWorkspaceAccessRejected: () => Promise<void> | void;
};
export type FollowUpAuthority = NonNullable<
  ReturnType<typeof opportunityFollowUpAuthority>
>;

/** Consumed identities retire irreversibly; equivalent Actor reads preserve work. */
export function useFollowUpLifetime(
  props: FollowUpAccessProps,
  scope: string,
): number {
  const owner = useRef({
    identity: props.identity,
    scope,
    generation: 0,
  });
  if (
    owner.current.identity !== props.identity ||
    owner.current.scope !== scope
  ) {
    owner.current = {
      identity: props.identity,
      scope,
      generation: owner.current.generation + 1,
    };
  }
  return owner.current.generation;
}

export function useFollowUpOwner(
  props: FollowUpAccessProps,
  authority: FollowUpAuthority,
) {
  const mounted = useRef(true);
  const sequence = useRef(0);
  const pending = useRef<AbortController | undefined>(undefined);
  const recoveries = useRef(new Set<AbortController>());
  const recoveryOwner = useRef({ actor: props.actor, generation: 0 });
  // A recovery publishes the complete Actor, so even an equivalent newer
  // observation retires that older snapshot without retiring the date command.
  if (recoveryOwner.current.actor !== props.actor) {
    recoveryOwner.current = {
      actor: props.actor,
      generation: recoveryOwner.current.generation + 1,
    };
    for (const controller of recoveries.current) controller.abort();
    recoveries.current.clear();
  }
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    mounted.current = true;
    const activeRecoveries = recoveries.current;
    return () => {
      mounted.current = false;
      sequence.current += 1;
      pending.current?.abort();
      for (const controller of activeRecoveries) controller.abort();
      activeRecoveries.clear();
    };
  }, []);
  function retireRequest() {
    sequence.current += 1;
    pending.current?.abort();
    pending.current = undefined;
  }
  async function request(
    path: string,
    options: ApiRequest = {},
  ): Promise<ApiResult<unknown> | { status: 'retired' }> {
    retireRequest();
    const generation = sequence.current;
    const controller = new AbortController();
    pending.current = controller;
    const live = () =>
      mounted.current &&
      sequence.current === generation &&
      pending.current === controller &&
      !controller.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return { status: 'retired' };
      const result = await api.request<unknown>(path, {
        ...options,
        companyContextId: authority.companyId,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!live()) return { status: 'retired' };
      if (result.status === 'forbidden' || result.status === 'unauthorized') {
        // Recovery outlives this request, but never a newer Actor observation.
        const recovery = new AbortController();
        const recoveryGeneration = recoveryOwner.current.generation;
        recoveries.current.add(recovery);
        const current = () =>
          mounted.current &&
          recoveryOwner.current.generation === recoveryGeneration &&
          !recovery.signal.aborted;
        void handleAuthenticatedAccessRejection({
          result,
          identity: props.identity,
          companyContextId: authority.companyId,
          signal: recovery.signal,
          isCurrent: current,
          onActorRevalidated: (actor) =>
            current() ? latest.current.onActorRevalidated(actor) : undefined,
          onCompanyContextRejected: (companyId) => {
            if (current()) latest.current.onCompanyContextRejected(companyId);
          },
          onWorkspaceAccessRejected: () =>
            current() ? latest.current.onWorkspaceAccessRejected() : undefined,
        })
          .catch(() => undefined)
          .finally(() => {
            recoveries.current.delete(recovery);
          });
      }
      return result;
    } catch {
      return live() ? { status: 'error' } : { status: 'retired' };
    } finally {
      if (live()) pending.current = undefined;
    }
  }
  return { request, retireRequest, isLive: () => mounted.current };
}
