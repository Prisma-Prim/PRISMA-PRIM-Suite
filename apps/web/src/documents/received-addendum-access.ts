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
