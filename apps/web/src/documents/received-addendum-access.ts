import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import {
  grantHolding,
  holdsClientRead,
  holdsContractRead,
} from './document-grants';

type Company = ActorContext['activeCompany'];
const nativeUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function hasReceivedAddendumAccess(company: Company): boolean {
  const access = grantHolding(
    company,
    'company_received_addendum_access',
    'document.received_addendum.access',
  );
  return Boolean(
    access &&
    nativeUuid.test(access.assignmentId) &&
    typeof company?.receivedAddendumClientReadCapture === 'string' &&
    /^received-addendum-client-read\.v1\.[a-f0-9]{64}$/u.test(
      company.receivedAddendumClientReadCapture,
    ),
  );
}
function clientRead(actor: ActorContext) {
  return (
    actor.workspacePermissions.includes('client.manage') ||
    holdsClientRead(actor.activeCompany)
  );
}
/** Relation reads consume both independently readable endpoints, including full scope. */
export function canReadReceivedAddendumRelation(actor: ActorContext): boolean {
  const company = actor.activeCompany;
  return Boolean(
    actor.active &&
    actor.internalUserId &&
    actor.workspaceId &&
    actor.workspaceMembershipId &&
    company?.id &&
    hasReceivedAddendumAccess(company) &&
    clientRead(actor) &&
    holds(company, 'company_document_registrar', 'document.read') &&
    holdsContractRead(company) &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read'),
  );
}
/** Only captures consumed by the picker, relation and registration; PDF work has its own owner. */
export function receivedAddendumSourceAuthority(actor: ActorContext): string {
  const company = actor.activeCompany;
  const access = grantOf(company, 'company_received_addendum_access');
  const client = grantOf(company, 'company_director_client_access');
  const registrar = grantOf(company, 'company_document_registrar');
  const preparer = grantOf(company, 'company_contract_preparer');
  const approver = grantOf(company, 'company_contract_approver');
  const intake = grantOf(company, 'company_commercial_intake');
  return JSON.stringify([
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    canReadReceivedAddendumRelation(actor),
    access?.assignmentId,
    access?.permissionSetVersion,
    company?.receivedAddendumClientReadCapture,
    actor.workspacePermissions.includes('client.manage')
      ? ['workspace', 'client.manage']
      : [
          'company',
          client?.assignmentId,
          client?.permissionSetVersion,
          holdsClientRead(company),
        ],
    registrar?.assignmentId,
    registrar?.permissionSetVersion,
    holds(company, 'company_document_registrar', 'document.read'),
    holds(company, 'company_document_registrar', 'document.register'),
    holdsContractRead(company),
    preparer?.assignmentId,
    preparer?.permissionSetVersion,
    approver?.assignmentId,
    approver?.permissionSetVersion,
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read'),
    intake?.assignmentId,
    intake?.permissionSetVersion,
  ]);
}

/** Native operation captures never consume the declared parent's authority. */
export function receivedAddendumNativeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  const registrar = grantHolding(
    company,
    'company_document_registrar',
    'document.read',
  );
  if (
    !actor.active ||
    !actor.internalUserId ||
    !actor.workspaceId ||
    !actor.workspaceMembershipId ||
    !company?.id ||
    !hasReceivedAddendumAccess(company) ||
    !registrar ||
    !clientRead(actor)
  )
    return undefined;
  const access = grantOf(company, 'company_received_addendum_access');
  const client = grantOf(company, 'company_director_client_access');
  // The strict opaque Client capture already conserves the selected native
  // Workspace/Company read alternative and its exact assignment/version.
  const metadata = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    access?.assignmentId,
    access?.permissionSetVersion,
    company.receivedAddendumClientReadCapture,
    registrar.assignmentId,
    registrar.permissionSetVersion,
    actor.workspacePermissions.includes('client.manage')
      ? ['workspace', 'client.manage']
      : ['company', client?.assignmentId, client?.permissionSetVersion],
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
          'content',
          reader.assignmentId,
          reader.permissionSetVersion,
        ])
      : null;
  const manage = holds(
    company,
    'company_document_registrar',
    'document.version.manage',
  );
  const uploader = grantHolding(
    company,
    'company_document_content_uploader',
    'document.content.upload',
  );
  const upload =
    content && manage && uploader
      ? JSON.stringify([
          content,
          'upload',
          uploader.assignmentId,
          uploader.permissionSetVersion,
        ])
      : null;
  const approver = grantHolding(
    company,
    'company_document_approver',
    'document.version.designate_official',
  );
  const designation =
    reference && approver
      ? JSON.stringify([
          metadata,
          'designation',
          approver.assignmentId,
          approver.permissionSetVersion,
        ])
      : null;
  return {
    metadata,
    versions: JSON.stringify([metadata, content]),
    content,
    upload,
    designation,
    successor:
      reference && manage ? JSON.stringify([metadata, 'successor']) : null,
    recovery: JSON.stringify(actor),
  };
}

export type ReceivedAddendumNativeAuthority = NonNullable<
  ReturnType<typeof receivedAddendumNativeAuthority>
>;
