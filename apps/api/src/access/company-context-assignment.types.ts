import type {
  COMPANY_TASK_MANAGER_BUNDLE_LABEL,
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL,
  COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL,
  COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL,
  COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL,
  COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_PRICING_USER_BUNDLE_LABEL,
  COMPANY_OFFER_PREPARER_BUNDLE_LABEL,
  COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL,
  COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL,
  COMPANY_OFFER_APPROVER_BUNDLE_LABEL,
  COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL,
  COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL,
  COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL,
  COMPANY_PROJECT_APPROVER_BUNDLE_LABEL,
  COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL,
  COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL,
  COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL,
  COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL,
  COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL,
} from './company-permissions.js';
import type {
  CompanyCommercialIntakePermissionSetVersion,
  CompanyDirectorClientPermissionSetVersion,
  CompanyOpportunityManagerPermissionSetVersion,
  CompanyProjectPermissionSetVersion,
  DocumentPermissionSetVersion,
} from './company-permissions.js';

export type CompanyAssignmentBundleLabel =
  | typeof COMPANY_TASK_MANAGER_BUNDLE_LABEL
  | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL
  | typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL
  | typeof COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL
  | typeof COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL
  | typeof COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL
  | typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL
  | typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL
  | typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL
  | typeof COMPANY_PRICING_USER_BUNDLE_LABEL
  | typeof COMPANY_OFFER_PREPARER_BUNDLE_LABEL
  | typeof COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL
  | typeof COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL
  | typeof COMPANY_OFFER_APPROVER_BUNDLE_LABEL
  | typeof COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL
  | typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL
  | typeof COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL
  | typeof COMPANY_PROJECT_APPROVER_BUNDLE_LABEL
  | typeof COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL
  | typeof COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL
  | typeof COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL
  | typeof COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL
  | typeof COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL;

interface CompanyContextAssignmentRecordBase {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  active: boolean;
}

export type CompanyContextAssignmentRecord =
  | (CompanyContextAssignmentRecordBase & {
      bundle:
        | typeof COMPANY_TASK_MANAGER_BUNDLE_LABEL
        | typeof COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL
        | typeof COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL
        | typeof COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL
        | typeof COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL
        | typeof COMPANY_PROJECT_APPROVER_BUNDLE_LABEL
        | typeof COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL
        | typeof COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL
        | typeof COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL
        | typeof COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL
        | typeof COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: CompanyProjectPermissionSetVersion;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL;
      permissionSetVersion: DocumentPermissionSetVersion;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: null;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: CompanyDirectorClientPermissionSetVersion;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL;
      permissionSetVersion: CompanyCommercialIntakePermissionSetVersion;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL;
      permissionSetVersion: CompanyOpportunityManagerPermissionSetVersion;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle:
        | typeof COMPANY_PRICING_USER_BUNDLE_LABEL
        | typeof COMPANY_OFFER_PREPARER_BUNDLE_LABEL
        | typeof COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL
        | typeof COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL
        | typeof COMPANY_OFFER_APPROVER_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    });

export interface CompanyAccessAdministrationMember {
  workspaceMembershipId: string;
  displayName: string;
  email: string;
}

export interface CompanyAccessAdministrationCompany {
  id: string;
  displayName: string;
}

export interface CompanyAccessAdministrationState {
  members: CompanyAccessAdministrationMember[];
  companies: CompanyAccessAdministrationCompany[];
  assignments: CompanyContextAssignmentRecord[];
}

export interface GrantCompanyContextAssignmentCommand {
  workspaceMembershipId: unknown;
  companyId: unknown;
  idempotencyKey: string | undefined;
}
