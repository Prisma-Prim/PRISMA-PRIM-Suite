import { BadRequestException } from '@nestjs/common';
export interface CreateContractCommand {
  readonly acceptedOfferVersionId: string;
  readonly termStartsOn: string | null;
  readonly termEndsOn: string | null;
  readonly specialConditions: string | null;
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
  for (const key of Object.keys(input))
    if (
      ![
        'acceptedOfferVersionId',
        'termStartsOn',
        'termEndsOn',
        'specialConditions',
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
  return { acceptedOfferVersionId, ...readEnteredContractFields(input) };
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
