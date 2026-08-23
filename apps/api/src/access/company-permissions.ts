export const COMPANY_CONTEXT_ACCESS_BUNDLE = 'company_context_access' as const;
export const COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL =
  'Company Context Access' as const;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE =
  'company_director_client_access' as const;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL =
  'Company Director Client Access' as const;
export const COMPANY_CONTEXT_USE_BUNDLES = [
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
] as const;

export const COMPANY_DIRECTOR_CLIENT_PERMISSIONS = [
  'client.read',
  'client.create',
  'client.update',
] as const;
