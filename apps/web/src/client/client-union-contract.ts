export const unionFields = [
  'displayName',
  'taxId',
  'address',
  'telephone',
  'generalEmail',
  'businessActivity',
] as const;
export type UnionField = (typeof unionFields)[number];

export function unionObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid union response.');
  return Object.fromEntries(Object.entries(value));
}
export function unionString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid union text.');
  return value;
}
function optionalText(value: unknown): string | null {
  return value === null ? null : unionString(value);
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid union list.');
  return value;
}
function client(value: unknown) {
  const row = unionObject(value);
  if (
    typeof row.version !== 'number' ||
    !Number.isInteger(row.version) ||
    row.version < 1
  )
    throw new Error('Invalid dossier version.');
  return {
    id: unionString(row.id),
    version: row.version,
    displayName: unionString(row.displayName),
    taxId: optionalText(row.taxId),
    address: optionalText(row.address),
    telephone: optionalText(row.telephone),
    generalEmail: optionalText(row.generalEmail),
    businessActivity: optionalText(row.businessActivity),
    contacts: list(row.contacts).map((entry) => {
      const contact = unionObject(entry);
      return {
        name: unionString(contact.name),
        ...(contact.telephone === undefined
          ? {}
          : { telephone: unionString(contact.telephone) }),
        ...(contact.email === undefined
          ? {}
          : { email: unionString(contact.email) }),
      };
    }),
  };
}
function companies(value: unknown) {
  return list(value).map((entry) => {
    const company = unionObject(entry);
    return {
      id: unionString(company.id),
      displayName: unionString(company.displayName),
    };
  });
}
function originals(value: unknown) {
  const rows = list(value).map(client);
  const [first, second] = rows;
  if (!first || !second || rows.length !== 2 || first.id === second.id)
    throw new Error('Invalid union pair.');
  return [first, second] as const;
}
export function readUnionReview(value: unknown) {
  const row = unionObject(value);
  if (row.outcome === 'multiple_duplicate_candidates_require_data_remediation')
    return {
      outcome:
        'multiple_duplicate_candidates_require_data_remediation' as const,
    };
  if (row.outcome !== 'comparison')
    throw new Error('Invalid union comparison.');
  return {
    outcome: 'comparison' as const,
    reviewReference: unionString(row.reviewReference),
    clients: originals(row.clients),
    companies: companies(row.companies),
  };
}
export type UnionComparison = Extract<
  ReturnType<typeof readUnionReview>,
  { outcome: 'comparison' }
>;

function action(
  value: unknown,
): 'client.union_confirmed' | 'client.union_reversed' {
  if (value !== 'client.union_confirmed' && value !== 'client.union_reversed')
    throw new Error('Invalid union event.');
  return value;
}

export function readUnionHistory(value: unknown) {
  const row = unionObject(value);
  const events = list(row.events).map((entry) => {
    const event = unionObject(entry);
    return {
      action: action(event.action),
      projectionReference: unionString(event.projectionReference),
      companyId: unionString(event.companyId),
    };
  });
  const references = new Set(events.map((event) => event.projectionReference));
  return {
    events,
    detailReferences: list(row.detailReferences)
      .map(unionString)
      .filter((reference) => references.has(reference)),
  };
}

export function readUnionSources(value: unknown) {
  return list(value).map((entry) => {
    const row = unionObject(entry);
    return {
      id: unionString(row.id),
      displayName: unionString(row.displayName),
    };
  });
}
export type UnionHistory = ReturnType<typeof readUnionHistory>;

function attribution(value: unknown) {
  const row = unionObject(value);
  const actor = unionObject(row.actor);
  return {
    reason: unionString(row.reason),
    occurredAt: unionString(row.occurredAt),
    actor: {
      internalUserId: unionString(actor.internalUserId),
      displayName: unionString(actor.displayName),
    },
  };
}
export function readUnionDetail(value: unknown) {
  const row = unionObject(value);
  if (
    (row.state !== 'united' && row.state !== 'reversed') ||
    typeof row.canReverse !== 'boolean'
  )
    throw new Error('Invalid union history state.');
  return {
    ...attribution(row),
    operationId: unionString(row.operationId),
    projectionReference: unionString(row.projectionReference),
    canonicalClientId: unionString(row.canonicalClientId),
    state: row.state,
    canReverse: row.canReverse,
    originals: originals(row.originals),
    companies: companies(row.companies),
    reversal: row.reversal === null ? null : attribution(row.reversal),
  };
}
export type UnionDetail = ReturnType<typeof readUnionDetail>;
