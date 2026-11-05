import { BadRequestException } from '@nestjs/common';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';

export type PaymentCurrency = 'MDL' | 'EUR' | 'RON' | 'USD';
export interface PaymentValues {
  amountMinor: string;
  currency: PaymentCurrency;
  effectiveOn: string;
  method: string;
  externalReference: string | null;
  observationBasis: string;
}
export interface PaymentSource {
  documentId: string;
  documentVersionId: string;
  representationId: string;
}
export type PaymentInput =
  | {
      action: 'CREATE';
      source: PaymentSource;
      values: PaymentValues;
      acknowledgeObservedDeclaration: true;
      replacesClosedPaymentId: string | null;
    }
  | {
      action: 'CORRECT_DRAFT';
      expectedRevision: number;
      values: PaymentValues;
      reason: string;
    }
  | { action: 'WITHDRAW_DRAFT'; expectedRevision: number; reason: string }
  | {
      action: 'CONFIRM';
      expectedRevision: number;
      acknowledgeReviewedObservation: true;
      confirmationNote: string;
    }
  | { action: 'REVERSE'; expectedRevision: number; reason: string };
export function paymentObject(
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
export function paymentText(value: unknown, maximum: number): string {
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
export function paymentDate(value: unknown): string {
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
export function paymentRevision(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw invalid();
  return value;
}
export function paymentValues(value: unknown): PaymentValues {
  const v = paymentObject(value, [
    'amountMinor',
    'currency',
    'effectiveOn',
    'method',
    'externalReference',
    'observationBasis',
  ]);
  const currency = v.currency;
  if (
    currency !== 'MDL' &&
    currency !== 'EUR' &&
    currency !== 'RON' &&
    currency !== 'USD'
  )
    throw invalid();
  if (
    typeof v.amountMinor !== 'string' ||
    !/^[1-9][0-9]{0,13}$/u.test(v.amountMinor)
  )
    throw invalid();
  return {
    amountMinor: v.amountMinor,
    currency,
    effectiveOn: paymentDate(v.effectiveOn),
    method: paymentText(v.method, 120),
    externalReference:
      v.externalReference === null
        ? null
        : paymentText(v.externalReference, 200),
    observationBasis: paymentText(v.observationBasis, 2000),
  };
}
export function paymentSource(value: unknown): PaymentSource {
  const v = paymentObject(value, [
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
export function paymentCreate(
  value: unknown,
): Extract<PaymentInput, { action: 'CREATE' }> {
  const v = paymentObject(value, [
    'source',
    'values',
    'acknowledgeObservedDeclaration',
    'replacesClosedPaymentId',
  ]);
  if (v.acknowledgeObservedDeclaration !== true) throw invalid();
  return {
    action: 'CREATE',
    source: paymentSource(v.source),
    values: paymentValues(v.values),
    acknowledgeObservedDeclaration: true,
    replacesClosedPaymentId:
      v.replacesClosedPaymentId === null
        ? null
        : requireUuid(v.replacesClosedPaymentId).toLowerCase(),
  };
}
export function paymentCommand(
  value: unknown,
): Exclude<PaymentInput, { action: 'CREATE' }> {
  if (!value || typeof value !== 'object' || !('action' in value))
    throw invalid();
  if (value.action === 'CORRECT_DRAFT') {
    const v = paymentObject(value, [
      'action',
      'expectedRevision',
      'values',
      'reason',
    ]);
    return {
      action: 'CORRECT_DRAFT',
      expectedRevision: paymentRevision(v.expectedRevision),
      values: paymentValues(v.values),
      reason: paymentText(v.reason, 2000),
    };
  }
  if (value.action === 'CONFIRM') {
    const v = paymentObject(value, [
      'action',
      'expectedRevision',
      'acknowledgeReviewedObservation',
      'confirmationNote',
    ]);
    if (v.acknowledgeReviewedObservation !== true) throw invalid();
    return {
      action: 'CONFIRM',
      expectedRevision: paymentRevision(v.expectedRevision),
      acknowledgeReviewedObservation: true,
      confirmationNote: paymentText(v.confirmationNote, 2000),
    };
  }
  const v = paymentObject(value, ['action', 'expectedRevision', 'reason']);
  if (v.action !== 'WITHDRAW_DRAFT' && v.action !== 'REVERSE') throw invalid();
  return {
    action: v.action,
    expectedRevision: paymentRevision(v.expectedRevision),
    reason: paymentText(v.reason, 2000),
  };
}
export function paymentQuery(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const v = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(v).some((k) => k !== 'cursor') ||
    ('cursor' in v &&
      (typeof v.cursor !== 'string' || !v.cursor || v.cursor.length > 2048))
  )
    throw invalid();
  return typeof v.cursor === 'string' ? v.cursor : undefined;
}
export const paymentKey = requireIdempotencyKey;
function invalid() {
  return new BadRequestException({
    code: 'PAYMENT_INPUT_INVALID',
    message: 'Review the manual Payment observation.',
  });
}
