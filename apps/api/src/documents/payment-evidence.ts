import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';
import { readReceivedSourceRegistration } from './received-source-registration.js';

export type PaymentEvidencePayerSelection =
  { kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string };
export type PaymentEvidenceParty = {
  legalName: string;
  taxId: string | null;
  legalAddress: string | null;
} & ({ kind: 'PRIMARY' } | { kind: 'ADDITIONAL'; legalEntityId: string });
export interface PaymentEvidenceSourceView {
  format: 'PAYMENT_EVIDENCE_SOURCE/1';
  receivingCompanyLabel: string;
  sourceDescription: string;
  receivedOn: string | null;
  registeredAt: string;
  registeredBy: { workspaceMembershipId: string; internalUserId: string };
  payer:
    | { kind: 'UNAVAILABLE' }
    | { kind: 'AVAILABLE'; party: PaymentEvidenceParty };
}
/** Manual payment observation PRD (`receivedOn` row): required and nullable. */
export function readPaymentEvidenceRegistration(row: Record<string, unknown>) {
  return readReceivedSourceRegistration(row, {
    type: 'payment-evidence',
    selectionFields: ['clientId', 'payer'],
    receivedOn: 'required-nullable',
    invalid,
    readSelection: (value) => {
      // The payer is read before the Client, as it always was.
      const payer = readPayer(value.payer);
      return { clientId: requireUuid(value.clientId), payer };
    },
  });
}
function readPayer(value: unknown): PaymentEvidencePayerSelection {
  const payer = object(value);
  if (payer.kind === 'PRIMARY') {
    exact(payer, ['kind']);
    return { kind: 'PRIMARY' };
  }
  if (payer.kind === 'ADDITIONAL') {
    exact(payer, ['kind', 'legalEntityId']);
    return {
      kind: 'ADDITIONAL',
      legalEntityId: requireUuid(payer.legalEntityId),
    };
  }
  throw invalid();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  return Object.fromEntries(Object.entries(value));
}
function exact(row: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    throw invalid();
}
function invalid() {
  return new BadRequestException({
    code: 'payment_evidence_registration_invalid',
    message:
      'Select an exact original Client and payer and complete the payment evidence source metadata.',
  });
}
