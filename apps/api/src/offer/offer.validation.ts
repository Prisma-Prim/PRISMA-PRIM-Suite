import { BadRequestException } from '@nestjs/common';
import { OFFER_QUALITY_CODES, type OfferQualityCode } from './offer-quality.js';

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
