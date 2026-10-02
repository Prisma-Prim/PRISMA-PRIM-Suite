/**
 * Every opened Document detail mounts its Versions section, which reads
 * `GET /api/documents/{id}/versions`. Specs that intercept the Documents API
 * serve it explicitly: a catch-all Documents route would answer with a
 * Document body, which the section rejects with an error alert.
 */
export const DOCUMENT_VERSIONS_PATH = /^\/api\/documents\/([^/]+)\/versions$/u;

/** The Versions read of a registered Document never designated official. */
export function draftVersionsOf(document: {
  createdAt: string;
  workingRevision: number;
  correction: string;
  version: { id: string; representation: unknown };
}) {
  const representation = document.version.representation;
  if (
    !representation ||
    typeof representation !== 'object' ||
    Array.isArray(representation)
  )
    throw new Error('Expected a Document representation fixture.');
  return {
    workingRevision: document.workingRevision,
    mutable: document.correction === 'allowed',
    versions: [
      {
        id: document.version.id,
        number: 1,
        status: 'draft',
        createdAt: document.createdAt,
        createdBy: { displayName: 'Document Registrar' },
        representations: [
          {
            ...representation,
            position: 1,
            form: 'other',
            primary: true,
            appendedAfterDesignation: false,
            addedAt: document.createdAt,
            addedBy: { displayName: 'Document Registrar' },
          },
        ],
      },
    ],
  };
}
