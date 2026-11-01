function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid external invoice source');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, maximum = 2000): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw new Error('Invalid external invoice source text');
  return value;
}
function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}
function uuid(value: unknown): string {
  const input = text(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      input,
    )
  )
    throw new Error('Invalid external invoice source identity');
  return input;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    throw new Error('Invalid external invoice source revision');
  return value;
}
function instant(value: unknown): string {
  const input = text(value);
  const parsed = new Date(input);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== input)
    throw new Error('Invalid external invoice source instant');
  return input;
}
function calendar(value: unknown): string | null {
  if (value === null) return null;
  const input = text(value);
  const parsed = new Date(input + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input) ||
    input.startsWith('0000') ||
    !Number.isFinite(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== input
  )
    throw new Error('Invalid external invoice received date');
  return input;
}
export function readExternalInvoiceRecipient(value: unknown) {
  const row = record(value);
  const fields = {
    legalName: text(row.legalName),
    taxId: nullableText(row.taxId),
    legalAddress: nullableText(row.legalAddress),
  };
  if (row.kind === 'PRIMARY' && !('additionalLegalEntityId' in row))
    return { kind: 'PRIMARY' as const, ...fields };
  if (row.kind === 'ADDITIONAL')
    return {
      kind: 'ADDITIONAL' as const,
      additionalLegalEntityId: uuid(row.additionalLegalEntityId),
      ...fields,
    };
  throw new Error('Invalid recorded invoice receiving party');
}
export type ExternalInvoiceRecipient = ReturnType<
  typeof readExternalInvoiceRecipient
>;

export function readExternalInvoiceRelation(value: unknown) {
  const row = record(value);
  // Unavailable related facts never cross this reader, even in a malformed publisher response.
  if (row.access === 'denied') return { access: 'denied' as const };
  if (row.access !== 'granted')
    throw new Error('Invalid external invoice relation');
  const by = record(row.registeredBy);
  return {
    access: 'granted' as const,
    opportunityId: uuid(row.opportunityId),
    contractId: uuid(row.contractId),
    contractVersionId: uuid(row.contractVersionId),
    contractVersionNumber: positive(row.contractVersionNumber),
    illustrativeReference: positive(row.illustrativeReference),
    recordedRecipient: readExternalInvoiceRecipient(row.recordedRecipient),
    sourceDescription: text(row.sourceDescription),
    receivedOn: calendar(row.receivedOn),
    registeredAt: instant(row.registeredAt),
    registeredBy: {
      workspaceMembershipId: uuid(by.workspaceMembershipId),
      internalUserId: uuid(by.internalUserId),
    },
  };
}
export type ExternalInvoiceRelation = ReturnType<
  typeof readExternalInvoiceRelation
>;

export function readExternalInvoiceSources(value: unknown) {
  const page = record(value);
  if (!Array.isArray(page.sources) || page.sources.length > 20)
    throw new Error('Invalid external invoice source page');
  const sources = page.sources.map((value: unknown) => {
    const row = record(value);
    return {
      opportunityId: uuid(row.opportunityId),
      contractId: uuid(row.contractId),
      contractVersionId: uuid(row.contractVersionId),
      contractVersionNumber: positive(row.contractVersionNumber),
      illustrativeReference: positive(row.illustrativeReference),
      clientId: uuid(row.clientId),
      clientDisplayName: text(row.clientDisplayName),
      opportunityTitle: text(row.opportunityTitle),
      recordedRecipient: readExternalInvoiceRecipient(row.recordedRecipient),
    };
  });
  if (
    new Set(sources.map((source) => source.contractVersionId)).size !==
    sources.length
  )
    throw new Error('Duplicate external invoice sources');
  const nextCursor = page.nextCursor === null ? null : text(page.nextCursor);
  if (
    nextCursor &&
    (sources.length !== 20 || !/^[A-Za-z0-9_-]{48}$/u.test(nextCursor))
  )
    throw new Error('Invalid external invoice source cursor');
  return { sources, nextCursor };
}
export type ExternalInvoiceSourcePage = ReturnType<
  typeof readExternalInvoiceSources
>;
