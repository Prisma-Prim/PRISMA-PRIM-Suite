export interface WorkingDocument {
  id: string;
  companyId: string;
  clientId: string;
  /** Derived navigation target; absence never limits the Document itself. */
  clientDossierId?: string;
  clientDisplayName: string;
  title: string;
  purpose: string;
  type: 'questionnaire';
  confidentiality: 'company-confidential';
  createdAt: string;
  workingRevision: number;
  correction: 'allowed' | 'read-only';
  version: {
    id: string;
    status: 'draft';
    representation: {
      id: string;
      kind: 'external-reference';
      verification: 'unverified';
    } & ({ access: 'granted'; url: string } | { access: 'denied' });
  };
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid response');
  return value;
}
function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : string(value);
}
/** A server timestamp this module hands to presentation as a formattable instant. */
function instant(value: unknown): string {
  const timestamp = string(value);
  const date = new Date(timestamp);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== timestamp)
    throw new Error('Invalid response');
  return timestamp;
}
function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1)
    throw new Error('Invalid response');
  return value;
}
export function readDocument(value: unknown): WorkingDocument {
  const row = record(value);
  const version = record(row.version);
  const representation = record(version.representation);
  if (
    row.type !== 'questionnaire' ||
    row.confidentiality !== 'company-confidential' ||
    version.status !== 'draft' ||
    representation.kind !== 'external-reference' ||
    representation.verification !== 'unverified' ||
    (row.correction !== 'allowed' && row.correction !== 'read-only')
  )
    throw new Error('Unknown Document state');
  const base = {
    id: string(representation.id),
    kind: representation.kind,
    verification: representation.verification,
  };
  let reference: WorkingDocument['version']['representation'];
  if (representation.access === 'denied')
    reference = {
      ...base,
      kind: 'external-reference',
      verification: 'unverified',
      access: 'denied',
    };
  else if (representation.access === 'granted') {
    const url = new URL(string(representation.url));
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Unsafe reference');
    reference = {
      ...base,
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: url.href,
    };
  } else throw new Error('Unknown reference access');
  const clientDossierId = optionalString(row.clientDossierId);
  return {
    id: string(row.id),
    companyId: string(row.companyId),
    clientId: string(row.clientId),
    ...(clientDossierId === undefined ? {} : { clientDossierId }),
    clientDisplayName: string(row.clientDisplayName),
    title: string(row.title),
    purpose: string(row.purpose),
    type: row.type,
    confidentiality: row.confidentiality,
    createdAt: instant(row.createdAt),
    workingRevision: positiveInteger(row.workingRevision),
    correction: row.correction,
    version: {
      id: string(version.id),
      status: version.status,
      representation: reference,
    },
  };
}
export function readDocuments(value: unknown): WorkingDocument[] {
  if (!Array.isArray(value)) throw new Error('Invalid list');
  return value.map(readDocument);
}
export type DocumentCorrectionReceipt = {
  documentId: string;
  revision: number;
  outcome: 'corrected' | 'unchanged';
};
export function readDocumentCorrectionReceipt(
  value: unknown,
): DocumentCorrectionReceipt {
  const row = record(value);
  if (row.outcome !== 'corrected' && row.outcome !== 'unchanged')
    throw new Error('Unknown correction outcome');
  return {
    documentId: string(row.documentId),
    revision: positiveInteger(row.revision),
    outcome: row.outcome,
  };
}
export function readClients(
  value: unknown,
): Array<{ id: string; displayName: string }> {
  if (!Array.isArray(value)) throw new Error('Invalid Clients');
  return value.map((value: unknown) => {
    const row = record(value);
    return { id: string(row.id), displayName: string(row.displayName) };
  });
}
