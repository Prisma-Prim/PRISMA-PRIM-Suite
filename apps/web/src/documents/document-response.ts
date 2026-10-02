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
  /** Allowed only while the original Client is active and a draft exists. */
  correction: 'allowed' | 'read-only';
  /** The working Version: the draft if one exists, otherwise the official one. */
  version: {
    id: string;
    status: 'draft' | 'official';
    representation: DocumentReference;
  };
}
/** One unverified external reference; its URL only under Representation read. */
export type DocumentReference = {
  id: string;
  kind: 'external-reference';
  verification: 'unverified';
} & ({ access: 'granted'; url: string } | { access: 'denied' });
/** The optional preparatory Project a working Document is organized in. */
export type DocumentProjectAssociation =
  | { state: 'linked'; project: { id: string; title: string } }
  | { state: 'unlinked' };
/** A single-Document response; lists never carry the association. */
export interface WorkingDocumentDetail extends WorkingDocument {
  /** Present only for a current Project reader; absence never means unlinked. */
  projectAssociation?: DocumentProjectAssociation;
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
/** A reference is inert unless it is a credential-free HTTPS URL. */
function readReference(value: unknown): DocumentReference {
  const representation = record(value);
  if (
    representation.kind !== 'external-reference' ||
    representation.verification !== 'unverified'
  )
    throw new Error('Unknown reference');
  const base = {
    id: string(representation.id),
    kind: 'external-reference',
    verification: 'unverified',
  } as const;
  // A denied reference never carries a URL onward, whatever was sent.
  if (representation.access === 'denied') return { ...base, access: 'denied' };
  if (representation.access !== 'granted')
    throw new Error('Unknown reference access');
  const url = new URL(string(representation.url));
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Unsafe reference');
  return { ...base, access: 'granted', url: url.href };
}
export function readDocument(value: unknown): WorkingDocument {
  const row = record(value);
  const version = record(row.version);
  if (
    row.type !== 'questionnaire' ||
    row.confidentiality !== 'company-confidential' ||
    (version.status !== 'draft' && version.status !== 'official') ||
    (row.correction !== 'allowed' && row.correction !== 'read-only')
  )
    throw new Error('Unknown Document state');
  const reference = readReference(version.representation);
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
function projectAssociation(value: unknown): DocumentProjectAssociation {
  const row = record(value);
  if (row.state === 'unlinked' && !('project' in row))
    return { state: 'unlinked' };
  if (row.state !== 'linked') throw new Error('Unknown Project association');
  const project = record(row.project);
  return {
    state: 'linked',
    project: { id: string(project.id), title: string(project.title) },
  };
}
export function readDocumentDetail(value: unknown): WorkingDocumentDetail {
  const document = readDocument(value);
  const association = record(value).projectAssociation;
  return association === undefined
    ? document
    : { ...document, projectAssociation: projectAssociation(association) };
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
const correctedFields = ['title', 'purpose', 'url'] as const;
export interface DocumentCorrectionChange {
  field: (typeof correctedFields)[number];
  before: string;
  after: string;
}
/** One material correction as recorded; its values are history, not current. */
export interface DocumentCorrection {
  revision: number;
  occurredAt: string;
  actorDisplayName: string;
  /** Visible changed fields in detail order; none for a withheld URL change. */
  changes: DocumentCorrectionChange[];
}
export interface DocumentCorrectionHistoryPage {
  corrections: DocumentCorrection[];
  nextBeforeRevision: number | null;
}
/**
 * One history page, newest revision first. A page that does not continue
 * strictly below the requested revision, or whose continuation is not its last
 * revision, is not a consistent ledger read and is rejected.
 */
export function readDocumentCorrectionHistory(
  value: unknown,
  beforeRevision: number | undefined,
): DocumentCorrectionHistoryPage {
  const page = record(value);
  if (!Array.isArray(page.corrections)) throw new Error('Invalid history');
  const corrections = page.corrections.map(readDocumentCorrection);
  let upperBound = beforeRevision ?? Number.POSITIVE_INFINITY;
  for (const correction of corrections) {
    if (correction.revision >= upperBound) throw new Error('Invalid history');
    upperBound = correction.revision;
  }
  const nextBeforeRevision =
    page.nextBeforeRevision === null
      ? null
      : positiveInteger(page.nextBeforeRevision);
  if (
    nextBeforeRevision !== null &&
    nextBeforeRevision !== corrections.at(-1)?.revision
  )
    throw new Error('Invalid history');
  return { corrections, nextBeforeRevision };
}
function readDocumentCorrection(value: unknown): DocumentCorrection {
  const row = record(value);
  const changes = record(row.changes);
  if (
    Object.keys(changes).some(
      (field) => !correctedFields.some((known) => known === field),
    )
  )
    throw new Error('Unknown corrected field');
  return {
    revision: positiveInteger(row.revision),
    occurredAt: instant(row.occurredAt),
    actorDisplayName: string(record(row.actor).displayName),
    changes: correctedFields.flatMap((field) => {
      if (!Object.hasOwn(changes, field)) return [];
      const change = record(changes[field]);
      return [
        { field, before: string(change.before), after: string(change.after) },
      ];
    }),
  };
}
const MAXIMUM_DOCUMENT_VERSIONS = 50;
interface DocumentVersionBase {
  id: string;
  number: number;
  createdAt: string;
  createdByDisplayName: string;
  references: DocumentVersionReference[];
}
export type DocumentRepresentationForm =
  'editable' | 'rendered' | 'signed' | 'other';
export type DocumentVersionReference = DocumentReference & {
  position: number;
  form: DocumentRepresentationForm;
  primary: boolean;
  appendedAfterDesignation: boolean;
  addedAt: string;
  addedByDisplayName: string;
};
interface DocumentVersionDesignation {
  designatedAt: string;
  designatedByDisplayName: string;
  /** The Document title and purpose frozen at designation. */
  frozen: { title: string; purpose: string };
}
/** One formal Version, discriminated by its content status. */
export type DocumentVersion =
  | (DocumentVersionBase & { status: 'draft' })
  | (DocumentVersionBase & DocumentVersionDesignation & { status: 'official' })
  | (DocumentVersionBase &
      DocumentVersionDesignation & {
        status: 'superseded';
        supersededAt: string;
        supersededByVersionNumber: number;
      });
export interface DocumentVersions {
  workingRevision: number;
  /** Commands are offered only while the original Client stays active. */
  mutable: boolean;
  /** Highest number first. */
  versions: DocumentVersion[];
}
/**
 * One Versions read. It must list at most 50 Versions, highest number first,
 * with at most one draft and one official Version; anything else is not a
 * consistent read and is rejected.
 */
export function readDocumentVersions(value: unknown): DocumentVersions {
  const read = record(value);
  if (
    !Array.isArray(read.versions) ||
    read.versions.length > MAXIMUM_DOCUMENT_VERSIONS ||
    typeof read.mutable !== 'boolean'
  )
    throw new Error('Invalid Versions');
  const versions = read.versions.map(readDocumentVersion);
  let upperBound = Number.POSITIVE_INFINITY;
  for (const version of versions) {
    if (version.number >= upperBound) throw new Error('Invalid Versions');
    upperBound = version.number;
  }
  for (const status of ['draft', 'official'] as const)
    if (versions.filter((version) => version.status === status).length > 1)
      throw new Error('Invalid Versions');
  return {
    workingRevision: positiveInteger(read.workingRevision),
    mutable: read.mutable,
    versions,
  };
}
function readDocumentVersion(value: unknown): DocumentVersion {
  const row = record(value);
  if (
    !Array.isArray(row.representations) ||
    row.representations.length < 1 ||
    row.representations.length > 10
  )
    throw new Error('Invalid Version reference');
  const references = row.representations.map(readDocumentVersionReference);
  let previousPosition = 0;
  for (const [index, reference] of references.entries()) {
    if (
      reference.position <= previousPosition ||
      reference.primary !== (index === 0)
    )
      throw new Error('Invalid Version reference');
    previousPosition = reference.position;
  }
  const base: DocumentVersionBase = {
    id: string(row.id),
    number: versionNumber(row.number),
    createdAt: instant(row.createdAt),
    createdByDisplayName: string(record(row.createdBy).displayName),
    references,
  };
  switch (row.status) {
    case 'draft':
      return { ...base, status: 'draft' };
    case 'official':
      return { ...base, ...readDesignation(row), status: 'official' };
    case 'superseded':
      return {
        ...base,
        ...readDesignation(row),
        status: 'superseded',
        supersededAt: instant(row.supersededAt),
        supersededByVersionNumber: versionNumber(row.supersededByVersionNumber),
      };
    default:
      throw new Error('Unknown Version status');
  }
}
function readDocumentVersionReference(
  value: unknown,
): DocumentVersionReference {
  const row = record(value);
  if (
    !isRepresentationForm(row.form) ||
    typeof row.primary !== 'boolean' ||
    typeof row.appendedAfterDesignation !== 'boolean'
  )
    throw new Error('Invalid Version reference');
  return {
    ...readReference(value),
    position: positiveInteger(row.position),
    form: row.form,
    primary: row.primary,
    appendedAfterDesignation: row.appendedAfterDesignation,
    addedAt: instant(row.addedAt),
    addedByDisplayName: string(record(row.addedBy).displayName),
  };
}
function isRepresentationForm(
  value: unknown,
): value is DocumentRepresentationForm {
  return (
    value === 'editable' ||
    value === 'rendered' ||
    value === 'signed' ||
    value === 'other'
  );
}
function readDesignation(
  row: Record<string, unknown>,
): DocumentVersionDesignation {
  const frozen = record(row.frozen);
  return {
    designatedAt: instant(row.designatedAt),
    designatedByDisplayName: string(record(row.designatedBy).displayName),
    frozen: { title: string(frozen.title), purpose: string(frozen.purpose) },
  };
}
function versionNumber(value: unknown): number {
  const number = positiveInteger(value);
  if (number > MAXIMUM_DOCUMENT_VERSIONS) throw new Error('Invalid response');
  return number;
}
interface DocumentVersionReceiptBase {
  documentId: string;
  workingRevision: number;
  versionId: string;
  versionNumber: number;
}
/** The durable result of one confirmed Version command. */
export type DocumentVersionReceipt =
  | (DocumentVersionReceiptBase & {
      action: 'designated_official';
      supersededVersionNumber: number | null;
    })
  | (DocumentVersionReceiptBase & {
      action: 'drafted';
      sourceVersionNumber: number;
    })
  | (DocumentVersionReceiptBase & {
      action: 'representation_added';
      representationId: string;
      appendedAfterDesignation: boolean;
    })
  | (DocumentVersionReceiptBase & {
      action: 'representation_removed';
      representationId: string;
    });
export function readDocumentVersionReceipt(
  value: unknown,
): DocumentVersionReceipt {
  const row = record(value);
  const base = {
    documentId: string(row.documentId),
    workingRevision: positiveInteger(row.workingRevision),
    versionId: string(row.versionId),
    versionNumber: versionNumber(row.versionNumber),
  };
  switch (row.action) {
    case 'designated_official':
      return {
        ...base,
        action: 'designated_official',
        supersededVersionNumber:
          row.supersededVersionNumber === null
            ? null
            : versionNumber(row.supersededVersionNumber),
      };
    case 'drafted':
      return {
        ...base,
        action: 'drafted',
        sourceVersionNumber: versionNumber(row.sourceVersionNumber),
      };
    case 'representation_added':
      if (typeof row.appendedAfterDesignation !== 'boolean')
        throw new Error('Unknown Version command');
      return {
        ...base,
        action: 'representation_added',
        representationId: string(row.representationId),
        appendedAfterDesignation: row.appendedAfterDesignation,
      };
    case 'representation_removed':
      return {
        ...base,
        action: 'representation_removed',
        representationId: string(row.representationId),
      };
    default:
      throw new Error('Unknown Version command');
  }
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
