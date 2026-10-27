import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import { handleAuthenticatedAccessRejection } from '../api/latest-authenticated-request';
import type { PlanContext } from './use-mission-plan-io';
import { useMissionPlanCopy } from './mission-plan.copy';
const Rejection = createContext<((result: ApiResult<unknown>) => void) | null>(
  null,
);

/** Revalidation outlives the retired consuming reads/commands, but never its scope. */
export function MissionPlanAccessLifetime({
  context,
  children,
}: {
  context: PlanContext;
  children: ReactNode;
}) {
  const [denied, setDenied] = useState(false),
    copy = useMissionPlanCopy();
  const rejected = useRef(false),
    pending = useRef<AbortController | null>(null),
    current = useRef(context);
  current.current = context;
  useEffect(() => () => pending.current?.abort(), []);
  function reject(result: ApiResult<unknown>) {
    if (rejected.current) return;
    rejected.current = true;
    const controller = new AbortController();
    pending.current = controller;
    setDenied(true);
    const c = current.current;
    void handleAuthenticatedAccessRejection({
      result,
      signal: controller.signal,
      identity: c.identity,
      companyContextId: c.authority.companyId,
      onActorRevalidated: (actor) =>
        current.current.onActorRevalidated?.(actor),
      onCompanyContextRejected: (id) =>
        current.current.onCompanyContextRejected?.(id),
      onWorkspaceAccessRejected: () =>
        current.current.onWorkspaceAccessRejected?.(),
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
