import { readDocuments } from './document-response';

/** Only existing, validated metadata is retained by the Client composition. */
export function readClientDocumentItems(value: unknown, companyId: string) {
  const documents = readDocuments(value).filter(
    (row) => row.type !== 'payment-evidence',
  );
  if (
    documents.some(
      (row) =>
        !row.id ||
        !row.version.id ||
        !row.title.trim() ||
        row.companyId !== companyId,
    ) ||
    new Set(documents.map((row) => row.id)).size !== documents.length
  )
    throw new Error('Invalid Company Document list');
  return documents.map((row) => {
    const metadata = {
      id: row.id,
      clientId: row.clientId,
      clientDossierId: row.clientDossierId,
      clientDisplayName: row.clientDisplayName,
      title: row.title,
      confidentiality: row.confidentiality,
      version: { id: row.version.id, status: row.version.status },
    };
    return row.type === 'received-addendum'
      ? { ...metadata, type: row.type }
      : { ...metadata, type: row.type, createdAt: row.createdAt };
  });
}
export type ClientDocumentItem = ReturnType<
  typeof readClientDocumentItems
>[number];
