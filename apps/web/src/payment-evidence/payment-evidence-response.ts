/** Closed protected source projection. Public Document fields remain native. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return Object.fromEntries(Object.entries(value));
}
function exact(row: Record<string, unknown>, fields: readonly string[]) {
  if (
    Object.keys(row).length !== fields.length ||
    Object.keys(row).some((key) => !fields.includes(key))
  )
    invalid();
}
function text(value: unknown, maximum = 2000): string {
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
  const result = text(value);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      result,
    )
  )
    invalid();
  return result;
}
function nullableText(value: unknown, maximum = 2000): string | null {
  return value === null ? null : text(value, maximum);
}
function instant(value: unknown): string {
  const result = text(value),
    date = new Date(result);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== result)
    invalid();
  return result;
}
function calendarDate(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(result) || result.startsWith('0000'))
    invalid();
  const date = new Date(result + 'T00:00:00.000Z');
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== result
  )
    invalid();
  return result;
}
function payer(value: unknown) {
  const row = record(value);
  if (row.kind === 'UNAVAILABLE') {
    exact(row, ['kind']);
    return { kind: 'UNAVAILABLE' as const };
  }
  if (row.kind !== 'AVAILABLE') invalid();
  exact(row, ['kind', 'party']);
  const party = record(row.party);
  if (party.kind !== 'PRIMARY' && party.kind !== 'ADDITIONAL') invalid();
  exact(
    party,
    party.kind === 'PRIMARY'
      ? ['kind', 'legalName', 'taxId', 'legalAddress']
      : ['kind', 'legalEntityId', 'legalName', 'taxId', 'legalAddress'],
  );
  const identity = {
    legalName: text(party.legalName, 200),
    taxId: nullableText(party.taxId, 500),
    legalAddress: nullableText(party.legalAddress),
  };
  return {
    kind: 'AVAILABLE' as const,
    party:
      party.kind === 'PRIMARY'
        ? { kind: 'PRIMARY' as const, ...identity }
        : {
            kind: 'ADDITIONAL' as const,
            legalEntityId: uuid(party.legalEntityId),
            ...identity,
          },
  };
}
export function readPaymentEvidenceSource(value: unknown) {
  const row = record(value);
  exact(row, [
    'format',
    'receivingCompanyLabel',
    'sourceDescription',
    'receivedOn',
    'registeredAt',
    'registeredBy',
    'payer',
  ]);
  if (row.format !== 'PAYMENT_EVIDENCE_SOURCE/1') invalid();
  const actor = record(row.registeredBy);
  exact(actor, ['workspaceMembershipId', 'internalUserId']);
  return {
    format: 'PAYMENT_EVIDENCE_SOURCE/1' as const,
    receivingCompanyLabel: text(row.receivingCompanyLabel, 200),
    sourceDescription: text(row.sourceDescription),
    receivedOn: calendarDate(row.receivedOn),
    registeredAt: instant(row.registeredAt),
    registeredBy: {
      workspaceMembershipId: uuid(actor.workspaceMembershipId),
      internalUserId: uuid(actor.internalUserId),
    },
    payer: payer(row.payer),
  };
}
export type PaymentEvidenceSource = ReturnType<
  typeof readPaymentEvidenceSource
>;
export function readPaymentEvidenceDocument(value: unknown) {
  const row = record(value),
    version = record(row.version);
  if (
    row.type !== 'payment-evidence' ||
    row.confidentiality !== 'company-confidential' ||
    'projectAssociation' in row ||
    (row.correction !== 'allowed' && row.correction !== 'read-only') ||
    (version.status !== 'draft' && version.status !== 'official') ||
    version.representation !== null ||
    typeof row.workingRevision !== 'number' ||
    !Number.isInteger(row.workingRevision) ||
    row.workingRevision < 1 ||
    row.workingRevision > 2147483647
  )
    invalid();
  return {
    id: uuid(row.id),
    companyId: uuid(row.companyId),
    clientId: uuid(row.clientId),
    clientDisplayName: text(row.clientDisplayName, 200),
    type: 'payment-evidence' as const,
    title: text(row.title, 200),
    purpose: text(row.purpose),
    confidentiality: 'company-confidential' as const,
    createdAt: instant(row.createdAt),
    workingRevision: row.workingRevision,
    correction:
      row.correction === 'allowed'
        ? ('allowed' as const)
        : ('read-only' as const),
    version: {
      id: uuid(version.id),
      status:
        version.status === 'draft' ? ('draft' as const) : ('official' as const),
      representation: null,
    },
    paymentEvidenceSource: readPaymentEvidenceSource(row.paymentEvidenceSource),
  };
}
export type PaymentEvidenceDocument = ReturnType<
  typeof readPaymentEvidenceDocument
>;
/** Other native families are outside this feature's parser and inventory. */
export function readPaymentEvidenceDocuments(
  value: unknown,
): PaymentEvidenceDocument[] {
  if (!Array.isArray(value)) invalid();
  const entries: unknown[] = value;
  return entries
    .filter((entry) => record(entry).type === 'payment-evidence')
    .map(readPaymentEvidenceDocument);
}
/** Metadata cache never retains the independently protected structured payer. */
export function paymentEvidenceMetadata(
  document: PaymentEvidenceDocument,
): PaymentEvidenceDocument {
  return {
    ...document,
    paymentEvidenceSource: {
      ...document.paymentEvidenceSource,
      payer: { kind: 'UNAVAILABLE' },
    },
  };
}
function invalid(): never {
  throw new Error('Invalid Payment Evidence response.');
}
