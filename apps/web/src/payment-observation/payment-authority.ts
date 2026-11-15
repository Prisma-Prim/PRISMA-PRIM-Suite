import type { ActorContext } from '../access-types';
import { grantHolding } from '../documents/document-grants';
import {
  livePaymentGrant,
  paymentEvidenceAuthority,
  type PaymentBundle,
} from '../payment-evidence/payment-evidence-authority';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_BUNDLES = [
  'company_payment_reader',
  'company_payment_confirmer',
  'company_payment_reverser',
  'company_payment_recorder',
] as const;
function grant(company: ActorContext['activeCompany'], bundle: PaymentBundle) {
  const captured = livePaymentGrant(company, bundle);
  return captured
    ? {
        bundle,
        assignmentId: captured.assignmentId,
        permissionSetVersion: captured.permissionSetVersion,
      }
    : undefined;
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
  const read = READ_BUNDLES.map((bundle) => grant(c, bundle)).find(
    (g) => g !== undefined,
  );
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
  const role = (bundle: PaymentBundle) => {
    const g = grant(c, bundle);
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
  // projections, but cannot retire an independently admitted command: the
  // source authority sees only the action grant and the evidence family.
  const actionSource = (
    bundle: 'company_payment_recorder' | 'company_payment_confirmer',
  ) =>
    paymentEvidenceAuthority({
      ...actor,
      activeCompany: {
        ...c,
        grants: c.grants?.filter(
          (other) =>
            other.bundle === bundle ||
            !READ_BUNDLES.some((reader) => reader === other.bundle),
        ),
      },
    })?.contentReadKey ?? null;
  const recorderSource = actionSource('company_payment_recorder');
  const confirmerSource = actionSource('company_payment_confirmer');
  const sourceKey = source?.contentReadKey ?? null;
  const client = grantHolding(
    c,
    'company_director_client_access',
    'client.read',
  );
  const identity =
    client && UUID.test(client.assignmentId)
      ? [client.assignmentId, client.permissionSetVersion]
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
