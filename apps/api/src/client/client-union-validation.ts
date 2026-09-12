import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ClientContact } from './client.types.js';

export const UNION_FIELDS = [
  'displayName',
  'taxId',
  'address',
  'telephone',
  'generalEmail',
  'businessActivity',
] as const;
export type UnionField = (typeof UNION_FIELDS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function unionRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException('Invalid Client union input.');
  }
  return value;
}

function onlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BadRequestException('Unknown Client union field.');
  }
}

export function unionUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new BadRequestException('Invalid Client union reference.');
  }
  return value.toLowerCase();
}

export function unionReason(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > 2000
  ) {
    throw new BadRequestException('A bounded written reason is required.');
  }
  return value.trim();
}

export function unionCompanyIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('The complete Company set is required.');
  }
  const ids = value.map(unionUuid).sort();
  if (new Set(ids).size !== ids.length)
    throw new BadRequestException('Repeated Company confirmation.');
  return ids;
}

export function normalizeUnionConfirmation(value: unknown) {
  const input = unionRecord(value);
  onlyKeys(input, [
    'canonicalClientId',
    'fields',
    'companyIds',
    'reviewedDifferences',
    'reason',
  ]);
  const fields = unionRecord(input.fields);
  onlyKeys(fields, UNION_FIELDS);
  if (input.reviewedDifferences !== true)
    throw new BadRequestException(
      'Review every material difference before confirmation.',
    );
  return {
    canonicalClientId: unionUuid(input.canonicalClientId),
    fields: {
      displayName: unionUuid(fields.displayName),
      taxId: unionUuid(fields.taxId),
      address: unionUuid(fields.address),
      telephone: unionUuid(fields.telephone),
      generalEmail: unionUuid(fields.generalEmail),
      businessActivity: unionUuid(fields.businessActivity),
    },
    companyIds: unionCompanyIds(input.companyIds),
    reviewedDifferences: true,
    reason: unionReason(input.reason),
  };
}

export type UnionConfirmation = ReturnType<typeof normalizeUnionConfirmation>;

export function normalizeUnionReversal(value: unknown) {
  const input = unionRecord(value);
  onlyKeys(input, ['companyIds', 'reason']);
  return {
    companyIds: unionCompanyIds(input.companyIds),
    reason: unionReason(input.reason),
  };
}

export function unionCommandKey(value: string | undefined): string {
  if (!value?.trim() || value.length > 200)
    throw new BadRequestException('Idempotency-Key is required.');
  return value;
}

export function unionContactResult(
  inputs: readonly {
    clientId: string;
    version: number;
    contacts: readonly ClientContact[];
  }[],
) {
  const contacts = inputs.flatMap((input) => input.contacts);
  if (contacts.length > 50) {
    throw new ConflictException({
      statusCode: 409,
      code: 'client_union_contact_capacity_exceeded',
    });
  }
  return {
    contacts,
    sources: inputs.flatMap((input) =>
      input.contacts.map((_, index) => ({
        clientId: input.clientId,
        version: input.version,
        index,
      })),
    ),
  };
}
