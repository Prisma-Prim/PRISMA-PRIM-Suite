import { requireUuid } from '../access/access-command-validation.js';
import { exactRecord, versionNumber } from './mission-plan.content.js';

/** The exact immutable source identity accepted by native creation callers. */
export function readMissionPlanSelection(value: unknown) {
  const row = exactRecord(value, ['planId', 'versionId', 'versionNumber']);
  return {
    planId: requireUuid(row.planId),
    versionId: requireUuid(row.versionId),
    versionNumber: versionNumber(row.versionNumber),
  };
}
export type MissionPlanSelection = ReturnType<typeof readMissionPlanSelection>;
