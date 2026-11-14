import { grantOf, holds } from './company-grants';
import type { ActorContext } from './current-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_CAPTURE = /^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u;

export interface OpportunityFollowUpAuthority {
  key: string;
  companyId: string;
  canManage: boolean;
  readCapture: string;
}

/** Feature-local compatibility checks retire only this owner's authority. */
export function opportunityFollowUpAuthority(
  actor: ActorContext,
): OpportunityFollowUpAuthority | undefined {
  const company = actor.activeCompany;
  if (!actor.active || !company) return undefined;
  const coordinator = grantOf(
    company,
    'company_opportunity_follow_up_coordinator',
  );
  const intake = grantOf(company, 'company_commercial_intake');
  const readCapture = company.opportunityFollowUpReadCapture;
  if (
    coordinator === undefined ||
    !UUID.test(coordinator.assignmentId) ||
    intake === undefined ||
    !UUID.test(intake.assignmentId) ||
    typeof readCapture !== 'string' ||
    !READ_CAPTURE.test(readCapture) ||
    !holds(
      company,
      'company_opportunity_follow_up_coordinator',
      'commercial.opportunity.follow_up.read',
    ) ||
    !holds(company, 'company_commercial_intake', 'commercial.request.read') ||
    !holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
  )
    return undefined;
  return {
    companyId: company.id,
    readCapture,
    // Commercial Intake v1 has no next-action update, so it cannot manage.
    canManage:
      holds(
        company,
        'company_opportunity_follow_up_coordinator',
        'commercial.opportunity.follow_up.manage',
      ) &&
      holds(
        company,
        'company_commercial_intake',
        'commercial.opportunity.next_action.update',
      ),
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      company.id,
      coordinator,
      intake,
      readCapture,
    ]),
  };
}
