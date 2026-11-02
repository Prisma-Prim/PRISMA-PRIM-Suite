import type { ActorContext } from './current-actor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
interface Grant {
  bundle:
    | 'company_invoice_reader'
    | 'company_invoice_recorder'
    | 'company_external_invoice_access';
  assignmentId: string;
  permissionSetVersion: 'v1';
}
function grants(value: unknown): Grant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: Grant[] = [],
    bundles = new Set<string>(),
    ids = new Set<string>();
  for (const valueItem of value) {
    if (!valueItem || typeof valueItem !== 'object' || Array.isArray(valueItem))
      return undefined;
    const g = Object.fromEntries(Object.entries(valueItem));
    if (
      Object.keys(g).length !== 3 ||
      Object.keys(g).some(
        (k) => !['bundle', 'assignmentId', 'permissionSetVersion'].includes(k),
      ) ||
      (g.bundle !== 'company_invoice_reader' &&
        g.bundle !== 'company_invoice_recorder' &&
        g.bundle !== 'company_external_invoice_access') ||
      typeof g.assignmentId !== 'string' ||
      !UUID.test(g.assignmentId) ||
      g.permissionSetVersion !== 'v1' ||
      bundles.has(g.bundle) ||
      ids.has(g.assignmentId.toLowerCase())
    )
      return undefined;
    bundles.add(g.bundle);
    ids.add(g.assignmentId.toLowerCase());
    result.push({
      bundle: g.bundle,
      assignmentId: g.assignmentId,
      permissionSetVersion: g.permissionSetVersion,
    });
  }
  return result;
}
function nativeCapture(
  id: unknown,
  version: unknown,
  versions: readonly string[],
) {
  return typeof id === 'string' &&
    UUID.test(id) &&
    typeof version === 'string' &&
    versions.includes(version)
    ? [id, version]
    : undefined;
}
/** Financial copy, source use and content each consume their own authority. */
export function invoiceRecordAuthority(actor: ActorContext):
  | {
      companyId: string;
      key: string;
      manage: boolean;
      manageKey: string | null;
      sourceKey: string | null;
      contentKey: string | null;
    }
  | undefined {
  const c = actor.activeCompany;
  if (!actor.active || !c || !UUID.test(c.id)) return undefined;
  const financial = Array.isArray(c.externalInvoiceGrants)
    ? c.externalInvoiceGrants.filter(
        (item: unknown) =>
          !(
            item &&
            typeof item === 'object' &&
            'bundle' in item &&
            item.bundle === 'company_external_invoice_access'
          ),
      )
    : undefined;
  const captured = grants(c.externalInvoiceGrants),
    financialGrants = grants(financial),
    finance =
      financialGrants?.find((g) => g.bundle === 'company_invoice_recorder') ??
      financialGrants?.find((g) => g.bundle === 'company_invoice_reader');
  if (
    !finance ||
    typeof c.invoiceRecordReadCapture !== 'string' ||
    !/^invoice-record-read\.v1\.[a-f0-9]{64}$/u.test(c.invoiceRecordReadCapture)
  )
    return undefined;
  const key = JSON.stringify([
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    c.id,
    finance,
    c.invoiceRecordReadCapture,
  ]);
  const manage = finance.bundle === 'company_invoice_recorder',
    manageKey = manage ? key : null;
  const family = captured?.find(
    (g) => g.bundle === 'company_external_invoice_access',
  );
  const registrar = nativeCapture(
    c.documentPermissionAssignmentId,
    c.documentPermissionSetVersion,
    ['v1', 'v2', 'v3'],
  );
  const content = nativeCapture(
    c.documentContentReaderAssignmentId,
    c.documentContentReaderPermissionSetVersion,
    ['v1'],
  );
  const client = actor.workspacePermissions.includes('client.manage')
    ? ['client.manage']
    : c.clientPermissions?.includes('client.read')
      ? nativeCapture(
          c.clientPermissionAssignmentId,
          c.clientPermissionSetVersion,
          ['v1', 'v2'],
        )
      : undefined;
  const metadata =
    family &&
    registrar &&
    client &&
    c.documentPermissions?.includes('document.read');
  const contentKey =
    metadata &&
    content &&
    c.documentPermissions?.includes('document.content.read')
      ? JSON.stringify([key, family, registrar, client, content])
      : null;
  const contract =
    nativeCapture(
      c.contractPermissionAssignmentId,
      c.contractPermissionSetVersion,
      ['v1', 'v2'],
    ) ??
    nativeCapture(
      c.contractApproverAssignmentId,
      c.contractApproverPermissionSetVersion,
      ['v1', 'v2'],
    );
  const intake = nativeCapture(
    c.commercialIntakePermissionAssignmentId,
    c.commercialIntakePermissionSetVersion,
    ['v1', 'v2', 'v3', 'v4'],
  );
  const sourceKey =
    manage &&
    contentKey &&
    contract &&
    intake &&
    c.contractPermissions?.includes('commercial.contract.read') &&
    c.commercialIntakePermissions?.includes('commercial.request.read') &&
    c.commercialIntakePermissions.includes('commercial.opportunity.read')
      ? JSON.stringify([manageKey, contentKey, contract, intake])
      : null;
  return { companyId: c.id, key, manage, manageKey, sourceKey, contentKey };
}
/** A related projection cannot outlive a replaced native capture with equal permissions. */
export function invoiceRecordProjectionAuthority(actor: ActorContext): string {
  const c = actor.activeCompany;
  const contract =
    nativeCapture(
      c?.contractPermissionAssignmentId,
      c?.contractPermissionSetVersion,
      ['v1', 'v2'],
    ) ??
    nativeCapture(
      c?.contractApproverAssignmentId,
      c?.contractApproverPermissionSetVersion,
      ['v1', 'v2'],
    );
  const family = grants(c?.externalInvoiceGrants)?.find(
    (grant) => grant.bundle === 'company_external_invoice_access',
  );
  return JSON.stringify([
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.internalUserId,
    c?.id,
    actor.workspacePermissions.includes('client.manage')
      ? ['client.manage']
      : nativeCapture(
          c?.clientPermissionAssignmentId,
          c?.clientPermissionSetVersion,
          ['v1', 'v2'],
        ),
    c?.clientPermissions?.includes('client.read') === true,
    contract,
    c?.contractPermissions?.includes('commercial.contract.read') === true,
    nativeCapture(
      c?.commercialIntakePermissionAssignmentId,
      c?.commercialIntakePermissionSetVersion,
      ['v1', 'v2', 'v3', 'v4'],
    ),
    c?.commercialIntakePermissions?.includes('commercial.request.read') ===
      true,
    c?.commercialIntakePermissions?.includes('commercial.opportunity.read') ===
      true,
    nativeCapture(
      c?.documentPermissionAssignmentId,
      c?.documentPermissionSetVersion,
      ['v1', 'v2', 'v3'],
    ),
    c?.documentPermissions?.includes('document.read') === true,
    nativeCapture(
      c?.documentContentReaderAssignmentId,
      c?.documentContentReaderPermissionSetVersion,
      ['v1'],
    ),
    c?.documentPermissions?.includes('document.content.read') === true,
    family,
  ]);
}
