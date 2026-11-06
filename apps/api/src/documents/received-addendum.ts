import { BadRequestException } from '@nestjs/common';
import type { recordedRecipient } from '../contract/contract-version-reader.js';
import { requireUuid } from '../access/access-command-validation.js';

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

export function readReceivedAddendumRegistration(
  value: Record<string, unknown>,
) {
  const allowed = [
    'type',
    'parentContractId',
    'parentContractVersionId',
    'title',
    'purpose',
    'sourceDescription',
    'receivedOn',
  ];
  if (
    value.type !== 'received-addendum' ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    throw invalid();
  return {
    type: 'received-addendum' as const,
    selection: {
      parentContractId: requireUuid(value.parentContractId),
      parentContractVersionId: requireUuid(value.parentContractVersionId),
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
    code: 'received_addendum_registration_invalid',
    message:
      'Select an exact Contract Version and complete the received Document metadata.',
  });
}
