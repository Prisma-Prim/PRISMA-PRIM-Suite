import { BadRequestException } from '@nestjs/common';

/** A recorded human declaration; no rate or fiscal-cost interpretation exists. */
export function readModelOfferFinancialDeclaration(value: unknown) {
  const input = declarationRecord(value);
  if (input.kind !== 'NET_PLUS_DECLARED_TAX') invalid('kind');
  if (input.netAmountConfirmed !== true) invalid('netAmountConfirmed');
  const taxAmount = input.taxAmount;
  if (typeof taxAmount !== 'string' || !/^[0-9]+\.[0-9]{2}$/u.test(taxAmount))
    invalid('taxAmount');
  return {
    kind: 'NET_PLUS_DECLARED_TAX' as const,
    netAmountConfirmed: true as const,
    taxAmount,
    taxLabel: declarationText(input.taxLabel, 'taxLabel', 200),
    basis: declarationText(input.basis, 'basis', 2_000),
  };
}

/** Preserve source/declaration strings; only the gross sum is canonicalized. */
export function modelOfferFinancials(input: {
  netAmount: string;
  currency: string;
  declaration: ReturnType<typeof readModelOfferFinancialDeclaration>;
  actorWorkspaceMembershipId: string;
  actorInternalUserId: string;
  declaredAt: string;
}) {
  const gross =
    BigInt(input.netAmount.replace('.', '')) +
    BigInt(input.declaration.taxAmount.replace('.', ''));
  return {
    ...input.declaration,
    netAmount: input.netAmount,
    grossAmount: `${gross / 100n}.${String(gross % 100n).padStart(2, '0')}`,
    currency: input.currency,
    declaredBy: {
      workspaceMembershipId: input.actorWorkspaceMembershipId,
      internalUserId: input.actorInternalUserId,
    },
    declaredAt: input.declaredAt,
  };
}

function declarationRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid('body');
  const input = Object.fromEntries(Object.entries(value));
  const fields = [
    'kind',
    'netAmountConfirmed',
    'taxAmount',
    'taxLabel',
    'basis',
  ];
  if (
    fields.some((field) => !Object.hasOwn(input, field)) ||
    Object.keys(input).some((field) => !fields.includes(field))
  )
    invalid('body');
  return input;
}

function declarationText(value: unknown, field: string, maximum: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    value.includes('\0') ||
    /[\uD800-\uDFFF]/u.test(value)
  )
    invalid(field);
  return value;
}

function invalid(field: string): never {
  throw new BadRequestException({
    code: 'OFFER_VALIDATION_ERROR',
    field: `financialDeclaration.${field}`,
    message: 'Enter the complete explicit net and declared-tax facts.',
  });
}
