import { useCallback, useState, type ComponentProps } from 'react';
import {
  MissionPlanBoundary,
  type MissionPlanProps,
} from '../mission-plan/MissionPlanWorkspace';
import { MissionPlanPicker } from '../mission-plan/MissionPlanPicker';
import { MissionPlanContent } from '../mission-plan/MissionPlanContent';
import type { PlanVersion } from '../mission-plan/mission-plan-response';
import type { PlanContext } from '../mission-plan/use-mission-plan-io';
import { useMissionPlanRejection } from '../mission-plan/mission-plan-access-lifetime';
import { ContractProjectCreatePanel } from './ContractProjectCreatePanel';
export type ContractMissionPlanContext = Omit<
  MissionPlanProps,
  'identity' | 'onActivityRecorded'
>;
type CreationProps = Omit<
  ComponentProps<typeof ContractProjectCreatePanel>,
  'source' | 'reject'
>;
export function ContractMissionPlanCreatePanel({
  missionPlan,
  ...creation
}: CreationProps & { missionPlan: ContractMissionPlanContext }) {
  if (missionPlan.actor.activeCompany?.id !== creation.companyId) return null;
  return (
    <MissionPlanBoundary
      {...missionPlan}
      identity={creation.identity}
      purpose="create"
    >
      {(authority) => (
        <ConfiguredCreation
          creation={creation}
          context={{ ...missionPlan, identity: creation.identity, authority }}
        />
      )}
    </MissionPlanBoundary>
  );
}
function ConfiguredCreation({
  creation,
  context,
}: {
  creation: CreationProps;
  context: PlanContext;
}) {
  const [selected, setSelected] = useState<PlanVersion | null>(null),
    [blocked, setBlocked] = useState(false);
  const reject = useMissionPlanRejection(),
    report = creation.onProtectionChange;
  const onProtectionChange = useCallback(
    (value: boolean) => {
      setBlocked(value);
      report(value);
    },
    [report],
  );
  return (
    <>
      <MissionPlanPicker
        context={context}
        disabled={
          blocked || creation.protectedCommand || !context.authority.canCreate
        }
        onSelected={setSelected}
      />
      {selected && <MissionPlanContent version={selected} />}
      <ContractProjectCreatePanel
        {...creation}
        source={{ kind: 'missionPlan', selected }}
        protectedCommand={
          creation.protectedCommand || !context.authority.canCreate
        }
        onProtectionChange={onProtectionChange}
        reject={async (result) => {
          if (
            result.status === 'unauthorized' ||
            result.status === 'forbidden'
          ) {
            reject(result);
            return result.status;
          }
          return undefined;
        }}
      />
    </>
  );
}
