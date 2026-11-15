import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from './latest-authenticated-request';
import { useActorObservation, useRequestLifetime } from './use-actor-requests';
import { useScopedOperationGroup } from './use-scoped-operation';

type Recovery = Parameters<typeof handleAuthenticatedAccessRejection>[0];
type Inputs = Pick<Recovery, 'identity'> &
  Partial<
    Pick<
      Recovery,
      | 'onActorRevalidated'
      | 'onCompanyContextRejected'
      | 'onWorkspaceAccessRejected'
    >
  > & {
    actor: ActorContext;
    authority: { key: string; companyId: string };
  };

/** Recovery outlives protected children, but never its committed scope or Actor. */
export function useAccessRecovery(inputs: Inputs) {
  const lifetime = useRequestLifetime(
    inputs.identity,
    JSON.stringify([
      inputs.authority.key,
      inputs.authority.companyId,
      inputs.identity.loaded,
      inputs.identity.signedIn,
      inputs.actor.active,
      inputs.actor.workspaceId,
      inputs.actor.internalUserId,
      inputs.actor.workspaceMembershipId,
    ]),
  );
  const observation = useActorObservation(inputs.actor);
  const recovery = useScopedOperationGroup(
    JSON.stringify([lifetime, observation]),
  );
  const latch = useMemo(() => ({ rejected: false }), [lifetime]);
  const [denial, setDenial] = useState<{
    lifetime: number;
    denied: boolean;
  } | null>(null);
  const latest = useRef(inputs);
  useLayoutEffect(() => {
    latest.current = inputs;
  });
  const { identity, actor, authority } = inputs;
  const available = identity.loaded && identity.signedIn && actor.active;

  const reject = useCallback(
    (result: Recovery['result']) => {
      if (
        !available ||
        !recovery.isLive() ||
        latch.rejected ||
        (result.status !== 'forbidden' && result.status !== 'unauthorized')
      )
        return;
      const operation = recovery.begin();
      if (!operation) return;
      const current = () => recovery.isLive() && !operation.signal.aborted;
      latch.rejected = true;
      setDenial({ lifetime, denied: true });
      void handleAuthenticatedAccessRejection({
        result,
        identity,
        companyContextId: authority.companyId,
        signal: operation.signal,
        isCurrent: current,
        onActorRevalidated: (revalidated) =>
          current()
            ? latest.current.onActorRevalidated?.(revalidated)
            : undefined,
        onCompanyContextRejected: (companyId) => {
          if (current()) latest.current.onCompanyContextRejected?.(companyId);
        },
        onWorkspaceAccessRejected: () =>
          current() ? latest.current.onWorkspaceAccessRejected?.() : undefined,
      })
        .catch(() => undefined)
        .finally(operation.release);
    },
    [available, recovery, latch, lifetime, identity, authority.companyId],
  );

  const retry = useCallback(() => {
    if (!recovery.isLive()) return;
    recovery.retire();
    latch.rejected = false;
    setDenial({ lifetime, denied: false });
  }, [recovery, latch, lifetime]);

  return {
    denied: denial?.lifetime === lifetime && denial.denied,
    reject,
    retry,
  };
}
