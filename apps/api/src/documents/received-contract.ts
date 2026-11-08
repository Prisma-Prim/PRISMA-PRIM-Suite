import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { readReceivedSourceRegistration } from './received-source-registration.js';

export type ReceivedContractRelationView =
  | { access: 'denied' }
  | {
      access: 'granted';
      opportunityId: string;
      contractId: string;
      contractVersionId: string;
      contractVersionNumber: number;
      illustrativeReference: number;
      sourceDescription: string;
      receivedOn: string | null;
      registeredAt: string;
      registeredBy: { workspaceMembershipId: string; internalUserId: string };
    };

/** Received Contract PRD (Release 1 Document Registry, section 24): `receivedOn` is optional. */
export function readReceivedContractRegistration(
  value: Record<string, unknown>,
) {
  return readReceivedSourceRegistration(value, {
    type: 'received-contract',
    selectionFields: ['opportunityId', 'contractId', 'contractVersionId'],
    receivedOn: 'optional',
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
    code: 'received_contract_registration_invalid',
    message:
      'Select an exact Contract Version and complete the received Document metadata.',
  });
}
