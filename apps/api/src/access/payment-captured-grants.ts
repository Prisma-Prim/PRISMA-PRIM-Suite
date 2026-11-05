export const PAYMENT_BUNDLES = [
  'company_payment_reader',
  'company_payment_recorder',
  'company_payment_confirmer',
  'company_payment_reverser',
  'company_payment_evidence_access',
] as const;
export type PaymentBundle = (typeof PAYMENT_BUNDLES)[number];
export interface PaymentCapturedGrant {
  bundle: PaymentBundle;
  assignmentId: string;
  permissionSetVersion: 'v1';
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
export function capturePaymentGrant(row: {
  bundle: string;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): PaymentCapturedGrant | undefined {
  const bundle = PAYMENT_BUNDLES.find((candidate) => candidate === row.bundle);
  return bundle &&
    row.assignmentId &&
    UUID.test(row.assignmentId) &&
    row.permissionSetVersion === 'v1'
    ? { bundle, assignmentId: row.assignmentId, permissionSetVersion: 'v1' }
    : undefined;
}

/** Decode the role actually consumed; an unsupported unrelated alternative adds no authority. */
export function paymentCapturedGrant(
  value: unknown,
  bundle: PaymentBundle,
): PaymentCapturedGrant | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map(record);
  const selected = rows.filter((row) => row?.bundle === bundle);
  if (selected.length !== 1) return undefined;
  const row = selected[0];
  if (
    !row ||
    Object.keys(row).length !== 3 ||
    Object.keys(row).some(
      (key) =>
        !['bundle', 'assignmentId', 'permissionSetVersion'].includes(key),
    ) ||
    typeof row.assignmentId !== 'string'
  )
    return undefined;
  const grant = capturePaymentGrant({
    bundle,
    assignmentId: row.assignmentId,
    permissionSetVersion: row.permissionSetVersion,
  });
  if (
    !grant ||
    rows.filter(
      (candidate) =>
        typeof candidate?.assignmentId === 'string' &&
        candidate.assignmentId.toLowerCase() ===
          grant.assignmentId.toLowerCase(),
    ).length !== 1
  )
    return undefined;
  return grant;
}
export function paymentReadGrant(
  value: unknown,
): PaymentCapturedGrant | undefined {
  return (
    paymentCapturedGrant(value, 'company_payment_reader') ??
    paymentCapturedGrant(value, 'company_payment_confirmer') ??
    paymentCapturedGrant(value, 'company_payment_reverser') ??
    paymentCapturedGrant(value, 'company_payment_recorder')
  );
}
