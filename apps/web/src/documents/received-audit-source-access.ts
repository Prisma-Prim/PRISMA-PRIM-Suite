import type { ActorContext } from '../access-types';
import { holds } from '../access/company-grants';
import { grantHolding, holdsClientRead } from './document-grants';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
function auditSourceGrant(company: ActorContext['activeCompany']) {
  const access = grantHolding(
    company,
    'company_received_audit_source_access',
    'document.received_audit_source.access',
  );
  return access && uuid.test(access.assignmentId) ? access : undefined;
}
export function hasReceivedAuditSourceAccess(
  company: ActorContext['activeCompany'],
) {
  return auditSourceGrant(company) !== undefined;
}
/** Only the native source's selected captures, independent of Case and sibling families. */
export function receivedAuditSourceNativeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  const access = auditSourceGrant(company);
  const registrar = grantHolding(
    company,
    'company_document_registrar',
    'document.read',
  );
  if (
    !actor.active ||
    !company ||
    !access ||
    !(
      actor.workspacePermissions.includes('client.manage') ||
      holdsClientRead(company)
    ) ||
    !registrar ||
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
    registrar.assignmentId,
    registrar.permissionSetVersion,
    access.assignmentId,
    access.permissionSetVersion,
  ]);
  const reference = holds(
    company,
    'company_document_registrar',
    'document.reference.read',
  );
  const reader = grantHolding(
    company,
    'company_document_content_reader',
    'document.content.read',
  );
  const content =
    reference && reader
      ? JSON.stringify([
          metadata,
          reader.assignmentId,
          reader.permissionSetVersion,
        ])
      : null;
  const manage =
    reference &&
    holds(company, 'company_document_registrar', 'document.version.manage');
  const uploader = grantHolding(
    company,
    'company_document_content_uploader',
    'document.content.upload',
  );
  const approver = grantHolding(
    company,
    'company_document_approver',
    'document.version.designate_official',
  );
  return {
    metadata,
    versions: JSON.stringify([metadata, content]),
    content,
    upload:
      content && manage && uploader
        ? JSON.stringify([
            content,
            uploader.assignmentId,
            uploader.permissionSetVersion,
          ])
        : null,
    designation:
      reference && approver
        ? JSON.stringify([
            metadata,
            approver.assignmentId,
            approver.permissionSetVersion,
          ])
        : null,
    successor: manage ? JSON.stringify([metadata, 'successor']) : null,
    recovery: JSON.stringify(actor),
  };
}
