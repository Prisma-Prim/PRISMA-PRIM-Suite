import {
  COMPANY_GRANT_REGISTRY,
  isCompanyGrants,
  type CompanyGrant,
  type CompanyGrantBundle,
  type CompanyGrantOf,
} from './company-grants';

/**
 * One live grant a fixture gives its actor: the bundle, the version its
 * assignment captured and the assignment id that commands send back.
 */
export type CompanyGrantRequest = {
  [Bundle in CompanyGrantBundle]: {
    readonly bundle: Bundle;
    readonly version: CompanyGrantOf<Bundle>['permissionSetVersion'];
    readonly assignmentId: string;
  };
}[CompanyGrantBundle];

const REGISTRY_VIEW: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = COMPANY_GRANT_REGISTRY;
const REGISTRY_ORDER = Object.keys(COMPANY_GRANT_REGISTRY);

/**
 * The `activeCompany.grants` list the API sends for these grants: each entry
 * carries exactly the permissions the registry gives its captured version, in
 * registry order. A list the current Actor parser would refuse (a duplicated
 * bundle or assignment, a blank assignment) throws, so a fixture cannot drift
 * from the registry.
 */
export function companyGrants(
  ...requests: readonly CompanyGrantRequest[]
): CompanyGrant[] {
  const grants: unknown = [...requests]
    .sort(
      (left, right) =>
        REGISTRY_ORDER.indexOf(left.bundle) -
        REGISTRY_ORDER.indexOf(right.bundle),
    )
    .map((request) => ({
      bundle: request.bundle,
      assignmentId: request.assignmentId,
      permissionSetVersion: request.version,
      permissions:
        request.version === null
          ? []
          : [...(REGISTRY_VIEW[request.bundle]?.[request.version] ?? [])],
    }));
  if (!isCompanyGrants(grants))
    throw new Error(
      `Fixture grants ${JSON.stringify(requests)} are not a list the current Actor parser accepts.`,
    );
  return grants;
}

/**
 * `existing` with the grants of `requests`, each replacing any grant of the
 * same bundle, as when an assignment is granted again.
 */
export function withCompanyGrants(
  existing: readonly CompanyGrant[] | undefined,
  ...requests: readonly CompanyGrantRequest[]
): CompanyGrant[] {
  const added = companyGrants(...requests);
  const grants: unknown = [
    ...(existing ?? []).filter(
      (grant) =>
        !added.some((replacement) => replacement.bundle === grant.bundle),
    ),
    ...added,
  ].sort(
    (left, right) =>
      REGISTRY_ORDER.indexOf(left.bundle) -
      REGISTRY_ORDER.indexOf(right.bundle),
  );
  if (!isCompanyGrants(grants))
    throw new Error(
      `Adding ${JSON.stringify(requests)} makes a list the current Actor parser refuses.`,
    );
  return grants;
}

/** `existing` without the grants of `bundles`, as after their revocation. */
export function withoutCompanyGrants(
  existing: readonly CompanyGrant[] | undefined,
  ...bundles: readonly CompanyGrantBundle[]
): CompanyGrant[] {
  return (existing ?? []).filter((grant) => !bundles.includes(grant.bundle));
}
