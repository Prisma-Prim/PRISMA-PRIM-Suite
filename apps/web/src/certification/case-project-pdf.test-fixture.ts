/** The exact Version of a fictional mission deliverable associated with the Project. */
export function caseProjectPdf(companyId: string, clientId: string) {
  const documentId = '15390000-0000-4000-8000-000000000001';
  const versionId = '15390000-0000-4000-8000-000000000002';
  const representationId = '15390000-0000-4000-8000-000000000003';
  const title = 'Fictional mission report';
  const fileName = 'mission-report.pdf';
  const date = '2026-10-28T08:00:00.000Z';
  return {
    documentId,
    versionId,
    representationId,
    title,
    fileName,
    listing: {
      mutable: true,
      documents: [
        {
          revision: 1,
          document: {
            id: documentId,
            companyId,
            clientId,
            clientDisplayName: 'Fictional Dairy',
            title,
            purpose: 'Read the exact mission output.',
            type: 'mission-deliverable',
            confidentiality: 'company-confidential',
            createdAt: date,
            workingRevision: 2,
            correction: 'allowed',
            version: { id: versionId, status: 'draft', representation: null },
          },
        },
      ],
    },
    versions: {
      workingRevision: 2,
      mutable: true,
      versions: [
        {
          id: versionId,
          number: 1,
          status: 'draft',
          createdAt: date,
          createdBy: { displayName: 'Mission Auditor Demo' },
          representations: [],
          pdfContent: {
            state: 'stored',
            access: 'granted',
            representationId,
            revision: 2,
            fileName,
            mediaType: 'application/pdf',
            size: 405,
            sha256: 'b'.repeat(64),
            storedAt: date,
            storedBy: { displayName: 'Mission Auditor Demo' },
            scan: { outcome: 'clean', engine: 'fixture', scannedAt: date },
          },
        },
      ],
    },
  };
}
