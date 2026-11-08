import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { readReceivedSourceRegistration } from './received-source-registration.js';
import type { ExternalInvoiceRecordedRecipient } from '../contract/contract-external-invoice-reference.service.js';

export type ExternalInvoiceRelationView =
  | { access: 'denied' }
  | {
      access: 'granted';
      opportunityId: string;
      contractId: string;
      contractVersionId: string;
      contractVersionNumber: number;
      illustrativeReference: number;
      recordedRecipient: ExternalInvoiceRecordedRecipient;
      sourceDescription: string;
      receivedOn: string | null;
      registeredAt: string;
      registeredBy: { workspaceMembershipId: string; internalUserId: string };
    };

/**
 * Closed registration intent; the Contract owner supplies Company, Client and
 * party. External invoice PRD (`receivedOn` row): required and nullable.
 */
export function readExternalInvoiceRegistration(
  value: Record<string, unknown>,
) {
  return readReceivedSourceRegistration(value, {
    type: 'external-invoice',
    selectionFields: ['opportunityId', 'contractId', 'contractVersionId'],
    receivedOn: 'required-nullable',
    invalid,
    readSelection: (row) => ({
      selection: {
        opportunityId: requireUuid(row.opportunityId),
        contractId: requireUuid(row.contractId),
        contractVersionId: requireUuid(row.contractVersionId),
      },
    }),
  });
}
function invalid() {
  return new BadRequestException({
    code: 'external_invoice_registration_invalid',
    message:
      'Select an exact declared Contract Version and complete the external invoice source metadata.',
  });
}
