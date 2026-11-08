import { BadRequestException } from '@nestjs/common';
import type { recordedRecipient } from '../contract/contract-version-reader.js';
import { requireUuid } from '../access/access-command-validation.js';
import { readReceivedSourceRegistration } from './received-source-registration.js';

export type ReceivedAddendumRelationView =
  | { access: 'denied' }
  | {
      access: 'granted';
      opportunityId: string;
      parentContractId: string;
      parentContractVersionId: string;
      recordedRecipient: ReturnType<typeof recordedRecipient>;
      contractVersionNumber: number;
      illustrativeReference: number;
      sourceDescription: string;
      receivedOn: string | null;
      registeredAt: string;
      registeredBy: { workspaceMembershipId: string; internalUserId: string };
    };

/** Received Addendum PRD (`receivedOn` row): optional or null. */
export function readReceivedAddendumRegistration(
  value: Record<string, unknown>,
) {
  return readReceivedSourceRegistration(value, {
    type: 'received-addendum',
    selectionFields: ['parentContractId', 'parentContractVersionId'],
    receivedOn: 'optional',
    invalid,
    readSelection: (row) => ({
      selection: {
        parentContractId: requireUuid(row.parentContractId),
        parentContractVersionId: requireUuid(row.parentContractVersionId),
      },
    }),
  });
}
function invalid() {
  return new BadRequestException({
    code: 'received_addendum_registration_invalid',
    message:
      'Select an exact Contract Version and complete the received Document metadata.',
  });
}
