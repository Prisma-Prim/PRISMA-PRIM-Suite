import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { holdsOfferRead } from './contract-grants';

export function contractDecisionQueueAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const approver = grantOf(c, 'company_contract_approver');
  const intake = grantOf(c, 'company_commercial_intake');
  const read = Boolean(
    actor.active &&
    c &&
    holds(c, 'company_contract_approver', 'commercial.contract.read') &&
    holds(c, 'company_contract_approver', 'commercial.contract.approve') &&
    holds(c, 'company_commercial_intake', 'commercial.request.read') &&
    holds(c, 'company_commercial_intake', 'commercial.opportunity.read'),
  );
  const modelCandidate =
    read &&
    holds(
      c,
      'company_contract_approver',
      'commercial.contract.model_based.approve',
    );
  const offerPreparer = grantOf(c, 'company_offer_preparer');
  const offerApprover = grantOf(c, 'company_offer_approver');
  const sourcePreparer = offerPreparer
    ? [offerPreparer.assignmentId, offerPreparer.permissionSetVersion]
    : null;
  const sourceApprover = offerApprover
    ? [offerApprover.assignmentId, offerApprover.permissionSetVersion]
    : null;
  const sourceRead = holdsOfferRead(c);
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
      approver?.assignmentId,
      approver?.permissionSetVersion,
      intake?.assignmentId,
      intake?.permissionSetVersion,
      read,
      modelDecision,
      // Illustrative discovery consumes no source Offer authority.
      modelCandidate ? [sourcePreparer, sourceApprover, sourceRead] : null,
    ]),
  };
}
