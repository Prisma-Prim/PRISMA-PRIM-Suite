import {
  isCapturedCompanyGrant,
  type CapturedCompanyGrant,
  type CompanyPermission,
} from './captured-company-permissions.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRolePermissionsFor,
  type CompanyRoleBundle,
} from './company-permissions.js';

/**
 * One live captured Company role grant of the active Company context, as
 * `GET /access/current-actor` lists it in `activeCompany.grants`: the
 * registry bundle id, the assignment, the captured version (null only for the
 * unversioned Company Context Access) and the permissions the registry gives
 * that version. A new registry bundle therefore needs no new context field.
 *
 * Workspace-level alternatives such as `company.manage` are not grants; they
 * stay in `workspacePermissions`, as the captured permission check takes
 * them. Feature fences (the `*Capture` strings) are not grants either.
 */
export type CompanyGrant = CapturedCompanyGrant & {
  readonly permissions: readonly CompanyPermission[];
};

const REGISTRY_ORDER: readonly string[] = Object.keys(COMPANY_ROLE_BUNDLES);

/**
 * The grants of one Company described from its live assignment rows, in
 * registry order. A row with a version its bundle never captured is left out
 * (fail closed), as the legacy projections leave it out.
 */
export function describeCompanyGrants(
  rows: readonly {
    readonly bundle: CompanyRoleBundle;
    readonly assignmentId: string;
    readonly permissionSetVersion: string | null;
  }[],
): CompanyGrant[] {
  return rows
    .map((row) => ({
      bundle: row.bundle,
      assignmentId: row.assignmentId,
      permissionSetVersion: row.permissionSetVersion,
    }))
    .filter(isCapturedCompanyGrant)
    .map((grant): CompanyGrant => ({
      ...grant,
      permissions: [
        ...companyRolePermissionsFor(grant.bundle, grant.permissionSetVersion),
      ],
    }))
    .sort(
      (left, right) =>
        REGISTRY_ORDER.indexOf(left.bundle) -
          REGISTRY_ORDER.indexOf(right.bundle) ||
        left.assignmentId.localeCompare(right.assignmentId),
    );
}
