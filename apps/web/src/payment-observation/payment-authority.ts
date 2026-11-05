import type { ActorContext } from '../access-types';
import { paymentEvidenceAuthority } from '../payment-evidence/payment-evidence-authority';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function grant(value: unknown, bundle: string) {
  if (!Array.isArray(value)) return undefined;
  const rows: unknown[] = value;
  const records = rows.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? Object.fromEntries(Object.entries(row))
      : undefined,
  );
  const matching = records.filter((row) => row?.bundle === bundle),
    row = matching[0];
  if (
    matching.length !== 1 ||
    !row ||
    Object.keys(row).length !== 3 ||
    Object.keys(row).some(
      (k) => !['bundle', 'assignmentId', 'permissionSetVersion'].includes(k),
    ) ||
    typeof row.assignmentId !== 'string' ||
    !UUID.test(row.assignmentId) ||
    row.permissionSetVersion !== 'v1' ||
    records.filter(
      (other) =>
        typeof other?.assignmentId === 'string' &&
        other.assignmentId.toLowerCase() ===
          String(row.assignmentId).toLowerCase(),
    ).length !== 1
  )
    return undefined;
  return { bundle, assignmentId: row.assignmentId, permissionSetVersion: 'v1' };
}
/** Copied read, action, fresh copy and native projections have separate consumed owners. */
export function paymentAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  if (
    !actor.active ||
    !c ||
    ![
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      c.id,
    ].every((id) => UUID.test(id))
  )
    return undefined;
  const read = [
    'company_payment_reader',
    'company_payment_confirmer',
    'company_payment_reverser',
    'company_payment_recorder',
  ]
    .map((bundle) => grant(c.paymentGrants, bundle))
    .find((g) => g !== undefined);
  const capture = c.paymentObservationReadCapture;
  if (
    !read ||
    typeof capture !== 'string' ||
    !/^payment-observation-read\.v1\.[a-f0-9]{64}$/u.test(capture)
  )
    return undefined;
  const scope = [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    c.id,
  ];
  const readKey = JSON.stringify([scope, read, capture]);
  const context = c.paymentObservationContextCapture;
  const role = (bundle: string) => {
    const g = grant(c.paymentGrants, bundle);
    return g &&
      typeof context === 'string' &&
      /^payment-observation-context\.v1\.[a-f0-9]{64}$/u.test(context)
      ? JSON.stringify([scope, g, context])
      : null;
  };
  const recordKey = role('company_payment_recorder'),
    confirmer = role('company_payment_confirmer'),
    reverseKey = role('company_payment_reverser');
  const source = paymentEvidenceAuthority(actor);
  // The action role itself supplies payment.read. An additional Reader owns
  // projections, but cannot retire an independently admitted command.
  const actionSource = (
    bundle: 'company_payment_recorder' | 'company_payment_confirmer',
  ) =>
    paymentEvidenceAuthority({
      ...actor,
      activeCompany: {
        ...c,
        paymentGrants: [
          grant(c.paymentGrants, bundle),
          grant(c.paymentGrants, 'company_payment_evidence_access'),
        ],
      },
    })?.contentReadKey ?? null;
  const recorderSource = actionSource('company_payment_recorder');
  const confirmerSource = actionSource('company_payment_confirmer');
  const sourceKey = source?.contentReadKey ?? null;
  const identity =
    c.clientPermissions?.includes('client.read') &&
    typeof c.clientPermissionAssignmentId === 'string' &&
    UUID.test(c.clientPermissionAssignmentId) &&
    ['v1', 'v2'].includes(c.clientPermissionSetVersion ?? '')
      ? [c.clientPermissionAssignmentId, c.clientPermissionSetVersion]
      : undefined;
  const createKey =
    recordKey && recorderSource && identity
      ? JSON.stringify([recordKey, recorderSource, identity])
      : null;
  return {
    companyId: c.id,
    readCapture: capture,
    readKey,
    recordKey,
    createKey,
    correctKey:
      recordKey && recorderSource
        ? JSON.stringify([recordKey, recorderSource])
        : null,
    confirmKey:
      confirmer && confirmerSource
        ? JSON.stringify([confirmer, confirmerSource])
        : null,
    reverseKey,
    sourceKey,
    projectionKey: source?.readKey ?? null,
    downloadKey: sourceKey,
  };
}
export type PaymentAuthority = NonNullable<ReturnType<typeof paymentAuthority>>;
