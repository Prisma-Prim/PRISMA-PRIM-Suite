/**
 * Copies an actor response with only its document permissions ordered for an
 * equality comparison. Missing, extra, and duplicate permissions stay visible.
 */
export function actorWithComparableDocumentPermissions(
  value: unknown,
): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('activeCompany' in value)
  )
    return value;

  const activeCompany = value.activeCompany;
  if (
    typeof activeCompany !== 'object' ||
    activeCompany === null ||
    !('documentPermissions' in activeCompany) ||
    !isStringArray(activeCompany.documentPermissions)
  )
    return value;

  return {
    ...value,
    activeCompany: {
      ...activeCompany,
      documentPermissions: [...activeCompany.documentPermissions].sort(),
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((permission: unknown) => typeof permission === 'string')
  );
}
