import {
  isCompanyGrants,
  type CompanyGrantBundle,
} from '../src/access/company-grants';

/** Read current REST grants with the web's owned validator; no legacy shape. */
export function companyGrantsOf(
  company: unknown,
  bundles: readonly CompanyGrantBundle[],
) {
  if (!company || typeof company !== 'object' || Array.isArray(company))
    throw new Error('Expected a public Company object');
  const grants: unknown = Reflect.get(company, 'grants');
  if (!isCompanyGrants(grants))
    throw new Error('Expected required current Company grants');
  const selected = grants.filter((grant) => bundles.includes(grant.bundle));
  return selected.length ? selected : undefined;
}

export function companyGrantOf(company: unknown, bundle: CompanyGrantBundle) {
  return companyGrantsOf(company, [bundle])?.[0];
}

export function companyPermissionsOf(
  company: unknown,
  bundles: readonly CompanyGrantBundle[],
) {
  return companyGrantsOf(company, bundles)?.flatMap((grant) => {
    const permissions: readonly string[] = grant.permissions;
    return permissions;
  });
}
