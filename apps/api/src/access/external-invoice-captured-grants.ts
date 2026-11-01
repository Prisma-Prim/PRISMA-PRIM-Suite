import {
  COMPANY_INVOICE_READER_BUNDLE,
  COMPANY_INVOICE_RECORDER_BUNDLE,
  COMPANY_EXTERNAL_INVOICE_ACCESS_BUNDLE,
} from './company-permissions.js';

export type ExternalInvoiceCapturedGrant = {
  bundle:
    | typeof COMPANY_INVOICE_READER_BUNDLE
    | typeof COMPANY_INVOICE_RECORDER_BUNDLE
    | typeof COMPANY_EXTERNAL_INVOICE_ACCESS_BUNDLE;
  assignmentId: string;
  permissionSetVersion: 'v1';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Captured identity is necessary; current role names and permission strings are insufficient. */
export function captureExternalInvoiceGrant(row: {
  bundle: string;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): ExternalInvoiceCapturedGrant | undefined {
  if (
    !row.assignmentId ||
    !UUID.test(row.assignmentId) ||
    row.permissionSetVersion !== 'v1' ||
    (row.bundle !== COMPANY_INVOICE_READER_BUNDLE &&
      row.bundle !== COMPANY_INVOICE_RECORDER_BUNDLE &&
      row.bundle !== COMPANY_EXTERNAL_INVOICE_ACCESS_BUNDLE)
  )
    return undefined;
  return {
    bundle: row.bundle,
    assignmentId: row.assignmentId,
    permissionSetVersion: row.permissionSetVersion,
  };
}

/** Unknown or duplicate represented captures fail closed before the live Access check. */
export function externalInvoiceCapturedAuthority(
  value: unknown,
  options: { manage: boolean },
):
  | {
      family: ExternalInvoiceCapturedGrant;
      finance: ExternalInvoiceCapturedGrant[];
    }
  | undefined {
  if (!Array.isArray(value)) return undefined;
  const grants: ExternalInvoiceCapturedGrant[] = [];
  const bundles = new Set<string>();
  const identities = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      return undefined;
    const record = Object.fromEntries(Object.entries(item));
    if (
      Object.keys(record).length !== 3 ||
      Object.keys(record).some(
        (key) =>
          !['bundle', 'assignmentId', 'permissionSetVersion'].includes(key),
      ) ||
      typeof record.bundle !== 'string' ||
      typeof record.assignmentId !== 'string'
    )
      return undefined;
    const grant = captureExternalInvoiceGrant({
      bundle: record.bundle,
      assignmentId: record.assignmentId,
      permissionSetVersion: record.permissionSetVersion,
    });
    if (
      !grant ||
      bundles.has(grant.bundle) ||
      identities.has(grant.assignmentId.toLowerCase())
    )
      return undefined;
    bundles.add(grant.bundle);
    identities.add(grant.assignmentId.toLowerCase());
    grants.push(grant);
  }
  const family = grants.find(
    (grant) => grant.bundle === COMPANY_EXTERNAL_INVOICE_ACCESS_BUNDLE,
  );
  const finance = grants.filter(
    (grant) =>
      grant.bundle === COMPANY_INVOICE_RECORDER_BUNDLE ||
      (!options.manage && grant.bundle === COMPANY_INVOICE_READER_BUNDLE),
  );
  return family && finance.length ? { family, finance } : undefined;
}
