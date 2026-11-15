import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import { grantHolding } from '../documents/document-grants';
import { uuid } from './knowledge-response';

/** The bundles whose grants make up the Company's Document permissions. */
const DOCUMENT_BUNDLES = [
  'company_document_project_organizer',
  'company_document_registrar',
  'company_document_approver',
  'company_document_content_reader',
  'company_document_content_uploader',
  'company_mission_deliverable_access',
  'company_received_contract_access',
  'company_received_addendum_access',
  'company_received_audit_source_access',
] as const;

/** UI representation establishes readiness, never live authorization. */
export function knowledgeAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company ||
    !uuid(company.id) ||
    !uuid(actor.workspaceId) ||
    !uuid(actor.workspaceMembershipId) ||
    !uuid(actor.internalUserId)
  )
    return null;
  const reader = grantOf(company, 'company_knowledge_evidence_reader');
  const registrar = grantHolding(
    company,
    'company_document_registrar',
    'document.read',
  );
  const contentReader = grantHolding(
    company,
    'company_document_content_reader',
    'document.content.read',
  );
  const client = grantHolding(
    company,
    'company_director_client_access',
    'client.read',
  );
  if (
    !reader ||
    !uuid(reader.assignmentId) ||
    !registrar ||
    !uuid(registrar.assignmentId) ||
    !holds(company, 'company_document_registrar', 'document.reference.read') ||
    !contentReader ||
    !uuid(contentReader.assignmentId) ||
    (!actor.workspacePermissions.includes('client.manage') &&
      (!client || !uuid(client.assignmentId)))
  )
    return null;
  return {
    companyId: company.id,
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceMembershipId,
      actor.workspaceId,
      company.id,
      reader.assignmentId,
      actor.workspacePermissions.includes('client.manage'),
      grantOf(company, 'company_director_client_access') ?? null,
      DOCUMENT_BUNDLES.map((bundle) => grantOf(company, bundle) ?? null),
    ]),
  };
}
