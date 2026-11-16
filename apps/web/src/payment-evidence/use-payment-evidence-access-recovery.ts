import { useCallback, useLayoutEffect, useRef } from 'react';
import type { BrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import {
  useActorObservation,
  useRequestLifetime,
} from '../api/use-actor-requests';
import { useScopedOperationGroup } from '../api/use-scoped-operation';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type {
  PaymentEvidenceAccessCallbacks,
  PaymentEvidenceRejection,
} from './payment-evidence-types';

/** A full-Actor reply consumes its originating observation, not only read authority. */
export function usePaymentEvidenceAccessRecovery({
  actor,
  identity,
  companyId,
  ...callbacks
}: PaymentEvidenceAccessCallbacks & {
  actor: ActorContext;
  identity: BrowserIdentity;
  companyId: string;
}): PaymentEvidenceRejection {
  const observation = useActorObservation(actor);
  const lifetime = useRequestLifetime(
    identity,
    JSON.stringify([
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
  return useCallback<PaymentEvidenceRejection>(
    async (result, signal, isCurrent) => {
      if (
        (result.status !== 'unauthorized' && result.status !== 'forbidden') ||
        signal.aborted ||
        !isCurrent() ||
        recoveries.isPending()
      )
        return;
      const operation = recoveries.begin();
      if (!operation) return;
      const current = () =>
        recoveries.isLive() &&
        !operation.signal.aborted &&
        !signal.aborted &&
        isCurrent();
      signal.addEventListener('abort', operation.retire, { once: true });
      try {
        await handleAuthenticatedAccessRejection({
          result,
          identity,
          companyContextId: companyId,
          signal: operation.signal,
          isCurrent: current,
          onCompanyContextRejected: (id) => {
            if (current()) latest.current.onCompanyContextRejected?.(id);
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
