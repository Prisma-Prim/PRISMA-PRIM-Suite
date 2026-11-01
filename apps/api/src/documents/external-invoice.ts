import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
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

/** Closed registration intent; the Contract owner supplies Company, Client and party. */
export function readExternalInvoiceRegistration(
  value: Record<string, unknown>,
) {
  const fields = [
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
    value.type !== 'external-invoice' ||
    Object.keys(value).length !== fields.length ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw invalid();
  return {
    type: 'external-invoice' as const,
    selection: {
      opportunityId: requireUuid(value.opportunityId),
      contractId: requireUuid(value.contractId),
      contractVersionId: requireUuid(value.contractVersionId),
    },
    title: metadata(value.title, 200),
    purpose: metadata(value.purpose, 2000),
    sourceDescription: metadata(value.sourceDescription, 2000),
    receivedOn:
      value.receivedOn === null ? null : calendarDate(value.receivedOn),
  };
}
function metadata(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw invalid();
  return value.trim();
}
function calendarDate(value: unknown): string {
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
    code: 'external_invoice_registration_invalid',
    message:
      'Select an exact declared Contract Version and complete the external invoice source metadata.',
  });
}
