import type { ActorContext } from '../access-types';

export function offerDecisionQueueAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const knownApprover =
    c?.offerApproverPermissionSetVersion === 'v1' ||
    c?.offerApproverPermissionSetVersion === 'v2';
  const knownIntake = ['v1', 'v2', 'v3', 'v4'].some(
    (v) => v === c?.commercialIntakePermissionSetVersion,
  );
  const read = Boolean(
    actor.active &&
    c &&
    knownApprover &&
    knownIntake &&
    c.offerApproverAssignmentId &&
    c.commercialIntakePermissionAssignmentId &&
    c.offerPermissions?.includes('commercial.offer.read') &&
    c.offerPermissions.includes('commercial.offer.approve') &&
    c.commercialIntakePermissions?.includes('commercial.request.read') &&
    c.commercialIntakePermissions.includes('commercial.opportunity.read'),
  );
  const modelDecision = Boolean(
    read &&
    c?.offerApproverPermissionSetVersion === 'v2' &&
    c.offerPermissions?.includes('commercial.offer.model_based.approve'),
  );
  return {
    read,
    modelDecision,
    key: JSON.stringify([
      actor.active,
      actor.workspaceId,
      actor.internalUserId,
      actor.workspaceMembershipId,
      c?.id,
      c?.offerApproverAssignmentId,
      c?.offerApproverPermissionSetVersion,
      c?.commercialIntakePermissionAssignmentId,
      c?.commercialIntakePermissionSetVersion,
      read,
      modelDecision,
    ]),
  };
}
