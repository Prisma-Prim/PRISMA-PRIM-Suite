/** Order permission facts for comparison without hiding lost or changed grants. */
export function actorWithComparableCompanyGrants(value: unknown): unknown {
  if (!record(value) || !record(value.activeCompany)) return value;
  const company = value.activeCompany;
  if (!Array.isArray(company.grants)) return value;
  const grants: unknown[] = company.grants;
  return {
    ...value,
    activeCompany: {
      ...company,
      grants: grants.map((grant) =>
        record(grant) && strings(grant.permissions)
          ? { ...grant, permissions: [...grant.permissions].sort() }
          : grant,
      ),
    },
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((permission: unknown) => typeof permission === 'string')
  );
}
