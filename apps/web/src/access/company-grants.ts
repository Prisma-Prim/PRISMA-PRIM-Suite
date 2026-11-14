/**
 * The live captured Company role grants of the active Company context
 * (`activeCompany.grants` of `GET /access/current-actor`), parsed once here
 * and read only through `grantOf` and `holds`.
 *
 * The registry below mirrors the API Company role bundle registry
 * (`apps/api/src/access/company-permissions.ts`): each bundle id, the versions
 * an assignment can have captured and the exact permissions of each version.
 * `company-grants.test.ts` fails, naming the row to add or fix, whenever the
 * two differ. A bundle, version or permission this mirror does not list fails
 * closed: the whole list is refused, and with it the current Actor.
 *
 * Workspace-level alternatives such as `company.manage` are not grants and
 * stay in `workspacePermissions`; feature fences (the `*Capture` strings)
 * are not grants either.
 */
export const COMPANY_GRANT_REGISTRY = {
  company_context_access: {},
  company_director_client_access: {
    v1: ['client.read', 'client.create', 'client.update'],
    v2: [
      'client.read',
      'client.create',
      'client.update',
      'client.duplicate.resolve',
    ],
  },
  company_internal_task_manager: {
    v1: ['internal_task.read', 'internal_task.manage'],
  },
  company_task_manager: {
    v1: ['task.read', 'task.manage'],
  },
  company_document_project_organizer: {
    v1: ['document.project.manage'],
  },
  company_document_registrar: {
    v1: ['document.read', 'document.register', 'document.reference.read'],
    v2: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
    ],
    v3: [
      'document.read',
      'document.register',
      'document.reference.read',
      'document.correct',
      'document.version.manage',
    ],
  },
  company_document_approver: {
    v1: ['document.version.designate_official'],
  },
  company_project_access: {
    v1: ['project.read', 'project.create'],
    v2: ['project.read', 'project.create', 'project.update'],
  },
  company_commercial_intake: {
    v1: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ],
    v2: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
    ],
    v3: [
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
      'commercial.request.client.associate',
    ],
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
  company_service_catalogue: {
    v1: [
      'service.definition.read',
      'service.definition.create',
      'commercial.offering.read',
      'commercial.offering.manage',
    ],
  },
  company_pricing_configuration: {
    v1: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.configuration.manage',
    ],
  },
  company_pricing_user: {
    v1: [
      'commercial.offering.read',
      'commercial.pricing.configuration.read',
      'commercial.pricing.calculate',
      'commercial.pricing.snapshot.read',
    ],
  },
  company_pricing_adjustment: {
    v1: ['commercial.pricing.adjustment.apply'],
  },
  company_offer_preparer: {
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
    v3: [
      'commercial.offer.read',
      'commercial.offer.prepare',
      'commercial.offer.transmission.record',
      'commercial.pricing.snapshot.read',
      'commercial.offer.estimate.prepare',
      'commercial.offer.model.select',
      'commercial.offer.model_based.prepare',
      'commercial.offer.model_based.transmission.record',
    ],
  },
  company_contract_preparer: {
    v1: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.project.link',
    ],
    v2: [
      'commercial.contract.read',
      'commercial.contract.prepare',
      'commercial.contract.project.link',
      'commercial.contract.model.select',
      'commercial.contract.model_based.prepare',
    ],
  },
  company_contract_early_preparation: {
    v1: ['commercial.contract.prepare_pending_offer'],
  },
  company_contract_approver: {
    v1: [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
    ],
    v2: [
      'commercial.contract.read',
      'commercial.contract.approve',
      'commercial.contract.signature.record',
      'commercial.contract.model_based.approve',
    ],
  },
  company_offer_approver: {
    v1: [
      'commercial.offer.read',
      'commercial.offer.approve',
      'commercial.offer.response.record',
    ],
    v2: [
      'commercial.offer.read',
      'commercial.offer.approve',
      'commercial.offer.response.record',
      'commercial.offer.model_based.approve',
      'commercial.offer.model_based.response.record',
    ],
  },
  company_commercial_activity_reader: {
    v1: ['commercial.activity.read'],
  },
  company_opportunity_manager: {
    v1: ['commercial.opportunity.assign'],
    v2: [
      'commercial.opportunity.assign',
      'commercial.opportunity.outcome.change',
    ],
  },
  company_project_approver: {
    v1: ['project.lifecycle.transition', 'project.close'],
  },
  company_profitability_contributor: {
    v1: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.create',
    ],
  },
  company_profitability_director: {
    v1: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.decide',
    ],
  },
  company_sales_stage_configuration: {
    v1: ['commercial.sales_stage.configure'],
  },
  company_document_content_reader: {
    v1: ['document.content.read'],
  },
  company_document_content_uploader: {
    v1: ['document.content.upload'],
  },
  company_project_template_user: {
    v1: ['project.template.read', 'project.template.instantiate'],
    v2: [
      'project.template.read',
      'project.template.instantiate',
      'project.template.pilot.read',
      'project.template.pilot.instantiate',
    ],
  },
  company_project_stage_advancer: {
    v1: ['project.stage.advance'],
  },
  company_project_template_configuration: {
    v1: ['project.template.version.create'],
  },
  company_ideas_reader: {
    v1: ['idea.read'],
  },
  company_ideas_recorder: {
    v1: ['idea.record'],
  },
  company_ideas_reviewer: {
    v1: ['idea.disposition.record'],
  },
  company_operational_risk_reader: {
    v1: ['risk.read'],
  },
  company_operational_risk_recorder: {
    v1: ['risk.record'],
  },
  company_task_result_recorder: {
    v1: ['task.result.record'],
  },
  company_project_next_action_coordinator: {
    v1: ['project.next_action.update'],
  },
  company_mission_applicability_coordinator: {
    v1: ['project.mission_applicability.propose'],
  },
  company_mission_applicability_approver: {
    v1: [
      'project.mission_applicability.decide',
      'project.mission_applicability.restore',
    ],
  },
  company_mission_result_reviewer: {
    v1: ['project.mission_result.review'],
  },
  company_mission_deliverable_access: {
    v1: ['document.mission_deliverable.access'],
  },
  company_contract_signature_declarer: {
    v1: ['commercial.contract.signature.declare_external'],
  },
  company_received_contract_access: {
    v1: ['document.received_contract.access'],
  },
  company_received_addendum_access: {
    v1: ['document.received_addendum.access'],
  },
  company_offer_model_editor: {
    v1: [
      'commercial.offer.model.read',
      'commercial.offer.model.version.create',
    ],
  },
  company_offer_model_approver: {
    v1: [
      'commercial.offer.model.read',
      'commercial.offer.model.decide',
      'commercial.offer.model.withdraw',
    ],
  },
  company_contract_model_editor: {
    v1: [
      'commercial.contract.model.read',
      'commercial.contract.model.version.create',
    ],
  },
  company_contract_model_approver: {
    v1: [
      'commercial.contract.model.read',
      'commercial.contract.model.decide',
      'commercial.contract.model.withdraw',
    ],
  },
  company_mission_plan_configuration: {
    v1: ['project.mission_plan.read', 'project.mission_plan.publish'],
  },
  company_mission_plan_user: {
    v1: ['project.mission_plan.read', 'project.mission_plan.instantiate'],
  },
  company_knowledge_source_administrator: {
    v1: ['knowledge.source.manage'],
  },
  company_knowledge_evidence_reader: {
    v1: ['knowledge.evidence.read'],
  },
  company_payment_reader: {
    v1: ['payment.read'],
  },
  company_payment_recorder: {
    v1: ['payment.read', 'payment.record'],
  },
  company_payment_confirmer: {
    v1: ['payment.read', 'payment.confirm'],
  },
  company_payment_reverser: {
    v1: ['payment.read', 'payment.reverse'],
  },
  company_payment_evidence_access: {
    v1: ['document.payment_evidence.access'],
  },
  company_invoice_reader: {
    v1: ['finance.read'],
  },
  company_invoice_recorder: {
    v1: ['finance.read', 'finance.manage'],
  },
  company_external_invoice_access: {
    v1: ['document.external_invoice.access'],
  },
  company_opportunity_follow_up_coordinator: {
    v1: [
      'commercial.opportunity.follow_up.read',
      'commercial.opportunity.follow_up.manage',
    ],
  },
  company_working_evidence_case_reader: {
    v1: ['working_evidence_case.read'],
  },
  company_working_evidence_case_recorder: {
    v1: ['working_evidence_case.read', 'working_evidence_case.record'],
  },
  company_received_audit_source_access: {
    v1: ['document.received_audit_source.access'],
  },
  company_certification_reader: {
    v1: ['certification.read'],
  },
  company_certification_programme_manager: {
    v1: ['certification.programme.manage'],
  },
  company_certification_approver: {
    v1: ['certification.approve'],
  },
  company_certification_auditor: {
    v1: ['certification.audit.record'],
  },
} as const satisfies Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
>;

/**
 * The label of each bundle, as the API registry names it and the access
 * administration state reports it. `company-grants.test.ts` fails, naming the
 * label to fix, whenever a label differs from the API registry.
 */
export const COMPANY_GRANT_LABELS = {
  company_context_access: 'Company Context Access',
  company_director_client_access: 'Company Director Client Access',
  company_internal_task_manager: 'Company Internal Task Manager',
  company_task_manager: 'Company Task Manager',
  company_document_project_organizer: 'Company Document Project Organizer',
  company_document_registrar: 'Company Document Registrar',
  company_document_approver: 'Company Document Approver',
  company_project_access: 'Company Project Access',
  company_commercial_intake: 'Company Commercial Intake',
  company_service_catalogue: 'Company Service Catalogue',
  company_pricing_configuration: 'Company Pricing Configuration',
  company_pricing_user: 'Company Pricing User',
  company_pricing_adjustment: 'Company Pricing Adjustment',
  company_offer_preparer: 'Company Offer Preparer',
  company_contract_preparer: 'Company Contract Preparer',
  company_contract_early_preparation: 'Company Contract Early Preparation',
  company_contract_approver: 'Company Contract Approver',
  company_offer_approver: 'Company Offer Approver',
  company_commercial_activity_reader: 'Company Commercial Activity Reader',
  company_opportunity_manager: 'Company Opportunity Manager',
  company_project_approver: 'Company Project Approver',
  company_profitability_contributor: 'Company Profitability Contributor',
  company_profitability_director: 'Company Profitability Director',
  company_sales_stage_configuration: 'Company Sales Stage Configuration',
  company_document_content_reader: 'Company Document Content Reader',
  company_document_content_uploader: 'Company Document Content Uploader',
  company_project_template_user: 'Company Project Template User',
  company_project_stage_advancer: 'Company Project Stage Advancer',
  company_project_template_configuration:
    'Company Project Template Configuration',
  company_ideas_reader: 'Company Ideas Reader',
  company_ideas_recorder: 'Company Ideas Recorder',
  company_ideas_reviewer: 'Company Ideas Reviewer',
  company_operational_risk_reader: 'Company Operational Risk Reader',
  company_operational_risk_recorder: 'Company Operational Risk Recorder',
  company_task_result_recorder: 'Company Task Result Recorder',
  company_project_next_action_coordinator:
    'Company Project Next Action Coordinator',
  company_mission_applicability_coordinator:
    'Company Mission Applicability Coordinator',
  company_mission_applicability_approver:
    'Company Mission Applicability Approver',
  company_mission_result_reviewer: 'Company Mission Result Reviewer',
  company_mission_deliverable_access: 'Company Mission Deliverable Access',
  company_contract_signature_declarer: 'Company Contract Signature Declarer',
  company_received_contract_access: 'Company Received Contract Access',
  company_received_addendum_access: 'Company Received Addendum Access',
  company_offer_model_editor: 'Company Offer Model Editor',
  company_offer_model_approver: 'Company Offer Model Approver',
  company_contract_model_editor: 'Company Contract Model Editor',
  company_contract_model_approver: 'Company Contract Model Approver',
  company_mission_plan_configuration: 'Company Mission Plan Configuration',
  company_mission_plan_user: 'Company Mission Plan User',
  company_knowledge_source_administrator:
    'Company Knowledge Source Administrator',
  company_knowledge_evidence_reader: 'Company Knowledge Evidence Reader',
  company_payment_reader: 'Company Payment Reader',
  company_payment_recorder: 'Company Payment Recorder',
  company_payment_confirmer: 'Company Payment Confirmer',
  company_payment_reverser: 'Company Payment Reverser',
  company_payment_evidence_access: 'Company Payment Evidence Access',
  company_invoice_reader: 'Company Invoice Reader',
  company_invoice_recorder: 'Company Invoice Recorder',
  company_external_invoice_access: 'Company External Invoice Access',
  company_opportunity_follow_up_coordinator:
    'Company Opportunity Follow-up Coordinator',
  company_working_evidence_case_reader: 'Company Working Evidence Case Reader',
  company_working_evidence_case_recorder:
    'Company Working Evidence Case Recorder',
  company_received_audit_source_access: 'Company Received Audit Source Access',
  company_certification_reader: 'Company Certification Reader',
  company_certification_programme_manager:
    'Company Certification Programme Manager',
  company_certification_approver: 'Company Certification Approver',
  company_certification_auditor: 'Company Certification Auditor',
} as const satisfies Readonly<
  Record<keyof typeof COMPANY_GRANT_REGISTRY, string>
>;

type Registry = typeof COMPANY_GRANT_REGISTRY;
export type CompanyGrantBundle = keyof Registry;
type CapturedVersion<Bundle extends CompanyGrantBundle> =
  keyof Registry[Bundle] & string;
type PermissionAt<
  Bundle extends CompanyGrantBundle,
  Version extends CapturedVersion<Bundle>,
> = Registry[Bundle][Version] extends readonly (infer Permission)[]
  ? Permission
  : never;
export type CompanyGrantPermission<Bundle extends CompanyGrantBundle> = {
  [Version in CapturedVersion<Bundle>]: PermissionAt<Bundle, Version>;
}[CapturedVersion<Bundle>];

/** One live captured grant: its version and permissions match its bundle. */
export type CompanyGrant = {
  [Bundle in CompanyGrantBundle]: [CapturedVersion<Bundle>] extends [never]
    ? {
        readonly bundle: Bundle;
        readonly assignmentId: string;
        readonly permissionSetVersion: null;
        readonly permissions: readonly [];
      }
    : {
        [Version in CapturedVersion<Bundle>]: {
          readonly bundle: Bundle;
          readonly assignmentId: string;
          readonly permissionSetVersion: Version;
          readonly permissions: readonly PermissionAt<Bundle, Version>[];
        };
      }[CapturedVersion<Bundle>];
}[CompanyGrantBundle];

export type CompanyGrantOf<Bundle extends CompanyGrantBundle> = Extract<
  CompanyGrant,
  { readonly bundle: Bundle }
>;

const REGISTRY_VIEW: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = COMPANY_GRANT_REGISTRY;

/**
 * Whether `value` is a complete `grants` list: every entry names a mirrored
 * bundle, a non-blank assignment, a version that bundle can have captured
 * (null only for an unversioned bundle) and exactly that version's
 * permissions, and no bundle or assignment appears twice. Additive keys are
 * ignored; anything else refuses the whole list.
 */
export function isCompanyGrants(value: unknown): value is CompanyGrant[] {
  if (!Array.isArray(value)) return false;
  const entries: readonly unknown[] = value;
  const bundles = new Set<string>();
  const assignments = new Set<string>();
  for (const entry of entries) {
    if (!isCompanyGrant(entry)) return false;
    if (bundles.has(entry.bundle) || assignments.has(entry.assignmentId))
      return false;
    bundles.add(entry.bundle);
    assignments.add(entry.assignmentId);
  }
  return true;
}

function isCompanyGrant(value: unknown): value is CompanyGrant {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const entry = new Map(Object.entries(value));
  const bundle = entry.get('bundle');
  const assignmentId = entry.get('assignmentId');
  const version = entry.get('permissionSetVersion');
  const permissions = entry.get('permissions');
  if (typeof bundle !== 'string' || !Object.hasOwn(REGISTRY_VIEW, bundle))
    return false;
  if (typeof assignmentId !== 'string' || assignmentId.trim() === '')
    return false;
  const versions = REGISTRY_VIEW[bundle] ?? {};
  const expected =
    Object.keys(versions).length === 0
      ? version === null
        ? []
        : undefined
      : typeof version === 'string' && Object.hasOwn(versions, version)
        ? versions[version]
        : undefined;
  if (expected === undefined || !Array.isArray(permissions)) return false;
  const listed: readonly unknown[] = permissions;
  return (
    listed.length === expected.length &&
    new Set(listed).size === listed.length &&
    listed.every(
      (permission) =>
        typeof permission === 'string' && expected.includes(permission),
    )
  );
}

interface WithGrants {
  readonly grants?: readonly CompanyGrant[];
}

/** The live captured grant of `bundle` in this Company context, if any. */
export function grantOf<Bundle extends CompanyGrantBundle>(
  company: WithGrants | undefined,
  bundle: Bundle,
): CompanyGrantOf<Bundle> | undefined {
  return company?.grants?.find(
    (grant): grant is CompanyGrantOf<Bundle> => grant.bundle === bundle,
  );
}

/** Whether a live captured grant of `bundle` confers `permission`. */
export function holds<Bundle extends CompanyGrantBundle>(
  company: WithGrants | undefined,
  bundle: Bundle,
  permission: CompanyGrantPermission<Bundle>,
): boolean {
  const permissions: readonly string[] =
    grantOf(company, bundle)?.permissions ?? [];
  return permissions.some((granted) => granted === permission);
}
