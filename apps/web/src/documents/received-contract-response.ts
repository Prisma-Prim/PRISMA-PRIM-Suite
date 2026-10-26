function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid received Contract response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    throw new Error('Invalid received Contract text');
  return value;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('Invalid Contract reference');
  return value;
}
function instant(value: unknown) {
  const input = text(value);
  const date = new Date(input);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== input)
    throw new Error('Invalid received Contract instant');
  return input;
}
function calendar(value: unknown) {
  if (value === null) return null;
  const input = text(value);
  const date = new Date(input + 'T00:00:00.000Z');
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(input) ||
    input.startsWith('0000') ||
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== input
  )
    throw new Error('Invalid received date');
  return input;
}
export function readReceivedContractRelation(value: unknown) {
  const row = record(value);
  if (row.access === 'denied') return { access: 'denied' as const };
  if (row.access !== 'granted')
    throw new Error('Invalid received Contract relation');
  const by = record(row.registeredBy);
  return {
    access: 'granted' as const,
    opportunityId: text(row.opportunityId),
    contractId: text(row.contractId),
    contractVersionId: text(row.contractVersionId),
    contractVersionNumber: positive(row.contractVersionNumber),
    illustrativeReference: positive(row.illustrativeReference),
    sourceDescription: text(row.sourceDescription),
    receivedOn: calendar(row.receivedOn),
    registeredAt: instant(row.registeredAt),
    registeredBy: {
      workspaceMembershipId: text(by.workspaceMembershipId),
      internalUserId: text(by.internalUserId),
    },
  };
}
export type ReceivedContractRelation = ReturnType<
  typeof readReceivedContractRelation
>;

export function readReceivedContractSources(value: unknown) {
  const page = record(value);
  if (!Array.isArray(page.sources) || page.sources.length > 20)
    throw new Error('Invalid Contract source page');
  const sources = page.sources.map((value: unknown) => {
    const row = record(value);
    return {
      opportunityId: text(row.opportunityId),
      contractId: text(row.contractId),
      contractVersionId: text(row.contractVersionId),
      contractVersionNumber: positive(row.contractVersionNumber),
      illustrativeReference: positive(row.illustrativeReference),
      clientId: text(row.clientId),
      clientDisplayName: text(row.clientDisplayName),
      opportunityTitle: text(row.opportunityTitle),
    };
  });
  if (
    new Set(sources.map((row) => row.contractVersionId)).size !== sources.length
  )
    throw new Error('Duplicate Contract sources');
  const nextCursor = page.nextCursor === null ? null : text(page.nextCursor);
  if (
    nextCursor &&
    (sources.length !== 20 || !/^[A-Za-z0-9_-]{48}$/u.test(nextCursor))
  )
    throw new Error('Invalid Contract source cursor');
  return { sources, nextCursor };
}
export type ReceivedContractSourcePage = ReturnType<
  typeof readReceivedContractSources
>;
