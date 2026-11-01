import type { ActorContext } from '../access-types';
export const source = {
  sourceId: '10000000-0000-4000-8000-000000001015',
  documentId: '20000000-0000-4000-8000-000000001015',
  documentVersionId: '30000000-0000-4000-8000-000000001015',
  representationId: '40000000-0000-4000-8000-000000001015',
  sourceSha256:
    '0f1a28fd58a7366041814a2ceaf6deac31600cca74d89699b1e440a68ec6c6dd',
  projectionSha256: 'a'.repeat(64),
  title: 'Fictional evidence Ж',
  language: 'ro',
  versionStatus: 'official',
};
export const literalText = '  Four Ж boxes e\u0301\nKeep exact whitespace.  ';
export function passage() {
  return {
    source: { ...source },
    locator: 'page 1 / Ж',
    text: literalText,
    passageSha256:
      '4f8ffb0ddd9ea8282e065dfad8385ef4310c025b8f2347e8f6a019330a2c172b',
    retrievedAt: '2026-11-01T12:00:00.000Z',
  };
}
export const knowledgeActor = {
  internalUserId: '50000000-0000-4000-8000-000000001015',
  workspaceMembershipId: '60000000-0000-4000-8000-000000001015',
  workspaceId: '70000000-0000-4000-8000-000000001015',
  workspaceName: 'Fictional Workspace',
  displayName: 'Fictional Reader',
  email: 'reader@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'Company DEMO',
    knowledgeGrants: [
      {
        bundle: 'company_knowledge_evidence_reader',
        assignmentId: '80000000-0000-4000-8000-000000001015',
        permissionSetVersion: 'v1',
      },
    ],
    documentPermissions: [
      'document.read',
      'document.reference.read',
      'document.content.read',
    ],
    documentPermissionAssignmentId: '90000000-0000-4000-8000-000000001015',
    documentPermissionSetVersion: 'v3',
    documentContentReaderAssignmentId: 'a0000000-0000-4000-8000-000000001015',
    documentContentReaderPermissionSetVersion: 'v1',
    clientPermissions: ['client.read'],
    clientPermissionAssignmentId: 'b0000000-0000-4000-8000-000000001015',
    clientPermissionSetVersion: 'v1',
  },
} satisfies ActorContext;
