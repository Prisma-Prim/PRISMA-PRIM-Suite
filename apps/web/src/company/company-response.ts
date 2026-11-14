/** Creation consumes only the reference used for the confirming read. */
export function readCreatedCompanyReference(value: unknown) {
  return { id: text(record(value).id) };
}

/** The confirming read proves the active Company the registration created. */
export function readRegisteredCompany(
  value: unknown,
  expected: { companyId: string; workspaceId: string },
) {
  const row = record(value);
  const reference = readCreatedCompanyReference(row);
  if (
    reference.id !== expected.companyId ||
    row.workspaceId !== expected.workspaceId ||
    row.status !== 'active'
  )
    throw new Error('Invalid registered Company.');
  const createdAt = text(row.createdAt);
  const date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== createdAt)
    throw new Error('Invalid Company creation instant.');
  return {
    ...reference,
    workspaceId: expected.workspaceId,
    displayName: text(row.displayName),
    status: 'active' as const,
    createdAt,
    createdByInternalUserId: text(row.createdByInternalUserId),
  };
}

/** Additive HTTP projection of the identities the Company selector consumes. */
export function readVisibleCompanies(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Invalid visible Company list.');
  const entries: unknown[] = value;
  const ids = new Set<string>();
  return entries.map((entry) => {
    const row = record(entry);
    const reference = readCreatedCompanyReference(row);
    if (ids.has(reference.id)) throw new Error('Duplicate visible Company.');
    ids.add(reference.id);
    return { ...reference, displayName: text(row.displayName) };
  });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid Company response.');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Invalid Company text.');
  return value;
}
