import { createContext, useContext, type ReactNode } from 'react';
import type { ApiResult } from '../api/authenticated-api-client';
import type { ActorContext } from '../access-types';
import { useAccessRecovery } from '../api/use-access-recovery';
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
  const copy = useMissionPlanCopy();
  const { denied, reject } = useAccessRecovery({ ...context, actor });
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
