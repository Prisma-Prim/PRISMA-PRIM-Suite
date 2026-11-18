import type { ActorContext } from '../access-types';
import { holds } from '../access/company-grants';

/** Presentation eligibility only; the server rechecks each source and operation. */
export function dossierAnalysisAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  return Boolean(
    actor.active &&
    company &&
    holds(company, 'company_project_access', 'project.read') &&
    holds(company, 'company_document_registrar', 'document.read') &&
    holds(
      company,
      'company_document_content_reader',
      'document.content.read',
    ) &&
    (actor.workspacePermissions.includes('client.manage') ||
      holds(company, 'company_director_client_access', 'client.read')),
  );
}
