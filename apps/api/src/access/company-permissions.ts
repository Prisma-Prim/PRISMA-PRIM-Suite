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
// Captured v3 adds Version management only. Existing v1 and v2 assignments
// never expand in place; only a fresh grant captures v3.
export const DOCUMENT_V3_PERMISSIONS = [
  ...DOCUMENT_V2_PERMISSIONS,
  'document.version.manage',
] as const;
export const COMPANY_DOCUMENT_APPROVER_BUNDLE =
  'company_document_approver' as const;
export const COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL =
  'Company Document Approver' as const;
// The opt-in Approver carries designation only. It confers no Company
// context, Document or Representation read, Client read, correction or
// Version management.
export const DOCUMENT_APPROVER_V1_PERMISSIONS = [
  'document.version.designate_official',
] as const;
export type DocumentApproverPermission =
  (typeof DOCUMENT_APPROVER_V1_PERMISSIONS)[number];
// A null or unknown captured Approver version resolves to no permission.
export function documentApproverPermissionsFor(
  version: unknown,
): readonly DocumentApproverPermission[] {
  return version === 'v1' ? DOCUMENT_APPROVER_V1_PERMISSIONS : [];
}
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
// Captured v3 adds the one-time post-capture Client association. Existing v1
// and v2 assignments keep their captured permissions.
export const COMPANY_COMMERCIAL_INTAKE_V3_PERMISSIONS = [
  ...COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS,
  'commercial.request.client.associate',
] as const;
export type CompanyCommercialIntakePermission =
  (typeof COMPANY_COMMERCIAL_INTAKE_V3_PERMISSIONS)[number];
export type CompanyCommercialIntakePermissionSetVersion = 'v1' | 'v2' | 'v3';
export function commercialIntakePermissionsFor(
  version: unknown,
): readonly CompanyCommercialIntakePermission[] {
  switch (version) {
    case 'v1':
      return COMPANY_COMMERCIAL_INTAKE_V1_PERMISSIONS;
    case 'v2':
      return COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS;
    case 'v3':
      return COMPANY_COMMERCIAL_INTAKE_V3_PERMISSIONS;
    default:
      return [];
  }
}
export function isCommercialIntakePermissionSetVersion(
  version: unknown,
): version is CompanyCommercialIntakePermissionSetVersion {
  return version === 'v1' || version === 'v2' || version === 'v3';
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
export const COMPANY_PRICING_USER_BUNDLE = 'company_pricing_user' as const;
export const COMPANY_PRICING_USER_BUNDLE_LABEL =
  'Company Pricing User' as const;
// Offering read and configuration read are the only permissions shared with
// Configuration v1; no publication is included. Calculation and snapshot read
// are captured now because a captured version never expands in place, and no
// endpoint consumes them before R3B3b.
export const COMPANY_PRICING_USER_V1_PERMISSIONS = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.calculate',
  'commercial.pricing.snapshot.read',
] as const;
export type CompanyPricingUserPermission =
  (typeof COMPANY_PRICING_USER_V1_PERMISSIONS)[number];
export function pricingUserPermissionsFor(
  version: unknown,
): readonly CompanyPricingUserPermission[] {
  return version === 'v1' ? COMPANY_PRICING_USER_V1_PERMISSIONS : [];
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
  | (typeof DOCUMENT_V3_PERMISSIONS)[number]
  | DocumentApproverPermission
  | 'document.project.manage';
export type DocumentPermissionSetVersion = 'v1' | 'v2' | 'v3';
export function isDocumentPermissionSetVersion(
  version: unknown,
): version is DocumentPermissionSetVersion {
  return version === 'v1' || version === 'v2' || version === 'v3';
}
export function documentPermissionsFor(
  version: unknown,
): readonly DocumentPermission[] {
  switch (version) {
    case 'v1':
      return DOCUMENT_V1_PERMISSIONS;
    case 'v2':
      return DOCUMENT_V2_PERMISSIONS;
    case 'v3':
      return DOCUMENT_V3_PERMISSIONS;
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
// Captured v2 adds the responsible-member change. Existing v1 assignments
// never expand in place; only a fresh grant captures v2.
export const COMPANY_PROJECT_V2_PERMISSIONS = [
  ...COMPANY_PROJECT_V1_PERMISSIONS,
  'project.update',
] as const;
export type CompanyProjectPermission =
  (typeof COMPANY_PROJECT_V2_PERMISSIONS)[number];
export type CompanyProjectPermissionSetVersion = 'v1' | 'v2';
export function projectPermissionsFor(
  version: unknown,
): readonly CompanyProjectPermission[] {
  switch (version) {
    case 'v1':
      return COMPANY_PROJECT_V1_PERMISSIONS;
    case 'v2':
      return COMPANY_PROJECT_V2_PERMISSIONS;
    default:
      return [];
  }
}
export function isProjectPermissionSetVersion(
  version: unknown,
): version is CompanyProjectPermissionSetVersion {
  return version === 'v1' || version === 'v2';
}

// The opt-in approver of the Project lifecycle (Project/Task PRD section 23).
// It confers no Company context, Project read or any other authority.
export const COMPANY_PROJECT_APPROVER_BUNDLE =
  'company_project_approver' as const;
export const COMPANY_PROJECT_APPROVER_BUNDLE_LABEL =
  'Company Project Approver' as const;
export const COMPANY_PROJECT_APPROVER_V1_PERMISSIONS = [
  'project.lifecycle.transition',
  'project.close',
] as const;
export type CompanyProjectApproverPermission =
  (typeof COMPANY_PROJECT_APPROVER_V1_PERMISSIONS)[number];
// A null or unknown captured version resolves to no permission at all.
export function projectApproverPermissionsFor(
  version: unknown,
): readonly CompanyProjectApproverPermission[] {
  return version === 'v1' ? COMPANY_PROJECT_APPROVER_V1_PERMISSIONS : [];
}

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
