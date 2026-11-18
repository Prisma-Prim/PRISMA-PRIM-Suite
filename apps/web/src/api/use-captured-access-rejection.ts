import { useCallback, useLayoutEffect, useRef } from 'react';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from './latest-authenticated-request';
import { useActorObservation, useRequestLifetime } from './use-actor-requests';
import { useScopedOperationGroup } from './use-scoped-operation';

type Rejection = Parameters<typeof handleAuthenticatedAccessRejection>[0];
type Inputs = Pick<
  Rejection,
  | 'identity'
  | 'companyContextId'
  | 'onActorRevalidated'
  | 'onCompanyContextRejected'
  | 'onWorkspaceAccessRejected'
> & { actor: ActorContext; scope: string };

/** Await the existing protocol under its complete Actor; omit source only for recovery that outlives a retired projection. */
export function useCapturedAccessRejection(inputs: Inputs) {
  const lifetime = useRequestLifetime(
    inputs.identity,
    JSON.stringify([
      inputs.scope,
      inputs.companyContextId,
      inputs.identity.loaded,
      inputs.identity.signedIn,
      inputs.actor.active,
      inputs.actor.workspaceId,
      inputs.actor.internalUserId,
      inputs.actor.workspaceMembershipId,
    ]),
  );
  const observation = useActorObservation(inputs.actor);
  const requests = useScopedOperationGroup(
    JSON.stringify([lifetime, observation]),
  );
  const latest = useRef(inputs);
  useLayoutEffect(() => {
    latest.current = inputs;
  });
  const { identity, companyContextId } = inputs;
  return useCallback(
    async (result: Rejection['result'], source?: AbortSignal) => {
      if (
        source?.aborted ||
        (result.status !== 'unauthorized' && result.status !== 'forbidden')
      )
        return undefined;
      const operation = requests.begin();
      // The native denial still hides this projection; an old full Actor cannot recover its replacement.
      if (!operation) return result.status;
      const current = () => !source?.aborted && !operation.signal.aborted;
      source?.addEventListener('abort', operation.retire, { once: true });
      try {
        return await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId,
          signal: operation.signal,
          isCurrent: current,
          onActorRevalidated: (actor) =>
            current() ? latest.current.onActorRevalidated(actor) : undefined,
          onCompanyContextRejected: (company) => {
            if (current()) latest.current.onCompanyContextRejected(company);
          },
          onWorkspaceAccessRejected: () =>
            current()
              ? latest.current.onWorkspaceAccessRejected?.()
              : undefined,
        });
      } finally {
        source?.removeEventListener('abort', operation.retire);
        operation.release();
      }
    },
    [requests, identity, companyContextId],
  );
}
