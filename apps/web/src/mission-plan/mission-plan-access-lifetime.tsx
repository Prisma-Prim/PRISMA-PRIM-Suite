import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import type { ActorContext } from '../access-types';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type { PlanContext } from './use-mission-plan-io';
import { useMissionPlanCopy } from './mission-plan.copy';
const Rejection = createContext<((result: ApiResult<unknown>) => void) | null>(
  null,
);

/** Revalidation outlives the retired consuming reads/commands, but never its scope. */
export function MissionPlanAccessLifetime({
  context,
  actor,
  children,
}: {
  context: PlanContext;
  actor: ActorContext;
  children: ReactNode;
}) {
  const [denied, setDenied] = useState(false),
    copy = useMissionPlanCopy();
  const rejected = useRef(false),
    pending = useRef<AbortController | null>(null),
    current = useRef(context);
  const owner = useRef({
    key: context.authority.key,
    identity: context.identity,
    actor,
    generation: 0,
  });
  const readScopeChanged =
    owner.current.key !== context.authority.key ||
    owner.current.identity !== context.identity;
  // Recovery publishes a complete actor. A newer snapshot retires it even when this reader's rights did not change.
  if (readScopeChanged || owner.current.actor !== actor) {
    pending.current?.abort();
    pending.current = null;
    owner.current = {
      key: context.authority.key,
      identity: context.identity,
      actor,
      generation: owner.current.generation + 1,
    };
    if (readScopeChanged) {
      rejected.current = false;
      if (denied) setDenied(false);
    }
  }
  current.current = context;
  useEffect(() => () => pending.current?.abort(), []);
  function reject(result: ApiResult<unknown>) {
    if (rejected.current) return;
    rejected.current = true;
    const controller = new AbortController();
    pending.current = controller;
    const generation = owner.current.generation;
    const live = () =>
      owner.current.generation === generation &&
      pending.current === controller &&
      !controller.signal.aborted;
    setDenied(true);
    const c = current.current;
    void handleAuthenticatedAccessRejection({
      result,
      signal: controller.signal,
      identity: c.identity,
      companyContextId: c.authority.companyId,
      onActorRevalidated: (actor) =>
        live() ? current.current.onActorRevalidated?.(actor) : undefined,
      onCompanyContextRejected: (id) =>
        live() ? current.current.onCompanyContextRejected?.(id) : undefined,
      onWorkspaceAccessRejected: () =>
        live() ? current.current.onWorkspaceAccessRejected?.() : undefined,
    }).catch(() => undefined);
  }
  return denied ? (
    <p role="alert">{copy('denied')}</p>
  ) : (
    <Rejection.Provider value={reject}>{children}</Rejection.Provider>
  );
}
export function useMissionPlanRejection() {
  const reject = useContext(Rejection);
  if (!reject)
    throw new Error(
      'Mission-plan operations require their scoped access lifetime.',
    );
  return reject;
}
