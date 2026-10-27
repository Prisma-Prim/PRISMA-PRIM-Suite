export interface MissionPlanVersionPublishedActivityEvent {
  id: string;
  action: 'mission_plan.version.published';
  occurredAt: string;
  actor: { internalUserId: string; displayName: string };
  target: {
    type: 'mission_plan_version';
    companyId: string;
    planId: string;
    versionId: string;
  };
  metadata: { versionNumber: number; activityCount: number };
}
