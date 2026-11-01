import type { ActorContext } from '../access-types';

type Company = ActorContext['activeCompany'];
type InvoiceBundle =
  | 'company_invoice_reader'
  | 'company_invoice_recorder'
  | 'company_external_invoice_access';
function captures(company: Company) {
  const value: unknown =
    company && 'externalInvoiceGrants' in company
      ? company.externalInvoiceGrants
      : undefined;
  if (!Array.isArray(value) || value.length > 3) return undefined;
  const seen = new Set<string>();
  const grants: Array<{
    bundle: InvoiceBundle;
    assignmentId: string;
    permissionSetVersion: 'v1';
  }> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      return undefined;
    const row = Object.fromEntries(Object.entries(entry));
    const bundle = row.bundle;
    if (
      Object.keys(row).length !== 3 ||
      Object.keys(row).some(
        (key) =>
          !['bundle', 'assignmentId', 'permissionSetVersion'].includes(key),
      ) ||
      (bundle !== 'company_invoice_reader' &&
        bundle !== 'company_invoice_recorder' &&
        bundle !== 'company_external_invoice_access') ||
      row.permissionSetVersion !== 'v1' ||
      typeof row.assignmentId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
        row.assignmentId,
      ) ||
      seen.has(bundle)
    )
      return undefined;
    seen.add(bundle);
    grants.push({
      bundle,
      assignmentId: row.assignmentId,
      permissionSetVersion: 'v1',
    });
  }
  if (
    new Set(grants.map((grant) => grant.assignmentId.toLowerCase())).size !==
    grants.length
  )
    return undefined;
  return grants;
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
  const grants = captures(company);
  return JSON.stringify(
    grants?.sort((left, right) => left.bundle.localeCompare(right.bundle)) ??
      null,
  );
}
function nativeCapture(
  id: unknown,
  version: unknown,
  versions: readonly string[],
): boolean {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof version === 'string' &&
    versions.includes(version)
  );
}

/** The established native Actor representation uses opaque assignment IDs. */
export function hasExternalInvoiceNativeRead(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return Boolean(
    company?.documentPermissions?.includes('document.read') &&
    nativeCapture(
      company.documentPermissionAssignmentId,
      company.documentPermissionSetVersion,
      ['v1', 'v2', 'v3'],
    ) &&
    (workspaceClientRead ||
      (company.clientPermissions?.includes('client.read') &&
        nativeCapture(
          company.clientPermissionAssignmentId,
          company.clientPermissionSetVersion,
          ['v1', 'v2'],
        ))),
  );
}

export function canReadExternalInvoiceRelation(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return Boolean(
    hasExternalInvoiceNativeRead(company, workspaceClientRead) &&
    company?.contractPermissions?.includes('commercial.contract.read') &&
    (nativeCapture(
      company.contractPermissionAssignmentId,
      company.contractPermissionSetVersion,
      ['v1', 'v2'],
    ) ||
      nativeCapture(
        company.contractApproverAssignmentId,
        company.contractApproverPermissionSetVersion,
        ['v1', 'v2'],
      )) &&
    company.commercialIntakePermissions?.includes('commercial.request.read') &&
    company.commercialIntakePermissions.includes(
      'commercial.opportunity.read',
    ) &&
    nativeCapture(
      company.commercialIntakePermissionAssignmentId,
      company.commercialIntakePermissionSetVersion,
      ['v1', 'v2', 'v3', 'v4'],
    ),
  );
}

export function canSelectExternalInvoiceSource(
  company: Company,
  workspaceClientRead = false,
): boolean {
  return (
    hasExternalInvoiceAccess(company, true) &&
    company?.documentPermissions?.includes('document.register') === true &&
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
    company?.documentPermissionAssignmentId,
    company?.documentPermissionSetVersion,
    company?.documentPermissions?.includes('document.register'),
    company?.clientPermissionAssignmentId,
    company?.clientPermissionSetVersion,
    company?.clientPermissions?.includes('client.read'),
    company?.contractPermissionAssignmentId,
    company?.contractPermissionSetVersion,
    company?.contractApproverAssignmentId,
    company?.contractApproverPermissionSetVersion,
    company?.commercialIntakePermissionAssignmentId,
    company?.commercialIntakePermissionSetVersion,
  ]);
}
