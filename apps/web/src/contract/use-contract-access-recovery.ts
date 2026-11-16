import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import type { ContractPanelProps } from './IllustrativeContractPanel';

export type ContractRejection = (
  result: ApiResult<unknown>,
  signal: AbortSignal,
) => ReturnType<typeof handleAuthenticatedAccessRejection>;

/** A full-Actor reply belongs to the observation that began the HTTP attempt. */
export function useContractAccessRecovery({
  actor,
  identity,
  ...callbacks
}: Pick<
  ContractPanelProps,
  | 'actor'
  | 'identity'
  | 'onCompanyContextRejected'
  | 'onActorRevalidated'
  | 'onWorkspaceAccessRejected'
>): ContractRejection {
  const companyId = actor.activeCompany?.id;
  const observation = useActorObservation(actor);
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
      actor.active,
      actor.workspaceId,
      actor.internalUserId,
      actor.workspaceMembershipId,
      companyId,
      observation,
      identity.loaded,
      identity.signedIn,
    ]),
  );
  const recoveries = useScopedOperationGroup(String(lifetime));
  const latest = useRef(callbacks);
  useLayoutEffect(() => {
    latest.current = callbacks;
  });
  return useCallback<ContractRejection>(
    async (result, signal) => {
      if (result.status !== 'unauthorized' && result.status !== 'forbidden')
        return;
      if (signal.aborted || recoveries.isPending()) return result.status;
      const operation = recoveries.begin();
      if (!operation) return result.status;
      const current = () =>
        recoveries.isLive() && !operation.signal.aborted && !signal.aborted;
      signal.addEventListener('abort', operation.retire, { once: true });
      try {
        return await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: operation.signal,
          isCurrent: current,
          onCompanyContextRejected: (id) => {
            if (current()) latest.current.onCompanyContextRejected(id);
          },
          onActorRevalidated: (next) =>
            current() ? latest.current.onActorRevalidated?.(next) : undefined,
          onWorkspaceAccessRejected: () =>
            current()
              ? latest.current.onWorkspaceAccessRejected?.()
              : undefined,
        });
      } finally {
        signal.removeEventListener('abort', operation.retire);
        operation.release();
      }
    },
    [companyId, identity, recoveries],
  );
}
