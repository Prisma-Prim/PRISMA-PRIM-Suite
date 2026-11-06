function invalid(): never {
  throw new Error('Invalid received Addendum response');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
function exact(row: Record<string, unknown>, keys: readonly string[]) {
  if (
    Object.keys(row).length !== keys.length ||
    Object.keys(row).some((key) => !keys.includes(key))
  )
    invalid();
}
function text(value: unknown, maximum: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > maximum ||
    /[\0\uD800-\uDFFF]/u.test(value)
  )
    invalid();
  return value;
}
function uuid(value: unknown): string {
  const result = text(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      result,
    )
  )
    invalid();
  return result;
}
function positive(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : text(value, maximum);
}
function calendar(value: unknown): string | null {
  if (value === null) return null;
  const input = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input) || input.startsWith('0000'))
    invalid();
  const date = new Date(input + 'T00:00:00.000Z');
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== input
  )
    invalid();
  return input;
}
function instant(value: unknown): string {
  const input = text(value, 24),
    date = new Date(input);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== input)
    invalid();
  return input;
}
function recipient(value: unknown) {
  const row = record(value);
  if (row.kind !== 'PRIMARY' && row.kind !== 'ADDITIONAL') invalid();
  exact(
    row,
    row.kind === 'PRIMARY'
      ? ['kind', 'legalName', 'taxId', 'legalAddress']
      : [
          'kind',
          'additionalLegalEntityId',
          'legalName',
          'taxId',
          'legalAddress',
        ],
  );
  const identity = {
    legalName: text(row.legalName, 200),
    taxId: nullableText(row.taxId, 500),
    legalAddress: nullableText(row.legalAddress, 2000),
  };
  if (row.kind === 'PRIMARY')
    return { kind: row.kind, ...identity } satisfies {
      kind: 'PRIMARY';
    } & Record<string, unknown>;
  return {
    kind: row.kind,
    additionalLegalEntityId: uuid(row.additionalLegalEntityId),
    ...identity,
  } satisfies { kind: 'ADDITIONAL' } & Record<string, unknown>;
}
/** Validated command fields; callers keep the original literal inputs separately. */
export function readReceivedAddendumMetadata(value: unknown) {
  const row = record(value);
  function metadata(value: unknown, maximum: number) {
    if (typeof value !== 'string') invalid();
    return text(value.trim(), maximum);
  }
  return {
    title: metadata(row.title, 200),
    purpose: metadata(row.purpose, 2000),
    sourceDescription: metadata(row.sourceDescription, 2000),
    receivedOn: row.receivedOn === undefined ? null : calendar(row.receivedOn),
  };
}
export function readReceivedAddendumRelation(value: unknown) {
  const row = record(value);
  if (row.access === 'denied')
    return { access: row.access } satisfies { access: 'denied' };
  if (row.access !== 'granted') invalid();
  const by = record(row.registeredBy);
  return {
    access: row.access,
    opportunityId: uuid(row.opportunityId),
    parentContractId: uuid(row.parentContractId),
    parentContractVersionId: uuid(row.parentContractVersionId),
    contractVersionNumber: positive(row.contractVersionNumber),
    illustrativeReference: positive(row.illustrativeReference),
    recordedRecipient: recipient(row.recordedRecipient),
    sourceDescription: text(row.sourceDescription, 2000),
    receivedOn: calendar(row.receivedOn),
    registeredAt: instant(row.registeredAt),
    registeredBy: {
      workspaceMembershipId: uuid(by.workspaceMembershipId),
      internalUserId: uuid(by.internalUserId),
    },
  } satisfies { access: 'granted' } & Record<string, unknown>;
}
export type ReceivedAddendumRelation = ReturnType<
  typeof readReceivedAddendumRelation
>;
export function readReceivedAddendumSources(value: unknown) {
  const page = record(value);
  if (!Array.isArray(page.sources) || page.sources.length > 20) invalid();
  const sources = page.sources.map((value: unknown) => {
    const row = record(value);
    return {
      parentContractId: uuid(row.parentContractId),
      parentContractVersionId: uuid(row.parentContractVersionId),
      contractVersionNumber: positive(row.contractVersionNumber),
      illustrativeReference: positive(row.illustrativeReference),
      clientId: uuid(row.clientId),
      clientDisplayName: text(row.clientDisplayName, 200),
      opportunityTitle: text(row.opportunityTitle, 200),
      recordedRecipient: recipient(row.recordedRecipient),
    };
  });
  if (
    new Set(
      sources.map((source) => source.parentContractVersionId.toLowerCase()),
    ).size !== sources.length
  )
    invalid();
  const nextCursor =
    page.nextCursor === null ? null : text(page.nextCursor, 48);
  if (
    nextCursor !== null &&
    (sources.length !== 20 || !/^[A-Za-z0-9_-]{48}$/u.test(nextCursor))
  )
    invalid();
  return { sources, nextCursor };
}
export type ReceivedAddendumSourcePage = ReturnType<
  typeof readReceivedAddendumSources
>;
