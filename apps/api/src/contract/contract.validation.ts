import { BadRequestException } from '@nestjs/common';
export interface CreateContractCommand {
  readonly acceptedOfferVersionId: string;
  readonly termStartsOn: string | null;
  readonly termEndsOn: string | null;
  readonly specialConditions: string | null;
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
    acceptedOfferVersionId,
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
