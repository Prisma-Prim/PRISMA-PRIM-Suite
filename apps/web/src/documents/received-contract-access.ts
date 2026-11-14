import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { holdsContractRead } from './document-grants';

export function hasReceivedContractAccess(
  company: ActorContext['activeCompany'],
) {
  return holds(
    company,
    'company_received_contract_access',
    'document.received_contract.access',
  );
}
export function canReadReceivedContractRelation(
  company: ActorContext['activeCompany'],
) {
  return (
    holdsContractRead(company) &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
  );
}
/** Only the live captures consumed by Contract/Opportunity read, never cost/model grants. */
export function receivedContractSourceAuthority(
  company: ActorContext['activeCompany'],
) {
  const preparer = grantOf(company, 'company_contract_preparer');
  const approver = grantOf(company, 'company_contract_approver');
  const earlyPreparation = grantOf(
    company,
    'company_contract_early_preparation',
  );
  const intake = grantOf(company, 'company_commercial_intake');
  return JSON.stringify([
    canReadReceivedContractRelation(company),
    preparer?.assignmentId,
    preparer?.permissionSetVersion,
    approver?.assignmentId,
    approver?.permissionSetVersion,
    earlyPreparation?.assignmentId,
    earlyPreparation?.permissionSetVersion,
    intake?.assignmentId,
    intake?.permissionSetVersion,
  ]);
}
