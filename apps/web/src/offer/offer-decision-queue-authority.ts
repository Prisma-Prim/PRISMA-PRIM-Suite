import { grantOf, holds } from '../access/company-grants';
import type { ActorContext } from '../access-types';

export function offerDecisionQueueAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const approver = grantOf(c, 'company_offer_approver');
  const intake = grantOf(c, 'company_commercial_intake');
  const read = Boolean(
    actor.active &&
    c &&
    holds(c, 'company_offer_approver', 'commercial.offer.read') &&
    holds(c, 'company_offer_approver', 'commercial.offer.approve') &&
    holds(c, 'company_commercial_intake', 'commercial.request.read') &&
    holds(c, 'company_commercial_intake', 'commercial.opportunity.read'),
  );
  const modelDecision =
    read &&
    holds(c, 'company_offer_approver', 'commercial.offer.model_based.approve');
  return {
    read,
    modelDecision,
    key: JSON.stringify([
      actor.active,
      actor.workspaceId,
      actor.internalUserId,
      actor.workspaceMembershipId,
      c?.id,
      approver?.assignmentId,
      approver?.permissionSetVersion,
      intake?.assignmentId,
      intake?.permissionSetVersion,
      read,
      modelDecision,
    ]),
  };
}
