import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
import {
  captureOf,
  holdsClientRead,
  holdsContractRead,
} from './document-grants';

type Company = ActorContext['activeCompany'];
const INVOICE_BUNDLES = [
  'company_external_invoice_access',
  'company_invoice_reader',
  'company_invoice_recorder',
] as const;
/**
 * The live Invoice and External Invoice grants, in bundle order, refused
 * together when one of them does not carry a native UUID assignment or two
 * of them carry the same one in another letter case.
 */
function captures(company: Company) {
  const grants = INVOICE_BUNDLES.flatMap((bundle) => {
    const grant = grantOf(company, bundle);
    return grant
      ? [
          {
            bundle,
            assignmentId: grant.assignmentId,
            permissionSetVersion: grant.permissionSetVersion,
          },
        ]
      : [];
  });
  return grants.every((grant) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
      grant.assignmentId,
    ),
  ) &&
    new Set(grants.map((grant) => grant.assignmentId.toLowerCase())).size ===
      grants.length
    ? grants
    : undefined;
}
export function hasExternalInvoiceAccess(
  company: Company,
  manage = false,
): boolean {
  const grants = captures(company);
  return Boolean(
    grants?.some(
      (grant) => grant.bundle === 'company_external_invoice_access',
    ) &&
    grants.some(
      (grant) =>
        grant.bundle === 'company_invoice_recorder' ||
        (!manage && grant.bundle === 'company_invoice_reader'),
    ),
  );
}
export function externalInvoiceCaptureKey(company: Company): string {
  return JSON.stringify(captures(company) ?? null);
}

/** The established native Actor representation uses opaque assignment IDs. */
export function hasExternalInvoiceNativeRead(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return (
    holds(company, 'company_document_registrar', 'document.read') &&
    (workspaceClientRead || holdsClientRead(company))
  );
}

export function canReadExternalInvoiceRelation(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return (
    hasExternalInvoiceNativeRead(company, workspaceClientRead) &&
    holdsContractRead(company) &&
    holds(company, 'company_commercial_intake', 'commercial.request.read') &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
  );
}

export function canSelectExternalInvoiceSource(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return (
    hasExternalInvoiceAccess(company, true) &&
    holds(company, 'company_document_registrar', 'document.register') &&
    canReadExternalInvoiceRelation(company, workspaceClientRead)
  );
}

/** Financial source work consumes these exact native captures, independently of sibling families. */
export function externalInvoiceSourceAuthority(
  company: Company,
  workspaceClientRead = false,
): string {
  return JSON.stringify([
    canReadExternalInvoiceRelation(company, workspaceClientRead),
    workspaceClientRead,
    captureOf(grantOf(company, 'company_document_registrar')),
    holds(company, 'company_document_registrar', 'document.register'),
    captureOf(grantOf(company, 'company_director_client_access')),
    holdsClientRead(company),
    captureOf(grantOf(company, 'company_contract_preparer')),
    captureOf(grantOf(company, 'company_contract_approver')),
    captureOf(grantOf(company, 'company_commercial_intake')),
  ]);
}
