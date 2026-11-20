import { useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import type { opportunityFollowUpAuthority } from '../access/opportunity-follow-up-authority';
import {
  createAuthenticatedApiClient,
  type ApiRequest,
  type ApiResult,
} from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';

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

export function useFollowUpOwner(
  props: FollowUpAccessProps,
  authority: FollowUpAuthority,
) {
  const lifetime = useRequestLifetime(props.identity, authority.key);
  const observation = useActorObservation(props.actor);
  const work = useScopedOperationGroup(String(lifetime));
  const recoveryWork = useScopedOperationGroup(
    JSON.stringify([lifetime, observation]),
  );
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  async function request(
    path: string,
    options: ApiRequest = {},
  ): Promise<ApiResult<unknown> | { status: 'retired' }> {
    const operation = work.beginLatest();
    if (!operation) return { status: 'retired' };
    const live = () => !operation.signal.aborted;
    try {
      const api = await createAuthenticatedApiClient(props.identity);
      if (!live()) return { status: 'retired' };
      const result = await api.request(path, {
        ...options,
        companyContextId: authority.companyId,
        signal: operation.signal,
        cache: 'no-store',
      });
      if (!live()) return { status: 'retired' };
      if (result.status === 'forbidden' || result.status === 'unauthorized') {
        // Recovery outlives this request, but never a newer Actor observation.
        const recovery = recoveryWork.begin();
        if (!recovery) return result;
        const current = () => !recovery.signal.aborted;
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
          .finally(recovery.release);
      }
      return result;
    } catch {
      return live() ? { status: 'error' } : { status: 'retired' };
    } finally {
      operation.release();
    }
  }
  return { request, retireRequest: work.retire, isLive: work.isLive };
}
