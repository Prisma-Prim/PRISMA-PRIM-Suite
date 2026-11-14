import { hasReceivedAuditSourceAccess } from './received-audit-source-access';
import { hasReceivedAddendumAccess } from './received-addendum-access';
import {
  hasExternalInvoiceAccess,
  externalInvoiceCaptureKey,
} from './external-invoice-access';
import type { ActorContext } from '../access-types';
import { grantOf } from '../access/company-grants';
import { captureOf } from './document-grants';
import type { DocumentFamily } from './document-response';
import { hasMissionDeliverableAccess } from './mission-deliverable-access';
import { hasReceivedContractAccess } from './received-contract-access';

/** A family capture owns only work on that family, not sibling Document work. */
export function documentFamilyCaptureKey(
  company: ActorContext['activeCompany'],
  family: DocumentFamily,
): string {
  switch (family) {
    case 'payment-evidence':
      return 'payment-evidence-explicit-operation-owner';
    case 'questionnaire':
      return 'questionnaire';
    case 'received-audit-source':
      return JSON.stringify([
        hasReceivedAuditSourceAccess(company),
        ...captureOf(grantOf(company, 'company_received_audit_source_access')),
        company?.workingEvidenceClientReadCapture,
        company?.workingEvidenceContextCapture,
      ]);
    case 'mission-deliverable':
      return JSON.stringify([
        hasMissionDeliverableAccess(company),
        ...captureOf(grantOf(company, 'company_mission_deliverable_access')),
      ]);
    case 'external-invoice':
      return externalInvoiceCaptureKey(company);
    case 'received-addendum':
      return JSON.stringify([
        hasReceivedAddendumAccess(company),
        ...captureOf(grantOf(company, 'company_received_addendum_access')),
        company?.receivedAddendumClientReadCapture,
      ]);
    case 'received-contract':
      return JSON.stringify([
        hasReceivedContractAccess(company),
        ...captureOf(grantOf(company, 'company_received_contract_access')),
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
    case 'payment-evidence':
      // This family consumes the full Actor and separate operation keys at its source owner.
      return false;
    case 'questionnaire':
      return true;
    case 'received-audit-source':
      return hasReceivedAuditSourceAccess(company);
    case 'mission-deliverable':
      return hasMissionDeliverableAccess(company);
    case 'external-invoice':
      return hasExternalInvoiceAccess(company);
    case 'received-addendum':
      return hasReceivedAddendumAccess(company);
    case 'received-contract':
      return hasReceivedContractAccess(company);
    default: {
      const exhaustive: never = family;
      throw new Error(`Unknown Document family: ${exhaustive}`);
    }
  }
}
