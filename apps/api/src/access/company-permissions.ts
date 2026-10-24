/**
 * The single registry of Company role bundles: each bundle's label and the
 * exact permission set of every captured version. Permission resolution,
 * version guards, `…VersionsWith` helpers and the database CHECK on
 * `company_role_assignments.permission_set_version` are all derived from it.
 *
 * A captured version is immutable: an assignment keeps the permission set of
 * the version it captured, and a version never expands in place. To add a
 * version or a permission:
 * 1. Append a new version (`v{n+1}`) with its complete permission list to the
 *    bundle below; never edit an existing version.
 * 2. Make fresh grants capture it where the assignment service chooses the
 *    granted version, and widen the web mirror of captured versions.
 * 3. Run `pnpm --filter @prisma-prim/api db:generate` and review the
 *    migration that rewrites the version CHECK.
 * 4. Update the tests that pin the new behaviour, including
 *    `company-role-bundle-registry.test.ts`.
 *
 * Entry order is the order in which the CHECK lists bundles, so reordering
 * entries rewrites the constraint text and generates a migration.
 */
export const COMPANY_ROLE_BUNDLES = {
  // Unversioned: an assignment captures no version (NULL) and confers Company
  // context only.
  company_context_access: {
    label: 'Company Context Access',
    versions: {},
  },
  company_director_client_access: {
    label: 'Company Director Client Access',
    versions: {
      v1: ['client.read', 'client.create', 'client.update'],
      v2: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
    },
  },
  company_task_manager: {
    label: 'Company Task Manager',
    versions: { v1: ['task.read', 'task.manage'] },
  },
  company_document_project_organizer: {
    label: 'Company Document Project Organizer',
    versions: { v1: ['document.project.manage'] },
  },
  company_document_registrar: {
    label: 'Company Document Registrar',
    versions: {
      v1: ['document.read', 'document.register', 'document.reference.read'],
      v2: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
      ],
      // Captured v3 adds Version management only. Existing v1 and v2
      // assignments never expand in place; only a fresh grant captures v3.
      v3: [
        'document.read',
        'document.register',
        'document.reference.read',
        'document.correct',
        'document.version.manage',
      ],
    },
  },
  // The opt-in Approver carries designation only. It confers no Company
  // context, Document or Representation read, Client read, correction or
  // Version management.
  company_document_approver: {
    label: 'Company Document Approver',
    versions: { v1: ['document.version.designate_official'] },
  },
  company_project_access: {
    label: 'Company Project Access',
    versions: {
      v1: ['project.read', 'project.create'],
      // Captured v2 adds the responsible-member change. Existing v1
      // assignments never expand in place; only a fresh grant captures v2.
      v2: ['project.read', 'project.create', 'project.update'],
    },
  },
  company_commercial_intake: {
    label: 'Company Commercial Intake',
    versions: {
      v1: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
      ],
      // Captured v2 adds the only post-R3A1 Opportunity mutation. Existing v1
      // assignments never expand in place; only a fresh grant captures v2.
      v2: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
      ],
      // Captured v3 adds the one-time post-capture Client association.
      // Existing v1 and v2 assignments keep their captured permissions.
      v3: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
        'commercial.request.client.associate',
      ],
      // Captured v4 adds the Sales Stage assignment. Existing v1, v2 and v3
      // assignments keep their captured permissions.
      v4: [
        'commercial.request.read',
        'commercial.request.create',
        'commercial.opportunity.read',
        'commercial.opportunity.create',
        'commercial.opportunity.next_action.update',
        'commercial.request.client.associate',
        'commercial.opportunity.stage.set',
      ],
    },
  },
  company_service_catalogue: {
    label: 'Company Service Catalogue',
    versions: {
      v1: [
        'service.definition.read',
        'service.definition.create',
        'commercial.offering.read',
        'commercial.offering.manage',
      ],
    },
  },
  // Offering read is the only permission shared with the catalogue bundle; no
  // Service Definition permission and no offering management is included.
  company_pricing_configuration: {
    label: 'Company Pricing Configuration',
    versions: {
      v1: [
        'commercial.offering.read',
        'commercial.pricing.configuration.read',
        'commercial.pricing.configuration.manage',
      ],
    },
  },
  // Offering read and configuration read are the only permissions shared with
  // Configuration v1; no publication is included. Calculation and snapshot
  // read are captured now because a captured version never expands in place,
  // and no endpoint consumes them before R3B3b.
  company_pricing_user: {
    label: 'Company Pricing User',
    versions: {
      v1: [
        'commercial.offering.read',
        'commercial.pricing.configuration.read',
        'commercial.pricing.calculate',
        'commercial.pricing.snapshot.read',
      ],
    },
  },
  // The adjustment bundle is independent from calculation and Snapshot read.
  company_pricing_adjustment: {
    label: 'Company Pricing Adjustment',
    versions: { v1: ['commercial.pricing.adjustment.apply'] },
  },
  company_offer_preparer: {
    label: 'Company Offer Preparer',
    versions: {
      v1: [
        'commercial.offer.read',
        'commercial.offer.prepare',
        'commercial.offer.transmission.record',
        'commercial.pricing.snapshot.read',
      ],
      v2: [
        'commercial.offer.read',
        'commercial.offer.prepare',
        'commercial.offer.transmission.record',
        'commercial.pricing.snapshot.read',
        'commercial.offer.estimate.prepare',
      ],
    },
  },
  company_contract_preparer: {
    label: 'Company Contract Preparer',
    versions: {
      v1: [
        'commercial.contract.read',
        'commercial.contract.prepare',
        'commercial.contract.project.link',
      ],
    },
  },
  company_contract_early_preparation: {
    label: 'Company Contract Early Preparation',
    versions: { v1: ['commercial.contract.prepare_pending_offer'] },
  },
  company_contract_approver: {
    label: 'Company Contract Approver',
    versions: {
      v1: [
        'commercial.contract.read',
        'commercial.contract.approve',
        'commercial.contract.signature.record',
      ],
    },
  },
  company_offer_approver: {
    label: 'Company Offer Approver',
    versions: {
      v1: [
        'commercial.offer.read',
        'commercial.offer.approve',
        'commercial.offer.response.record',
      ],
    },
  },
  // The opt-in reader bundle is never inherited.
  company_commercial_activity_reader: {
    label: 'Company Commercial Activity Reader',
    versions: { v1: ['commercial.activity.read'] },
  },
  // The opt-in manager bundle replaces an Opportunity's responsible actor.
  // Company context and Commercial Intake read are prerequisites it never
  // grants.
  company_opportunity_manager: {
    label: 'Company Opportunity Manager',
    versions: {
      v1: ['commercial.opportunity.assign'],
      // Captured v2 adds the outcome status change. Existing v1 assignments
      // never expand in place; only a fresh grant captures v2.
      v2: [
        'commercial.opportunity.assign',
        'commercial.opportunity.outcome.change',
      ],
    },
  },
  // The opt-in approver of the Project lifecycle (Project/Task PRD section
  // 23). It confers no Company context, Project read or any other authority.
  company_project_approver: {
    label: 'Company Project Approver',
    versions: { v1: ['project.lifecycle.transition', 'project.close'] },
  },
  company_profitability_contributor: {
    label: 'Company Profitability Contributor',
    versions: {
      v1: [
        'commercial.profitability_estimate.read',
        'commercial.profitability_estimate.create',
      ],
    },
  },
  company_profitability_director: {
    label: 'Company Profitability Director',
    versions: {
      v1: [
        'commercial.profitability_estimate.read',
        'commercial.profitability_estimate.decide',
      ],
    },
  },
  // The opt-in configuration bundle for a Company's Sales Stages (Commercial
  // Workflow PRD section 24.3). Company context and Commercial Intake read are
  // prerequisites it never grants.
  company_sales_stage_configuration: {
    label: 'Company Sales Stage Configuration',
    versions: { v1: ['commercial.sales_stage.configure'] },
  },
  company_document_content_reader: {
    label: 'Company Document Content Reader',
    versions: { v1: ['document.content.read'] },
  },
  company_document_content_uploader: {
    label: 'Company Document Content Uploader',
    versions: { v1: ['document.content.upload'] },
  },
  // Dedicated opt-in creation only; existing Project/Task assignments never expand.
  company_project_template_user: {
    label: 'Company Project Template User',
    versions: {
      v1: ['project.template.read', 'project.template.instantiate'],
      v2: [
        'project.template.read',
        'project.template.instantiate',
        'project.template.pilot.read',
        'project.template.pilot.instantiate',
      ],
    },
  },
  // Independent opt-in stage command only; all read prerequisites remain separate.
  company_project_stage_advancer: {
    label: 'Company Project Stage Advancer',
    versions: { v1: ['project.stage.advance'] },
  },
  company_project_template_configuration: {
    label: 'Company Project Template Configuration',
    versions: { v1: ['project.template.version.create'] },
  },
  company_ideas_reader: {
    label: 'Company Ideas Reader',
    versions: { v1: ['idea.read'] },
  },
  company_ideas_recorder: {
    label: 'Company Ideas Recorder',
    versions: { v1: ['idea.record'] },
  },
  company_ideas_reviewer: {
    label: 'Company Ideas Reviewer',
    versions: { v1: ['idea.disposition.record'] },
  },
  company_operational_risk_reader: {
    label: 'Company Operational Risk Reader',
    versions: { v1: ['risk.read'] },
  },
  company_operational_risk_recorder: {
    label: 'Company Operational Risk Recorder',
    versions: { v1: ['risk.record'] },
  },
  company_task_result_recorder: {
    label: 'Company Task Result Recorder',
    versions: { v1: ['task.result.record'] },
  },
  company_mission_deliverable_access: {
    label: 'Company Mission Deliverable Access',
    versions: { v1: ['document.mission_deliverable.access'] },
  },
} as const satisfies Readonly<
  Record<
    string,
    {
      readonly label: string;
      readonly versions: Readonly<Record<string, readonly string[]>>;
    }
  >
>;

type CompanyRoleBundleRegistry = typeof COMPANY_ROLE_BUNDLES;
export type CompanyRoleBundle = keyof CompanyRoleBundleRegistry;
type CapturedVersions<Bundle extends CompanyRoleBundle> =
  CompanyRoleBundleRegistry[Bundle]['versions'];
export type CompanyRolePermissionSetVersion<Bundle extends CompanyRoleBundle> =
  keyof CapturedVersions<Bundle> & string;
export type CompanyRolePermission<Bundle extends CompanyRoleBundle> = {
  [
    Version in CompanyRolePermissionSetVersion<Bundle>
  ]: CapturedVersions<Bundle>[Version] extends readonly (infer Permission)[]
    ? Permission
    : never;
}[CompanyRolePermissionSetVersion<Bundle>];

// The registry viewed per bundle, so a generic bundle indexes its own
// captured versions and permissions without a type assertion.
const CAPTURED_PERMISSION_SETS: {
  readonly [Bundle in CompanyRoleBundle]: {
    readonly versions: {
      readonly [
        Version in CompanyRolePermissionSetVersion<Bundle>
      ]: readonly CompanyRolePermission<Bundle>[];
    };
  };
} = COMPANY_ROLE_BUNDLES;

/** Whether `version` is a captured version of `bundle`; anything else is not. */
export function isCompanyRolePermissionSetVersion<
  Bundle extends CompanyRoleBundle,
>(
  bundle: Bundle,
  version: unknown,
): version is CompanyRolePermissionSetVersion<Bundle> {
  return (
    typeof version === 'string' &&
    Object.hasOwn(COMPANY_ROLE_BUNDLES[bundle].versions, version)
  );
}

/**
 * The permission set `bundle` captured as `version`. A null, unknown or
 * other-bundle version resolves to no permission at all (fail closed).
 */
export function companyRolePermissionsFor<Bundle extends CompanyRoleBundle>(
  bundle: Bundle,
  version: unknown,
): readonly CompanyRolePermission<Bundle>[] {
  if (!isCompanyRolePermissionSetVersion(bundle, version)) return [];
  const versions = CAPTURED_PERMISSION_SETS[bundle].versions;
  return versions[version];
}

/**
 * Every captured version of `bundle`, in capture order, whose permission set
 * includes all `required` permissions, so a later version carrying them is
 * accepted.
 */
export function companyRoleVersionsWith<Bundle extends CompanyRoleBundle>(
  bundle: Bundle,
  required: readonly CompanyRolePermission<Bundle>[],
): CompanyRolePermissionSetVersion<Bundle>[] {
  return Object.keys(COMPANY_ROLE_BUNDLES[bundle].versions)
    .filter((version): version is CompanyRolePermissionSetVersion<Bundle> =>
      isCompanyRolePermissionSetVersion(bundle, version),
    )
    .filter((version) =>
      required.every((permission) =>
        companyRolePermissionsFor(bundle, version).includes(permission),
      ),
    );
}

// Per-bundle names derived from the registry. They keep the vocabulary the
// owning modules import; none of them adds a permission or a version.
export const COMPANY_CONTEXT_ACCESS_BUNDLE =
  'company_context_access' satisfies CompanyRoleBundle;
export const COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_context_access.label;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE =
  'company_director_client_access' satisfies CompanyRoleBundle;
export const COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_director_client_access.label;
export const COMPANY_DOCUMENT_REGISTRAR_BUNDLE =
  'company_document_registrar' satisfies CompanyRoleBundle;
export const COMPANY_DOCUMENT_REGISTRAR_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_document_registrar.label;
export const DOCUMENT_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_document_registrar.versions.v1;
export const DOCUMENT_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_document_registrar.versions.v2;
export const DOCUMENT_V3_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_document_registrar.versions.v3;
export const COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE =
  'company_mission_deliverable_access' satisfies CompanyRoleBundle;
export const COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_mission_deliverable_access.label;
export function missionDeliverablePermissionsFor(
  version: unknown,
): readonly DocumentPermission[] {
  return companyRolePermissionsFor(
    COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE,
    version,
  );
}

export const COMPANY_DOCUMENT_CONTENT_READER_BUNDLE =
  'company_document_content_reader' satisfies CompanyRoleBundle;
export const COMPANY_DOCUMENT_CONTENT_READER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_document_content_reader.label;
export const COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE =
  'company_document_content_uploader' satisfies CompanyRoleBundle;
export const COMPANY_DOCUMENT_CONTENT_UPLOADER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_document_content_uploader.label;
export const COMPANY_DOCUMENT_APPROVER_BUNDLE =
  'company_document_approver' satisfies CompanyRoleBundle;
export const COMPANY_DOCUMENT_APPROVER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_document_approver.label;
export const DOCUMENT_APPROVER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_document_approver.versions.v1;
export type DocumentApproverPermission =
  CompanyRolePermission<'company_document_approver'>;
// A null or unknown captured Approver version resolves to no permission.
export function documentApproverPermissionsFor(
  version: unknown,
): readonly DocumentApproverPermission[] {
  return companyRolePermissionsFor(COMPANY_DOCUMENT_APPROVER_BUNDLE, version);
}
export const COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE =
  'company_document_project_organizer' satisfies CompanyRoleBundle;
export const COMPANY_DOCUMENT_PROJECT_ORGANIZER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_document_project_organizer.label;
export const COMPANY_COMMERCIAL_INTAKE_BUNDLE =
  'company_commercial_intake' satisfies CompanyRoleBundle;
export const COMPANY_COMMERCIAL_INTAKE_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_commercial_intake.label;
export const COMPANY_COMMERCIAL_INTAKE_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_commercial_intake.versions.v1;
export const COMPANY_COMMERCIAL_INTAKE_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_commercial_intake.versions.v2;
export const COMPANY_COMMERCIAL_INTAKE_V3_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_commercial_intake.versions.v3;
export type CompanyCommercialIntakePermission =
  CompanyRolePermission<'company_commercial_intake'>;
export type CompanyCommercialIntakePermissionSetVersion =
  CompanyRolePermissionSetVersion<'company_commercial_intake'>;
export function commercialIntakePermissionsFor(
  version: unknown,
): readonly CompanyCommercialIntakePermission[] {
  return companyRolePermissionsFor(COMPANY_COMMERCIAL_INTAKE_BUNDLE, version);
}
export function isCommercialIntakePermissionSetVersion(
  version: unknown,
): version is CompanyCommercialIntakePermissionSetVersion {
  return isCompanyRolePermissionSetVersion(
    COMPANY_COMMERCIAL_INTAKE_BUNDLE,
    version,
  );
}
/**
 * Every captured Commercial Intake version whose permission set includes all
 * `required` permissions, so a later version carrying them is accepted.
 */
export function commercialIntakeVersionsWith(
  required: readonly CompanyCommercialIntakePermission[],
): CompanyCommercialIntakePermissionSetVersion[] {
  return companyRoleVersionsWith(COMPANY_COMMERCIAL_INTAKE_BUNDLE, required);
}
export const COMMERCIAL_INTAKE_READ_PERMISSIONS = [
  'commercial.request.read',
  'commercial.opportunity.read',
] as const satisfies readonly CompanyCommercialIntakePermission[];
export const COMPANY_OPPORTUNITY_MANAGER_BUNDLE =
  'company_opportunity_manager' satisfies CompanyRoleBundle;
export const COMPANY_OPPORTUNITY_MANAGER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_opportunity_manager.label;
export const COMPANY_OPPORTUNITY_MANAGER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_opportunity_manager.versions.v1;
export const COMPANY_OPPORTUNITY_MANAGER_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_opportunity_manager.versions.v2;
export type CompanyOpportunityManagerPermission =
  CompanyRolePermission<'company_opportunity_manager'>;
export type CompanyOpportunityManagerPermissionSetVersion =
  CompanyRolePermissionSetVersion<'company_opportunity_manager'>;
// Never inherited: a null or unknown captured version resolves to nothing.
export function opportunityManagerPermissionsFor(
  version: unknown,
): readonly CompanyOpportunityManagerPermission[] {
  return companyRolePermissionsFor(COMPANY_OPPORTUNITY_MANAGER_BUNDLE, version);
}
export function isOpportunityManagerPermissionSetVersion(
  version: unknown,
): version is CompanyOpportunityManagerPermissionSetVersion {
  return isCompanyRolePermissionSetVersion(
    COMPANY_OPPORTUNITY_MANAGER_BUNDLE,
    version,
  );
}
/**
 * Every captured Opportunity Manager version whose permission set includes
 * `required`, so a later version carrying it is accepted.
 */
export function opportunityManagerVersionsWith(
  required: CompanyOpportunityManagerPermission,
): CompanyOpportunityManagerPermissionSetVersion[] {
  return companyRoleVersionsWith(COMPANY_OPPORTUNITY_MANAGER_BUNDLE, [
    required,
  ]);
}
export const COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE =
  'company_sales_stage_configuration' satisfies CompanyRoleBundle;
export const COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_sales_stage_configuration.label;
export type CompanySalesStageConfigurationPermission =
  CompanyRolePermission<'company_sales_stage_configuration'>;
// Never inherited: a null or unknown captured version resolves to nothing.
export function salesStageConfigurationPermissionsFor(
  version: unknown,
): readonly CompanySalesStageConfigurationPermission[] {
  return companyRolePermissionsFor(
    COMPANY_SALES_STAGE_CONFIGURATION_BUNDLE,
    version,
  );
}
export const COMPANY_SERVICE_CATALOGUE_BUNDLE =
  'company_service_catalogue' satisfies CompanyRoleBundle;
export const COMPANY_SERVICE_CATALOGUE_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_service_catalogue.label;
export const COMPANY_SERVICE_CATALOGUE_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_service_catalogue.versions.v1;
export type CompanyServiceCataloguePermission =
  CompanyRolePermission<'company_service_catalogue'>;
export function serviceCataloguePermissionsFor(
  version: unknown,
): readonly CompanyServiceCataloguePermission[] {
  return companyRolePermissionsFor(COMPANY_SERVICE_CATALOGUE_BUNDLE, version);
}
export const COMPANY_PRICING_CONFIGURATION_BUNDLE =
  'company_pricing_configuration' satisfies CompanyRoleBundle;
export const COMPANY_PRICING_CONFIGURATION_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_pricing_configuration.label;
export const COMPANY_PRICING_CONFIGURATION_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_pricing_configuration.versions.v1;
export type CompanyPricingConfigurationPermission =
  CompanyRolePermission<'company_pricing_configuration'>;
export function pricingConfigurationPermissionsFor(
  version: unknown,
): readonly CompanyPricingConfigurationPermission[] {
  return companyRolePermissionsFor(
    COMPANY_PRICING_CONFIGURATION_BUNDLE,
    version,
  );
}
export const COMPANY_PRICING_USER_BUNDLE =
  'company_pricing_user' satisfies CompanyRoleBundle;
export const COMPANY_PRICING_USER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_pricing_user.label;
export const COMPANY_PRICING_USER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_pricing_user.versions.v1;
export type CompanyPricingUserPermission =
  CompanyRolePermission<'company_pricing_user'>;
export function pricingUserPermissionsFor(
  version: unknown,
): readonly CompanyPricingUserPermission[] {
  return companyRolePermissionsFor(COMPANY_PRICING_USER_BUNDLE, version);
}
export const COMPANY_OFFER_APPROVER_BUNDLE =
  'company_offer_approver' satisfies CompanyRoleBundle;
export const COMPANY_OFFER_APPROVER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_offer_approver.label;
export const COMPANY_OFFER_APPROVER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_offer_approver.versions.v1;
export type CompanyOfferApproverPermission =
  CompanyRolePermission<'company_offer_approver'>;
export type CompanyOfferPermission =
  CompanyOfferPreparerPermission | CompanyOfferApproverPermission;
export function offerApproverPermissionsFor(
  version: unknown,
): readonly CompanyOfferApproverPermission[] {
  return companyRolePermissionsFor(COMPANY_OFFER_APPROVER_BUNDLE, version);
}

export const COMPANY_OFFER_PREPARER_BUNDLE =
  'company_offer_preparer' satisfies CompanyRoleBundle;
export const COMPANY_OFFER_PREPARER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_offer_preparer.label;
export const COMPANY_OFFER_PREPARER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_offer_preparer.versions.v1;
export const COMPANY_OFFER_PREPARER_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_offer_preparer.versions.v2;
export type CompanyOfferPreparerPermission =
  CompanyRolePermission<'company_offer_preparer'>;
export function offerPreparerPermissionsFor(
  version: unknown,
): readonly CompanyOfferPreparerPermission[] {
  return companyRolePermissionsFor(COMPANY_OFFER_PREPARER_BUNDLE, version);
}

export const COMPANY_PRICING_ADJUSTMENT_BUNDLE =
  'company_pricing_adjustment' satisfies CompanyRoleBundle;
export const COMPANY_PRICING_ADJUSTMENT_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_pricing_adjustment.label;
export const COMPANY_PRICING_ADJUSTMENT_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_pricing_adjustment.versions.v1;
export type CompanyPricingAdjustmentPermission =
  CompanyRolePermission<'company_pricing_adjustment'>;
// Null and unknown captured versions fail closed.
export function pricingAdjustmentPermissionsFor(
  version: unknown,
): readonly CompanyPricingAdjustmentPermission[] {
  return companyRolePermissionsFor(COMPANY_PRICING_ADJUSTMENT_BUNDLE, version);
}
export const COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE =
  'company_commercial_activity_reader' satisfies CompanyRoleBundle;
export const COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_commercial_activity_reader.label;
export const COMPANY_COMMERCIAL_ACTIVITY_READER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_commercial_activity_reader.versions.v1;
export type CompanyCommercialActivityPermission =
  CompanyRolePermission<'company_commercial_activity_reader'>;
// A null or unknown captured version resolves to no permission at all.
export function commercialActivityPermissionsFor(
  version: unknown,
): readonly CompanyCommercialActivityPermission[] {
  return companyRolePermissionsFor(
    COMPANY_COMMERCIAL_ACTIVITY_READER_BUNDLE,
    version,
  );
}
export type DocumentPermission =
  | CompanyRolePermission<'company_document_registrar'>
  | DocumentApproverPermission
  | CompanyRolePermission<'company_document_content_reader'>
  | CompanyRolePermission<'company_mission_deliverable_access'>
  | CompanyRolePermission<'company_document_content_uploader'>
  | CompanyRolePermission<'company_document_project_organizer'>;
export type DocumentPermissionSetVersion =
  CompanyRolePermissionSetVersion<'company_document_registrar'>;
export function isDocumentPermissionSetVersion(
  version: unknown,
): version is DocumentPermissionSetVersion {
  return isCompanyRolePermissionSetVersion(
    COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
    version,
  );
}
export function documentPermissionsFor(
  version: unknown,
): readonly DocumentPermission[] {
  return companyRolePermissionsFor(COMPANY_DOCUMENT_REGISTRAR_BUNDLE, version);
}
export const COMPANY_CONTEXT_USE_BUNDLES = [
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
] as const;

export const COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_director_client_access.versions.v1;

export const COMPANY_DIRECTOR_CLIENT_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_director_client_access.versions.v2;

export const COMPANY_DIRECTOR_CLIENT_PERMISSIONS =
  COMPANY_DIRECTOR_CLIENT_V1_PERMISSIONS;

export type CompanyClientPermission =
  CompanyRolePermission<'company_director_client_access'>;

export type CompanyDirectorClientPermissionSetVersion =
  CompanyRolePermissionSetVersion<'company_director_client_access'>;

export function companyDirectorClientPermissionsFor(
  version: unknown,
): readonly CompanyClientPermission[] {
  return companyRolePermissionsFor(
    COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
    version,
  );
}

export const COMPANY_PROJECT_ACCESS_BUNDLE =
  'company_project_access' satisfies CompanyRoleBundle;
export const COMPANY_PROJECT_ACCESS_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_project_access.label;
export const COMPANY_PROJECT_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_project_access.versions.v1;
export const COMPANY_PROJECT_V2_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_project_access.versions.v2;
export type CompanyProjectPermission =
  CompanyRolePermission<'company_project_access'>;
export type CompanyProjectPermissionSetVersion =
  CompanyRolePermissionSetVersion<'company_project_access'>;
export function projectPermissionsFor(
  version: unknown,
): readonly CompanyProjectPermission[] {
  return companyRolePermissionsFor(COMPANY_PROJECT_ACCESS_BUNDLE, version);
}
export function isProjectPermissionSetVersion(
  version: unknown,
): version is CompanyProjectPermissionSetVersion {
  return isCompanyRolePermissionSetVersion(
    COMPANY_PROJECT_ACCESS_BUNDLE,
    version,
  );
}

export const COMPANY_PROJECT_APPROVER_BUNDLE =
  'company_project_approver' satisfies CompanyRoleBundle;
export const COMPANY_PROJECT_APPROVER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_project_approver.label;
export const COMPANY_PROJECT_APPROVER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_project_approver.versions.v1;
export type CompanyProjectApproverPermission =
  CompanyRolePermission<'company_project_approver'>;
// A null or unknown captured version resolves to no permission at all.
export function projectApproverPermissionsFor(
  version: unknown,
): readonly CompanyProjectApproverPermission[] {
  return companyRolePermissionsFor(COMPANY_PROJECT_APPROVER_BUNDLE, version);
}

export const COMPANY_TASK_RESULT_RECORDER_BUNDLE =
  'company_task_result_recorder' satisfies CompanyRoleBundle;
export const COMPANY_TASK_RESULT_RECORDER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_task_result_recorder.label;
export type TaskResultPermission =
  CompanyRolePermission<'company_task_result_recorder'>;
export function taskResultPermissionsFor(
  version: unknown,
): readonly TaskResultPermission[] {
  return companyRolePermissionsFor(
    COMPANY_TASK_RESULT_RECORDER_BUNDLE,
    version,
  );
}

export const COMPANY_TASK_MANAGER_BUNDLE =
  'company_task_manager' satisfies CompanyRoleBundle;
export const COMPANY_TASK_MANAGER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_task_manager.label;
export const COMPANY_TASK_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_task_manager.versions.v1;
export type TaskPermission = CompanyRolePermission<'company_task_manager'>;
export function taskPermissionsFor(
  version: unknown,
): readonly TaskPermission[] {
  return companyRolePermissionsFor(COMPANY_TASK_MANAGER_BUNDLE, version);
}

export const COMPANY_CONTRACT_PREPARER_BUNDLE =
  'company_contract_preparer' satisfies CompanyRoleBundle;
export const COMPANY_CONTRACT_PREPARER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_contract_preparer.label;
export const COMPANY_CONTRACT_PREPARER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_contract_preparer.versions.v1;
export const COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE =
  'company_contract_early_preparation' satisfies CompanyRoleBundle;
export const COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_contract_early_preparation.label;
export const COMPANY_CONTRACT_EARLY_PREPARATION_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_contract_early_preparation.versions.v1;
export function contractEarlyPreparationPermissionsFor(version: unknown) {
  return companyRolePermissionsFor(
    COMPANY_CONTRACT_EARLY_PREPARATION_BUNDLE,
    version,
  );
}
export type CompanyContractPermission =
  | CompanyRolePermission<'company_contract_preparer'>
  | CompanyRolePermission<'company_contract_approver'>
  | CompanyRolePermission<'company_contract_early_preparation'>;
export function contractPreparerPermissionsFor(
  version: unknown,
): readonly CompanyContractPermission[] {
  return companyRolePermissionsFor(COMPANY_CONTRACT_PREPARER_BUNDLE, version);
}

export const COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE =
  'company_profitability_contributor' satisfies CompanyRoleBundle;
export const COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_profitability_contributor.label;
export const COMPANY_PROFITABILITY_CONTRIBUTOR_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_profitability_contributor.versions.v1;
export type CompanyProfitabilityContributorPermission =
  CompanyRolePermission<'company_profitability_contributor'>;
export function profitabilityContributorPermissionsFor(
  version: unknown,
): readonly CompanyProfitabilityContributorPermission[] {
  return companyRolePermissionsFor(
    COMPANY_PROFITABILITY_CONTRIBUTOR_BUNDLE,
    version,
  );
}
export const COMPANY_PROFITABILITY_DIRECTOR_BUNDLE =
  'company_profitability_director' satisfies CompanyRoleBundle;
export const COMPANY_PROFITABILITY_DIRECTOR_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_profitability_director.label;
export const COMPANY_PROFITABILITY_DIRECTOR_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_profitability_director.versions.v1;
export type CompanyProfitabilityDirectorPermission =
  CompanyRolePermission<'company_profitability_director'>;
export function profitabilityDirectorPermissionsFor(
  version: unknown,
): readonly CompanyProfitabilityDirectorPermission[] {
  return companyRolePermissionsFor(
    COMPANY_PROFITABILITY_DIRECTOR_BUNDLE,
    version,
  );
}

export const COMPANY_CONTRACT_APPROVER_BUNDLE =
  'company_contract_approver' satisfies CompanyRoleBundle;
export const COMPANY_CONTRACT_APPROVER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_contract_approver.label;
export const COMPANY_CONTRACT_APPROVER_V1_PERMISSIONS =
  COMPANY_ROLE_BUNDLES.company_contract_approver.versions.v1;
export function contractApproverPermissionsFor(
  version: unknown,
): readonly CompanyContractPermission[] {
  return companyRolePermissionsFor(COMPANY_CONTRACT_APPROVER_BUNDLE, version);
}

export const COMPANY_PROJECT_TEMPLATE_USER_BUNDLE =
  'company_project_template_user' satisfies CompanyRoleBundle;
export const COMPANY_PROJECT_TEMPLATE_USER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_project_template_user.label;
export type CompanyProjectTemplatePermission =
  CompanyRolePermission<'company_project_template_user'>;
export function projectTemplatePermissionsFor(
  version: unknown,
): readonly CompanyProjectTemplatePermission[] {
  return companyRolePermissionsFor(
    COMPANY_PROJECT_TEMPLATE_USER_BUNDLE,
    version,
  );
}

export const COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE =
  'company_project_stage_advancer' satisfies CompanyRoleBundle;
export const COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_project_stage_advancer.label;
export type CompanyProjectStagePermission =
  CompanyRolePermission<'company_project_stage_advancer'>;
export function projectStagePermissionsFor(
  version: unknown,
): readonly CompanyProjectStagePermission[] {
  return companyRolePermissionsFor(
    COMPANY_PROJECT_STAGE_ADVANCER_BUNDLE,
    version,
  );
}

export const COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE =
  'company_project_template_configuration' satisfies CompanyRoleBundle;
export const COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_project_template_configuration.label;
export type CompanyProjectTemplateConfigurationPermission =
  CompanyRolePermission<'company_project_template_configuration'>;
export function projectTemplateConfigurationPermissionsFor(
  version: unknown,
): readonly CompanyProjectTemplateConfigurationPermission[] {
  return companyRolePermissionsFor(
    COMPANY_PROJECT_TEMPLATE_CONFIGURATION_BUNDLE,
    version,
  );
}

export const COMPANY_IDEAS_READER_BUNDLE =
  'company_ideas_reader' satisfies CompanyRoleBundle;
export const COMPANY_IDEAS_READER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_ideas_reader.label;
export const COMPANY_IDEAS_RECORDER_BUNDLE =
  'company_ideas_recorder' satisfies CompanyRoleBundle;
export const COMPANY_IDEAS_RECORDER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_ideas_recorder.label;
export const COMPANY_IDEAS_REVIEWER_BUNDLE =
  'company_ideas_reviewer' satisfies CompanyRoleBundle;
export const COMPANY_IDEAS_REVIEWER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_ideas_reviewer.label;
export const COMPANY_OPERATIONAL_RISK_READER_BUNDLE =
  'company_operational_risk_reader' satisfies CompanyRoleBundle;
export const COMPANY_OPERATIONAL_RISK_READER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_operational_risk_reader.label;
export const COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE =
  'company_operational_risk_recorder' satisfies CompanyRoleBundle;
export const COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE_LABEL =
  COMPANY_ROLE_BUNDLES.company_operational_risk_recorder.label;
export type CompanyOperationalRiskPermission =
  | CompanyRolePermission<'company_operational_risk_reader'>
  | CompanyRolePermission<'company_operational_risk_recorder'>;
export function operationalRiskReaderPermissionsFor(version: unknown) {
  return companyRolePermissionsFor(
    COMPANY_OPERATIONAL_RISK_READER_BUNDLE,
    version,
  );
}
export function operationalRiskRecorderPermissionsFor(version: unknown) {
  return companyRolePermissionsFor(
    COMPANY_OPERATIONAL_RISK_RECORDER_BUNDLE,
    version,
  );
}
