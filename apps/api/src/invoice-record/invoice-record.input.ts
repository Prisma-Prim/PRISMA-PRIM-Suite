import { BadRequestException } from '@nestjs/common';
import {
  requireBoundedIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';

export type InvoiceCurrency = 'MDL' | 'EUR' | 'RON' | 'USD';
export interface InvoiceValues {
  externalSystem: string;
  externalNumber: string;
  issuedOn: string;
  dueOn: string | null;
  currency: InvoiceCurrency;
  grossMinor: string;
  netMinor: string | null;
  taxMinor: string | null;
}
export interface InvoiceSource {
  documentId: string;
  documentVersionId: string;
  representationId: string;
}
export type InvoiceInput =
  | {
      action: 'CREATE';
      source: InvoiceSource;
      values: InvoiceValues;
      acknowledgeExternalDeclaration: true;
      replacesWithdrawnRecordId: string | null;
    }
  | {
      action: 'CORRECT';
      expectedRevision: number;
      values: InvoiceValues;
      reason: string;
    }
  | { action: 'WITHDRAW_ENTRY'; expectedRevision: number; reason: string };
export function invoiceObject(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const object = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(object).length !== keys.length ||
    Object.keys(object).some((key) => !keys.includes(key))
  )
    throw invalid();
  return object;
}
export function invoiceText(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    Array.from(value).some(
      (character) =>
        character.length === 1 && /[\uD800-\uDFFF]/u.test(character),
    ) ||
    /\p{Cc}/u.test(value)
  )
    throw invalid();
  return value;
}
export function invoiceDate(value: unknown): string {
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
export function invoiceRevision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw invalid();
  return value;
}
function money(value: unknown, positive: boolean): string {
  if (
    typeof value !== 'string' ||
    !(positive ? /^[1-9][0-9]{0,13}$/u : /^(0|[1-9][0-9]{0,13})$/u).test(value)
  )
    throw invalid();
  return value;
}
export function invoiceValues(value: unknown): InvoiceValues {
  const v = invoiceObject(value, [
    'externalSystem',
    'externalNumber',
    'issuedOn',
    'dueOn',
    'currency',
    'grossMinor',
    'netMinor',
    'taxMinor',
  ]);
  const currency = v.currency;
  if (
    currency !== 'MDL' &&
    currency !== 'EUR' &&
    currency !== 'RON' &&
    currency !== 'USD'
  )
    throw invalid();
  return {
    externalSystem: invoiceText(v.externalSystem, 120),
    externalNumber: invoiceText(v.externalNumber, 200),
    issuedOn: invoiceDate(v.issuedOn),
    dueOn: v.dueOn === null ? null : invoiceDate(v.dueOn),
    currency,
    grossMinor: money(v.grossMinor, true),
    netMinor: v.netMinor === null ? null : money(v.netMinor, false),
    taxMinor: v.taxMinor === null ? null : money(v.taxMinor, false),
  };
}
export function invoiceSource(value: unknown): InvoiceSource {
  const v = invoiceObject(value, [
    'documentId',
    'documentVersionId',
    'representationId',
  ]);
  return {
    documentId: requireUuid(v.documentId).toLowerCase(),
    documentVersionId: requireUuid(v.documentVersionId).toLowerCase(),
    representationId: requireUuid(v.representationId).toLowerCase(),
  };
}
export function invoiceCreate(
  value: unknown,
): Extract<InvoiceInput, { action: 'CREATE' }> {
  const v = invoiceObject(value, [
    'source',
    'values',
    'acknowledgeExternalDeclaration',
    'replacesWithdrawnRecordId',
  ]);
  if (v.acknowledgeExternalDeclaration !== true) throw invalid();
  return {
    action: 'CREATE',
    source: invoiceSource(v.source),
    values: invoiceValues(v.values),
    acknowledgeExternalDeclaration: true,
    replacesWithdrawnRecordId:
      v.replacesWithdrawnRecordId === null
        ? null
        : requireUuid(v.replacesWithdrawnRecordId).toLowerCase(),
  };
}
export function invoiceCommand(
  value: unknown,
): Exclude<InvoiceInput, { action: 'CREATE' }> {
  if (!value || typeof value !== 'object' || !('action' in value))
    throw invalid();
  if (value.action === 'CORRECT') {
    const v = invoiceObject(value, [
      'action',
      'expectedRevision',
      'values',
      'reason',
    ]);
    return {
      action: 'CORRECT',
      expectedRevision: invoiceRevision(v.expectedRevision),
      values: invoiceValues(v.values),
      reason: invoiceText(v.reason, 2000),
    };
  }
  const v = invoiceObject(value, ['action', 'expectedRevision', 'reason']);
  if (v.action !== 'WITHDRAW_ENTRY') throw invalid();
  return {
    action: 'WITHDRAW_ENTRY',
    expectedRevision: invoiceRevision(v.expectedRevision),
    reason: invoiceText(v.reason, 2000),
  };
}
export function invoiceQuery(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const v = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(v).some((k) => k !== 'cursor') ||
    ('cursor' in v &&
      (typeof v.cursor !== 'string' || !v.cursor || v.cursor.length > 4096))
  )
    throw invalid();
  return typeof v.cursor === 'string' ? v.cursor : undefined;
}
// invoice_record_commands stores keys of 1 to 200 characters.
export const invoiceKey = (value: string | undefined) =>
  requireBoundedIdempotencyKey(value, 200);
function invalid() {
  return new BadRequestException({
    code: 'INVOICE_INPUT_INVALID',
    message: 'Review the external invoice declaration.',
  });
}
