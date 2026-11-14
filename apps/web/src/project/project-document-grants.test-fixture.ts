import type { CompanyGrantRequest } from '../access/company-grants.test-fixture';

/**
 * The Document grants behind a merged per-bundle `documentPermissions` list, as
 * fixtures of the Project Documents and PDF bundle screens give them. The
 * registrar takes the smallest version covering the list, so `document.read`
 * alone also brings `document.reference.read` (no registry version grants one
 * without the other).
 */
export function projectDocumentGrants(
  permissions: readonly string[],
): CompanyGrantRequest[] {
  const has = (permission: string) => permissions.includes(permission);
  const registrar: CompanyGrantRequest[] =
    has('document.read') || has('document.reference.read')
      ? [
          {
            bundle: 'company_document_registrar',
            version: has('document.version.manage')
              ? 'v3'
              : has('document.correct')
                ? 'v2'
                : 'v1',
            assignmentId: 'document-registrar-grant',
          },
        ]
      : [];
  return [
    ...registrar,
    ...(has('document.project.manage')
      ? [
          {
            bundle: 'company_document_project_organizer',
            version: 'v1',
            assignmentId: 'document-organizer-grant',
          } satisfies CompanyGrantRequest,
        ]
      : []),
    ...(has('document.content.read')
      ? [
          {
            bundle: 'company_document_content_reader',
            version: 'v1',
            assignmentId: 'document-content-reader-grant',
          } satisfies CompanyGrantRequest,
        ]
      : []),
    ...(has('document.mission_deliverable.access')
      ? [
          {
            bundle: 'company_mission_deliverable_access',
            version: 'v1',
            assignmentId: 'mission-deliverable-grant',
          } satisfies CompanyGrantRequest,
        ]
      : []),
  ];
}
