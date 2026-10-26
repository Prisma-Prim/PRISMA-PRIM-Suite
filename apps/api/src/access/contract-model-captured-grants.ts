import {
  COMPANY_CONTRACT_MODEL_EDITOR_BUNDLE,
  COMPANY_CONTRACT_MODEL_APPROVER_BUNDLE,
  companyRolePermissionsFor,
  type CompanyRolePermission,
} from './company-permissions.js';

type ModelBundle =
  | typeof COMPANY_CONTRACT_MODEL_EDITOR_BUNDLE
  | typeof COMPANY_CONTRACT_MODEL_APPROVER_BUNDLE;
type CapturedGrant<Bundle extends ModelBundle> = {
  readonly bundle: Bundle;
  readonly permissionSetVersion: 'v1';
  readonly assignmentId: string;
  readonly permissions: readonly CompanyRolePermission<Bundle>[];
};
export type ContractModelActorGrant =
  | CapturedGrant<typeof COMPANY_CONTRACT_MODEL_EDITOR_BUNDLE>
  | CapturedGrant<typeof COMPANY_CONTRACT_MODEL_APPROVER_BUNDLE>;

export interface ContractModelActorProjection {
  contractModelGrants?: ContractModelActorGrant[];
}

/** Snapshot only: the command still obtains live authority under Access locks. */
export function captureContractModelGrant(row: {
  bundle: string | null | undefined;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): ContractModelActorGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  switch (row.bundle) {
    case COMPANY_CONTRACT_MODEL_EDITOR_BUNDLE:
    case COMPANY_CONTRACT_MODEL_APPROVER_BUNDLE:
      // Separate returns preserve the permission type of each closed grant.
      if (row.bundle === COMPANY_CONTRACT_MODEL_EDITOR_BUNDLE)
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
