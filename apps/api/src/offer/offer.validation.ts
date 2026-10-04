import { BadRequestException } from '@nestjs/common';
import { OFFER_QUALITY_CODES, type OfferQualityCode } from './offer-quality.js';

export type OfferClientResponseCommand = { expectedOfferRevision: number } & (
  | { outcome: 'ACCEPTED'; receivedAt: Date }
  | { outcome: 'REJECTED'; receivedAt: Date; reason: string }
  | { outcome: 'EXPIRED' }
);

export function readOfferClientResponseCommand(
  value: unknown,
): OfferClientResponseCommand {
  const input = record(value, 'body');
  const expectedOfferRevision = input.expectedOfferRevision;
  if (
    typeof expectedOfferRevision !== 'number' ||
    !Number.isSafeInteger(expectedOfferRevision) ||
    expectedOfferRevision < 1
  )
    throw invalid('expectedOfferRevision');
  const outcome = input.outcome;
  if (outcome !== 'ACCEPTED' && outcome !== 'REJECTED' && outcome !== 'EXPIRED')
    throw invalid('outcome');
  const fields =
    outcome === 'EXPIRED'
      ? ['expectedOfferRevision', 'outcome']
      : outcome === 'REJECTED'
        ? ['expectedOfferRevision', 'outcome', 'receivedAt', 'reason']
        : ['expectedOfferRevision', 'outcome', 'receivedAt'];
  for (const field of Object.keys(input))
    if (!fields.includes(field)) throw invalid(field);
  if (outcome === 'EXPIRED') return { expectedOfferRevision, outcome };
  const received = input.receivedAt;
  if (typeof received !== 'string' || !validReceivedTimestamp(received))
    throw invalid('receivedAt');
  const receivedAt = new Date(received);
  if (!Number.isFinite(receivedAt.getTime())) throw invalid('receivedAt');
  if (outcome === 'ACCEPTED')
    return { expectedOfferRevision, outcome, receivedAt };
  const reason = input.reason;
  if (
    typeof reason !== 'string' ||
    !reason.trim() ||
    reason.length > 500 ||
    reason.includes('\0')
  )
    throw invalid('reason');
  return { expectedOfferRevision, outcome, receivedAt, reason };
}

export type OfferDecisionCommand =
  | {
      kind: 'APPROVE';
      expectedOfferRevision: number;
      acknowledgedWarningCodes: OfferQualityCode[];
    }
  | { kind: 'REJECT'; expectedOfferRevision: number; reason: string };

export function readOfferWarningCodes(value: unknown): OfferQualityCode[] {
  if (!Array.isArray(value)) throw invalid('acknowledgedWarningCodes');
  const result: OfferQualityCode[] = [];
  for (const item of value) {
    const code = OFFER_QUALITY_CODES.find((code) => code === item);
    if (!code || result.includes(code))
      throw invalid('acknowledgedWarningCodes');
    result.push(code);
  }
  return result;
}

export function readOfferDecisionCommand(
  value: unknown,
  kind: 'APPROVE' | 'REJECT',
): OfferDecisionCommand {
  const input = record(value, 'body');
  const expectedOfferRevision = input.expectedOfferRevision;
  if (
    typeof expectedOfferRevision !== 'number' ||
    !Number.isSafeInteger(expectedOfferRevision) ||
    expectedOfferRevision < 1
  )
    throw invalid('expectedOfferRevision');
  if (kind === 'APPROVE')
    return {
      kind,
      expectedOfferRevision,
      acknowledgedWarningCodes: readOfferWarningCodes(
        input.acknowledgedWarningCodes,
      ),
    };
  const reason = input.reason;
  if (
    typeof reason !== 'string' ||
    reason.trim().length === 0 ||
    reason.length > 500 ||
    reason.includes('\0')
  )
    throw invalid('reason');
  return { kind, expectedOfferRevision, reason };
}

export function readOfferTransmissionCommand(value: unknown) {
  const input = record(value, 'body');
  for (const field of Object.keys(input))
    if (
      !['expectedOfferRevision', 'acknowledgedWarningCodes', 'note'].includes(
        field,
      )
    )
      throw invalid(field);
  const expectedOfferRevision = input.expectedOfferRevision;
  if (
    typeof expectedOfferRevision !== 'number' ||
    !Number.isSafeInteger(expectedOfferRevision) ||
    expectedOfferRevision < 1
  )
    throw invalid('expectedOfferRevision');
  return {
    expectedOfferRevision,
    acknowledgedWarningCodes: readOfferWarningCodes(
      input.acknowledgedWarningCodes,
    ),
    note: optionalText(input, 'note', 500).value,
  };
}
import type {
  CreateOfferCommand,
  OfferRecipientSelection,
} from './offer.types.js';

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function readCreateOfferCommand(value: unknown): CreateOfferCommand {
  const input = record(value, 'body');
  const pricingSnapshotId = uuid(input.pricingSnapshotId, 'pricingSnapshotId');
  const recipient = readRecipient(input.recipient);
  const validityDays = optionalInteger(input, 'validityDays', 30, 1, 365);
  const scopeNote = optionalText(input, 'scopeNote', 2_000);
  const commercialConditions = optionalText(
    input,
    'commercialConditions',
    4_000,
  );
  return {
    pricingSnapshotId: pricingSnapshotId.toLowerCase(),
    recipient,
    validityDays: validityDays.value,
    scopeNote: scopeNote.value,
    commercialConditions: commercialConditions.value,
  };
}

function readRecipient(value: unknown): OfferRecipientSelection {
  const recipient = record(value, 'recipient');
  if (recipient.kind === 'PRIMARY') return { kind: 'PRIMARY' };
  if (recipient.kind === 'ADDITIONAL') {
    return {
      kind: 'ADDITIONAL',
      legalEntityId: uuid(
        recipient.legalEntityId,
        'recipient.legalEntityId',
      ).toLowerCase(),
    };
  }
  throw invalid('recipient.kind');
}

function optionalInteger(
  input: Record<string, unknown>,
  field: string,
  defaultValue: number,
  minimum: number,
  maximum: number,
): {
  value: number;
} {
  if (!Object.hasOwn(input, field)) {
    return { value: defaultValue };
  }
  const value = input[field];
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw invalid(field);
  return { value };
}

function optionalText(
  input: Record<string, unknown>,
  field: string,
  maximumLength: number,
): {
  value: string | null;
} {
  if (!Object.hasOwn(input, field)) {
    return { value: null };
  }
  const value = input[field];
  if (
    value !== null &&
    (typeof value !== 'string' ||
      value.length > maximumLength ||
      value.includes('\0'))
  )
    throw invalid(field);
  return { value };
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_GRAMMAR.test(value))
    throw invalid(field);
  return value;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid(field);
  return Object.fromEntries(Object.entries(value));
}

function invalid(field: string): BadRequestException {
  return new BadRequestException({
    code: 'OFFER_VALIDATION_ERROR',
    field,
    message: `The Offer field ${field} is invalid.`,
  });
}

function validReceivedTimestamp(value: string): boolean {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      value,
    );
  const day = match?.[1];
  if (!day || day.startsWith('0000-')) return false;
  const calendar = new Date(day + 'T00:00:00.000Z');
  return (
    Number.isFinite(calendar.getTime()) &&
    calendar.toISOString().slice(0, 10) === day &&
    Number.isFinite(Date.parse(value))
  );
}
