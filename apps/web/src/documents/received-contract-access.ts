import type { ActorContext } from '../access-types';

export function hasReceivedContractAccess(
  company: ActorContext['activeCompany'],
) {
  return (
    company?.receivedContractAccessPermissionSetVersion === 'v1' &&
    typeof company.receivedContractAccessAssignmentId === 'string' &&
    company.receivedContractAccessAssignmentId.length > 0 &&
    company.documentPermissions?.includes(
      'document.received_contract.access',
    ) === true
  );
}
export function canReadReceivedContractRelation(
  company: ActorContext['activeCompany'],
) {
  return (
    company?.contractPermissions?.includes('commercial.contract.read') ===
      true &&
    company.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ) === true
  );
}
/** Only the live captures consumed by Contract/Opportunity read, never cost/model grants. */
export function receivedContractSourceAuthority(
  company: ActorContext['activeCompany'],
) {
  return JSON.stringify([
    canReadReceivedContractRelation(company),
    company?.contractPermissionAssignmentId,
    company?.contractPermissionSetVersion,
    company?.contractApproverAssignmentId,
    company?.contractApproverPermissionSetVersion,
    company?.contractEarlyPreparationAssignmentId,
    company?.contractEarlyPreparationPermissionSetVersion,
    company?.commercialIntakePermissionAssignmentId,
    company?.commercialIntakePermissionSetVersion,
  ]);
}
