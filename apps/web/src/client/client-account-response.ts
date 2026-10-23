export function readClientAccountView(value: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('displayName' in value) ||
    typeof value.displayName !== 'string' ||
    !('relatedToActiveCompany' in value) ||
    typeof value.relatedToActiveCompany !== 'boolean'
  ) {
    throw new Error('Invalid Client account response.');
  }
  return {
    id: value.id,
    displayName: value.displayName,
    relatedToActiveCompany: value.relatedToActiveCompany,
  };
}

export type ClientAccountView = ReturnType<typeof readClientAccountView>;

export function readClientAccountList(value: unknown): ClientAccountView[] {
  if (!Array.isArray(value)) {
    throw new Error('Invalid Client account list response.');
  }
  return value.map(readClientAccountView);
}
