import type { ActorContext } from '../access-types';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
export function hasReceivedAuditSourceAccess(
  company: ActorContext['activeCompany'],
) {
  return (
    company?.receivedAuditSourceAccessPermissionSetVersion === 'v1' &&
    typeof company.receivedAuditSourceAccessAssignmentId === 'string' &&
    uuid.test(company.receivedAuditSourceAccessAssignmentId) &&
    company.documentPermissions?.includes(
      'document.received_audit_source.access',
    ) === true
  );
}
/** Only the native source's selected captures, independent of Case and sibling families. */
export function receivedAuditSourceNativeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  const permissions = company?.documentPermissions ?? [];
  if (
    !actor.active ||
    !company ||
    !hasReceivedAuditSourceAccess(company) ||
    !(
      actor.workspacePermissions.includes('client.manage') ||
      (company.clientPermissions?.includes('client.read') &&
        company.clientPermissionAssignmentId &&
        ['v1', 'v2'].includes(company.clientPermissionSetVersion ?? ''))
    ) ||
    !permissions.includes('document.read') ||
    !company.documentPermissionAssignmentId ||
    !['v1', 'v2', 'v3'].includes(company.documentPermissionSetVersion ?? '') ||
    typeof company.workingEvidenceClientReadCapture !== 'string' ||
    !/^working-evidence-client-read\.v1\.[a-f0-9]{64}$/u.test(
      company.workingEvidenceClientReadCapture,
    ) ||
    typeof company.workingEvidenceContextCapture !== 'string' ||
    !/^working-evidence-context\.v1\.[a-f0-9]{64}$/u.test(
      company.workingEvidenceContextCapture,
    )
  )
    return undefined;
  const metadata = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    company.workingEvidenceContextCapture,
    company.workingEvidenceClientReadCapture,
    company.documentPermissionAssignmentId,
    company.documentPermissionSetVersion,
    company.receivedAuditSourceAccessAssignmentId,
    company.receivedAuditSourceAccessPermissionSetVersion,
  ]);
  const reference = permissions.includes('document.reference.read');
  const content =
    reference &&
    permissions.includes('document.content.read') &&
    company.documentContentReaderAssignmentId &&
    company.documentContentReaderPermissionSetVersion === 'v1'
      ? JSON.stringify([
          metadata,
          company.documentContentReaderAssignmentId,
          'v1',
        ])
      : null;
  const manage =
    reference &&
    company.documentPermissionSetVersion === 'v3' &&
    permissions.includes('document.version.manage');
  return {
    metadata,
    versions: JSON.stringify([metadata, content]),
    content,
    upload:
      content &&
      manage &&
      permissions.includes('document.content.upload') &&
      company.documentContentUploaderAssignmentId &&
      company.documentContentUploaderPermissionSetVersion === 'v1'
        ? JSON.stringify([
            content,
            company.documentContentUploaderAssignmentId,
            'v1',
          ])
        : null,
    designation:
      reference &&
      permissions.includes('document.version.designate_official') &&
      company.documentApproverAssignmentId &&
      company.documentApproverPermissionSetVersion === 'v1'
        ? JSON.stringify([metadata, company.documentApproverAssignmentId, 'v1'])
        : null,
    successor: manage ? JSON.stringify([metadata, 'successor']) : null,
    recovery: JSON.stringify(actor),
  };
}
