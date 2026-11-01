import type { ActorContext } from '../access-types';
import { record, uuid } from './knowledge-response';

/** UI representation establishes readiness, never live authorization. */
export function knowledgeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company ||
    !uuid(company.id) ||
    !uuid(actor.workspaceId) ||
    !uuid(actor.workspaceMembershipId) ||
    !uuid(actor.internalUserId) ||
    !Array.isArray(company.knowledgeGrants)
  )
    return null;
  let reader: string | undefined;
  for (const value of company.knowledgeGrants) {
    let grant: Record<string, unknown>;
    try {
      grant = record(value);
    } catch {
      return null;
    }
    if (grant.bundle === 'company_knowledge_source_administrator') continue;
    if (
      grant.bundle !== 'company_knowledge_evidence_reader' ||
      grant.permissionSetVersion !== 'v1' ||
      !uuid(grant.assignmentId) ||
      reader !== undefined
    )
      return null;
    reader = grant.assignmentId;
  }
  if (
    !reader ||
    !company.documentPermissions?.includes('document.read') ||
    !company.documentPermissions.includes('document.reference.read') ||
    !company.documentPermissions.includes('document.content.read') ||
    !uuid(company.documentPermissionAssignmentId) ||
    !['v1', 'v2', 'v3'].includes(company.documentPermissionSetVersion ?? '') ||
    !uuid(company.documentContentReaderAssignmentId) ||
    company.documentContentReaderPermissionSetVersion !== 'v1' ||
    (!actor.workspacePermissions.includes('client.manage') &&
      (!company.clientPermissions?.includes('client.read') ||
        !uuid(company.clientPermissionAssignmentId) ||
        !['v1', 'v2'].includes(company.clientPermissionSetVersion ?? '')))
  )
    return null;
  return {
    companyId: company.id,
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceMembershipId,
      actor.workspaceId,
      company.id,
      reader,
      company.documentPermissionAssignmentId,
      company.documentPermissionSetVersion,
      company.documentContentReaderAssignmentId,
      company.documentContentReaderPermissionSetVersion,
      actor.workspacePermissions.includes('client.manage'),
      [...(company.clientPermissions ?? [])].sort(),
      company.clientPermissionAssignmentId,
      company.clientPermissionSetVersion,
      [...company.documentPermissions].sort(),
      company.missionDeliverableAccessAssignmentId,
      company.missionDeliverableAccessPermissionSetVersion,
      company.receivedContractAccessAssignmentId,
      company.receivedContractAccessPermissionSetVersion,
    ]),
  };
}
