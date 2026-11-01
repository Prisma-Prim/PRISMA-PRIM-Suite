import {
  hasExternalInvoiceAccess,
  externalInvoiceCaptureKey,
} from './external-invoice-access';
import type { ActorContext } from '../access-types';
import type { DocumentFamily } from './document-response';
import { hasMissionDeliverableAccess } from './mission-deliverable-access';
import { hasReceivedContractAccess } from './received-contract-access';

/** A family capture owns only work on that family, not sibling Document work. */
export function documentFamilyCaptureKey(
  company: ActorContext['activeCompany'],
  family: DocumentFamily,
): string {
  switch (family) {
    case 'questionnaire':
      return 'questionnaire';
    case 'mission-deliverable':
      return JSON.stringify([
        hasMissionDeliverableAccess(company),
        company?.missionDeliverableAccessAssignmentId,
        company?.missionDeliverableAccessPermissionSetVersion,
      ]);
    case 'external-invoice':
      return externalInvoiceCaptureKey(company);
    case 'received-contract':
      return JSON.stringify([
        hasReceivedContractAccess(company),
        company?.receivedContractAccessAssignmentId,
        company?.receivedContractAccessPermissionSetVersion,
      ]);
    default: {
      const exhaustive: never = family;
      throw new Error(`Unknown Document family: ${exhaustive}`);
    }
  }
}
export function hasDocumentFamilyAccess(
  company: ActorContext['activeCompany'],
  family: DocumentFamily,
): boolean {
  switch (family) {
    case 'questionnaire':
      return true;
    case 'mission-deliverable':
      return hasMissionDeliverableAccess(company);
    case 'external-invoice':
      return hasExternalInvoiceAccess(company);
    case 'received-contract':
      return hasReceivedContractAccess(company);
    default: {
      const exhaustive: never = family;
      throw new Error(`Unknown Document family: ${exhaustive}`);
    }
  }
}
