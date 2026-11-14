import type { ActorContext } from '../access-types';
import {
  grantOf,
  holds,
  type CompanyGrantBundle,
} from '../access/company-grants';
import { holdsOfferRead } from './contract-grants';

/** Captures consumed by this owner, without presentation or unrelated grants. */
export function reportedSigningAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const declarer = capture(c, 'company_contract_signature_declarer');
  const signature = capture(c, 'company_contract_approver');
  const offer =
    capture(c, 'company_offer_preparer') ??
    capture(c, 'company_offer_approver');
  const intake = capture(c, 'company_commercial_intake');
  const client = capture(c, 'company_director_client_access');
  const pdf = reportedSigningPdfAuthority(actor);
  const allowed = Boolean(
    actor.active &&
    c &&
    declarer &&
    signature &&
    offer &&
    intake &&
    client &&
    pdf.allowed &&
    holds(c, 'company_contract_approver', 'commercial.contract.read') &&
    holds(
      c,
      'company_contract_approver',
      'commercial.contract.signature.record',
    ) &&
    holdsOfferRead(c) &&
    holds(c, 'company_commercial_intake', 'commercial.request.read') &&
    holds(c, 'company_commercial_intake', 'commercial.opportunity.read') &&
    holds(c, 'company_director_client_access', 'client.read'),
  );
  return {
    allowed,
    key: JSON.stringify([
      declarer,
      signature,
      offer,
      intake,
      client,
      pdf.key,
      allowed,
    ]),
  };
}

export function reportedSigningPdfAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  const metadata = capture(c, 'company_document_registrar');
  const family = capture(c, 'company_received_contract_access');
  const content = capture(c, 'company_document_content_reader');
  const client = holds(c, 'company_director_client_access', 'client.read')
    ? capture(c, 'company_director_client_access')
    : undefined;
  const workspaceClient = actor.workspacePermissions.includes('client.manage');
  const allowed = Boolean(
    actor.active &&
    holds(c, 'company_document_registrar', 'document.read') &&
    holds(c, 'company_document_content_reader', 'document.content.read') &&
    holds(
      c,
      'company_received_contract_access',
      'document.received_contract.access',
    ) &&
    (client || workspaceClient) &&
    metadata &&
    family &&
    content,
  );
  return {
    allowed,
    key: JSON.stringify([
      metadata,
      family,
      content,
      client ?? workspaceClient,
      allowed,
    ]),
  };
}

/** The captured assignment and version of a live grant, as the key carries it. */
function capture(
  company: ActorContext['activeCompany'],
  bundle: CompanyGrantBundle,
) {
  const grant = grantOf(company, bundle);
  return grant
    ? {
        assignmentId: grant.assignmentId,
        permissionSetVersion: grant.permissionSetVersion,
      }
    : undefined;
}
