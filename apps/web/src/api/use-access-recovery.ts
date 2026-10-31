import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from './latest-authenticated-request';

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

/** Recovery outlives protected children, but never its consumed scope or Actor. */
export function useAccessRecovery(inputs: Inputs) {
  const [denied, setDenied] = useState(false);
  const rejected = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const latest = useRef(inputs);
  const owner = useRef({
    identity: inputs.identity,
    actor: inputs.actor,
    key: inputs.authority.key,
    companyId: inputs.authority.companyId,
    generation: 0,
  });

  const retire = useCallback(() => {
    owner.current.generation += 1;
    const controller = pending.current;
    pending.current = null;
    controller?.abort();
  }, []);

  const scopeChanged =
    owner.current.identity !== inputs.identity ||
    owner.current.key !== inputs.authority.key ||
    owner.current.companyId !== inputs.authority.companyId;
  // Recovery publishes a complete Actor; equal feature authority does not make
  // an older snapshot current. Actor-only replacement keeps the denial latch.
  if (scopeChanged || owner.current.actor !== inputs.actor) {
    retire();
    owner.current = {
      identity: inputs.identity,
      actor: inputs.actor,
      key: inputs.authority.key,
      companyId: inputs.authority.companyId,
      generation: owner.current.generation,
    };
    if (scopeChanged) {
      rejected.current = false;
      if (denied) setDenied(false);
    }
  }
  latest.current = inputs;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      retire();
    };
  }, [retire]);

  const reject = useCallback((result: Recovery['result']) => {
    if (
      !mounted.current ||
      rejected.current ||
      (result.status !== 'forbidden' && result.status !== 'unauthorized')
    )
      return;
    rejected.current = true;
    const controller = new AbortController();
    pending.current = controller;
    const generation = owner.current.generation;
    const live = () =>
      mounted.current &&
      owner.current.generation === generation &&
      pending.current === controller &&
      !controller.signal.aborted;
    const current = latest.current;
    setDenied(true);
    void handleAuthenticatedAccessRejection({
      result,
      identity: current.identity,
      companyContextId: current.authority.companyId,
      signal: controller.signal,
      onActorRevalidated: (actor) =>
        live() ? latest.current.onActorRevalidated?.(actor) : undefined,
      onCompanyContextRejected: (companyId) => {
        if (live()) latest.current.onCompanyContextRejected?.(companyId);
      },
      onWorkspaceAccessRejected: () =>
        live() ? latest.current.onWorkspaceAccessRejected?.() : undefined,
    })
      .catch(() => undefined)
      .finally(() => {
        if (pending.current === controller) pending.current = null;
      });
  }, []);

  const retry = useCallback(() => {
    retire();
    rejected.current = false;
    setDenied(false);
  }, [retire]);

  return { denied, reject, retry };
}
