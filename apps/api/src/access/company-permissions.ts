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
export const DOCUMENT_V2_PERMISSIONS = [
  ...DOCUMENT_V1_PERMISSIONS,
  'document.correct',
] as const;
export const COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE =
  'company_document_project_organizer';
export const COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL =
  'Company Document Project Organizer';
export const COMPANY_COMMERCIAL_INTAKE_BUNDLE =
  'company_commercial_intake' as const;
export const COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL =
  'Company Commercial Intake' as const;
export const COMPANY_COMMERCIAL_INTAKE_V1_PERMISSIONS = [
  'commercial.request.read',
  'commercial.request.create',
  'commercial.opportunity.read',
  'commercial.opportunity.create',
] as const;
// Captured v2 adds the only post-R3A1 Opportunity mutation. Existing v1
// assignments never expand in place; only a fresh grant captures v2.
export const COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS = [
  ...COMPANY_COMMERCIAL_INTAKE_V1_PERMISSIONS,
  'commercial.opportunity.next_action.update',
] as const;
export type CompanyCommercialIntakePermission =
  (typeof COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS)[number];
export type CompanyCommercialIntakePermissionSetVersion = 'v1' | 'v2';
export function commercialIntakePermissionsFor(
  version: unknown,
): readonly CompanyCommercialIntakePermission[] {
  switch (version) {
    case 'v1':
      return COMPANY_COMMERCIAL_INTAKE_V1_PERMISSIONS;
    case 'v2':
      return COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS;
    default:
      return [];
  }
}
export function isCommercialIntakePermissionSetVersion(
  version: unknown,
): version is CompanyCommercialIntakePermissionSetVersion {
  return version === 'v1' || version === 'v2';
}
export const COMPANY_SERVICE_CATALOGUE_BUNDLE =
  'company_service_catalogue' as const;
export const COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL =
  'Company Service Catalogue' as const;
export const COMPANY_SERVICE_CATALOGUE_V1_PERMISSIONS = [
  'service.definition.read',
  'service.definition.create',
  'commercial.offering.read',
  'commercial.offering.manage',
] as const;
export type CompanyServiceCataloguePermission =
  (typeof COMPANY_SERVICE_CATALOGUE_V1_PERMISSIONS)[number];
export function serviceCataloguePermissionsFor(
  version: unknown,
): readonly CompanyServiceCataloguePermission[] {
  return version === 'v1' ? COMPANY_SERVICE_CATALOGUE_V1_PERMISSIONS : [];
}
export const COMPANY_PRICING_CONFIGURATION_BUNDLE =
  'company_pricing_configuration' as const;
export const COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL =
  'Company Pricing Configuration' as const;
// Offering read is the only permission shared with the catalogue bundle; no
// Service Definition permission and no offering management is included.
export const COMPANY_PRICING_CONFIGURATION_V1_PERMISSIONS = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.configuration.manage',
] as const;
export type CompanyPricingConfigurationPermission =
  (typeof COMPANY_PRICING_CONFIGURATION_V1_PERMISSIONS)[number];
export function pricingConfigurationPermissionsFor(
  version: unknown,
): readonly CompanyPricingConfigurationPermission[] {
  return version === 'v1' ? COMPANY_PRICING_CONFIGURATION_V1_PERMISSIONS : [];
}
export const COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE =
  'company_commercial_activity_reader' as const;
export const COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL =
  'Company Commercial Activity Reader' as const;
export const COMPANY_COMMERCIAL_ACTIVITY_READER_V1_PERMISSIONS = [
  'commercial.activity.read',
] as const;
export type CompanyCommercialActivityPermission =
  (typeof COMPANY_COMMERCIAL_ACTIVITY_READER_V1_PERMISSIONS)[number];
// The opt-in reader bundle is never inherited: a null or unknown captured
// version resolves to no permission at all.
export function commercialActivityPermissionsFor(
  version: unknown,
): readonly CompanyCommercialActivityPermission[] {
  return version === 'v1'
    ? COMPANY_COMMERCIAL_ACTIVITY_READER_V1_PERMISSIONS
    : [];
}
export type DocumentPermission =
  (typeof DOCUMENT_V2_PERMISSIONS)[number] | 'document.project.manage';
export type DocumentPermissionSetVersion = 'v1' | 'v2';
export function documentPermissionsFor(
  version: unknown,
): readonly DocumentPermission[] {
  switch (version) {
    case 'v1':
      return DOCUMENT_V1_PERMISSIONS;
    case 'v2':
      return DOCUMENT_V2_PERMISSIONS;
    default:
      return [];
  }
}
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

export const COMPANY_TASK_MANAGER_BUNDLE = 'company_task_manager';
export const COMPANY_TASK_MANAGER_BUNDLE_LABEL = 'Company Task Manager';
export const COMPANY_TASK_V1_PERMISSIONS = [
  'task.read',
  'task.manage',
] as const;
export type TaskPermission = (typeof COMPANY_TASK_V1_PERMISSIONS)[number];
export function taskPermissionsFor(
  version: unknown,
): readonly TaskPermission[] {
  return version === 'v1' ? COMPANY_TASK_V1_PERMISSIONS : [];
}
