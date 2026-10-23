import { BadRequestException } from '@nestjs/common';
import type { PreliminaryWork } from './contract-representation.js';
interface OfferCreationFields {
  readonly sourceOfferVersionId: string;
  readonly termStartsOn: string | null;
  readonly specialConditions: string | null;
}
export type CreateContractCommand =
  | (OfferCreationFields & {
      readonly kind: 'CONTRACT';
      readonly termEndsOn: string | null;
    })
  | (OfferCreationFields & {
      readonly kind: 'PRECONTRACT';
      readonly termEndsOn: string;
      readonly preliminaryWork: PreliminaryWork;
    });
export function readPrepareContractCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  for (const key of Object.keys(input))
    if (
      ![
        'sourceOfferVersionId',
        'termStartsOn',
        'termEndsOn',
        'specialConditions',
      ].includes(key)
    )
      throw invalid(key);
  if (!isPricingSnapshotId(input.sourceOfferVersionId))
    throw invalid('sourceOfferVersionId');
  return {
    kind: 'CONTRACT' as const,
    sourceOfferVersionId: input.sourceOfferVersionId.toLowerCase(),
    ...readEnteredContractFields(input),
  };
}
export function readPrepareContractVersionCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  if (!isPricingSnapshotId(input.sourceOfferVersionId))
    throw invalid('sourceOfferVersionId');
  const entered = readCreateContractVersionCommand(
    Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'sourceOfferVersionId'),
    ),
  );
  return {
    ...entered,
    sourceOfferVersionId: input.sourceOfferVersionId.toLowerCase(),
  };
}
const PRELIMINARY_FIELDS = [
  'preliminaryWorkScope',
  'preliminaryFinancialConditions',
  'preliminaryLimits',
] as const;
/** Session 20 preliminary work and its required term end (PRD §19.2, PC4). */
function readPrecontractFields(input: Record<string, unknown>) {
  const entered = readEnteredContractFields(input);
  if (entered.termEndsOn === null) throw invalid('termEndsOn');
  return {
    ...entered,
    termEndsOn: entered.termEndsOn,
    preliminaryWork: {
      scope: directText(
        input.preliminaryWorkScope,
        'preliminaryWorkScope',
        2000,
        true,
      ),
      financialConditions: directText(
        input.preliminaryFinancialConditions,
        'preliminaryFinancialConditions',
        2000,
        true,
      ),
      limits: directText(
        input.preliminaryLimits,
        'preliminaryLimits',
        2000,
        true,
      ),
    },
  };
}
export function readPrecontractVersionCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  for (const key of Object.keys(input))
    if (
      ![
        'expectedContractRevision',
        'termStartsOn',
        'termEndsOn',
        'specialConditions',
        ...PRELIMINARY_FIELDS,
      ].includes(key)
    )
      throw invalid(key);
  const { expectedContractRevision } = readCreateContractVersionCommand({
    expectedContractRevision: input.expectedContractRevision,
  });
  return { expectedContractRevision, ...readPrecontractFields(input) };
}
export function readCreateContractVersionCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  for (const key of Object.keys(input))
    if (
      ![
        'expectedContractRevision',
        'termStartsOn',
        'termEndsOn',
        'specialConditions',
      ].includes(key)
    )
      throw invalid(key);
  if (
    typeof input.expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedContractRevision) ||
    input.expectedContractRevision < 1 ||
    input.expectedContractRevision > 2147483646
  )
    throw invalid('expectedContractRevision');
  const entered = readEnteredContractFields(input);
  return {
    expectedContractRevision: input.expectedContractRevision,
    termStartsOn: entered.termStartsOn,
    termEndsOn: entered.termEndsOn,
    specialConditions: entered.specialConditions,
  };
}
export function readCreateContractCommand(
  value: unknown,
): CreateContractCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  // An absent kind keeps every delivered main-Contract request unchanged.
  const kind = input.kind === undefined ? 'CONTRACT' : input.kind;
  if (kind !== 'CONTRACT' && kind !== 'PRECONTRACT') throw invalid('kind');
  for (const key of Object.keys(input))
    if (
      ![
        'kind',
        'acceptedOfferVersionId',
        'termStartsOn',
        'termEndsOn',
        'specialConditions',
        ...(kind === 'PRECONTRACT' ? PRELIMINARY_FIELDS : []),
      ].includes(key)
    )
      throw invalid(key);
  const acceptedOfferVersionId = input.acceptedOfferVersionId;
  if (
    typeof acceptedOfferVersionId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      acceptedOfferVersionId,
    )
  )
    throw invalid('acceptedOfferVersionId');
  return kind === 'PRECONTRACT'
    ? {
        kind,
        sourceOfferVersionId: acceptedOfferVersionId,
        ...readPrecontractFields(input),
      }
    : {
        kind,
        sourceOfferVersionId: acceptedOfferVersionId,
        ...readEnteredContractFields(input),
      };
}
// Resolve recognizable selected-resource authority before key resolution. Full
// field validation follows receipt resolution, including malformed identities.
export function selectedAddendumSnapshotId(value: unknown): string | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('pricingSnapshotId' in value)
  )
    return null;
  return isPricingSnapshotId(value.pricingSnapshotId)
    ? value.pricingSnapshotId
    : null;
}
function isPricingSnapshotId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
export function readAddendumCommand(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  for (const key of Object.keys(input))
    if (
      ![
        'expectedContractRevision',
        'changeSummary',
        'termEndsOn',
        'pricingSnapshotId',
      ].includes(key)
    )
      throw invalid(key);
  if (
    typeof input.expectedContractRevision !== 'number' ||
    !Number.isSafeInteger(input.expectedContractRevision) ||
    input.expectedContractRevision < 1 ||
    input.expectedContractRevision > 2147483646
  )
    throw invalid('expectedContractRevision');
  if (
    typeof input.changeSummary !== 'string' ||
    input.changeSummary.length < 1 ||
    input.changeSummary.length > 4000 ||
    !input.changeSummary.trim() ||
    input.changeSummary.includes('\0')
  )
    throw invalid('changeSummary');
  const pricingSnapshotId = input.pricingSnapshotId ?? null;
  if (pricingSnapshotId !== null && !isPricingSnapshotId(pricingSnapshotId))
    throw invalid('pricingSnapshotId');
  return {
    expectedContractRevision: input.expectedContractRevision,
    changeSummary: input.changeSummary,
    termStartsOn: null,
    termEndsOn: calendarDate(input.termEndsOn, 'termEndsOn'),
    specialConditions: null,
    pricingSnapshotId,
  };
}
function readEnteredContractFields(input: Record<string, unknown>) {
  const termStartsOn = calendarDate(input.termStartsOn, 'termStartsOn'),
    termEndsOn = calendarDate(input.termEndsOn, 'termEndsOn');
  if (termStartsOn && termEndsOn && termEndsOn < termStartsOn)
    throw invalid('termEndsOn');
  const specialConditions = input.specialConditions ?? null;
  if (
    specialConditions !== null &&
    (typeof specialConditions !== 'string' ||
      specialConditions.length > 4000 ||
      specialConditions.includes('\0'))
  )
    throw invalid('specialConditions');
  return {
    termStartsOn,
    termEndsOn,
    specialConditions,
  };
}
function calendarDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.slice(0, 4) === '0000' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw invalid(field);
  return value;
}
function invalid(field: string) {
  return new BadRequestException({
    code: 'INVALID_CONTRACT_INPUT',
    field,
    message: `Invalid ${field}.`,
  });
}

export function readDirectContractCommand(value: unknown, revision = false) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  const allowed = [
    'pricingSnapshotId',
    'scopeNote',
    'commercialConditions',
    'termStartsOn',
    'termEndsOn',
    'specialConditions',
    ...(revision
      ? ['expectedContractRevision']
      : ['recipient', 'directReason']),
  ];
  for (const field of Object.keys(input))
    if (!allowed.includes(field)) throw invalid(field);
  if (!isPricingSnapshotId(input.pricingSnapshotId))
    throw invalid('pricingSnapshotId');
  const entered = readEnteredContractFields(input);
  return {
    ...entered,
    pricingSnapshotId: input.pricingSnapshotId.toLowerCase(),
    scopeNote: directText(input.scopeNote, 'scopeNote', 2000, true),
    commercialConditions: directText(
      input.commercialConditions,
      'commercialConditions',
      4000,
      false,
    ),
    ...(revision
      ? {
          expectedContractRevision: readCreateContractVersionCommand({
            expectedContractRevision: input.expectedContractRevision,
          }).expectedContractRevision,
        }
      : {}),
  };
}
export function readDirectCreationCommand(value: unknown) {
  const fields = readDirectContractCommand(value);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('recipient' in value) ||
    !('directReason' in value)
  )
    throw invalid('recipient');
  const recipient = value.recipient;
  if (
    typeof recipient !== 'object' ||
    recipient === null ||
    Array.isArray(recipient) ||
    !('kind' in recipient)
  )
    throw invalid('recipient');
  if (recipient.kind === 'PRIMARY' && Object.keys(recipient).length === 1)
    return {
      ...fields,
      recipient: { kind: 'PRIMARY' } as const,
      directReason: directText(value.directReason, 'directReason', 500, true),
    };
  if (
    recipient.kind === 'ADDITIONAL' &&
    Object.keys(recipient).length === 2 &&
    'legalEntityId' in recipient &&
    isPricingSnapshotId(recipient.legalEntityId)
  )
    return {
      ...fields,
      recipient: {
        kind: 'ADDITIONAL',
        legalEntityId: recipient.legalEntityId.toLowerCase(),
      } as const,
      directReason: directText(value.directReason, 'directReason', 500, true),
    };
  throw invalid('recipient');
}
function directText(
  value: unknown,
  field: string,
  max: number,
  required: true,
): string;
function directText(
  value: unknown,
  field: string,
  max: number,
  required: false,
): string | null;
function directText(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): string | null {
  if (!required && (value === undefined || value === null)) return null;
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\0') ||
    (required && !value.trim())
  )
    throw invalid(field);
  return value;
}

export function readDirectVersionCommand(value: unknown) {
  const fields = readDirectContractCommand(value, true);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('expectedContractRevision' in value)
  )
    throw invalid('expectedContractRevision');
  return {
    ...fields,
    expectedContractRevision: readCreateContractVersionCommand({
      expectedContractRevision: value.expectedContractRevision,
    }).expectedContractRevision,
    changeSummary: null,
  };
}
