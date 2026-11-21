import type { CertificationAuthority } from './certification-access';
import type { CertificationCaseView } from './certification-command';
import { approvedTeam, leadsTeam } from './certification-stages';
import { linkedToAnyTeamVersion } from './certification-team-draft';

export type FindingRoles = { leader: boolean; independentApprover: boolean };

/**
 * What this actor may record on Findings, as the server checks it: the
 * auditor linked to the approved team's leader, or an approver linked to
 * no member of any team version.
 */
export function findingRoles(
  view: Pick<CertificationCaseView, 'caseDetail' | 'timeline'>,
  workspaceMembershipId: string,
  authority: Pick<CertificationAuthority, 'audit' | 'approve'>,
): FindingRoles {
  const current = view.caseDetail;
  const team = approvedTeam(current);
  const open = current.status === 'open';
  return {
    leader:
      open &&
      authority.audit &&
      team !== undefined &&
      leadsTeam(team, workspaceMembershipId),
    independentApprover:
      open &&
      authority.approve &&
      !linkedToAnyTeamVersion(view.timeline, workspaceMembershipId),
  };
}
