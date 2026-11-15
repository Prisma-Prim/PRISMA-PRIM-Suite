/** Read one grant from a public REST response; never reconstruct legacy fields. */
export function companyGrantOf(company: unknown, bundle: string) {
  return companyGrantsOf(company, [bundle])?.[0];
}

export function companyGrantsOf(company: unknown, bundles: readonly string[]) {
  if (!company || typeof company !== 'object' || Array.isArray(company))
    throw new Error('Expected a public Company object');
  const grants: unknown = Reflect.get(company, 'grants');
  if (!Array.isArray(grants))
    throw new Error('Expected required Company grants');
  const rows: unknown[] = grants;
  const selected = rows.filter((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    const bundle: unknown = Reflect.get(row, 'bundle');
    return typeof bundle === 'string' && bundles.includes(bundle);
  });
  return selected.length ? selected : undefined;
}

/** Compare the same permission facts when a feature consumes several bundles. */
export function companyPermissionsOf(
  company: unknown,
  bundles: readonly string[],
) {
  return companyGrantsOf(company, bundles)?.flatMap((grant) => {
    if (!Array.isArray(grant.permissions))
      throw new Error('Expected public grant permissions');
    const permissions: unknown[] = grant.permissions;
    return permissions;
  });
}

/** The assignment/version captures that existing command protocols consume. */
export function companyGrantCapturesOf(
  company: unknown,
  bundles: readonly string[],
) {
  return companyGrantsOf(company, bundles)?.map((grant) => ({
    bundle: grant.bundle,
    assignmentId: grant.assignmentId,
    permissionSetVersion: grant.permissionSetVersion,
  }));
}
