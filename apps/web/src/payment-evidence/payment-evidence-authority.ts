import type { ActorContext } from '../access-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_BUNDLES = [
  'company_payment_reader',
  'company_payment_confirmer',
  'company_payment_reverser',
  'company_payment_recorder',
] as const;
type PaymentBundle =
  (typeof READ_BUNDLES)[number] | 'company_payment_evidence_access';
type Grant = {
  bundle: PaymentBundle;
  assignmentId: string;
  permissionSetVersion: 'v1';
};

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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
function grant(value: unknown, bundle: PaymentBundle): Grant | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: unknown[] = value;
  const matching = rows.map(record).filter((row) => row?.bundle === bundle);
  if (matching.length !== 1) return undefined;
  const row = matching[0];
  if (
    !row ||
    Object.keys(row).length !== 3 ||
    Object.keys(row).some(
      (key) =>
        !['bundle', 'assignmentId', 'permissionSetVersion'].includes(key),
    ) ||
    typeof row.assignmentId !== 'string' ||
    !UUID.test(row.assignmentId) ||
    row.permissionSetVersion !== 'v1'
  )
    return undefined;
  const assignmentId = row.assignmentId.toLowerCase();
  if (
    rows
      .map(record)
      .filter(
        (other) =>
          typeof other?.assignmentId === 'string' &&
          other.assignmentId.toLowerCase() === assignmentId,
      ).length !== 1
  )
    return undefined;
  return { bundle, assignmentId, permissionSetVersion: 'v1' };
}
function native(id: unknown, version: unknown, versions: readonly string[]) {
  return typeof id === 'string' &&
    UUID.test(id) &&
    typeof version === 'string' &&
    versions.includes(version)
    ? [id.toLowerCase(), version]
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
  const grants: unknown =
    'paymentGrants' in company ? company.paymentGrants : undefined;
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
  const family = grant(grants, 'company_payment_evidence_access');
  const reader = READ_BUNDLES.map((bundle) => grant(grants, bundle)).find(
    (entry) => entry !== undefined,
  );
  const registrar = native(
    company.documentPermissionAssignmentId,
    company.documentPermissionSetVersion,
    ['v1', 'v2', 'v3'],
  );
  const identity = company.clientPermissions?.includes('client.read')
    ? native(
        company.clientPermissionAssignmentId,
        company.clientPermissionSetVersion,
        ['v1', 'v2'],
      )
    : undefined;
  const permissions = company.documentPermissions ?? [];
  if (
    !family ||
    !reader ||
    !registrar ||
    !permissions.includes('document.read') ||
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
  const recorder = grant(grants, 'company_payment_recorder');
  const write = recorder ? JSON.stringify([...base, recorder]) : null;
  const registerKey =
    write && permissions.includes('document.register') ? write : null;
  const correctKey =
    write &&
    ['v2', 'v3'].includes(company.documentPermissionSetVersion ?? '') &&
    permissions.includes('document.correct')
      ? write
      : null;
  const referenceRead = permissions.includes('document.reference.read');
  const successorKey =
    write &&
    company.documentPermissionSetVersion === 'v3' &&
    referenceRead &&
    permissions.includes('document.version.manage')
      ? write
      : null;
  const approver = native(
    company.documentApproverAssignmentId,
    company.documentApproverPermissionSetVersion,
    ['v1'],
  );
  const designateKey =
    write &&
    referenceRead &&
    permissions.includes('document.version.designate_official') &&
    approver
      ? JSON.stringify([write, approver])
      : null;
  const contentReader = native(
    company.documentContentReaderAssignmentId,
    company.documentContentReaderPermissionSetVersion,
    ['v1'],
  );
  const contentReadKey =
    permissions.includes('document.content.read') && contentReader
      ? JSON.stringify([readKey, contentReader])
      : null;
  const uploader = native(
    company.documentContentUploaderAssignmentId,
    company.documentContentUploaderPermissionSetVersion,
    ['v1'],
  );
  const uploadKey =
    successorKey &&
    permissions.includes('document.content.read') &&
    contentReader &&
    permissions.includes('document.content.upload') &&
    uploader
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
