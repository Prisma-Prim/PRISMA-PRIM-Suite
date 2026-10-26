import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

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

export function readReceivedContractRegistration(
  value: Record<string, unknown>,
) {
  const allowed = [
    'type',
    'opportunityId',
    'contractId',
    'contractVersionId',
    'title',
    'purpose',
    'sourceDescription',
    'receivedOn',
  ];
  if (
    value.type !== 'received-contract' ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw invalid();
  return {
    type: 'received-contract' as const,
    selection: {
      opportunityId: requireUuid(value.opportunityId),
      contractId: requireUuid(value.contractId),
      contractVersionId: requireUuid(value.contractVersionId),
    },
    title: metadata(value.title, 200),
    purpose: metadata(value.purpose, 2000),
    sourceDescription: metadata(value.sourceDescription, 2000),
    receivedOn: value.receivedOn == null ? null : date(value.receivedOn),
  };
}
function metadata(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw invalid();
  return value.trim();
}
function date(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000') ||
    !Number.isFinite(Date.parse(value + 'T00:00:00.000Z')) ||
    new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value
  )
    throw invalid();
  return value;
}
function invalid() {
  return new BadRequestException({
    code: 'received_contract_registration_invalid',
    message:
      'Select an exact Contract Version and complete the received Document metadata.',
  });
}
