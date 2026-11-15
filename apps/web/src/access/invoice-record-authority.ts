import { grantHolding } from '../documents/document-grants';
import { grantOf, holds, type CompanyGrant } from './company-grants';
import type { ActorContext } from './current-actor';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
type Company = ActorContext['activeCompany'];
type InvoiceBundle =
  | 'company_invoice_reader'
  | 'company_invoice_recorder'
  | 'company_external_invoice_access';
/**
 * The live grants of `bundles`, refused together when one of them does not
 * carry a native UUID assignment or two of them carry the same one in another
 * letter case.
 */
function grants(company: Company, bundles: readonly InvoiceBundle[]) {
  const captured = bundles.flatMap((bundle) => {
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
  return captured.every((grant) => UUID.test(grant.assignmentId)) &&
    new Set(captured.map((grant) => grant.assignmentId.toLowerCase())).size ===
      captured.length
    ? captured
    : undefined;
}
function nativeCapture(grant: CompanyGrant | undefined) {
  return grant && UUID.test(grant.assignmentId)
    ? [grant.assignmentId, grant.permissionSetVersion]
    : undefined;
}
function contractCapture(company: Company) {
  return (
    nativeCapture(
      grantHolding(
        company,
        'company_contract_preparer',
        'commercial.contract.read',
      ),
    ) ??
    nativeCapture(
      grantHolding(
        company,
        'company_contract_approver',
        'commercial.contract.read',
      ),
    )
  );
}
/** Every Commercial Intake version confers both Request and Opportunity read. */
function intakeCapture(company: Company) {
  return holds(
    company,
    'company_commercial_intake',
    'commercial.request.read',
  ) &&
    holds(company, 'company_commercial_intake', 'commercial.opportunity.read')
    ? nativeCapture(grantOf(company, 'company_commercial_intake'))
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
  const financialGrants = grants(c, [
      'company_invoice_reader',
      'company_invoice_recorder',
    ]),
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
  const family = grants(c, [
    'company_invoice_reader',
    'company_invoice_recorder',
    'company_external_invoice_access',
  ])?.find((g) => g.bundle === 'company_external_invoice_access');
  const registrar = nativeCapture(
    grantHolding(c, 'company_document_registrar', 'document.read'),
  );
  const content = nativeCapture(
    grantHolding(c, 'company_document_content_reader', 'document.content.read'),
  );
  const client = actor.workspacePermissions.includes('client.manage')
    ? ['client.manage']
    : nativeCapture(
        grantHolding(c, 'company_director_client_access', 'client.read'),
      );
  const metadata = family && registrar && client;
  const contentKey =
    metadata && content
      ? JSON.stringify([key, family, registrar, client, content])
      : null;
  const contract = contractCapture(c);
  const intake = intakeCapture(c);
  const sourceKey =
    manage && contentKey && contract && intake
      ? JSON.stringify([manageKey, contentKey, contract, intake])
      : null;
  return { companyId: c.id, key, manage, manageKey, sourceKey, contentKey };
}
/** A related projection cannot outlive a replaced native capture with equal permissions. */
export function invoiceRecordProjectionAuthority(actor: ActorContext): string {
  const c = actor.activeCompany;
  const family = grants(c, [
    'company_invoice_reader',
    'company_invoice_recorder',
    'company_external_invoice_access',
  ])?.find((grant) => grant.bundle === 'company_external_invoice_access');
  return JSON.stringify([
    actor.workspaceId,
    actor.workspaceMembershipId,
    actor.internalUserId,
    c?.id,
    actor.workspacePermissions.includes('client.manage')
      ? ['client.manage']
      : nativeCapture(grantOf(c, 'company_director_client_access')),
    holds(c, 'company_director_client_access', 'client.read'),
    contractCapture(c),
    holds(c, 'company_contract_preparer', 'commercial.contract.read') ||
      holds(c, 'company_contract_approver', 'commercial.contract.read'),
    nativeCapture(grantOf(c, 'company_commercial_intake')),
    holds(c, 'company_commercial_intake', 'commercial.request.read'),
    holds(c, 'company_commercial_intake', 'commercial.opportunity.read'),
    nativeCapture(grantOf(c, 'company_document_registrar')),
    holds(c, 'company_document_registrar', 'document.read'),
    nativeCapture(grantOf(c, 'company_document_content_reader')),
    holds(c, 'company_document_content_reader', 'document.content.read'),
    family,
  ]);
}
