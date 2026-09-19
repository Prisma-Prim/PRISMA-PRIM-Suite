export const COMPANY_CONTEXT_ACCESS_BUNDLE = 'company_context_access' as const;
export const COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL =
  'Company Context Access' as const;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE =
  'company_director_client_access' as const;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL =
  'Company Director Client Access' as const;
export const COMPANY_DOCUMENT_REGISTRAR_BUNDLE =
  'company_document_registrar' as const;
export const COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL =
  'Company Document Registrar' as const;
export const DOCUMENT_V1_PERMISSIONS = [
  'document.read',
  'document.register',
  'document.reference.read',
] as const;
export type DocumentPermission = (typeof DOCUMENT_V1_PERMISSIONS)[number];
export const COMPANY_CONTEXT_USE_BUNDLES = [
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
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

export const COMPANY_PROJECT_ACCESS_BUNDLE = 'company_project_access';
export const COMPANY_PROJECT_ACCESS_BUNDLE_LABEL = 'Company Project Access';
export const COMPANY_PROJECT_V1_PERMISSIONS = [
  'project.read',
  'project.create',
] as const;
export type CompanyProjectPermission =
  (typeof COMPANY_PROJECT_V1_PERMISSIONS)[number];
