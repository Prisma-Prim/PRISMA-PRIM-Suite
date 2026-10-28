import type { ActorContext } from '../access-types';
import { hasDocumentFamilyAccess } from '../documents/document-family-access';
import {
  readDocument,
  readDocumentVersions,
  type WorkingDocument,
  type DocumentVersion,
} from '../documents/document-response';
export type Association = { document: WorkingDocument; revision: number };
export type Discovery =
  | { kind: 'idle' | 'loading' | 'denied' | 'malformed' | 'error' }
  | { kind: 'ready'; documents: Association[] };
export type VersionRead =
  | { kind: 'loading' | 'malformed' | 'denied' | 'error' }
  | { kind: 'ready'; versions: DocumentVersion[] };
export type Selected = {
  item: {
    documentId: string;
    versionId: string;
    representationId: string;
    expectedProjectRevision: number;
  };
  title: string;
  number: number;
  status: DocumentVersion['status'];
  fileName: string;
  size: number;
};
export type Feedback = 'error' | 'stale' | 'oversize' | 'limit' | null;
function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  )
    throw new Error('Invalid identity');
  return value;
}
export function readProjectPdfAssociations(
  value: unknown,
  scope: {
    companyId: string | undefined;
    actor: ActorContext;
    originalClientId: string;
  },
): Association[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !('documents' in value) ||
    !Array.isArray(value.documents) ||
    !('mutable' in value) ||
    typeof value.mutable !== 'boolean'
  )
    throw new Error('Invalid associations');
  const ids = new Set<string>();
  return value.documents.map((entry: unknown) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !('document' in entry) ||
      !('revision' in entry) ||
      typeof entry.revision !== 'number' ||
      !Number.isSafeInteger(entry.revision) ||
      entry.revision < 0 ||
      entry.revision > 2147483647
    )
      throw new Error('Invalid revision');
    const document = readDocument(entry.document);
    uuid(document.id);
    uuid(document.clientId);
    uuid(document.version.id);
    if (
      document.companyId !== scope.companyId ||
      document.clientId !== scope.originalClientId ||
      ids.has(document.id) ||
      !hasDocumentFamilyAccess(scope.actor.activeCompany, document.type)
    )
      throw new Error('Invalid scope');
    ids.add(document.id);
    return { document, revision: entry.revision };
  });
}

export function readProjectPdfVersions(
  value: unknown,
  family: WorkingDocument['type'],
) {
  const read = readDocumentVersions(value, family);
  if (read.versions.length === 0 || read.workingRevision > 2147483647)
    throw new Error('Invalid Versions');
  const ids = new Set<string>();
  const pdfIds = new Set<string>();
  for (const version of read.versions) {
    uuid(version.id);
    if (ids.has(version.id)) throw new Error('Repeated Version');
    ids.add(version.id);
    if (
      version.pdfContent.state === 'stored' &&
      version.pdfContent.access === 'granted'
    ) {
      const pdf = version.pdfContent;
      uuid(pdf.representationId);
      if (
        pdfIds.has(pdf.representationId) ||
        pdf.revision > read.workingRevision
      )
        throw new Error('Invalid PDF identity');
      pdfIds.add(pdf.representationId);
    }
  }
  return read.versions;
}
