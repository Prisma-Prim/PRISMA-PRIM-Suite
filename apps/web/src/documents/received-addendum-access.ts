import type { ActorContext } from '../access-types';

type Company = ActorContext['activeCompany'];
function nativeCapture(
  id: unknown,
  version: unknown,
  versions: readonly string[],
) {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof version === 'string' &&
    versions.includes(version)
  );
}
export function hasReceivedAddendumAccess(company: Company): boolean {
  return Boolean(
    company?.receivedAddendumAccessPermissionSetVersion === 'v1' &&
    typeof company.receivedAddendumAccessAssignmentId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      company.receivedAddendumAccessAssignmentId,
    ) &&
    typeof company.receivedAddendumClientReadCapture === 'string' &&
    /^received-addendum-client-read\.v1\.[a-f0-9]{64}$/u.test(
      company.receivedAddendumClientReadCapture,
    ) &&
    company.documentPermissions?.includes('document.received_addendum.access'),
  );
}
function clientRead(actor: ActorContext) {
  const company = actor.activeCompany;
  return (
    actor.workspacePermissions.includes('client.manage') ||
    Boolean(
      company?.clientPermissions?.includes('client.read') &&
      nativeCapture(
        company.clientPermissionAssignmentId,
        company.clientPermissionSetVersion,
        ['v1', 'v2'],
      ),
    )
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
    company.documentPermissions?.includes('document.read') &&
    nativeCapture(
      company.documentPermissionAssignmentId,
      company.documentPermissionSetVersion,
      ['v1', 'v2', 'v3'],
    ) &&
    company.contractPermissions?.includes('commercial.contract.read') &&
    (nativeCapture(
      company.contractPermissionAssignmentId,
      company.contractPermissionSetVersion,
      ['v1', 'v2'],
    ) ||
      nativeCapture(
        company.contractApproverAssignmentId,
        company.contractApproverPermissionSetVersion,
        ['v1', 'v2'],
      ) ||
      nativeCapture(
        company.contractEarlyPreparationAssignmentId,
        company.contractEarlyPreparationPermissionSetVersion,
        ['v1'],
      )) &&
    company.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ) &&
    nativeCapture(
      company.commercialIntakePermissionAssignmentId,
      company.commercialIntakePermissionSetVersion,
      ['v1', 'v2', 'v3', 'v4'],
    ),
  );
}
/** Only captures consumed by the picker, relation and registration; PDF work has its own owner. */
export function receivedAddendumSourceAuthority(actor: ActorContext): string {
  const company = actor.activeCompany;
  return JSON.stringify([
    actor.active,
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company?.id,
    canReadReceivedAddendumRelation(actor),
    company?.receivedAddendumAccessAssignmentId,
    company?.receivedAddendumAccessPermissionSetVersion,
    company?.receivedAddendumClientReadCapture,
    actor.workspacePermissions.includes('client.manage')
      ? ['workspace', 'client.manage']
      : [
          'company',
          company?.clientPermissionAssignmentId,
          company?.clientPermissionSetVersion,
          company?.clientPermissions?.includes('client.read'),
        ],
    company?.documentPermissionAssignmentId,
    company?.documentPermissionSetVersion,
    company?.documentPermissions?.includes('document.read'),
    company?.documentPermissions?.includes('document.register'),
    company?.contractPermissions?.includes('commercial.contract.read'),
    company?.contractPermissionAssignmentId,
    company?.contractPermissionSetVersion,
    company?.contractApproverAssignmentId,
    company?.contractApproverPermissionSetVersion,
    company?.contractEarlyPreparationAssignmentId,
    company?.contractEarlyPreparationPermissionSetVersion,
    company?.commercialIntakePermissions?.includes(
      'commercial.opportunity.read',
    ),
    company?.commercialIntakePermissionAssignmentId,
    company?.commercialIntakePermissionSetVersion,
  ]);
}

/** Native operation captures never consume the declared parent's authority. */
export function receivedAddendumNativeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  const permissions = company?.documentPermissions ?? [];
  if (
    !actor.active ||
    !actor.internalUserId ||
    !actor.workspaceId ||
    !actor.workspaceMembershipId ||
    !company?.id ||
    !hasReceivedAddendumAccess(company) ||
    !permissions.includes('document.read') ||
    !nativeCapture(
      company.documentPermissionAssignmentId,
      company.documentPermissionSetVersion,
      ['v1', 'v2', 'v3'],
    ) ||
    !(
      actor.workspacePermissions.includes('client.manage') ||
      (company.clientPermissions?.includes('client.read') &&
        nativeCapture(
          company.clientPermissionAssignmentId,
          company.clientPermissionSetVersion,
          ['v1', 'v2'],
        ))
    )
  )
    return undefined;
  // The strict opaque Client capture already conserves the selected native
  // Workspace/Company read alternative and its exact assignment/version.
  const metadata = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
    company.receivedAddendumAccessAssignmentId,
    company.receivedAddendumAccessPermissionSetVersion,
    company.receivedAddendumClientReadCapture,
    company.documentPermissionAssignmentId,
    company.documentPermissionSetVersion,
    actor.workspacePermissions.includes('client.manage')
      ? ['workspace', 'client.manage']
      : [
          'company',
          company.clientPermissionAssignmentId,
          company.clientPermissionSetVersion,
        ],
  ]);
  const reference = permissions.includes('document.reference.read');
  const content =
    reference &&
    permissions.includes('document.content.read') &&
    nativeCapture(
      company.documentContentReaderAssignmentId,
      company.documentContentReaderPermissionSetVersion,
      ['v1'],
    )
      ? JSON.stringify([
          metadata,
          'content',
          company.documentContentReaderAssignmentId,
          company.documentContentReaderPermissionSetVersion,
        ])
      : null;
  const manage =
    company.documentPermissionSetVersion === 'v3' &&
    permissions.includes('document.version.manage');
  const upload =
    content &&
    manage &&
    permissions.includes('document.content.upload') &&
    nativeCapture(
      company.documentContentUploaderAssignmentId,
      company.documentContentUploaderPermissionSetVersion,
      ['v1'],
    )
      ? JSON.stringify([
          content,
          'upload',
          company.documentContentUploaderAssignmentId,
          company.documentContentUploaderPermissionSetVersion,
        ])
      : null;
  const designation =
    reference &&
    permissions.includes('document.version.designate_official') &&
    nativeCapture(
      company.documentApproverAssignmentId,
      company.documentApproverPermissionSetVersion,
      ['v1'],
    )
      ? JSON.stringify([
          metadata,
          'designation',
          company.documentApproverAssignmentId,
          company.documentApproverPermissionSetVersion,
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
