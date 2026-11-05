import { BadRequestException } from '@nestjs/common';
import { requireUuid } from '../access/access-command-validation.js';

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
export function readPaymentEvidenceRegistration(row: Record<string, unknown>) {
  exact(row, [
    'type',
    'clientId',
    'payer',
    'title',
    'purpose',
    'sourceDescription',
    'receivedOn',
  ]);
  if (row.type !== 'payment-evidence') throw invalid();
  const payer = object(row.payer);
  let selected: PaymentEvidencePayerSelection;
  if (payer.kind === 'PRIMARY') {
    exact(payer, ['kind']);
    selected = { kind: 'PRIMARY' };
  } else if (payer.kind === 'ADDITIONAL') {
    exact(payer, ['kind', 'legalEntityId']);
    selected = {
      kind: 'ADDITIONAL',
      legalEntityId: requireUuid(payer.legalEntityId),
    };
  } else throw invalid();
  return {
    type: 'payment-evidence' as const,
    clientId: requireUuid(row.clientId),
    payer: selected,
    title: metadata(row.title, 200),
    purpose: metadata(row.purpose, 2000),
    sourceDescription: metadata(row.sourceDescription, 2000),
    receivedOn: row.receivedOn === null ? null : calendarDate(row.receivedOn),
  };
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
    code: 'payment_evidence_registration_invalid',
    message:
      'Select an exact original Client and payer and complete the payment evidence source metadata.',
  });
}
