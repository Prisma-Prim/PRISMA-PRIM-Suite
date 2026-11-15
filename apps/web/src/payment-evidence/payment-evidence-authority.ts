import type { ActorContext } from '../access-types';
import { grantOf, holds, type CompanyGrant } from '../access/company-grants';
import { grantHolding } from '../documents/document-grants';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_BUNDLES = [
  'company_payment_reader',
  'company_payment_confirmer',
  'company_payment_reverser',
  'company_payment_recorder',
] as const;
export type PaymentBundle =
  (typeof READ_BUNDLES)[number] | 'company_payment_evidence_access';
type Company = ActorContext['activeCompany'];

export interface PaymentEvidenceOperationKeys {
  readKey: string;
  payerKey: string | null;
  registerKey: string | null;
  freshPayerKey: string | null;
  correctKey: string | null;
  successorKey: string | null;
  designateKey: string | null;
  contentReadKey: string | null;
  uploadKey: string | null;
}

const PAYMENT_BUNDLES = [
  ...READ_BUNDLES,
  'company_payment_evidence_access',
] as const;
/**
 * The live Payment grant of `bundle` when its assignment is a native UUID
 * that no other Payment grant carries, in any letter case.
 */
export function livePaymentGrant(company: Company, bundle: PaymentBundle) {
  const grant = grantOf(company, bundle);
  const assignment = grant?.assignmentId.toLowerCase();
  return grant &&
    UUID.test(grant.assignmentId) &&
    PAYMENT_BUNDLES.filter(
      (other) =>
        grantOf(company, other)?.assignmentId.toLowerCase() === assignment,
    ).length === 1
    ? grant
    : undefined;
}
function paymentGrant(company: Company, bundle: PaymentBundle) {
  const grant = livePaymentGrant(company, bundle);
  return grant
    ? {
        bundle,
        assignmentId: grant.assignmentId.toLowerCase(),
        permissionSetVersion: grant.permissionSetVersion,
      }
    : undefined;
}
/** A grant's native capture: its UUID assignment and captured version. */
function native(grant: CompanyGrant | undefined) {
  return grant && UUID.test(grant.assignmentId)
    ? [grant.assignmentId.toLowerCase(), grant.permissionSetVersion]
    : undefined;
}

/** Each operation consumes only its selected supported role and native authority. */
export function paymentEvidenceAuthority(
  actor: ActorContext,
): (PaymentEvidenceOperationKeys & { companyId: string }) | undefined {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company ||
    ![
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      company.id,
    ].every((id) => UUID.test(id))
  )
    return undefined;
  const context: unknown =
    'paymentEvidenceContextCapture' in company
      ? company.paymentEvidenceContextCapture
      : undefined;
  const reference: unknown =
    'paymentEvidenceReferenceReadCapture' in company
      ? company.paymentEvidenceReferenceReadCapture
      : undefined;
  if (
    typeof context !== 'string' ||
    !/^payment-evidence-context\.v1\.[a-f0-9]{64}$/u.test(context) ||
    typeof reference !== 'string' ||
    !/^payment-evidence-reference-read\.v1\.[a-f0-9]{64}$/u.test(reference)
  )
    return undefined;
  const family = paymentGrant(company, 'company_payment_evidence_access');
  const reader = READ_BUNDLES.map((bundle) =>
    paymentGrant(company, bundle),
  ).find((entry) => entry !== undefined);
  const registrar = native(
    grantHolding(company, 'company_document_registrar', 'document.read'),
  );
  const identity = native(
    grantHolding(company, 'company_director_client_access', 'client.read'),
  );
  if (
    !family ||
    !reader ||
    !registrar ||
    (!actor.workspacePermissions.includes('client.manage') && !identity)
  )
    return undefined;
  const scope = [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    company.id,
  ];
  const base = [scope, context, reference, family, registrar];
  const readKey = JSON.stringify([...base, reader]);
  const recorder = paymentGrant(company, 'company_payment_recorder');
  const write = recorder ? JSON.stringify([...base, recorder]) : null;
  const registers = (
    permission:
      | 'document.register'
      | 'document.correct'
      | 'document.reference.read'
      | 'document.version.manage',
  ) => holds(company, 'company_document_registrar', permission);
  const registerKey = write && registers('document.register') ? write : null;
  // Correction exists from Registrar v2 and version management from v3.
  const correctKey = write && registers('document.correct') ? write : null;
  const referenceRead = registers('document.reference.read');
  const successorKey =
    write && referenceRead && registers('document.version.manage')
      ? write
      : null;
  const approver = native(
    grantHolding(
      company,
      'company_document_approver',
      'document.version.designate_official',
    ),
  );
  const designateKey =
    write && referenceRead && approver
      ? JSON.stringify([write, approver])
      : null;
  const contentReader = native(
    grantHolding(
      company,
      'company_document_content_reader',
      'document.content.read',
    ),
  );
  const contentReadKey = contentReader
    ? JSON.stringify([readKey, contentReader])
    : null;
  const uploader = native(
    grantHolding(
      company,
      'company_document_content_uploader',
      'document.content.upload',
    ),
  );
  const uploadKey =
    successorKey && contentReader && uploader
      ? JSON.stringify([successorKey, contentReader, uploader])
      : null;
  return {
    companyId: company.id,
    readKey,
    payerKey: identity ? JSON.stringify([readKey, identity]) : null,
    registerKey,
    freshPayerKey:
      registerKey && identity ? JSON.stringify([registerKey, identity]) : null,
    correctKey,
    successorKey,
    designateKey,
    contentReadKey,
    uploadKey,
  };
}
