import type { ActorContext } from '../access-types';

export function contractDecisionQueueAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const knownApprover =
    c?.contractApproverPermissionSetVersion === 'v1' ||
    c?.contractApproverPermissionSetVersion === 'v2';
  const knownIntake = ['v1', 'v2', 'v3', 'v4'].some(
    (v) => v === c?.commercialIntakePermissionSetVersion,
  );
  const read = Boolean(
    actor.active &&
    c &&
    knownApprover &&
    knownIntake &&
    c.contractApproverAssignmentId &&
    c.commercialIntakePermissionAssignmentId &&
    c.contractPermissions?.includes('commercial.contract.read') &&
    c.contractPermissions.includes('commercial.contract.approve') &&
    c.commercialIntakePermissions?.includes('commercial.request.read') &&
    c.commercialIntakePermissions.includes('commercial.opportunity.read'),
  );
  const modelCandidate = Boolean(
    read &&
    c?.contractApproverPermissionSetVersion === 'v2' &&
    c.contractPermissions?.includes('commercial.contract.model_based.approve'),
  );
  const sourcePreparer =
    c?.offerPermissionAssignmentId &&
    ['v1', 'v2', 'v3'].some((v) => v === c.offerPermissionSetVersion)
      ? [c.offerPermissionAssignmentId, c.offerPermissionSetVersion]
      : null;
  const sourceApprover =
    c?.offerApproverAssignmentId &&
    ['v1', 'v2'].some((v) => v === c.offerApproverPermissionSetVersion)
      ? [c.offerApproverAssignmentId, c.offerApproverPermissionSetVersion]
      : null;
  const sourceRead = Boolean(
    c?.offerPermissions?.includes('commercial.offer.read') &&
    (sourcePreparer || sourceApprover),
  );
  const modelDecision = modelCandidate && sourceRead;
  return {
    read,
    modelDecision,
    key: JSON.stringify([
      actor.active,
      actor.workspaceId,
      actor.internalUserId,
      actor.workspaceMembershipId,
      c?.id,
      c?.contractApproverAssignmentId,
      c?.contractApproverPermissionSetVersion,
      c?.commercialIntakePermissionAssignmentId,
      c?.commercialIntakePermissionSetVersion,
      read,
      modelDecision,
      // Legacy discovery consumes no source Offer authority.
      modelCandidate ? [sourcePreparer, sourceApprover, sourceRead] : null,
    ]),
  };
}
