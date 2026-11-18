import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import {
  documentFamilyCaptureKey,
  hasDocumentFamilyAccess,
} from './document-family-access';
import { captureOf, grantHolding, holdsClientRead } from './document-grants';
import {
  hasExternalInvoiceAccess,
  hasExternalInvoiceNativeRead,
} from './external-invoice-access';
import { receivedAddendumNativeAuthority } from './received-addendum-access';
import { receivedAuditSourceNativeAuthority } from './received-audit-source-access';
import type { DocumentFamily } from './document-response';

/** Each operation consumes its own recorded grants, never sibling content work. */
export function documentNativeAuthority(
  actor: ActorContext,
  family: DocumentFamily,
) {
  if (family === 'received-addendum')
    return receivedAddendumNativeAuthority(actor);
  if (family === 'received-audit-source')
    return receivedAuditSourceNativeAuthority(actor);
  if (family === 'payment-evidence') return undefined;
  const company = actor.activeCompany;
  const registrar = grantHolding(
    company,
    'company_document_registrar',
    'document.read',
  );
  const workspaceClientRead =
    actor.workspacePermissions.includes('client.manage');
  if (
    !actor.active ||
    !company ||
    !registrar ||
    !hasDocumentFamilyAccess(company, family) ||
    (family === 'external-invoice' &&
      !hasExternalInvoiceNativeRead(company, workspaceClientRead))
  )
    return undefined;
  const metadata = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    documentFamilyCaptureKey(company, family),
    ...captureOf(registrar),
    workspaceClientRead
      ? ['workspace', 'client.manage']
      : [
          ...captureOf(grantOf(company, 'company_director_client_access')),
          holdsClientRead(company),
        ],
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
      ? JSON.stringify([metadata, 'content', ...captureOf(reader)])
      : null;
  const mutableFamily =
    family !== 'external-invoice' || hasExternalInvoiceAccess(company, true);
  const manage =
    mutableFamily &&
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
    versions: JSON.stringify([metadata, reference, content]),
    content,
    upload:
      content && manage && uploader
        ? JSON.stringify([content, 'upload', ...captureOf(uploader)])
        : null,
    designation:
      family !== 'project-source' && mutableFamily && reference && approver
        ? JSON.stringify([metadata, 'designation', ...captureOf(approver)])
        : null,
    successor:
      family !== 'project-source' && manage
        ? JSON.stringify([metadata, 'successor'])
        : null,
    recovery: JSON.stringify(actor),
  };
}
export type DocumentNativeAuthority = NonNullable<
  ReturnType<typeof documentNativeAuthority>
>;
