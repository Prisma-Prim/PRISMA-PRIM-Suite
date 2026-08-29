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

export const COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS = [
  'client.read',
  'client.create',
  'client.update',
] as const;

export const COMPANY_DIRECTOR_CLIENT_V2_PERMISSIONS = [
  ...COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS,
  'client.duplicate.resolve',
] as const;

export const COMPANY_DIRECTOR_CLIENT_PERMISSIONS =
  COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS;

export type CompanyClientPermission =
  (typeof COMPANY_DIRECTOR_CLIENT_V2_PERMISSIONS)[number];

export type CompanyDirectorClientPermissionSetVersion = 'v1' | 'v2';

export function companyDirectorClientPermissionsFor(
  version: unknown,
): readonly CompanyClientPermission[] {
  switch (version) {
    case 'v1':
      return COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS;
    case 'v2':
      return COMPANY_DIRECTOR_CLIENT_V2_PERMISSIONS;
    default:
      return [];
  }
}
