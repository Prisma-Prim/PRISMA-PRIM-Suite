import {
  COMPANY_KNOWLEDGE_EVIDENCE_READER_BUNDLE,
  COMPANY_KNOWLEDGE_SOURCE_ADMINISTRATOR_BUNDLE,
} from './company-permissions.js';

export interface KnowledgeCapturedGrant {
  bundle:
    | typeof COMPANY_KNOWLEDGE_EVIDENCE_READER_BUNDLE
    | typeof COMPANY_KNOWLEDGE_SOURCE_ADMINISTRATOR_BUNDLE;
  assignmentId: string;
  permissionSetVersion: 'v1';
}

/** Unknown captures confer no authority; a projection is not proof of live access. */
export function captureKnowledgeGrant(row: {
  bundle: string;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): KnowledgeCapturedGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  if (
    row.bundle !== COMPANY_KNOWLEDGE_EVIDENCE_READER_BUNDLE &&
    row.bundle !== COMPANY_KNOWLEDGE_SOURCE_ADMINISTRATOR_BUNDLE
  )
    return undefined;
  return {
    bundle: row.bundle,
    assignmentId: row.assignmentId,
    permissionSetVersion: row.permissionSetVersion,
  };
}
