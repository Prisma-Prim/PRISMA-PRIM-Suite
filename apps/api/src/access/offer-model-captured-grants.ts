import {
  COMPANY_OFFER_MODEL_EDITOR_BUNDLE,
  COMPANY_OFFER_MODEL_APPROVER_BUNDLE,
  companyRolePermissionsFor,
  type CompanyRolePermission,
} from './company-permissions.js';

type ModelBundle =
  | typeof COMPANY_OFFER_MODEL_EDITOR_BUNDLE
  | typeof COMPANY_OFFER_MODEL_APPROVER_BUNDLE;
type CapturedGrant<Bundle extends ModelBundle> = {
  readonly bundle: Bundle;
  readonly permissionSetVersion: 'v1';
  readonly assignmentId: string;
  readonly permissions: readonly CompanyRolePermission<Bundle>[];
};
export type OfferModelActorGrant =
  | CapturedGrant<typeof COMPANY_OFFER_MODEL_EDITOR_BUNDLE>
  | CapturedGrant<typeof COMPANY_OFFER_MODEL_APPROVER_BUNDLE>;

export interface OfferModelActorProjection {
  offerModelGrants?: OfferModelActorGrant[];
}

/** Snapshot only: the command still obtains live authority under Access locks. */
export function captureOfferModelGrant(row: {
  bundle: string | null | undefined;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): OfferModelActorGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  switch (row.bundle) {
    case COMPANY_OFFER_MODEL_EDITOR_BUNDLE:
    case COMPANY_OFFER_MODEL_APPROVER_BUNDLE:
      // Separate returns preserve the permission type of each closed grant.
      if (row.bundle === COMPANY_OFFER_MODEL_EDITOR_BUNDLE)
        return {
          bundle: row.bundle,
          assignmentId: row.assignmentId,
          permissionSetVersion: row.permissionSetVersion,
          permissions: companyRolePermissionsFor(
            row.bundle,
            row.permissionSetVersion,
          ),
        };
      return {
        bundle: row.bundle,
        assignmentId: row.assignmentId,
        permissionSetVersion: row.permissionSetVersion,
        permissions: companyRolePermissionsFor(
          row.bundle,
          row.permissionSetVersion,
        ),
      };
    default:
      return undefined;
  }
}
